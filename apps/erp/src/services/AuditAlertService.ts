import { db } from '@/lib/firebase';
import { 
    collection, 
    addDoc, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    updateDoc, 
    doc, 
    Timestamp, 
    serverTimestamp,
    getDocs,
    limit
} from 'firebase/firestore';
import { AuditAlert } from '@/types';

const COLLECTION_NAME = 'audit_alerts';

export const AuditAlertService = {
    // Create a new audit alert
    createAlert: async (alert: Omit<AuditAlert, 'id' | 'createdAt' | 'isRead'>) => {
        try {
            const docRef = await addDoc(collection(db, COLLECTION_NAME), {
                ...alert,
                isRead: false,
                createdAt: serverTimestamp()
            });
            return docRef.id;
        } catch (error) {
            console.error("Error creating audit alert:", error);
            return null;
        }
    },

    // Get alerts with optional filtering
    getAlerts: async (branchId?: string, onlyUnread: boolean = false) => {
        let q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'), limit(50));
        
        if (branchId && branchId !== 'ALL') {
            q = query(q, where('branchId', '==', branchId));
        }

        if (onlyUnread) {
            q = query(q, where('isRead', '==', false));
        }

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt instanceof Timestamp ? doc.data().createdAt.toDate() : new Date()
        })) as AuditAlert[];
    },

    // Real-time subscription for unread alerts (Manager Notification)
    subscribeToUnreadAlerts: (branchId: string | undefined, callback: (alerts: AuditAlert[]) => void) => {
        // Remove orderBy server-side to avoid index requirement and serverTimestamp null issues
        let q = query(
            collection(db, COLLECTION_NAME),
            where('isRead', '==', false)
        );

        if (branchId && branchId !== 'HQ' && branchId !== 'ALL') {
            q = query(q, where('branchId', '==', branchId));
        }

        return onSnapshot(q, (snapshot) => {
            const alerts = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date()
                } as AuditAlert;
            });

            // Sort manually in JS
            alerts.sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());

            callback(alerts);
        }, (error) => {
            console.error('[AuditAlertService] subscribeToUnreadAlerts error:', error);
            callback([]);
        });
    },

    // Mark alert as read
    markAsRead: async (alertId: string) => {
        const docRef = doc(db, COLLECTION_NAME, alertId);
        await updateDoc(docRef, { isRead: true });
    },

    // Mark all as read for a branch
    markAllAsRead: async (branchId: string) => {
        const unread = await AuditAlertService.getAlerts(branchId, true);
        const promises = unread.map(alert => AuditAlertService.markAsRead(alert.id));
        await Promise.all(promises);
    },

    // Resolver una alerta de discrepancia con nota (gerencia)
    resolveAlert: async (alertId: string, userId: string, userName: string, note: string) => {
        if (!note || note.trim().length < 5) throw new Error('Nota de resolución requerida (mínimo 5 caracteres)');
        const docRef = doc(db, COLLECTION_NAME, alertId);
        await updateDoc(docRef, {
            resolved: true,
            isRead: true,
            resolvedBy: userId,
            resolvedByName: userName,
            resolvedAt: serverTimestamp(),
            resolutionNote: note.trim(),
        });
    },

    // Suscripción a alertas TRANSFER_DISCREPANCY abiertas (no resueltas)
    subscribeOpenDiscrepancies: (callback: (alerts: AuditAlert[]) => void) => {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('type', '==', 'TRANSFER_DISCREPANCY'),
        );
        return onSnapshot(q, (snapshot) => {
            const alerts = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    ...data,
                    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
                } as AuditAlert;
            }).filter(a => !a.resolved);
            alerts.sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
            callback(alerts);
        }, err => {
            console.error('[AuditAlertService] subscribeOpenDiscrepancies error:', err);
            callback([]);
        });
    },

    /**
     * Suscripción genérica a alertas filtradas por tipos (in-memory) y status.
     * status: 'open' (no resueltas) | 'resolved' (resueltas) | 'all'
     */
    subscribeAlertsByTypes: (
        types: AuditAlert['type'][],
        opts: { status?: 'open' | 'resolved' | 'all'; branchId?: string; dateFrom?: Date; dateTo?: Date } | undefined,
        callback: (alerts: AuditAlert[]) => void,
    ) => {
        const status = opts?.status || 'all';
        const q = query(collection(db, COLLECTION_NAME));
        return onSnapshot(q, (snapshot) => {
            const fromMs = opts?.dateFrom ? opts.dateFrom.getTime() : -Infinity;
            const toMs = opts?.dateTo ? opts.dateTo.getTime() : Infinity;
            const alerts = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    ...data,
                    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
                } as AuditAlert;
            }).filter(a => {
                if (!types.includes(a.type)) return false;
                if (status === 'open' && a.resolved) return false;
                if (status === 'resolved' && !a.resolved) return false;
                if (opts?.branchId && a.branchId !== opts.branchId) return false;
                const ts = (a.createdAt as Date)?.getTime?.() ?? 0;
                if (ts < fromMs || ts > toMs) return false;
                return true;
            });
            alerts.sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
            callback(alerts);
        }, err => {
            console.error('[AuditAlertService] subscribeAlertsByTypes error:', err);
            callback([]);
        });
    },
};
