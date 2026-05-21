/**
 * RotationService — Rotación de Inventario (FIFO sell-through)
 *
 * Implementa el modelo de "Rotación de Compras" del sistema lacasavolvo:
 *   - Cada unidad vendida se atribuye a la compra más antigua con stock del mismo producto.
 *   - Se calcula % rotación = unidades_vendidas / unidades_compradas * 100.
 *   - Semáforo: >=70% verde, 30-69% amarillo, <30% rojo.
 *
 * Colecciones leídas: compras, compras/{id}/items, ventas, movimientos (ENTRADA, TRASP_ENTRADA)
 *
 * Nota: a diferencia de lacasavolvo donde las devoluciones tienen tabla separada,
 * aquí las devoluciones se modelan como movimientos tipo GARANTIA_ENTRADA (retorno al stock)
 * o ventas VOIDED. Las ventas VOIDED se ignoran en el cálculo.
 */

import { db } from '@/lib/firebase';
import {
    collection,
    query,
    where,
    getDocs,
    orderBy,
    Timestamp,
    documentId,
} from 'firebase/firestore';
import { Purchase, Sale, InventoryMovement } from '@/types';
import { BranchService } from './BranchService';

// ─── Tipos ────────────────────────────────────────────────────

export interface RotacionCompra {
    compraId: string;
    fecha: string;            // YYYY-MM-DD
    sucursal: string;
    proveedor: string;
    items: number;
    unidadesCompradas: number;
    unidadesVendidas: number;
    rotacion: number;         // porcentaje
    semaforo: 'verde' | 'amarillo' | 'rojo';
    costoTotal: number;
    costoVendido: number;
    utilidad: number;
    diasTranscurridos: number;
}

export interface RotacionItem {
    productId: string;
    codigo: string;
    descripcion: string;
    marca: string;
    cantidad: number;
    costo: number;
    vendidos: number;
    rotacion: number;
    semaforo: 'verde' | 'amarillo' | 'rojo';
}

export interface RotacionResumen {
    comprasAnalizadas: number;
    inversionTotal: number;
    rotacionPromedio: number; // ponderado por costo
    utilidadRealizada: number;
    comprasEstancadas: number; // rotación < 30%
}

export interface RotacionReport {
    resumen: RotacionResumen;
    paginacion: { page: number; perPage: number; total: number; pages: number };
    compras: RotacionCompra[];
}

// ─── Constantes ───────────────────────────────────────────────

const ROTACION_VERDE = 70;
const ROTACION_AMARILLO = 30;

function semaforo(rot: number): 'verde' | 'amarillo' | 'rojo' {
    if (rot >= ROTACION_VERDE) return 'verde';
    if (rot >= ROTACION_AMARILLO) return 'amarillo';
    return 'rojo';
}

/** Exportado para tests unitarios. */
export const __testables = { semaforo, ROTACION_VERDE, ROTACION_AMARILLO };

// ─── FIFO Engine ──────────────────────────────────────────────

interface Lote {
    compraId: string;
    fecha: string;
    sucursalCompra: string;
    cantDisp: number;
    costo: number;
}

export type { Lote };

interface CompraBucket {
    productos: Record<string, { cantidad: number; costo: number; vendidos: number; costoVendido: number; utilidad: number }>;
    unidadesCompradas: number;
    costoTotal: number;
}

/**
 * Consume `cantidad` unidades del producto en `colas` aplicando FIFO.
 * Mutates `colas` in place. Exportado para tests.
 */
export function consumirLotes(colas: Map<string, Lote[]>, productoId: string, cantidad: number) {
    const lote = colas.get(productoId);
    if (!lote) return;
    let restante = cantidad;
    while (restante > 0 && lote.length > 0) {
        const usar = Math.min(restante, lote[0].cantDisp);
        lote[0].cantDisp -= usar;
        restante -= usar;
        if (lote[0].cantDisp <= 0) lote.shift();
    }
    if (lote.length === 0) colas.delete(productoId);
}

// ─── Helpers internos ─────────────────────────────────────────

/**
 * Lee items de N compras en paralelo (elimina el N+1 secuencial).
 */
