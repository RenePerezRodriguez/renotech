'use client';

import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types';
import {
    Search, Package, Plus, ChevronLeft, ChevronRight,
    LayoutGrid, Activity, Wrench, Zap, Snowflake, Settings, Car, Filter, Layers, CircleDot, PackagePlus,
    AlertTriangle, TrendingDown, ArrowUpDown, Boxes, Globe
} from 'lucide-react';
import Image from 'next/image';
import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { useProductHoverPreview } from '@/hooks/useProductHoverPreview';
import ProductPreviewTooltip from '@/components/common/ProductPreviewTooltip';
import ProductContextMenu from '@/components/common/ProductContextMenu';

const ITEMS_PER_PAGE = 25;

type SortMode = 'name' | 'stock-asc' | 'stock-desc' | 'cost-desc' | 'cost-asc' | 'recent';
type StockFilter = 'todos' | 'en-stock' | 'sin-stock' | 'bajo-min';

const getCategoryIcon = (category: string) => {
    switch (category) {
        case 'Todos': return <LayoutGrid size={14} />;
        case 'Motor': return <Activity size={14} />;
        case 'Suspensión': return <Wrench size={14} />;
        case 'Eléctrico': return <Zap size={14} />;
        case 'Frenos': return <CircleDot size={14} />;
        case 'Refrigeración': return <Snowflake size={14} />;
        case 'Transmisión': return <Settings size={14} />;
        case 'Carrocería': return <Car size={14} />;
        case 'Filtros': return <Filter size={14} />;
        case 'Otros': return <Layers size={14} />;
        default: return <Package size={14} />;
    }
};

