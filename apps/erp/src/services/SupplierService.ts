import { db } from '@/lib/firebase';
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    getDocs,
    query,
    orderBy,
    serverTimestamp,
    onSnapshot,
    where
} from 'firebase/firestore';
import { Supplier } from '@/types';

const COLLECTION_NAME = 'proveedores';

export const SupplierService = {
    subscribeToSuppliers: (callback: (suppliers: Supplier[]) => void, branchId?: string) => {
        let q = query(
            collection(db, COLLECTION_NAME), 
            where('isActive', '!=', false),
            orderBy('isActive'),
            orderBy('razonSocial')
        );
        if (branchId) {
            q = query(q, where('branchId', '==', branchId));
        }
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Supplier));
            callback(items);
        });
    },

    createSupplier: async (supplier: Omit<Supplier, 'id'>, branchId?: string) => {
        if (!branchId) {
            throw new Error('Se requiere una sucursal activa para registrar el proveedor.');
        }
        const data: Record<string, unknown> = {
            ...supplier,
            isActive: true, // Auto-active
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            branchId
        };

        const docRef = await addDoc(collection(db, COLLECTION_NAME), data);
        return docRef.id;
    },

    // Update
    updateSupplier: async (id: string, data: Partial<Supplier>) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
    },

    // Soft-Delete (Architecture: flow:137)
    deleteSupplier: async (id: string) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, { 
            isActive: false, 
            updatedAt: serverTimestamp() 
        });
    },

    // Get All (Static)
    getSuppliers: async (branchId?: string) => {
        let q = query(
            collection(db, COLLECTION_NAME), 
            where('isActive', '!=', false),
            orderBy('isActive'),
            orderBy('razonSocial')
        );
        if (branchId) {
            q = query(q, where('branchId', '==', branchId));
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
    }
};
