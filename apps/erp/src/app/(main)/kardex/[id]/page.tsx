'use client';
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import {
    Package, ArrowUpRight, ArrowDownRight, History, DollarSign,
    Download, Filter, ChevronDown, ExternalLink, TrendingUp, TrendingDown,
    Minus, BookOpen, MapPin, Tag, Layers, ChevronRight, AlertTriangle,
    RefreshCw, FileSpreadsheet, X, BarChart2, RotateCcw
} from 'lucide-react';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { ensureDate } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';
import {
    doc, getDoc, collection, query, where, orderBy,
    getDocs, limit, QueryConstraint,
    addDoc, Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Product, InventoryMovement } from '@/types';
import ModuleHeader from '@/components/common/ModuleHeader';
import KpiCard from '@/components/common/KpiCard';
import clsx from 'clsx';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTRY_TYPES = new Set([
    'ENTRADA', 'TRASP_ENTRADA', 'TRASP_REVERSAL', 'GARANTIA_ENTRADA',
    'ANULACION', 'CARGA_INICIAL', 'REPOSICION'
]);
const EXIT_TYPES = new Set([
    'SALIDA', 'TRASP_SALIDA', 'GARANTIA_SALIDA'
]);

// AJUSTE: classify by quantity sign (positive = stock gain, negative = stock loss)
function classifyMovement(m: InventoryMovement): 'entrada' | 'salida' | 'ajuste_pos' | 'ajuste_neg' {
    if (ENTRY_TYPES.has(m.type)) return 'entrada';
    if (EXIT_TYPES.has(m.type)) return 'salida';
    if (m.type === 'AJUSTE' || m.type === 'AJUSTE_MASIVO') {
        return m.quantity >= 0 ? 'ajuste_pos' : 'ajuste_neg';
    }
    return m.quantity >= 0 ? 'entrada' : 'salida';
}

const TYPE_LABELS: Record<string, string> = {
    ENTRADA: 'Entrada Manual',
    SALIDA: 'Salida Manual',
    AJUSTE: 'Ajuste de Stock',
    AJUSTE_MASIVO: 'Ajuste Masivo',
    TRASP_SALIDA: 'Despacho TRF',
    TRASP_ENTRADA: 'Recepción TRF',
    TRASP_REVERSAL: 'Reversa TRF',
    ANULACION: 'Anulación Venta',
    GARANTIA_SALIDA: 'Garantía Salida',
    GARANTIA_ENTRADA: 'Garantía Entrada',
    CARGA_INICIAL: 'Carga Inicial',
    REPOSICION: 'Reposición',
};

const ALL_TYPES = Object.keys(TYPE_LABELS);
const MOV_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type MovPageSize = typeof MOV_PAGE_SIZE_OPTIONS[number];
const MAX_FETCH = 500;

