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
import { Origin } from '@/types';

const COLLECTION_NAME = 'origenes';

export const OriginService = {
    subscribeToOrigins: (callback: (origins: Origin[]) => void) => {
        const q = query(collection(db, COLLECTION_NAME), orderBy('nombre'));
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            } as Origin));
            callback(items);
        });
    },

    createOrigin: async (data: Partial<Origin>) => {
        const normalized = (data.nombre || '').trim().toUpperCase();
        if (!normalized) throw new Error('Nombre de origen requerido');
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            ...data,
            nombre: normalized,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return { id: docRef.id, ...data, nombre: normalized };
    },

    updateOrigin: async (id: string, data: Partial<Origin>) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        const patch = { ...data, updatedAt: serverTimestamp() } as Partial<Origin> & { updatedAt: unknown };
        if (typeof data.nombre === 'string') patch.nombre = data.nombre.trim().toUpperCase();
        await updateDoc(docRef, patch);
    },

    deleteOrigin: async (id: string) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        await deleteDoc(docRef);
    },

    getOrigins: async () => {
        const q = query(collection(db, COLLECTION_NAME), orderBy('nombre'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Origin));
    },

    /**
     * Crea el origen solo si no existe (compara case-insensitive). Retorna true si lo creó.
     */
    ensureOrigin: async (name: string): Promise<boolean> => {
        const normalized = (name || '').trim().toUpperCase();
        if (!normalized) return false;
        const existing = await OriginService.getOrigins();
        if (existing.some(o => (o.nombre || '').trim().toUpperCase() === normalized)) return false;
        await OriginService.createOrigin({ nombre: normalized });
        return true;
    }
};
