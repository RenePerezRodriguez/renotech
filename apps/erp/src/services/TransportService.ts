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
import { Transport } from '@/types';

const COLLECTION_NAME = 'transportes';

export const TransportService = {
    subscribeToTransports: (callback: (transports: Transport[]) => void, _branchId?: string) => {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('isActive', '!=', false),
            orderBy('isActive'),
            orderBy('razonSocial')
        );
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Transport));
            callback(items);
        });
    },

    createTransport: async (transport: Omit<Transport, 'id'>, branchId?: string) => {
        const data: Record<string, unknown> = {
            ...transport,
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        if (branchId) data.branchId = branchId;
        const docRef = await addDoc(collection(db, COLLECTION_NAME), data);
        return docRef.id;
    },

    updateTransport: async (id: string, data: Partial<Transport>) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
    },

    deleteTransport: async (id: string) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, {
            isActive: false,
            updatedAt: serverTimestamp()
        });
    },

    getTransports: async (_branchId?: string) => {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('isActive', '!=', false),
            orderBy('isActive'),
            orderBy('razonSocial')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transport));
    }
};
