'use client';

import { useState, useMemo, useEffect } from 'react';
import { Product } from '@/types';
import { InventoryService } from '@/services/InventoryService';
import { ensureDate } from '@/utils/dateHelpers';
import InventoryTable from './components/InventoryTable';
import StockAdjustmentModal from './components/StockAdjustmentModal';
import ImportWizard from './components/ImportWizard';
import { Download, Plus, Package, QrCode, ShoppingBag, TrendingUp, AlertTriangle, Truck, Archive, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import QRScanner from '@/components/common/QRScanner';
import { useBranch } from '@/contexts/BranchContext';
import { toast } from 'sonner';
import ConfirmModal from '@/components/common/ConfirmModal';
import { useProducts } from '@/hooks/useProducts';
import { useInTransitStock } from '@/hooks/useInTransitStock';
import clsx from 'clsx';

// Suite Pro v4.0 Components
import ModuleHeader, { Action } from '@/components/common/ModuleHeader';
import KpiCard from '@/components/common/KpiCard';
import FilterBar from '@/components/common/FilterBar';

export default function InventoryPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user: currentUser, role } = useAuth();
    const { currentBranch, isConsolidatedView, branches, isHQ: isBranchHQ } = useBranch();
    const [searchTerm, setSearchTerm] = useState('');
    const [branchFilter, setBranchFilter] = useState<string>('ALL');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('name_asc');
    const [adjustmentProduct, setAdjustmentProduct] = useState<Product | null>(null);
    const [showScanner, setShowScanner] = useState(false);
    const [showImportWizard, setShowImportWizard] = useState(false);

    const branchFilterSelect = isConsolidatedView ? branchFilter : currentBranch?.id;
    const { products, loading } = useProducts(branchFilterSelect || 'ALL');
    const inTransit = useInTransitStock(isConsolidatedView ? 'ALL' : currentBranch?.id);


    // New Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState<{ id: string, name: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const isGerente = role === 'GERENTE';

    // Highlight: cuando se llega desde el buscador global con ?highlight=productId,
    // filtrar la tabla al código de ese producto y limpiar la URL.
    useEffect(() => {
        const highlightId = searchParams.get('highlight');
        if (!highlightId || loading || products.length === 0) return;
        const product = products.find(p => p.id === highlightId);
        if (product) {
            setSearchTerm(product.codigo);
            router.replace('/inventario', { scroll: false });
        }
    }, [searchParams, products, loading, router]);

    const handleCreate = () => {
        router.push('/inventario/nuevo');
    };

    const handleEdit = (product: Product) => {
        router.push(`/inventario/editar/${product.id}`);
    };

    const handleDelete = (id: string, productName: string) => {
        setProductToDelete({ id, name: productName });
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!productToDelete) return;
        setIsDeleting(true);
        try {
            await InventoryService.deleteProduct(productToDelete.id, {
                uid: currentUser?.uid || '?',
                email: currentUser?.email || '?',
                branchId: currentBranch?.id || 'GLOBAL',
                isHQ: isBranchHQ
            });
            toast.success(`Producto "${productToDelete.name}" eliminado`);
        } catch {
            toast.error("Error al eliminar el producto");
        } finally {
            setIsDeleting(false);
            setIsDeleteModalOpen(false);
            setProductToDelete(null);
        }
    };

    const handleBulkDelete = async (ids: string[]) => {
        const toastId = toast.loading('Eliminando productos...');
        const results = await Promise.allSettled(ids.map((id) =>
            InventoryService.deleteProduct(id, {
                uid: currentUser?.uid || '?',
                email: currentUser?.email || '?',
                branchId: currentBranch?.id || 'GLOBAL',
                isHQ: isBranchHQ
            })
        ));
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed === 0) {
            toast.success(`${ids.length} productos eliminados correctamente`, { id: toastId });
        } else {
            toast.error(`${failed} de ${ids.length} productos no se pudieron eliminar`, { id: toastId });
        }
    };

    const handleExport = async () => {
        if (products.length === 0) return;
        const toastId = toast.loading('Generando Excel...');
        try {
            const ExcelJS = (await import('exceljs')).default;
            const wb = new ExcelJS.Workbook();
            const exportDate = new Date();

            // ── #10 Propiedades del archivo ───────────────────────────
            wb.creator   = 'Renotech Sistema';
            wb.lastModifiedBy = 'Renotech Sistema';
            wb.created   = exportDate;
            wb.modified  = exportDate;
            wb.title     = `Inventario Renotech ${exportDate.toLocaleDateString('es-BO')}`;
            wb.subject   = 'Reporte de Inventario';
            wb.keywords  = 'renotech inventario stock productos';
            wb.category  = 'Inventario';
            wb.description = `Exportado el ${exportDate.toLocaleString('es-BO')} — ${products.length} productos`;
            wb.company   = 'Renotech';

            // ── Helpers ───────────────────────────────────────────────
            const styleHeader = (row: any, tabColor = 'FF111827') => {
                row.eachCell((cell: any) => {
                    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: tabColor } };
                    cell.font      = { bold: true, color: { argb: 'FFFACC15' }, size: 10 };
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    cell.border    = { bottom: { style: 'thin', color: { argb: 'FFFACC15' } } };
                });
                row.height = 22;
            };
            const styleTotals = (row: any) => {
                row.eachCell({ includeEmpty: true }, (cell: any) => {
                    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } };
                    cell.font   = { bold: true, color: { argb: 'FFFACC15' }, size: 10 };
                    cell.border = { top: { style: 'medium', color: { argb: 'FFFACC15' } } };
                });
                row.height = 20;
            };

            // ════════════════════════════════════════════════════════════
            // HOJA 1 — Inventario completo
            // ════════════════════════════════════════════════════════════
            const ws = wb.addWorksheet('Inventario', {
                views: [{ state: 'frozen', ySplit: 1 }],
                properties: { tabColor: { argb: 'FFFACC15' } },
            });

            const cols: any[] = [
                { header: 'Código',                key: 'codigo',        width: 14 },
                { header: 'Cód. Fábrica',           key: 'codigoFabrica', width: 14 },
                { header: 'Cód. OEM',               key: 'codigoOE',      width: 14 },
                { header: 'Producto',               key: 'nombre',        width: 42 },
                { header: 'Marca',                  key: 'marca',         width: 16 },
                { header: 'Categoría',              key: 'categoria',     width: 18 },
                { header: 'Origen',                 key: 'origen',        width: 12 },
                { header: 'Stock',                  key: 'stock',         width: 8  },
            ];
            if (isGerente) cols.push({ header: 'Costo (Bs)', key: 'costo', width: 13 });
            cols.push(
                { header: 'P. Mayorista (Bs)',      key: 'pMay',       width: 16 },
                { header: 'P. c/ Factura (Bs)',     key: 'pCF',        width: 16 },
                { header: 'P. s/ Factura (Bs)',     key: 'pSF',        width: 16 },
                { header: 'Valor Inventario (Bs)',  key: 'valorInv',   width: 18 },
                { header: 'Ubicación',              key: 'ubicacion',  width: 16 },
                { header: 'Cód. Barras',            key: 'barcode',    width: 16 },
                { header: 'Sucursal',               key: 'sucursal',   width: 16 },
                { header: 'Descripción del Activo', key: 'descripcion',width: 35 },
                { header: 'Imagen',                 key: 'imagen',     width: 20 },
            );
            ws.columns = cols;

            const numKeys = isGerente
                ? ['costo', 'pMay', 'pCF', 'pSF', 'valorInv']
                : ['pMay', 'pCF', 'pSF', 'valorInv'];
            const numColIdxs = numKeys.map(k => (ws.columns as any[]).findIndex((c: any) => c.key === k) + 1);
            const stockColIdx = (ws.columns as any[]).findIndex((c: any) => c.key === 'stock') + 1;
            const imgColIdx   = (ws.columns as any[]).findIndex((c: any) => c.key === 'imagen') + 1;
            const codigoColIdx = (ws.columns as any[]).findIndex((c: any) => c.key === 'codigo') + 1;

            styleHeader(ws.getRow(1));
            ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

            let totalStock = 0, totalInversion = 0;

            products.forEach((p, idx) => {
                const costo    = p.costo || 0;
                const stock    = p.stock || 0;
                const valorInv = isGerente ? parseFloat((costo * stock).toFixed(2)) : 0;
                totalStock     += stock;
                totalInversion += valorInv;

                const rowData: Record<string, string | number> = {
                    codigo:        p.codigo         || '',
                    codigoFabrica: p.codigoFabrica  || '',
                    codigoOE:      p.codigoOE       || '',
                    nombre:        p.nombre         || '',
                    marca:         p.marca          || '',
                    categoria:     p.categoria      || '',
                    origen:        p.origen         || '',
                    stock,
                    pMay:     parseFloat((p.precioMayorista || 0).toFixed(2)),
                    pCF:      parseFloat((p.precioConFactura ?? p.precioVenta ?? p.precio ?? 0).toFixed(2)),
                    pSF:      parseFloat((p.precioSinFactura ?? p.precioVenta ?? p.precio ?? 0).toFixed(2)),
                    valorInv: isGerente ? valorInv : '',
                    ubicacion:   p.ubicacionFisica || '',
                    barcode:     p.barcode         || '',
                    sucursal:    p.branchName      || 'N/A',
                    descripcion: p.descripcion     || '',
                };
                if (isGerente) rowData.costo = parseFloat(costo.toFixed(2));

                const row   = ws.addRow(rowData);
                const rowBg = idx % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF';

                row.eachCell({ includeEmpty: true }, (cell: any, colIdx: number) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
                    if (numColIdxs.includes(colIdx)) {
                        cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    } else {
                        cell.alignment = { vertical: 'middle' };
                    }
                    if (colIdx === stockColIdx) {
                        cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'center', vertical: 'middle' };
                        if (stock === 0)                    cell.font = { bold: true, color: { argb: 'FFE11D48' } };
                        else if (stock <= (p.minStock || 5)) cell.font = { bold: true, color: { argb: 'FFB45309' } };
                    }
                });

                // #6 Hipervínculo en código → kardex
                const codigoCell = row.getCell(codigoColIdx);
                const kardexUrl  = `https://sistema.renotech.lat/kardex/${p.id}`;
                codigoCell.value = { text: p.codigo || '', hyperlink: kardexUrl, tooltip: 'Ver kardex' };
                codigoCell.font  = { color: { argb: 'FF2563EB' }, underline: true, size: 10 };

                // Imagen
                const imgCell  = row.getCell(imgColIdx);
                const imageUrl = (p as any).imagenUrl || '';
                if (imageUrl) {
                    imgCell.value = { text: '🖼 Ver imagen', hyperlink: imageUrl, tooltip: imageUrl };
                    imgCell.font  = { color: { argb: 'FF2563EB' }, underline: true, size: 10 };
                } else {
                    imgCell.value = '';
                }
                imgCell.alignment = { vertical: 'middle', horizontal: 'center' };
            });

            ws.addRow([]);
            const totalsRow1 = ws.addRow({
                nombre: `TOTAL — ${products.length} productos`,
                stock: totalStock,
                ...(isGerente ? { valorInv: parseFloat(totalInversion.toFixed(2)) } : {}),
            });
            styleTotals(totalsRow1);
            totalsRow1.getCell(stockColIdx).numFmt = '#,##0';
            if (isGerente) {
                const viIdx = (ws.columns as any[]).findIndex((c: any) => c.key === 'valorInv') + 1;
                totalsRow1.getCell(viIdx).numFmt    = '#,##0.00';
                totalsRow1.getCell(viIdx).alignment = { horizontal: 'right', vertical: 'middle' };
            }

            // ════════════════════════════════════════════════════════════
            // HOJA 2 — #4 Resumen por categoría
            // ════════════════════════════════════════════════════════════
            const wsCat = wb.addWorksheet('Por Categoría', {
                views: [{ state: 'frozen', ySplit: 1 }],
                properties: { tabColor: { argb: 'FF6366F1' } },
            });
            wsCat.columns = [
                { header: 'Categoría',             key: 'cat',       width: 24 },
                { header: 'Productos',             key: 'prods',     width: 12 },
                { header: 'Unidades en Stock',     key: 'units',     width: 18 },
                ...(isGerente ? [
                    { header: 'Valor Inventario (Bs)', key: 'valor', width: 22 },
                    { header: '% del Total',           key: 'pct',   width: 14 },
                ] : []),
            ];
            styleHeader(wsCat.getRow(1), 'FF3730A3');
            wsCat.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: wsCat.columns.length } };

            const catMap = new Map<string, { prods: number; units: number; valor: number }>();
            for (const p of products) {
                const cat = p.categoria || 'Sin categoría';
                const existing = catMap.get(cat) ?? { prods: 0, units: 0, valor: 0 };
                catMap.set(cat, {
                    prods: existing.prods + 1,
                    units: existing.units + (p.stock || 0),
                    valor: existing.valor + (isGerente ? (p.costo || 0) * (p.stock || 0) : 0),
                });
            }
            const sortedCats = Array.from(catMap.entries()).sort((a, b) => b[1].valor - a[1].valor || b[1].units - a[1].units);
            sortedCats.forEach(([cat, d], idx) => {
                const rowData: any = { cat, prods: d.prods, units: d.units };
                if (isGerente) { rowData.valor = parseFloat(d.valor.toFixed(2)); rowData.pct = parseFloat((d.valor / totalInversion * 100).toFixed(1)); }
                const row = wsCat.addRow(rowData);
                const bg  = idx % 2 === 0 ? 'FFF5F3FF' : 'FFFFFFFF';
                row.eachCell({ includeEmpty: true }, (cell: any, ci: number) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                    cell.alignment = { vertical: 'middle', horizontal: ci <= 1 ? 'left' : 'right' };
                    if (ci >= 3) cell.numFmt = ci === 4 ? '#,##0.00' : ci === 5 ? '0.0"%"' : '#,##0';
                });
            });
            wsCat.addRow([]);
            const catTotals = wsCat.addRow({
                cat: `TOTAL — ${sortedCats.length} categorías`,
                prods: products.length,
                units: totalStock,
                ...(isGerente ? { valor: parseFloat(totalInversion.toFixed(2)), pct: 100 } : {}),
            });
            styleTotals(catTotals);
            if (isGerente) {
                catTotals.getCell(4).numFmt = '#,##0.00'; catTotals.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
                catTotals.getCell(5).numFmt = '0.0"%"';   catTotals.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
            }

            // ════════════════════════════════════════════════════════════
            // HOJA 3 — #5 Stock crítico
            // ════════════════════════════════════════════════════════════
            const critical = products.filter(p => p.stock === 0 || p.stock <= (p.minStock || 5));
            const wsCrit = wb.addWorksheet('Stock Crítico', {
                views: [{ state: 'frozen', ySplit: 1 }],
                properties: { tabColor: { argb: 'FFEF4444' } },
            });
            wsCrit.columns = [
                { header: 'Estado',       key: 'estado',  width: 14 },
                { header: 'Código',       key: 'codigo',  width: 14 },
                { header: 'Producto',     key: 'nombre',  width: 42 },
                { header: 'Categoría',   key: 'cat',     width: 18 },
                { header: 'Stock',        key: 'stock',   width: 8  },
                { header: 'Mín.',         key: 'min',     width: 8  },
                { header: 'Faltan',       key: 'faltan',  width: 8  },
                { header: 'Sucursal',     key: 'sucursal',width: 16 },
                ...(isGerente ? [{ header: 'Costo (Bs)', key: 'costo', width: 13 }] : []),
            ];
            styleHeader(wsCrit.getRow(1), 'FF7F1D1D');
            wsCrit.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: wsCrit.columns.length } };

            critical
                .sort((a, b) => (a.stock || 0) - (b.stock || 0))
                .forEach((p, idx) => {
                    const stock   = p.stock || 0;
                    const minStock = p.minStock || 5;
                    const estado  = stock === 0 ? 'SIN STOCK' : 'STOCK BAJO';
                    const rowData: any = {
                        estado, stock, min: minStock, faltan: Math.max(0, minStock - stock),
                        codigo:   p.codigo   || '',
                        nombre:   p.nombre   || '',
                        cat:      p.categoria || '',
                        sucursal: p.branchName || 'N/A',
                    };
                    if (isGerente) rowData.costo = parseFloat((p.costo || 0).toFixed(2));

                    const row = wsCrit.addRow(rowData);
                    const bg  = stock === 0 ? 'FFFFF1F2' : 'FFFFFBEB';
                    row.eachCell({ includeEmpty: true }, (cell: any, ci: number) => {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? bg : 'FFFFFFFF' } };
                        cell.alignment = { vertical: 'middle' };
                        if (ci >= 5) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'center', vertical: 'middle' }; }
                    });
                    // Estado en color
                    const estadoCell = row.getCell(1);
                    estadoCell.font = { bold: true, color: { argb: stock === 0 ? 'FFE11D48' : 'FFB45309' } };
                    estadoCell.alignment = { horizontal: 'center', vertical: 'middle' };

                    // #6 Hipervínculo en código → kardex
                    const codCell = row.getCell(2);
                    codCell.value = { text: p.codigo || '', hyperlink: `https://sistema.renotech.lat/kardex/${p.id}`, tooltip: 'Ver kardex' };
                    codCell.font  = { color: { argb: 'FF2563EB' }, underline: true, size: 10 };
                });

            wsCrit.addRow([]);
            const critTotals = wsCrit.addRow({ estado: `${critical.length} productos críticos`, stock: critical.reduce((s, p) => s + (p.stock || 0), 0) });
            styleTotals(critTotals);

            // ── Descarga ──────────────────────────────────────────────
            const buffer = await wb.xlsx.writeBuffer();
            const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url    = URL.createObjectURL(blob);
            const link   = document.createElement('a');
            link.href    = url;
            link.download = `inventario_renotech_${exportDate.toISOString().slice(0, 10)}.xlsx`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast.success(`${products.length} productos exportados · 3 hojas`, { id: toastId });
        } catch (err) {
            console.error('Export error:', err);
            toast.error('Error al exportar el inventario', { id: toastId });
        }
    };

    const categories = useMemo(() => {
        const uniqueCats = Array.from(new Set(products.map(p => p.categoria || 'Otros').filter(Boolean)));
        const sorted = uniqueCats.filter(c => c !== 'Otros').sort((a, b) => a.localeCompare(b));
        if (uniqueCats.includes('Otros')) sorted.push('Otros');
        return ['all', ...sorted];
    }, [products]);

    const stats = useMemo(() => {
        const total = products.length;
        const lowStockArr = products.filter(p => p.stock > 0 && p.stock <= (p.minStock || 5));
        const lowStock = lowStockArr.length;
        const outOfStock = products.filter(p => p.stock === 0).length;
        
        let totalInvestment = 0;
        let totalRevenue = 0;
        
        products.forEach(p => {
            totalInvestment += (p.costo || 0) * (p.stock || 0);
            totalRevenue += (p.precioConFactura ?? p.precioVenta ?? p.precio ?? 0) * (p.stock || 0);
        });

        const deadStock = products.filter(p => {
            if (!p.lastSaleAt) return false;
            const date = ensureDate(p.lastSaleAt);
            const diff = (new Date().getTime() - date.getTime()) / (1000 * 3600 * 24);
            return diff > 90;
        }).length;

        // Grouping for Valuation Dashboard
        const brandMap = new Map<string, number>();
        const originMap = new Map<string, number>();
        products.forEach(p => {
            const val = (p.costo || 0) * (p.stock || 0);
            if (val <= 0) return;
            const b = String(p.marca || 'OTRAS');
            const o = String(p.origen || 'N/A');
            brandMap.set(b, (brandMap.get(b) || 0) + val);
            originMap.set(o, (originMap.get(o) || 0) + val);
        });

        const valuationByBrand = Array.from(brandMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        const valuationByOrigin = Array.from(originMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        return { total, lowStock, deadStock, outOfStock, totalInvestment, totalRevenue, valuationByBrand, valuationByOrigin };
    }, [products]);

    return (
        <div className="flex-1 min-w-0 w-full max-w-full animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 lg:space-y-8">

            {/* Header Area - Suite Pro Standard */}
            <ModuleHeader
                title="Gestión de Activos"
                subtitle="Inteligencia de Stock, Control de Almacenes y Optimización de Inventario"
                icon={Package}
                actions={([
                    {
                        label: "Archivo de Bajas",
                        onClick: () => router.push('/inventario/bajas'),
                        icon: Archive,
                        variant: 'secondary'
                    },
                    {
                        label: "Generar Reporte",
                        onClick: handleExport,
                        icon: Download,
                        variant: 'secondary'
                    },
                    {
                        label: "Lector de Enlaces",
                        onClick: () => setShowScanner(true),
                        icon: QrCode,
                        variant: 'secondary'
                    },
                    // Migración de Datos: oculto (ya no se usa). Wizard sigue disponible si se reactiva.
                    ...(isGerente && isBranchHQ && !isConsolidatedView ? [{
                        label: "Nuevo Activo",
                        onClick: handleCreate,
                        icon: Plus,
                        variant: 'primary',
                        dataTourId: 'inventario-new-btn'
                    }] : [])
                ] as Action[])}
            />

            {/* KPI Grid - Suite Pro v4.0 */}
            <div data-tour="inventario-kpis" className={clsx("grid grid-cols-2 gap-3 sm:gap-4 lg:gap-6", isGerente ? "lg:grid-cols-6" : "lg:grid-cols-5")}>
                <KpiCard
                    label="Activos en Custodia"
                    value={stats.total}
                    icon={Package}
                    progress={100}
                    color="blue"
                />
                
                {isGerente && (
                    <KpiCard
                        label="Patrimonio Neto"
                        value={`Bs. ${stats.totalInvestment.toLocaleString('es-BO', { minimumFractionDigits: 0 })}`}
                        icon={TrendingUp}
                        progress={100}
                        color="green"
                    />
                )}

                <KpiCard
                    label="Alerta Crítica"
                    value={stats.lowStock}
                    icon={AlertTriangle}
                    progress={(stats.lowStock / (stats.total || 1)) * 100}
                    color="red"
                />

                <KpiCard
                    label="Quiebre de Stock"
                    value={stats.outOfStock}
                    icon={ShoppingBag}
                    progress={(stats.outOfStock / (stats.total || 1)) * 100}
                    color="amber"
                />

                <KpiCard
                    label="Rotación Lenta"
                    value={stats.deadStock}
                    icon={TrendingUp}
                    progress={(stats.deadStock / (stats.total || 1)) * 100}
                    color="purple"
                />

                <KpiCard
                    label="En Tránsito"
                    value={inTransit.total}
                    icon={Truck}
                    progress={100}
                    color="amber"
                />
            </div>

            {/* Valuation Insights - Manager Only Suite Pro v4.0 */}
            {isGerente && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="bg-white dark:bg-background rounded-3xl p-6 border border-slate-200 dark:border-white/10 shadow-xl shadow-slate-200/20 dark:shadow-none relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -translate-y-12 translate-x-12 blur-3xl group-hover:bg-blue-500/10 transition-all duration-700" />
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                                <TrendingUp size={20} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white">Capital por Marca (Top 5)</h3>
                                <p className="text-[10px] text-slate-400 font-bold">Concentración de Inversión Patrimonial</p>
                            </div>
                            <span
                                title="Muestra las 5 marcas que concentran mayor inversión en inventario (costo × stock actual). Solo incluye productos con costo unitario asignado."
                                className="text-slate-300 dark:text-slate-600 hover:text-blue-400 dark:hover:text-blue-400 cursor-help transition-colors"
                            >
                                <Info size={14} />
                            </span>
                        </div>
                        {stats.valuationByBrand.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                                <TrendingUp size={28} className="text-slate-300 dark:text-slate-700" />
                                <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide">Sin datos de inversión</p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 max-w-55">Los productos necesitan tener <strong>costo unitario</strong> y <strong>stock mayor a 0</strong> para aparecer aquí</p>
                            </div>
                        ) : (
                        <div className="space-y-4">
                            {stats.valuationByBrand.map(([brand, value]) => (
                                <div key={brand} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                        <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase wrap-break-word">{brand}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[11px] font-black text-slate-900 dark:text-white tabular-nums">Bs. {value.toLocaleString('es-BO', { minimumFractionDigits: 0 })}</span>
                                        <div className="w-16 sm:w-24 md:w-32 h-1 bg-slate-100 dark:bg-white/5 rounded-full mt-1 overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                                                style={{ width: `${(value / stats.totalInvestment) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        )}
                    </div>

                    <div className="bg-white dark:bg-background rounded-3xl p-6 border border-slate-200 dark:border-white/10 shadow-xl shadow-slate-200/20 dark:shadow-none relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full -translate-y-12 translate-x-12 blur-3xl group-hover:bg-purple-500/10 transition-all duration-700" />
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                                <Package size={20} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white">Fondeo por Origen</h3>
                                <p className="text-[10px] text-slate-400 font-bold">Distribución Geográfica de Activos</p>
                            </div>
                            <span
                                title="Muestra el capital invertido según el país o región de origen de los productos. Solo incluye productos con costo unitario y campo 'Origen' registrado."
                                className="text-slate-300 dark:text-slate-600 hover:text-purple-400 dark:hover:text-purple-400 cursor-help transition-colors"
                            >
                                <Info size={14} />
                            </span>
                        </div>
                        {stats.valuationByOrigin.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                                <Package size={28} className="text-slate-300 dark:text-slate-700" />
                                <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide">Sin datos de origen</p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 max-w-55">Los productos necesitan tener <strong>costo unitario</strong>, <strong>origen</strong> y <strong>stock mayor a 0</strong> para aparecer aquí</p>
                            </div>
                        ) : (
                        <div className="space-y-4">
                            {stats.valuationByOrigin.map(([origin, value]) => (
                                <div key={origin} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                        <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase wrap-break-word">{origin}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[11px] font-black text-slate-900 dark:text-white tabular-nums">Bs. {value.toLocaleString('es-BO', { minimumFractionDigits: 0 })}</span>
                                        <div className="w-16 sm:w-24 md:w-32 h-1 bg-slate-100 dark:bg-white/5 rounded-full mt-1 overflow-hidden">
                                            <div
                                                className="h-full bg-purple-500 rounded-full transition-all duration-1000"
                                                style={{ width: `${(value / stats.totalInvestment) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        )}
                    </div>
                </div>
            )}

            {/* Filter Toolbar - High Density Suite Pro */}
            <div data-tour="inventario-search">
            <FilterBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Localizar por ID, nombre, marca o especificación técnica..."
                filters={[
                    {
                        id: 'category',
                        label: 'Familia',
                        value: categoryFilter,
                        onChange: setCategoryFilter,
                        options: categories.filter(c => c !== 'all').map(c => ({ label: c, value: c }))
                    },
                    {
                        id: 'stock_status',
                        label: 'Filtro Dinámico',
                        value: statusFilter,
                        onChange: setStatusFilter,
                        options: [
                            { label: 'Todos los Activos', value: 'all' },
                            { label: 'Stock Bajo / Crítico', value: 'low' },
                            { label: 'Agotados / Sin Stock', value: 'out' },
                            { label: 'Rotación Lenta (90d+)', value: 'dead' }
                        ]
                    },
                    {
                        id: 'sort_by',
                        label: 'Ordenar por',
                        value: sortBy,
                        onChange: setSortBy,
                        options: [
                            { label: 'Nombre (A-Z)', value: 'name_asc' },
                            { label: 'Recientes primero', value: 'date_desc' },
                            { label: 'Antiguos primero', value: 'date_asc' }
                        ]
                    },
                    ...(isConsolidatedView ? [{
                        id: 'branch',
                        label: 'Sede / Hub',
                        value: branchFilter,
                        onChange: setBranchFilter,
                        options: branches.map(b => ({ label: b.name, value: b.id || '' }))
                    }] : [])
                ]}
                onClear={() => {
                    setSearchTerm('');
                    setCategoryFilter('all');
                    setStatusFilter('all');
                    setSortBy('name_asc');
                    setBranchFilter('ALL');
                }}
                isDirty={searchTerm !== '' || categoryFilter !== 'all' || statusFilter !== 'all' || sortBy !== 'name_asc' || branchFilter !== 'ALL'}
            />
            </div>

            {/* Content Container */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0" data-tour="inventario-table">
                <InventoryTable
                    products={products}
                    loading={loading}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onBulkDelete={handleBulkDelete}
                    onAdjustStock={setAdjustmentProduct}
                    searchTerm={searchTerm}
                    categoryFilter={categoryFilter}
                    statusFilter={statusFilter}
                    sortBy={sortBy}
                    canEdit={isGerente && !isConsolidatedView}
                    canDelete={isGerente && isBranchHQ && !isConsolidatedView}
                    inTransitByMaster={inTransit.byMaster}
                />
            </div>


            {/* Modals & Helpers */}
            <StockAdjustmentModal
                product={adjustmentProduct}
                onClose={() => setAdjustmentProduct(null)}
                onSuccess={() => { toast.success('Stock actualizado correctamente'); }}
            />

            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Eliminar Producto"
                message={`¿Estás seguro de que deseas eliminar permanentemente a "${productToDelete?.name}"? Esta acción no se puede deshacer.`}
                confirmText="Sí, Eliminar"
                variant="danger"
                isLoading={isDeleting}
            />

            {showScanner && (
                <QRScanner
                    onClose={() => setShowScanner(false)}
                    onScan={(code) => { setSearchTerm(code); }}
                    title="Buscando Producto por QR..."
                />
            )}

            {showImportWizard && (
                <ImportWizard
                    onClose={() => setShowImportWizard(false)}
                    onImportComplete={() => {}}
                />
            )}
        </div>
    );
}
