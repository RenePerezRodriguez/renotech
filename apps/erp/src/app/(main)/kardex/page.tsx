'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    BookOpen, Search, Package, ChevronRight, AlertTriangle,
    Star, Clock, SlidersHorizontal, ChevronDown, X
} from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { useBranch } from '@/contexts/BranchContext';
import ModuleHeader from '@/components/common/ModuleHeader';
import { Product } from '@/types';
import clsx from 'clsx';

// ─── LocalStorage helpers ────────────────────────────────────────────────────
const RECENT_KEY = 'kardex_recent';
const FAVS_KEY = 'kardex_favorites';
const MAX_RECENT = 5;

function getRecent(): string[] {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}
function addRecent(id: string) {
    const curr = getRecent().filter(r => r !== id);
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...curr].slice(0, MAX_RECENT)));
}
function getFavs(): string[] {
    try { return JSON.parse(localStorage.getItem(FAVS_KEY) ?? '[]'); } catch { return []; }
}
function toggleFav(id: string): string[] {
    const curr = getFavs();
    const next = curr.includes(id) ? curr.filter(f => f !== id) : [...curr, id];
    localStorage.setItem(FAVS_KEY, JSON.stringify(next));
    return next;
}

const PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const;
type PageSize = typeof PAGE_SIZE_OPTIONS[number];

const SORT_LABELS: Record<string, string> = {
    nombre: 'Nombre A–Z', stock_asc: 'Stock ↑', stock_desc: 'Stock ↓', codigo: 'Código A–Z',
};

