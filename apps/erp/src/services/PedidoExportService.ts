import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, getDoc, doc, Timestamp, limit } from 'firebase/firestore';
import { Pedido, PedidoItem, Product, Purchase, PurchaseItem } from '@/types';

const PURCHASE_COLLECTION = 'compras';
const PRODUCT_COLLECTION = 'productos';

export interface PurchaseHistoryEntry {
    supplierName: string;
    date: Date;
    cost: number;
    purchaseId: string;
}

export interface ExportPedidoItem extends PedidoItem {
    productMarca?: string;
    productCategoria?: string;
    productCosto?: number;
    productPrecioConFactura?: number;
    productPrecioSinFactura?: number;
    productDescripcion?: string;
    history: PurchaseHistoryEntry[];
}

export interface PedidoExportFilters {
    showHistory: boolean;
    showCosts: boolean;
    historyCount: 1 | 2 | 3 | 4 | 5;
    historyFrom?: Date;
    historyTo?: Date;
    historyBranchScope: 'HQ' | 'PEDIDO_TO' | 'ALL';
    sortBy: 'quantity-desc' | 'code-asc' | 'marca-asc' | 'name-asc';
    includeVoided: boolean;
    filterMarca?: string;
    filterCategoria?: string;
    includeNotes: boolean;
    showLogo: boolean;
    paperSize: 'A4' | 'LETTER' | 'TICKET80';
}

export const DEFAULT_EXPORT_FILTERS: PedidoExportFilters = {
    showHistory: true,
    showCosts: true,
    historyCount: 2,
    historyBranchScope: 'HQ',
    sortBy: 'quantity-desc',
    includeVoided: false,
    includeNotes: true,
    showLogo: true,
    paperSize: 'LETTER',
};

/**
 * Hidrata items del pedido con datos del producto (marca, categoría, precios) y
 * con el historial de las últimas N compras según los filtros.
 */
