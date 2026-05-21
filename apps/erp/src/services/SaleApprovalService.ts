import { db } from '@/lib/firebase';
import { collection, addDoc, doc, getDoc, getDocs, query, where, orderBy, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { logAdminAction } from '@/lib/audit';
import { PendingVoidApproval, Sale } from '@/types';
import { SaleService } from './SaleService';

const COLLECTION = 'pending_void_approvals';

export const SaleApprovalService = {
    /**
     * Cajero solicita la anulación de una venta que NO puede anular directamente
     * (típicamente porque pertenece a un turno cerrado / cross-shift).
     * No modifica la venta. Solo crea la solicitud.
     */
    requestVoidApproval: async (
        saleId: string,
        requesterId: string,
        requesterName: string,
        reason: string
    ): Promise<string> => {
        if (!reason?.trim() || reason.trim().length < 5) {
            throw new Error('El motivo debe tener al menos 5 caracteres.');
        }
        const saleRef = doc(db, 'ventas', saleId);
        const saleSnap = await getDoc(saleRef);
        if (!saleSnap.exists()) throw new Error('Venta no encontrada.');
        const sale = { id: saleSnap.id, ...saleSnap.data() } as Sale;
        if (sale.status === 'VOIDED') throw new Error('Esta venta ya fue anulada.');

        // Evitar duplicados de solicitudes pendientes para la misma venta
        const dupQ = query(
            collection(db, COLLECTION),
            where('saleId', '==', saleId),
            where('status', '==', 'PENDING')
        );
        const dupSnap = await getDocs(dupQ);
        if (!dupSnap.empty) {
            throw new Error('Ya existe una solicitud pendiente para esta venta.');
        }

        const saleDate = sale.fecha instanceof Timestamp ? sale.fecha.toDate() : (sale.fecha as unknown as Date);

        const docRef = await addDoc(collection(db, COLLECTION), {
            saleId,
            saleShortId: saleId.slice(-6),
            saleTotal: Number(sale.total) || 0,
            saleDate: saleDate instanceof Date ? Timestamp.fromDate(saleDate) : Timestamp.now(),
            saleMethod: sale.metodoPago || '',
            branchId: sale.branchId || '',
            requestedBy: requesterId,
            requestedByName: requesterName,
            requestedAt: serverTimestamp(),
            reason: reason.trim(),
            status: 'PENDING'
        } satisfies Omit<PendingVoidApproval, 'id'>);

        await logAdminAction(
            requesterId,
            requesterName,
            'REQUEST_SALE_VOID',
            saleId,
            sale.branchId || '?',
            `Solicitud de anulación venta #${saleId.slice(-6)} (Bs. ${sale.total}). Motivo: ${reason.trim()}`
        );

        return docRef.id;
    },

    getPendingApprovals: async (branchId?: string): Promise<PendingVoidApproval[]> => {
        const constraints = [where('status', '==', 'PENDING'), orderBy('requestedAt', 'desc')];
        if (branchId) constraints.unshift(where('branchId', '==', branchId));
        const q = query(collection(db, COLLECTION), ...constraints);
        const snap = await getDocs(q);
        return snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                saleDate: data.saleDate?.toDate?.() || data.saleDate,
                requestedAt: data.requestedAt?.toDate?.() || data.requestedAt,
                approvedAt: data.approvedAt?.toDate?.() || data.approvedAt
            } as PendingVoidApproval;
        });
    },

    countPending: async (branchId?: string): Promise<number> => {
        const list = await SaleApprovalService.getPendingApprovals(branchId);
        return list.length;
    },

    approve: async (
        approvalId: string,
        approverId: string,
        approverName: string,
        approverEmail: string,
        approverRole: string | undefined
    ): Promise<void> => {
        if (approverRole !== 'GERENTE') {
            throw new Error('Solo un GERENTE puede aprobar anulaciones.');
        }
        const ref = doc(db, COLLECTION, approvalId);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error('Solicitud no encontrada.');
        const approval = { id: snap.id, ...snap.data() } as PendingVoidApproval;
        if (approval.status !== 'PENDING') throw new Error('Esta solicitud ya fue procesada.');

        // Ejecuta la anulación con el GERENTE como autor
        await SaleService.voidSale(
            approval.saleId,
            approverEmail,
            `[Aprobado] ${approval.reason}`,
            { uid: approverId, email: approverEmail, branchId: approval.branchId }
        );

        await updateDoc(ref, {
            status: 'APPROVED',
            approvedBy: approverId,
            approvedByName: approverName,
            approvedAt: serverTimestamp()
        });

        await logAdminAction(
            approverId,
            approverName,
            'APPROVE_SALE_VOID',
            approval.saleId,
            approval.branchId,
            `Aprobada anulación venta #${approval.saleShortId}`
        );
    },

    reject: async (
        approvalId: string,
        approverId: string,
        approverName: string,
        rejectionReason: string,
        approverRole: string | undefined
    ): Promise<void> => {
        if (approverRole !== 'GERENTE') {
            throw new Error('Solo un GERENTE puede rechazar anulaciones.');
        }
        if (!rejectionReason?.trim() || rejectionReason.trim().length < 5) {
            throw new Error('El motivo de rechazo debe tener al menos 5 caracteres.');
        }
        const ref = doc(db, COLLECTION, approvalId);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error('Solicitud no encontrada.');
        const approval = { id: snap.id, ...snap.data() } as PendingVoidApproval;
        if (approval.status !== 'PENDING') throw new Error('Esta solicitud ya fue procesada.');

        await updateDoc(ref, {
            status: 'REJECTED',
            approvedBy: approverId,
            approvedByName: approverName,
            approvedAt: serverTimestamp(),
            rejectionReason: rejectionReason.trim()
        });

        await logAdminAction(
            approverId,
            approverName,
            'REJECT_SALE_VOID',
            approval.saleId,
            approval.branchId,
            `Rechazada anulación venta #${approval.saleShortId}: ${rejectionReason.trim()}`
        );
    }
};