function getRefLink(m: InventoryMovement): { href: string; label: string } | null {
    if (!m.referenceId) return null;
    if (m.type === 'TRASP_ENTRADA' || m.type === 'TRASP_SALIDA' || m.type === 'TRASP_REVERSAL') {
        return { href: `/envios/${m.referenceId}`, label: m.referenceId.slice(-6).toUpperCase() };
    }
    if (m.type === 'AJUSTE' && m.referenceId) {
        return { href: `/envios/${m.referenceId}`, label: m.referenceId.slice(-6).toUpperCase() };
    }
    if (m.type === 'ANULACION' || m.type === 'SALIDA' || m.type === 'GARANTIA_ENTRADA' || m.type === 'GARANTIA_SALIDA') {
        return { href: '/ventas', label: m.referenceId.slice(-6).toUpperCase() };
    }
    if (m.type === 'ENTRADA' || m.type === 'REPOSICION' || m.type === 'CARGA_INICIAL') {
        return { href: '/compras', label: m.referenceId.slice(-6).toUpperCase() };
    }
    return { href: '#', label: m.referenceId.slice(-6).toUpperCase() };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function KardexDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { id } = params;
    const { currentBranch, isConsolidatedView, loading: branchLoading, branches } = useBranch();
    const { role, user } = useAuth();
    const isGerente = role === 'GERENTE';

    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    const [movPage, setMovPage] = useState(1);
    const [movPageSize, setMovPageSize] = useState<MovPageSize>(50);
    const [showChart, setShowChart] = useState(true);
    const [showInsights, setShowInsights] = useState(false);
    const [selectedMovement, setSelectedMovement] = useState<InventoryMovement | null>(null);
    const [revertingId, setRevertingId] = useState<string | null>(null);

    // Filters
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('ALL');
    const [branchFilter, setBranchFilter] = useState<string>('ALL');
    const [directionFilter, setDirectionFilter] = useState<'ALL' | 'ENTRADAS' | 'SALIDAS' | 'AJUSTES' | 'DISCREPANCIAS'>('ALL');
    const [userFilter, setUserFilter] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        if (!id || branchLoading) return;
        async function fetchProduct() {
            try {
                let foundProduct: Product | null = null;
                const idStr = id as string;

                if (idStr.startsWith('virtual-')) {
                    // Formato: virtual-masterId-branchId
                    const parts = idStr.split('-');
                    const branchId = parts[parts.length - 1];
                    const masterId = parts.slice(1, -1).join('-');

                    const masterRef = doc(db, 'catalogo_maestro', masterId);
                    const masterSnap = await getDoc(masterRef);

                    if (masterSnap.exists()) {
                        const m = masterSnap.data();
                        foundProduct = {
                            id: idStr,
                            masterId: masterSnap.id,
                            codigo: m.codigo || 'S/N',
                            nombre: m.nombre || 'Producto no vinculado',
                            marca: m.marcaId || 'N/A',
                            categoria: m.categoriaId || 'N/A',
                            origen: m.origen || '',
                            codigoOE: m.codigoOE || '',
                            codigoFabrica: m.codigoFabrica || '',
                            unidad: m.unidad || 'PZA',
                            costo: m.costoBase || 0,
                            precio: m.precioDefault || 0,
                            stock: 0,
                            branchId: branchId,
                            isActive: m.isActive ?? true,
                        } as unknown as Product;
                    }
                } else {
                    const docRef = doc(db, 'productos', idStr);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        foundProduct = { id: docSnap.id, ...docSnap.data() } as Product;
                    } else {
                        // Intentar buscar como si fuera el masterId directamente por si acaso
                        const masterRef = doc(db, 'catalogo_maestro', idStr);
                        const masterSnap = await getDoc(masterRef);
                        if (masterSnap.exists()) {
                            const m = masterSnap.data();
                            foundProduct = {
                                id: `virtual-${masterSnap.id}-${currentBranch?.id || ''}`,
                                masterId: masterSnap.id,
                                codigo: m.codigo || 'S/N',
                                nombre: m.nombre || 'Producto no vinculado',
                                marca: m.marcaId || 'N/A',
                                categoria: m.categoriaId || 'N/A',
                                origen: m.origen || '',
                                codigoOE: m.codigoOE || '',
                                codigoFabrica: m.codigoFabrica || '',
                                unidad: m.unidad || 'PZA',
                                costo: m.costoBase || 0,
                                precio: m.precioDefault || 0,
                                stock: 0,
                                branchId: currentBranch?.id || '',
                                isActive: m.isActive ?? true,
                            } as unknown as Product;
                        }
                    }
                }

                if (foundProduct) {
                    setProduct(foundProduct);
                }
            } catch (e) {
                console.error('[Kardex] Failed to fetch product', e);
            } finally {
                setLoading(false);
            }
        }
        fetchProduct();
    }, [id, branchLoading, currentBranch?.id]);

    useEffect(() => {
        if (!id || branchLoading || !product) return;
        fetchMovementsData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, currentBranch?.id, isConsolidatedView, branchLoading, product, dateFrom, dateTo, typeFilter, branchFilter]);

    // Reset to page 1 when filters or page size change
    useEffect(() => { setMovPage(1); }, [dateFrom, dateTo, typeFilter, branchFilter, directionFilter, userFilter, movPageSize]);

    const fetchMovementsData = useCallback(async () => {
        if (!id) return;
        try {
            const constraints: QueryConstraint[] = [orderBy('date', 'desc')];
            if (isConsolidatedView && product?.masterId) {
                constraints.push(where('masterId', '==', product.masterId));
            } else {
                constraints.push(where('productId', '==', id as string));
                if (!isConsolidatedView && currentBranch?.id) constraints.push(where('branchId', '==', currentBranch.id));
            }
            if (typeFilter !== 'ALL') constraints.push(where('type', '==', typeFilter));
            if (isConsolidatedView && branchFilter !== 'ALL') constraints.push(where('branchId', '==', branchFilter));
            constraints.push(limit(MAX_FETCH));

            const q = query(collection(db, 'movimientos'), ...constraints);
            const snapshot = await getDocs(q);
            const movs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as InventoryMovement[];
            const result = movs.filter(m => {
                const d = ensureDate(m.date);
                if (dateFrom && d < new Date(`${dateFrom}T00:00:00-04:00`)) return false;
                if (dateTo && d > new Date(`${dateTo}T23:59:59-04:00`)) return false;
                if (userFilter.trim()) {
                    const u = (m.userName ?? '').toLowerCase();
                    if (!u.includes(userFilter.trim().toLowerCase())) return false;
                }
                if (directionFilter === 'ENTRADAS') {
                    const cls = classifyMovement(m);
                    if (cls !== 'entrada' && cls !== 'ajuste_pos') return false;
                } else if (directionFilter === 'SALIDAS') {
                    const cls = classifyMovement(m);
                    if (cls !== 'salida' && cls !== 'ajuste_neg') return false;
                } else if (directionFilter === 'AJUSTES') {
                    if (m.type !== 'AJUSTE' && m.type !== 'AJUSTE_MASIVO') return false;
                } else if (directionFilter === 'DISCREPANCIAS') {
                    const isDisc = m.type === 'AJUSTE' && m.referenceId != null &&
                        (m.reason?.toLowerCase().includes('discrepancia') ||
                         m.reason?.toLowerCase().includes('sobrante') ||
                         m.reason?.toLowerCase().includes('faltante') ||
                         m.reason?.toLowerCase().includes('merma'));
                    if (!isDisc) return false;
                }
                return true;
            });
            setMovements(result);
        } catch { }
    }, [id, currentBranch?.id, isConsolidatedView, product, dateFrom, dateTo, typeFilter, branchFilter]);

    const totals = useMemo(() => {
        let entradas = 0, salidas = 0, valEntradas = 0, valSalidas = 0;
        for (const m of movements) {
            const cls = classifyMovement(m);
            const qty = Math.abs(m.quantity);
            const cost = m.unitCost ?? 0;
            if (cls === 'entrada' || cls === 'ajuste_pos') { entradas += qty; valEntradas += qty * cost; }
            else { salidas += qty; valSalidas += qty * cost; }
        }
        return { entradas, salidas, valEntradas, valSalidas };
    }, [movements]);

    const analytics = useMemo(() => {
        if (movements.length === 0) return null;
        // Most frequent type
        const typeCounts: Record<string, number> = {};
        for (const m of movements) typeCounts[m.type] = (typeCounts[m.type] ?? 0) + 1;
        const [mostFreqType, mostFreqCount] = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
        const mostFreqPct = ((mostFreqCount / movements.length) * 100).toFixed(0);
        // Trend alert: last 10 all exits
        const trendAlert = movements.slice(0, 10).length >= 5 &&
            movements.slice(0, 10).every(m => { const c = classifyMovement(m); return c === 'salida' || c === 'ajuste_neg'; });
        // WAP (Costo Promedio Ponderado)
        let wapNum = 0, wapDen = 0;
        for (const m of movements) {
            const cls = classifyMovement(m);
            if ((cls === 'entrada' || cls === 'ajuste_pos') && m.unitCost != null) {
                const qty = Math.abs(m.quantity); wapNum += qty * m.unitCost; wapDen += qty;
            }
        }
        const wap = wapDen > 0 ? wapNum / wapDen : null;
        // Rotation (salidas / days * 30)
        const sorted = [...movements].sort((a, b) => ensureDate(a.date).getTime() - ensureDate(b.date).getTime());
        const periodDays = sorted.length > 1
            ? Math.max(1, Math.ceil((ensureDate(sorted[sorted.length - 1].date).getTime() - ensureDate(sorted[0].date).getTime()) / 86400000))
            : null;
        const rotation = periodDays && totals.salidas > 0 ? (totals.salidas / periodDays * 30).toFixed(1) : null;
        const unitCostBs = (wapDen > 0 ? wapNum / wapDen : null) ?? product?.costo ?? null;
        const rotationBs = rotation != null && unitCostBs != null && unitCostBs > 0
            ? (parseFloat(rotation) * unitCostBs).toFixed(2) : null;
        return { mostFreqType, mostFreqLabel: TYPE_LABELS[mostFreqType] ?? mostFreqType, mostFreqPct, trendAlert, wap, rotation, rotationBs };
    }, [movements, totals, product]);

    const chartData = useMemo(() => {
        const sorted = [...movements].sort((a, b) => ensureDate(a.date).getTime() - ensureDate(b.date).getTime());
        // One point per movement with full detail; aggregate same-day duplicates by keeping last stock
        const byDay = new Map<string, { date: string; fullDate: string; stock: number; type: string; qty: number; label: string }>();
        for (const m of sorted) {
            const d = ensureDate(m.date);
            const key = d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: '2-digit' });
            const short = d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit' });
            byDay.set(key, {
                date: short,
                fullDate: d.toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' }),
                stock: m.currentStock ?? 0,
                type: TYPE_LABELS[m.type] ?? m.type,
                qty: m.quantity,
                label: m.reason ?? '',
            });
        }
        return Array.from(byDay.values());
    }, [movements]);

    const movTotalPages = Math.max(1, Math.ceil(movements.length / movPageSize));
    const paginatedMovements = useMemo(
        () => movements.slice((movPage - 1) * movPageSize, movPage * movPageSize),
        [movements, movPage, movPageSize]
    );

    function buildFilterSuffix() {
        const parts: string[] = [];
        if (dateFrom) parts.push(`desde_${dateFrom}`);
        if (dateTo) parts.push(`hasta_${dateTo}`);
        if (typeFilter !== 'ALL') parts.push(typeFilter.toLowerCase());
        return parts.length > 0 ? `_${parts.join('_')}` : '';
    }

    function handleExport() {
        if (!product) return;
        const headers = ['Fecha', 'Hora', 'Tipo', 'Detalle', 'Referencia', 'Entrada', 'Salida', 'Costo Unit.', 'Valor Mov.', 'Stock', 'Responsable', 'Sucursal', 'Notas'];
        const rows = movements.map(m => {
            const d = ensureDate(m.date);
            const cls = classifyMovement(m);
            const qty = Math.abs(m.quantity);
            const isIn = cls === 'entrada' || cls === 'ajuste_pos';
            const notes = m.notes ?? '';
            return [
                d.toLocaleDateString('es-BO'), d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }),
                TYPE_LABELS[m.type] ?? m.type, `"${(m.reason ?? '').replace(/"/g, '""')}"`,
                m.referenceId ?? '', isIn ? qty : '', !isIn ? qty : '',
                m.unitCost?.toFixed(2) ?? '', m.unitCost ? (qty * m.unitCost).toFixed(2) : '',
                m.currentStock ?? '', m.userName ?? 'SISTEMA', m.branchId ?? '',
                `"${notes.replace(/"/g, '""')}"`,
            ].join(';');
        });
        const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `kardex_${product.codigo}${buildFilterSuffix()}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function handleExportExcel() {
        if (!product) return;
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet(`Kardex ${product.codigo}`);
        const headerRow = ws.addRow(['Fecha', 'Hora', 'Tipo', 'Detalle', 'Referencia', 'Entrada', 'Salida', 'Costo Unit.', 'Valor Mov.', 'Stock', 'Responsable', 'Sucursal']);
        headerRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        ws.getRow(1).height = 24;
        ws.columns = [{ width: 14 }, { width: 8 }, { width: 18 }, { width: 35 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 20 }, { width: 14 }];
        movements.forEach(m => {
            const d = ensureDate(m.date);
            const cls = classifyMovement(m);
            const qty = Math.abs(m.quantity);
            const isIn = cls === 'entrada' || cls === 'ajuste_pos';
            const row = ws.addRow([
                d.toLocaleDateString('es-BO'), d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }),
                TYPE_LABELS[m.type] ?? m.type, m.reason ?? '', m.referenceId ?? '',
                isIn ? qty : null, !isIn ? qty : null,
                m.unitCost ?? null, m.unitCost ? qty * m.unitCost : null,
                m.currentStock ?? null, m.userName ?? 'SISTEMA', m.branchId ?? '',
            ]);
            if (isIn) row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
            else row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE8E8' } };
            [8, 9].forEach(col => { const cell = row.getCell(col); if (cell.value != null) cell.numFmt = '#,##0.00'; });
        });
        ws.addRow([]);
        const sumRow = ws.addRow(['TOTALES', '', '', '', '', totals.entradas, totals.salidas, '', isGerente ? totals.valEntradas - totals.valSalidas : null]);
        sumRow.font = { bold: true };
        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `kardex_${product.codigo}${buildFilterSuffix()}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function handleRevert(m: InventoryMovement) {
        if (!product || !user) return;
        if (m.type !== 'AJUSTE' && m.type !== 'AJUSTE_MASIVO') return;
        setRevertingId(m.id ?? null);
        try {
            const inverseQty = -m.quantity;
            await addDoc(collection(db, 'movimientos'), {
                productId: m.productId, masterId: m.masterId, branchId: m.branchId,
                type: 'AJUSTE', quantity: inverseQty,
                currentStock: (product.stock ?? 0) + inverseQty,
                previousStock: product.stock ?? 0,
                reason: `Reversa de ajuste: ${m.reason}`,
                referenceId: m.id, date: Timestamp.now(),
                userId: user.uid, userName: user.displayName ?? user.email ?? 'SISTEMA',
            });
            await fetchMovementsData();
        } catch { } finally { setRevertingId(null); }
    }

    // Skeleton
    if (loading || branchLoading) return (
        <div className="flex-1 p-4 md:p-6 space-y-4 bg-slate-50 dark:bg-background animate-pulse">
            <div className="h-8 w-40 bg-white dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10" />
            <div className="h-24 bg-white dark:bg-white/5 rounded-3xl border border-slate-200 dark:border-white/10" />
            <div className="h-20 bg-white dark:bg-white/5 rounded-3xl border border-slate-200 dark:border-white/10" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10" />)}
            </div>
            <div className="h-64 bg-white dark:bg-white/5 rounded-3xl border border-slate-200 dark:border-white/10" />
        </div>
    );
    if (!product) return <div className="p-10 text-center text-red-500 font-black">Producto no encontrado</div>;

    const hasFilters = dateFrom || dateTo || typeFilter !== 'ALL' || directionFilter !== 'ALL' || userFilter.trim() || (isConsolidatedView && branchFilter !== 'ALL');

    return (
        <div id="kardex-print" className="flex-1 min-w-0 w-full max-w-full flex flex-col overflow-y-auto bg-slate-50 dark:bg-background pb-20 print:bg-white print:overflow-visible">
            <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5">

                {/* Breadcrumb */}
                <nav className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest print:hidden">
                    <button onClick={() => router.push('/kardex')} className="text-blue-500 hover:text-blue-600 transition-colors">Kardex</button>
                    <ChevronRight size={10} className="text-slate-300 dark:text-slate-600" />
                    <span className="text-slate-500 dark:text-slate-400 wrap-break-word">{product.nombre}</span>
                </nav>

                <ModuleHeader
                    title="Kardex de Inventario"
                    subtitle="Historial completo de movimientos y trazabilidad"
                    icon={History}
                    onBack={() => router.push('/kardex')}
                    badge={product.codigo}
                    actions={[
                        { label: 'Excel', subtitle: 'Formato .xlsx', onClick: handleExportExcel, icon: FileSpreadsheet, variant: 'secondary' },
                        { label: 'CSV', subtitle: 'Texto plano', onClick: handleExport, icon: Download, variant: 'secondary' },
                    ]}
                />

                {/* Trend Alert */}
                {analytics?.trendAlert && (
                    <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl px-5 py-3.5 print:hidden">
                        <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Alerta de Tendencia</p>
                            <p className="text-[11px] text-amber-600 dark:text-amber-300 mt-0.5">Los últimos movimientos son todos <strong>salidas o ajustes negativos</strong>. Considera reabastecer este producto.</p>
                        </div>
                    </div>
                )}

                {/* Product Header */}
                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-3xl p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-center text-blue-500 border border-slate-100 dark:border-white/10 shrink-0">
                            <Package size={24} strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight leading-tight wrap-break-word">{product.nombre}</h2>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {product.marca && <MetaBadge icon={Tag} label={product.marca} color="blue" />}
                                {product.categoria && <MetaBadge icon={Layers} label={product.categoria} color="indigo" />}
                                {product.ubicacionFisica && <MetaBadge icon={MapPin} label={product.ubicacionFisica as string} color="amber" />}
                                {product.codigoOE && <MetaBadge icon={BookOpen} label={`OEM: ${product.codigoOE}`} color="gray" />}
                                {product.codigoFabrica && <MetaBadge icon={BookOpen} label={`FÁB: ${product.codigoFabrica}`} color="gray" />}
                                <span className="text-[9px] font-black uppercase tracking-widest bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 px-2 py-1 rounded-xl border border-slate-200 dark:border-white/10">
                                    {product.unidad as string || 'PZA'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* KPIs — compact, non-collapsible */}
                <div data-tour="kardex-kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <CompactKpi
                        label="Stock Disponible"
                        value={product.stock}
                        sub={`Reorden: ${product.minStock || 5}`}
                        icon={Package}
                        color={product.stock <= (product.minStock || 5) ? 'red' : 'gold'}
                    />
                    {isGerente && (
                        <CompactKpi
                            label="Valuación Actual"
                            value={`Bs. ${((product.costo || 0) * product.stock).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            sub={`Costo: Bs. ${(product.costo || 0).toFixed(2)}`}
                            icon={DollarSign}
                            color="blue"
                        />
                    )}
                    <CompactKpi
                        label={`Entradas (${movements.length > 0 ? 'período' : '—'})`}
                        value={totals.entradas}
                        sub={isGerente ? `Bs. ${totals.valEntradas.toFixed(2)}` : ''}
                        icon={TrendingUp}
                        color="green"
                    />
                    <CompactKpi
                        label={`Salidas (${movements.length > 0 ? 'período' : '—'})`}
                        value={totals.salidas}
                        sub={isGerente ? `Bs. ${totals.valSalidas.toFixed(2)}` : ''}
                        icon={TrendingDown}
                        color="red"
                    />
                </div>

                {/* Insights — collapsible */}
                {analytics && movements.length > 0 && (
                    <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm print:hidden">
                        <button
                            onClick={() => setShowInsights(v => !v)}
                            className="w-full flex items-center justify-between px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        >
                            <span className="flex items-center gap-2"><BarChart2 size={14} /> Análisis del Período</span>
                            <ChevronDown size={14} className={clsx('transition-transform', showInsights && 'rotate-180')} />
                        </button>
                        {showInsights && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pb-4 border-t border-slate-100 dark:border-white/10 pt-4">
                                <InsightCard label="Tipo más frecuente" value={analytics.mostFreqLabel} sub={`${analytics.mostFreqPct}% de los movimientos`} icon={BarChart2} color="blue" />
                                {isGerente && analytics.wap != null && <InsightCard label="Costo Prom. Ponderado" value={`Bs. ${analytics.wap.toFixed(2)}`} sub="Promedio entradas período" icon={DollarSign} color="indigo" />}
                                {analytics.rotation != null && (
                                    (() => {
                                        const costoUnit = (analytics.wap ?? product?.costo) ?? 0;
                                        const rotBs = costoUnit > 0 ? (parseFloat(analytics.rotation!) * costoUnit).toFixed(2) : null;
                                        return <InsightCard label="Rotación Mensual Est." value={rotBs != null ? `Bs. ${rotBs}` : `${analytics.rotation} uds`} sub={rotBs != null ? `${analytics.rotation} uds/mes` : 'Salidas proyectadas/mes'} icon={RefreshCw} color="green" />;
                                    })()
                                )}
                                <InsightCard label="Balance Neto" value={`${totals.entradas - totals.salidas >= 0 ? '+' : ''}${totals.entradas - totals.salidas}`} sub={`E: ${totals.entradas} · S: ${totals.salidas}`} icon={totals.entradas >= totals.salidas ? TrendingUp : TrendingDown} color={totals.entradas >= totals.salidas ? 'green' : 'red'} />
                            </div>
                        )}
                    </div>
                )}

                {/* Stock Chart */}
                {chartData.length > 1 && (
                    <div data-tour="kardex-chart" className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm print:hidden">
                        <button onClick={() => setShowChart(v => !v)} className="w-full flex items-center justify-between px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                            <span className="flex items-center gap-2"><BarChart2 size={14} /> Evolución del Stock</span>
                            <div className="flex items-center gap-3">
                                {product.minStock != null && (
                                    <span className="flex items-center gap-1 text-rose-500 text-[9px] font-black">
                                        <span className="w-4 border-t-2 border-dashed border-rose-400 inline-block" /> Mín: {product.minStock}
                                    </span>
                                )}
                                <ChevronDown size={14} className={clsx('transition-transform', showChart && 'rotate-180')} />
                            </div>
                        </button>
                        {showChart && (
                            <div className="px-2 sm:px-4 pb-5 border-t border-slate-100 dark:border-white/10 pt-4">
                                <ResponsiveContainer width="100%" height={260}>
                                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="stockGradLow" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f080" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}
                                            interval="preserveStartEnd"
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}
                                            tickLine={false}
                                            axisLine={false}
                                            width={32}
                                        />
                                        <Tooltip content={<StockChartTooltip />} />
                                        {product.minStock != null && (
                                            <ReferenceLine
                                                y={product.minStock}
                                                stroke="#f43f5e"
                                                strokeDasharray="4 3"
                                                strokeWidth={1.5}
                                                label={{ value: `Mín ${product.minStock}`, position: 'insideTopRight', fontSize: 9, fontWeight: 700, fill: '#f43f5e', dy: -4 }}
                                            />
                                        )}
                                        <Area
                                            type="monotone"
                                            dataKey="stock"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            fill="url(#stockGrad)"
                                            dot={chartData.length <= 30 ? { r: 3, fill: '#3b82f6', strokeWidth: 0 } : false}
                                            activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                                <p className="text-[9px] text-slate-400 font-bold text-center mt-1">
                                    {chartData.length} puntos · {movements.length} movimientos totales
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Filters */}
                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm print:hidden">
                    <button onClick={() => setShowFilters(v => !v)} className="w-full flex items-center justify-between px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                        <span className="flex items-center gap-2">
                            <Filter size={14} /> Filtros
                            {hasFilters && <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[8px] font-black flex items-center justify-center">!</span>}
                        </span>
                        <ChevronDown size={14} className={clsx('transition-transform', showFilters && 'rotate-180')} />
                    </button>
                    {showFilters && (
                        <div className="px-5 pb-5 border-t border-slate-100 dark:border-white/10 pt-4 space-y-4">
                            {/* Fila 1: fechas + tipo + sucursal */}
                            <div className={clsx('grid gap-4',
                                isConsolidatedView && branches && branches.length > 0 ? 'grid-cols-1 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3')}>
                                <FilterField label="Desde">
                                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full h-10 px-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30" />
                                </FilterField>
                                <FilterField label="Hasta">
                                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full h-10 px-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30" />
                                </FilterField>
                                <FilterField label="Tipo de Movimiento">
                                    <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-full h-10 px-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30">
                                        <option value="ALL">Todos los tipos</option>
                                        {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                                    </select>
                                </FilterField>
                                {isConsolidatedView && branches && branches.length > 0 && (
                                    <FilterField label="Sucursal">
                                        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="w-full h-10 px-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30">
                                            <option value="ALL">Todas las sucursales</option>
                                            {(branches as { id: string; name: string }[]).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </FilterField>
                                )}
                            </div>
                            {/* Fila 2: dirección + responsable */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FilterField label="Dirección">
                                    <select value={directionFilter} onChange={e => setDirectionFilter(e.target.value as typeof directionFilter)} className="w-full h-10 px-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30">
                                        <option value="ALL">Todas las direcciones</option>
                                        <option value="ENTRADAS">↑ Solo entradas (suma stock)</option>
                                        <option value="SALIDAS">↓ Solo salidas (resta stock)</option>
                                        <option value="AJUSTES">⚖ Solo ajustes manuales</option>
                                        <option value="DISCREPANCIAS">⚠️ Solo ajustes por discrepancia</option>
                                    </select>
                                </FilterField>
                                <FilterField label="Responsable">
                                    <input
                                        type="text"
                                        value={userFilter}
                                        onChange={e => setUserFilter(e.target.value)}
                                        placeholder="Nombre del usuario…"
                                        className="w-full h-10 px-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30"
                                    />
                                </FilterField>
                            </div>
                            {hasFilters && (
                                <button onClick={() => { setDateFrom(''); setDateTo(''); setTypeFilter('ALL'); setBranchFilter('ALL'); setDirectionFilter('ALL'); setUserFilter(''); }}
                                    className="text-[10px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-600 flex items-center gap-1">
                                    <X size={10} /> Limpiar filtros
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Table */}
                <div data-tour="kardex-table" className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl flex flex-col">
                    {/* Mobile */}
                    <div className="md:hidden print:hidden">
                        {movements.length === 0 ? <EmptyState /> : (
                            <div className="relative pl-4 border-l-2 border-slate-100 dark:border-white/10 ml-4 space-y-4 py-6">
                                {paginatedMovements.map(m => <MobileRow key={m.id} m={m} isGerente={isGerente} onClick={() => setSelectedMovement(m)} />)}
                            </div>
                        )}
                    </div>
                    {/* Desktop */}
                    <div className="hidden md:flex flex-col print:flex">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="bg-slate-50 dark:bg-[#0f1117] sticky top-0 z-10 print:static shadow-sm">
                                    <tr className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b-2 border-slate-200 dark:border-white/10">
                                        <th className="px-5 py-4 border-b border-slate-100 dark:border-white/10">Fecha / Hora</th>
                                        <th className="px-5 py-4 border-b border-slate-100 dark:border-white/10">Tipo</th>
                                        <th className="px-5 py-4 border-b border-slate-100 dark:border-white/10">Detalle / Referencia</th>
                                        <th className="px-5 py-4 border-b border-slate-100 dark:border-white/10 text-center">Entrada</th>
                                        <th className="px-5 py-4 border-b border-slate-100 dark:border-white/10 text-center">Salida</th>
                                        {isGerente && <th className="px-5 py-4 border-b border-slate-100 dark:border-white/10 text-right">Costo Unit.</th>}
                                        {isGerente && <th className="px-5 py-4 border-b border-slate-100 dark:border-white/10 text-right">Valor Mov.</th>}
                                        <th className="px-5 py-4 border-b border-slate-100 dark:border-white/10">Responsable</th>
                                        <th className="px-5 py-4 border-b border-slate-100 dark:border-white/10 text-right pr-6">Stock</th>
                                        <th className="px-3 py-4 border-b border-slate-100 dark:border-white/10 print:hidden" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-gray-800/80">
                                    {movements.length === 0 ? (
                                        <tr>
                                            <td colSpan={isGerente ? 10 : 8} className="p-12 text-center text-slate-400 dark:text-slate-500">
                                                <History size={36} strokeWidth={1} className="mx-auto mb-3 opacity-30" />
                                                <span className="block text-[10px] font-black uppercase tracking-widest">Sin movimientos para este período</span>
                                            </td>
                                        </tr>
                                    ) : paginatedMovements.map(m => (
                                        <DesktopRow key={m.id} m={m} isGerente={isGerente} onClick={() => setSelectedMovement(m)} onRevert={handleRevert} revertingId={revertingId} />
                                    ))}
                                </tbody>
                                {movements.length > 0 && (
                                    <tfoot className="bg-slate-50 dark:bg-[#0f1117] border-t-2 border-slate-200 dark:border-white/10">
                                        <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                            <td colSpan={3} className="px-5 py-3">Totales del período ({movements.length} movs.)</td>
                                            <td className="px-5 py-3 text-center text-emerald-600 dark:text-emerald-400 font-mono">{totals.entradas}</td>
                                            <td className="px-5 py-3 text-center text-rose-500 font-mono">{totals.salidas}</td>
                                            {isGerente && <td className="px-5 py-3 text-right">—</td>}
                                            {isGerente && <td className="px-5 py-3 text-right font-mono text-slate-700 dark:text-slate-300">Bs. {(totals.valEntradas - totals.valSalidas).toFixed(2)}</td>}
                                            <td colSpan={3} />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                        {/* Pagination controls */}
                        {movements.length > 0 && (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-white/10 print:hidden">
                                {/* Counter + page size */}
                                <div className="flex items-center gap-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        {movements.length === 0 ? '0 movs.' : `${(movPage - 1) * movPageSize + 1}–${Math.min(movPage * movPageSize, movements.length)} de ${movements.length} movs.`}
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Por pág.</span>
                                        {MOV_PAGE_SIZE_OPTIONS.map(n => (
                                            <button key={n} onClick={() => setMovPageSize(n)}
                                                className={clsx('w-9 h-6 rounded-xl text-[9px] font-black transition-all',
                                                    movPageSize === n
                                                        ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                                                        : 'bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-400'
                                                )}>
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Page buttons */}
                                {movTotalPages > 1 && (
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => setMovPage(1)} disabled={movPage === 1}
                                            className="w-7 h-7 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background text-[10px] font-black text-slate-500 disabled:opacity-30 hover:border-blue-400 transition-colors">
                                            «
                                        </button>
                                        <button onClick={() => setMovPage(p => Math.max(1, p - 1))} disabled={movPage === 1}
                                            className="w-7 h-7 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background text-[10px] font-black text-slate-500 disabled:opacity-30 hover:border-blue-400 transition-colors">
                                            ‹
                                        </button>
                                        {Array.from({ length: Math.min(5, movTotalPages) }, (_, i) => {
                                            const start = Math.max(1, Math.min(movPage - 2, movTotalPages - 4));
                                            return start + i;
                                        }).map(n => (
                                            <button key={n} onClick={() => setMovPage(n)}
                                                className={clsx('w-7 h-7 rounded-xl text-[10px] font-black transition-all',
                                                    movPage === n
                                                        ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                                                        : 'bg-white dark:bg-background border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-blue-400'
                                                )}>
                                                {n}
                                            </button>
                                        ))}
                                        <button onClick={() => setMovPage(p => Math.min(movTotalPages, p + 1))} disabled={movPage === movTotalPages}
                                            className="w-7 h-7 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background text-[10px] font-black text-slate-500 disabled:opacity-30 hover:border-blue-400 transition-colors">
                                            ›
                                        </button>
                                        <button onClick={() => setMovPage(movTotalPages)} disabled={movPage === movTotalPages}
                                            className="w-7 h-7 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background text-[10px] font-black text-slate-500 disabled:opacity-30 hover:border-blue-400 transition-colors">
                                            »
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedMovement && (
                <MovementDetailModal m={selectedMovement} isGerente={isGerente} branches={branches} onClose={() => setSelectedMovement(null)} />
            )}
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function isDiscrepancyMove(m: InventoryMovement): boolean {
    // Ajuste de corrección originado en una discrepancia de traspaso
    if (m.type === 'AJUSTE' && m.referenceId != null &&
        !!(m.reason?.toLowerCase().includes('discrepancia') ||
           m.reason?.toLowerCase().includes('sobrante') ||
           m.reason?.toLowerCase().includes('faltante') ||
           m.reason?.toLowerCase().includes('merma'))) {
        return true;
    }
    // TRASP_ENTRADA donde lo recibido ≠ lo enviado (ej: "10/15 enviados")
    if (m.type === 'TRASP_ENTRADA') {
        const match = m.reason?.match(/(\d+)\/(\d+)\s*enviados/i);
        if (match && Number(match[1]) !== Number(match[2])) return true;
    }
    return false;
}

function DesktopRow({ m, isGerente, onClick, onRevert, revertingId }: {
    m: InventoryMovement;
    isGerente: boolean;
    onClick: () => void;
    onRevert: (m: InventoryMovement) => void;
    revertingId: string | null;
}) {
    const date = ensureDate(m.date);
    const cls = classifyMovement(m);
    const isIn = cls === 'entrada' || cls === 'ajuste_pos';
    const qty = Math.abs(m.quantity);
    const refLink = getRefLink(m);
    const cost = m.unitCost;
    const movValue = cost != null ? qty * cost : null;
    const canRevert = isGerente && (m.type === 'AJUSTE' || m.type === 'AJUSTE_MASIVO');
    const notes = m.notes;

    return (
        <tr onClick={onClick} className="hover:bg-slate-50/80 dark:hover:bg-white/3 transition-colors cursor-pointer group/row">
            <td className="px-5 py-4">
                <div className="text-[11px] font-black text-slate-900 dark:text-white font-mono leading-none">{date.toLocaleDateString('es-BO')}</div>
                <div className="text-[10px] font-bold text-slate-400 font-mono mt-0.5">{date.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</div>
            </td>
            <td className="px-5 py-4"><TypeBadge type={m.type} cls={cls} reason={m.reason} />
                {isDiscrepancyMove(m) && (
                    <span className="mt-1 flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-300/50 dark:border-amber-500/30 rounded text-[8px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest w-fit">
                        ⚠ Disc.
                    </span>
                )}
            </td>
            <td className="px-5 py-4 max-w-xs">
                <div className="text-[11px] font-black text-slate-900 dark:text-white uppercase leading-snug wrap-break-word">{cleanReason(m.reason)}</div>
                {notes && <div className="text-[9px] text-slate-400 italic mt-0.5 wrap-break-word">{notes}</div>}
                {refLink ? (
                    <a href={refLink.href} onClick={e => e.stopPropagation()} className="text-[9px] font-black text-blue-500 hover:text-blue-600 uppercase tracking-widest flex items-center gap-1 mt-0.5 w-fit">
                        REF: {refLink.label} <ExternalLink size={10} />
                    </a>
                ) : (
                    <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">Sin referencia</span>
                )}
            </td>
            <td className="px-5 py-4 text-center">
                {isIn ? (() => {
                    const discrepancy = m.type === 'TRASP_ENTRADA' ? m.reason.match(/(\d+)\/(\d+)\s*enviados/i) : null;
                    const sent = discrepancy ? Number(discrepancy[2]) : null;
                    return (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] font-black font-mono text-emerald-600 dark:text-emerald-400">
                            <ArrowUpRight size={12} strokeWidth={3} /> {qty}
                            {sent != null && <span className="text-[9px] font-bold text-slate-400 ml-0.5">/{sent}</span>}
                        </span>
                    );
                })() : <span className="text-slate-200 dark:text-slate-700">—</span>}
            </td>
            <td className="px-5 py-4 text-center">
                {!isIn ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[11px] font-black font-mono text-rose-500">
                        <ArrowDownRight size={12} strokeWidth={3} /> {qty}
                    </span>
                ) : <span className="text-slate-200 dark:text-slate-700">—</span>}
            </td>
            {isGerente && (
                <td className="px-5 py-4 text-right">
                    <span className="text-[11px] font-black font-mono text-slate-500 dark:text-slate-400">
                        {cost != null ? `Bs. ${cost.toFixed(2)}` : <span className="opacity-30">—</span>}
                    </span>
                </td>
            )}
            {isGerente && (
                <td className="px-5 py-4 text-right">
                    <span className={clsx("text-[11px] font-black font-mono", movValue != null ? (isIn ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500") : "opacity-30 text-slate-400")}>
                        {movValue != null ? `Bs. ${movValue.toFixed(2)}` : '—'}
                    </span>
                </td>
            )}
            <td className="px-5 py-4">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-[10px] font-black text-slate-400 shrink-0">
                        {(m.userName ?? 'S').charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest wrap-break-word">{formatUserName(m.userName) || 'SISTEMA'}</span>
                </div>
            </td>
            <td className="px-5 py-4 text-right pr-3">
                <span className="text-sm font-black text-slate-900 dark:text-[#FFD700] font-mono tracking-tighter">{m.currentStock ?? '—'}</span>
            </td>
            <td className="px-2 py-4 print:hidden">
                {canRevert && (
                    <button onClick={e => { e.stopPropagation(); onRevert(m); }} disabled={revertingId === m.id}
                        title="Revertir ajuste"
                        className="w-7 h-7 flex items-center justify-center rounded-xl text-slate-300 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors disabled:opacity-40">
                        <RotateCcw size={13} />
                    </button>
                )}
            </td>
        </tr>
    );
}

function MobileRow({ m, isGerente, onClick }: { m: InventoryMovement; isGerente: boolean; onClick: () => void }) {
    const date = ensureDate(m.date);
    const cls = classifyMovement(m);
    const isIn = cls === 'entrada' || cls === 'ajuste_pos';
    const qty = Math.abs(m.quantity);
    const refLink = getRefLink(m);
    const movValue = m.unitCost != null ? qty * m.unitCost : null;
    const notes = m.notes;

    return (
        <div className="relative ml-2" onClick={onClick}>
            <div className={clsx("absolute -left-5.25 top-1 w-3 h-3 rounded-full border-2 ring-4 ring-white dark:ring-background",
                isIn ? "bg-emerald-500 border-emerald-100 dark:border-emerald-900" : "bg-rose-500 border-rose-100 dark:border-rose-900"
            )} />
            <div className="bg-slate-50 dark:bg-white/3 rounded-xl p-4 border border-slate-100 dark:border-white/10 ml-3 cursor-pointer hover:border-blue-400/50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{date.toLocaleDateString('es-BO')}</span>
                        <span className="text-[9px] font-mono text-slate-300 dark:text-slate-600 ml-2">{date.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <TypeBadge type={m.type} cls={cls} reason={m.reason} />
                        {isDiscrepancyMove(m) && (
                            <span className="px-1.5 py-0.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-300/50 dark:border-amber-500/30 rounded text-[8px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                                ⚠ Discrepancia
                            </span>
                        )}
                    </div>
                </div>
                <p className="font-black text-slate-900 dark:text-white text-[11px] uppercase leading-tight mb-0.5">{cleanReason(m.reason)}</p>
                {notes && <p className="text-[9px] text-slate-400 italic mb-1">{notes}</p>}
                {refLink && (
                    <a href={refLink.href} onClick={e => e.stopPropagation()} className="text-[9px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-1 mb-2">
                        REF: {refLink.label} <ExternalLink size={9} />
                    </a>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/10/50">
                    <div className="flex items-center gap-2">
                        <span className={clsx("text-xs font-black font-mono", isIn ? "text-emerald-500" : "text-rose-500")}>{isIn ? '+' : '-'}{qty}</span>
                        {isGerente && movValue != null && <span className="text-[9px] font-black text-slate-400">Bs. {movValue.toFixed(2)}</span>}
                    </div>
                    <div className="text-right">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Stock</span>
                        <span className="text-sm font-black font-mono text-slate-900 dark:text-white">{m.currentStock ?? '—'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MovementDetailModal({ m, isGerente, branches, onClose }: { m: InventoryMovement; isGerente: boolean; branches: import('@/types').Branch[]; onClose: () => void }) {
    const date = ensureDate(m.date);
    const cls = classifyMovement(m);
    const qty = Math.abs(m.quantity);
    const isIn = cls === 'entrada' || cls === 'ajuste_pos';
    const notes = m.notes;
    const refLink = getRefLink(m);

    return (
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm print:hidden" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="w-full max-w-md bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10">
                    <div className="flex items-center gap-3">
                        <TypeBadge type={m.type} cls={cls} reason={m.reason} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                            {date.toLocaleDateString('es-BO')} · {date.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                        <X size={16} />
                    </button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Detalle</p>
                        <p className="text-sm font-black text-slate-900 dark:text-white uppercase">{cleanReason(m.reason)}</p>
                        {notes && <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-1">{notes}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Cantidad</p>
                            <span className={clsx("text-xl font-black font-mono", isIn ? "text-emerald-500" : "text-rose-500")}>{isIn ? '+' : '-'}{qty}</span>
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Stock Resultante</p>
                            <span className="text-xl font-black font-mono text-slate-900 dark:text-[#FFD700]">{m.currentStock}</span>
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Stock Anterior</p>
                            <span className="text-sm font-black font-mono text-slate-500">{m.previousStock}</span>
                        </div>
                        {isGerente && m.unitCost != null && (
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Costo Unit.</p>
                                <span className="text-sm font-black font-mono text-slate-900 dark:text-white">Bs. {m.unitCost.toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-white/10">
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Responsable</p>
                            <p className="text-[11px] font-black text-slate-900 dark:text-white uppercase">{formatUserName(m.userName) || 'SISTEMA'}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Sucursal</p>
                            <p className="text-[11px] font-black text-slate-900 dark:text-white uppercase">{branches.find(b => b.id === m.branchId)?.name ?? m.branchId}</p>
                        </div>
                        {refLink && (
                            <div className="col-span-2">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Referencia</p>
                                <a href={refLink.href} className="text-[11px] font-black text-blue-500 hover:text-blue-600 flex items-center gap-1.5 uppercase tracking-widest">
                                    {refLink.label} <ExternalLink size={11} />
                                </a>
                            </div>
                        )}
                        {m.id && (
                            <div className="col-span-2">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">ID Movimiento</p>
                                <p className="text-[9px] font-mono text-slate-400 break-all">{m.id}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function InsightCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
    const colors: Record<string, string> = {
        blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
        indigo: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
        green: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        red: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    };
    return (
        <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4 flex items-start gap-3">
            <div className={clsx("w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border", colors[color] ?? colors.blue)}>
                <Icon size={14} />
            </div>
            <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
                <p className="text-sm font-black text-slate-900 dark:text-white leading-tight">{value}</p>
                {sub && <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

/** Limpia los prefijos "Migración compra #N" que generan los scripts de importación histórica */
function cleanReason(reason?: string): string {
    if (!reason) return '';
    // "Migración compra #1 IMPORTADORA RT (ABC123) — ENVD-0001" → "Compra IMPORTADORA RT — ENVD-0001"
    const migMatch = reason.match(/^Migración compra #\d+\s+(.+?)\s*\([^)]*\)\s*—\s*(ENVD-\d+)/i);
    if (migMatch) return `Compra ${migMatch[1]} — ${migMatch[2]}`;
    // "Migración compra #1 IMPORTADORA RT (ABC123) — ENVD-0001 (Alta Automática)" variant
    const migMatchAlt = reason.match(/^Migración compra #\d+\s+(.+?)\s*\([^)]*\)\s*—\s*(ENVD-\d+).*/i);
    if (migMatchAlt) return `Compra ${migMatchAlt[1]} — ${migMatchAlt[2]}`;
    return reason;
}

function TypeBadge({ type, cls, reason }: { type: string; cls: ReturnType<typeof classifyMovement>; reason?: string }) {
    const colors: Record<string, string> = {
        entrada: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
        salida: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20',
        ajuste_pos: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/20',
        ajuste_neg: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20',
    };
    const icon = cls === 'entrada' ? <ArrowUpRight size={10} strokeWidth={3} />
        : cls === 'salida' ? <ArrowDownRight size={10} strokeWidth={3} />
            : <Minus size={10} strokeWidth={3} />;
    // Sub-tipo: distinguir Compra de Entrada Manual segun el reason
    let label: string = TYPE_LABELS[type] ?? type;
    if (type === 'ENTRADA' && reason && /^Compra/i.test(reason)) label = 'Compra Proveedor';
    return (
        <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-xl text-[9px] font-black uppercase tracking-widest border', colors[cls] ?? colors.salida)}>
            {icon}{label}
        </span>
    );
}

function MetaBadge({ icon: Icon, label, color }: { icon: React.ElementType; label: string; color: string }) {
    const c: Record<string, string> = {
        blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
        indigo: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
        amber: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
        gray: 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10',
    };
    return (
        <span className={clsx('inline-flex items-center gap-1.5 px-2 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border', c[color] ?? c.gray)}>
            <Icon size={10} /> {label}
        </span>
    );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
            {children}
        </div>
    );
}

function CompactKpi({ label, value, sub, icon: Icon, color }: {
    label: string; value: string | number; sub?: string;
    icon?: React.ElementType; color?: string;
}) {
    const isGold = color === 'gold';
    const valueColor = isGold ? 'text-white dark:text-[#FFD700]'
        : color === 'blue'  ? 'text-blue-600 dark:text-blue-400'
        : color === 'green' ? 'text-emerald-600 dark:text-emerald-400'
        : color === 'red'   ? 'text-rose-600 dark:text-rose-400'
        : 'text-slate-900 dark:text-white';
    return (
        <div className={clsx(
            'px-3 py-2.5 rounded-2xl border flex flex-col gap-1 min-w-0',
            isGold
                ? 'bg-slate-900 border-white/5 shadow-md'
                : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 shadow-sm'
        )}>
            <div className={clsx('flex items-center gap-1.5', isGold ? 'text-white/30' : 'text-slate-400')}>
                {Icon && <Icon size={11} strokeWidth={2.5} />}
                <span className="text-[8px] font-black uppercase tracking-widest leading-none truncate">{label}</span>
            </div>
            <span className={clsx('text-xl font-black tabular-nums tracking-tight leading-none', valueColor)}>
                {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
            {sub && (
                <span className={clsx('text-[8px] font-bold truncate', isGold ? 'text-white/40' : 'text-slate-400')}>
                    {sub}
                </span>
            )}
        </div>
    );
}

function EmptyState() {
    return (
        <div className="p-12 flex flex-col items-center justify-center opacity-30">
            <History size={40} strokeWidth={1} />
            <span className="text-[10px] font-black uppercase tracking-[0.4em] mt-4">Sin movimientos</span>
        </div>
    );
}

function StockChartTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as { fullDate: string; stock: number; type: string; qty: number; label: string };
    const isIn = d.qty >= 0;
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl px-4 py-3 text-left max-w-[260px]">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">{d.fullDate}</p>
            <div className="flex items-baseline gap-1.5 mb-1.5">
                <span className="text-2xl font-black tabular-nums text-slate-900 dark:text-white">{d.stock}</span>
                <span className="text-[9px] font-black text-slate-400 uppercase">uds</span>
            </div>
            <div className="flex items-center gap-1.5 mb-1">
                <span className={clsx('text-[10px] font-black shrink-0', isIn ? 'text-emerald-500' : 'text-rose-500')}>
                    {isIn ? '+' : ''}{d.qty}
                </span>
                <span className="text-[9px] text-slate-400 font-bold">{d.type}</span>
            </div>
            {d.label && <p className="text-[9px] text-slate-400 italic leading-snug">{d.label}</p>}
        </div>
    );
}