export const PedidoExportService = {
    async buildExportItems(
        pedido: Pedido,
        items: PedidoItem[],
        filters: PedidoExportFilters
    ): Promise<ExportPedidoItem[]> {
        // 1. Hidratar productos (en paralelo, con tolerancia a errores)
        const productMap = new Map<string, Product | null>();
        await Promise.all(items.map(async (it) => {
            try {
                const snap = await getDoc(doc(db, PRODUCT_COLLECTION, it.productId));
                productMap.set(it.productId, snap.exists() ? ({ id: snap.id, ...snap.data() } as Product) : null);
            } catch {
                productMap.set(it.productId, null);
            }
        }));

        // 2. Resolver scope de historial
        const historyBranchId = filters.historyBranchScope === 'HQ'
            ? 'HQ'
            : filters.historyBranchScope === 'PEDIDO_TO'
                ? pedido.toBranchId
                : null; // ALL

        // 3. Cargar historial relevante (cap en 100 compras recientes para evitar lecturas masivas)
        const purchasesByProduct = await PedidoExportService.loadPurchasesIndex(
            items.map(it => ({ productId: it.productId, masterId: it.masterId })),
            historyBranchId,
            filters.historyFrom,
            filters.historyTo,
            filters.historyCount
        );

        // 4. Construir export items
        let exportItems: ExportPedidoItem[] = items.map(it => {
            const product = productMap.get(it.productId);
            const history = purchasesByProduct.get(it.productId) || purchasesByProduct.get(it.masterId) || [];
            return {
                ...it,
                productMarca: product?.marca,
                productCategoria: product?.categoria,
                productCosto: product?.costo,
                productPrecioConFactura: product?.precioConFactura,
                productPrecioSinFactura: product?.precioSinFactura,
                productDescripcion: product?.descripcion,
                history,
            };
        });

        // 5. Aplicar filtros de marca/categoría
        if (filters.filterMarca) {
            exportItems = exportItems.filter(i => (i.productMarca || '').toLowerCase() === filters.filterMarca!.toLowerCase());
        }
        if (filters.filterCategoria) {
            exportItems = exportItems.filter(i => (i.productCategoria || '').toLowerCase() === filters.filterCategoria!.toLowerCase());
        }

        // 6. Ordenar
        switch (filters.sortBy) {
            case 'quantity-desc':
                exportItems.sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
                break;
            case 'code-asc':
                exportItems.sort((a, b) => (a.productCode || '').localeCompare(b.productCode || ''));
                break;
            case 'marca-asc':
                exportItems.sort((a, b) => (a.productMarca || '').localeCompare(b.productMarca || ''));
                break;
            case 'name-asc':
                exportItems.sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
                break;
        }

        return exportItems;
    },

    /**
     * Carga las últimas compras válidas en el scope dado y devuelve un índice
     * productId/masterId → top N entradas.
     */
    async loadPurchasesIndex(
        productKeys: { productId: string; masterId: string }[],
        branchId: string | null,
        from: Date | undefined,
        to: Date | undefined,
        topN: number
    ): Promise<Map<string, PurchaseHistoryEntry[]>> {
        const result = new Map<string, PurchaseHistoryEntry[]>();
        if (productKeys.length === 0) return result;

        // Build purchases query
        const constraints: Parameters<typeof query>[1][] = [];
        if (branchId) constraints.push(where('branchId', '==', branchId));
        if (from) constraints.push(where('date', '>=', Timestamp.fromDate(from)));
        if (to) constraints.push(where('date', '<=', Timestamp.fromDate(to)));
        constraints.push(orderBy('date', 'desc'));
        constraints.push(limit(100));

        let purchases: (Purchase & { _items?: (PurchaseItem & { id: string })[] })[] = [];
        try {
            const snap = await getDocs(query(collection(db, PURCHASE_COLLECTION), ...constraints));
            purchases = snap.docs.map(d => ({ id: d.id, ...d.data() } as Purchase));
        } catch (e) {
            console.warn('[PedidoExportService] purchases query failed (probable index missing):', e);
            return result;
        }

        // Cargar items en paralelo
        await Promise.all(purchases.map(async (p) => {
            try {
                const itemsSnap = await getDocs(collection(db, `${PURCHASE_COLLECTION}/${p.id}/items`));
                p._items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseItem & { id: string }));
            } catch {
                p._items = [];
            }
        }));

        // Indexar por productId
        const wantedIds = new Set<string>();
        productKeys.forEach(k => { wantedIds.add(k.productId); wantedIds.add(k.masterId); });

        for (const p of purchases) {
            const dateObj = (p.date as Timestamp)?.toDate?.() || new Date();
            for (const it of (p._items || [])) {
                if (!wantedIds.has(it.productId)) continue;
                const list = result.get(it.productId) || [];
                if (list.length >= topN) continue;
                list.push({
                    supplierName: p.supplierName || '—',
                    date: dateObj,
                    cost: it.cost,
                    purchaseId: p.id!,
                });
                result.set(it.productId, list);
            }
        }

        return result;
    },

    /**
     * Genera CSV con los items exportados (para Excel).
     */
    buildCsv(pedido: Pedido, items: ExportPedidoItem[], filters: PedidoExportFilters): string {
        const sep = ';';
        const esc = (v: unknown) => {
            if (v === null || v === undefined) return '';
            const s = String(v).replace(/"/g, '""');
            return /[";\n\r]/.test(s) ? `"${s}"` : s;
        };
        const fmtMoney = (n: unknown) => {
            if (n === null || n === undefined || n === '') return '';
            const num = Number(n);
            if (!Number.isFinite(num)) return '';
            return num.toFixed(2);
        };

        const headers = [
            'Cant.',
            'Código',
            'Marca',
            'Categoría',
            'Producto',
        ];
        if (filters.showCosts) {
            headers.push('Costo (Bs)', 'Precio S/F (Bs)', 'Precio C/F (Bs)');
        }
        if (filters.showHistory) {
            for (let i = 1; i <= filters.historyCount; i++) {
                headers.push(`Hist ${i} Proveedor`, `Hist ${i} Fecha`, `Hist ${i} Costo (Bs)`);
            }
        }
        if (filters.includeNotes) headers.push('Notas');

        const rows: string[] = [headers.map(esc).join(sep)];
        for (const it of items) {
            const row: (string | number)[] = [
                it.quantity,
                it.productCode || '',
                it.productMarca || '',
                it.productCategoria || '',
                it.productName,
            ];
            if (filters.showCosts) {
                row.push(fmtMoney(it.productCosto), fmtMoney(it.productPrecioSinFactura), fmtMoney(it.productPrecioConFactura));
            }
            if (filters.showHistory) {
                for (let i = 0; i < filters.historyCount; i++) {
                    const h = it.history[i];
                    row.push(h?.supplierName || '', h ? h.date.toISOString().split('T')[0] : '', fmtMoney(h?.cost));
                }
            }
            if (filters.includeNotes) row.push(it.notas || '');
            rows.push(row.map(esc).join(sep));
        }

        const totalUnits = items.reduce((s, i) => s + (i.quantity || 0), 0);
        const STATUS_LABEL: Record<string, string> = {
            borrador: 'Borrador',
            vigente: 'Vigente',
            despachado: 'Despachado',
            cancelado: 'Cancelado',
        };
        const meta = [
            `Pedido${sep}${esc(pedido.codigo)}`,
            `Solicita${sep}${esc(pedido.fromBranchName)}`,
            `Despacha${sep}${esc(pedido.toBranchName)}`,
            `Estado${sep}${esc(STATUS_LABEL[pedido.status] || pedido.status)}`,
            `Total ítems${sep}${items.length}`,
            `Total unidades${sep}${totalUnits}`,
            ...(filters.includeNotes && pedido.notas ? [`Observación${sep}${esc(pedido.notas)}`] : []),
            '',
        ].join('\n');

        return meta + '\n' + rows.join('\n');
    },

    /**
     * Descarga un archivo CSV en el navegador.
     */
    downloadCsv(filename: string, csvContent: string) {
        // BOM para que Excel lea UTF-8 con tildes correctamente
        const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Genera y descarga un XLSX con formato profesional:
     * - Anchos de columna autoajustados al contenido.
     * - Cabecera con fondo y texto blanco.
     * - Montos como número con formato de moneda (Bs).
     * - Bloque meta arriba (Pedido, sucursales, totales).
     */
    async downloadXlsx(filename: string, pedido: Pedido, items: ExportPedidoItem[], filters: PedidoExportFilters) {
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Renotech';
        wb.created = new Date();
        const ws = wb.addWorksheet(pedido.codigo, {
            views: [{ state: 'frozen', ySplit: 0 }],
        });

        const STATUS_LABEL: Record<string, string> = {
            borrador: 'Borrador',
            vigente: 'Vigente',
            despachado: 'Despachado',
            cancelado: 'Cancelado',
        };
        const totalUnits = items.reduce((s, i) => s + (i.quantity || 0), 0);

        // ===== Bloque META =====
        const metaRows: [string, string | number][] = [
            ['Pedido', pedido.codigo],
            ['Solicita', pedido.fromBranchName],
            ['Despacha', pedido.toBranchName],
            ['Estado', STATUS_LABEL[pedido.status] || pedido.status],
            ['Total ítems', items.length],
            ['Total unidades', totalUnits],
        ];
        if (filters.includeNotes && pedido.notas) {
            metaRows.push(['Observación', pedido.notas]);
        }
        metaRows.forEach(([label, value]) => {
            const r = ws.addRow([label, value]);
            r.getCell(1).font = { bold: true, color: { argb: 'FF334155' } };
            r.getCell(1).alignment = { vertical: 'middle' };
            r.getCell(2).alignment = { vertical: 'middle', wrapText: true };
        });

        ws.addRow([]); // separador

        // ===== Cabecera de tabla =====
        const headers: string[] = ['Cant.', 'Código', 'Marca', 'Categoría', 'Producto'];
        if (filters.showCosts) headers.push('Costo (Bs)', 'Precio S/F (Bs)', 'Precio C/F (Bs)');
        if (filters.showHistory) {
            for (let i = 1; i <= filters.historyCount; i++) {
                headers.push(`Hist ${i} Proveedor`, `Hist ${i} Fecha`, `Hist ${i} Costo (Bs)`);
            }
        }
        if (filters.includeNotes) headers.push('Notas');

        const headerRow = ws.addRow(headers);
        headerRow.height = 22;
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            };
        });

        // ===== Filas de datos =====
        const moneyFmt = '"Bs" #,##0.00;[Red]-"Bs" #,##0.00';
        items.forEach((it, idx) => {
            const row: (string | number | Date | null)[] = [
                it.quantity,
                it.productCode || '',
                it.productMarca || '',
                it.productCategoria || '',
                it.productName || '',
            ];
            if (filters.showCosts) {
                row.push(
                    it.productCosto ?? null,
                    it.productPrecioSinFactura ?? null,
                    it.productPrecioConFactura ?? null,
                );
            }
            if (filters.showHistory) {
                for (let i = 0; i < filters.historyCount; i++) {
                    const h = it.history[i];
                    row.push(h?.supplierName || '', h ? h.date : '', h?.cost ?? null);
                }
            }
            if (filters.includeNotes) row.push(it.notas || '');

            const r = ws.addRow(row);
            r.alignment = { vertical: 'top', wrapText: true };
            r.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

            // Zebra
            if (idx % 2 === 1) {
                r.eachCell((cell) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                });
            }
            // Bordes suaves
            r.eachCell((cell) => {
                cell.border = {
                    top: { style: 'hair', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'hair', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'hair', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
                };
            });

            // Formatos numéricos / fecha
            let colIdx = 6;
            if (filters.showCosts) {
                r.getCell(colIdx++).numFmt = moneyFmt;
                r.getCell(colIdx++).numFmt = moneyFmt;
                r.getCell(colIdx++).numFmt = moneyFmt;
            }
            if (filters.showHistory) {
                for (let i = 0; i < filters.historyCount; i++) {
                    colIdx++; // proveedor (texto)
                    const dateCell = r.getCell(colIdx++);
                    dateCell.numFmt = 'dd/mm/yyyy';
                    r.getCell(colIdx++).numFmt = moneyFmt;
                    void dateCell;
                }
            }
        });

        // ===== Autoajuste de anchos =====
        ws.columns.forEach((col) => {
            let maxLen = 10;
            col.eachCell?.({ includeEmpty: false }, (cell) => {
                const v = cell.value;
                let s = '';
                if (v == null) s = '';
                else if (v instanceof Date) s = '00/00/0000';
                else if (typeof v === 'number') s = v.toFixed(2) + '   ';
                else s = String(v);
                // Limitar a 60 para que productos largos no exploten el layout
                const len = Math.min(60, s.length + 2);
                if (len > maxLen) maxLen = len;
            });
            col.width = maxLen;
        });

        // Columna "Producto" (5) con ancho mínimo cómodo
        if (ws.getColumn(5)) ws.getColumn(5).width = Math.max(ws.getColumn(5).width || 30, 40);

        // Descarga
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
};
