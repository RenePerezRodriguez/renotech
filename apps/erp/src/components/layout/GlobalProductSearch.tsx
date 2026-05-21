'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, QueryConstraint } from 'firebase/firestore';
import { InventoryMovement } from '@/types';
import { useProductStore } from '@/store/productStore';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatUserName } from '@/utils/formatUserName';
import { ensureDate } from '@/utils/dateHelpers';
import {
    Search, X, Package, AlertTriangle,
    BarChart3, Tag, Layers, Hash, ChevronLeft,
    ArrowUpRight, ArrowDownRight, Minus, ExternalLink, Loader2,
} from 'lucide-react';
import clsx from 'clsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

// ── Movement helpers ──────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
    ENTRADA:        'Entrada',
    SALIDA:         'Salida',
    AJUSTE:         'Ajuste',
    AJUSTE_MASIVO:  'Ajuste Masivo',
    TRASP_SALIDA:   'Despacho',
    TRASP_ENTRADA:  'Recepcion',
    TRASP_REVERSAL: 'Reversa',
    ANULACION:      'Anulacion',
    GARANTIA_SALIDA:  'Gtia Salida',
    GARANTIA_ENTRADA: 'Gtia Entrada',
    CARGA_INICIAL:  'Carga Inicial',
    REPOSICION:     'Reposicion',
};

const ENTRY_TYPES = new Set([
    'ENTRADA', 'TRASP_ENTRADA', 'TRASP_REVERSAL', 'GARANTIA_ENTRADA', 'ANULACION', 'CARGA_INICIAL', 'REPOSICION',
]);
const EXIT_TYPES = new Set(['SALIDA', 'TRASP_SALIDA', 'GARANTIA_SALIDA']);

function classifyMov(m: InventoryMovement): 'entrada' | 'salida' | 'ajuste' {
    if (ENTRY_TYPES.has(m.type)) return 'entrada';
    if (EXIT_TYPES.has(m.type)) return 'salida';
    return 'ajuste';
}

