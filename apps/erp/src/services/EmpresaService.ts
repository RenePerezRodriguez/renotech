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
    writeBatch,
} from 'firebase/firestore';
import { Empresa, SupplierAccount } from '@/types';

const COL = 'empresas';
const COL_CUENTAS = 'cuentas_proveedores';

export const EmpresaService = {
    /** Subscribe to all active empresas (global). */
    subscribe(callback: (empresas: Empresa[]) => void) {
        const q = query(
            collection(db, COL),
            where('isActive', '!=', false),
            orderBy('isActive'),
            orderBy('nombre')
        );
        return onSnapshot(q, (snap) => {
            callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Empresa)));
        });
    },

    async getAll(): Promise<Empresa[]> {
        const q = query(
            collection(db, COL),
            where('isActive', '!=', false),
            orderBy('isActive'),
            orderBy('nombre')
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Empresa));
    },

    async getById(id: string): Promise<Empresa | null> {
        const snap = await getDoc(doc(db, COL, id));
        return snap.exists() ? ({ id: snap.id, ...snap.data() } as Empresa) : null;
    },

    async create(data: Omit<Empresa, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
        const ref = await addDoc(collection(db, COL), {
            ...data,
            isActive: data.isActive ?? true,
            cuentaCount: 0,
            saldoTotal: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return ref.id;
    },

    async update(id: string, data: Partial<Empresa>): Promise<void> {
        await updateDoc(doc(db, COL, id), {
            ...data,
            updatedAt: serverTimestamp(),
        });
    },

    /** Soft-delete: marca empresa como inactiva. NO toca las cuentas. */
    async softDelete(id: string): Promise<void> {
        await updateDoc(doc(db, COL, id), {
            isActive: false,
            updatedAt: serverTimestamp(),
        });
    },

    /** Recalcula cuentaCount y saldoTotal a partir de las cuentas activas. */
    async recomputeMetrics(empresaId: string): Promise<void> {
        const q = query(
            collection(db, COL_CUENTAS),
            where('empresaId', '==', empresaId),
            where('isActive', '==', true)
        );
        const snap = await getDocs(q);
        let cuentaCount = 0;
        let saldoTotal = 0;
        snap.forEach((d) => {
            cuentaCount += 1;
            const data = d.data() as SupplierAccount;
            saldoTotal += Number(data.saldo || 0);
        });
        await updateDoc(doc(db, COL, empresaId), {
            cuentaCount,
            saldoTotal,
            updatedAt: serverTimestamp(),
        });
    },

    /** Recalcula métricas para todas las empresas. Útil después de cambios masivos. */
    async recomputeAllMetrics(): Promise<number> {
        const empresas = await this.getAll();
        const batch = writeBatch(db);
        for (const emp of empresas) {
            const q = query(
                collection(db, COL_CUENTAS),
                where('empresaId', '==', emp.id!),
                where('isActive', '==', true)
            );
            const snap = await getDocs(q);
            let count = 0;
            let saldo = 0;
            snap.forEach((d) => {
                count += 1;
                const data = d.data() as SupplierAccount;
                saldo += Number(data.saldo || 0);
            });
            batch.update(doc(db, COL, emp.id!), {
                cuentaCount: count,
                saldoTotal: saldo,
                updatedAt: serverTimestamp(),
            });
        }
        await batch.commit();
        return empresas.length;
    },
};
