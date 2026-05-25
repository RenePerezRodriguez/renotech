'use client';

import { Product } from '@/types';
import { Timestamp, FieldValue } from 'firebase/firestore';
import {
    Package, 
    Edit, 
    Trash2, 
    History as HistoryIcon, 
    Columns, 
    Layers, 
    MapPin, 
    QrCode,
    Activity,
    X,
    ArrowRightLeft,
    Loader2,
    Search,
    Send,
    Truck,
    Eye,
    Tag
} from 'lucide-react';
import ProductLabel from '@/components/inventory/ProductLabel';
import ProductContextMenu from '@/components/common/ProductContextMenu';
import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { usePagination } from '@/hooks/usePagination';
import { ensureDate } from '@/utils/dateHelpers';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import ProductDetailModal from './ProductDetailModal';
import GlobalStockSearchModal from './GlobalStockSearchModal';
import { normalizeText } from '@/utils/normalize';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import Image from 'next/image';
import ConfirmModal from '@/components/common/ConfirmModal';
import { CrossBranchInventoryService, BranchStock } from '@/services/CrossBranchInventoryService';

// Suite Pro v4.0 Components
import TableFooter from '@/components/common/TableFooter';

// Helper functions moved outside to be stable and help React Compiler

const isDeadStock = (lastSaleAt: Date | Timestamp | FieldValue | string | null | undefined) => {
    if (!lastSaleAt) return false;
    const date = ensureDate(lastSaleAt);
    const now = new Date();
    const diffDays = Math.ceil(Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 90;
};

const getStockStatus = (stock: number, min: number = 5) => {
    if (stock === 0) return { 
        label: 'AGOTADO', 
        color: 'bg-rose-50/50 text-rose-600 border-rose-200/60 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 shadow-sm shadow-rose-500/5' 
    };
    if (stock <= min) return { 
        label: 'BAJO STOCK', 
        color: 'bg-amber-50/50 text-amber-600 border-amber-200/60 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20 shadow-sm shadow-amber-500/5' 
    };
    return { 
        label: 'DISPONIBLE', 
        color: 'bg-emerald-50/50 text-emerald-600 border-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 shadow-sm shadow-emerald-500/5' 
    };
};

const getCategoryColor = (cat: string) => {
    if (!cat || cat === 'Otros') return 'bg-slate-100 text-slate-500 border-slate-200/60';
    const colors = [
        'bg-blue-50/50 text-blue-600 border-blue-200/60', 'bg-emerald-50/50 text-emerald-600 border-emerald-200/60',
        'bg-violet-50/50 text-violet-600 border-violet-200/60', 'bg-amber-50/50 text-amber-600 border-amber-200/60',
        'bg-indigo-50/50 text-indigo-600 border-indigo-200/60', 'bg-teal-50/50 text-teal-600 border-teal-200/60',
        'bg-cyan-50/50 text-cyan-600 border-cyan-200/60', 'bg-rose-50/50 text-rose-600 border-rose-200/60'
    ];
    let sum = 0;
    for (let i = 0; i < cat.length; i++) sum += cat.charCodeAt(i);
    return colors[sum % colors.length];
};

interface InventoryTableProps {
    products: Product[];
    loading: boolean;
    onEdit: (product: Product) => void;
    onDelete: (id: string, name: string) => void;
    onBulkDelete?: (ids: string[]) => void;
    onAdjustStock: (product: Product) => void;
    searchTerm: string;
    categoryFilter: string;
    statusFilter: string;
    sortBy?: string;
    canEdit?: boolean;
    canDelete?: boolean;
    /** Mapa masterId -> unidades en tránsito hacia esta sucursal */
    inTransitByMaster?: Record<string, number>;
}

// Subcomponent for stock breakdown popover
function StockDetailPopover({ product, onClose, onTransfer, anchorRect }: { 
    product: Product, 
    onClose: () => void, 
    onTransfer: (fromBranch: { id: string; name: string }, stock: number, productId: string) => void,
    anchorRect: DOMRect | null
}) {
    const [loading, setLoading] = useState(true);
    const [stocks, setStocks] = useState<{ branchName: string; stock: number; branchId: string; productId: string; isHQ?: boolean }[]>([]);
    const { currentBranch } = useBranch();
    const [pos, setPos] = useState({ top: 0, left: 0, placement: 'top' as 'top' | 'bottom' });
    const popoverRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!anchorRect) return;
        
        const POPOVER_WIDTH = 280;
        const POPOVER_HEIGHT = 200; 
        
        let top = anchorRect.top - 12;
        let left = anchorRect.left + (anchorRect.width / 2) - (POPOVER_WIDTH / 2);
        let placement: 'top' | 'bottom' = 'top';

        if (top < POPOVER_HEIGHT + 40) {
            top = anchorRect.bottom + 12;
            placement = 'bottom';
        }

        if (left < 20) left = 20;
        if (left + POPOVER_WIDTH > window.innerWidth - 20) {
            left = window.innerWidth - POPOVER_WIDTH - 20;
        }

        setPos({ top, left, placement });
    }, [anchorRect]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        const timer = setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
            document.addEventListener('keydown', handleEsc);
        }, 10);
        
        return () => {
            clearTimeout(timer);
            document.removeEventListener('click', handleClickOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, [onClose]);

    useEffect(() => {
        const fetch = async () => {
            if (!product.masterId) {
                return;
            }

            try {
                // Precision lookup by masterId (Atomic Link)
                const data = await CrossBranchInventoryService.getProductStockAcrossBranches(product.masterId);
                // Superior Industrial Sorting: Central first, then by name
                const sorted = data.sort((a, b) => {
                    if (a.branchName === 'Central') return -1;
                    if (b.branchName === 'Central') return 1;
                    return a.branchName.localeCompare(b.branchName);
                });
                setStocks(sorted);
            } catch {
                setStocks([]);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [product, currentBranch?.id]);

    if (!anchorRect) return null;

    return createPortal(
        <div 
            ref={popoverRef}
            style={{ 
                position: 'fixed',
                top: pos.placement === 'top' ? 'auto' : pos.top,
                bottom: pos.placement === 'top' ? (window.innerHeight - pos.top) : 'auto',
                left: pos.left,
            }}
            className={clsx(
                "z-9999 w-70 bg-white/95 dark:bg-background/90 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/60 dark:border-white/10 p-6 animate-in fade-in zoom-in-95 duration-300",
                pos.placement === 'top' ? "origin-bottom" : "origin-top"
            )}
            onClick={e => e.stopPropagation()}
        >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-white/10">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Distribución de Stock</h4>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 transition-colors"><X size={14} /></button>
            </div>
            
            {loading ? (
                <div className="flex flex-col items-center justify-center py-6 gap-3">
                    <Loader2 size={24} className="animate-spin text-blue-500" />
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Calculando...</p>
                </div>
            ) : (
                <div className="space-y-3 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                    {stocks.length === 0 ? (
                        <p className="text-[10px] text-center text-slate-500 py-4 font-bold">Sin existencias externas.</p>
                    ) : (
                        stocks.map(s => (
                            <div key={s.branchId} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-transparent hover:border-slate-200 dark:hover:border-white/10 transition-all group shadow-sm hover:shadow-md">
                                <div className="flex items-center gap-3">
                                    <div className={clsx(
                                        "p-2 rounded-xl", 
                                        s.branchId === currentBranch?.id ? 'bg-emerald-500/10 text-emerald-500' : 
                                        s.branchName === 'Central' ? 'bg-blue-500/10 text-blue-500' : 
                                        'bg-slate-200/50 dark:bg-white/5 text-slate-400'
                                    )}>
                                        <MapPin size={12} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight">{s.branchName}</span>
                                        {s.branchId === currentBranch?.id && (
                                            <span className="text-[8px] font-black text-emerald-500 uppercase tracking-tighter">ESTÁS AQUÍ</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={clsx("text-xs font-black tabular-nums", s.stock > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400")}>{s.stock}</span>
                                    {s.stock > 0 && s.branchId !== currentBranch?.id && (
                                        <button 
                                            onClick={() => onTransfer({ id: s.branchId, name: s.branchName }, s.stock, s.productId)}
                                            className="p-2 rounded-xl bg-blue-500 dark:bg-blue-500/20 text-white dark:text-blue-400 transition-opacity active:scale-90"
                                            title="Solicitar Transferencia"
                                        >
                                            <ArrowRightLeft size={10} strokeWidth={3} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/10 text-center">
                <p className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.25em]">Clic fuera para cerrar</p>
            </div>
        </div>,
        document.body
    );
}

function DescriptionTooltip({ product, anchorRect }: { product: Product, anchorRect: DOMRect | null }) {
    if (!anchorRect) return null;

    // Smart placement calculation: If near bottom, open upwards
    const placement = anchorRect.bottom > window.innerHeight - 250 ? 'top' : 'bottom';
    const left = Math.max(20, Math.min(window.innerWidth - 340, anchorRect.left + (anchorRect.width / 2) - 160));

    return createPortal(
        <div 
            style={{ 
                position: 'fixed',
                ...(placement === 'bottom' 
                    ? { top: anchorRect.bottom + 12 } 
                    : { bottom: (window.innerHeight - anchorRect.top) + 12 }
                ),
                left, 
            }}
            className={clsx(
                "z-9999 w-80 bg-slate-900/95 dark:bg-background/98 backdrop-blur-xl text-white p-5 rounded-2xl shadow-2xl border border-white/10 animate-in fade-in duration-300 pointer-events-none",
                placement === 'bottom' ? "slide-in-from-top-2 zoom-in-95" : "slide-in-from-bottom-2 zoom-in-95"
            )}
        >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400">
                        <Package size={16} strokeWidth={2.5} />
                    </div>
                    <div>
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-0.5">Especificaciones</span>
                        <h5 className="text-[11px] font-black uppercase text-white leading-tight">{product.nombre}</h5>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1 px-3 py-1 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                    <span className="text-[10px] font-black text-emerald-400 tabular-nums">Bs. {(product.precioConFactura ?? product.precioVenta ?? product.precio ?? 0).toFixed(2)}</span>
                </div>
            </div>

            {/* Technical Metadata Grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Código ID</span>
                    <span className="text-[10px] font-bold text-slate-200 uppercase tabular-nums">{product.codigo}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Marca / Origen</span>
                    <span className="text-[10px] font-bold text-slate-200 uppercase wrap-break-word">{product.marca || 'GENÉRICO'} / {(product.origen as string) || '-'}</span>
                </div>
                {!!product.codigoFabrica && (
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Código Fábrica</span>
                        <span className="text-[10px] font-bold text-blue-400 uppercase wrap-break-word">{String(product.codigoFabrica || '')}</span>
                    </div>
                )}
                {!!product.codigoOE && (
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Código OEM</span>
                        <span className="text-[10px] font-bold text-amber-400 uppercase wrap-break-word">{String(product.codigoOE || '')}</span>
                    </div>
                )}
                <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Familia</span>
                    <span className="text-[10px] font-bold text-indigo-400 uppercase wrap-break-word">{(product.categoria as string) || 'Otros'}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Existencia</span>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tabular-nums">{product.stock} unidades</span>
                </div>
            </div>

            {!!product.descripcion && (
                <div className="pt-3 border-t border-white/10">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">Descripción Detallada</span>
                    <div className="text-[10px] leading-relaxed text-slate-300 font-medium whitespace-pre-wrap max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                        {String(product.descripcion || '')}
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
}

export default function InventoryTable({ 
    products, 
    loading, 
    onEdit, 
    onDelete, 
    onBulkDelete, 
    onAdjustStock, 
    searchTerm,
    categoryFilter,
    statusFilter,
    sortBy = 'name_asc',
    canEdit = false,
    canDelete = false,
    inTransitByMaster = {}
}: InventoryTableProps) {
    const router = useRouter();
    const { role } = useAuth();
    const { currentBranch, isConsolidatedView } = useBranch();

    // Multi-select state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [popoverProductId, setPopoverProductId] = useState<string | null>(null);
    const [popoverAnchorRect, setPopoverAnchorRect] = useState<DOMRect | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [labelProduct, setLabelProduct] = useState<Product | null>(null);
    const [hoverProductId, setHoverProductId] = useState<string | null>(null);
    const [hoverAnchorRect, setHoverAnchorRect] = useState<DOMRect | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; product: Product } | null>(null);

    const columnLabels: Record<string, string> = {
        producto: 'Titular de Activo / ID',
        marca: 'Información Técnica / Marca',
        categoria: 'Familia / Categoría',
        descripcion: 'Descripción Detallada',
        costo: 'Costo Unitario',
        stock: 'Existencia Stock',
        acciones: 'Acciones',
        codigoOE: 'Código OEM',
        codigoFabrica: 'Código Fábrica',
        origen: 'País de Origen',
        precioSinFactura: 'Precio de Venta (Sin Factura)',
        precioConFactura: 'Precio de Venta (Con Factura)',
        utilidad: 'Margen de Utilidad'
    };

    const [showStockSearch, setShowStockSearch] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [crossBranchData, setCrossBranchData] = useState<BranchStock[]>([]);


    // Fetch cross-branch stock summary for everyone
    useEffect(() => {
        const fetchCrossBranch = async () => {
            if (!currentBranch?.id) return;
            try {
                const data = await CrossBranchInventoryService.getAllBranchesStock(currentBranch.id);
                setCrossBranchData(data);
            } catch {
                // Non-critical: cross-branch stock is supplementary
            }
        };
        fetchCrossBranch();
    }, [currentBranch?.id]);

    // Cross-branch lookup (Universal availability)
    const crossBranchLookup = useMemo(() => {
        const map = new Map<string, { branchName: string; stock: number }[]>();
        for (const bs of crossBranchData) {
            for (const p of bs.products) {
                if (p.stock > 0 && p.masterId) {
                    const key = p.masterId; // Atomic Link precision
                    if (!map.has(key)) map.set(key, []);
                    map.get(key)!.push({ branchName: bs.branch.name, stock: p.stock });
                }
            }
        }
        return map;
    }, [crossBranchData]);
    const isGerente = role === 'GERENTE';

    const handleStockClick = (e: React.MouseEvent, product: Product) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (popoverProductId === product.id) {
            setPopoverProductId(null);
            setPopoverAnchorRect(null);
        } else {
            setPopoverProductId(product.id || null);
            setPopoverAnchorRect(rect);
        }
    };

    // --- LOGIC: Filtering & Pagination ---
    const normSearch = normalizeText(searchTerm);
    const result = products.filter(p => {
        const product = p as Product;
        const matchesSearch =
            normalizeText(product.nombre).includes(normSearch) ||
            normalizeText(product.codigo).includes(normSearch) ||
            normalizeText(product.codigoFabrica as string || '').includes(normSearch) ||
            normalizeText(product.codigoOE as string || '').includes(normSearch) ||
            normalizeText(product.marca).includes(normSearch) ||
            normalizeText(product.origen as string || '').includes(normSearch) ||
            normalizeText(product.descripcion as string || '').includes(normSearch);
        const matchesCategory = categoryFilter === 'all' || (product.categoria || 'Otros') === categoryFilter;
        
        let matchesStatus = true;
        if (statusFilter === 'dead') {
            matchesStatus = isDeadStock(product.lastSaleAt);
        } else if (statusFilter === 'low') {
            matchesStatus = product.stock > 0 && product.stock <= (product.minStock || 5);
        } else if (statusFilter === 'out') {
            matchesStatus = product.stock === 0;
        }

        return matchesSearch && matchesCategory && matchesStatus;
    });

    const sortedResult = useMemo(() => {
        const temp = [...result];
        if (sortBy === 'date_desc') {
            return temp.sort((a, b) => {
                const dateA = a.createdAt ? ensureDate(a.createdAt).getTime() : 0;
                const dateB = b.createdAt ? ensureDate(b.createdAt).getTime() : 0;
                return dateB - dateA;
            });
        }
        if (sortBy === 'date_asc') {
            return temp.sort((a, b) => {
                const dateA = a.createdAt ? ensureDate(a.createdAt).getTime() : 0;
                const dateB = b.createdAt ? ensureDate(b.createdAt).getTime() : 0;
                return dateA - dateB;
            });
        }
        return temp.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }, [result, sortBy]);

    const filteredProducts = sortedResult;
    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedProducts } = usePagination(filteredProducts);
    // --- END LOGIC ---

    const toggleSelectAll = () => {
        if (selectedIds.size === paginatedProducts.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(paginatedProducts.map(p => p.id!)));
        }
    };

    const toggleSelectOne = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        setShowBulkDeleteModal(true);
    };

    const executeBulkDelete = async () => {
        setBulkDeleting(true);
        try {
            if (onBulkDelete) {
                await onBulkDelete(Array.from(selectedIds));
            } else {
                // Fallback: delete one by one silently
                for (const id of selectedIds) {
                    const product = paginatedProducts.find(p => p.id === id);
                    if (product) {
                        await onDelete(id, product.nombre);
                    }
                }
            }
            setSelectedIds(new Set());
            setShowBulkDeleteModal(false);
        } catch {
            // Handled by parent via onBulkDelete
        } finally {
            setBulkDeleting(false);
        }
    };

    // Bulk delete modal state
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);



    // Column Visibility State
    const [showColumnMenu, setShowColumnMenu] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
        producto: true,
        marca: true,
        categoria: true,
        descripcion: false,
        costo: isGerente,
        stock: true,
        acciones: true,
        codigoOE: false,
        codigoFabrica: false,
        origen: false,
        precioSinFactura: true,
        precioConFactura: true,
        utilidad: false
    });

    // Load preferences on mount
    useEffect(() => {
        const saved = localStorage.getItem('inventory_columns');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Merge saved preferences with default columns to ensure new columns appear
                setTimeout(() => {
                    setVisibleColumns((prev: Record<string, boolean>) => {
                        // Filter parsed to only include keys that exist in the default set (removes legacy keys like 'ubicacion')
                        const filteredParsed: Record<string, boolean> = {};
                        Object.keys(parsed).forEach(key => {
                            if (prev.hasOwnProperty(key)) {
                                filteredParsed[key] = parsed[key];
                            }
                        });

                        const merged = { ...prev, ...filteredParsed };
                        if (!isGerente) {
                            merged.costo = false;
                            merged.utilidad = false;
                        }
                        // Ensure essential columns are always visible
                        merged.acciones = true;
                        merged.producto = true;
                        return merged;
                    });
                }, 0);
            } catch {
            // Fallback: ignore invalid saved column preferences
        }
        }
    }, [isGerente]);

    // Close popover on scroll
    useEffect(() => {
        const handleScroll = () => {
            if (popoverProductId || hoverProductId) {
                setPopoverProductId(null);
                setPopoverAnchorRect(null);
                setHoverProductId(null);
                setHoverAnchorRect(null);
            }
        };
        window.addEventListener('scroll', handleScroll, true);
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, [popoverProductId, hoverProductId]);

    const toggleColumn = (key: string) => {
        setVisibleColumns(prev => {
            const newState = { ...prev, [key]: !prev[key] };
            localStorage.setItem('inventory_columns', JSON.stringify(newState));
            return newState;
        });
    };

    const visibleColumnCount = 1 + // Checkbox
        (visibleColumns.producto ? 1 : 0) +
        (visibleColumns.categoria ? 1 : 0) +
        (visibleColumns.descripcion ? 1 : 0) +
        (visibleColumns.costo && isGerente ? 1 : 0) +
        (visibleColumns.precioSinFactura ? 1 : 0) +
        (visibleColumns.precioConFactura ? 1 : 0) +
        (visibleColumns.utilidad && isGerente ? 1 : 0) +
        (visibleColumns.stock ? 1 : 0) +
        (visibleColumns.acciones ? 1 : 0);



    if (loading) return <div className="p-8 text-center text-slate-500 dark:text-slate-400">Cargando inventario...</div>;

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl transition-all duration-300">
            {/* Table Header Overlay - Suite Pro Standard */}
            <div className="shrink-0 px-4 sm:px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0"></div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 wrap-break-word">
                        {categoryFilter === 'all' ? 'Todos los Activos' : `Filtrando: ${categoryFilter}`}
                    </span>
                </div>

                <div className="flex flex-col min-[400px]:flex-row gap-2 sm:gap-3 w-full sm:w-auto min-w-0">
                    <button
                        onClick={() => setShowStockSearch(true)}
                        className="flex items-center justify-center gap-2.5 px-4 py-2.5 sm:py-2 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black text-[9px] font-black uppercase tracking-widest rounded-xl border border-transparent shadow-lg shadow-black/10 hover:opacity-90 transition-all active:scale-95 whitespace-nowrap w-full min-[400px]:w-auto min-[400px]:flex-1 sm:flex-none sm:w-auto"
                    >
                        <Search size={12} strokeWidth={2.5} />
                        Buscar Stock
                    </button>

                    <div className="relative w-full min-[400px]:flex-1 sm:w-auto sm:flex-none min-w-0">
                        <button
                            onClick={() => setShowColumnMenu(!showColumnMenu)}
                            className="flex items-center justify-center gap-2.5 px-4 py-2.5 sm:py-2 w-full bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 text-[9px] font-black uppercase tracking-widest rounded-xl border border-slate-100 dark:border-white/10 shadow-sm hover:border-blue-500/30 transition-all active:scale-95 whitespace-nowrap"
                        >
                            <Columns size={12} strokeWidth={2.5} />
                            Configurar Vista
                        </button>

                        {showColumnMenu && (
                            <>
                                <div className="fixed inset-0 z-100" onClick={() => setShowColumnMenu(false)} />
                                <div className="absolute left-0 right-0 sm:left-auto sm:right-0 top-full mt-3 w-full sm:w-64 max-h-[min(70vh,24rem)] overflow-x-hidden overflow-y-auto custom-scrollbar bg-white/95 dark:bg-background/95 backdrop-blur-xl rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-200/60 dark:border-white/10 p-4 z-101 animate-in fade-in slide-in-from-top-4 duration-300">
                                    <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 px-3 py-2 uppercase tracking-[0.2em] mb-2 border-b border-slate-100 dark:border-white/10">Preferencias de Columnas</div>
                                    <div className="space-y-1 pr-1">
                                        {Object.keys(visibleColumns).filter(k => k !== 'costo' || isGerente).map(key => (
                                            <label key={key} className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl cursor-pointer transition-colors group">
                                                <div className="relative flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={visibleColumns[key]}
                                                        onChange={() => toggleColumn(key)}
                                                        className="peer absolute opacity-0 w-5 h-5 cursor-pointer"
                                                    />
                                                    <div className="w-5 h-5 border-2 border-slate-200 dark:border-white/10 rounded-xl peer-checked:bg-blue-500 dark:peer-checked:bg-[#FFD700] peer-checked:border-transparent transition-all"></div>
                                                    <svg className="w-3 h-3 text-white absolute left-1 peer-checked:block hidden pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                                        <path d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-tight text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
                                                {columnLabels[key] || key}
                                            </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Bulk Actions Bar */}
            {selectedIds.size > 0 && (
                <div className="shrink-0 p-4 border-b border-rose-100 dark:border-rose-900/30 bg-rose-50/50 dark:bg-rose-900/10 flex flex-col sm:flex-row gap-4 items-center justify-between animate-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-500">
                            <Layers size={18} />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-400">
                            Procesamiento por lote: <span className="bg-rose-500 text-white px-2 py-0.5 rounded-xl ml-1 font-mono">{selectedIds.size}</span> activos
                        </span>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="flex-1 sm:flex-none px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
                        >
                            Ignorar Selección
                        </button>
                        <button
                            onClick={() => {
                                if (selectedIds.size === 0) return;
                                router.push('/pedidos/nuevo');
                            }}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-3 px-8 py-3.5 bg-yellow-500 hover:bg-yellow-600 text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-yellow-500/20 transition-all active:scale-95"
                        >
                            <ArrowRightLeft size={16} />
                            Crear pedido
                        </button>
                        <button
                            onClick={handleBulkDelete}
                            disabled={!canDelete}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-3 px-8 py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-rose-600/20 transition-all active:scale-95 disabled:opacity-50"
                        >
                            <Trash2 size={16} />
                            Eliminar Permanentemente
                        </button>
                    </div>
                </div>
            )}

            {/* Top Pagination Bar - redundant for high-density navigation */}
            <TableFooter
                totalItems={filteredProducts.length}
                itemsPerPage={itemsPerPage}
                onChangeItemsPerPage={setItemsPerPage}
                currentPage={currentPage}
                onChangePage={setCurrentPage}
                totalPages={totalPages}
                label="Activos"
                className="border-b border-t-0 bg-white/50 dark:bg-black/10"
            />

            {/* Table / Content Area - Suite Pro Standard (Ventas Parity) */}
            <div className="flex-1 overflow-x-auto overflow-y-auto bg-white dark:bg-transparent custom-scrollbar relative min-w-0">
                {/* Mobile View: High Density Rows (Ventas Style) */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-white/5">
                    {filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <Package size={48} strokeWidth={1} className="opacity-20 mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-[0.2em]">No se encontraron activos</p>
                        </div>
                    ) : (
                        paginatedProducts.map((product) => {
                            const isSelected = selectedIds.has(product.id!);
                            return (
                                <div 
                                    key={product.id} 
                                    onClick={() => setSelectedProduct(product)}
                                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, product }); }}
                                    className={clsx(
                                        "p-5 active:bg-slate-50 dark:active:bg-white/5 transition-colors cursor-pointer relative overflow-hidden group",
                                        isSelected && "bg-blue-500/5 dark:bg-blue-500/10"
                                    )}
                                >
                                    <div className="flex gap-4">
                                        {/* Small Image Overlay / Indicator */}
                                        <div className="shrink-0 relative">
                                            <div 
                                                onClick={(e) => {
                                                    if (product.imagenUrl) {
                                                        e.stopPropagation();
                                                        setPreviewImage(product.imagenUrl);
                                                    }
                                                }}
                                                className={clsx(
                                                    "w-16 h-16 rounded-2xl overflow-hidden bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 shadow-inner flex items-center justify-center",
                                                    product.imagenUrl ? "cursor-zoom-in" : "cursor-default"
                                                )}
                                            >
                                                {product.imagenUrl ? (
                                                    <Image src={product.imagenUrl} alt="" fill className="object-contain" />
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-slate-300 dark:text-slate-600">
                                                        <Package size={20} strokeWidth={1.5} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className={clsx(
                                                "absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-white/10 shadow-sm",
                                                product.stock > product.minStock ? "bg-emerald-500" : "bg-rose-500"
                                            )} />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start gap-2 mb-1 min-w-0">
                                                <h3 
                                                    className="text-[11px] font-bold text-slate-900 dark:text-white uppercase leading-tight min-w-0 flex-1 wrap-break-word"
                                                    onMouseEnter={(e) => {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setHoverProductId(product.id!);
                                                        setHoverAnchorRect(rect);
                                                    }}
                                                    onMouseLeave={() => {
                                                        setHoverProductId(null);
                                                        setHoverAnchorRect(null);
                                                    }}
                                                >
                                                    {product.nombre}
                                                </h3>
                                                <span className="text-[10px] font-black text-slate-900 dark:text-white tabular-nums tracking-tighter shrink-0 text-right">
                                                    Bs. {(product.precioConFactura ?? product.precioVenta ?? product.precio ?? 0).toFixed(2)}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                                    {product.codigo}
                                                </span>
                                                {!!product.codigoFabrica && (
                                                    <span className="text-[9px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-widest wrap-break-word">
                                                        {String(product.codigoFabrica)}
                                                    </span>
                                                )}
                                            </div>

                                            {visibleColumns.descripcion && !!product.descripcion && (
                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 mb-2 line-clamp-2 bg-slate-50/50 dark:bg-white/5 p-2 rounded-xl border border-slate-100 dark:border-white/5">
                                                    {product.descripcion}
                                                </p>
                                            )}

                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 tabular-nums">
                                                        Stock: {product.stock}
                                                    </span>
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest opacity-60">
                                                        Min: {product.minStock}
                                                    </span>
                                                    {(() => {
                                                        const inTr = product.masterId ? (inTransitByMaster[product.masterId] || 0) : 0;
                                                        if (inTr <= 0) return null;
                                                        return (
                                                            <span
                                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-black"
                                                                title={`${inTr} unidades en tránsito`}
                                                            >
                                                                <Truck size={9} />
                                                                {inTr}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setLabelProduct(product); }}
                                                        className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-emerald-500 transition-all active:scale-90 rounded-xl"
                                                    >
                                                        <QrCode size={16} />
                                                    </button>
                                                    
                                                    <button
                                                     onClick={() => {
                                                         router.push('/pedidos/nuevo');
                                                     }}
                                                     className="w-9 h-9 flex items-center justify-center bg-indigo-500/10 dark:bg-indigo-500/20 hover:bg-indigo-500 hover:text-white text-indigo-600 dark:text-indigo-400 rounded-xl transition-all active:scale-95 border border-indigo-500/20 shadow-lg shadow-indigo-500/5 group/btn"
                                                     title="Crear pedido"
                                                 >
                                                     <Send size={15} className="group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                                                 </button>

                                                 {isGerente && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onAdjustStock(product); }}
                                                            className="w-9 h-9 flex items-center justify-center bg-yellow-500/10 dark:bg-[#FFD700]/20 text-yellow-600 dark:text-[#FFD700] rounded-xl transition-all active:scale-90 border border-yellow-500/20"
                                                        >
                                                            <Activity size={16} />
                                                        </button>
                                                    )}
                                                    {canEdit && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onEdit(product); }}
                                                            className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-blue-500 transition-all active:scale-90 rounded-xl"
                                                        >
                                                            <Edit size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Desktop View: High Density Table (Ventas Parity) */}
                <table className="hidden md:table w-full text-sm text-left border-separate border-spacing-0">
                    <thead className="sticky top-0 z-30 bg-slate-50/90 dark:bg-black/40 backdrop-blur-xl border-b border-slate-200 dark:border-white/10">
                        <tr className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                            <th className="px-6 py-4 w-12 text-center">
                                <input
                                    type="checkbox"
                                    checked={paginatedProducts.length > 0 && selectedIds.size === paginatedProducts.length}
                                    onChange={toggleSelectAll}
                                    className="w-4 h-4 rounded border-2 border-slate-300 dark:border-white/10 bg-transparent text-blue-500 transition-all cursor-pointer"
                                />
                            </th>
                            {visibleColumns.producto && <th className="px-6 py-4">{columnLabels.producto}</th>}
                            {visibleColumns.categoria && <th className="px-6 py-4 text-center">{columnLabels.categoria}</th>}
                            {visibleColumns.descripcion && <th className="px-6 py-4">{columnLabels.descripcion}</th>}
                            {visibleColumns.costo && isGerente && <th className="px-6 py-4 text-right">{columnLabels.costo}</th>}
                            {visibleColumns.precioSinFactura && <th className="px-6 py-4 text-right">{columnLabels.precioSinFactura}</th>}
                            {visibleColumns.precioConFactura && <th className="px-6 py-4 text-right">{columnLabels.precioConFactura}</th>}
                            {visibleColumns.utilidad && isGerente && <th className="px-6 py-4 text-right">{columnLabels.utilidad}</th>}
                            {visibleColumns.stock && <th className="px-6 py-4 text-center">{columnLabels.stock}</th>}
                            {visibleColumns.acciones && <th className="px-6 py-4 text-right pr-8 whitespace-nowrap min-w-50">{columnLabels.acciones}</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {filteredProducts.length === 0 ? (
                            <tr>
                                <td colSpan={visibleColumnCount} className="py-32 text-center">
                                    <div className="flex flex-col items-center gap-4">
                                        <Package size={64} strokeWidth={0.5} className="opacity-20 translate-y-4 text-slate-400" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.4em]">Data Vault Empty</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            paginatedProducts.map((product) => {
                                const stockStatus = getStockStatus(product.stock, product.minStock);
                                const isSelected = selectedIds.has(product.id!);
                                
                                return (
                                    <tr
                                        key={product.id}
                                        className={clsx(
                                            "group transition-all duration-200 hover:bg-slate-50/50 dark:hover:bg-white/2 cursor-pointer",
                                            isSelected && "bg-blue-500/5 dark:bg-blue-500/10"
                                        )}
                                        onClick={() => setSelectedProduct(product)}
                                        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, product }); }}
                                    >
                                        <td className="px-6 py-4 w-12 text-center" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelectOne(product.id!)}
                                                className="w-4 h-4 rounded border border-slate-200 dark:border-white/10 bg-transparent text-blue-500 cursor-pointer"
                                            />
                                        </td>
                                        
                                         {visibleColumns.producto && (
                                            <td className="px-6 py-5">
                                                <div className="flex items-start gap-5 group/item">
                                                    {/* Precision Image Frame v4.0 */}
                                                    <div className="relative shrink-0">
                                                        <div 
                                                            onClick={(e) => {
                                                                if (product.imagenUrl) {
                                                                    e.stopPropagation();
                                                                    setPreviewImage(product.imagenUrl);
                                                                }
                                                            }}
                                                            className={clsx(
                                                                "w-16 h-16 rounded-2xl overflow-hidden bg-white dark:bg-black/40 border-2 border-slate-100 dark:border-white/10 shadow-xl transition-all duration-500 flex items-center justify-center",
                                                                product.imagenUrl ? "cursor-zoom-in group-hover/item:border-blue-500/30" : "cursor-default"
                                                            )}
                                                        >
                                                            {product.imagenUrl ? (
                                                                <Image 
                                                                    src={product.imagenUrl} 
                                                                    alt="" 
                                                                    width={64} 
                                                                    height={64} 
                                                                    className="object-contain h-full w-full group-hover/item:scale-110 transition-transform duration-700" 
                                                                />
                                                            ) : (
                                                                <div className="flex items-center justify-center h-full text-slate-200 dark:text-slate-800">
                                                                    <Package size={24} strokeWidth={1} />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className={clsx(
                                                            "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-4 border-white dark:border-white/10 shadow-lg",
                                                            product.stock > (product.minStock || 5) ? "bg-emerald-500" : product.stock > 0 ? "bg-amber-500" : "bg-rose-500"
                                                        )} />
                                                    </div>

                                                    <div className="flex flex-col min-w-0 pt-0.5">
                                                        {/* Master Entity Row */}
                                                        <div className="flex items-center gap-3 mb-1.5">
                                                            <h3 
                                                                className="text-sm font-black text-slate-900 dark:text-white uppercase leading-none tracking-tight cursor-help hover:text-blue-500 transition-colors"
                                                                onMouseEnter={(e) => {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setHoverProductId(product.id!);
                                                                    setHoverAnchorRect(rect);
                                                                }}
                                                                onMouseLeave={() => {
                                                                    setHoverProductId(null);
                                                                    setHoverAnchorRect(null);
                                                                }}
                                                            >
                                                                {product.nombre}
                                                            </h3>
                                                            
                                                            <div className="flex items-center shrink-0">
                                                                {product.isHQVirtual ? (
                                                                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 text-[8px] font-black uppercase tracking-[0.2em] rounded border border-slate-200 dark:border-white/10">Catálogo Central</span>
                                                                ) : (
                                                                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-[0.2em] rounded border border-emerald-500/20">
                                                                        {(isConsolidatedView && product.branchName) ? product.branchName : 'Físico Local'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Technical ID Label */}
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em]">ID: {product.codigo}</span>
                                                            {!!product.lastSaleAt && (
                                                                (() => {
                                                                    const date = ensureDate(product.lastSaleAt);
                                                                    const diff = (new Date().getTime() - date.getTime()) / (1000 * 3600 * 24);
                                                                    if (diff > 90) {
                                                                        return <span className="px-2 py-0.5 bg-purple-500/10 text-purple-500 text-[8px] font-black uppercase tracking-widest rounded border border-purple-500/20">Stock Muerto</span>;
                                                                    }
                                                                    return null;
                                                                })()
                                                            )}
                                                        </div>

                                                        {/* Industrial Metadata Grid v4.0 */}
                                                        <div className="flex items-start gap-3 mt-1">
                                                            {(visibleColumns.marca || visibleColumns.origen) && (
                                                                <div className="flex flex-col gap-1">
                                                                    {visibleColumns.marca && (
                                                                        <div className="px-2 py-0.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded flex items-center gap-1.5 shadow-sm min-w-25">
                                                                            <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest opacity-60 w-8">Marca</span>
                                                                            <span className="text-[9px] font-bold text-slate-700 dark:text-slate-300 uppercase wrap-break-word">{product.marca || 'GEN'}</span>
                                                                        </div>
                                                                    )}
                                                                    {visibleColumns.origen && (
                                                                        <div className="px-2 py-0.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded flex items-center gap-1.5 shadow-sm min-w-25">
                                                                            <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest opacity-60 w-8">Origen</span>
                                                                            <span className="text-[9px] font-bold text-slate-700 dark:text-slate-300 uppercase wrap-break-word">{(product.origen) || 'N/D'}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {(visibleColumns.codigoFabrica || visibleColumns.codigoOE) && (
                                                                <div className="flex flex-col gap-1">
                                                                    {visibleColumns.codigoFabrica && !!product.codigoFabrica && (
                                                                        <div className="px-2 py-0.5 bg-blue-500/5 border border-blue-500/10 rounded flex items-center gap-1.5 shadow-sm min-w-30">
                                                                            <span className="text-[7px] font-black text-blue-500 uppercase tracking-widest opacity-60 w-6">Fab</span>
                                                                            <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase font-mono tracking-tighter">{String(product.codigoFabrica)}</span>
                                                                        </div>
                                                                    )}
                                                                    {visibleColumns.codigoOE && !!product.codigoOE && (
                                                                        <div className="px-2 py-0.5 bg-amber-500/5 border border-amber-500/10 rounded flex items-center gap-1.5 shadow-sm min-w-30">
                                                                            <span className="text-[7px] font-black text-amber-500 uppercase tracking-widest opacity-60 w-6">OEM</span>
                                                                            <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase font-mono tracking-tighter">{String(product.codigoOE)}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        )}


                                        {visibleColumns.categoria && (
                                            <td className="px-6 py-4 text-center">
                                                <span className={clsx(
                                                    "inline-block max-w-32 px-2 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest border border-transparent shadow-sm whitespace-nowrap overflow-hidden text-ellipsis",
                                                    getCategoryColor(product.categoria)
                                                )} title={product.categoria}>
                                                    {product.categoria}
                                                </span>
                                            </td>
                                        )}

                                        {visibleColumns.descripcion && (
                                            <td className="px-6 py-4 min-w-50 max-w-xs">
                                                <div className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2" title={product.descripcion}>
                                                    {product.descripcion || '---'}
                                                </div>
                                            </td>
                                        )}

                                        {visibleColumns.costo && isGerente && (
                                            <td className="px-6 py-4 text-right">
                                                <span className="font-bold text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">Bs. {product.costo?.toFixed(2)}</span>
                                            </td>
                                        )}

                                        {visibleColumns.precioSinFactura && (
                                            <td className="px-6 py-4 text-right">
                                                <span className="font-black text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                                                    {(product.precioSinFactura ?? product.precioVenta ?? product.precio ?? 0).toFixed(2)}
                                                </span>
                                            </td>
                                        )}

                                        {visibleColumns.precioConFactura && (
                                            <td className="px-6 py-4 text-right">
                                                <span className="font-black text-[12px] text-slate-900 dark:text-white tabular-nums tracking-tighter">
                                                    {(product.precioConFactura ?? product.precioVenta ?? product.precio ?? 0).toFixed(2)}
                                                </span>
                                            </td>
                                        )}


                                        {visibleColumns.utilidad && isGerente && (
                                            <td className="px-6 py-4 text-right">
                                                {(() => {
                                                    const cost = product.costo || 0;
                                                    const sf = (product.precioSinFactura && product.precioSinFactura > 0) ? product.precioSinFactura : 0;
                                                    const cf = (product.precioConFactura && product.precioConFactura > 0) ? product.precioConFactura : 0;
                                                    if (cost <= 0 || (sf <= 0 && cf <= 0)) return <span className="text-[10px] font-bold text-slate-400">---</span>;
                                                    const marginSF = sf > 0 ? ((sf - cost) / sf) * 100 : null;
                                                    const marginCF = cf > 0 ? ((cf - cost) / cf) * 100 : null;
                                                    const colorClass = (m: number) => m < 20 ? 'text-rose-500' : m < 30 ? 'text-amber-500' : 'text-emerald-500';
                                                    return (
                                                        <div className="flex flex-col items-end gap-0.5">
                                                            {marginSF !== null && (
                                                                <div className="flex items-center gap-1">
                                                                    <span className={clsx("text-[10px] font-black tabular-nums", colorClass(marginSF))}>{marginSF.toFixed(1)}%</span>
                                                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">S/F</span>
                                                                </div>
                                                            )}
                                                            {marginCF !== null && (
                                                                <div className="flex items-center gap-1">
                                                                    <span className={clsx("text-[10px] font-black tabular-nums", colorClass(marginCF))}>{marginCF.toFixed(1)}%</span>
                                                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">C/F</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                        )}

                                        {visibleColumns.stock && (
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-center">
                                                    {(() => {
                                                        const otherStocks = product.masterId ? crossBranchLookup.get(product.masterId) : null;
                                                        const totalOther = otherStocks?.reduce((a: number, s: { stock: number }) => a + (s.stock || 0), 0) || 0;
                                                        
                                                        return (
                                                            <div className={clsx(
                                                                "flex items-stretch overflow-hidden rounded-xl border transition-all duration-300 shadow-lg shadow-black/5 active:scale-95 group/dual",
                                                                product.stock === 0 ? "border-rose-200/50 bg-rose-50/20" : "border-slate-100 dark:border-white/10 bg-white dark:bg-background"
                                                            )}>
                                                                {/* Lado Izquierdo: Stock Local */}
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); handleStockClick(e, product); }}
                                                                    className={clsx(
                                                                        "min-w-10 h-8 px-3 flex items-center justify-center text-[11px] font-black tabular-nums transition-colors",
                                                                        stockStatus.color.replace('border-rose-200/60', '').replace('border-amber-200/60', '').replace('border-emerald-200/60', '')
                                                                    )}
                                                                >
                                                                    {product.stock}
                                                                </button>

                                                                {/* Lado Derecho: Stock en otras sucursales */}
                                                                {totalOther > 0 && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleStockClick(e, product); }}
                                                                        className="min-w-12 px-2.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1 border-l border-slate-200 dark:border-white/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                                                                        title={otherStocks?.map((s: { branchName: string; stock: number }) => `${s.branchName}: ${s.stock}`).join(', ')}
                                                                    >
                                                                        <span className="text-[10px] font-black">+{totalOther}</span>
                                                                        <Activity size={9} className="text-blue-500 dark:text-blue-400" />
                                                                    </button>
                                                                )}

                                                                {/* En tránsito hacia esta sucursal */}
                                                                {(() => {
                                                                    const inTr = product.masterId ? (inTransitByMaster[product.masterId] || 0) : 0;
                                                                    if (inTr <= 0) return null;
                                                                    return (
                                                                        <div
                                                                            className="min-w-12 px-2.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1 border-l border-slate-200 dark:border-white/10"
                                                                            title={`${inTr} unidades en tránsito hacia esta sucursal`}
                                                                        >
                                                                            <Truck size={9} className="text-amber-500" />
                                                                            <span className="text-[10px] font-black">{inTr}</span>
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </td>
                                        )}


                                        <td className="px-6 py-4 text-right pr-8 whitespace-nowrap min-w-50" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => setLabelProduct(product)}
                                                    className="w-9 h-9 flex items-center justify-center bg-slate-50 dark:bg-white/3 hover:bg-emerald-500 hover:text-white text-slate-400 dark:text-slate-500 rounded-xl transition-all active:scale-95 border border-slate-100 dark:border-white/10"
                                                    title="Etiqueta QR"
                                                >
                                                    <QrCode size={15} />
                                                </button>

                                                <button
                                                    onClick={() => router.push(`/kardex/${product.id}`)}
                                                    className="w-9 h-9 flex items-center justify-center bg-slate-50 dark:bg-white/3 hover:bg-indigo-500 hover:text-white text-slate-400 dark:text-slate-500 rounded-xl transition-all active:scale-95 border border-slate-100 dark:border-white/10"
                                                    title="Historial Kardex"
                                                >
                                                    <HistoryIcon size={15} />
                                                </button>

                                                {isGerente && (
                                                    <button
                                                        onClick={() => onAdjustStock(product)}
                                                        className="w-9 h-9 flex items-center justify-center bg-yellow-500/10 dark:bg-[#FFD700]/20 hover:bg-yellow-500 hover:text-slate-950 text-yellow-600 dark:text-[#FFD700] rounded-xl transition-all active:scale-95 border border-yellow-500/20 shadow-lg shadow-yellow-500/5 group/btn"
                                                        title="Ajuste Logístico"
                                                    >
                                                        <Activity size={15} className="group-hover/btn:animate-pulse" />
                                                    </button>
                                                )}
                                                {canEdit && (
                                                    <button
                                                        onClick={() => onEdit(product)}
                                                        className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-white/3 hover:bg-blue-600 hover:text-white text-slate-400 dark:text-slate-500 rounded-xl transition-all active:scale-95 border border-slate-100 dark:border-white/10"
                                                        title="Configurar Activo"
                                                    >
                                                        <Edit size={15} />
                                                    </button>
                                                )}

                                                {canDelete && (
                                                    <button
                                                        onClick={() => onDelete(product.id!, product.nombre)}
                                                        className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-white/3 hover:bg-rose-500 hover:text-white text-slate-400 dark:text-slate-500 rounded-xl transition-all active:scale-95 border border-slate-100 dark:border-white/10"
                                                        title="Baja del Sistema"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                
                                        {popoverProductId === product.id && (
                                            <StockDetailPopover 
                                                product={product} 
                                                anchorRect={popoverAnchorRect}
                                                onClose={() => {
                                                    setPopoverProductId(null);
                                                    setPopoverAnchorRect(null);
                                                }}
                                                onTransfer={() => {
                                                    router.push('/pedidos/nuevo');
                                                    setPopoverProductId(null);
                                                    setPopoverAnchorRect(null);
                                                }}
                                            />
                                        )}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination & Audit Footer - Standard v4.0 (Ventas Parity) */}
            <TableFooter
                totalItems={filteredProducts.length}
                itemsPerPage={itemsPerPage}
                onChangeItemsPerPage={setItemsPerPage}
                currentPage={currentPage}
                onChangePage={setCurrentPage}
                totalPages={totalPages}
                label="Activos"
            />

            {/* Drawer/Modal Detail */}
            {selectedProduct && (
                <ProductDetailModal
                    isOpen={!!selectedProduct}
                    product={selectedProduct}
                    onClose={() => setSelectedProduct(null)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            )}

            {/* Hover Tooltip - Suite Pro v4.0 */}
            {hoverProductId && hoverAnchorRect && (
                (() => {
                    const product = products.find(p => p.id === hoverProductId);
                    if (!product) return null;
                    return <DescriptionTooltip product={product} anchorRect={hoverAnchorRect} />;
                })()
            )}

            {/* Popovers & Modals */}
            {labelProduct && (
                <ProductLabel
                    product={labelProduct}
                    onClose={() => setLabelProduct(null)}
                />
            )}

            <ProductContextMenu
                position={contextMenu}
                onClose={() => setContextMenu(null)}
                actions={[
                    { label: 'Ver detalles', icon: Eye, onClick: (p) => setSelectedProduct(p) },
                    ...(canEdit ? [{ label: 'Editar producto', icon: Edit, onClick: (p: Product) => onEdit(p) }] : []),
                    { label: 'Imprimir etiqueta', icon: Tag, onClick: (p: Product) => setLabelProduct(p) },
                    { label: 'Ver kardex', icon: HistoryIcon, onClick: (p: Product) => router.push(`/kardex/${p.id}`) },
                    ...(canDelete ? [{ label: 'Eliminar', icon: Trash2, onClick: (p: Product) => onDelete(p.id!, p.nombre), color: 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10', divider: true }] : []),
                ]}
            />

            {/* Bulk Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={showBulkDeleteModal}
                onClose={() => setShowBulkDeleteModal(false)}
                onConfirm={executeBulkDelete}
                title="Eliminar Productos"
                message={`¿Estás seguro de eliminar ${selectedIds.size} producto(s) seleccionado(s)? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="danger"
                isLoading={bulkDeleting}
            />

            {showStockSearch && (
                <GlobalStockSearchModal
                    isOpen={showStockSearch}
                    onClose={() => setShowStockSearch(false)}
                    localProducts={products}
                />
            )}

            {/* Image Preview Modal v4.0 */}
            {previewImage && createPortal(
                <div 
                    className="fixed inset-0 z-1000 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-300 cursor-pointer"
                    onClick={() => setPreviewImage(null)}
                >
                    <button 
                        className="absolute top-6 right-6 z-10 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all active:scale-95"
                        onClick={(e) => { e.stopPropagation(); setPreviewImage(null); }}
                    >
                        <X size={24} />
                    </button>
                    <div className="relative max-w-[90vw] max-h-[90vh] w-full h-full">
                        <Image 
                            src={previewImage} 
                            alt="Full View" 
                            fill
                            className="object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-500 cursor-default"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