function formatMovDate(v: InventoryMovement['date']): string {
    try {
        const d = ensureDate(v);
        if (!d) return '-';
        return d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch { return '-'; }
}

interface KardexView {
    productId:   string;
    productName: string;
    productCode: string;
    stock:       number;
    minStock:    number;
    unidad:      string;
    precio:      number;
    movements:   InventoryMovement[];
    loading:     boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GlobalProductSearch({ isOpen, onClose }: Props) {
    const router = useRouter();
    const { isConsolidatedView } = useBranch();
    const { role } = useAuth();
    const isGerente = role === 'GERENTE';

    const [query_, setQuery_]       = useState('');
    const [selected, setSelected]   = useState(0);
    const [kardexView, setKardexView] = useState<KardexView | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Store ──────────────────────────────────────────────────────────────────
    const storeSearch  = useProductStore(s => s.search);
    const storeLoading = useProductStore(s => s.loading);

    // Búsqueda instantánea en memoria — sin debounce, sin Firestore
    const results = useMemo(() => {
        if (query_.trim().length < 1) return [];
        return storeSearch(query_, 15);
    }, [query_, storeSearch]);

    // Focus on open
    useEffect(() => {
        if (isOpen) {
            setQuery_('');
            setSelected(0);
            setKardexView(null);
            setTimeout(() => inputRef.current?.focus(), 80);
        }
    }, [isOpen]);

    // Reset selection when results change
    useEffect(() => { setSelected(0); }, [results]);

    // ── Keyboard nav ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (kardexView) { setKardexView(null); return; }
                onClose();
                return;
            }
            if (kardexView) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
            if (e.key === 'Enter' && results[selected]) {
                e.preventDefault();
                openKardex(results[selected].id, results[selected].nombre, results[selected].codigo, results[selected].stock, results[selected].minStock, results[selected].unidad || 'pz', results[selected].precio);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, results, selected, kardexView]);

    // ── Mini Kardex ───────────────────────────────────────────────────────────
    const openKardex = async (id: string, name: string, code: string, stock: number, minStock: number, unidad: string, precio: number) => {
        const masterId = results.find(p => p.id === id)?.masterId;
        setKardexView({ productId: id, productName: name, productCode: code, stock, minStock, unidad, precio, movements: [], loading: true });
        try {
            const constraints: QueryConstraint[] = [
                isConsolidatedView && masterId
                    ? where('masterId', '==', masterId)
                    : where('productId', '==', id),
                orderBy('date', 'desc'),
                limit(50),
            ];
            const snap = await getDocs(query(collection(db, 'movimientos'), ...constraints));
            const movs = snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryMovement));
            setKardexView(prev => prev ? { ...prev, movements: movs, loading: false } : null);
        } catch {
            setKardexView(prev => prev ? { ...prev, loading: false } : null);
        }
    };

    const goToKardexPage = (id: string) => {
        onClose();
        router.push(`/kardex/${id}`);
    };

    const goToInventory = (id: string, code: string) => {
        onClose();
        router.push(`/inventario?highlight=${id}`);
    };

    if (!isOpen) return null;

    // ── Helpers ───────────────────────────────────────────────────────────────
    const stockBadge = (stock: number, minStock: number) => {
        if (stock <= 0) return { label: 'Sin stock', cls: 'text-rose-500 bg-rose-500/10 border-rose-500/20' };
        if (stock <= (minStock || 0)) return { label: 'Stock bajo', cls: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
        return { label: 'En stock', cls: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
    };

    const stockColor = (stock: number, minStock: number) =>
        stock <= 0 ? 'text-rose-500' : stock <= (minStock || 0) ? 'text-amber-500' : 'text-slate-900 dark:text-white';

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9990]"
                onClick={kardexView ? () => setKardexView(null) : onClose}
            />

            {/* Modal */}
            <div className="fixed inset-x-0 top-[5%] mx-auto max-w-2xl w-[calc(100%-2rem)] z-[9999] flex flex-col bg-white dark:bg-[#0d1117] rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden max-h-[85vh]">

                {/* ── VISTA MINI KARDEX ─────────────────────────────────────── */}
                {kardexView && (
                    <>
                        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-white/10 shrink-0">
                            <button
                                onClick={() => setKardexView(null)}
                                className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors shrink-0 text-slate-500 dark:text-slate-400"
                            >
                                <ChevronLeft size={18} strokeWidth={2.5} />
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 font-mono">
                                    {kardexView.productCode}
                                </p>
                                <p className="text-sm font-black uppercase text-slate-900 dark:text-white leading-tight truncate">
                                    {kardexView.productName}
                                </p>
                            </div>
                            <button
                                onClick={() => goToKardexPage(kardexView.productId)}
                                title="Abrir Kardex completo"
                                className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors shrink-0"
                            >
                                <ExternalLink size={11} /> Kardex completo
                            </button>
                            <kbd className="hidden sm:flex items-center px-1.5 py-0.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded text-[9px] font-mono text-slate-400 dark:text-slate-500 shrink-0">ESC</kbd>
                        </div>

                        <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-50 dark:bg-white/3 border-b border-slate-100 dark:border-white/10 shrink-0">
                            {(() => {
                                const s = stockBadge(kardexView.stock, kardexView.minStock);
                                return (
                                    <>
                                        <span className={clsx('px-2 py-0.5 rounded-xl border text-[9px] font-black uppercase tracking-widest', s.cls)}>
                                            {s.label}
                                        </span>
                                        <span className={clsx('text-base font-black font-mono tabular-nums', stockColor(kardexView.stock, kardexView.minStock))}>
                                            {kardexView.stock}
                                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 ml-1">{kardexView.unidad}</span>
                                        </span>
                                        {kardexView.minStock > 0 && (
                                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                                min {kardexView.minStock}
                                            </span>
                                        )}
                                        {isGerente && kardexView.precio > 0 && (
                                            <span className="ml-auto text-[10px] font-black font-mono text-blue-500 dark:text-blue-400 tabular-nums">
                                                Bs. {kardexView.precio.toFixed(2)}
                                            </span>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        <div className="overflow-y-auto flex-1">
                            {kardexView.loading && (
                                <div className="flex items-center justify-center py-14 gap-3">
                                    <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Cargando movimientos...</span>
                                </div>
                            )}
                            {!kardexView.loading && kardexView.movements.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-14 gap-2">
                                    <BarChart3 size={32} strokeWidth={1} className="text-slate-200 dark:text-white/10" />
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Sin movimientos registrados</p>
                                </div>
                            )}
                            {!kardexView.loading && kardexView.movements.length > 0 && (
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-white dark:bg-[#0d1117] border-b border-slate-100 dark:border-white/10">
                                        <tr>
                                            <th className="text-left px-4 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Fecha</th>
                                            <th className="text-left px-2 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Tipo</th>
                                            <th className="text-right px-2 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Qty</th>
                                            <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Stock</th>
                                            <th className="text-left px-2 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 hidden sm:table-cell">Responsable</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {kardexView.movements.map((m, i) => {
                                            const cls = classifyMov(m);
                                            const isEntry = cls === 'entrada';
                                            const isAdj   = cls === 'ajuste';
                                            return (
                                                <tr key={m.id ?? i} className="border-b border-slate-50 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                                                    <td className="px-4 py-2.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                        {formatMovDate(m.date)}
                                                    </td>
                                                    <td className="px-2 py-2.5">
                                                        <span className={clsx(
                                                            'inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-xl',
                                                            isAdj   ? 'text-violet-600 bg-violet-50 dark:bg-violet-500/10' :
                                                            isEntry ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10' :
                                                                      'text-rose-600 bg-rose-50 dark:bg-rose-500/10'
                                                        )}>
                                                            {isAdj ? <Minus size={8} /> : isEntry ? <ArrowUpRight size={8} /> : <ArrowDownRight size={8} />}
                                                            {TYPE_LABELS[m.type] ?? m.type}
                                                        </span>
                                                    </td>
                                                    <td className={clsx(
                                                        'px-2 py-2.5 text-right font-mono font-black text-[11px] tabular-nums',
                                                        isAdj ? (m.quantity >= 0 ? 'text-emerald-600' : 'text-rose-500') :
                                                        isEntry ? 'text-emerald-600' : 'text-rose-500'
                                                    )}>
                                                        {m.quantity >= 0 ? '+' : ''}{m.quantity}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-mono font-bold text-[11px] tabular-nums text-slate-700 dark:text-slate-300">
                                                        {m.currentStock ?? '-'}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-30 hidden sm:table-cell">
                                                        {formatUserName(m.userName)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {!kardexView.loading && kardexView.movements.length > 0 && (
                            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/3 shrink-0">
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                    Últimos {kardexView.movements.length} movimientos
                                </span>
                                <button
                                    onClick={() => goToKardexPage(kardexView.productId)}
                                    className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-600 transition-colors"
                                >
                                    Ver historial completo <ExternalLink size={10} />
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* ── VISTA BÚSQUEDA ────────────────────────────────────────── */}
                {!kardexView && (
                    <>
                        {/* Search input */}
                        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-white/10">
                            <Search size={18} strokeWidth={2.5} className="text-slate-400 dark:text-slate-500 shrink-0" />
                            <input
                                ref={inputRef}
                                value={query_}
                                onChange={e => setQuery_(e.target.value)}
                                placeholder="Nombre, código, cód. fábrica, OEM, marca, categoría..."
                                className="flex-1 bg-transparent text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none"
                                autoComplete="off"
                                spellCheck={false}
                            />
                            {storeLoading && (
                                <Loader2 size={15} className="animate-spin text-slate-400 shrink-0" />
                            )}
                            {query_ && (
                                <button onClick={() => setQuery_('')} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                                    <X size={16} />
                                </button>
                            )}
                            <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded text-[9px] font-mono text-slate-400 dark:text-slate-500 shrink-0">ESC</kbd>
                        </div>

                        {/* Results */}
                        <div className="overflow-y-auto flex-1">

                            {/* Empty query: hints */}
                            {!query_.trim() && (
                                <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
                                    <Package size={40} strokeWidth={1} className="text-slate-200 dark:text-white/10" />
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">
                                        Escribe para buscar productos
                                    </p>
                                    <div className="flex flex-wrap gap-2 justify-center mt-1">
                                        {['nombre', 'código', 'cód. fábrica', 'OEM', 'marca', 'categoría', 'origen'].map(hint => (
                                            <span key={hint} className="px-2.5 py-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                                {hint}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* No results */}
                            {query_.trim() && !storeLoading && results.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-14 gap-2">
                                    <AlertTriangle size={32} strokeWidth={1} className="text-slate-300 dark:text-white/10" />
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">
                                        Sin resultados para &ldquo;{query_}&rdquo;
                                    </p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-600">
                                        Prueba con nombre, código, marca o categoría
                                    </p>
                                </div>
                            )}

                            {/* Loading store */}
                            {query_.trim() && storeLoading && (
                                <div className="flex items-center justify-center py-14 gap-3">
                                    <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Cargando productos...</span>
                                </div>
                            )}

                            {/* Results list */}
                            {results.length > 0 && (
                                <ul className="py-1.5">
                                    {results.map((p, idx) => {
                                        const badge   = stockBadge(p.stock, p.minStock);
                                        const isActive = idx === selected;
                                        return (
                                            <li
                                                key={p.id}
                                                onMouseEnter={() => setSelected(idx)}
                                                className={clsx(
                                                    'mx-2 my-0.5 rounded-2xl border transition-all cursor-pointer',
                                                    isActive
                                                        ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30'
                                                        : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/3'
                                                )}
                                            >
                                                <div className="flex items-start gap-3 px-3.5 py-3">
                                                    {/* Stock icon */}
                                                    <div className={clsx(
                                                        'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                                                        p.stock <= 0 ? 'bg-rose-50 dark:bg-rose-500/10' :
                                                        p.stock <= (p.minStock || 0) ? 'bg-amber-50 dark:bg-amber-500/10' :
                                                        'bg-emerald-50 dark:bg-emerald-500/10'
                                                    )}>
                                                        <Package size={16} strokeWidth={2} className={clsx(
                                                            p.stock <= 0 ? 'text-rose-400' :
                                                            p.stock <= (p.minStock || 0) ? 'text-amber-400' :
                                                            'text-emerald-400'
                                                        )} />
                                                    </div>

                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        {/* Badges row */}
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-[10px] font-mono font-black text-slate-400 dark:text-slate-500 uppercase">
                                                                {p.codigo}
                                                            </span>
                                                            <span className={clsx('px-1.5 py-0.5 rounded-xl border text-[8px] font-black uppercase tracking-widest', badge.cls)}>
                                                                {badge.label}
                                                            </span>
                                                            {p.branchName && isConsolidatedView && (
                                                                <span className="px-1.5 py-0.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                                                    {p.branchName}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Name */}
                                                        <p className="text-sm font-black text-slate-900 dark:text-white uppercase leading-tight mt-0.5 truncate">
                                                            {p.nombre}
                                                        </p>

                                                        {/* Meta chips */}
                                                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                                            {p.marca && (
                                                                <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                                                                    <Tag size={9} /> {p.marca}
                                                                </span>
                                                            )}
                                                            {p.categoria && (
                                                                <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                                                                    <Layers size={9} /> {p.categoria}
                                                                </span>
                                                            )}
                                                            {p.codigoFabrica && (
                                                                <span className="flex items-center gap-1 text-[9px] font-black text-blue-500 dark:text-blue-400 uppercase font-mono">
                                                                    <Hash size={9} /> FAB: {String(p.codigoFabrica)}
                                                                </span>
                                                            )}
                                                            {p.codigoOE && (
                                                                <span className="flex items-center gap-1 text-[9px] font-black text-amber-500 dark:text-amber-400 uppercase font-mono">
                                                                    <Hash size={9} /> OEM: {String(p.codigoOE)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Stock + Price */}
                                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                                        <div className="flex items-baseline gap-1">
                                                            <span className={clsx('text-lg font-black font-mono tabular-nums', stockColor(p.stock, p.minStock))}>
                                                                {p.stock}
                                                            </span>
                                                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">{p.unidad || 'pz'}</span>
                                                        </div>
                                                        {isGerente && p.precio > 0 && (
                                                            <span className="text-[10px] font-black font-mono text-blue-500 dark:text-blue-400 tabular-nums">
                                                                Bs. {p.precio.toFixed(2)}
                                                            </span>
                                                        )}
                                                        {p.minStock > 0 && (
                                                            <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                                                                min {p.minStock}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Action row */}
                                                {isActive && (
                                                    <div className="flex items-center gap-2 px-3.5 pb-2.5 pt-0">
                                                        <button
                                                            onClick={() => openKardex(p.id, p.nombre, p.codigo, p.stock, p.minStock, p.unidad || 'pz', p.precio)}
                                                            className="flex items-center gap-1.5 h-7 px-3 rounded-xl bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors active:scale-95"
                                                        >
                                                            <BarChart3 size={11} /> Kardex
                                                        </button>
                                                        <button
                                                            onClick={() => goToInventory(p.id, p.codigo)}
                                                            className="flex items-center gap-1.5 h-7 px-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 transition-colors active:scale-95"
                                                        >
                                                            <Package size={11} /> Inventario
                                                        </button>
                                                        <span className="ml-auto text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                                            ENTER = Kardex
                                                        </span>
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        {/* Footer */}
                        {results.length > 0 && (
                            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/3 shrink-0">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                    {results.length} resultado{results.length !== 1 ? 's' : ''}
                                </span>
                                <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                    <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded text-[9px]">↑ ↓</kbd> navegar</span>
                                    <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded text-[9px]">Enter</kbd> Kardex</span>
                                    <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded text-[9px]">ESC</kbd> cerrar</span>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>,
        document.body
    );
}
