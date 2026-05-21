import { db } from '@/lib/firebase';
import {
    collection,
    query,
    where,
    getDocs,
    Timestamp
} from 'firebase/firestore';
import { Sale } from '@/types';
import { ensureDate } from '@/utils/dateHelpers';

export interface TopProduct {
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
}

export interface TopClient {
    clientId: string;
    razonSocial: string;
    totalSpent: number;
    saleCount: number;
}

export interface MonthlyRevenue {
    month: string;
    revenue: number;
    saleCount: number;
}

export interface DashboardStats {
    totalRevenue: number;
    saleCount: number;
    topProducts: TopProduct[];
    topClients: TopClient[];
    monthlyRevenue: MonthlyRevenue[];
}

const SALES_COLLECTION = 'ventas';

export const StatisticsService = {
    /**
     * Get statistics for a specific branch or consolidated
     */
    async getDashboardStats(branchId?: string, startDate?: Date, endDate?: Date): Promise<DashboardStats> {
        let q = query(collection(db, SALES_COLLECTION), where('status', '==', 'COMPLETED'));

        if (branchId) {
            q = query(q, where('branchId', '==', branchId));
        }

        if (startDate) {
            q = query(q, where('fecha', '>=', Timestamp.fromDate(startDate)));
        }

        if (endDate) {
            q = query(q, where('fecha', '<=', Timestamp.fromDate(endDate)));
        }

        const snapshot = await getDocs(q);
        const sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));

        const productMap = new Map<string, TopProduct>();
        const clientMap = new Map<string, TopClient>();
        const monthlyMap = new Map<string, { key: string, month: string, revenue: number, saleCount: number }>();
        let totalRevenue = 0;

        sales.forEach(sale => {
            // FIX: Calculate NET revenue per sale (subtracting voided items)
            const netSaleTotal = (sale.items || [])
                .filter(item => !item.isVoided)
                .reduce((sum, item) => sum + (item.subtotal ?? 0), 0);
            
            totalRevenue += netSaleTotal;

            // Monthly breakdown
            const date = ensureDate(sale.fecha);
            const monthLabel = date.toLocaleString('es-BO', { month: 'short', year: '2-digit', timeZone: 'America/La_Paz' });
            const sortKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

            const monthData = monthlyMap.get(sortKey) || { key: sortKey, month: monthLabel, revenue: 0, saleCount: 0 };
            monthData.revenue += netSaleTotal;
            monthData.saleCount += 1;
            monthlyMap.set(sortKey, monthData);

            // Top Clients
            if (sale.cliente && sale.cliente.id) {
                const clientData = clientMap.get(sale.cliente.id) || {
                    clientId: sale.cliente.id,
                    razonSocial: sale.cliente.razonSocial,
                    totalSpent: 0,
                    saleCount: 0
                };
                clientData.totalSpent += netSaleTotal;
                clientData.saleCount += 1;
                clientMap.set(sale.cliente.id, clientData);
            }

            // Top Products
            (sale.items || []).forEach(item => {
                if (item.isVoided) return; // FIX: Skip voided items in statistics
                
                const productData = productMap.get(item.productId) || {
                    productId: item.productId,
                    productName: item.productName,
                    quantity: 0,
                    revenue: 0
                };
                productData.quantity += (item.quantity ?? 0);
                productData.revenue += (item.subtotal ?? 0);
                productMap.set(item.productId, productData);
            });
        });

        const topProducts = Array.from(productMap.values())
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);

        const topClients = Array.from(clientMap.values())
            .sort((a, b) => b.totalSpent - a.totalSpent)
            .slice(0, 5);

        const monthlyRevenue = Array.from(monthlyMap.values())
            .sort((a, b) => a.key.localeCompare(b.key))
            .map(({ month, revenue, saleCount }) => ({ month, revenue, saleCount }));

        return {
            totalRevenue,
            saleCount: sales.length,
            topProducts,
            topClients,
            monthlyRevenue
        };
    }
};
