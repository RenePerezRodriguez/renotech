'use client';
 
import { Product, InventoryMovement } from '@/types';
import { Edit, Trash2, History, Package, MapPin, Info, BarChart3, Clock, ArrowRight, Send, Building2, Globe } from 'lucide-react';
import { formatDate, formatTime } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { CrossBranchInventoryService } from '@/services/CrossBranchInventoryService';
import clsx from 'clsx';
import IndustrialModal, { IndustrialTheme } from '@/components/common/IndustrialModal';
import { useState, useEffect } from 'react';
import { InventoryService } from '@/services/InventoryService';
import { Skeleton } from '@/components/ui/skeleton';

interface ProductDetailModalProps {
    product: Product;
    onClose: () => void;
    onEdit: (product: Product) => void;
    onDelete: (id: string, name: string) => void;
    isOpen: boolean;
}

type TabType = 'FICHA' | 'EXISTENCIA' | 'KARDEX';

export default function ProductDetailModal({ product, onClose, onEdit, onDelete, isOpen }: ProductDetailModalProps) {
    const router = useRouter();
    const { currentBranch } = useBranch();
    const { role } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('FICHA');
    const [movements, setMovements] = useState<InventoryMovement[]>([]);
    const [loadingKardex, setLoadingKardex] = useState(false);
    
    const isGerente = role === 'GERENTE';
    const theme: IndustrialTheme = 'stealth';
    const [branchStocks, setBranchStocks] = useState<{ branchName: string; stock: number; costo: number; branchId: string; productId: string; isHQ?: boolean }[]>([]);
    const [loadingStocks, setLoadingStocks] = useState(false);

    useEffect(() => {
        if (isOpen && activeTab === 'KARDEX' && product?.id) {
            const fetchKardex = async () => {
                setLoadingKardex(true);
                try {
                    const data = await InventoryService.getKardex(product.id, 10);
                    setMovements(data as InventoryMovement[]);
                } catch {
                    // Non-critical: kardex preview may fail silently
                } finally {
                    setLoadingKardex(false);
                }
            };
            fetchKardex();
        }
    }, [isOpen, activeTab, product?.id]);

    // Reset tab when modal closes
    useEffect(() => {
        if (!isOpen) setActiveTab('FICHA');
    }, [isOpen]);

    // Load cross-branch stocks when EXISTENCIA tab opens
    useEffect(() => {
        if (isOpen && activeTab === 'EXISTENCIA' && product?.masterId) {
            const fetchStocks = async () => {
                setLoadingStocks(true);
                try {
                    const data = await CrossBranchInventoryService.getProductStockAcrossBranches(product.masterId!);
                    const sorted = [...data].sort((a, b) => {
                        if (a.branchId === currentBranch?.id) return -1;
                        if (b.branchId === currentBranch?.id) return 1;
                        if (a.isHQ) return -1;
                        if (b.isHQ) return 1;
                        return a.branchName.localeCompare(b.branchName);
                    });
                    setBranchStocks(sorted);
                } catch {
                    setBranchStocks([]);
                } finally {
                    setLoadingStocks(false);
                }
            };
            fetchStocks();
        }
    }, [isOpen, activeTab, product?.masterId, currentBranch?.id]);

    if (!product) return null;

    const footer = (
        <div className="flex flex-wrap items-center gap-4 w-full">
            <div className="hidden lg:flex items-center gap-4 text-slate-400 dark:text-white/30 text-[9px] font-black uppercase tracking-[0.3em] mr-auto">
                ID SISTEMA: {product.id?.toUpperCase() || 'PND'}
            </div>

            <div className="flex gap-3 ml-auto w-full md:w-auto">
                {isGerente && (
                    <>
                        <button
                            onClick={() => {
                                onClose();
                                router.push('/pedidos/nuevo');
                            }}
                            className="w-11 h-11 flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500 text-indigo-500 hover:text-white rounded-xl transition-all active:scale-95 border border-indigo-500/20 group"
                            title="Crear pedido"
                        >
                            <Send size={16} />
                        </button>
                        <button
                            onClick={() => { onClose(); onEdit(product); }}
                            style={{ backgroundColor: 'var(--industrial-accent)' }}
                            className="flex-1 md:flex-none h-11 px-8 hover:brightness-110 text-slate-950 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
                        >
                            <Edit size={14} strokeWidth={2.5} />
                            Gestionar Activo
                        </button>
                        <button
                            onClick={() => { onDelete(product.id!, product.nombre); onClose(); }}
                            className="w-11 h-11 flex items-center justify-center bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl transition-all active:scale-95 border border-rose-500/20 group"
                        >
                            <Trash2 size={16} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={product.nombre}
            subtitle={`FICHA TÉCNICA ÚNICA • ${product.codigo}`}
            icon={<Package size={22} />}
            theme={theme}
            maxWidth="max-w-5xl"
            noPadding
            footer={footer}
        >
            <div className="flex flex-col h-150">
                {/* Tab Navigation */}
                <div className="flex items-center gap-1 p-2 bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-white/10">
                    <TabButton 
                        active={activeTab === 'FICHA'} 
                        onClick={() => setActiveTab('FICHA')} 
                        label="Ficha Técnica" 
                        icon={<Info size={14} />} 
                    />
                    <TabButton 
                        active={activeTab === 'EXISTENCIA'} 
                        onClick={() => setActiveTab('EXISTENCIA')} 
                        label="Existencias" 
                        icon={<BarChart3 size={14} />} 
                    />
                    <TabButton 
                        active={activeTab === 'KARDEX'} 
                        onClick={() => setActiveTab('KARDEX')} 
                        label="Historial (Kardex)" 
                        icon={<Clock size={14} />} 
                    />
                </div>

                <div className="flex-1 overflow-hidden">
                    {activeTab === 'FICHA' && (
                        <div className="flex flex-col lg:flex-row h-full animate-in fade-in slide-in-from-left-4 duration-300">
                            {/* Column 1: Image */}
                            <div className="w-full lg:w-[40%] bg-slate-50/50 dark:bg-black/10 p-8 flex flex-col items-center border-r border-slate-200 dark:border-white/10">
                                <div className="w-full aspect-square bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden relative shadow-sm group">
                                    {product.imagenUrl ? (
                                        <Image 
                                            src={product.imagenUrl} 
                                            alt={product.nombre} 
                                            fill 
                                            className="object-contain p-8 transition-transform duration-700 group-hover:scale-105" 
                                        />
                                    ) : (
                                        <Package size={80} strokeWidth={1} className="text-slate-200 dark:text-slate-800" />
                                    )}
                                </div>
                                <div className="mt-8 w-full space-y-3">
                                    <TechnicalItem label="Marca / Fabricante" value={product.marca || 'GENÉRICO'} />
                                    <TechnicalItem label="Categoría" value={product.categoria || 'SIN CATEGORÍA'} />
                                </div>
                            </div>
                            
                            {/* Column 2: Specs */}
                            <div className="w-full lg:w-[60%] p-8 overflow-y-auto custom-scrollbar">
                                <div className="space-y-8">
                                    <div>
                                        <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] mb-4">Especificaciones Técnicas</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <TechnicalItem label="Código OEM / Original" value={product.codigoOE as string} />
                                            <TechnicalItem label="Código Fábrica" value={product.codigoFabrica as string} />
                                            <TechnicalItem label="Procedencia" value={product.origen as string || 'NACIONAL'} />
                                            <TechnicalItem label="Unidad de Medida" value={product.unidad as string || 'PZA'} />
                                        </div>
                                    </div>

                                    {!!product.descripcion && (
                                        <div>
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-3">Descripción del Activo</h4>
                                            <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10">
                                                <p className="text-xs font-bold text-slate-600 dark:text-slate-400 leading-relaxed italic uppercase">
                                                    &quot;{product.descripcion as string}&quot;
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'EXISTENCIA' && (
                        <div className="p-8 h-full overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Left: Stock & Location */}
                                <div className="space-y-6">
                                    <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-4">Control de Stock y Logística</h4>
                                    
                                    <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-200 dark:border-white/10 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Existencia en {currentBranch?.name || 'Sucursal Actual'}</span>
                                            <div className="flex items-baseline gap-2">
                                                <span className={clsx(
                                                    "text-5xl font-black font-mono tracking-tighter",
                                                    product.stock > (product.minStock || 0) ? "text-slate-900 dark:text-white" : "text-rose-500"
                                                )}>{product.stock}</span>
                                                <span className="text-xs font-black text-slate-400 uppercase">{product.unidad as string || 'PZA'}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Punto Reorden</span>
                                            <span className="text-xl font-black text-rose-500 font-mono tracking-tighter">{product.minStock || 0}</span>
                                        </div>
                                    </div>

                                    <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-200 dark:border-white/10 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                                                    <MapPin size={16} />
                                                </div>
                                                <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Ubicación física</span>
                                            </div>
                                            <span className="text-xs font-black text-slate-900 dark:text-white uppercase font-mono">{product.ubicacionFisica as string || 'NO ASIGNADA'}</span>
                                        </div>
                                    </div>

                                    {/* Existencia en Red - cross-branch from Firestore */}
                                    <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-200 dark:border-white/10 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                                    <Globe size={16} />
                                                </div>
                                                <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Existencia en Red</span>
                                            </div>
                                            <span className="text-[10px] font-black text-indigo-500 uppercase font-mono">
                                                TOTAL: {branchStocks.reduce((sum, s) => sum + s.stock, 0)} UND.
                                            </span>
                                        </div>
                                        <div className="space-y-2 border-t border-slate-200 dark:border-white/10 pt-3">
                                            {loadingStocks ? (
                                                <>
                                                    <Skeleton className="h-8 w-full" />
                                                    <Skeleton className="h-8 w-full" />
                                                </>
                                            ) : branchStocks.length === 0 ? (
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center py-2">Sin datos de red</p>
                                            ) : (
                                                branchStocks.map((s) => {
                                                    const isLocal = s.branchId === currentBranch?.id;
                                                    return (
                                                        <div key={s.branchId} className="flex items-center justify-between gap-3 py-1">
                                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                {s.isHQ ? <Globe size={12} className="text-indigo-500 shrink-0" /> : <Building2 size={12} className="text-slate-400 shrink-0" />}
                                                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 wrap-break-word">{s.branchName}</span>
                                                                {isLocal && (
                                                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 uppercase tracking-widest shrink-0">Local</span>
                                                                )}
                                                                {s.isHQ && !isLocal && (
                                                                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 uppercase tracking-widest shrink-0">HQ</span>
                                                                )}
                                                            </div>
                                                            <span className={clsx(
                                                                "text-xs font-black font-mono shrink-0",
                                                                s.stock > 0 ? "text-slate-900 dark:text-white" : "text-slate-400"
                                                            )}>{s.stock} UND.</span>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Financials */}
                                <div className="space-y-6">
                                    <h4 className="text-[10px] font-black text-yellow-600 dark:text-[#FFD700] uppercase tracking-[0.3em] mb-4">Configuración de Precios</h4>
                                    
                                    <div className="p-6 bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 flex justify-between items-center group">
                                        <div>
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Precio de Venta con Factura</span>
                                            <p className="text-[8px] font-bold text-yellow-600 dark:text-[#FFD700] uppercase">Validez Fiscal Total</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-black text-slate-400 mr-2">Bs.</span>
                                            <span className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tighter">
                                                {(product.precioConFactura as number ?? product.precioVenta as number ?? 0).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-6 bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 flex justify-between items-center group">
                                        <div>
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Precio de Venta sin Factura</span>
                                            <p className="text-[8px] font-bold text-emerald-500 uppercase">Operación Neta Directa</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-black text-slate-400 mr-2">Bs.</span>
                                            <span className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tighter">
                                                {(product.precioSinFactura as number ?? product.precioVenta as number ?? 0).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>

                                    {isGerente && (
                                        <div className="p-4 bg-slate-900 dark:bg-black rounded-2xl border border-white/5 flex justify-between items-center group">
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Costo de Adquisición</span>
                                            <span className="text-sm font-black text-emerald-500/80 font-mono tracking-tighter">
                                                Bs. {(product.costo as number || 0).toFixed(2)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'KARDEX' && (
                        <div className="p-8 h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h4 className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                        <History size={14} /> Auditoría Logística
                                    </h4>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Snapshot de los últimos 10 movimientos de stock</p>
                                </div>
                                <button 
                                    onClick={() => router.push(`/kardex/${product.id}`)}
                                    className="p-3 px-5 bg-slate-900 dark:bg-white text-white dark:text-black rounded-xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-black/10"
                                >
                                    Ver Auditoría Completa <ArrowRight size={14} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10 bg-white/40 dark:bg-black/20 relative shadow-inner">
                                {loadingKardex ? (
                                    <div className="p-8 space-y-4">
                                        {[1, 2, 3, 4].map(i => (
                                            <Skeleton key={i} className="h-12 w-full bg-slate-100 dark:bg-white/5 rounded-xl" />
                                        ))}
                                    </div>
                                ) : movements.length === 0 ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30">
                                        <History size={48} strokeWidth={1} />
                                        <span className="text-[10px] font-black uppercase tracking-[0.4em] mt-4">Sin Historial Reciente</span>
                                    </div>
                                ) : (
                                    <div className="h-full overflow-y-auto custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0">
                                            <thead className="sticky top-0 bg-slate-50 dark:bg-background z-10">
                                                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                    <th className="px-6 py-4">Fecha / Operador</th>
                                                    <th className="px-6 py-4">Acción</th>
                                                    <th className="px-6 py-4 text-right">Cant.</th>
                                                    <th className="px-6 py-4 text-right">Balance</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                                {movements.map((mov) => (
                                                    <tr key={mov.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col">
                                                                <span className="text-[11px] font-black text-slate-900 dark:text-white font-mono leading-none mb-1">
                                                                    {formatDate(mov.date)} · {formatTime(mov.date)}
                                                                </span>
                                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest wrap-break-word">
                                                                    {formatUserName(mov.userName as string)}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col gap-1">
                                                                <span className={clsx(
                                                                    "px-2 py-0.5 rounded-xl text-[8px] font-black uppercase w-fit tracking-widest",
                                                                    ['ENTRADA', 'TRASP_ENTRADA', 'GARANTIA_ENTRADA', 'ANULACION', 'CARGA_INICIAL', 'REPOSICION'].includes(mov.type as string) ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                                                                )}>
                                                                    {mov.type}
                                                                </span>
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase wrap-break-word">
                                                                    {mov.reason as string}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className={clsx(
                                                            "px-6 py-4 text-right text-xs font-black font-mono",
                                                            ['ENTRADA', 'TRASP_ENTRADA', 'GARANTIA_ENTRADA', 'ANULACION', 'CARGA_INICIAL', 'REPOSICION'].includes(mov.type as string) ? "text-emerald-500" : "text-rose-500"
                                                        )}>
                                                            {['ENTRADA', 'TRASP_ENTRADA', 'GARANTIA_ENTRADA', 'ANULACION', 'CARGA_INICIAL', 'REPOSICION'].includes(mov.type as string) ? '+' : '-'}{mov.quantity}
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <span className="text-xs font-black text-slate-900 dark:text-white font-mono">
                                                                {mov.currentStock}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </IndustrialModal>
    );
}

// Tactical Helper Components
function TabButton({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "flex-1 flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95",
                active 
                    ? "bg-white dark:bg-background text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-white/10" 
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-white/5"
            )}
        >
            {icon}
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
}

function TechnicalItem({ label, value }: { label: string, value?: string }) {
    return (
        <div className="flex flex-col gap-1.5 group">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none px-1">{label}</p>
            <div className="h-10 flex items-center px-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 group-hover:border-indigo-500/30 transition-all">
                <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-tight font-mono wrap-break-word">
                    {value || '---'}
                </span>
            </div>
        </div>
    );
}