async function fetchItemsBatch(compraIds: string[]): Promise<Map<string, any[]>> {
    const result = new Map<string, any[]>();
    const chunks: string[][] = [];
    const SIZE = 10;
    for (let i = 0; i < compraIds.length; i += SIZE) chunks.push(compraIds.slice(i, i + SIZE));
    for (const chunk of chunks) {
        const snaps = await Promise.all(
            chunk.map(id => getDocs(collection(db, `compras/${id}/items`)))
        );
        chunk.forEach((id, idx) => {
            result.set(id, snaps[idx].docs.map(d => d.data()));
        });
    }
    return result;
}

/**
 * Lee compras RECEIVED hasta `corteTs`, opcionalmente filtradas por sucursal,
 * y retorna sus docs con items pre-cargados.
 */
async function fetchComprasParaFifo(
    branchId: string | undefined,
    corteTs: Timestamp,
    productoIdsFiltro: Set<string>
): Promise<Array<{ id: string; date: Timestamp; branchId: string; items: any[] }>> {
    const constraints: any[] = [
        where('status', '==', 'RECEIVED'),
        where('date', '<=', corteTs),
        orderBy('date'),
    ];
    if (branchId) constraints.unshift(where('branchId', '==', branchId));
    const snap = await getDocs(query(collection(db, 'compras'), ...constraints));
    const docs = snap.docs.map(d => ({
        id: d.id,
        date: d.data().date as Timestamp,
        branchId: (d.data().branchId as string) || '',
    }));
    const itemsMap = await fetchItemsBatch(docs.map(d => d.id));
    return docs.map(d => ({
        ...d,
        items: (itemsMap.get(d.id) || []).filter(it => it.productId && productoIdsFiltro.has(it.productId)),
    }));
}

