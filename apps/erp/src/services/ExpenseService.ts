import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, orderBy, getDocs, updateDoc, doc, getDoc, serverTimestamp, Timestamp, limit as fbLimit, QueryConstraint } from 'firebase/firestore';
import { logAdminAction } from '@/lib/audit';
import { OperationalExpense } from '@/types';
import { JournalService } from './JournalService';
import { AuditAlertService } from './AuditAlertService';

const COLLECTION = 'gastos_operativos';

// Umbrales operativos para alertas autom\u00e1ticas
const EXPENSE_DUPLICATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const EXPENSE_LARGE_THRESHOLD = 1000; // Bs. 1000

export const ExpenseService = {

    create: async (
        expense: Omit<OperationalExpense, 'id' | 'status' | 'createdAt'>,
        branchId: string,
        opts: { skipJournal?: boolean } = {}
    ): Promise<string> => {
        const expenseDateRaw = expense.date instanceof Date
            ? expense.date
            : (expense.date as Timestamp).toDate();
        // Bloquear fechas futuras (más de 1 día hacia adelante por tolerancia de zona horaria)
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        if (expenseDateRaw > tomorrow) {
            throw new Error('La fecha del gasto no puede ser futura.');
        }
        const expenseDate = expense.date instanceof Date
            ? Timestamp.fromDate(expense.date)
            : expense.date;

        // 1. Crear el documento de gasto
        const docRef = await addDoc(collection(db, COLLECTION), {
            ...expense,
            branchId,
            date: expenseDate,
            status: 'ACTIVE',
            createdAt: serverTimestamp()
        });

        // 2. Asentar el EGRESO en tesorería (siempre, con la fecha real del gasto).
        //    Para EFECTIVO se requiere sesión activa del cajero (validado en JournalService).
        //    Para QR/TRANSFERENCIA se usa la cuenta default configurada.
        if (!opts.skipJournal) {
            try {
                const paymentMethod = expense.paymentMethod || 'EFECTIVO';
                const { accountId, sessionId } = await JournalService.resolveAccountId({
                    branchId,
                    paymentMethod,
                    cashierId: paymentMethod === 'EFECTIVO' ? expense.userId : undefined,
                });
                const entryId = await JournalService.createEntry({
                    accountId,
                    amount: expense.amount,
                    paymentMethod,
                    category: 'GASTO_OPERATIVO',
                    description: `${expense.category} - ${expense.description}`,
                    referenceType: 'EXPENSE',
                    referenceId: docRef.id,
                    sessionId,
                    branchId,
                    userId: expense.userId,
                    userName: expense.userName || '',
                    date: expenseDateRaw,
                    bankRef: paymentMethod !== 'EFECTIVO' ? expense.bankRef : undefined,
                });
                await updateDoc(docRef, { cashMovementId: entryId });
            } catch (err) {
                // El asiento es CRÍTICO: si falla, revertir la creación del gasto y propagar
                // el error para que la UI lo muestre. Antes era silent-fail → gasto huérfano.
                console.error('[Expense.create] Asiento de tesorería falló, revirtiendo gasto:', err);
                try {
                    await updateDoc(docRef, { status: 'CANCELLED', cancelReason: 'JOURNAL_FAILED' });
                } catch (revertErr) {
                    console.error('[Expense.create] CRÍTICO: revert del gasto también falló:', revertErr);
                    await logAdminAction(
                        expense.userId, expense.userName || '?', 'EXPENSE_REVERT_FAILED',
                        docRef.id, branchId,
                        `Gasto Bs. ${expense.amount.toFixed(2)} sin asiento y revert fallado. REQUIERE AJUSTE MANUAL.`
                    ).catch(() => {});
                }
                throw err instanceof Error ? err : new Error(String(err));
            }
        }

        await logAdminAction(
            expense.userId,
            '?',
            'CREATE_EXPENSE',
            docRef.id,
            branchId,
            `Gasto: ${expense.category} - Bs. ${expense.amount} - ${expense.description}`
        );

        // Alerta: gasto grande (umbral)
        if (expense.amount >= EXPENSE_LARGE_THRESHOLD) {
            try {
                await AuditAlertService.createAlert({
                    type: 'EXPENSE_LARGE',
                    severity: expense.amount >= EXPENSE_LARGE_THRESHOLD * 3 ? 'HIGH' : 'MEDIUM',
                    branchId,
                    userId: expense.userId,
                    message: `Gasto elevado registrado: ${expense.category} Bs. ${expense.amount.toFixed(2)} - ${expense.description}`,
                    metadata: { expenseId: docRef.id, amount: expense.amount, category: expense.category }
                });
            } catch (e) { console.error('[ExpenseService.create] Failed to create high-amount alert', e); }
        }

        // Alerta: posible duplicado (mismo monto+categor\u00eda en \u00faltimos 5 min)
        try {
            const recentExpenses = await ExpenseService.getByBranch(branchId, undefined, undefined, 10);
            const now = Date.now();
            const dup = recentExpenses.find(e =>
                e.id !== docRef.id &&
                e.amount === expense.amount &&
                e.category === expense.category &&
                e.date instanceof Date &&
                (now - e.date.getTime()) <= EXPENSE_DUPLICATE_WINDOW_MS
            );
            if (dup) {
                await AuditAlertService.createAlert({
                    type: 'EXPENSE_DUPLICATE',
                    severity: 'MEDIUM',
                    branchId,
                    userId: expense.userId,
                    message: `Posible gasto duplicado: ${expense.category} Bs. ${expense.amount.toFixed(2)} registrado dos veces en menos de 5 minutos.`,
                    metadata: { expenseId: docRef.id, originalExpenseId: dup.id, amount: expense.amount }
                });
            }
        } catch (e) { console.error('[ExpenseService.create] Failed to create duplicate alert', e); }

        return docRef.id;
    },

    getByBranch: async (branchId: string, dateFrom?: Date, dateTo?: Date, maxResults?: number): Promise<OperationalExpense[]> => {
        const constraints: QueryConstraint[] = [
            where('branchId', '==', branchId),
            where('status', '==', 'ACTIVE'),
            orderBy('date', 'desc')
        ];

        if (maxResults) {
            constraints.push(fbLimit(maxResults));
        }

        const q = query(collection(db, COLLECTION), ...constraints);
        const snapshot = await getDocs(q);

        let expenses = snapshot.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                date: data.date?.toDate?.() || data.date,
                createdAt: data.createdAt?.toDate?.() || data.createdAt
            } as OperationalExpense;
        });

        // Client-side date filtering (Firestore compound index avoidance)
        if (dateFrom) {
            expenses = expenses.filter(e => e.date instanceof Date && e.date >= dateFrom);
        }
        if (dateTo) {
            const endOfDay = new Date(dateTo);
            endOfDay.setHours(23, 59, 59, 999);
            expenses = expenses.filter(e => e.date instanceof Date && e.date <= endOfDay);
        }

        return expenses;
    },

    void: async (expenseId: string, userId: string, userName: string, reason: string, branchId: string): Promise<{ compensated: boolean; warning?: string }> => {
        const expenseRef = doc(db, COLLECTION, expenseId);
        const snap = await getDoc(expenseRef);
        if (!snap.exists()) {
            throw new Error('Gasto no encontrado.');
        }
        const expense = { id: snap.id, ...snap.data() } as OperationalExpense;

        await updateDoc(expenseRef, {
            status: 'VOIDED',
            voidedAt: serverTimestamp(),
            voidedBy: userId,
            voidReason: reason
        });

        // Compensación automática: si el gasto generó un movimiento de caja, intentamos
        // reversar el asiento contable original (genera asiento espejo en sentido contrario).
        let compensated = false;
        let warning: string | undefined;
        if (expense.cashMovementId) {
            try {
                await JournalService.reverseEntry(expense.cashMovementId, {
                    reason: `Anulación de gasto: ${reason}`,
                    userId,
                    userName,
                    sessionId: null,
                });
                compensated = true;
            } catch (err) {
                warning = `No se pudo reversar el asiento contable: ${err instanceof Error ? err.message : String(err)}`;
            }
        }

        await logAdminAction(
            userId,
            userName,
            'VOID_EXPENSE',
            expenseId,
            branchId,
            `Gasto anulado: ${reason}${compensated ? ' (compensado en caja)' : ''}`
        );

        return { compensated, warning };
    },

    getTotalByPeriod: async (branchId: string, dateFrom: Date, dateTo: Date): Promise<{ total: number; byCategory: Record<string, number> }> => {
        const expenses = await ExpenseService.getByBranch(branchId, dateFrom, dateTo);
        const byCategory: Record<string, number> = {};
        let total = 0;

        for (const exp of expenses) {
            total += exp.amount;
            byCategory[exp.category] = (byCategory[exp.category] || 0) + exp.amount;
        }

        return { total, byCategory };
    },

    /**
     * Crea un gasto en estado PENDING_APPROVAL (para CAJEROS sobre el umbral).
     * NO genera movimiento de caja hasta que un GERENTE lo apruebe.
     */
    createPending: async (
        expense: Omit<OperationalExpense, 'id' | 'status' | 'createdAt' | 'cashMovementId'>,
        branchId: string
    ): Promise<string> => {
        const expenseDate = expense.date instanceof Date
            ? Timestamp.fromDate(expense.date)
            : expense.date;

        const docRef = await addDoc(collection(db, COLLECTION), {
            ...expense,
            branchId,
            date: expenseDate,
            status: 'PENDING_APPROVAL',
            createdAt: serverTimestamp()
        });

        await logAdminAction(
            expense.userId,
            expense.userName,
            'REQUEST_EXPENSE_APPROVAL',
            docRef.id,
            branchId,
            `Solicitud de gasto: ${expense.category} Bs. ${expense.amount} - ${expense.description}`
        );

        // (Sin AuditAlert duplicado: la solicitud ya aparece en la bandeja
        // de aprobaciones del gerente con boton para aprobar/rechazar.)

        return docRef.id;
    },

    /**
     * Lista gastos pendientes de aprobaci\u00f3n para una sucursal (o todas si branchId vac\u00edo).
     */
    getPendingApprovals: async (branchId?: string): Promise<OperationalExpense[]> => {
        const constraints: QueryConstraint[] = [
            where('status', '==', 'PENDING_APPROVAL'),
            orderBy('createdAt', 'desc')
        ];
        if (branchId) {
            constraints.unshift(where('branchId', '==', branchId));
        }
        const q = query(collection(db, COLLECTION), ...constraints);
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                date: data.date?.toDate?.() || data.date,
                createdAt: data.createdAt?.toDate?.() || data.createdAt
            } as OperationalExpense;
        });
    },

    /**
     * Aprueba un gasto pendiente: lo activa y registra el EGRESO en el turno OPEN actual.
     * Solo GERENTE.
     */
    approve: async (
        expenseId: string,
        approverId: string,
        approverName: string,
        approverRole?: string
    ): Promise<{ cashMovementId?: string }> => {
        if (approverRole !== 'GERENTE') {
            throw new Error('Solo un GERENTE puede aprobar gastos.');
        }
        const expenseRef = doc(db, COLLECTION, expenseId);
        const snap = await getDoc(expenseRef);
        if (!snap.exists()) throw new Error('Gasto no encontrado.');
        const expense = { id: snap.id, ...snap.data() } as OperationalExpense;
        if (expense.status !== 'PENDING_APPROVAL') {
            throw new Error('Este gasto ya no est\u00e1 pendiente.');
        }

        let cashMovementId: string | undefined;
        const paymentMethod = expense.paymentMethod || 'EFECTIVO';
        try {
            // Para EFECTIVO, el egreso sale de la caja del CAJERO solicitante (no del GERENTE).
            // El cajero original mantuvo el efectivo en su caja hasta la aprobación.
            const { accountId, sessionId } = await JournalService.resolveAccountId({
                branchId: expense.branchId,
                paymentMethod,
                cashierId: paymentMethod === 'EFECTIVO' ? expense.userId : undefined,
            });
            cashMovementId = await JournalService.createEntry({
                accountId,
                amount: expense.amount,
                paymentMethod,
                category: 'GASTO_OPERATIVO',
                description: `${expense.category} - ${expense.description}`,
                referenceType: 'EXPENSE',
                referenceId: expenseId,
                sessionId,
                branchId: expense.branchId,
                userId: approverId,
                userName: approverName,
                bankRef: paymentMethod !== 'EFECTIVO' ? expense.bankRef : undefined,
            });
        } catch (err) {
            // No marcar como ACTIVE si falló el asiento contable: deja como PENDING_APPROVAL para reintentar.
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`No se pudo registrar el egreso en caja: ${msg}. La solicitud sigue pendiente.`);
        }

        await updateDoc(expenseRef, {
            status: 'ACTIVE',
            approvedAt: serverTimestamp(),
            approvedBy: approverId,
            approvedByName: approverName,
            ...(cashMovementId ? { cashMovementId } : {})
        });

        // Notificar a dashboards/widgets para refrescar saldos.
        if (cashMovementId && paymentMethod === 'EFECTIVO' && typeof window !== 'undefined') {
            window.dispatchEvent(new Event('cash-shift-changed'));
        }

        await logAdminAction(
            approverId,
            approverName,
            'APPROVE_EXPENSE',
            expenseId,
            expense.branchId,
            `Aprob\u00f3 gasto Bs. ${expense.amount} - ${expense.category}${cashMovementId ? ' (egreso registrado)' : ''}`
        );

        return { cashMovementId };
    },

    /**
     * Rechaza un gasto pendiente. No crea movimiento de caja. Solo GERENTE.
     */
    reject: async (
        expenseId: string,
        approverId: string,
        approverName: string,
        reason: string,
        approverRole?: string
    ): Promise<void> => {
        if (approverRole !== 'GERENTE') {
            throw new Error('Solo un GERENTE puede rechazar gastos.');
        }
        if (!reason?.trim() || reason.trim().length < 5) {
            throw new Error('El motivo de rechazo debe tener al menos 5 caracteres.');
        }
        const expenseRef = doc(db, COLLECTION, expenseId);
        const snap = await getDoc(expenseRef);
        if (!snap.exists()) throw new Error('Gasto no encontrado.');
        const expense = { id: snap.id, ...snap.data() } as OperationalExpense;
        if (expense.status !== 'PENDING_APPROVAL') {
            throw new Error('Este gasto ya no est\u00e1 pendiente.');
        }

        await updateDoc(expenseRef, {
            status: 'REJECTED',
            rejectedAt: serverTimestamp(),
            rejectedBy: approverId,
            rejectedByName: approverName,
            rejectionReason: reason.trim()
        });

        await logAdminAction(
            approverId,
            approverName,
            'REJECT_EXPENSE',
            expenseId,
            expense.branchId,
            `Rechaz\u00f3 gasto Bs. ${expense.amount}: ${reason.trim()}`
        );
    }
};
