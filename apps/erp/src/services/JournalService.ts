/**
 * JournalService — asientos contables (reemplaza CashService.addMovement).
 * Modelo Caja + Tesorería v2.
 *
 * Toda operación financiera del sistema crea uno o más JournalEntry.
 * No se borra nunca un asiento; las anulaciones generan asientos de reversión.
 */
import { db, app } from '@/lib/firebase';
import {
    collection, doc, getDoc, getDocs, query, where, orderBy, limit as fbLimit,
    runTransaction, serverTimestamp, increment,
    type Transaction
} from 'firebase/firestore';
import type {
    JournalEntry, JournalCategory, ReferenceType, PaymentMethod,
    Account, ReconciliationStatus
} from '@/types/treasury';
import type { Branch } from '@/types';
import { categoryDirection } from '@/types/treasury';
import { logAdminAction } from '@/lib/audit';
import { CashierSessionService } from './CashierSessionService';
import { getFunctions, httpsCallable } from 'firebase/functions';

const COLLECTION = 'journal_entries';

export interface CreateEntryInput {
    accountId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    category: JournalCategory;
    description: string;
    referenceType: ReferenceType;
    referenceId: string | null;
    sessionId: string | null;
    branchId: string;
    userId: string;
    userName?: string;
    date?: Date;
    bankRef?: string;
}

