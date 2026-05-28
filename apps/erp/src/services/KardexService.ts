import { db } from '@/lib/firebase';
import {
    collection, query, where, getDocs, writeBatch,
} from 'firebase/firestore';
import { getMovementDelta } from '@/lib/inventory/movementTypes';

/**
 * Convierte un valor de Firestore (Timestamp | Date | string | number) a Date
 * para poder comparar cronológicamente.
 */
function toDate(v: unknown): Date {
    if (!v) return new Date(0);
    if (v instanceof Date) return v;
    if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
        return (v as { toDate: () => Date }).toDate();
    }
    return new Date(v as string | number);
}

export const KardexService = {
    /**
     * Recalcula el campo `currentStock` para todos los movimientos de
     * (masterId, branchId) cuya fecha sea >= fromDate, propagando el stock
     * acumulado en orden cronológico.
     *
     * Diseño: usa solo equality filter sobre masterId (sin compound index
     * adicional). El filtrado por branchId y por fecha se hace client-side.
     * Esto es aceptable porque los movimientos por producto son pocos
     * (decenas, no millones) y permite que el feature funcione sin desplegar
     * nuevos índices de Firestore.
     */
    async recalculateKardexFrom(
        masterId: string,
        branchId: string,
        fromDate: Date
    ): Promise<{ updated: number; movements: number }> {
        if (!masterId || !branchId) return { updated: 0, movements: 0 };

        // 1. Cargar todos los movimientos del masterId (sin orderBy).
        const allSnap = await getDocs(query(
            collection(db, 'movimientos'),
            where('masterId', '==', masterId)
        ));

        // 2. Filtrar por branchId y ordenar cronológicamente.
        type MovDoc = typeof allSnap.docs[number];
        const branchMovs: MovDoc[] = [];
        for (const d of allSnap.docs) {
            if (d.data().branchId === branchId) branchMovs.push(d);
        }
        branchMovs.sort((a, b) => {
            const ad = toDate(a.data().date).getTime();
            const bd = toDate(b.data().date).getTime();
            if (ad !== bd) return ad - bd;
            const ac = toDate(a.data().createdAt).getTime();
            const bc = toDate(b.data().createdAt).getTime();
            if (ac !== bc) return ac - bc;
            return a.id.localeCompare(b.id);
        });

        // 3. Caminar la cadena. El stock antes del primer movimiento >= fromDate
        //    es el currentStock del último movimiento < fromDate (anchor).
        const fromMs = fromDate.getTime();
        let runningStock = 0;
        let firstAffectedIdx = -1;
        for (let i = 0; i < branchMovs.length; i++) {
            const m = branchMovs[i].data();
            const movMs = toDate(m.date).getTime();
            if (movMs < fromMs) {
                runningStock = Number(m.currentStock ?? 0);
                continue;
            }
            firstAffectedIdx = i;
            break;
        }
        if (firstAffectedIdx === -1) return { updated: 0, movements: branchMovs.length };

        // 4. Walk forward desde el primer movimiento afectado y actualizar.
        const batch = writeBatch(db);
        let updated = 0;
        for (let i = firstAffectedIdx; i < branchMovs.length; i++) {
            const d = branchMovs[i];
            const m = d.data();
            const delta = getMovementDelta(String(m.type), Number(m.quantity) || 0);
            const previousStock = runningStock;
            runningStock += delta;
            if (Number(m.currentStock) !== runningStock || Number(m.previousStock) !== previousStock) {
                batch.update(d.ref, { currentStock: runningStock, previousStock });
                updated++;
            }
        }
        if (updated > 0) await batch.commit();
        return { updated, movements: branchMovs.length };
    },

    /**
     * Helper que ejecuta el recálculo para múltiples pares (masterId, branchId)
     * que comparten una misma fecha de corte. Útil cuando una venta retroactiva
     * toca varios productos a la vez.
     */
    async recalculateMany(
        pairs: Array<{ masterId: string; branchId: string }>,
        fromDate: Date
    ): Promise<{ totalUpdated: number; pairs: number }> {
        const unique = new Map<string, { masterId: string; branchId: string }>();
        for (const p of pairs) {
            if (!p.masterId || !p.branchId) continue;
            unique.set(`${p.masterId}|${p.branchId}`, p);
        }
        let totalUpdated = 0;
        for (const p of unique.values()) {
            const res = await this.recalculateKardexFrom(p.masterId, p.branchId, fromDate);
            totalUpdated += res.updated;
        }
        return { totalUpdated, pairs: unique.size };
    },
};
