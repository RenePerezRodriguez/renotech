/**
 * AccountService — gestión de cuentas (cajón físico, banco, wallet).
 * Modelo Caja + Tesorería v2.
 */
import { db } from '@/lib/firebase';
import {
    collection, doc, getDoc, getDocs, query, where,
    addDoc, updateDoc, runTransaction, serverTimestamp, increment, QueryConstraint
} from 'firebase/firestore';
import type { Account, AccountType, JournalEntry, PaymentMethod } from '@/types/treasury';
import { logAdminAction } from '@/lib/audit';

const COLLECTION = 'accounts';

export const AccountService = {
    /** Obtener una cuenta por id */
    async getById(id: string): Promise<Account | null> {
        const snap = await getDoc(doc(db, COLLECTION, id));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() } as Account;
    },

    /** Lista todas las cuentas activas (opcionalmente filtradas por tipo o sucursal) */
    async list(filters?: {
        type?: AccountType;
        branchId?: string | null;
        includeInactive?: boolean;
        acceptsMethod?: PaymentMethod;
    }): Promise<Account[]> {
        const constraints: QueryConstraint[] = [];
        if (filters?.type) constraints.push(where('type', '==', filters.type));
        if (!filters?.includeInactive) constraints.push(where('isActive', '==', true));

        const q = constraints.length
            ? query(collection(db, COLLECTION), ...constraints)
            : query(collection(db, COLLECTION));
        const snap = await getDocs(q);
        let accounts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Account));
        
        // Filtro client-side por sucursal (evita errores de composite queries / faltas de índices en Firestore)
        if (filters?.branchId !== undefined) {
            accounts = accounts.filter(a => {
                if (filters.branchId === null) return a.branchId === null;
                return a.branchId === filters.branchId || (a.branchIds && a.branchIds.includes(filters.branchId!));
            });
        }
        
        // Filtro client-side por método (Firestore array-contains tiene limitaciones combinadas)
        if (filters?.acceptsMethod) {
            accounts = accounts.filter(a =>
                !a.acceptsPaymentMethods || a.acceptsPaymentMethods.includes(filters.acceptsMethod!)
            );
        }
        // Orden estable: cajas primero, luego bancos, luego wallets; alfabético dentro
        const typeOrder: Record<AccountType, number> = { CASH_DRAWER: 0, BANK: 1, WALLET: 2 };
        accounts.sort((a, b) => {
            const t = typeOrder[a.type] - typeOrder[b.type];
            return t !== 0 ? t : a.name.localeCompare(b.name);
        });
        return accounts;
    },

    /** Crear cuenta — el saldo inicial siempre es 0. El saldo real se define al abrir la primera sesión. */
    async create(account: Omit<Account, 'id' | 'currentBalance' | 'createdAt' | 'updatedAt'>, userId: string): Promise<string> {
        if (!account.name?.trim()) throw new Error('El nombre es obligatorio');

        // Default acceptsPaymentMethods según tipo
        const defaults: Record<AccountType, PaymentMethod[]> = {
            CASH_DRAWER: ['EFECTIVO'],
            BANK: ['TRANSFERENCIA', 'QR'],
            WALLET: ['QR', 'TRANSFERENCIA'],
        };

        const ref = await addDoc(collection(db, COLLECTION), {
            ...account,
            openingBalance: 0,
            currentBalance: 0,
            acceptsPaymentMethods: account.acceptsPaymentMethods || defaults[account.type],
            currency: account.currency || 'BOB',
            isActive: account.isActive !== false,
            createdAt: serverTimestamp(),
            createdBy: userId,
            updatedAt: serverTimestamp(),
        });

        await logAdminAction(userId, '?', 'CREATE_ACCOUNT', ref.id, account.branchId || 'HQ',
            `Cuenta creada: ${account.name} (${account.type}) — el saldo se definirá al abrir la primera sesión`);
        return ref.id;
    },

    /** Actualizar (excepto saldo: el saldo solo se modifica vía JournalService).
     *  openingBalance solo se permite modificar si no se ha abierto ninguna sesión sobre esta cuenta. */
    async update(id: string, patch: Partial<Omit<Account, 'id' | 'currentBalance' | 'createdAt'>> & { openingBalance?: number }, userId: string): Promise<void> {
        const cleanPatch: Record<string, unknown> = { ...patch, updatedAt: serverTimestamp() };
        delete cleanPatch.currentBalance;

        // type es inmutable — las reglas de Firestore exigen que no cambie.
        delete cleanPatch.type;

        // Permitir openingBalance solo si no hay sesiones registradas para esta cuenta
        if (patch.openingBalance !== undefined) {
            const sessionsSnap = await getDocs(query(collection(db, 'cashier_sessions'), where('cashDrawerId', '==', id), where('status', '!=', 'CANCELLED')));
            if (!sessionsSnap.empty) {
                throw new Error('No se puede modificar el saldo inicial: ya existen sesiones de caja registradas para esta cuenta.');
            }
            cleanPatch.openingBalance = patch.openingBalance;
            cleanPatch.currentBalance = patch.openingBalance;
        } else {
            delete cleanPatch.openingBalance;
        }

        await updateDoc(doc(db, COLLECTION, id), cleanPatch);
        await logAdminAction(userId, '?', 'UPDATE_ACCOUNT', id, 'HQ', `Cuenta actualizada`);
    },

    /** Desactivar cuenta (no borrar — preservar historial). Falla si tiene saldo. */
    async deactivate(id: string, userId: string): Promise<void> {
        const acc = await this.getById(id);
        if (!acc) throw new Error('Cuenta no encontrada');
        if (Math.abs(acc.currentBalance) > 0.01) {
            throw new Error(`No se puede desactivar: la cuenta tiene saldo Bs. ${acc.currentBalance.toFixed(2)}. Transfiere o ajusta primero.`);
        }
        await updateDoc(doc(db, COLLECTION, id), { isActive: false, updatedAt: serverTimestamp() });
        await logAdminAction(userId, '?', 'DEACTIVATE_ACCOUNT', id, acc.branchId || 'HQ', `Cuenta desactivada: ${acc.name}`);
    },

    /**
     * Aplica un asiento (JournalEntry) y actualiza el saldo de la cuenta atómicamente.
     * SOLO debe llamarse desde JournalService o Cloud Functions.
     * @internal
     */
    async _applyEntry(entry: Omit<JournalEntry, 'id' | 'createdAt'>): Promise<string> {
        if (entry.amount <= 0) throw new Error('El monto debe ser > 0');
        const accRef = doc(db, COLLECTION, entry.accountId);
        const journalRef = doc(collection(db, 'journal_entries'));

        await runTransaction(db, async (tx) => {
            const accSnap = await tx.get(accRef);
            if (!accSnap.exists()) throw new Error('Cuenta no encontrada');
            const acc = accSnap.data() as Account;
            if (!acc.isActive) throw new Error(`Cuenta inactiva: ${acc.name}`);

            const delta = entry.direction === 'DEBIT' ? entry.amount : -entry.amount;
            const newBalance = (acc.currentBalance || 0) + delta;
            // CASH_DRAWER no permite saldo negativo (cajón físico)
            if (acc.type === 'CASH_DRAWER' && newBalance < -0.01) {
                throw new Error(`Saldo insuficiente en ${acc.name}: Bs. ${acc.currentBalance.toFixed(2)} < Bs. ${entry.amount.toFixed(2)}`);
            }

            tx.update(accRef, {
                currentBalance: increment(delta),
                updatedAt: serverTimestamp(),
            });
            tx.set(journalRef, {
                ...entry,
                createdAt: serverTimestamp(),
            });
        });

        return journalRef.id;
    },

    /** Suma de saldos de cuentas filtradas */
    async sumBalances(filters?: { type?: AccountType; branchId?: string | null }): Promise<number> {
        const accs = await this.list({ ...filters, includeInactive: false });
        return accs.reduce((s, a) => s + (a.currentBalance || 0), 0);
    },
};
