/**
 * SalesReportService — Reportes de Ventas por Periodo
 *
 * Calcula métricas agregadas sobre la colección `ventas` filtrando
 * por sucursal (opcional) y rango de fechas. Agrupa por día, semana o mes.
 * Incluye paginación, ordenación, búsqueda, exportación CSV y margen de utilidad.
 */

import { db } from '@/lib/firebase';
import {
    collection,
    query,
    where,
    getDocs,
    orderBy,
    Timestamp
} from 'firebase/firestore';
import { Sale, SaleItem } from '@/types';

const SALES_COLLECTION = 'ventas';

// ── Client-side TTL cache (evita refetch al navegar entre módulos) ─────────────
const _cache = new Map<string, { data: PeriodSalesReport; ts: number }>();
const CACHE_TTL = 60_000; // 60 segundos

export interface PeriodSale {
    periodo: string;       // label: '2026-05-12' | 'S18' | 'ene 26'
    sortKey: string;       // ordenable: '2026-05-12' | '2026-18' | '2026-01'
    ventas: number;        // número de ventas
    ingresoBruto: number;
    devoluciones: number;
    ingresoNeto: number;
    ticketPromedio: number;
    totalCosto: number;    // suma de costAtSale * qty por ítem no anulado
    margenUtilidad: number; // (ingresoNeto - totalCosto) / ingresoNeto * 100
}

export interface PeriodSalesReport {
    resumen: {
        ventas: number;
        ingresoNeto: number;
        ticketPromedio: number;
        devoluciones: number;
        variacion: number | null; // vs periodo anterior
        totalCosto: number;
        margenUtilidad: number;
    };
    paginacion: {
        page: number;
        perPage: number;
        total: number;
        pages: number;
    };
    periodos: PeriodSale[];
}

type Granularidad = 'dia' | 'semana' | 'mes';