export const JournalService = {
    /**
     * Crea un asiento, valida la cuenta, y actualiza saldo atómicamente.
     * - Si la cuenta es CASH_DRAWER, sessionId es OBLIGATORIO.
     * - Si paymentMethod es QR/TRANSFERENCIA, reconciliationStatus = PENDING.
     * - El delta del balance se aplica según direction (DEBIT=+, CREDIT=-).
     */
    async createEntry(input: CreateEntryInput): Promise<string> {
        if (!input.accountId) throw new Error('accountId es obligatorio');
        if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('El monto debe ser > 0');
        if (!input.description?.trim()) throw new Error('La descripción es obligatoria');
        if (!input.branchId) throw new Error('branchId es obligatorio');
        if (!input.userId) throw new Error('userId es obligatorio');

        const direction = categoryDirection(input.category);
        const reconciliationStatus: ReconciliationStatus =
            input.paymentMethod === 'EFECTIVO' ? 'NOT_APPLICABLE' : 'PENDING';

        const accRef = doc(db, 'accounts', input.accountId);
        const journalRef = doc(collection(db, COLLECTION));

        await runTransaction(db, async (tx) => {
            const accSnap = await tx.get(accRef);
            if (!accSnap.exists()) throw new Error('Cuenta no encontrada');
            const acc = accSnap.data() as Account;
            if (!acc.isActive) throw new Error(`Cuenta inactiva: ${acc.name}`);

            // Aislamiento por sucursal: la cuenta debe pertenecer a la rama del movimiento
            // (acc.branchId puede ser undefined en cuentas globales/legacy; en ese caso no se valida)
            if (acc.branchId && acc.branchId !== input.branchId) {
                throw new Error(`La cuenta ${acc.name} pertenece a otra sucursal`);
            }

            // CASH_DRAWER requiere sessionId
            if (acc.type === 'CASH_DRAWER' && !input.sessionId) {
                throw new Error(`La cuenta ${acc.name} requiere sesión de cajero abierta`);
            }
            // Si hay sessionId, verificar que la sesión esté OPEN (evita asentar contra sesión cerrada)
            if (input.sessionId && acc.type === 'CASH_DRAWER') {
                const sessSnap = await tx.get(doc(db, 'cashier_sessions', input.sessionId));
                if (!sessSnap.exists()) throw new Error('Sesión de caja no encontrada');
                const sessStatus = (sessSnap.data() as { status?: string }).status;
                if (sessStatus !== 'OPEN') {
                    throw new Error(`No se puede asentar: la sesión está ${sessStatus || 'cerrada'}`);
                }
            }
            // Validar que el método de pago sea compatible con la cuenta
            if (acc.acceptsPaymentMethods && !acc.acceptsPaymentMethods.includes(input.paymentMethod)) {
                throw new Error(`La cuenta ${acc.name} no acepta pagos ${input.paymentMethod}`);
            }

            const delta = direction === 'DEBIT' ? input.amount : -input.amount;
            const newBalance = (acc.currentBalance || 0) + delta;
            // CASH_DRAWER no permite saldo negativo
            if (acc.type === 'CASH_DRAWER' && newBalance < -0.01) {
                throw new Error(`Saldo insuficiente en ${acc.name}: Bs. ${(acc.currentBalance || 0).toFixed(2)} < Bs. ${input.amount.toFixed(2)}`);
            }

            tx.update(accRef, {
                currentBalance: increment(delta),
                updatedAt: serverTimestamp(),
            });
            tx.set(journalRef, {
                accountId: input.accountId,
                direction,
                amount: input.amount,
                paymentMethod: input.paymentMethod,
                category: input.category,
                description: input.description,
                referenceType: input.referenceType,
                referenceId: input.referenceId || null,
                sessionId: input.sessionId || null,
                branchId: input.branchId,
                userId: input.userId,
                userName: input.userName || '',
                date: input.date || new Date(),
                createdAt: serverTimestamp(),
                reconciliationStatus,
                ...(input.bankRef ? { bankRef: input.bankRef } : {}),
            });
        });

        return journalRef.id;
    },

    /**
     * Crea dos asientos gemelos para un traslado entre cuentas (ej: efectivo entre sucursales,
     * o depósito a banco). Cada uno tiene relatedEntryId al otro.
     */
    async createTransfer(input: {
        fromAccountId: string;
        toAccountId: string;
        amount: number;
        paymentMethod: PaymentMethod;
        description: string;
        referenceType: ReferenceType;
        referenceId: string | null;
        sessionId: string | null;            // sesión del que origina (si aplica)
        toSessionId?: string | null;         // sesión destino (si traslado entre cajas)
        branchId: string;
        toBranchId?: string;
        userId: string;
        userName?: string;
    }): Promise<{ fromEntryId: string; toEntryId: string }> {
        if (input.fromAccountId === input.toAccountId) throw new Error('Cuenta origen y destino deben ser distintas');
        if (input.amount <= 0) throw new Error('Monto inválido');

        const fromAccRef = doc(db, 'accounts', input.fromAccountId);
        const toAccRef = doc(db, 'accounts', input.toAccountId);
        const fromEntryRef = doc(collection(db, COLLECTION));
        const toEntryRef = doc(collection(db, COLLECTION));

        await runTransaction(db, async (tx) => {
            const [fromSnap, toSnap] = await Promise.all([tx.get(fromAccRef), tx.get(toAccRef)]);
            if (!fromSnap.exists()) throw new Error('Cuenta origen no encontrada');
            if (!toSnap.exists()) throw new Error('Cuenta destino no encontrada');
            const fromAcc = fromSnap.data() as Account;
            const toAcc = toSnap.data() as Account;
            if (!fromAcc.isActive) throw new Error(`Cuenta origen inactiva: ${fromAcc.name}`);
            if (!toAcc.isActive) throw new Error(`Cuenta destino inactiva: ${toAcc.name}`);

            // Validaciones cajón físico
            if (fromAcc.type === 'CASH_DRAWER' && !input.sessionId) {
                throw new Error(`La cuenta ${fromAcc.name} requiere sesión abierta`);
            }
            if (toAcc.type === 'CASH_DRAWER' && !input.toSessionId) {
                throw new Error(`La cuenta destino ${toAcc.name} requiere sesión abierta`);
            }
            const newFromBalance = (fromAcc.currentBalance || 0) - input.amount;
            if (fromAcc.type === 'CASH_DRAWER' && newFromBalance < -0.01) {
                throw new Error(`Saldo insuficiente en ${fromAcc.name}`);
            }

            tx.update(fromAccRef, {
                currentBalance: increment(-input.amount),
                updatedAt: serverTimestamp(),
            });
            tx.update(toAccRef, {
                currentBalance: increment(input.amount),
                updatedAt: serverTimestamp(),
            });

            const baseFrom = {
                accountId: input.fromAccountId,
                direction: 'CREDIT' as const,
                amount: input.amount,
                paymentMethod: input.paymentMethod,
                category: 'TRASLADO_EGRESO' as JournalCategory,
                description: input.description,
                referenceType: input.referenceType,
                referenceId: input.referenceId || null,
                sessionId: input.sessionId || null,
                branchId: input.branchId,
                userId: input.userId,
                userName: input.userName || '',
                date: new Date(),
                createdAt: serverTimestamp(),
                reconciliationStatus: input.paymentMethod === 'EFECTIVO' ? 'NOT_APPLICABLE' : 'PENDING',
                relatedEntryId: toEntryRef.id,
            };
            const baseTo = {
                accountId: input.toAccountId,
                direction: 'DEBIT' as const,
                amount: input.amount,
                paymentMethod: input.paymentMethod,
                category: 'TRASLADO_INGRESO' as JournalCategory,
                description: input.description,
                referenceType: input.referenceType,
                referenceId: input.referenceId || null,
                sessionId: input.toSessionId || null,
                branchId: input.toBranchId || input.branchId,
                userId: input.userId,
                userName: input.userName || '',
                date: new Date(),
                createdAt: serverTimestamp(),
                reconciliationStatus: input.paymentMethod === 'EFECTIVO' ? 'NOT_APPLICABLE' : 'PENDING',
                relatedEntryId: fromEntryRef.id,
            };
            tx.set(fromEntryRef, baseFrom);
            tx.set(toEntryRef, baseTo);
        });

        return { fromEntryId: fromEntryRef.id, toEntryId: toEntryRef.id };
    },

    /**
     * Reversa un asiento existente. Delegado a la Cloud Function reverseEntryAtomic
     * para garantizar atomicidad (lectura + escritura del balance + creación del espejo).
     */
    async reverseEntry(originalEntryId: string, opts: {
        reason: string;
        userId: string;
        userName?: string;
        sessionId: string | null;
    }): Promise<string> {
        try {
            const fn = httpsCallable<
                { entryId: string; reason: string },
                { success: boolean; reverseId: string }
            >(getFunctions(app, 'us-central1'), 'reverseEntryAtomic');
            const res = await fn({ entryId: originalEntryId, reason: opts.reason });
            return res.data.reverseId;
        } catch (e) {
            const err = e as { message?: string };
            throw new Error(err.message || 'Error reversando asiento');
        }
    },

    /** Lista asientos filtrados */
    async list(filters: {
        sessionId?: string;
        accountId?: string;
        branchId?: string;
        userId?: string;
        from?: Date;
        to?: Date;
        category?: JournalCategory;
        referenceType?: ReferenceType;
        referenceId?: string;
        limit?: number;
    }): Promise<JournalEntry[]> {
        const constraints = [];
        if (filters.sessionId) constraints.push(where('sessionId', '==', filters.sessionId));
        if (filters.accountId) constraints.push(where('accountId', '==', filters.accountId));
        if (filters.branchId) constraints.push(where('branchId', '==', filters.branchId));
        if (filters.userId) constraints.push(where('userId', '==', filters.userId));
        if (filters.category) constraints.push(where('category', '==', filters.category));
        if (filters.referenceType) constraints.push(where('referenceType', '==', filters.referenceType));
        if (filters.referenceId) constraints.push(where('referenceId', '==', filters.referenceId));
        constraints.push(orderBy('date', 'desc'));
        if (filters.limit) constraints.push(fbLimit(filters.limit));

        const q = query(collection(db, COLLECTION), ...constraints);
        const snap = await getDocs(q);
        let entries = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                date: data.date?.toDate?.() || data.date,
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                voidedAt: data.voidedAt?.toDate?.() || data.voidedAt,
                reconciledAt: data.reconciledAt?.toDate?.() || data.reconciledAt,
            } as JournalEntry;
        });
        // Filtros de fecha client-side
        if (filters.from) entries = entries.filter(e => (e.date as Date) >= filters.from!);
        if (filters.to) {
            const end = new Date(filters.to);
            end.setHours(23, 59, 59, 999);
            entries = entries.filter(e => (e.date as Date) <= end);
        }
        return entries;
    },

    /** Reconciliar un asiento manualmente con referencia bancaria */
    async reconcile(entryId: string, opts: {
        bankRef: string;
        userId: string;
        userName?: string;
        batchId?: string;
    }): Promise<void> {
        if (!opts.bankRef?.trim()) throw new Error('Referencia bancaria obligatoria');
        const ref = doc(db, COLLECTION, entryId);

        // Releer DENTRO de la transacción para evitar TOCTOU
        // (sin esto, dos clientes podrían reconciliar el mismo asiento simultáneamente).
        let branchId = '';
        let amount = 0;
        let paymentMethod: PaymentMethod = 'TRANSFERENCIA';
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throw new Error('Asiento no encontrado');
            const e = snap.data() as JournalEntry;
            if (e.paymentMethod === 'EFECTIVO') throw new Error('No se concilia EFECTIVO');
            if (e.reconciliationStatus === 'RECONCILED') throw new Error('Ya está reconciliado');
            branchId = e.branchId;
            amount = e.amount;
            paymentMethod = e.paymentMethod;
            tx.update(ref, {
                reconciliationStatus: 'RECONCILED',
                bankRef: opts.bankRef.trim(),
                reconciledAt: serverTimestamp(),
                reconciledBy: opts.userId,
                reconciledByName: opts.userName || '',
                ...(opts.batchId ? { reconciliationBatchId: opts.batchId } : {}),
            });
        });

        await logAdminAction(opts.userId, opts.userName || '?', 'RECONCILE_ENTRY', entryId, branchId,
            `Reconciliado Bs. ${amount.toFixed(2)} ${paymentMethod} ref: ${opts.bankRef.trim()}`);
    },

    /** Resumen agregado de asientos por categoría/método (para KPIs) */
    async summarize(filters: { branchId?: string; from?: Date; to?: Date; sessionId?: string; userId?: string }): Promise<{
        byMethod: Record<PaymentMethod, { ingresos: number; egresos: number; neto: number }>;
        byCategory: Record<string, number>;
        totalIngresos: number;
        totalEgresos: number;
        neto: number;
    }> {
        const entries = await this.list({ ...filters, limit: 5000 });
        const byMethod: Record<PaymentMethod, { ingresos: number; egresos: number; neto: number }> = {
            EFECTIVO: { ingresos: 0, egresos: 0, neto: 0 },
            QR: { ingresos: 0, egresos: 0, neto: 0 },
            TRANSFERENCIA: { ingresos: 0, egresos: 0, neto: 0 },
        };
        const byCategory: Record<string, number> = {};
        let totalIngresos = 0, totalEgresos = 0;

        for (const e of entries) {
            if (e.reversedByEntryId || e.reversesEntryId) continue; // ignorar pares revertidos en el resumen
            const m = byMethod[e.paymentMethod];
            if (e.direction === 'DEBIT') {
                m.ingresos += e.amount;
                totalIngresos += e.amount;
            } else {
                m.egresos += e.amount;
                totalEgresos += e.amount;
            }
            m.neto = m.ingresos - m.egresos;
            const sign = e.direction === 'DEBIT' ? 1 : -1;
            byCategory[e.category] = (byCategory[e.category] || 0) + sign * e.amount;
        }
        return { byMethod, byCategory, totalIngresos, totalEgresos, neto: totalIngresos - totalEgresos };
    },

    // ========================================================================
    // HELPERS TRANSACCIONALES — para usar dentro de runTransaction de otros servicios
    // ========================================================================

    /**
     * Resuelve el accountId destino para un método de pago en una sucursal.
     * - EFECTIVO: requiere sessionId (toma session.cashDrawerId).
     * - QR/TRANSFERENCIA: usa TreasuryConfig.defaultAccountByMethod[method].
     *   Lanza error claro si no está configurado.
     *
     * Modelo "caja por sucursal": cuando se da `cashierId`, primero se busca su sesión
     * personal; si no tiene una OPEN en la sucursal, se hace fallback a la sesión OPEN
     * de la sucursal (abierta por otro usuario). Esto permite que múltiples cajeros
     * operen sobre la misma caja física durante el día. La autoría real del movimiento
     * queda registrada en `JournalEntry.userId/userName`.
     */
    async resolveAccountId(opts: {
        branchId: string;
        paymentMethod: PaymentMethod;
        sessionId?: string | null;
        cashierId?: string;
    }): Promise<{ accountId: string; sessionId: string | null }> {
        if (opts.paymentMethod === 'EFECTIVO') {
            // 1) Si dieron sessionId úsalo
            if (opts.sessionId) {
                const sess = await CashierSessionService.getById(opts.sessionId);
                if (!sess || sess.status !== 'OPEN') throw new Error('La sesión de caja no está abierta');
                if (sess.branchId !== opts.branchId) throw new Error('La sesión de caja pertenece a otra sucursal');
                return { accountId: sess.cashDrawerId, sessionId: sess.id! };
            }
            // 2) Buscar sesión personal del cajero; si no aplica a la sucursal, usar la
            //    sesión activa de la sucursal (modelo de caja compartida).
            let sess = opts.cashierId ? await CashierSessionService.getCurrentSession(opts.cashierId) : null;
            if (sess && sess.branchId !== opts.branchId) sess = null;
            if (!sess) {
                sess = await CashierSessionService.getCurrentBranchSession(opts.branchId);
            }
            if (sess) {
                return { accountId: sess.cashDrawerId, sessionId: sess.id! };
            }
            // 3) Sin sesión OPEN (caso típico: registro retroactivo de un gasto en
            //    EFECTIVO de un día anterior). Usar la cuenta CASH_DRAWER de la sucursal.
            //    Si hay varias, requerir sessionId explícito para evitar ambigüedad.
            const { AccountService } = await import('./AccountService');
            const drawers = await AccountService.list({ type: 'CASH_DRAWER', branchId: opts.branchId, includeInactive: false });
            if (drawers.length === 0) {
                throw new Error('Esta sucursal no tiene un cajón configurado. Configúralo en Caja → Cuentas.');
            }
            if (drawers.length > 1) {
                throw new Error('Esta sucursal tiene varios cajones. Abre uno de ellos para registrar el movimiento.');
            }
            return { accountId: drawers[0].id!, sessionId: null };
        }

        // QR / TRANSFERENCIA → cuenta default. La sesión NO es obligatoria pero se asocia
        // si hay una OPEN en la sucursal (mejora la trazabilidad y evita doble
        // conteo entre sesiones solapadas en el cierre).
        const branchSnap = await getDoc(doc(db, 'branches', opts.branchId));
        if (!branchSnap.exists()) throw new Error('Sucursal no encontrada');
        const branchData = branchSnap.data() as Branch;
        const branchName = branchData.name || opts.branchId;
        const defaultId = branchData.config?.defaultAccounts?.[opts.paymentMethod];
        if (!defaultId) {
            throw new Error(`No hay cuenta ${opts.paymentMethod} asignada a la sucursal "${branchName}". Configúrala en Caja → Cuentas → Cuentas por defecto.`);
        }
        // Verificar que la cuenta default referenciada exista y esté activa.
        // Si fue borrada o desactivada, el campo defaultAccounts queda apuntando
        // a un id huérfano y la venta falla con "Cuenta XXX no encontrada".
        // Mejor avisar aquí con un mensaje accionable.
        const defaultAccSnap = await getDoc(doc(db, 'accounts', defaultId));
        if (!defaultAccSnap.exists()) {
            throw new Error(`La cuenta ${opts.paymentMethod} configurada para la sucursal "${branchName}" ya no existe. Ve a Caja → Cuentas → Cuentas por defecto y selecciona una cuenta válida.`);
        }
        const defaultAccData = defaultAccSnap.data() as Account;
        if (!defaultAccData.isActive) {
            throw new Error(`La cuenta "${defaultAccData.name}" (${opts.paymentMethod}) configurada para la sucursal "${branchName}" está inactiva. Actívala o asigna otra en Caja → Cuentas → Cuentas por defecto.`);
        }
        let resolvedSessionId: string | null = opts.sessionId || null;
        if (!resolvedSessionId) {
            try {
                // Preferir sesión propia del cajero si existe; sino, la de la sucursal.
                let sess = opts.cashierId ? await CashierSessionService.getCurrentSession(opts.cashierId) : null;
                if (sess && (sess.status !== 'OPEN' || sess.branchId !== opts.branchId)) sess = null;
                if (!sess) {
                    sess = await CashierSessionService.getCurrentBranchSession(opts.branchId);
                }
                if (sess && sess.status === 'OPEN') {
                    resolvedSessionId = sess.id!;
                }
            } catch { /* si falla, queda null y se concilia por ventana temporal */ }
        }
        return { accountId: defaultId, sessionId: resolvedSessionId };
    },

    /**
     * Lee una cuenta dentro de una transacción Firestore. Usar ANTES de cualquier write
     * en la misma tx (Firestore exige reads first).
     */
    async txReadAccount(tx: Transaction, accountId: string): Promise<{ ref: ReturnType<typeof doc>; account: Account }> {
        const ref = doc(db, 'accounts', accountId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(`Cuenta ${accountId} no encontrada`);
        const account = { id: snap.id, ...snap.data() } as Account;
        if (!account.isActive) throw new Error(`Cuenta inactiva: ${account.name}`);
        return { ref, account };
    },

    /**
     * Lee una sesión de cajero dentro de TX y exige status='OPEN'.
     * Usar antes de txWriteEntry cuando la cuenta es CASH_DRAWER, para impedir
     * asentar contra una sesión recién cerrada (race entre apertura y cierre).
     */
    async txEnsureSessionOpen(tx: Transaction, sessionId: string): Promise<void> {
        const sref = doc(db, 'cashier_sessions', sessionId);
        const snap = await tx.get(sref);
        if (!snap.exists()) throw new Error('Sesión de caja no encontrada');
        const status = (snap.data() as { status?: string }).status;
        if (status !== 'OPEN') {
            throw new Error(`No se puede asentar: la sesión está ${status || 'cerrada'}`);
        }
    },

    /**
     * Aplica un asiento dentro de una transacción ya iniciada (todos los reads ya hechos).
     * - Valida método aceptado, sesión requerida para CASH_DRAWER, saldo no-negativo en CASH_DRAWER.
     * - Actualiza el saldo via increment() y crea el doc journal_entries.
     * Devuelve el id del asiento.
     */
    txWriteEntry(tx: Transaction,
        accRead: { ref: ReturnType<typeof doc>; account: Account },
        input: CreateEntryInput
    ): string {
        if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('El monto debe ser > 0');
        if (!input.description?.trim()) throw new Error('La descripción es obligatoria');
        if (!input.branchId) throw new Error('branchId es obligatorio');
        if (!input.userId) throw new Error('userId es obligatorio');

        const acc = accRead.account;
        const direction = categoryDirection(input.category);
        const reconciliationStatus: ReconciliationStatus =
            input.paymentMethod === 'EFECTIVO' ? 'NOT_APPLICABLE' : 'PENDING';

        // Aislamiento por sucursal
        if (acc.branchId && acc.branchId !== input.branchId) {
            throw new Error(`La cuenta ${acc.name} pertenece a otra sucursal`);
        }

        if (acc.type === 'CASH_DRAWER' && !input.sessionId) {
            throw new Error(`La cuenta ${acc.name} requiere sesión de cajero abierta`);
        }
        if (acc.acceptsPaymentMethods && !acc.acceptsPaymentMethods.includes(input.paymentMethod)) {
            throw new Error(`La cuenta ${acc.name} no acepta pagos ${input.paymentMethod}`);
        }

        const delta = direction === 'DEBIT' ? input.amount : -input.amount;
        const newBalance = (acc.currentBalance || 0) + delta;
        if (acc.type === 'CASH_DRAWER' && newBalance < -0.01) {
            throw new Error(`Saldo insuficiente en ${acc.name}: Bs. ${(acc.currentBalance || 0).toFixed(2)} < Bs. ${input.amount.toFixed(2)}`);
        }

        const journalRef = doc(collection(db, COLLECTION));
        tx.update(accRead.ref, {
            currentBalance: increment(delta),
            updatedAt: serverTimestamp(),
        });
        tx.set(journalRef, {
            accountId: input.accountId,
            direction,
            amount: input.amount,
            paymentMethod: input.paymentMethod,
            category: input.category,
            description: input.description,
            referenceType: input.referenceType,
            referenceId: input.referenceId || null,
            sessionId: input.sessionId || null,
            branchId: input.branchId,
            userId: input.userId,
            userName: input.userName || '',
            date: input.date || new Date(),
            createdAt: serverTimestamp(),
            reconciliationStatus,
            ...(input.bankRef ? { bankRef: input.bankRef } : {}),
        });
        // Update local snapshot so subsequent txWriteEntry on same account in same tx see updated balance
        acc.currentBalance = newBalance;
        return journalRef.id;
    },
};
