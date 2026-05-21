import { auth } from '@/lib/firebase';

/**
 * MaintenanceService - Critical Data Purge Utilities
 * DANGER: This service contains destructive operations.
 * Uses server-side API route with firebase-admin to bypass Firestore security rules.
 */
export const MaintenanceService = {
    /**
     * Purges specific operational collections via server-side API.
     * Requires GERENTE role from HQ branch.
     * 
     * @param onProgress - Callback for UI status reports
     */
    purgeDatabase: async (onProgress?: (message: string) => void) => {
        if (onProgress) onProgress('Iniciando purga server-side...');

        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('No autenticado');

        const response = await fetch('/api/admin/purge', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error en la purga');
        }

        // Report individual collection results
        if (data.results && onProgress) {
            for (const r of data.results) {
                if (r.status === 'deleted') {
                    onProgress(`✓ ${r.collection} purgada`);
                } else if (r.status === 'empty') {
                    onProgress(`○ ${r.collection} vacía`);
                } else {
                    onProgress(`⚠️ ${r.collection}: ${r.status}`);
                }
            }
        }

        if (onProgress) onProgress('Base de Datos reseteada con éxito.');
    },
};