const getStockInfo = (stock: number, minStock?: number) => {
    const min = minStock ?? 5;
    if (stock === 0) return { label: 'AGOTADO', color: 'bg-rose-500 text-white', priority: 0 };
    if (stock <= min) return { label: `BAJO (${stock})`, color: 'bg-amber-500 text-white', priority: 1 };
    return { label: `${stock}`, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', priority: 2 };
};

interface PurchaseProductGridProps {
    onProductSelect: (product: Product) => void;
    onNewProduct?: () => void;
}

export default function PurchaseProductGrid({ onProductSelect, onNewProduct }: PurchaseProductGridProps) {
    const { products, loading } = useProducts();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setCategory] = useState('Todos');
    const [selectedBrand, setSelectedBrand] = useState<string>('Todas');
    const [selectedOrigin, setSelectedOrigin] = useState<string>('Todos');
    const [sortMode, setSortMode] = useState<SortMode>('stock-asc');
    const [stockFilter, setStockFilter] = useState<StockFilter>('todos');
    const [currentPage, setCurrentPage] = useState(1);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; product: Product } | null>(null);
    const { hoverState, onMouseEnter: onProductHoverEnter, onMouseLeave: onProductHoverLeave, clear: clearHover } = useProductHoverPreview(1000);

    const scrollCategories = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 200;
            scrollContainerRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    // Categories
    const categories = useMemo(() => {
        const uniqueCats = Array.from(new Set(products.map(p => p.categoria || 'Otros').filter(Boolean)));
        const sorted = uniqueCats.filter(c => c !== 'Otros').sort((a, b) => a.localeCompare(b));
        if (uniqueCats.includes('Otros')) sorted.push('Otros');
        return ['Todos', ...sorted];
    }, [products]);

    // Brands
    const brands = useMemo(() => {
        const uniqueBrands = Array.from(new Set(products.map(p => p.marca).filter(Boolean))) as string[];
        return ['Todas', ...uniqueBrands.sort((a, b) => a.localeCompare(b))];
    }, [products]);

    // Origins
    const origins = useMemo(() => {
        const uniqueOrigins = Array.from(new Set(products.map(p => p.origen).filter(Boolean))) as string[];
        return ['Todos', ...uniqueOrigins.sort((a, b) => a.localeCompare(b))];
    }, [products]);

    // Stats
    const stats = useMemo(() => {
        const outOfStock = products.filter(p => p.stock === 0).length;
        const lowStock = products.filter(p => p.stock > 0 && p.stock <= (p.minStock ?? 5)).length;
        return { outOfStock, lowStock, total: products.length };
    }, [products]);

    // Filtered & Sorted
    const filteredProducts = useMemo(() => {
        const filtered = products.filter(p => {
            const term = searchTerm.toLowerCase();
            const matchesSearch =
                p.nombre.toLowerCase().includes(term) ||
                p.codigo.toLowerCase().includes(term) ||
                (p.codigoOE && p.codigoOE.toLowerCase().includes(term));
            const matchesCategory = selectedCategory === 'Todos' || (p.categoria || 'Otros') === selectedCategory;
            const matchesBrand = selectedBrand === 'Todas' || p.marca === selectedBrand;
            const matchesOrigin = selectedOrigin === 'Todos' || p.origen === selectedOrigin;
            const min = p.minStock ?? 5;
            const matchesStock =
                stockFilter === 'todos' ||
                (stockFilter === 'en-stock' && (p.stock ?? 0) > 0) ||
                (stockFilter === 'sin-stock' && (p.stock ?? 0) === 0) ||
                (stockFilter === 'bajo-min' && (p.stock ?? 0) > 0 && (p.stock ?? 0) <= min);
            return matchesSearch && matchesCategory && matchesBrand && matchesOrigin && matchesStock;
        });

        return filtered.sort((a, b) => {
            switch (sortMode) {
                case 'stock-asc': return (a.stock ?? 0) - (b.stock ?? 0);
                case 'stock-desc': return (b.stock ?? 0) - (a.stock ?? 0);
                case 'cost-desc': return (b.costo ?? 0) - (a.costo ?? 0);
                case 'cost-asc': return (a.costo ?? 0) - (b.costo ?? 0);
                case 'name': return a.nombre.localeCompare(b.nombre);
                case 'recent': {
                    const ta = (a.updatedAt as { seconds?: number } | undefined)?.seconds ?? 0;
                    const tb = (b.updatedAt as { seconds?: number } | undefined)?.seconds ?? 0;
                    return tb - ta;
                }
                default: return 0;
            }
        });
    }, [products, searchTerm, selectedCategory, selectedBrand, selectedOrigin, sortMode, stockFilter]);

    // Pagination
    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
    const paginatedProducts = filteredProducts.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    if (loading) {
        return (
            <div className="flex flex-1 flex-col h-full overflow-hidden">
                <div className="mb-4 flex flex-col gap-3">
                    <Skeleton className="h-12 w-full rounded-2xl bg-gray-200 dark:bg-white/5" />
                    <div className="flex gap-2 overflow-hidden">
                        {[1, 2, 3, 4, 5].map(i => (
                            <Skeleton key={i} className="h-9 w-24 rounded-2xl bg-gray-200 dark:bg-white/5 shrink-0" />
                        ))}
                    </div>
                </div>
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                        <Skeleton key={i} className="h-16 w-full rounded-xl bg-gray-200 dark:bg-white/5" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div data-tour="compras-search" className="flex flex-1 flex-col h-full overflow-hidden transition-colors">
            {/* Search + New */}
            <div className="mb-3 flex flex-col gap-2.5 shrink-0">
                <div className="flex gap-2">
                    <div className="flex flex-1 relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-yellow-500 transition-colors" size={18} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Buscar por nombre, código o referencia..."
                            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#020617]/50 py-3 pl-11 pr-4 text-sm font-bold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-600 focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 outline-none shadow-sm transition-all"
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1);
                            }}
                            autoFocus
                        />
                    </div>
                    {onNewProduct && (
                        <button
                            onClick={onNewProduct}
                            className="shrink-0 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-sm transition-all active:scale-95"
                        >
                            <PackagePlus size={16} />
                            <span className="hidden sm:inline">Nuevo</span>
                        </button>
                    )}
                </div>

                {/* Quick Stats */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-4 px-3 py-1.5 bg-white dark:bg-[#020617]/50 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-400">{stats.total} items</span>
                        {stats.outOfStock > 0 && (
                            <span className="flex items-center gap-1 text-rose-500">
                                <AlertTriangle size={11} /> {stats.outOfStock} agotados
                            </span>
                        )}
                        {stats.lowStock > 0 && (
                            <span className="flex items-center gap-1 text-amber-500">
                                <TrendingDown size={11} /> {stats.lowStock} bajo mín.
                            </span>
                        )}
                    </div>
                    <div className="relative">
                        <select
                            value={selectedBrand}
                            onChange={(e) => { setSelectedBrand(e.target.value); setCurrentPage(1); }}
                            className="appearance-none pl-7 pr-7 py-1.5 bg-white dark:bg-[#020617]/50 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:border-yellow-400 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                            title="Marca"
                        >
                            {brands.map(brand => (
                                <option key={brand} value={brand} className="bg-white dark:bg-[#020617] text-slate-900 dark:text-white">
                                    {brand === 'Todas' ? 'Todas las marcas' : brand}
                                </option>
                            ))}
                        </select>
                        <Filter className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={11} />
                        <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" size={10} />
                    </div>
                    <div className="relative">
                        <select
                            value={selectedOrigin}
                            onChange={(e) => { setSelectedOrigin(e.target.value); setCurrentPage(1); }}
                            className="appearance-none pl-7 pr-7 py-1.5 bg-white dark:bg-[#020617]/50 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:border-yellow-400 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                            title="Origen"
                        >
                            {origins.map(o => (
                                <option key={o} value={o} className="bg-white dark:bg-[#020617] text-slate-900 dark:text-white">
                                    {o === 'Todos' ? 'Todos los orígenes' : o}
                                </option>
                            ))}
                        </select>
                        <Globe className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={11} />
                        <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" size={10} />
                    </div>
                    <div className="relative">
                        <select
                            value={sortMode}
                            onChange={(e) => { setSortMode(e.target.value as SortMode); setCurrentPage(1); }}
                            className="appearance-none pl-7 pr-7 py-1.5 bg-white dark:bg-[#020617]/50 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:border-yellow-400 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                        >
                            <option value="stock-asc">Menor stock</option>
                            <option value="stock-desc">Mayor stock</option>
                            <option value="cost-desc">Mayor costo</option>
                            <option value="cost-asc">Menor costo</option>
                            <option value="name">Nombre A-Z</option>
                            <option value="recent">Recientes</option>
                        </select>
                        <ArrowUpDown className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={11} />
                        <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" size={10} />
                    </div>
                    <div className="relative">
                        <select
                            value={stockFilter}
                            onChange={(e) => { setStockFilter(e.target.value as StockFilter); setCurrentPage(1); }}
                            className="appearance-none pl-7 pr-7 py-1.5 bg-white dark:bg-[#020617]/50 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:border-yellow-400 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                        >
                            <option value="todos">Todos</option>
                            <option value="en-stock">En stock</option>
                            <option value="sin-stock">Agotados</option>
                            <option value="bajo-min">Bajo mín.</option>
                        </select>
                        <Boxes className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={11} />
                        <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" size={10} />
                    </div>
                </div>

                {/* Categories */}
                <div className="flex items-center gap-2 min-w-0">
                    <button
                        onClick={() => scrollCategories('left')}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white transition hidden md:block"
                    >
                        <ChevronLeft size={16} />
                    </button>

                    <div
                        ref={scrollContainerRef}
                        className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none snap-x flex-1 scroll-smooth"
                    >
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => {
                                    setCategory(cat);
                                    setCurrentPage(1);
                                }}
                                className={clsx(
                                    "px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl whitespace-nowrap transition-all flex items-center gap-1 snap-start shrink-0 active:scale-95 border",
                                    selectedCategory === cat
                                        ? "bg-yellow-500 text-black border-yellow-400 shadow-sm"
                                        : "bg-white dark:bg-[#020617]/50 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-white/10 hover:border-yellow-300 dark:hover:border-gray-600 hover:text-slate-700 dark:hover:text-white"
                                )}
                            >
                                {getCategoryIcon(cat)}
                                {cat}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => scrollCategories('right')}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white transition hidden md:block"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* Product List (compact rows for procurement) */}
            <div className="flex-1 overflow-y-auto min-h-0 relative custom-scrollbar">
                {paginatedProducts.length === 0 ? (
                    <EmptyState
                        title="No se encontraron productos"
                        description={searchTerm || selectedCategory !== 'Todos' || selectedBrand !== 'Todas'
                            ? "Intenta ajustar tus filtros de búsqueda."
                            : "El inventario está vacío."}
                        icon={Package}
                    />
                ) : (
                    <div className="space-y-1 pb-20 md:pb-2">
                        {paginatedProducts.map((product) => {
                            const stockInfo = getStockInfo(product.stock, product.minStock);
                            return (
                                <div
                                    key={product.id}
                                    onClick={() => onProductSelect(product)}
                                    onContextMenu={(e) => { e.preventDefault(); clearHover(); setContextMenu({ x: e.clientX, y: e.clientY, product }); }}
                                    onMouseEnter={(e) => onProductHoverEnter(e, product)}
                                    onMouseLeave={onProductHoverLeave}
                                    className={clsx(
                                        "group flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer",
                                        stockInfo.priority === 0
                                            ? "border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/10 hover:border-rose-300 dark:hover:border-rose-800"
                                            : stockInfo.priority === 1
                                            ? "border-amber-200 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-950/10 hover:border-amber-300 dark:hover:border-amber-800"
                                            : "border-slate-100 dark:border-white/10/60 bg-white dark:bg-[#020617]/30 hover:border-yellow-300 dark:hover:border-gray-700",
                                        "hover:shadow-md active:scale-[0.99]"
                                    )}
                                >
                                    {/* Thumbnail */}
                                    <div className="w-11 h-11 shrink-0 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center overflow-hidden">
                                        {product.imagenUrl ? (
                                            <Image
                                                src={product.imagenUrl}
                                                alt={product.nombre}
                                                width={44}
                                                height={44}
                                                className="object-contain"
                                            />
                                        ) : (
                                            <Package className="text-slate-300 dark:text-slate-700" size={20} />
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            {product.marca && (
                                                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest shrink-0">
                                                    {product.marca}
                                                </span>
                                            )}
                                            <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 wrap-break-word">
                                                {product.codigo}
                                            </span>
                                            {product.codigoFabrica && (
                                                <span className="text-[10px] font-mono font-bold text-blue-500 dark:text-blue-400 wrap-break-word">
                                                    Fáb: {product.codigoFabrica}
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-tight wrap-break-word" title={product.nombre}>
                                            {product.nombre}
                                        </h3>
                                    </div>

                                    {/* Stock Badge */}
                                    <div className="shrink-0">
                                        <span className={clsx(
                                            "text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-xl",
                                            stockInfo.color
                                        )}>
                                            {stockInfo.label}
                                        </span>
                                    </div>

                                    {/* Cost */}
                                    <div className="shrink-0 text-right w-24 hidden sm:block">
                                        <span className="text-sm font-black text-yellow-600 dark:text-yellow-400">
                                            Bs. {(product.costo ?? 0).toFixed(2)}
                                        </span>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase">Costo</p>
                                    </div>

                                    {/* Add Button */}
                                    <button
                                        className="shrink-0 w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-400 group-hover:bg-yellow-500 group-hover:text-black flex items-center justify-center transition-all active:scale-90"
                                        onClick={(e) => { e.stopPropagation(); onProductSelect(product); }}
                                    >
                                        <Plus size={16} strokeWidth={3} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/10 pt-2.5 shrink-0 mt-1 pb-16 md:pb-0">
                    <div className="text-[10px] font-bold text-slate-400">
                        {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} de {filteredProducts.length}
                    </div>
                    <div className="flex gap-1.5">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#020617]/50 text-slate-400 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-white/5 transition"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span className="flex items-center px-2.5 font-black text-xs bg-white dark:bg-[#020617]/50 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white">
                            {currentPage}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#020617]/50 text-slate-400 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-white/5 transition"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            )}

            <ProductContextMenu
                position={contextMenu}
                onClose={() => setContextMenu(null)}
                actions={[
                    { label: 'Agregar a compra', icon: Plus, onClick: (p) => onProductSelect(p) },
                ]}
            />

            <ProductPreviewTooltip
                anchor={hoverState?.element ?? null}
                product={hoverState?.product ?? null}
            />
        </div>
    );
}