function getWeekSortKey(date: Date): string {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayNum = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - dayNum);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function formatPeriodo(date: Date, gran: Granularidad): { periodo: string; sortKey: string } {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    if (gran === 'dia') {
        const label = `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
        const sortKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        return { periodo: label, sortKey };
    }
    if (gran === 'semana') {
        const sortKey = getWeekSortKey(date);
        return { periodo: sortKey, sortKey };
    }
    const label = date.toLocaleString('es-BO', { month: 'short', year: '2-digit' });
    const sortKey = `${y}-${String(m + 1).padStart(2, '0')}`;
    return { periodo: label, sortKey };
}

function subtractPeriod(date: Date, gran: Granularidad): Date {
    const d = new Date(date);
    if (gran === 'dia') d.setDate(d.getDate() - 1);
    else if (gran === 'semana') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    return d;
}

function computeItemCosto(item: SaleItem): number {
    if (item.isVoided) return 0;
    return item.quantity * (item.costAtSale || 0);
}

export const SalesReportService = {
    async report(
        branchId: string | undefined,
        desde: Date,
        hasta: Date,
        gran: Granularidad = 'dia',
        page: number = 1,
        perPage: number = 25,
        orderByStr: string = 'periodo_asc',
        search: string = ''
    ): Promise<PeriodSalesReport> {
        const cacheKey = JSON.stringify([branchId, desde.toISOString(), hasta.toISOString(), gran, orderByStr, search]);
        const cached = _cache.get(cacheKey);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
            // Re-paginate from cached full result
            const full = cached.data;
            let periodos = full.periodos;
            if (search) {
                const s = search.toLowerCase();
                periodos = periodos.filter(p => p.periodo.toLowerCase().includes(s));
            }
            const pages = perPage === 0 ? 1 : Math.max(1, Math.ceil(periodos.length / perPage));
            const paginated = perPage === 0 ? periodos : periodos.slice((page - 1) * perPage, page * perPage);
            return { ...full, periodos: paginated, paginacion: { page, perPage, total: periodos.length, pages } };
        }

        const startTs = Timestamp.fromDate(desde);
        const endTs = Timestamp.fromDate(hasta);

        const constraints: any[] = [
            where('fecha', '>=', startTs),
            where('fecha', '<=', endTs),
            orderBy('fecha', 'desc')
        ];
        if (branchId) constraints.unshift(where('branchId', '==', branchId));

        const q = query(collection(db, SALES_COLLECTION), ...constraints);
        const snap = await getDocs(q);

        const ventasMap = new Map<string, PeriodSale>();

        let totalVentas = 0;
        let totalIngresoNeto = 0;
        let totalDevoluciones = 0;
        let totalCostoGlobal = 0;

        for (const docSnap of snap.docs) {
            const sale = { id: docSnap.id, ...docSnap.data() } as Sale;
            if (!sale.fecha) continue;
            const d = sale.fecha instanceof Timestamp ? sale.fecha.toDate() : new Date(sale.fecha as any);
            const { periodo, sortKey } = formatPeriodo(d, gran);

            const items = sale.items || [];
            const devolucion = sale.status === 'VOIDED' ? (sale.total || 0) : 0;
            const costoVenta = sale.status !== 'VOIDED'
                ? items.reduce((s, it) => s + computeItemCosto(it), 0)
                : 0;

            const entry = ventasMap.get(sortKey) || {
                periodo,
                sortKey,
                ventas: 0,
                ingresoBruto: 0,
                devoluciones: 0,
                ingresoNeto: 0,
                ticketPromedio: 0,
                totalCosto: 0,
                margenUtilidad: 0,
            };

            entry.ventas += 1;
            entry.ingresoBruto += sale.total || 0;
            entry.devoluciones += devolucion;
            entry.ingresoNeto += sale.status === 'VOIDED' ? 0 : (sale.total || 0);
            entry.totalCosto += costoVenta;
            ventasMap.set(sortKey, entry);

            totalVentas += 1;
            totalIngresoNeto += sale.status === 'VOIDED' ? 0 : (sale.total || 0);
            totalDevoluciones += devolucion;
            totalCostoGlobal += costoVenta;
        }

        for (const entry of ventasMap.values()) {
            entry.ticketPromedio = entry.ventas > 0 ? entry.ingresoNeto / entry.ventas : 0;
            entry.margenUtilidad = entry.ingresoNeto > 0
                ? ((entry.ingresoNeto - entry.totalCosto) / entry.ingresoNeto) * 100
                : 0;
        }

        let periodos = Array.from(ventasMap.values());
        periodos.sort((a, b) => {
            switch (orderByStr) {
                case 'periodo_desc':          return b.sortKey.localeCompare(a.sortKey);
                case 'ingreso_neto_desc':     return b.ingresoNeto - a.ingresoNeto;
                case 'ingreso_neto_asc':      return a.ingresoNeto - b.ingresoNeto;
                case 'n_ventas_desc':         return b.ventas - a.ventas;
                case 'ticket_promedio_desc':  return b.ticketPromedio - a.ticketPromedio;
                case 'margen_desc':           return b.margenUtilidad - a.margenUtilidad;
                case 'periodo_asc':
                default:                      return a.sortKey.localeCompare(b.sortKey);
            }
        });

        // Variación vs periodo anterior
        const periodoAnteriorDesde = subtractPeriod(desde, gran);
        const periodoAnteriorHasta = subtractPeriod(hasta, gran);
        let variacion: number | null = null;
        if (gran === 'dia' || gran === 'mes') {
            const prevConstraints: any[] = [
                where('fecha', '>=', Timestamp.fromDate(periodoAnteriorDesde)),
                where('fecha', '<=', Timestamp.fromDate(periodoAnteriorHasta)),
                ...(branchId ? [where('branchId', '==', branchId)] : [])
            ];
            const prevSnap = await getDocs(query(collection(db, SALES_COLLECTION), ...prevConstraints));
            let prevTotal = 0;
            prevSnap.forEach(d => {
                const s = d.data();
                if (s.status !== 'VOIDED') prevTotal += s.total || 0;
            });
            variacion = prevTotal > 0 ? (totalIngresoNeto - prevTotal) / prevTotal * 100 : null;
        }

        const margenUtilidad = totalIngresoNeto > 0
            ? ((totalIngresoNeto - totalCostoGlobal) / totalIngresoNeto) * 100
            : 0;

        const fullResult: PeriodSalesReport = {
            resumen: {
                ventas: totalVentas,
                ingresoNeto: totalIngresoNeto,
                ticketPromedio: totalVentas > 0 ? totalIngresoNeto / totalVentas : 0,
                devoluciones: totalDevoluciones,
                variacion,
                totalCosto: totalCostoGlobal,
                margenUtilidad,
            },
            paginacion: { page: 1, perPage: 0, total: periodos.length, pages: 1 },
            periodos,
        };

        // Guardar en cache (sin paginación — se re-pagina al servir)
        _cache.set(cacheKey, { data: fullResult, ts: Date.now() });

        const pages = perPage === 0 ? 1 : Math.max(1, Math.ceil(periodos.length / perPage));
        const paginated = perPage === 0 ? periodos : periodos.slice((page - 1) * perPage, page * perPage);

        if (search) {
            const s = search.toLowerCase();
            const filtered = periodos.filter(p => p.periodo.toLowerCase().includes(s));
            const fp = perPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / perPage));
            return {
                ...fullResult,
                periodos: perPage === 0 ? filtered : filtered.slice((page - 1) * perPage, page * perPage),
                paginacion: { page, perPage, total: filtered.length, pages: fp },
            };
        }

        return {
            ...fullResult,
            periodos: paginated,
            paginacion: { page, perPage, total: periodos.length, pages },
        };
    },

    async export(branchId: string | undefined, desde: Date, hasta: Date, gran: Granularidad = 'dia'): Promise<PeriodSale[]> {
        const result = await this.report(branchId, desde, hasta, gran, 1, 0, 'periodo_asc', '');
        return result.periodos;
    },

    /** Invalida la cache (útil tras una venta nueva). */
    clearCache() { _cache.clear(); },
};
