
'use client';

import { usePosStore } from '@/store/posStore';
import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types';
import {
    Search, Package, Plus, ChevronLeft, ChevronRight, QrCode,
    LayoutGrid, Activity, Wrench, Zap, Snowflake, Settings, Car, Filter, Layers, CircleDot, List, Eye, ChevronDown, ArrowUpDown, Boxes, Globe
} from 'lucide-react';
import Image from 'next/image';
import clsx from 'clsx';
import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useBranch } from '@/contexts/BranchContext';
import { toast } from 'sonner';
import { CrossBranchInventoryService, BranchStock } from '@/services/CrossBranchInventoryService';
import ProductDetailModal from '@/app/(main)/inventario/components/ProductDetailModal';
import LostSaleModal from './LostSaleModal';
import { AlertCircle } from 'lucide-react';

const QRScanner = dynamic(() => import('@/components/common/QRScanner'), {
    loading: () => <div className="h-75 w-full bg-black rounded-2xl animate-pulse" />,
    ssr: false
});
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { normalizeText } from '@/utils/normalize';
import ProductPreviewTooltip from '@/components/common/ProductPreviewTooltip';

const ITEMS_PER_PAGE = 20;

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

export default function ProductGrid() {
    const {
        addToCart,
        searchTerm,
        setSearchTerm,
        selectedCategory,
        setCategory,
        invoiceMode,
        viewMode,
        setViewMode,
    } = usePosStore();

    const { products, loading } = useProducts();
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Actualizar snapshot de stock cada vez que los productos cargan (online)
    useEffect(() => {
        if (!loading && products.length > 0 && typeof navigator !== 'undefined' && navigator.onLine) {
            const snapshot = Object.fromEntries(products.map(p => [p.id!, p.stock ?? 0]));
            localStorage.setItem('renotech_stock_snapshot', JSON.stringify(snapshot));
        }
    }, [products, loading]);
    const [currentPage, setCurrentPage] = useState(1);

    const [prevSearch, setPrevSearch] = useState(searchTerm);
    const [prevCategory, setPrevCategory] = useState(selectedCategory);
    const [quantityPrefix, setQuantityPrefix] = useState<number>(1);
    const [showScanner, setShowScanner] = useState(false);
    const [selectedBrand, setSelectedBrand] = useState<string>('Todas');
    const [selectedOrigin, setSelectedOrigin] = useState<string>('Todos');
    const [sortMode, setSortMode] = useState<'default' | 'stock-asc' | 'stock-desc' | 'price-desc' | 'price-asc' | 'name'>('default');
    const [stockFilter, setStockFilter] = useState<'todos' | 'en-stock' | 'sin-stock' | 'bajo-min'>('todos');
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [selectedProductDetails, setSelectedProductDetails] = useState<Product | null>(null);
    const [lostSaleProduct, setLostSaleProduct] = useState<Product | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; product: Product } | null>(null);
    const [hoverTooltip, setHoverTooltip] = useState<{ element: HTMLElement; product: Product } | null>(null);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cross-branch availability
    const [crossBranchData, setCrossBranchData] = useState<BranchStock[]>([]);

    const { currentBranch, isConsolidatedView } = useBranch();

    // Fetch cross-branch stock once on mount
    useEffect(() => {
        const fetchCrossBranch = async () => {
            if (!currentBranch?.id) return;
            try {
                const data = await CrossBranchInventoryService.getAllBranchesStock(currentBranch.id);
                setCrossBranchData(data);
            } catch (err) {
                // Silently ignore — cross-branch stock is non-critical
            }
        };
        fetchCrossBranch();
    }, [currentBranch?.id]);

    // Extract initials from branch name: "Sucursal de Prueba" → "SP", "Casa Matriz" → "CM"
    const branchInitials = useCallback((name: string) => {
        const cleaned = name.replace('RENOTECH', '').replace(/[()]/g, '').trim();
        const words = cleaned.split(/\s+/).filter(w => w.length > 1 && !['de', 'del', 'la', 'el', 'los', 'las'].includes(w.toLowerCase()));
        return words.map(w => w[0].toUpperCase()).join('') || name.slice(0, 2).toUpperCase();
    }, []);

    // Build lookup: per product code → stock per branch
    const crossBranchLookup = useMemo(() => {
        const map = new Map<string, Map<string, number>>();
        for (const bs of crossBranchData) {
            for (const p of bs.products) {
                if (p.codigo) {
                    const key = p.codigo.toUpperCase().trim();
                    if (!map.has(key)) map.set(key, new Map());
                    map.get(key)!.set(bs.branch.name, p.stock);
                }
            }
        }
        return map;
    }, [crossBranchData]);

    // All other branch names (for showing 0 when product doesn't exist in that branch)
    const otherBranchNames = useMemo(() => crossBranchData.map(bs => bs.branch.name), [crossBranchData]);

    // Helper: get ALL other branches' stock for a product (shows 0 if product doesn't exist there)
    const getBranchStocks = useCallback((product: Product) => {
        const productStocks = product.codigo ? crossBranchLookup.get(product.codigo.toUpperCase().trim()) : null;
        return otherBranchNames.map(name => ({
            branchName: name,
            initials: branchInitials(name),
            stock: productStocks?.get(name) ?? 0,
        }));
    }, [crossBranchLookup, otherBranchNames, branchInitials]);

    // Hover tooltip handlers — store element ref, recalculate position at render
    const handleMouseEnter = useCallback((e: React.MouseEvent, product: Product) => {
        const el = e.currentTarget as HTMLElement;
        hoverTimerRef.current = setTimeout(() => {
            setHoverTooltip({ element: el, product });
        }, 1000);
    }, []);

    const handleMouseLeave = useCallback(() => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
        setHoverTooltip(null);
    }, []);

    const scrollCategories = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 200;
            scrollContainerRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    // Reset pagination when search changes (Adjust state during render)
    if (searchTerm !== prevSearch || selectedCategory !== prevCategory) {
        setCurrentPage(1);
        setPrevSearch(searchTerm);
        setPrevCategory(selectedCategory);
    }

    const handleSearchChange = (val: string) => {
        // Detect "5*" prefix
        const match = val.match(/^(\d+)[*xX](.*)/);
        if (match) {
            setQuantityPrefix(parseInt(match[1]));
            setSearchTerm(match[2]);
        } else {
            setSearchTerm(val);
        }
    };



    const handleProductClick = (product: Product) => {
        if (isConsolidatedView) {
            toast.error('No se pueden añadir productos en vista consolidada. Selecciona una sucursal.');
            return;
        }

        const effectiveQuantity = quantityPrefix;

        addToCart(product, effectiveQuantity);
        setQuantityPrefix(1);
        setSearchTerm('');

        if (product.stock === 0) {
            toast.info('Producto sin stock — Modo Cotización', {
                description: 'Solo se puede generar una Proforma. Verifique disponibilidad en otras sucursales.'
            });
        }
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F3') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Compute categories unique list
    const categories = useMemo(() => {
        const uniqueCats = Array.from(new Set(products.map(p => p.categoria || 'Otros').filter(Boolean)));

        // Sort and move "Otros" to end
        const sorted = uniqueCats
            .filter(c => c !== 'Otros')
            .sort((a, b) => a.localeCompare(b));

        if (uniqueCats.includes('Otros')) {
            sorted.push('Otros');
        }

        return ['Todos', ...sorted];
    }, [products]);

    // Compute brands unique list
    const brands = useMemo(() => {
        const uniqueBrands = Array.from(new Set(products.map(p => p.marca).filter(Boolean))) as string[];
        return ['Todas', ...uniqueBrands.sort((a, b) => a.localeCompare(b))];
    }, [products]);

    // Compute origins unique list
    const origins = useMemo(() => {
        const uniqueOrigins = Array.from(new Set(products.map(p => p.origen).filter(Boolean))) as string[];
        return ['Todos', ...uniqueOrigins.sort((a, b) => a.localeCompare(b))];
    }, [products]);

    // Filter products
    const filteredProducts = useMemo(() => {
        const normSearch = normalizeText(searchTerm);
        const filtered = products.filter(p => {
            const matchesSearch =
                normalizeText(p.nombre).includes(normSearch) ||
                normalizeText(p.codigo).includes(normSearch) ||
                normalizeText(p.codigoFabrica as string).includes(normSearch) ||
                normalizeText(p.codigoOE as string).includes(normSearch) ||
                normalizeText(p.id).includes(normSearch);

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
        const priceOf = (p: Product) => p.precioVenta ?? p.precio ?? 0;
        return filtered.sort((a, b) => {
            switch (sortMode) {
                case 'stock-asc': return (a.stock ?? 0) - (b.stock ?? 0);
                case 'stock-desc': return (b.stock ?? 0) - (a.stock ?? 0);
                case 'price-desc': return priceOf(b) - priceOf(a);
                case 'price-asc': return priceOf(a) - priceOf(b);
                case 'name': return a.nombre.localeCompare(b.nombre);
                case 'default':
                default:
                    if (a.stock === 0 && b.stock !== 0) return 1;
                    if (a.stock !== 0 && b.stock === 0) return -1;
                    return 0;
            }
        });
    }, [products, searchTerm, selectedCategory, selectedBrand, selectedOrigin, sortMode, stockFilter]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
    const paginatedProducts = filteredProducts.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    if (loading) {
        return (
            <div className="flex flex-1 flex-col pr-0 md:pr-6 h-full overflow-hidden">
                <div className="mb-6 flex flex-col gap-4">
                    <Skeleton className="h-14 w-full rounded-2xl bg-slate-100 dark:bg-white/5" />
                    <div className="flex gap-2">
                        <Skeleton className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-white/5" />
                        <div className="flex gap-2 overflow-hidden">
                            {[1, 2, 3, 4, 5].map(i => (
                                <Skeleton key={i} className="h-9 w-24 rounded-2xl bg-slate-100 dark:bg-white/5 shrink-0" />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 pb-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                        <div key={i} className="flex flex-col rounded-2xl border border-slate-100 dark:border-white/5 bg-white dark:bg-[#020617] overflow-hidden h-64">
                            <Skeleton className="h-32 w-full bg-slate-50 dark:bg-white/2" />
                            <div className="p-4 flex-1 flex flex-col gap-3">
                                <Skeleton className="h-3 w-1/3 bg-slate-100 dark:bg-white/5" />
                                <Skeleton className="h-4 w-full bg-slate-100 dark:bg-white/5" />
                                <div className="mt-auto flex justify-between items-end">
                                    <Skeleton className="h-5 w-16 bg-slate-100 dark:bg-white/5" />
                                    <Skeleton className="h-8 w-8 rounded-full bg-slate-100 dark:bg-white/5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div data-tour="pos-products" className="flex-1 flex flex-col min-w-0 h-full overflow-hidden transition-colors">

            {/* Top: Categories and Search */}
            <div className="mb-4 flex flex-col gap-3 shrink-0 animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="flex items-center gap-3">
                    <div className="flex flex-1 relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-yellow-500 transition-colors" size={18} />
                        <button
                            onClick={() => setShowScanner(true)}
                            className="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-yellow-500 hover:bg-yellow-500/10 rounded-xl transition-all active:scale-95"
                            title="Escanear QR"
                        >
                            <QrCode size={18} />
                        </button>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {quantityPrefix > 1 && (
                                <span className="bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-xl animate-in zoom-in-50 shadow-sm">
                                    {quantityPrefix}x
                                </span>
                            )}
                        </div>
                        <input
                            data-tour="pos-search"
                            ref={searchInputRef}
                            type="text"
                            placeholder="Buscar por descripción o código... (F3)"
                            className="w-full rounded-xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#020617] hover:bg-white dark:hover:bg-slate-900 focus:bg-white dark:focus:bg-slate-900 py-3 pl-11 pr-24 text-sm font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:ring-4 focus:ring-yellow-500/10 focus:border-yellow-500 outline-none shadow-sm transition-all"
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                        />
                    </div>
                </div>

                {/* Categories - Yellow/Slate Premium Pills */}
                <div className="flex items-center gap-2 min-w-0">
                    <button
                        onClick={() => scrollCategories('left')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white transition hidden md:block"
                    >
                        <ChevronLeft size={18} />
                    </button>

                    <div
                        ref={scrollContainerRef}
                        className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none snap-x flex-1 scroll-smooth"
                    >
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                className={clsx(
                                    "px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl whitespace-nowrap transition-all flex items-center gap-2 snap-start shrink-0 active:scale-95 border duration-200",
                                    selectedCategory === cat
                                        ? "bg-slate-900 text-white border-slate-900 dark:bg-[#FFD700] dark:text-black dark:border-yellow-400 shadow-lg shadow-black/10 dark:shadow-[#FFD700]/20"
                                        : "bg-white dark:bg-[#111827] text-slate-500 border-slate-100 dark:border-white/10 hover:border-yellow-500/50 hover:text-slate-900 dark:hover:text-white"
                                )}
                            >
                                <span className={clsx(
                                    "p-1 rounded-xl transition-colors",
                                    selectedCategory === cat
                                        ? "bg-white/10 dark:bg-black/10 text-white dark:text-black"
                                        : "bg-slate-50 dark:bg-white/5 text-slate-400"
                                )}>
                                    {getCategoryIcon(cat)}
                                </span>
                                {cat}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => scrollCategories('right')}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white transition hidden md:block"
                    >
                        <ChevronRight size={18} />
                    </button>

                    {/* View Mode Toggle */}
                    <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl shrink-0">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={clsx(
                                "p-1.5 rounded-xl transition-all",
                                viewMode === 'grid'
                                    ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm"
                                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            )}
                            title="Vista Cuadrícula"
                        >
                            <LayoutGrid size={14} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={clsx(
                                "p-1.5 rounded-xl transition-all",
                                viewMode === 'list'
                                    ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm"
                                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            )}
                            title="Vista Lista"
                        >
                            <List size={14} />
                        </button>
                    </div>
                </div>

                {/* Filters row: Brand / Origin / Sort / Stock */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="relative">
                        <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={11} />
                        <select
                            value={selectedBrand}
                            onChange={(e) => setSelectedBrand(e.target.value)}
                            className="w-full appearance-none bg-white dark:bg-background border border-slate-100 dark:border-white/10 hover:border-yellow-500/50 rounded-xl py-2 pl-7 pr-7 text-[10px] font-bold text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 cursor-pointer transition-all uppercase tracking-wider truncate"
                            title="Marca"
                        >
                            {brands.map(brand => (
                                <option key={brand} value={brand} className="bg-white dark:bg-background text-slate-900 dark:text-white">
                                    {brand === 'Todas' ? 'Todas las marcas' : brand}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                    </div>

                    <div className="relative">
                        <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={11} />
                        <select
                            value={selectedOrigin}
                            onChange={(e) => setSelectedOrigin(e.target.value)}
                            className="w-full appearance-none bg-white dark:bg-background border border-slate-100 dark:border-white/10 hover:border-yellow-500/50 rounded-xl py-2 pl-7 pr-7 text-[10px] font-bold text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 cursor-pointer transition-all uppercase tracking-wider truncate"
                            title="Origen"
                        >
                            {origins.map(o => (
                                <option key={o} value={o} className="bg-white dark:bg-background text-slate-900 dark:text-white">
                                    {o === 'Todos' ? 'Todos los orígenes' : o}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                    </div>

                    <div className="relative">
                        <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={11} />
                        <select
                            value={sortMode}
                            onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                            className="w-full appearance-none bg-white dark:bg-background border border-slate-100 dark:border-white/10 hover:border-yellow-500/50 rounded-xl py-2 pl-7 pr-7 text-[10px] font-bold text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 cursor-pointer transition-all uppercase tracking-wider truncate"
                            title="Ordenar"
                        >
                            <option value="default">Sugerido</option>
                            <option value="stock-desc">Mayor stock</option>
                            <option value="stock-asc">Menor stock</option>
                            <option value="price-desc">Mayor precio</option>
                            <option value="price-asc">Menor precio</option>
                            <option value="name">Nombre A-Z</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                    </div>

                    <div className="relative">
                        <Boxes className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={11} />
                        <select
                            value={stockFilter}
                            onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
                            className="w-full appearance-none bg-white dark:bg-background border border-slate-100 dark:border-white/10 hover:border-yellow-500/50 rounded-xl py-2 pl-7 pr-7 text-[10px] font-bold text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 cursor-pointer transition-all uppercase tracking-wider truncate"
                            title="Stock"
                        >
                            <option value="todos">Todo el stock</option>
                            <option value="en-stock">En stock</option>
                            <option value="sin-stock">Sin stock</option>
                            <option value="bajo-min">Bajo mín.</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                    </div>
                </div>
            </div>

            {/* Product Grid */}
            <div className="flex-1 overflow-y-auto min-h-0 relative custom-scrollbar pr-1">
                {paginatedProducts.length === 0 ? (
                    <EmptyState
                        title="No se encontraron productos"
                        description={searchTerm || selectedCategory !== 'Todos' || selectedBrand !== 'Todas'
                            ? "Intenta ajustar tus filtros de búsqueda."
                            : "El inventario está vacío."}
                        icon={Package}
                    />
                ) : (
                    <div className={clsx(
                        "pb-20 md:pb-4",
                        viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3" : "flex flex-col gap-1.5"
                    )}>
                        {paginatedProducts.map((product, index) => (
                            viewMode === 'grid' ? (
                                <div
                                    key={product.id}
                                    onClick={() => handleProductClick(product)}
                                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, product }); }}
                                    onMouseEnter={(e) => handleMouseEnter(e, product)}
                                    onMouseLeave={handleMouseLeave}
                                    className={clsx(
                                        "group relative flex gap-3 p-3 rounded-2xl border cursor-pointer transition-all duration-200",
                                        product.stock === 0
                                            ? "border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/2"
                                            : "border-slate-100 dark:border-white/5 bg-white dark:bg-[#020617] hover:border-yellow-500/30 hover:shadow-lg hover:shadow-yellow-500/5 active:scale-[0.98]"
                                    )}
                                >
                                    {/* Stock badge — TOP LEFT */}
                                    <div className="absolute -top-1.5 left-3 z-10">
                                        {product.stock === 0 ? (
                                            <span className="text-[8px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-xl bg-yellow-500 text-black">
                                                Solo Cotización
                                            </span>
                                        ) : (
                                            <span className={clsx(
                                                "text-[10px] font-black tabular-nums px-2 py-0.5 rounded-xl",
                                                product.stock <= 5
                                                    ? "bg-slate-900 dark:bg-yellow-500 text-yellow-500 dark:text-black"
                                                    : "bg-slate-900 dark:bg-white/10 text-white"
                                            )}>
                                                Stock: {product.stock}
                                            </span>
                                        )}
                                    </div>

                                    {/* Inline Image */}
                                    <div className="w-10 h-10 shrink-0 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center overflow-hidden relative mt-3">
                                        {product.imagenUrl ? (
                                            <Image src={product.imagenUrl} alt="" fill className="object-contain p-0.5" sizes="40px" priority={index < 12} />
                                        ) : (
                                            <Package size={16} className="text-slate-300 dark:text-white/10" />
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0 flex flex-col pt-3">
                                        {/* Brand + Code — Label Operativa */}
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            {product.marca && (
                                                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] shrink-0 group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors">
                                                    {product.marca}
                                                </span>
                                            )}
                                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest wrap-break-word">{product.codigo}</span>
                                            {!!product.codigoFabrica && (
                                                <span className="text-[9px] text-blue-500/60 font-bold wrap-break-word hidden xl:inline">{product.codigoFabrica as string}</span>
                                            )}
                                        </div>

                                        {/* Name — Dato Maestro */}
                                        <h3 className="text-xs font-bold uppercase text-slate-900 dark:text-white leading-snug wrap-break-word mb-2 transition-colors">
                                            {product.nombre}
                                        </h3>

                                        {/* Price + Add button */}
                                        <div className="mt-auto flex items-end justify-between">
                                            <div className="flex flex-col">
                                                <div className="flex items-baseline gap-1 text-slate-900 dark:text-white">
                                                    <span className="tabular-nums font-black text-lg tracking-tighter">
                                                        Bs. {(invoiceMode === 'CON_FACTURA'
                                                            ? (product.precioConFactura ?? product.precioVenta ?? product.precio ?? 0)
                                                            : (product.precioSinFactura ?? product.precioVenta ?? product.precio ?? 0)
                                                        ).toFixed(2)}
                                                    </span>
                                                    <span className="text-[8px] font-black uppercase text-slate-400 tracking-[0.15em]">{invoiceMode === 'CON_FACTURA' ? 'C/F' : 'S/F'}</span>
                                                </div>
                                                <div className="flex items-baseline gap-1 text-slate-400 dark:text-slate-600">
                                                    <span className="text-xs font-bold tracking-tighter tabular-nums">
                                                        Bs. {(invoiceMode === 'CON_FACTURA'
                                                            ? (product.precioSinFactura ?? product.precioVenta ?? product.precio ?? 0)
                                                            : (product.precioConFactura ?? product.precioVenta ?? product.precio ?? 0)
                                                        ).toFixed(0)}
                                                    </span>
                                                    <span className="text-[7px] font-bold uppercase">{invoiceMode === 'CON_FACTURA' ? 'S/F' : 'C/F'}</span>
                                                </div>
                                            </div>

                                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-2 text-slate-400 group-hover:bg-yellow-500 group-hover:text-black transition-all active:scale-90">
                                                <Plus size={14} strokeWidth={3} />
                                            </div>
                                        </div>

                                        {/* Cross-branch stock */}
                                        {(() => {
                                            const stocks = getBranchStocks(product);
                                            if (!stocks.length) return null;
                                            return (
                                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 pt-2 border-t border-slate-100 dark:border-white/5">
                                                    {stocks.map(s => (
                                                        <span key={s.branchName} title={s.branchName} className={clsx(
                                                            "text-[9px] font-black uppercase tracking-widest flex items-center gap-1",
                                                            s.stock > 0
                                                                ? "text-blue-600 dark:text-blue-400"
                                                                : "text-slate-300 dark:text-slate-700"
                                                        )}>
                                                            <div className={clsx("w-1.5 h-1.5 rounded-full", s.stock > 0 ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-700")} />
                                                            {s.initials}: {s.stock}
                                                        </span>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ) : (
                                <div
                                    key={product.id}
                                    onClick={() => handleProductClick(product)}
                                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, product }); }}
                                    onMouseEnter={(e) => handleMouseEnter(e, product)}
                                    onMouseLeave={handleMouseLeave}
                                    className={clsx(
                                        "group flex items-center gap-3 p-2.5 rounded-2xl border cursor-pointer transition-all duration-200",
                                        product.stock === 0
                                            ? "border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/2"
                                            : "border-slate-100 dark:border-white/5 bg-white dark:bg-[#020617] hover:border-yellow-500/30 active:scale-[0.99]"
                                    )}
                                >
                                    {/* Stock indicator */}
                                    {product.stock === 0 ? (
                                        <span className="text-[8px] font-black uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-xl bg-yellow-500 text-black shrink-0">COT</span>
                                    ) : (
                                        <span className={clsx(
                                            "text-xs font-black tabular-nums w-8 text-center shrink-0",
                                            product.stock <= 5 ? "text-yellow-600 dark:text-yellow-400" : "text-slate-900 dark:text-white"
                                        )}>
                                            {product.stock}
                                        </span>
                                    )}
                                    {/* Image */}
                                    <div className="h-8 w-8 shrink-0 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center relative overflow-hidden">
                                        {product.imagenUrl ? (
                                            <Image src={product.imagenUrl} alt="" fill className="object-contain p-0.5" sizes="32px" />
                                        ) : (
                                            <Package size={12} className="text-slate-300 dark:text-white/10" />
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">{product.codigo}</span>
                                            {product.marca && <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] group-hover:text-yellow-600 transition-colors">{product.marca}</span>}
                                            {(() => {
                                                const stocks = getBranchStocks(product);
                                                const withStock = stocks.filter(s => s.stock > 0);
                                                if (!withStock.length) return null;
                                                return (
                                                    <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest" title={stocks.map(s => `${s.branchName}: ${s.stock}`).join(', ')}>
                                                        {withStock.map(s => `${s.initials}:${s.stock}`).join(' ')}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                        <span className="text-xs font-bold uppercase text-slate-900 dark:text-white wrap-break-word transition-colors">{product.nombre}</span>
                                    </div>

                                    {/* Price */}
                                    <div className="flex flex-col items-end w-24 shrink-0">
                                        <div className="flex items-baseline gap-1 text-slate-900 dark:text-white">
                                            <span className="text-sm font-bold tracking-tighter tabular-nums">
                                                {(invoiceMode === 'CON_FACTURA'
                                                    ? (product.precioConFactura ?? product.precioVenta ?? product.precio ?? 0)
                                                    : (product.precioSinFactura ?? product.precioVenta ?? product.precio ?? 0)
                                                ).toFixed(2)}
                                            </span>
                                            <span className="text-[7px] font-bold uppercase opacity-40">{invoiceMode === 'CON_FACTURA' ? 'C/F' : 'S/F'}</span>
                                        </div>
                                        <div className="items-baseline gap-1 text-slate-400 dark:text-slate-600 hidden sm:flex">
                                            <span className="text-xs font-bold tracking-tighter tabular-nums">
                                                {(invoiceMode === 'CON_FACTURA'
                                                    ? (product.precioSinFactura ?? product.precioVenta ?? product.precio ?? 0)
                                                    : (product.precioConFactura ?? product.precioVenta ?? product.precio ?? 0)
                                                ).toFixed(0)}
                                            </span>
                                            <span className="text-[6px] font-bold uppercase">{invoiceMode === 'CON_FACTURA' ? 'S/F' : 'C/F'}</span>
                                        </div>
                                    </div>

                                    {/* Add */}
                                    <div className="rounded-xl p-1.5 transition-all active:scale-90 shrink-0 bg-slate-100 dark:bg-white/5 text-slate-400 group-hover:bg-yellow-500 group-hover:text-black">
                                        <Plus size={12} strokeWidth={3} />
                                    </div>
                                </div>
                            )
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/10 pt-3 shrink-0 mt-2 pb-16 md:pb-0">
                    <div className="text-xs font-bold text-slate-500">
                        {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} de {filteredProducts.length}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background text-slate-400 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition shadow-sm active:scale-95"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="flex items-center px-4 font-black text-sm bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white min-w-12 justify-center">
                            {currentPage}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background text-slate-400 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition shadow-sm active:scale-95"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
            {/* QR Scanner Modal Remains Same */}
            {showScanner && (
                <QRScanner
                    onClose={() => setShowScanner(false)}
                    onScan={(code) => {
                        // ... logic remains same
                        const product = products.find(p =>
                            p.codigo === code ||
                            p.codigoFabrica === code ||
                            p.codigoOE === code ||
                            p.id === code
                        );
                        if (product) {
                            handleProductClick(product);
                        } else {
                            toast.error('Producto no encontrado: ' + code);
                        }
                    }}
                    title="Escaneando Producto..."
                />
            )}

            {selectedProductDetails && (
                <ProductDetailModal
                    isOpen={!!selectedProductDetails}
                    product={selectedProductDetails}
                    onClose={() => setSelectedProductDetails(null)}
                    onEdit={() => toast.info('Edición deshabilitada', { description: 'Por seguridad, vaya al módulo de Inventario para modificar este producto.' })}
                    onDelete={() => toast.error('Eliminación no permitida', { description: 'Los productos solo se pueden eliminar desde el módulo de Inventario.' })}
                />
            )}

            {lostSaleProduct && (
                <LostSaleModal 
                    isOpen={!!lostSaleProduct}
                    product={lostSaleProduct}
                    onClose={() => setLostSaleProduct(null)}
                />
            )}

            {/* Context Menu (right-click) */}
            {contextMenu && (
                <>
                    <div className="fixed inset-0 z-9998" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
                    <div
                        className="fixed z-9999 bg-white dark:bg-[#111827] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 py-1 min-w-52 animate-in fade-in zoom-in-95 duration-150"
                        style={{
                            left: Math.min(Math.max(contextMenu.x, 8), window.innerWidth - 220),
                            top: Math.min(Math.max(contextMenu.y, 8), window.innerHeight - 300),
                        }}
                    >
                        {/* Product header */}
                        <div className="px-3 py-2 border-b border-slate-100 dark:border-white/10">
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{contextMenu.product.codigo}</p>
                            <p className="text-xs font-bold uppercase text-slate-900 dark:text-white wrap-break-word">{contextMenu.product.nombre}</p>
                        </div>
                        <button
                            onClick={() => { handleProductClick(contextMenu.product); setContextMenu(null); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                        >
                            <Plus size={14} /> Agregar al carrito
                        </button>
                        <button
                            onClick={() => { setSelectedProductDetails(contextMenu.product); setContextMenu(null); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                        >
                            <Eye size={14} /> Ver detalles
                        </button>
                        <button
                            onClick={() => { setLostSaleProduct(contextMenu.product); setContextMenu(null); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                        >
                            <AlertCircle size={14} /> Registrar venta perdida
                        </button>
                        {/* Stock across branches */}
                        {(() => {
                            const stocks = getBranchStocks(contextMenu.product);
                            if (!stocks.length) return null;
                            return (
                                <div className="px-3 py-2 border-t border-slate-100 dark:border-white/10">
                                    <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-1">Stock en otras sucursales</p>
                                    <div className="flex flex-col gap-0.5">
                                        {stocks.map(s => (
                                            <div key={s.branchName} className="flex items-center justify-between">
                                                <span className={clsx("text-[10px] font-bold flex items-center gap-1", s.stock > 0 ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-600")}>
                                                    <div className={clsx("w-1.5 h-1.5 rounded-full", s.stock > 0 ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-700")} />
                                                    {s.initials} — {s.branchName}
                                                </span>
                                                <span className={clsx("text-[10px] font-black tabular-nums", s.stock > 0 ? "text-slate-900 dark:text-white" : "text-slate-300 dark:text-slate-700")}>{s.stock}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </>
            )}

            {/* Hover Tooltip (1s delay) */}
            <ProductPreviewTooltip
                anchor={hoverTooltip?.element ?? null}
                product={hoverTooltip?.product ?? null}
                branchStocks={hoverTooltip ? getBranchStocks(hoverTooltip.product) : undefined}
            />
        </div>
    );
}