export const RotationService = {
    /**
     * Reporte de rotación de compras con FIFO y paginación.
     *
     * @param branchId    undefined = consolidado (filtrar compras por sucursal)
     * @param desde       inicio rango FECHA DE COMPRA
     * @param hasta       fin rango FECHA DE COMPRA
     * @param fechaCorte  hasta cuándo contar ventas (default: hoy)
     * @param page        1-based
     * @param perPage     0 = todos
     * @param orderBy     'rotacion_asc' | 'rotacion_desc' | 'fecha_asc' | 'fecha_desc' | 'costo_desc' | 'utilidad_desc'
     */
    async report(
        branchId: string | undefined,
        desde: Date,
        hasta: Date,
        fechaCorte: Date = new Date(),
        page: number = 1,
        perPage: number = 25,
        orderByStr: string = 'rotacion_asc'
    ): Promise<RotacionReport> {
        const desdeTs = Timestamp.fromDate(desde);
        const hastaTs = Timestamp.fromDate(hasta);
        const corteTs = Timestamp.fromDate(fechaCorte);

        // 1) Query compras del rango (RECEIVED = estado válido en este sistema)
        const comprasConstraints: any[] = [
            where('date', '>=', desdeTs),
            where('date', '<=', hastaTs),
            where('status', '==', 'RECEIVED'),
            orderBy('date'),
        ];
        if (branchId) comprasConstraints.unshift(where('branchId', '==', branchId));

        const comprasSnap = await getDocs(query(collection(db, 'compras'), ...comprasConstraints));
        const comprasDocs = comprasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Purchase & { id: string }));

        if (comprasDocs.length === 0) {
            return {
                resumen: { comprasAnalizadas: 0, inversionTotal: 0, rotacionPromedio: 0, utilidadRealizada: 0, comprasEstancadas: 0 },
                paginacion: { page: 1, perPage, total: 0, pages: 0 },
                compras: [],
            };
        }

        const compraIds = comprasDocs.map(c => c.id);

        // Resolver nombres de sucursal
        const branches = await BranchService.getAll();
        const branchNameMap = new Map(branches.map(b => [b.id, b.name]));

        // 2) Subitems de esas compras (paralelo)
        const itemsPorCompra = await fetchItemsBatch(compraIds);

        const compraData = new Map<string, CompraBucket>();
        const productosUniversales = new Set<string>();

        for (const cId of compraIds) {
            const items = itemsPorCompra.get(cId) || [];
            const bucket: CompraBucket = { productos: {}, unidadesCompradas: 0, costoTotal: 0 };
            for (const it of items) {
                const pid = it.productId as string;
                const cant = (it.quantity || it.qtyPedida || 0) as number;
                const costo = (it.costo || it.unitCost || 0) as number;
                if (!pid || cant <= 0) continue;

                if (!bucket.productos[pid]) bucket.productos[pid] = { cantidad: 0, costo, vendidos: 0, costoVendido: 0, utilidad: 0 };
                bucket.productos[pid].cantidad += cant;
                bucket.unidadesCompradas += cant;
                bucket.costoTotal += cant * costo;
                productosUniversales.add(pid);
            }
            compraData.set(cId, bucket);
        }

        if (productosUniversales.size === 0) {
            return {
                resumen: { comprasAnalizadas: 0, inversionTotal: 0, rotacionPromedio: 0, utilidadRealizada: 0, comprasEstancadas: 0 },
                paginacion: { page: 1, perPage, total: 0, pages: 0 },
                compras: [],
            };
        }

        // 3) Construir cola FIFO: compras RECEIVED hasta corte
        //    FILTRADO POR SUCURSAL para evitar consumir lotes de otra branch
        const colas = new Map<string, Lote[]>();
        const comprasFifo = await fetchComprasParaFifo(branchId, corteTs, productosUniversales);

        for (const c of comprasFifo) {
            const cDate = c.date.toDate().toISOString().slice(0, 10);
            for (const it of c.items) {
                const pid = it.productId as string;
                const cant = (it.quantity || it.qtyPedida || 0) as number;
                const costo = (it.costo || it.unitCost || 0) as number;
                if (cant <= 0) continue;
                if (!colas.has(pid)) colas.set(pid, []);
                colas.get(pid)!.push({ compraId: c.id, fecha: cDate, sucursalCompra: c.branchId, cantDisp: cant, costo });
            }
        }

        // 3b) Descontar devoluciones a proveedor (GARANTIA_SALIDA)
        const devConstraints: any[] = [
            where('type', '==', 'GARANTIA_SALIDA'),
            where('date', '<=', corteTs),
        ];
        if (branchId) devConstraints.unshift(where('branchId', '==', branchId));
        const devComprasSnap = await getDocs(query(collection(db, 'movimientos'), ...devConstraints));
        for (const mDoc of devComprasSnap.docs) {
            const m = mDoc.data() as InventoryMovement;
            if (!m.productId) continue;
            consumirLotes(colas, m.productId, Math.abs(m.quantity || 0));
        }

        // 4) Procesar VENTAS COMPLETED (saltar VOIDED enteras), filtradas por sucursal
        const ventasConstraints: any[] = [
            where('status', '==', 'COMPLETED'),
            where('fecha', '<=', corteTs),
            orderBy('fecha'),
        ];
        if (branchId) ventasConstraints.unshift(where('branchId', '==', branchId));
        const ventasSnap = await getDocs(query(collection(db, 'ventas'), ...ventasConstraints));

        for (const vDoc of ventasSnap.docs) {
            const sale = { id: vDoc.id, ...vDoc.data() } as Sale;
            if (sale.status !== 'COMPLETED') continue; // safety
            const items = sale.items || [];
            for (const it of items) {
                if (it.isVoided) continue;
                const pid = it.productId;
                if (!colas.has(pid)) continue;
                const cant = it.quantity || 0;
                if (cant <= 0) continue;
                const pUnitReal = it.subtotal && cant > 0 ? it.subtotal / cant : (it.unitPrice || 0);

                const lote = colas.get(pid);
                let restante = cant;
                while (restante > 0 && lote && lote.length > 0) {
                    const usar = Math.min(restante, lote[0].cantDisp);
                    const bucket = compraData.get(lote[0].compraId);
                    if (bucket && bucket.productos[pid]) {
                        bucket.productos[pid].vendidos += usar;
                        bucket.productos[pid].costoVendido += usar * lote[0].costo;
                        bucket.productos[pid].utilidad += usar * (pUnitReal - lote[0].costo);
                    }
                    lote[0].cantDisp -= usar;
                    restante -= usar;
                    if (lote[0].cantDisp <= 0) lote.shift();
                }
                if (lote && lote.length === 0) colas.delete(pid);
            }
        }

        // 5) Armar respuesta
        const rows: RotacionCompra[] = [];
        let totalInversion = 0;
        let totalCostoVendido = 0;
        let totalUtilidad = 0;
        let estancadas = 0;

        for (const c of comprasDocs) {
            const bucket = compraData.get(c.id);
            if (!bucket || bucket.unidadesCompradas <= 0) continue;

            let unidadesVendidas = 0;
            let costoVendido = 0;
            let utilidad = 0;
            for (const p of Object.values(bucket.productos)) {
                unidadesVendidas += p.vendidos;
                costoVendido += p.costoVendido;
                utilidad += p.utilidad;
            }
            const rotacion = bucket.unidadesCompradas > 0
                ? Math.round((unidadesVendidas / bucket.unidadesCompradas) * 100 * 100) / 100
                : 0;

            const fechaDate = (c.date as Timestamp).toDate();
            const diasTranscurridos = Math.ceil((fechaCorte.getTime() - fechaDate.getTime()) / 86400000);

            rows.push({
                compraId: c.id,
                fecha: fechaDate.toISOString().slice(0, 10),
                sucursal: branchNameMap.get(c.branchId || '') || c.branchId || '-',
                proveedor: c.supplierName || '-',
                items: Object.keys(bucket.productos).length,
                unidadesCompradas: Math.round(bucket.unidadesCompradas * 100) / 100,
                unidadesVendidas: Math.round(unidadesVendidas * 100) / 100,
                rotacion,
                semaforo: semaforo(rotacion),
                costoTotal: Math.round(bucket.costoTotal * 100) / 100,
                costoVendido: Math.round(costoVendido * 100) / 100,
                utilidad: Math.round(utilidad * 100) / 100,
                diasTranscurridos,
            });

            totalInversion += bucket.costoTotal;
            totalCostoVendido += costoVendido;
            totalUtilidad += utilidad;
            if (rotacion < ROTACION_AMARILLO) estancadas++;
        }

        // Ordenar
        rows.sort((a, b) => {
            switch (orderByStr) {
                case 'rotacion_desc': return b.rotacion - a.rotacion;
                case 'fecha_desc': return b.fecha.localeCompare(a.fecha) * -1;
                case 'fecha_asc': return a.fecha.localeCompare(b.fecha);
                case 'costo_desc': return b.costoTotal - a.costoTotal;
                case 'utilidad_desc': return b.utilidad - a.utilidad;
                case 'rotacion_asc':
                default: return a.rotacion - b.rotacion;
            }
        });

        const rotacionPromedioPond = totalInversion > 0
            ? Math.round((totalCostoVendido / totalInversion) * 100 * 100) / 100
            : 0;

        // Paginación
        const pages = perPage === 0 ? 1 : Math.max(1, Math.ceil(rows.length / perPage));
        const paginated = perPage === 0
            ? rows
            : rows.slice((page - 1) * perPage, page * perPage);

        return {
            resumen: {
                comprasAnalizadas: rows.length,
                inversionTotal: Math.round(totalInversion * 100) / 100,
                rotacionPromedio: rotacionPromedioPond,
                utilidadRealizada: Math.round(totalUtilidad * 100) / 100,
                comprasEstancadas: estancadas,
            },
            paginacion: {
                page,
                perPage,
                total: rows.length,
                pages,
            },
            compras: paginated,
        };
    },

    /**
     * Detalle ítem por ítem de una compra específica.
     */
    async detalle(compraId: string, fechaCorte: Date = new Date()): Promise<{ compra: { id: string; fecha: string; proveedor: string }; items: RotacionItem[] }> {
        const cortoTs = Timestamp.fromDate(fechaCorte);

        const compraDoc = await getDocs(query(collection(db, 'compras'), where(documentId(), '==', compraId)));
        if (compraDoc.empty) throw new Error('Compra no encontrada');
        const compraRaw = compraDoc.docs[0].data() as Purchase;
        const compraDate = (compraRaw.date as Timestamp).toDate().toISOString().slice(0, 10);
        const proveedor = compraRaw.supplierName || '-';
        const compraBranchId = (compraRaw as any).branchId as string | undefined;

        const itemsSnap = await getDocs(collection(db, `compras/${compraId}/items`));
        const itemsRaw: any[] = itemsSnap.docs.map(d => d.data());

        const productosFiltro = new Set(itemsRaw.map(it => it.productId as string).filter(Boolean));
        if (productosFiltro.size === 0) {
            return { compra: { id: compraId, fecha: compraDate, proveedor }, items: [] };
        }

        // Colas FIFO — filtradas por la sucursal de ESTA compra
        const colas = new Map<string, Lote[]>();
        const comprasFifo = await fetchComprasParaFifo(compraBranchId, cortoTs, productosFiltro);
        for (const c of comprasFifo) {
            for (const it of c.items) {
                const pid = it.productId as string;
                const cant = (it.quantity || it.qtyPedida || 0) as number;
                if (cant <= 0) continue;
                if (!colas.has(pid)) colas.set(pid, []);
                colas.get(pid)!.push({
                    compraId: c.id,
                    fecha: '',
                    sucursalCompra: c.branchId,
                    cantDisp: cant,
                    costo: (it.costo || it.unitCost || 0) as number,
                });
            }
        }

        // Tracking por producto para esta compra
        const tracking: Record<string, { vendidos: number; costoVendido: number; utilidad: number }> = {};
        for (const it of itemsRaw) tracking[it.productId] = { vendidos: 0, costoVendido: 0, utilidad: 0 };

        const ventasConstraints: any[] = [
            where('status', '==', 'COMPLETED'),
            where('fecha', '<=', cortoTs),
            orderBy('fecha'),
        ];
        if (compraBranchId) ventasConstraints.unshift(where('branchId', '==', compraBranchId));
        const ventasSnap = await getDocs(query(collection(db, 'ventas'), ...ventasConstraints));

        for (const vDoc of ventasSnap.docs) {
            const sale = { id: vDoc.id, ...vDoc.data() } as Sale;
            if (sale.status !== 'COMPLETED') continue;
            for (const it of (sale.items || [])) {
                if (it.isVoided) continue;
                const pid = it.productId;
                if (!colas.has(pid)) continue;
                const cant = it.quantity || 0;
                if (cant <= 0) continue;
                const pUnitReal = it.subtotal && cant > 0 ? it.subtotal / cant : (it.unitPrice || 0);

                const lote = colas.get(pid)!;
                let restante = cant;
                while (restante > 0 && lote.length > 0) {
                    const usar = Math.min(restante, lote[0].cantDisp);
                    if (lote[0].compraId === compraId && tracking[pid]) {
                        tracking[pid].vendidos += usar;
                        tracking[pid].costoVendido += usar * lote[0].costo;
                        tracking[pid].utilidad += usar * (pUnitReal - lote[0].costo);
                    }
                    lote[0].cantDisp -= usar;
                    restante -= usar;
                    if (lote[0].cantDisp <= 0) lote.shift();
                }
                if (lote.length === 0) colas.delete(pid);
            }
        }

        // Mapeo de masterIds para obtener código y descripción (chunked, max 30 por `in`)
        const masterIds = Array.from(new Set(itemsRaw.map(it => it.masterId as string).filter(Boolean)));
        const catalogoMap = new Map<string, any>();
        for (let i = 0; i < masterIds.length; i += 30) {
            const chunk = masterIds.slice(i, i + 30);
            const catalogSnap = await getDocs(query(collection(db, 'catalogo_maestro'), where(documentId(), 'in', chunk)));
            for (const d of catalogSnap.docs) catalogoMap.set(d.id, d.data());
        }

        const items: RotacionItem[] = itemsRaw.map(it => {
            const t = tracking[it.productId] || { vendidos: 0, costoVendido: 0, utilidad: 0 };
            const cant = (it.quantity || it.qtyPedida || 0) as number;
            const rot = cant > 0 ? Math.round((t.vendidos / cant) * 100 * 100) / 100 : 0;
            const master = catalogoMap.get(it.masterId);
            return {
                productId: it.productId,
                codigo: master?.codigo || it.productCode || '-',
                descripcion: it.productName || master?.nombre || '-',
                marca: master?.marca || it.productMarca || '-',
                cantidad: cant,
                costo: (it.costo || it.unitCost || 0) as number,
                vendidos: Math.round(t.vendidos * 100) / 100,
                rotacion: rot,
                semaforo: semaforo(rot),
            };
        });

        return { compra: { id: compraId, fecha: compraDate, proveedor }, items };
    },
};
