'use client';

import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types';
import {
    Search, Package, Plus, ChevronLeft, ChevronRight,
    LayoutGrid, Activity, Wrench, Zap, Snowflake, Settings, Car, Filter, Layers, CircleDot, List, Eye, ChevronDown, QrCode, ArrowUpDown, Boxes, Globe
} from 'lucide-react';
import Image from 'next/image';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import { useQuotationStore } from '@/store/quotationStore';
import { useBranch } from '@/contexts/BranchContext';
import { useImperativeHandle, forwardRef } from 'react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import ProductDetailModal from '@/app/(main)/inventario/components/ProductDetailModal';
import { CrossBranchInventoryService, BranchStock } from '@/services/CrossBranchInventoryService';
import { useProductHoverPreview } from '@/hooks/useProductHoverPreview';
import ProductPreviewTooltip, { type BranchStockInfo } from '@/components/common/ProductPreviewTooltip';
import ProductContextMenu from '@/components/common/ProductContextMenu';

const QRScanner = dynamic(() => import('@/components/common/QRScanner'), {
    loading: () => <div className="h-75 w-full bg-black rounded-2xl animate-pulse" />,
    ssr: false
});

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

const QuotationProductGrid = forwardRef((props, ref) => {
    const { products, loading } = useProducts();
    const { addItem, isTaxed, viewMode, setViewMode } = useQuotationStore();
    const { currentBranch, isConsolidatedView } = useBranch();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setCategory] = useState('Todos');
    const [selectedBrand, setSelectedBrand] = useState<string>('Todas');
    const [selectedOrigin, setSelectedOrigin] = useState<string>('Todos');
    const [sortMode, setSortMode] = useState<'name' | 'stock-asc' | 'stock-desc' | 'price-desc' | 'price-asc' | 'recent'>('name');
    const [stockFilter, setStockFilter] = useState<'todos' | 'en-stock' | 'sin-stock' | 'bajo-min'>('todos');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedProductDetails, setSelectedProductDetails] = useState<Product | null>(null);
    const [showScanner, setShowScanner] = useState(false);
    const [crossBranchData, setCrossBranchData] = useState<BranchStock[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; product: Product } | null>(null);
    const { hoverState, onMouseEnter: onProductHoverEnter, onMouseLeave: onProductHoverLeave, clear: clearHover } = useProductHoverPreview(1000);

    // Fetch cross-branch stock
    useEffect(() => {
        const fetchCrossBranch = async () => {
            if (!currentBranch?.id) return;
            try {
                const data = await CrossBranchInventoryService.getAllBranchesStock(currentBranch.id);
                setCrossBranchData(data);
            } catch (err) {
                console.warn('[Quotation] Could not load cross-branch stock:', err);
            }
        };
        fetchCrossBranch();
    }, [currentBranch?.id]);

    const crossBranchLookup = useMemo(() => {
        const map = new Map<string, { branchName: string; stock: number }[]>();
        for (const bs of crossBranchData) {
            for (const p of bs.products) {
                if (p.stock > 0 && p.codigo) {
                    const key = p.codigo.toUpperCase().trim();
                    if (!map.has(key)) map.set(key, []);
                    map.get(key)!.push({ branchName: bs.branch.name, stock: p.stock });
                }
            }
        }
        return map;
    }, [crossBranchData]);

    const getBranchStocks = (product: Product): BranchStockInfo[] => {
        if (!product.codigo) return [];
        const list = crossBranchLookup.get(product.codigo.toUpperCase().trim()) || [];
        return list.map(s => ({
            branchName: s.branchName,
            initials: s.branchName.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase(),
            stock: s.stock,
        }));
    };

    // Expose clear functionality to parent
    useImperativeHandle(ref, () => ({
        clearSearch: () => {
            setSearchTerm('');
            setCurrentPage(1);
        }
    }));

    const scrollCategories = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 200;
            scrollContainerRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    const [prevSearch, setPrevSearch] = useState(searchTerm);
    const [prevCategory, setPrevCategory] = useState(selectedCategory);
    const [prevBrand, setPrevBrand] = useState(selectedBrand);

    // Reset pagination when filters change (During render to avoid cascading renders)
    if (searchTerm !== prevSearch || selectedCategory !== prevCategory || selectedBrand !== prevBrand) {
        setPrevSearch(searchTerm);
        setPrevCategory(selectedCategory);
        setPrevBrand(selectedBrand);
        setCurrentPage(1);
    }

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

    // Filtered
    const filteredProducts = useMemo(() => {
        const filtered = products.filter(p => {
            const term = searchTerm.toLowerCase();
            const matchesSearch =
                p.nombre.toLowerCase().includes(term) ||
                p.codigo.toLowerCase().includes(term) ||
                ((p.codigoFabrica as string)?.toLowerCase()?.includes(term)) ||
                ((p.codigoOE as string)?.toLowerCase()?.includes(term));
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
                case 'recent': {
                    const ta = (a.updatedAt as { seconds?: number } | undefined)?.seconds ?? 0;
                    const tb = (b.updatedAt as { seconds?: number } | undefined)?.seconds ?? 0;
                    return tb - ta;
                }
                case 'name':
                default: return a.nombre.localeCompare(b.nombre);
            }
        });
    }, [products, searchTerm, selectedCategory, selectedBrand, selectedOrigin, sortMode, stockFilter]);

    // Pagination
    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
    const paginatedProducts = filteredProducts.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );


    const handleProductSelect = (product: Product) => {
        if (isConsolidatedView) {
            toast.error('No se pueden añadir productos en vista consolidada');
            return;
        }
        if (!currentBranch?.id) {
            toast.error('Selecciona una sucursal primero');
            return;
        }

        const safePriceCF = product.precioConFactura ?? product.precioVenta ?? product.precio ?? 0;
        const safePriceSF = product.precioSinFactura ?? product.precioVenta ?? product.precio ?? 0;
        const price = isTaxed ? safePriceCF : safePriceSF;
        addItem({
            productId: product.id!,
            productCode: product.codigo,
            productName: product.nombre,
            productCodigoFabrica: product.codigoFabrica as string,
            productCodigoOE: product.codigoOE as string,
            productMarca: product.marca,
            quantity: 1,
            unitPrice: price,
            priceMode: isTaxed ? 'CON_FACTURA' : 'SIN_FACTURA',
            priceSinFactura: safePriceSF,
            priceConFactura: safePriceCF,
            subtotal: price
        });

        if (product.stock === 0) {
            toast.info('Producto sin stock local añadido a la cotización', {
                description: 'Asegúrese de verificar la disponibilidad en otras sucursales.'
            });
        }
    };

    if (loading) {
        return (
            <div className="flex flex-1 flex-col h-full overflow-hidden">
                <div className="mb-6 flex flex-col gap-4">
                    <Skeleton className="h-14 w-full rounded-2xl bg-gray-200 dark:bg-white/5" />
                    <div className="flex gap-2">
                        <Skeleton className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-white/5" />
                        <div className="flex gap-2 overflow-hidden">
                            {[1, 2, 3, 4, 5].map(i => (
                                <Skeleton key={i} className="h-9 w-24 rounded-2xl bg-gray-200 dark:bg-white/5 shrink-0" />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 pb-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                        <div key={i} className="flex flex-col rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background overflow-hidden h-64">
                            <Skeleton className="h-32 w-full bg-slate-100 dark:bg-white/5/50" />
                            <div className="p-4 flex-1 flex flex-col gap-3">
                                <Skeleton className="h-3 w-1/3 bg-gray-200 dark:bg-white/5" />
                                <Skeleton className="h-4 w-full bg-gray-200 dark:bg-white/5" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div data-tour="quot-products" className="flex flex-1 flex-col h-full overflow-hidden transition-colors">
            {/* Search & Filters */}
            <div className="mb-4 flex flex-col gap-3 shrink-0 animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="flex items-center gap-3">
                    <div className="flex flex-1 relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-yellow-500 transition-colors" size={18} />
                        <button
                            onClick={() => setShowScanner(true)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-yellow-500 hover:bg-yellow-500/10 rounded-xl transition-all active:scale-95"
                            title="Escanear QR"
                        >
                            <QrCode size={18} />
                        </button>
                        <input
                            data-tour="quot-search"
                            ref={searchInputRef}
                            type="text"
                            placeholder="Buscar producto por nombre o código..."
                            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/40 hover:bg-white dark:hover:bg-slate-900 focus:bg-white dark:focus:bg-slate-900 py-3 pl-11 pr-12 text-sm font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:ring-4 focus:ring-yellow-500/10 focus:border-yellow-500 outline-none shadow-sm transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                {/* Categories */}
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
                                        ? "bg-slate-900 text-white border-slate-900 dark:bg-[#FFD700] dark:text-black dark:border-yellow-400 shadow-lg shadow-black/10 dark:shadow-[#FFD700]/10"
                                        : "bg-white dark:bg-background text-slate-500 border-slate-100 dark:border-white/10 hover:border-yellow-500/50 hover:text-slate-900 dark:hover:text-white"
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
                                    ? "bg-white dark:bg-white/5 text-slate-900 dark:text-white shadow-sm"
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
                                    ? "bg-white dark:bg-white/5 text-slate-900 dark:text-white shadow-sm"
                                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            )}
                            title="Vista Lista"
                        >
                            <List size={14} />
                        </button>
                    </div>
                </div>

                {/* Filters row */}
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
                            <option value="name">Nombre A-Z</option>
                            <option value="stock-desc">Mayor stock</option>
                            <option value="stock-asc">Menor stock</option>
                            <option value="price-desc">Mayor precio</option>
                            <option value="price-asc">Menor precio</option>
                            <option value="recent">Recientes</option>
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
                        viewMode === 'grid' ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4" : "flex flex-col gap-2"
                    )}>
                        {paginatedProducts.map((product, index) => (
                            viewMode === 'grid' ? (
                                <div
                                    key={product.id}
                                    onClick={() => handleProductSelect(product)}
                                    onContextMenu={(e) => { e.preventDefault(); clearHover(); setContextMenu({ x: e.clientX, y: e.clientY, product }); }}
                                    onMouseEnter={(e) => onProductHoverEnter(e, product)}
                                    onMouseLeave={onProductHoverLeave}
                                    className={clsx(
                                        "group flex flex-col overflow-hidden rounded-xl border transition-all duration-300 relative",
                                        product.stock === 0
                                            ? "border-amber-500/20 bg-amber-50/5 dark:bg-amber-900/5 hover:border-amber-500/40"
                                            : "border-slate-100 dark:border-white/10 bg-white dark:bg-background shadow-sm hover:border-yellow-500/40 hover:shadow-xl hover:shadow-yellow-500/5 active:scale-[0.98]"
                                    )}
                                >
                                    <div className="w-14 h-14 shrink-0 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/10 flex items-center justify-center mx-auto mt-4 overflow-hidden relative group-hover:bg-white dark:group-hover:bg-gray-800 transition-colors pointer-events-none">
                                        {product.imagenUrl ? (
                                            <Image
                                                src={product.imagenUrl}
                                                alt={product.nombre}
                                                fill
                                                className="object-contain p-1 group-hover:scale-110 transition-transform duration-500"
                                                sizes="60px"
                                                priority={index < 8}
                                            />
                                        ) : (
                                            <Package className="text-slate-300 dark:text-slate-700 group-hover:text-slate-400 transition" size={24} />
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="absolute top-2 left-2 flex gap-1 z-10">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedProductDetails(product); }}
                                            className="p-1.5 bg-slate-900/5 dark:bg-white/5 hover:bg-blue-500/10 hover:text-blue-500 text-slate-400 rounded-xl backdrop-blur-sm transition-all active:scale-90"
                                            title="Ver detalles"
                                        >
                                            <Eye size={10} />
                                        </button>

                                        {product.stock <= 5 && product.stock > 0 && (
                                            <span className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 text-[8px] px-1.5 py-0.5 rounded-xl font-bold uppercase tracking-wider">
                                                ¡Pocos!
                                            </span>
                                        )}
                                    </div>

                                    {product.stock === 0 && (
                                        <div className="absolute top-2 right-2 z-10">
                                            <span className="bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-xl uppercase tracking-widest shadow-sm">
                                                Sin Stock
                                            </span>
                                        </div>
                                    )}

                                    <div className="p-3 flex flex-col flex-1 relative">
                                        {product.marca && (
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors">
                                                {product.marca}
                                            </span>
                                        ) || <div className="h-3" />}
                                        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight mb-3 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                            {product.nombre}
                                        </h3>

                                        <div className="mt-auto flex items-end justify-between">
                                            <div className="flex flex-col gap-0.5">
                                                <div className={clsx(
                                                    "flex items-baseline gap-1 group/price",
                                                    isTaxed ? "text-slate-900 dark:text-white" : "text-slate-400 opacity-60"
                                                )}>
                                                    <span className={clsx("font-bold tracking-tight text-lg")}>
                                                        Bs. {(product.precioConFactura ?? product.precioVenta ?? product.precio ?? 0).toFixed(0)}<span className="text-[0.6em] font-medium align-top opacity-70">.{(product.precioConFactura ?? product.precioVenta ?? product.precio ?? 0).toFixed(2).split('.')[1]}</span>
                                                    </span>
                                                    <span className="text-[7px] font-bold uppercase tracking-tighter">C/F</span>
                                                </div>

                                                <div className={clsx(
                                                    "flex items-baseline gap-1",
                                                    !isTaxed ? "text-green-600 dark:text-green-400" : "text-slate-400 opacity-60"
                                                )}>
                                                    <span className={clsx("font-bold tracking-tight text-lg")}>
                                                        Bs. {(product.precioSinFactura ?? product.precioVenta ?? product.precio ?? 0).toFixed(0)}<span className="text-[0.6em] font-medium align-top opacity-70">.{(product.precioSinFactura ?? product.precioVenta ?? product.precio ?? 0).toFixed(2).split('.')[1]}</span>
                                                    </span>
                                                    <span className="text-[7px] font-bold uppercase tracking-tighter">S/F</span>
                                                </div>
                                            </div>

                                            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-1.5 text-slate-400 group-hover:bg-yellow-500 group-hover:text-black transition-all active:scale-90 shadow-sm">
                                                <Plus size={14} strokeWidth={3} />
                                            </div>
                                        </div>

                                        <div className="mt-2 pt-2 border-t border-slate-50 dark:border-white/10 flex flex-col gap-1">
                                            <div className="flex justify-between items-center bg-slate-50 dark:bg-white/5 p-2 rounded-xl mt-1 group-hover:bg-white dark:group-hover:bg-gray-800 transition-colors">
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 wrap-break-word">
                                                        {product.codigo}
                                                    </span>
                                                    {!!product.codigoFabrica && (
                                                        <span className="text-[9px] font-bold text-blue-500 wrap-break-word mt-0.5">
                                                            {product.codigoFabrica as string}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 text-slate-400 bg-white dark:bg-background px-1.5 py-1 rounded-xl border border-slate-100 dark:border-white/10 shadow-sm">
                                                    <Package size={12} className={clsx(product.stock === 0 ? "text-amber-500" : "text-slate-400")} />
                                                    <span className={clsx("text-[10px] font-bold tabular-nums", product.stock === 0 && "text-amber-600 dark:text-amber-400")}>{product.stock}</span>
                                                </div>
                                            </div>

                                            {(() => {
                                                const otherStocks = product.codigo ? crossBranchLookup.get(product.codigo.toUpperCase().trim()) : null;
                                                if (!otherStocks?.length) return null;
                                                return (
                                                    <div className={clsx(
                                                        "flex flex-wrap gap-1.5 items-center text-[7px] mt-1.5 p-1.5 rounded-xl border transition-all duration-300",
                                                        product.stock === 0
                                                            ? "bg-amber-500/3 dark:bg-amber-500/5 border-amber-500/10"
                                                            : "bg-teal-500/2 dark:bg-emerald-400/4 border-teal-500/10 dark:border-emerald-400/10"
                                                    )}>
                                                        {otherStocks.map(s => (
                                                            <span key={s.branchName} className="text-teal-600/80 dark:text-emerald-400/80 font-black uppercase tracking-widest flex items-center gap-1">
                                                                <div className="w-1 h-1 rounded-full bg-teal-500 dark:bg-emerald-500" />
                                                                {s.branchName.replace('RENOTECH (', '').replace(')', '').replace('Sucursal', 'Suc.')}: {s.stock}
                                                            </span>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    key={product.id}
                                    onClick={() => handleProductSelect(product)}
                                    onContextMenu={(e) => { e.preventDefault(); clearHover(); setContextMenu({ x: e.clientX, y: e.clientY, product }); }}
                                    onMouseEnter={(e) => onProductHoverEnter(e, product)}
                                    onMouseLeave={onProductHoverLeave}
                                    className={clsx(
                                        "group flex items-center justify-between overflow-hidden rounded-xl border transition-all duration-200 relative p-2 gap-3",
                                        product.stock === 0
                                            ? "border-amber-500/20 bg-amber-50/5 dark:bg-amber-900/5"
                                            : "border-slate-100 dark:border-white/10 bg-white dark:bg-background hover:border-yellow-500/40 shadow-sm active:scale-[0.99]"
                                    )}
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="h-9 w-9 shrink-0 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center relative overflow-hidden">
                                            {product.imagenUrl ? (
                                                <Image
                                                    src={product.imagenUrl}
                                                    alt={product.nombre}
                                                    fill
                                                    className="object-contain p-1"
                                                    sizes="40px"
                                                />
                                            ) : (
                                                <Package size={14} className="text-slate-300 dark:text-slate-700" />
                                            )}
                                        </div>
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{product.codigo}</span>
                                                {product.marca && <span className="bg-slate-100 dark:bg-white/5 px-1 rounded text-[8px] font-bold text-slate-500 group-hover:text-yellow-600 transition-colors uppercase">{product.marca}</span>}
                                            </div>
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{product.nombre}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 shrink-0 pr-1">
                                        <div className="flex flex-col items-end w-12">
                                            <span className={clsx(
                                                "text-[10px] font-bold",
                                                product.stock === 0 ? "text-amber-500" : (product.stock <= 5 ? "text-orange-500" : "text-green-600 dark:text-green-500")
                                            )}>{product.stock === 0 ? 'COTIZ' : product.stock}</span>
                                            <span className="text-[7px] text-slate-400 font-bold uppercase tracking-widest leading-none">Stock</span>
                                            {(() => {
                                                const otherStocks = product.codigo ? crossBranchLookup.get(product.codigo.toUpperCase().trim()) : null;
                                                if (!otherStocks?.length) return null;
                                                const totalOther = otherStocks.reduce((a, s) => a + s.stock, 0);
                                                return (
                                                    <span
                                                        className="text-[7px] font-black text-teal-600/80 dark:text-emerald-400/80 mt-1 uppercase tracking-widest"
                                                        title={otherStocks.map(s => `${s.branchName}: ${s.stock}`).join(', ')}
                                                    >
                                                        +{totalOther} otras
                                                    </span>
                                                );
                                            })()}
                                        </div>

                                        <div className="flex flex-col items-end w-20">
                                            <div className={clsx("flex items-baseline gap-1", isTaxed ? "text-slate-900 dark:text-white" : "text-slate-400 opacity-60 hidden sm:flex")}>
                                                <span className="text-xs font-bold tracking-tighter">{(product.precioConFactura ?? product.precioVenta ?? product.precio ?? 0).toFixed(2)}</span>
                                                <span className="text-[7px] font-bold uppercase">C/F</span>
                                            </div>
                                            <div className={clsx("flex items-baseline gap-1", !isTaxed ? "text-green-600 dark:text-green-400" : "text-slate-400 opacity-60 hidden sm:flex")}>
                                                <span className="text-xs font-bold tracking-tighter">{(product.precioSinFactura ?? product.precioVenta ?? product.precio ?? 0).toFixed(2)}</span>
                                                <span className="text-[7px] font-bold uppercase">S/F</span>
                                            </div>
                                        </div>

                                        <div className={clsx(
                                            "rounded-xl p-1.5 transition-all shadow-sm active:scale-90",
                                            product.stock === 0 ? "bg-rose-100 dark:bg-rose-900/30 text-rose-400" : "bg-slate-100 dark:bg-white/5 text-slate-400 group-hover:bg-yellow-500 group-hover:text-black"
                                        )}>
                                            <Plus size={14} strokeWidth={3} />
                                        </div>
                                    </div>
                                </div>
                            )
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination */}
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

            {showScanner && (
                <QRScanner
                    onClose={() => setShowScanner(false)}
                    onScan={(code) => {
                        const product = products.find(p =>
                            p.codigo === code ||
                            p.codigoFabrica === code ||
                            p.codigoOE === code ||
                            p.id === code
                        );
                        if (product) {
                            handleProductSelect(product);
                            setShowScanner(false);
                            toast.success('Producto detectado y añadido');
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

            <ProductContextMenu
                position={contextMenu}
                onClose={() => setContextMenu(null)}
                actions={[
                    { label: 'Agregar a cotización', icon: Plus, onClick: (p) => handleProductSelect(p) },
                    { label: 'Ver detalles', icon: Eye, onClick: (p) => setSelectedProductDetails(p) },
                ]}
                branchStocks={contextMenu ? getBranchStocks(contextMenu.product) : undefined}
            />

            <ProductPreviewTooltip
                anchor={hoverState?.element ?? null}
                product={hoverState?.product ?? null}
                branchStocks={hoverState ? getBranchStocks(hoverState.product) : undefined}
            />
        </div>
    );
});

QuotationProductGrid.displayName = 'QuotationProductGrid';

export default QuotationProductGrid;
