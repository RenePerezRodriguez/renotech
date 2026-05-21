import { db } from '@/lib/firebase';
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    orderBy, 
    getDocs, 
    updateDoc, 
    doc, 
    serverTimestamp,
    Timestamp,
    limit
} from 'firebase/firestore';
import { ClientReminder } from '@/types';

const COLLECTION_NAME = 'recordatorios_cliente';

export const ReminderService = {
    // Create Reminder
    createReminder: async (reminder: Omit<ClientReminder, 'id' | 'createdAt'>) => {
        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            ...reminder,
            status: 'PENDING',
            createdAt: serverTimestamp()
        });
        return docRef.id;
    },

    // Get Upcoming Reminders for a Branch
    getUpcomingReminders: async (branchId: string, daysForward: number = 7) => {
        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + daysForward);

        let q = query(
            collection(db, COLLECTION_NAME),
            where('status', '==', 'PENDING'),
            where('scheduledDate', '>=', Timestamp.fromDate(today)),
            where('scheduledDate', '<=', Timestamp.fromDate(futureDate)),
            orderBy('scheduledDate', 'asc'),
            limit(50)
        );

        if (branchId !== 'ALL') {
            q = query(q, where('branchId', '==', branchId));
        }

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            scheduledDate: doc.data().scheduledDate instanceof Timestamp ? doc.data().scheduledDate.toDate() : doc.data().scheduledDate
        })) as ClientReminder[];
    },

    // Get All Reminders for a Client
    getClientReminders: async (clientId: string) => {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('clientId', '==', clientId),
            orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientReminder));
    },

    // Complete Reminder
    completeReminder: async (id: string, notes?: string) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, {
            status: 'COMPLETED',
            notes: notes || '',
            updatedAt: serverTimestamp()
        });
    },

    // Cancel Reminder
    cancelReminder: async (id: string) => {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, {
            status: 'CANCELLED',
            updatedAt: serverTimestamp()
        });
    }
};