export default function KardexPage() {
    const router = useRouter();
    const { currentBranch } = useBranch();
    const { products, loading } = useProducts();
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'nombre' | 'stock_asc' | 'stock_desc' | 'codigo'>('nombre');
    const [brandFilter, setBrandFilter] = useState('ALL');
    const [catFilter, setCatFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'LOW' | 'OUT'>('ALL');
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [recentIds, setRecentIds] = useState<string[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(24);
    const [showAllBrands, setShowAllBrands] = useState(false);
    const sortMenuRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- inicialización desde localStorage (browser-only)
        setRecentIds(getRecent());
        setFavorites(getFavs());
    }, []);

    useEffect(() => {
        function handler(e: MouseEvent) {
            if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setShowSortMenu(false);
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        function handler(e: KeyboardEvent) {
            if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                e.preventDefault();
                searchRef.current?.focus();
            }
        }
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const active = useMemo(() => (products ?? []).filter(p => p.isActive !== false), [products]);
    const brands = useMemo(() => Array.from(new Set(active.map(p => p.marca).filter(Boolean) as string[])).sort(), [active]);
    const categories = useMemo(() => Array.from(new Set(active.map(p => p.categoria).filter(Boolean) as string[])).sort(), [active]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let list = active;
        if (q) list = list.filter(p =>
            p.nombre?.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q) ||
            p.codigoOE?.toLowerCase().includes(q) || p.codigoFabrica?.toLowerCase().includes(q) ||
            p.marca?.toLowerCase().includes(q)
        );
        if (brandFilter !== 'ALL') list = list.filter(p => p.marca === brandFilter);
        if (catFilter !== 'ALL') list = list.filter(p => p.categoria === catFilter);
        if (statusFilter === 'OUT') list = list.filter(p => p.stock <= 0);
        else if (statusFilter === 'LOW') list = list.filter(p => p.stock > 0 && p.stock <= (p.minStock || 5));
        list = [...list].sort((a, b) => {
            if (sortBy === 'stock_asc') return a.stock - b.stock;
            if (sortBy === 'stock_desc') return b.stock - a.stock;
            if (sortBy === 'codigo') return (a.codigo || '').localeCompare(b.codigo || '');
            return (a.nombre || '').localeCompare(b.nombre || '');
        });
        return list;
    }, [active, search, brandFilter, catFilter, statusFilter, sortBy]);

    // Reset page when filters change
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paginación al cambiar filtros
    useEffect(() => { setPage(1); }, [search, brandFilter, catFilter, statusFilter, sortBy, pageSize]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const paginated = useMemo(
        () => filtered.slice((page - 1) * pageSize, page * pageSize),
        [filtered, page, pageSize]
    );

    const statusCounts = useMemo(() => {
        const q = search.trim().toLowerCase();
        let base = active;
        if (q) base = base.filter(p =>
            p.nombre?.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q) ||
            p.codigoOE?.toLowerCase().includes(q) || p.codigoFabrica?.toLowerCase().includes(q) ||
            p.marca?.toLowerCase().includes(q)
        );
        if (brandFilter !== 'ALL') base = base.filter(p => p.marca === brandFilter);
        if (catFilter !== 'ALL') base = base.filter(p => p.categoria === catFilter);
        return {
            ALL: base.length,
            LOW: base.filter(p => p.stock > 0 && p.stock <= (p.minStock || 5)).length,
            OUT: base.filter(p => p.stock <= 0).length,
        };
    }, [active, search, brandFilter, catFilter]);

    const recentProducts = useMemo(
        () => recentIds.map(id => active.find(p => p.id === id)).filter(Boolean) as Product[],
        [recentIds, active]
    );
    const favoriteProducts = useMemo(() => active.filter(p => favorites.includes(p.id)), [favorites, active]);

    function handleSelect(p: Product) { addRecent(p.id); setRecentIds(getRecent()); router.push(`/kardex/${p.id}`); }
    function handleToggleFav(id: string) { setFavorites(toggleFav(id)); }

    const hasActiveFilters = brandFilter !== 'ALL' || catFilter !== 'ALL' || statusFilter !== 'ALL';

    return (
        <div className="flex-1 min-w-0 w-full max-w-full flex flex-col overflow-y-auto bg-slate-50 dark:bg-background pb-20">
            <div className="p-3 sm:p-4 md:p-6 space-y-4">
                <ModuleHeader
                    title="Kardex de Inventario"
                    subtitle="Selecciona un producto para ver su historial completo de movimientos"
                    icon={BookOpen}
                    badge={currentBranch?.name?.toUpperCase() || 'SUCURSAL'}
                />

                {/* Sticky search + filter bar */}
                <div className="sticky top-0 z-20 space-y-3 bg-slate-50 dark:bg-background pt-1 pb-2 -mx-3 px-3 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6">
                    <div data-tour="kardex-search" className="flex gap-2">
                        <div className="relative flex-1">
                            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre, código, OEM, fábrica o marca…"
                                ref={searchRef}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-10 pr-8 h-11 bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all shadow-sm"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <div className="relative" ref={sortMenuRef}>
                            <button
                                onClick={() => setShowSortMenu(v => !v)}
                                className="h-11 px-3 sm:px-4 bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 hover:border-blue-500/40 transition-colors shrink-0 shadow-sm"
                            >
                                <SlidersHorizontal size={13} />
                                <span className="hidden sm:inline">{SORT_LABELS[sortBy]}</span>
                                <ChevronDown size={11} className={clsx('transition-transform', showSortMenu && 'rotate-180')} />
                            </button>
                            {showSortMenu && (
                                <div className="absolute right-0 top-12 z-30 bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl py-2 min-w-44">
                                    {Object.entries(SORT_LABELS).map(([val, label]) => (
                                        <button key={val} onClick={() => { setSortBy(val as typeof sortBy); setShowSortMenu(false); }}
                                            className={clsx("w-full text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors",
                                                sortBy === val ? "text-blue-500 bg-blue-500/5" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5"
                                            )}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Filter chips */}
                    <div data-tour="kardex-filters" className="flex flex-wrap gap-2 items-center">
                        {(['ALL', 'LOW', 'OUT'] as const).map(s => (
                            <button key={s} onClick={() => setStatusFilter(s)}
                                className={clsx("h-7 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all",
                                    statusFilter === s
                                        ? s === 'OUT' ? "bg-rose-500 text-white border-rose-500"
                                            : s === 'LOW' ? "bg-amber-400 text-white border-amber-400"
                                            : "bg-slate-900 dark:bg-white text-white dark:text-black border-transparent"
                                        : "bg-white dark:bg-background text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:border-slate-400"
                                )}>
                                {s === 'ALL' ? `Todos (${statusCounts.ALL})` : s === 'LOW' ? `Stock Bajo (${statusCounts.LOW})` : `Sin Stock (${statusCounts.OUT})`}
                            </button>
                        ))}
                        {brands.length > 0 && <div className="w-px h-4 bg-slate-200 dark:bg-white/5" />}
                        {(showAllBrands ? brands : brands.slice(0, 6)).map(b => (
                            <button key={b} onClick={() => setBrandFilter(brandFilter === b ? 'ALL' : b)}
                                className={clsx("h-7 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all",
                                    brandFilter === b ? "bg-blue-500 text-white border-blue-500" : "bg-white dark:bg-background text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:border-blue-400"
                                )}>
                                {b}
                            </button>
                        ))}
                        {brands.length > 6 && (
                            <button onClick={() => setShowAllBrands(v => !v)}
                                className="h-7 px-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-dashed border-slate-300 dark:border-white/10 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors">
                                {showAllBrands ? 'Menos' : `+${brands.length - 6} más`}
                            </button>
                        )}
                        {categories.length > 0 && (
                            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                                className="h-7 px-2 bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 outline-none focus:border-blue-400 transition-colors">
                                <option value="ALL">Categoría</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        )}
                        {hasActiveFilters && (
                            <button onClick={() => { setBrandFilter('ALL'); setCatFilter('ALL'); setStatusFilter('ALL'); }}
                                className="h-7 px-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-rose-500 flex items-center gap-1 border border-rose-200 dark:border-rose-500/30 bg-white dark:bg-background hover:border-rose-400 transition-colors">
                                <X size={10} /> Limpiar
                            </button>
                        )}
                    </div>
                </div>

                {/* Favorites */}
                {!loading && favoriteProducts.length > 0 && (
                    <section className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Star size={11} className="text-amber-400 fill-amber-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Favoritos</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {favoriteProducts.map(p => (
                                <button key={p.id} onClick={() => handleSelect(p)}
                                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-background border border-amber-200 dark:border-amber-500/20 rounded-xl hover:border-amber-400 transition-all">
                                    <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-tight">{p.nombre}</span>
                                    <span className="text-[9px] font-black text-blue-500">{p.codigo}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* Recent */}
                {!loading && recentProducts.length > 0 && !search && (
                    <section className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Clock size={11} className="text-slate-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Vistos Recientemente</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {recentProducts.map(p => (
                                <button key={p.id} onClick={() => handleSelect(p)}
                                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-xl hover:border-blue-500/40 transition-all">
                                    <Clock size={9} className="text-slate-400 shrink-0" />
                                    <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-tight">{p.nombre}</span>
                                    <span className="text-[9px] font-black text-blue-500">{p.codigo}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* Counter + page size */}
                {!loading && (
                    <div className="flex items-center justify-between gap-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {filtered.length === 0 ? '0 productos' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`}
                        </p>
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Por página</span>
                            <div className="flex gap-1">
                                {PAGE_SIZE_OPTIONS.map(n => (
                                    <button key={n} onClick={() => setPageSize(n)}
                                        className={clsx('w-8 h-6 rounded-xl text-[9px] font-black transition-all',
                                            pageSize === n
                                                ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                                                : 'bg-white dark:bg-background border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-400'
                                        )}>
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Grid */}
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-28 bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl animate-pulse" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 opacity-30">
                        <Search size={48} strokeWidth={1} />
                        <span className="text-[11px] font-black uppercase tracking-[0.4em] mt-4">Sin resultados</span>
                    </div>
                ) : (
                    <div data-tour="kardex-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {paginated.map(p => (
                            <ProductKardexCard
                                key={p.id} product={p}
                                isFavorite={favorites.includes(p.id)}
                                onSelect={() => handleSelect(p)}
                                onToggleFav={() => handleToggleFav(p.id)}
                            />
                        ))}
                    </div>
                )}

                {/* Pagination controls */}
                {!loading && totalPages > 1 && (
                    <div className="flex items-center justify-center gap-1 sm:gap-1.5 pt-2 pb-4">
                        <button onClick={() => setPage(1)} disabled={page === 1}
                            className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background text-[11px] font-black text-slate-500 dark:text-slate-400 disabled:opacity-30 hover:border-blue-400 transition-colors">
                            «
                        </button>
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                            className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background text-[11px] font-black text-slate-500 dark:text-slate-400 disabled:opacity-30 hover:border-blue-400 transition-colors">
                            ‹
                        </button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                            return start + i;
                        }).map(n => (
                            <button key={n} onClick={() => setPage(n)}
                                className={clsx('w-10 h-10 rounded-xl text-[11px] font-black transition-all',
                                    page === n
                                        ? 'bg-slate-900 dark:bg-white text-white dark:text-black border-transparent'
                                        : 'bg-white dark:bg-background border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-blue-400'
                                )}>
                                {n}
                            </button>
                        ))}
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                            className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background text-[11px] font-black text-slate-500 dark:text-slate-400 disabled:opacity-30 hover:border-blue-400 transition-colors">
                            ›
                        </button>
                        <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                            className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background text-[11px] font-black text-slate-500 dark:text-slate-400 disabled:opacity-30 hover:border-blue-400 transition-colors">
                            »
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function ProductKardexCard({ product, isFavorite, onSelect, onToggleFav }: {
    product: Product; isFavorite: boolean; onSelect: () => void; onToggleFav: () => void;
}) {
    const isLowStock = product.stock > 0 && product.stock <= (product.minStock || 5);
    const isOutOfStock = product.stock <= 0;

    let lastActivityStr: string | null = null;
    const lastActivity = product.lastSaleAt ?? product.updatedAt;
    if (lastActivity) {
        try {
            const d = lastActivity instanceof Date
                ? lastActivity
                : (lastActivity as { toDate?: () => Date }).toDate?.();
            if (d) lastActivityStr = d.toLocaleDateString('es-BO');
        } catch { /**/ }
    }

    return (
        <div className={clsx(
            "group w-full bg-white dark:bg-background border rounded-2xl p-4 hover:shadow-lg hover:shadow-blue-500/5 transition-all flex flex-col gap-3",
            isOutOfStock ? "border-rose-200 dark:border-rose-500/20"
                : isLowStock ? "border-amber-200 dark:border-amber-500/20"
                    : "border-slate-200 dark:border-white/10 hover:border-blue-500/40"
        )}>
            <div className="flex items-start gap-3">
                <button onClick={onSelect} className="flex-1 flex items-start gap-3 text-left active:scale-[0.98] min-w-0">
                    <div className={clsx(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 transition-colors",
                        isOutOfStock ? "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 text-rose-500"
                            : isLowStock ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-500"
                                : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500"
                    )}>
                        {isOutOfStock || isLowStock ? <AlertTriangle size={17} strokeWidth={2.5} /> : <Package size={17} strokeWidth={2} />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight leading-tight wrap-break-word">{product.nombre}</p>
                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mt-0.5">{product.codigo}</p>
                    </div>
                </button>
                <button onClick={e => { e.stopPropagation(); onToggleFav(); }}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-xl hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors">
                    <Star size={13} className={isFavorite ? "text-amber-400 fill-amber-400" : "text-slate-300 dark:text-slate-600"} />
                </button>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-50 dark:border-white/10">
                <div className="flex items-center gap-2 min-w-0">
                    <span className={clsx("text-[9px] font-black uppercase tracking-widest whitespace-nowrap",
                        isOutOfStock ? "text-rose-500" : isLowStock ? "text-amber-500" : "text-slate-400 dark:text-slate-500")}>
                        Stock: {product.stock}
                    </span>
                    {product.marca && <span className="text-[8px] font-black text-slate-300 dark:text-slate-600 uppercase wrap-break-word">· {product.marca}</span>}
                </div>
                <button onClick={onSelect} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover:text-blue-500 transition-colors shrink-0">
                    Ver <ChevronRight size={11} />
                </button>
            </div>
            {lastActivityStr && (
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600 -mt-1">
                    Últ. actividad: {lastActivityStr}
                </p>
            )}
        </div>
    );
}
