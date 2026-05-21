
import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export async function logAdminAction(adminId: string, adminEmail: string, action: string, targetUid: string, branchId: string, details?: string) {
    try {
        await addDoc(collection(db, 'admin_logs'), {
            adminId,
            adminEmail,
            action, // e.g., 'RESET_PASSWORD', 'TOGGLE_STATUS', 'CHANGE_ROLE'
            targetUid,
            branchId,
            details: details || '',
            timestamp: serverTimestamp()
        });
    } catch (error) {
        const err = error as { code?: string; message?: string };
        const message = err.message || '';

        // Ignore duplicate document errors that can occur during retries or repeated audit attempts.
        if (err.code === 'already-exists' || /already exists/i.test(message)) {
            return;
        }

        console.error("Error logging admin action:", error);
    }
}
