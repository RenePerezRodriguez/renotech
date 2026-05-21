import { db } from '@/lib/firebase';
import {
    collection,
    doc,
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    updateDoc,
    serverTimestamp,
    runTransaction,
    Timestamp,
} from 'firebase/firestore';
import { Installment, InstallmentPaymentHistory } from '@/types';
import { JournalService } from './JournalService';

const COLLECTION_NAME = 'cuentas_corrientes';
const LATE_FEE_RATE = 0.02; // 2% monthly late fee

function ensureDate(val: Date | Timestamp | { seconds: number } | undefined): Date {
    if (!val) return new Date();
    if (val instanceof Date) return val;
    if (val instanceof Timestamp) return val.toDate();
    if ('seconds' in val) return new Date(val.seconds * 1000);
    return new Date();
}

export const InstallmentService = {
    /**
     * Get all installments for a branch (or all branches if no branchId).
     */
    async getByBranch(branchId?: string): Promise<Installment[]> {
        let q = query(
            collection(db, COLLECTION_NAME),
            orderBy('dueDate', 'asc')
        );
        if (branchId) {
            q = query(
                collection(db, COLLECTION_NAME),
                where('branchId', '==', branchId),
                orderBy('dueDate', 'asc')
            );
        }
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Installment));
    },

    /**
     * Get installments for a specific client.
     */
    async getByClient(clientId: string): Promise<Installment[]> {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('clientId', '==', clientId),
            orderBy('dueDate', 'asc')
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Installment));
    },

    /**
     * Check if a client has any overdue installments.
     */
    async hasOverdueInstallments(clientId: string, branchId?: string): Promise<{ hasOverdue: boolean; count: number; totalOverdue: number }> {
        const constraints = [
            where('clientId', '==', clientId),
            where('status', '==', 'OVERDUE'),
        ];
        if (branchId) constraints.push(where('branchId', '==', branchId));
        const q = query(
            collection(db, COLLECTION_NAME),
            ...constraints
        );
        const snap = await getDocs(q);
        const total = snap.docs.reduce((s, d) => s + (d.data().remainingBalance || 0), 0);
        return { hasOverdue: snap.size > 0, count: snap.size, totalOverdue: total };
    },

    /**
     * Register a payment for an installment (partial or full).
     * Creates payment record in sub-collection, updates balance, cash movement + audit.
     */
    async registerPayment(
        installmentId: string,
        amount: number,
        method: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA',
        userId: string,
        userName: string,
        branchId: string,
        notes: string,
        _shiftId?: string
    ): Promise<void> {
        // Pre-resolver cuenta destino y sesión (fuera de la tx)
        const resolved = await JournalService.resolveAccountId({
            branchId,
            paymentMethod: method,
            cashierId: method === 'EFECTIVO' ? userId : undefined,
        });

        await runTransaction(db, async (transaction) => {
            const instRef = doc(db, COLLECTION_NAME, installmentId);
            const instSnap = await transaction.get(instRef);

            if (!instSnap.exists()) throw new Error('Cuota no encontrada');

            const data = instSnap.data();
            const currentRemaining = data.remainingBalance || 0;
            if (amount <= 0) {
                throw new Error('El monto del pago debe ser mayor a 0');
            }
            if (amount > currentRemaining + 0.01) {
                throw new Error(`El monto excede el saldo de la cuota. Debido: Bs. ${currentRemaining.toFixed(2)}`);
            }
            const newRemaining = Math.max(0, currentRemaining - amount);

            // Read client BEFORE any writes (Firestore requires all reads before writes)
            const clientRef = doc(db, 'clientes', data.clientId);
            const clientSnap = await transaction.get(clientRef);

            // Read account BEFORE writes
            const accRead = await JournalService.txReadAccount(transaction, resolved.accountId);
            // Si EFECTIVO: re-validar dentro de TX que la sesión sigue OPEN.
            if (resolved.sessionId) {
                await JournalService.txEnsureSessionOpen(transaction, resolved.sessionId);
            }

            // 1. Update installment
            transaction.update(instRef, {
                remainingBalance: newRemaining,
                status: newRemaining <= 0 ? 'PAID' : data.status,
                ...(newRemaining <= 0 ? { paidAt: serverTimestamp() } : {}),
            });

            // 2. Record payment in sub-collection for traceability
            const paymentRef = doc(collection(db, `${COLLECTION_NAME}/${installmentId}/pagos`));
            transaction.set(paymentRef, {
                amount,
                method,
                date: serverTimestamp(),
                userId,
                userName,
                notes: notes || '',
                remainingAfter: newRemaining,
            });

            // 3. Update client saldoDeudor
            if (clientSnap.exists()) {
                const currentDebt = clientSnap.data().saldoDeudor || 0;
                transaction.update(clientRef, {
                    saldoDeudor: Math.max(0, currentDebt - amount),
                    updatedAt: serverTimestamp(),
                });
            }

            // 4. Register journal entry (account-based v2)
            JournalService.txWriteEntry(transaction, accRead, {
                accountId: resolved.accountId,
                amount,
                paymentMethod: method,
                category: 'COBRO_CUOTA',
                description: `Cobro cuota ${data.installmentNumber}/${data.installmentsTotal}${notes ? ` — ${notes}` : ''}`,
                referenceType: 'INSTALLMENT_PAYMENT',
                referenceId: data.saleId,
                sessionId: resolved.sessionId,
                branchId,
                userId,
                userName,
            });

            // 5. Audit log
            const auditRef = doc(collection(db, 'logs_auditoria'));
            const overpayment = amount > currentRemaining ? Number((amount - currentRemaining).toFixed(2)) : 0;
            transaction.set(auditRef, {
                action: overpayment > 0 ? 'INSTALLMENT_OVERPAYMENT' : 'INSTALLMENT_PAYMENT',
                adminId: userId,
                adminEmail: userName,
                details: overpayment > 0
                    ? `Cobro de ${amount} Bs. (${method}) Cuota ${data.installmentNumber}/${data.installmentsTotal}. Restante: ${newRemaining} Bs. EXCEDENTE: ${overpayment} Bs.`
                    : `Cobro de ${amount} Bs. (${method}) Cuota ${data.installmentNumber}/${data.installmentsTotal}. Restante: ${newRemaining} Bs.`,
                branchId,
                timestamp: serverTimestamp(),
            });
        });
    },

    /**
     * Get payment history for an installment.
     */
    async getPaymentHistory(installmentId: string) {
        const q = query(
            collection(db, `${COLLECTION_NAME}/${installmentId}/pagos`),
            orderBy('date', 'desc')
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async getPaymentHistoryBySale(saleId: string) {
        const installmentQuery = query(
            collection(db, COLLECTION_NAME),
            where('saleId', '==', saleId)
        );

        const installmentSnap = await getDocs(installmentQuery);
        const installments = installmentSnap.docs.map(d => ({ id: d.id, ...d.data() } as Installment));

        const paymentPromises = installments.map(async inst => {
            const paymentQuery = query(
                collection(db, `${COLLECTION_NAME}/${inst.id}/pagos`),
                orderBy('date', 'desc')
            );
            const paymentSnap = await getDocs(paymentQuery);
            return paymentSnap.docs.map(d => {
                const paymentData = d.data() as Omit<InstallmentPaymentHistory, 'installmentId' | 'installmentNumber' | 'saleId' | 'remainingAfter'> & { remainingAfter?: number };
                return {
                    installmentId: inst.id,
                    installmentNumber: inst.installmentNumber,
                    saleId: inst.saleId,
                    remainingAfter: paymentData.remainingAfter || 0,
                    id: d.id,
                    ...paymentData,
                };
            });
        });

        const installmentsWithPayments = await Promise.all(paymentPromises);
        return installmentsWithPayments.flat().sort((a, b) => {
            const dateA = ensureDate(a.date).getTime();
            const dateB = ensureDate(b.date).getTime();
            return dateB - dateA;
        });
    },

    /**
     * Mark overdue installments and apply late fees.
     */
    async markOverdue(branchId?: string): Promise<number> {
        const now = Timestamp.now();
        let q = query(
            collection(db, COLLECTION_NAME),
            where('status', '==', 'PENDING'),
            where('dueDate', '<', now)
        );
        if (branchId) {
            q = query(
                collection(db, COLLECTION_NAME),
                where('status', '==', 'PENDING'),
                where('dueDate', '<', now),
                where('branchId', '==', branchId)
            );
        }
        const snap = await getDocs(q);
        let count = 0;
        for (const d of snap.docs) {
            const data = d.data();
            const dueDate = data.dueDate?.toDate?.() || new Date();
            const monthsLate = Math.max(1, Math.ceil((Date.now() - dueDate.getTime()) / (30 * 24 * 60 * 60 * 1000)));
            const lateFee = Number((data.amount * LATE_FEE_RATE * monthsLate).toFixed(2));
            
            await updateDoc(doc(db, COLLECTION_NAME, d.id), { 
                status: 'OVERDUE',
                lateFee,
            });
            count++;
        }
        return count;
    },

    /**
     * Refinance: split a pending/overdue installment into multiple smaller ones.
     */
    async refinance(
        installmentId: string,
        newInstallmentCount: number,
        userId: string,
        branchId: string
    ): Promise<void> {
        const instRef = doc(db, COLLECTION_NAME, installmentId);
        const instSnap = await getDoc(instRef);
        if (!instSnap.exists()) throw new Error('Cuota no encontrada');
        
        const data = instSnap.data();
        if (data.status === 'PAID' || data.status === 'CANCELLED') {
            throw new Error('Solo se pueden refinanciar cuotas pendientes o vencidas');
        }

        const remaining = data.remainingBalance || 0;
        if (remaining <= 0) throw new Error('No hay saldo pendiente para refinanciar');

        const baseAmt = Number((remaining / newInstallmentCount).toFixed(2));
        const baseDate = new Date();

        await runTransaction(db, async (transaction) => {
            // Cancel the original installment
            transaction.update(instRef, { 
                status: 'CANCELLED',
                remainingBalance: 0,
            });

            // Create new installments
            for (let i = 1; i <= newInstallmentCount; i++) {
                const dueDate = new Date(baseDate);
                dueDate.setMonth(dueDate.getMonth() + i);
                const amt = i === newInstallmentCount
                    ? Number((remaining - baseAmt * (newInstallmentCount - 1)).toFixed(2))
                    : baseAmt;

                const newRef = doc(collection(db, COLLECTION_NAME));
                transaction.set(newRef, {
                    clientId: data.clientId,
                    clientName: data.clientName,
                    saleId: data.saleId,
                    totalAmount: remaining,
                    saleTotal: data.saleTotal,
                    adelanto: data.adelanto || 0,
                    productsSummary: data.productsSummary,
                    installmentNumber: i,
                    installmentsTotal: newInstallmentCount,
                    amount: amt,
                    remainingBalance: amt,
                    dueDate: Timestamp.fromDate(dueDate),
                    status: 'PENDING',
                    branchId: data.branchId,
                    createdAt: serverTimestamp(),
                    refinancedFrom: installmentId,
                });
            }

            // Audit
            const auditRef = doc(collection(db, 'logs_auditoria'));
            transaction.set(auditRef, {
                action: 'INSTALLMENT_REFINANCE',
                adminId: userId,
                adminEmail: userId,
                details: `Refinanciación: Cuota ${data.installmentNumber}/${data.installmentsTotal} (Bs. ${remaining}) → ${newInstallmentCount} nuevas cuotas`,
                branchId,
                timestamp: serverTimestamp(),
            });
        });
    },
};
