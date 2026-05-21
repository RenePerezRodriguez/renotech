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
import { Category } from '@/types';

const COLLECTION_NAME = 'categorias';

export const CategoryService = {
    // Real-time subscription
    subscribeToCategories: (callback: (categories: Category[]) => void) => {
        const q = query(collection(db, COLLECTION_NAME), orderBy('nombre'));
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Category));
            callback(items);
        });
    },

    // Create
    createCategory: async (data: Partial<Category>) => {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            ...data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return { id: docRef.id, ...data };
    },

    // Update
    updateCategory: async (id: string, data: Partial<Category>) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
    },

    // Delete
    deleteCategory: async (id: string) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        await deleteDoc(docRef);
    },

    // Get All (Static)
    getCategories: async () => {
        const q = query(collection(db, COLLECTION_NAME), orderBy('nombre'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
    }
};
