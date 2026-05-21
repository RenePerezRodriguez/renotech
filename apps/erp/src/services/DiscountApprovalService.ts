import { db } from '@/lib/firebase';
import { collection, addDoc, doc, getDoc, getDocs, query, where, orderBy, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { logAdminAction } from '@/lib/audit';
import { PendingDiscountApproval } from '@/types';

const COLLECTION = 'pending_discount_approvals';

/**
 * Bandeja de aprobación previa de descuentos que superan el umbral configurado.
 * El descuento NO se aplica al carrito hasta que el GERENTE apruebe.
 * Mientras está PENDING el cajero puede vender el producto a precio normal.
 */
export const DiscountApprovalService = {
    create: async (input: {
        saleId?: string;
        productId: string;
        productCode: string;
        productName: string;
        branchId: string;
        cashierId: string;
        cashierName: string;
        originalPrice: number;
        finalPrice: number;
        discountMode: 'PERCENTAGE' | 'FIXED_PRICE';
        discountValue: number;
        effectiveDiscountPct: number;
        thresholdPct: number;
    }): Promise<string> => {
        const ref = await addDoc(collection(db, COLLECTION), {
            ...input,
            requestedAt: serverTimestamp(),
            status: 'PENDING'
        } satisfies Omit<PendingDiscountApproval, 'id'>);
        await logAdminAction(
            input.cashierId,
            input.cashierName,
            'REQUEST_DISCOUNT_APPROVAL',
            ref.id,
            input.branchId,
            `Descuento ${input.effectiveDiscountPct.toFixed(1)}% en ${input.productName} (umbral ${input.thresholdPct}%)`
        );
        return ref.id;
    },

    getPending: async (branchId?: string): Promise<PendingDiscountApproval[]> => {
        const constraints = [where('status', '==', 'PENDING'), orderBy('requestedAt', 'desc')];
        if (branchId) constraints.unshift(where('branchId', '==', branchId));
        const q = query(collection(db, COLLECTION), ...constraints);
        const snap = await getDocs(q);
        return snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                requestedAt: data.requestedAt?.toDate?.() || data.requestedAt,
                resolvedAt: data.resolvedAt?.toDate?.() || data.resolvedAt
            } as PendingDiscountApproval;
        });
    },

    approve: async (
        id: string,
        approverId: string,
        approverName: string,
        approverRole: string | undefined
    ): Promise<void> => {
        if (approverRole !== 'GERENTE') throw new Error('Solo un GERENTE puede aprobar descuentos.');
        const ref = doc(db, COLLECTION, id);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error('Solicitud no encontrada.');
        const data = snap.data() as PendingDiscountApproval;
        if (data.status !== 'PENDING') throw new Error('Esta solicitud ya fue procesada.');

        await updateDoc(ref, {
            status: 'APPROVED',
            resolvedBy: approverId,
            resolvedByName: approverName,
            resolvedAt: serverTimestamp()
        });
        await logAdminAction(
            approverId,
            approverName,
            'APPROVE_DISCOUNT',
            id,
            data.branchId,
            `Aprobado descuento ${data.effectiveDiscountPct.toFixed(1)}% en ${data.productName}`
        );
    },

    reject: async (
        id: string,
        approverId: string,
        approverName: string,
        rejectionReason: string,
        approverRole: string | undefined
    ): Promise<void> => {
        if (approverRole !== 'GERENTE') throw new Error('Solo un GERENTE puede rechazar descuentos.');
        if (!rejectionReason?.trim() || rejectionReason.trim().length < 5) {
            throw new Error('El motivo debe tener al menos 5 caracteres.');
        }
        const ref = doc(db, COLLECTION, id);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error('Solicitud no encontrada.');
        const data = snap.data() as PendingDiscountApproval;
        if (data.status !== 'PENDING') throw new Error('Esta solicitud ya fue procesada.');

        await updateDoc(ref, {
            status: 'REJECTED',
            resolvedBy: approverId,
            resolvedByName: approverName,
            resolvedAt: serverTimestamp(),
            rejectionReason: rejectionReason.trim()
        });
        await logAdminAction(
            approverId,
            approverName,
            'REJECT_DISCOUNT',
            id,
            data.branchId,
            `Rechazado descuento ${data.effectiveDiscountPct.toFixed(1)}% en ${data.productName}: ${rejectionReason.trim()}`
        );
    }
};

// Re-export Timestamp para no romper imports si alguien lo usa
export { Timestamp };
