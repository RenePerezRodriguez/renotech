import { db } from '@/lib/firebase';
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    orderBy,
    serverTimestamp,
    onSnapshot
} from 'firebase/firestore';
import { Brand } from '@/types';

const COLLECTION_NAME = 'marcas';

export const BrandService = {
    subscribeToBrands: (callback: (brands: Brand[]) => void) => {
        const q = query(collection(db, COLLECTION_NAME), orderBy('nombre'));
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            } as Brand));
            callback(items);
        });
    },

    createBrand: async (data: Partial<Brand>) => {
        const normalized = (data.nombre || '').trim().toUpperCase();
        if (!normalized) throw new Error('Nombre de marca requerido');
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            ...data,
            nombre: normalized,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return { id: docRef.id, ...data, nombre: normalized };
    },

    updateBrand: async (id: string, data: Partial<Brand>) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        const patch = { ...data, updatedAt: serverTimestamp() } as Partial<Brand> & { updatedAt: unknown };
        if (typeof data.nombre === 'string') patch.nombre = data.nombre.trim().toUpperCase();
        await updateDoc(docRef, patch);
    },

    deleteBrand: async (id: string) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        await deleteDoc(docRef);
    },

    getBrands: async () => {
        const q = query(collection(db, COLLECTION_NAME), orderBy('nombre'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Brand));
    },

    /**
     * Crea la marca solo si no existe (compara case-insensitive). Retorna true si la creó.
     */
    ensureBrand: async (name: string): Promise<boolean> => {
        const normalized = (name || '').trim().toUpperCase();
        if (!normalized) return false;
        const existing = await BrandService.getBrands();
        if (existing.some(b => (b.nombre || '').trim().toUpperCase() === normalized)) return false;
        await BrandService.createBrand({ nombre: normalized });
        return true;
    }
};
