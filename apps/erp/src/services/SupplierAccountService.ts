import { db } from '@/lib/firebase';
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    serverTimestamp,
    onSnapshot,
    runTransaction,
    increment,
} from 'firebase/firestore';
import { SupplierAccount } from '@/types';
import { JournalService } from './JournalService';
import type { PaymentMethod } from '@/types/treasury';

const COL = 'cuentas_proveedores';
const COL_EMPRESAS = 'empresas';

export const SupplierAccountService = {
    /** Subscribe to all active accounts (optionally filtered by empresa or branch). */
    subscribe(
        callback: (accounts: SupplierAccount[]) => void,
        opts?: { empresaId?: string; branchId?: string }
    ) {
        const constraints = [
            where('isActive', '!=', false),
            orderBy('isActive'),
            orderBy('empresaNombre'),
        ];
        if (opts?.empresaId) constraints.push(where('empresaId', '==', opts.empresaId));
        // Nota: branch se filtra client-side para incluir cuentas globales (sin branchId).
        const q = query(collection(db, COL), ...constraints);
        return onSnapshot(q, (snap) => {
            let items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupplierAccount));
            if (opts?.branchId) {
                items = items.filter((a) => !a.branchId || a.branchId === opts.branchId);
            }
            callback(items);
        });
    },

    async getAll(empresaId?: string): Promise<SupplierAccount[]> {
        const constraints = [
            where('isActive', '!=', false),
            orderBy('isActive'),
            orderBy('empresaNombre'),
        ];
        if (empresaId) constraints.push(where('empresaId', '==', empresaId));
        const snap = await getDocs(query(collection(db, COL), ...constraints));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupplierAccount));
    },

    async getById(id: string): Promise<SupplierAccount | null> {
        const snap = await getDoc(doc(db, COL, id));
        return snap.exists() ? ({ id: snap.id, ...snap.data() } as SupplierAccount) : null;
    },

    async getByEmpresa(empresaId: string): Promise<SupplierAccount[]> {
        const q = query(
            collection(db, COL),
            where('empresaId', '==', empresaId),
            where('isActive', '!=', false),
            orderBy('isActive'),
            orderBy('alias')
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupplierAccount));
    },

    async create(
        data: Omit<SupplierAccount, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<string> {
        // Si es la primera cuenta de la empresa o se marca isDefault, garantizar único default.
        const ref = await addDoc(collection(db, COL), {
            ...data,
            saldo: data.saldo ?? 0,
            tipo: data.tipo || 'PROVEEDOR',
            isActive: data.isActive ?? true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        if (data.isDefault) {
            await this.setDefault(ref.id, data.empresaId);
        }
        // Update métricas de empresa
        await this.bumpEmpresaCount(data.empresaId, +1);
        return ref.id;
    },

    async update(id: string, data: Partial<SupplierAccount>): Promise<void> {
        await updateDoc(doc(db, COL, id), {
            ...data,
            updatedAt: serverTimestamp(),
        });
        if (data.isDefault && data.empresaId) {
            await this.setDefault(id, data.empresaId);
        }
    },

    /** Marca esta cuenta como default y desmarca las demás de la misma empresa. */
    async setDefault(accountId: string, empresaId: string): Promise<void> {
        const others = await getDocs(
            query(collection(db, COL), where('empresaId', '==', empresaId))
        );
        const updates: Promise<void>[] = [];
        others.forEach((d) => {
            if (d.id !== accountId && d.data().isDefault) {
                updates.push(updateDoc(doc(db, COL, d.id), { isDefault: false }));
            }
        });
        updates.push(updateDoc(doc(db, COL, accountId), { isDefault: true }));
        await Promise.all(updates);
    },

    /** Soft-delete: marca cuenta como inactiva. */
    async softDelete(id: string): Promise<void> {
        const account = await this.getById(id);
        if (!account) throw new Error('Cuenta no encontrada');
        await updateDoc(doc(db, COL, id), {
            isActive: false,
            updatedAt: serverTimestamp(),
        });
        await this.bumpEmpresaCount(account.empresaId, -1, account.saldo || 0);
    },

    /**
     * Suma `delta` al saldo (positivo = aumenta deuda con proveedor; negativo = lo pagamos).
     * Atómico mediante transacción + propaga cambio al saldoTotal de la empresa.
     */
    async adjustSaldo(accountId: string, delta: number): Promise<void> {
        if (!delta) return;
        await runTransaction(db, async (tx) => {
            const accRef = doc(db, COL, accountId);
            const accSnap = await tx.get(accRef);
            if (!accSnap.exists()) throw new Error('Cuenta no encontrada');
            const data = accSnap.data() as SupplierAccount;
            tx.update(accRef, {
                saldo: increment(delta),
                updatedAt: serverTimestamp(),
            });
            const empRef = doc(db, COL_EMPRESAS, data.empresaId);
            tx.update(empRef, {
                saldoTotal: increment(delta),
                updatedAt: serverTimestamp(),
            });
        });
    },

    /**
     * Pago a proveedor 100% atómico: una única transacción que
     *  1) lee la cuenta de tesorería destino (CASH/BANK/WALLET)
     *  2) lee la sesión de cajero si EFECTIVO (y exige status=OPEN)
     *  3) lee la cuenta del proveedor y la empresa
     *  4) escribe el asiento en journal_entries (PAGO_PROVEEDOR)
     *  5) reduce supplierAccount.saldo y empresa.saldoTotal
     * Si cualquier paso falla, Firestore revierte todo (no quedan saldos zombi).
     */
    async payAtomic(input: {
        supplierAccountId: string;
        amount: number;
        paymentMethod: PaymentMethod;
        branchId: string;
        userId: string;
        userName?: string;
        cashierId?: string;
        reference?: string;
        descriptionExtra?: string;
    }): Promise<{ entryId: string }> {
        if (!input.supplierAccountId) throw new Error('supplierAccountId es obligatorio');
        if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('El monto debe ser > 0');

        // Resolver fuera de TX (lecturas a config + sesión); JournalService.txEnsureSessionOpen
        // re-valida el estado dentro de la TX para impedir race con cierre de caja.
        const { accountId, sessionId } = await JournalService.resolveAccountId({
            branchId: input.branchId,
            paymentMethod: input.paymentMethod,
            cashierId: input.paymentMethod === 'EFECTIVO' ? input.cashierId : undefined,
        });

        const supRef = doc(db, COL, input.supplierAccountId);

        let entryId = '';
        await runTransaction(db, async (tx) => {
            // 1) Leer cuenta de tesorería destino
            const accRead = await JournalService.txReadAccount(tx, accountId);
            // 2) Si EFECTIVO, exigir sesión OPEN dentro de la TX
            if (input.paymentMethod === 'EFECTIVO' && sessionId) {
                await JournalService.txEnsureSessionOpen(tx, sessionId);
            }
            // 3) Leer cuenta del proveedor + empresa
            const supSnap = await tx.get(supRef);
            if (!supSnap.exists()) throw new Error('Cuenta de proveedor no encontrada');
            const sup = supSnap.data() as SupplierAccount;
            const debt = Number(sup.saldo || 0);
            if (debt <= 0) throw new Error('Esta cuenta no tiene deuda pendiente');
            if (input.amount > debt + 0.01) {
                throw new Error(`El monto excede la deuda. Máximo: Bs. ${debt.toFixed(2)}`);
            }
            const empRef = doc(db, COL_EMPRESAS, sup.empresaId);
            // (no necesitamos leer empresa si solo aplicamos increment)

            // 4) Escribir asiento contable
            const desc = `Pago ${input.paymentMethod} a proveedor` +
                (input.descriptionExtra ? ` — ${input.descriptionExtra}` : '') +
                (input.reference ? ` · Ref: ${input.reference}` : '');
            entryId = JournalService.txWriteEntry(tx, accRead, {
                accountId,
                amount: input.amount,
                paymentMethod: input.paymentMethod,
                category: 'PAGO_PROVEEDOR',
                description: desc,
                referenceType: 'SUPPLIER_PAYMENT',
                referenceId: input.supplierAccountId,
                sessionId,
                branchId: input.branchId,
                userId: input.userId,
                userName: input.userName || '',
            });

            // 5) Reducir saldo del proveedor + empresa
            tx.update(supRef, {
                saldo: increment(-input.amount),
                updatedAt: serverTimestamp(),
            });
            tx.update(empRef, {
                saldoTotal: increment(-input.amount),
                updatedAt: serverTimestamp(),
            });
        });

        return { entryId };
    },

    /** Helper interno: actualiza cuentaCount + saldoTotal de la empresa al crear/eliminar cuentas. */
    async bumpEmpresaCount(
        empresaId: string,
        countDelta: number,
        saldoDelta = 0
    ): Promise<void> {
        try {
            await updateDoc(doc(db, COL_EMPRESAS, empresaId), {
                cuentaCount: increment(countDelta),
                ...(saldoDelta ? { saldoTotal: increment(-saldoDelta) } : {}),
                updatedAt: serverTimestamp(),
            });
        } catch (e) {
            // Empresa puede haber sido eliminada; logueamos para auditoría pero no bloqueamos.
            console.warn('[SupplierAccount] bumpEmpresaCount falló:', { empresaId, countDelta, saldoDelta, error: e });
        }
    },
};
