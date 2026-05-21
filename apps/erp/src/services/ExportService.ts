import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const ExportService = {
    /**
     * Motor de Backup General (Disaster Recovery)
     * Exporta las colecciones maestras a un archivo JSON consolidado.
     * Architecture: infrastructure_and_security.md L53
     */
    async generateFullSystemBackup() {
        try {
            const collections = ['catalogo_maestro', 'productos', 'clientes', 'ventas', 'usuarios', 'sucursales', 'config'];
            const backupData: Record<string, unknown[]> = {};

            for (const colName of collections) {
                const snapshot = await getDocs(collection(db, colName));
                backupData[colName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `backup_renotech_${timestamp}.json`;
            const jsonString = JSON.stringify(backupData, null, 2);
            
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            return true;
        } catch (error) {
            console.error('[ExportService] Error generating backup:', error);
            throw new Error('Error al generar el respaldo del sistema.');
        }
    }
};
