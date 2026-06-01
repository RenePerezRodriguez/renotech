import { db } from '@/lib/firebase';
import { Branch } from '@/types';
import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    limit,
    runTransaction,
    writeBatch,
    arrayUnion
} from 'firebase/firestore';

const COLLECTION = 'branches';

export const BranchService = {
    /**
     * Get all branches
     */
    async getAll(): Promise<Branch[]> {
        const ref = collection(db, COLLECTION);
        const q = query(ref, orderBy('isHQ', 'desc'), orderBy('name', 'asc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Branch[];
    },

    /**
     * Get active branches only
     */
    async getActive(): Promise<Branch[]> {
        const ref = collection(db, COLLECTION);
        const q = query(ref, where('status', '==', 'ACTIVE'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Branch[];
    },

    /**
     * Get a single branch by ID
     */
    async getById(id: string): Promise<Branch | null> {
        const docRef = doc(db, COLLECTION, id);
        const snapshot = await getDoc(docRef);
        if (!snapshot.exists()) return null;
        return { id: snapshot.id, ...snapshot.data() } as Branch;
    },

    /**
     * Get the HQ branch
     */
    async getHQ(): Promise<Branch | null> {
        const ref = collection(db, COLLECTION);
        const q = query(ref, where('isHQ', '==', true));
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() } as Branch;
    },

    /**
     * Create a new branch
     */
    async create(data: Omit<Branch, 'id' | 'createdAt'>): Promise<string> {
        const ref = collection(db, COLLECTION);
        
        // Normalize branch name casing
        if (data.name) {
            data = { ...data, name: data.name.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) };
        }

        // --- AUTO-GENERATION LOGIC for code if empty ---
        let finalCode = data.code;
        if (!finalCode) {
            const allBranches = await this.getAll();
            const count = allBranches.length + 1;
            finalCode = `SUC-${String(count).padStart(3, '0')}`;
        }
        
        // --- HQ SINGLETON LOGIC ---
        if (data.isHQ) {
            await runTransaction(db, async (transaction) => {
                const hqQuery = query(collection(db, COLLECTION), where('isHQ', '==', true));
                const hqSnapshot = await getDocs(hqQuery);
                hqSnapshot.docs.forEach(hqDoc => {
                    transaction.update(hqDoc.ref, { isHQ: false });
                });
            });
        }

        const docRef = await addDoc(ref, {
            ...data,
            code: finalCode,
            createdAt: serverTimestamp()
        });

        // Auto-provisión: crear Caja POS + Bóveda inherentes a la sucursal
        await this._provisionTreasuryAccounts(docRef.id, data.name);

        // Auto-asignar cuenta bancaria por defecto (QR/TRANSFERENCIA) si hay una sola.
        // Sin esto, vender/comprar con QR o TRANSFERENCIA falla con "no hay cuenta asignada".
        await this._autoAssignDefaultBankAccount(docRef.id);

        return docRef.id;
    },

    /**
     * Update an existing branch
     */
    async update(id: string, data: Partial<Branch>): Promise<void> {
        // Normalize branch name casing
        if (data.name) {
            data = { ...data, name: data.name.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) };
        }

        // --- HQ SAFETY & SINGLETON LOGIC ---
        const existing = await this.getById(id);
        
        // Prevent HQ deactivation
        if (existing?.isHQ && data.status === 'INACTIVE') {
            throw new Error('E-SYS-003: La Sede Matriz no puede ser desactivada para garantizar la estabilidad del sistema.');
        }

        if (data.isHQ) {
            await runTransaction(db, async (transaction) => {
                const hqQuery = query(collection(db, COLLECTION), where('isHQ', '==', true));
                const hqSnapshot = await getDocs(hqQuery);
                hqSnapshot.docs.filter(d => d.id !== id).forEach(hqDoc => {
                    transaction.update(hqDoc.ref, { isHQ: false });
                });
            });
        }

        // Si cambió el nombre, sincronizar nombres de Caja/Bóveda
        if (data.name && existing && data.name !== existing.name) {
            await this._syncAccountNames(id, data.name);
        }

        const docRef = doc(db, COLLECTION, id);
        await updateDoc(docRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
    },

    /**
     * Delete a branch (soft delete - set status to INACTIVE)
     * Architecture: database_schema.md L321 - Inverse Cascade
     */
    async delete(id: string): Promise<void> {
        // 1. Check for linked products with stock
        const productQuery = query(collection(db, 'productos'), where('branchId', '==', id), where('isActive', '==', true), limit(1));
        const productSnap = await getDocs(productQuery);
        
        if (!productSnap.empty) {
            throw new Error('E-SYS-001: No se puede eliminar la sucursal porque tiene inventario activo vinculado.');
        }

        // 2. Check for recent sales (optional business rule)
        const saleQuery = query(collection(db, 'ventas'), where('branchId', '==', id), limit(1));
        const saleSnap = await getDocs(saleQuery);
        if (!saleSnap.empty) {
            throw new Error('E-SYS-002: No se puede eliminar la sucursal porque tiene registros históricos de ventas.');
        }

        // 3. Check for assigned users
        const userQuery = query(collection(db, 'users'), where('branchId', '==', id), limit(1));
        const userSnap = await getDocs(userQuery);
        if (!userSnap.empty) {
            throw new Error('E-SYS-004: No se puede eliminar la sucursal porque tiene usuarios asignados. Reasígnelos primero.');
        }

        const docRef = doc(db, COLLECTION, id);
        await updateDoc(docRef, { 
            status: 'INACTIVE',
            updatedAt: serverTimestamp()
        });
    },

    /**
     * Hard delete a branch (use with caution)
     */
    async hardDelete(id: string): Promise<void> {
        const docRef = doc(db, COLLECTION, id);
        await deleteDoc(docRef);
    },

    /**
     * Seed the initial HQ branch if none exists
     * Call this on app initialization
     */
    async seedHQIfNeeded(): Promise<Branch | null> {
        const existing = await this.getHQ();
        if (existing) return existing;

        // Create the default HQ branch
        const hqId = await this.create({
            name: 'Central',
            code: 'HQ',
            isHQ: true,
            status: 'ACTIVE',
            config: {
                canReceiveTransfers: true,
                canRequestTransfers: true
            }
        });

        return await this.getById(hqId);
    },

    /**
     * Check if any branches exist
     */
    async exists(): Promise<boolean> {
        const ref = collection(db, COLLECTION);
        const snapshot = await getDocs(query(ref, limit(1)));
        return !snapshot.empty;
    },

    /**
     * @internal Crea las cuentas CASH_DRAWER inherentes a una sucursal:
     * 1 Caja POS + 1 Bóveda. Se ejecuta atómicamente con writeBatch.
     */
    async _provisionTreasuryAccounts(branchId: string, branchName: string): Promise<void> {
        const batch = writeBatch(db);
        const accountsRef = collection(db, 'accounts');

        // Caja POS
        const posRef = doc(accountsRef);
        batch.set(posRef, {
            name: `Caja ${branchName}`,
            type: 'CASH_DRAWER',
            branchId,
            currency: 'BOB',
            currentBalance: 0,
            openingBalance: 0,
            isActive: true,
            cashDrawerPurpose: 'POS',
            acceptsPaymentMethods: ['EFECTIVO'],
            createdAt: serverTimestamp(),
            createdBy: 'SYSTEM',
            updatedAt: serverTimestamp(),
        });

        // Bóveda
        const vaultRef = doc(accountsRef);
        batch.set(vaultRef, {
            name: `Bóveda ${branchName}`,
            type: 'CASH_DRAWER',
            branchId,
            currency: 'BOB',
            currentBalance: 0,
            openingBalance: 0,
            isActive: true,
            cashDrawerPurpose: 'VAULT',
            acceptsPaymentMethods: ['EFECTIVO'],
            createdAt: serverTimestamp(),
            createdBy: 'SYSTEM',
            updatedAt: serverTimestamp(),
        });

        await batch.commit();
    },

    /**
     * @internal Auto-asigna la cuenta bancaria por defecto (QR + TRANSFERENCIA)
     * a una sucursal recién creada. Solo actúa si existe EXACTAMENTE UNA cuenta
     * BANK activa (caso típico de PyME con una sola cuenta). Con varias cuentas,
     * no asume nada y deja que el gerente elija manualmente en Tesorería.
     *
     * Best-effort: si falla, la sucursal queda sin default (configurable a mano)
     * sin abortar la creación de la sucursal.
     */
    async _autoAssignDefaultBankAccount(branchId: string): Promise<void> {
        try {
            const q = query(
                collection(db, 'accounts'),
                where('type', '==', 'BANK'),
                where('isActive', '==', true)
            );
            const snap = await getDocs(q);
            if (snap.size !== 1) return; // 0 o >1 → no auto-asignar

            const bankDoc = snap.docs[0];
            const batch = writeBatch(db);

            // 1) Default QR + TRANSFERENCIA de la sucursal apuntan a esa cuenta.
            //    Dot-notation: crea config.defaultAccounts sin pisar otros campos de config.
            batch.update(doc(db, COLLECTION, branchId), {
                'config.defaultAccounts.QR': bankDoc.id,
                'config.defaultAccounts.TRANSFERENCIA': bankDoc.id,
                updatedAt: serverTimestamp(),
            });

            // 2) Habilitar la cuenta para esta sucursal (branchIds[] multi-sucursal).
            batch.update(bankDoc.ref, {
                branchIds: arrayUnion(branchId),
                updatedAt: serverTimestamp(),
            });

            await batch.commit();
        } catch (e) {
            console.warn('[BranchService] No se pudo auto-asignar cuenta bancaria por defecto:', e);
        }
    },

    /**
     * @internal Sincroniza nombres de Caja/Bóveda al renombrar la sucursal.
     */
    async _syncAccountNames(branchId: string, newBranchName: string): Promise<void> {
        const accountsSnap = await getDocs(query(
            collection(db, 'accounts'),
            where('branchId', '==', branchId),
            where('type', '==', 'CASH_DRAWER')
        ));
        if (accountsSnap.empty) return;

        const batch = writeBatch(db);
        accountsSnap.docs.forEach(docSnap => {
            const purpose = docSnap.data().cashDrawerPurpose;
            const newName = purpose === 'VAULT'
                ? `Bóveda ${newBranchName}`
                : `Caja ${newBranchName}`;
            batch.update(docSnap.ref, { name: newName, updatedAt: serverTimestamp() });
        });
        await batch.commit();
    },

    /**
     * Self-healing: verifica que la sucursal tenga Caja POS y Bóveda.
     * Si falta alguna, la crea al vuelo. Seguro de llamar múltiples veces (idempotente).
     */
    async ensureTreasuryAccounts(branchId: string, branchName: string): Promise<void> {
        const accountsSnap = await getDocs(query(
            collection(db, 'accounts'),
            where('branchId', '==', branchId),
            where('type', '==', 'CASH_DRAWER')
        ));
        const existing = accountsSnap.docs.map(d => d.data().cashDrawerPurpose as string);
        const hasPOS = existing.includes('POS');
        const hasVault = existing.includes('VAULT');

        if (hasPOS && hasVault) return; // Ya tiene ambas

        const batch = writeBatch(db);
        const accountsRef = collection(db, 'accounts');

        if (!hasPOS) {
            const posRef = doc(accountsRef);
            batch.set(posRef, {
                name: `Caja ${branchName}`,
                type: 'CASH_DRAWER',
                branchId,
                currency: 'BOB',
                currentBalance: 0,
                openingBalance: 0,
                isActive: true,
                cashDrawerPurpose: 'POS',
                acceptsPaymentMethods: ['EFECTIVO'],
                createdAt: serverTimestamp(),
                createdBy: 'SYSTEM',
                updatedAt: serverTimestamp(),
            });
        }

        if (!hasVault) {
            const vaultRef = doc(accountsRef);
            batch.set(vaultRef, {
                name: `Bóveda ${branchName}`,
                type: 'CASH_DRAWER',
                branchId,
                currency: 'BOB',
                currentBalance: 0,
                openingBalance: 0,
                isActive: true,
                cashDrawerPurpose: 'VAULT',
                acceptsPaymentMethods: ['EFECTIVO'],
                createdAt: serverTimestamp(),
                createdBy: 'SYSTEM',
                updatedAt: serverTimestamp(),
            });
        }

        await batch.commit();
        console.log(`[BranchService] Auto-provisioned missing accounts for branch ${branchName} (POS: ${!hasPOS}, VAULT: ${!hasVault})`);
    }
};
