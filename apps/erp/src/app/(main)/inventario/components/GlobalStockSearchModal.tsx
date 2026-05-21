'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Package, Loader2, Globe, Building2, X, Send } from 'lucide-react';
import { Product } from '@/types';
import IndustrialModal from '@/components/common/IndustrialModal';
import { CrossBranchInventoryService, CrossBranchProduct } from '@/services/CrossBranchInventoryService';
import { useBranch } from '@/contexts/BranchContext';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import Image from 'next/image';

interface GlobalStockSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    localProducts?: Product[]; // For 'Sede Local' badge detection
}

export default function GlobalStockSearchModal({ isOpen, onClose, localProducts = [] }: GlobalStockSearchModalProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<CrossBranchProduct[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<CrossBranchProduct | null>(null);
    const [branchStocks, setBranchStocks] = useState<{ branchName: string; stock: number; costo: number; branchId: string; productId: string; isHQ?: boolean }[]>([]);
    const [loadingStocks, setLoadingStocks] = useState(false);
    const { currentBranch } = useBranch();
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input on open
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        } else {
            setSearchTerm('');
            setResults([]);
            setSelectedProduct(null);
            setBranchStocks([]);
        }
    }, [isOpen]);

    // Live search
    useEffect(() => {
        if (searchTerm.length < 2) {
            setResults([]);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setLoading(true);
            try {
                // We use search across branches but we need a truly global search (current + others)
                // searchAcrossBranches only searches "others".
                // We'll use the service but first we'll do a simple local-like search if needed,
                // or just accept that "global" means "everywhere".
                const searchResults = await CrossBranchInventoryService.searchAcrossBranches(searchTerm);
                
                // Deduplicate by masterId
                const uniqueProducts: CrossBranchProduct[] = [];
                const seenMasters = new Set();
                
                searchResults.forEach(res => {
                    if (!seenMasters.has(res.product.masterId)) {
                        seenMasters.add(res.product.masterId);
                        uniqueProducts.push(res.product);
                    }
                });
                
                setResults(uniqueProducts);
            } catch {
                // Silent: search failure shows empty results
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm, currentBranch?.id]);

    const handleSelectProduct = async (product: CrossBranchProduct) => {
        setSelectedProduct(product);
        setLoadingStocks(true);
        try {
            // Precision lookup by masterId (Atomic Link)
            const stocks = await CrossBranchInventoryService.getProductStockAcrossBranches(product.masterId);
            // Sort to have the current branch first, then Central, then others
            const sorted = stocks.sort((a, b) => {
                if (a.branchId === currentBranch?.id) return -1;
                if (b.branchId === currentBranch?.id) return 1;
                if (a.isHQ) return -1;
                if (b.isHQ) return 1;
                return a.branchName.localeCompare(b.branchName);
            });
            setBranchStocks(sorted);
        } catch {
            // Non-critical: branch stock lookup
        } finally {
            setLoadingStocks(false);
        }
    };

    if (!isOpen) return null;

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title="Buscar Stock Global"
            subtitle="Red Renotech"
            icon={<Globe size={22} strokeWidth={2.5} />}
            iconBg="bg-yellow-500"
            iconColor="text-slate-950"
            maxWidth="max-w-2xl"
        >
            <div className="flex flex-col space-y-6 pt-4">
                {/* Search Field */}
                <div className="relative group">
                    <div className="absolute inset-y-0 left-5 flex items-center text-slate-400 group-focus-within:text-yellow-500 transition-colors">
                        <Search size={20} strokeWidth={2.5} />
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Escriba código, nombre o marca..."
                        className="w-full pl-14 pr-6 py-4 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500/50 transition-all shadow-inner"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {loading && (
                        <div className="absolute inset-y-0 right-5 flex items-center">
                            <Loader2 size={18} className="animate-spin text-yellow-500" />
                        </div>
                    )}
                </div>

                <div className="overflow-hidden flex flex-col min-h-100">
                    {!selectedProduct ? (
                        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2 h-112.5">
                            {searchTerm.length < 2 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-300 dark:text-slate-700 select-none">
                                    <Package size={64} strokeWidth={0.5} className="mb-4 opacity-20" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em]">Busqueda Centralizada</p>
                                </div>
                            ) : results.length === 0 && !loading ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-300 dark:text-slate-700 px-10 text-center">
                                    <Search size={48} strokeWidth={1} className="mb-4 opacity-20" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">No se encontraron activos</p>
                                </div>
                            ) : (
                                results.map((product) => (
                                    <button
                                        key={product.id}
                                        onClick={() => handleSelectProduct(product)}
                                        className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 hover:border-yellow-500/50 hover:bg-slate-50 dark:hover:bg-white/8 transition-all group shadow-sm hover:shadow-md"
                                    >
                                        <div className="shrink-0 w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/5 overflow-hidden border border-slate-200 dark:border-white/10 relative">
                                            {product.imagenUrl ? (
                                                <Image src={product.imagenUrl} alt="" fill className="object-cover" />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-slate-300 dark:text-slate-600">
                                                    <Package size={20} strokeWidth={1.5} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 text-left min-w-0">
                                            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase leading-tight group-hover:text-yellow-500 transition-colors wrap-break-word">
                                                {product.nombre}
                                            </h4>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{product.codigo}</span>
                                                {localProducts.some(lp => lp.masterId === product.masterId) && (
                                                    <span className="text-[8px] font-black bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded uppercase shrink-0 animate-pulse">Sede Local</span>
                                                )}
                                                {product.marca && (
                                                    <>
                                                        <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-white/5" />
                                                        <span className="text-[9px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-widest">{product.marca}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/5 group-hover:bg-yellow-500 transition-colors">
                                            <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 group-hover:text-black uppercase">Click</span>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col min-h-0 space-y-6 animate-in slide-in-from-right-4 duration-300 h-112.5">
                            {/* Selected Info */}
                            <div className="p-6 rounded-3xl bg-slate-900 text-white shadow-xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full -translate-y-16 translate-x-16 blur-3xl group-hover:bg-yellow-500/20 transition-all duration-700" />
                                <div className="relative flex items-center justify-between">
                                    <div className="min-w-0">
                                        <span className="text-[9px] font-black text-yellow-500 uppercase tracking-[0.2em] mb-1 block">Producto Seleccionado</span>
                                        <h3 className="text-sm font-black uppercase wrap-break-word">{selectedProduct.nombre}</h3>
                                        <p className="text-[10px] font-bold text-slate-400 mt-1">{selectedProduct.codigo} • {selectedProduct.marca || 'GENÉRICO'}</p>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedProduct(null)}
                                        className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all text-white/60 hover:text-white"
                                    >
                                        <X size={18} strokeWidth={2.5} />
                                    </button>
                                </div>
                            </div>

                            {/* Stock Breakdown */}
                            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] px-2 mb-2">Desglose por Sucursal</h4>
                                {loadingStocks ? (
                                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                                        <Loader2 size={32} className="animate-spin text-yellow-500 opacity-50" />
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Consultando Activos...</p>
                                    </div>
                                ) : branchStocks.length === 0 ? (
                                    <div className="py-20 text-center text-slate-400">
                                        <Package size={48} strokeWidth={1} className="mx-auto mb-4 opacity-10" />
                                        <p className="text-[10px] font-black uppercase tracking-widest">Sin stock en sucursales activas</p>
                                    </div>
                                ) : (
                                    branchStocks.map((s) => (
                                        <div 
                                            key={s.branchId} 
                                            className={clsx(
                                                "flex items-center justify-between p-5 rounded-3xl border transition-all",
                                                s.branchId === currentBranch?.id 
                                                    ? "bg-yellow-500/5 border-yellow-500/20 dark:bg-[#FFD700]/10 dark:border-[#FFD700]/20" 
                                                    : "bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10"
                                            )}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={clsx(
                                                    "w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm",
                                                    s.isHQ ? "bg-slate-900 text-white dark:bg-blue-600" : "bg-white dark:bg-white/5 text-slate-400 dark:text-slate-500"
                                                )}>
                                                    {s.isHQ ? <Globe size={20} /> : <Building2 size={20} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight wrap-break-word">
                                                            {s.branchName}
                                                        </span>
                                                        {s.branchId === currentBranch?.id && (
                                                            <span className="text-[8px] font-black bg-yellow-500 text-black px-1.5 py-0.5 rounded uppercase shrink-0 shadow-sm">LOCAL</span>
                                                        )}
                                                    </div>
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 block">Sede Operativa</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right shrink-0">
                                                    <span className={clsx(
                                                        "text-xl font-black tabular-nums tracking-tighter",
                                                        s.stock > 0 ? "text-emerald-500" : "text-rose-500"
                                                    )}>
                                                        {s.stock} <span className="text-[9px] opacity-40">unid.</span>
                                                    </span>
                                                    <span className="text-[9px] font-black text-slate-400 uppercase block mt-0.5">Disponibles</span>
                                                </div>
                                                {s.stock > 0 && s.branchId !== currentBranch?.id && (
                                                    <button
                                                        onClick={() => {
                                                            onClose();
                                                            router.push('/pedidos/nuevo');
                                                        }}
                                                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-90 bg-indigo-500 dark:bg-indigo-500/20 text-white dark:text-indigo-400 shadow-indigo-500/10 hover:opacity-90"
                                                        title="Crear pedido"
                                                    >
                                                        <Send size={16} strokeWidth={3} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </IndustrialModal>
    );
}
