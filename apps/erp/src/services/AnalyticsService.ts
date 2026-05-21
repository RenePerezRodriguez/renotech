import { db } from '@/lib/firebase';
import { startOfDay, endOfDay } from '@/lib/utils';
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    setDoc, 
    Timestamp, 
    serverTimestamp 
} from 'firebase/firestore';
import { SaleService } from './SaleService';
import { throwStandardError } from '@/utils/errorCodes';
import { writeBatch } from 'firebase/firestore';

const RESUMENES_COLLECTION = 'resumenes_diarios';

export const AnalyticsService = {
    /**
     * Cierre de Día (Architecture: data_flow.md L116)
     * Genera un snapshot de ventas, costos y margen neto.
     */
    generateDailySummary: async (branchId: string, dateStr: string): Promise<void> => {
        try {
            // 1. Get all sales for the day
            const start = startOfDay(dateStr);
            const end = endOfDay(dateStr);

            const q = query(
                collection(db, 'ventas'),
                where('branchId', '==', branchId),
                where('status', '==', 'COMPLETED'),
                where('fecha', '>=', Timestamp.fromDate(start)),
                where('fecha', '<=', Timestamp.fromDate(end))
            );

            const salesSnap = await getDocs(q);
            let totalRevenue = 0;
            let totalCost = 0;
            const saleCount = salesSnap.size;

            const productPerformance: Record<string, { name: string, qty: number }> = {};

            // 2. Aggregate Revenue and Historical Cost (from SaleItem.costAtSale)
            for (const saleDoc of salesSnap.docs) {
                const saleData = saleDoc.data();
                totalRevenue += saleData.total || 0;

                // Load items to get historical cost and performance
                const items = await SaleService.getSaleItems(saleDoc.id);
                items.forEach(item => {
                    totalCost += (item.costAtSale || 0) * item.quantity;
                    
                    // Track top products
                    if (!productPerformance[item.productId]) {
                        productPerformance[item.productId] = { name: item.productName, qty: 0 };
                    }
                    productPerformance[item.productId].qty += item.quantity;
                });
            }

            // Calculate Top 5 Products
            const topProducts = Object.entries(productPerformance)
                .map(([masterId, data]) => ({ masterId, ...data }))
                .sort((a, b) => b.qty - a.qty)
                .slice(0, 5);

            const avgTicket = saleCount > 0 ? Number((totalRevenue / saleCount).toFixed(2)) : 0;

            // 3. Persist Summary
            const docId = `${dateStr}_${branchId}`;
            const summaryRef = doc(db, RESUMENES_COLLECTION, docId);
            
            await setDoc(summaryRef, {
                date: dateStr,
                branchId,
                totalRevenue: Number(totalRevenue.toFixed(2)),
                totalCost: Number(totalCost.toFixed(2)),
                totalMargin: Number((totalRevenue - totalCost).toFixed(2)),
                saleCount,
                avgTicket,
                topProducts,
                updatedAt: serverTimestamp()
            });

            console.log(`[AnalyticsService] Summary generated for ${dateStr} - Branch: ${branchId}`);
        } catch (e) {
            console.error("Error generating daily summary:", e);
            throwStandardError('SYS_TRANSACTION_FAILED', 'No se pudo generar el cierre de día.');
        }
    },

    /**
     * Motor de Inteligencia ABC Global (National Master)
     * Clasifica los productos por rotación a NIVEL NACIONAL.
     * Frecuencia Recomendada: Semanal o Mensual.
     */
    recalculateGlobalABC: async (): Promise<void> => {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            // 1. Get all sales movements globally
            const q = query(
                collection(db, 'movimientos'),
                where('type', '==', 'VENTA'),
                where('date', '>=', Timestamp.fromDate(thirtyDaysAgo))
            );
            
            const snapshot = await getDocs(q);
            const rotationMap: Record<string, number> = {};

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const masterId = data.masterId;
                if (masterId) {
                    rotationMap[masterId] = (rotationMap[masterId] || 0) + Math.abs(data.quantity);
                }
            });

            // 2. Sort masters by rotation
            const sortedMasters = Object.entries(rotationMap)
                .sort(([, a], [, b]) => b - a);

            const totalCount = sortedMasters.length;
            if (totalCount === 0) return;

            // 3. Batch Update ABC Classes in Master Catalog
            const batch = writeBatch(db);
            
            sortedMasters.forEach(([masterId], index) => {
                const percentile = (index + 1) / totalCount;
                let abcClass: 'A' | 'B' | 'C' = 'C';
                if (percentile <= 0.2) abcClass = 'A';
                else if (percentile <= 0.5) abcClass = 'B';

                const mRef = doc(db, 'catalogo_maestro', masterId);
                batch.update(mRef, { abcClassGlobal: abcClass, updatedAt: serverTimestamp() });
            });

            await batch.commit();
            console.log(`[AnalyticsService] Global ABC Recalculation Complete for ${totalCount} masters.`);
        } catch (error) {
            console.error("Error in recalculateGlobalABC:", error);
            throwStandardError('SYS_TRANSACTION_FAILED', 'No se pudieron cargar las estadísticas. Intenta nuevamente.');
        }
    }
};
