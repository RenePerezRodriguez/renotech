'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QuotationService } from '@/services/QuotationService';
import { 
    Trash2, Plus, Minus, User, X, 
    FileText, MapPin,
    ShoppingCart, ChevronRight, FileCheck, CalendarDays,
    Info
} from 'lucide-react';
import clsx from 'clsx';
import { ClientModal } from '@/components/modals';
import { toast } from 'sonner';
import { useBranch } from '@/contexts/BranchContext';
import NumericInput from '@/components/common/NumericInput';
import { useQuotationStore } from '@/store/quotationStore';
import { useAuth } from '@/contexts/AuthContext';
import { PrintService } from '@/services/PrintService';
import { useProducts } from '@/hooks/useProducts';
import { useProductHoverPreview } from '@/hooks/useProductHoverPreview';
import ProductPreviewTooltip from '@/components/common/ProductPreviewTooltip';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { WifiOff } from 'lucide-react';

const SUCCESS_EVENT = 'quotation_save_success';

export default function QuotationCart() {
    const router = useRouter();
    const { currentBranch, isConsolidatedView } = useBranch();
    const { user, userName } = useAuth();
    const { isOnline } = useNetworkStatus();
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const { products } = useProducts();
    const { hoverState: cartItemHover, onMouseEnter: onCartItemHoverEnter, onMouseLeave: onCartItemHoverLeave } = useProductHoverPreview(1000);

    // Store State
    const {
        items,
        selectedClient,
        isTaxed,
        daysValid,
        notes,
        removeItem,
        updateItem,
        setClient,
        setIsTaxed,
        setDaysValid,
        setNotes,
        clearCart,
        getTotals
    } = useQuotationStore();

    const { subtotal, total, itemCount } = getTotals();

    // Sync prices when tax mode changes
    const handleToggleTax = () => {
        const newIsTaxed = !isTaxed;
        setIsTaxed(newIsTaxed);

        // Update all existing items in the store to match the new global mode
        items.forEach(item => {
            updateItem(item.productId, { 
                priceMode: newIsTaxed ? 'CON_FACTURA' : 'SIN_FACTURA' 
            });
        });
    };

    const handleSubmit = async () => {
        if (items.length === 0) {
            toast.error('Carrito vacío', {
                description: 'Agrega al menos un producto antes de generar la cotización.',
            });
            return;
        }

        if (!selectedClient) {
            toast.error('Cliente requerido', {
                description: 'Selecciona un cliente antes de generar la cotización.',
            });
            return;
        }

        if (!daysValid || daysValid < 1) {
            toast.error('Días de validez requeridos', {
                description: 'Indica cuántos días tendrá vigencia esta cotización (ej. 7, 15 o 30 días).',
            });
            return;
        }

        if (!currentBranch?.id) {
            toast.error('Sin sucursal activa', {
                description: 'Selecciona una sucursal desde el selector del encabezado.',
            });
            return;
        }

        setIsProcessing(true);

        try {
            const validUntil = new Date();
            validUntil.setDate(validUntil.getDate() + daysValid);

            const quotationData = {
                cliente: selectedClient || { razonSocial: 'CLIENTE GENERAL', tipo: 'PARTICULAR' as const, isActive: true },
                items,
                total: total,
                subtotal: subtotal,
                status: 'PENDING' as const,
                validUntil: validUntil,
                fecha: new Date(),
                isTaxed,
                usuarioId: user?.uid || '',
                usuarioEmail: user?.email || '',
                usuarioNombre: userName ?? '',
                notes,
                branchId: currentBranch.id
            };

            const docId = await QuotationService.createQuotation(quotationData, currentBranch.id);

            if (isOnline) {
                // AUTO-PRINT solo cuando hay conexión — offline el docId es local y puede faltar data del servidor
                try {
                    const fullQuotation = { id: docId, ...quotationData };
                    PrintService.printDocument(fullQuotation, 'QUOTATION', currentBranch.id);
                } catch (printError) {
                    console.error("Error generating automatic proforma:", printError);
                }
                toast.success('Cotización generada exitosamente');
            } else {
                toast.success('Cotización guardada offline', {
                    description: 'La proforma se generará al reconectarse · Se subirá automáticamente',
                });
            }
            clearCart();
            window.dispatchEvent(new CustomEvent(SUCCESS_EVENT));
            router.push('/cotizaciones');
        } catch (error) {
            console.error(error);
            toast.error('No se pudo generar la cotización', {
                description: 'Verifica tu conexión e intenta de nuevo. Si el problema persiste, recarga la página.',
            });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col overflow-hidden min-w-0 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background shadow-sm h-full max-h-full relative transition-all duration-500">
            {/* Header - High Density Technical */}
            <div className="p-3 sm:p-4 bg-white dark:bg-background border-b border-slate-100 dark:border-white/10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0 z-10 min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-[#FFD700] flex items-center justify-center shadow-lg shadow-black/10 dark:shadow-[#FFD700]/10">
                        <FileText size={20} className="text-white dark:text-black" />
                    </div>
                    <div>
                        <h2 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-tight leading-none mb-1">Cotización</h2>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{itemCount} Artículos</span>
                            {!isOnline && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-[8px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                                    <WifiOff size={8} /> Offline
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => clearCart()}
                        disabled={items.length === 0}
                        className="p-2 text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-30"
                        title="Vaciar Carrito"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            {/* Client & Configuration - High Density */}
            <div data-tour="quot-client" className="px-4 py-3 bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/10 flex flex-col gap-3">
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsClientModalOpen(true)}
                        className={clsx(
                            "flex-1 flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left group",
                            selectedClient
                                ? "bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/20"
                                : "bg-amber-50 dark:bg-amber-500/10 border-amber-400 dark:border-amber-500/50 hover:border-amber-500 dark:hover:border-amber-400 shadow-sm shadow-amber-200/60 dark:shadow-amber-900/20"
                        )}
                    >
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className={clsx(
                                "p-1.5 rounded-xl shrink-0",
                                selectedClient ? "bg-yellow-500 text-black" : "bg-amber-400 dark:bg-amber-500 text-white"
                            )}>
                                <User size={14} />
                            </div>
                            <div className="min-w-0">
                                {!selectedClient && (
                                    <p className="text-[8px] font-black uppercase tracking-widest text-amber-500 dark:text-amber-400 leading-none mb-0.5">
                                        ★ Requerido
                                    </p>
                                )}
                                <span className={clsx(
                                    "font-black wrap-break-word leading-tight block",
                                    selectedClient ? "text-[11px] text-white" : "text-[12px] text-amber-800 dark:text-amber-300"
                                )}>
                                    {selectedClient?.razonSocial || "Seleccionar Cliente"}
                                </span>
                            </div>
                        </div>
                        {selectedClient ? (
                            <X size={14} onClick={(e) => { e.stopPropagation(); setClient(null); }} className="text-white/50 hover:text-white shrink-0" />
                        ) : (
                            <ChevronRight size={16} className="text-amber-400 group-hover:translate-x-1 transition-transform shrink-0" />
                        )}
                    </button>

                    <div className="inline-flex p-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                        <button
                            onClick={handleToggleTax}
                            className={clsx(
                                "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all",
                                isTaxed ? "bg-white dark:bg-white/5 text-blue-600 shadow-sm" : "text-slate-400"
                            )}
                        >
                            C/F
                        </button>
                        <button
                            onClick={handleToggleTax}
                            className={clsx(
                                "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all",
                                !isTaxed ? "bg-white dark:bg-white/5 text-green-600 shadow-sm" : "text-slate-400"
                            )}
                        >
                            S/F
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1">
                            <CalendarDays size={10} /> Validez (Días)
                        </label>
                        <div className="relative">
                            <NumericInput
                                value={daysValid}
                                onChange={(val) => setDaysValid(parseInt(val) || 1)}
                                className="w-full bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-yellow-500 transition-all"
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1">
                            <Info size={10} /> Sucursal
                        </label>
                        <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 flex items-center gap-2">
                            <MapPin size={10} className="text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 wrap-break-word tracking-tight">
                                {currentBranch?.name || '---'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Notas / Observaciones</label>
                    <textarea 
                        className="w-full bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-xl p-2.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:border-yellow-500 outline-none transition-all h-16 resize-none placeholder:text-slate-400"
                        placeholder="Información adicional para la cotización..."
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                    />
                </div>
            </div>

            {/* Item List - High Density Technical */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-2 custom-scrollbar bg-white dark:bg-background">
                {items.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 opacity-40">
                        <ShoppingCart size={48} strokeWidth={1} className="mb-4" />
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Seleccione productos</p>
                    </div>
                ) : (
                    items.map((item) => (
                        <div
                            key={item.productId}
                            onMouseEnter={(e) => {
                                const fullProduct = products.find(p => p.id === item.productId);
                                if (fullProduct) onCartItemHoverEnter(e, fullProduct);
                            }}
                            onMouseLeave={onCartItemHoverLeave}
                            className="group p-3 rounded-xl border border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5 hover:border-slate-200 dark:hover:border-white/10 transition-all relative overflow-hidden"
                        >
                            <div className="flex justify-between items-start gap-4 mb-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest wrap-break-word">
                                            {item.productMarca || 'GENÉRICO'}
                                        </span>
                                    </div>
                                    <h4 className="text-[12px] font-bold text-slate-800 dark:text-slate-200 leading-tight">
                                        {item.productName}
                                    </h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] font-mono text-slate-500">{item.productCode}</span>
                                        {item.productCodigoFabrica && (
                                            <span className="text-[10px] font-mono text-blue-500/70">{item.productCodigoFabrica}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-1.5">
                                    <button
                                        onClick={() => removeItem(item.productId)}
                                        className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                    
                                    <div className="flex bg-slate-200 dark:bg-white/5 p-0.5 rounded-xl border border-slate-300 dark:border-white/10">
                                        <button
                                            onClick={() => updateItem(item.productId, { priceMode: 'CON_FACTURA' })}
                                            className={clsx(
                                                "px-1.5 py-0.5 rounded text-[7px] font-black transition-all",
                                                item.priceMode === 'CON_FACTURA' 
                                                    ? "bg-white dark:bg-white/5 text-slate-900 dark:text-white shadow-sm" 
                                                    : "text-slate-400 hover:text-slate-600"
                                            )}
                                        >
                                            C/F
                                        </button>
                                        <button
                                            onClick={() => updateItem(item.productId, { priceMode: 'SIN_FACTURA' })}
                                            className={clsx(
                                                "px-1.5 py-0.5 rounded text-[7px] font-black transition-all",
                                                item.priceMode === 'SIN_FACTURA' 
                                                    ? "bg-white dark:bg-white/5 text-green-600 dark:text-green-500 shadow-sm" 
                                                    : "text-slate-400 hover:text-slate-600"
                                            )}
                                        >
                                            S/F
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="flex-[0.6] min-w-0">
                                    <div className="flex items-center bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shrink-0">
                                        <button
                                            onClick={() => updateItem(item.productId, { quantity: Math.max(1, item.quantity - 1) })}
                                            className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 transition-colors"
                                        >
                                            <Minus size={12} strokeWidth={3} />
                                        </button>
                                        <NumericInput
                                            value={item.quantity}
                                            onChange={(val) => updateItem(item.productId, { quantity: parseInt(val) || 1 })}
                                            className="w-full bg-transparent text-center text-xs font-black text-slate-900 dark:text-white outline-none border-none focus:ring-0 p-0"
                                        />
                                        <button
                                            onClick={() => updateItem(item.productId, { quantity: item.quantity + 1 })}
                                            className="p-1 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 transition-colors"
                                        >
                                            <Plus size={12} strokeWidth={3} />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 min-w-0 relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-bold">Bs</span>
                                    <NumericInput
                                        value={item.unitPrice}
                                        onChange={(val) => updateItem(item.productId, { unitPrice: parseFloat(val) || 0 })}
                                        className="w-full bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-xl pl-6 pr-2 py-1 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-yellow-500 transition-all text-right"
                                    />
                                </div>

                                <div className="flex-1 text-right">
                                    <span className="text-[10px] font-black text-slate-900 dark:text-white tabular-nums">
                                        Bs. {item.subtotal.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Totals & Footer - High Density Technical */}
            <div className="p-4 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/10 flex flex-col gap-4">
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 px-1">
                        <span>Base Imponible</span>
                        <span className="tabular-nums">Bs. {subtotal.toFixed(2)}</span>
                    </div>
                    
                    <div className="bg-slate-900 dark:bg-background p-4 rounded-2xl flex justify-between items-center shadow-xl border border-white/5">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black text-white/50 uppercase tracking-[0.3em] leading-none mb-1">Total a Cotizar</span>
                            <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-tighter">{isTaxed ? 'Modo Factura' : 'Modo Recibo'}</span>
                        </div>
                        <div className="text-right">
                            <span className="text-2xl font-black text-white tracking-tighter font-mono">
                                Bs. {total.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>

                {isConsolidatedView ? (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3">
                        <div className="p-1.5 bg-rose-500 rounded-xl text-white">
                            <X size={14} />
                        </div>
                        <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 leading-tight uppercase tracking-tight">
                            Desactivado en Vista Consolidada
                        </p>
                    </div>
                ) : (
                    <button
                        id="save-quotation-btn"
                        data-tour="quot-save"
                        onClick={handleSubmit}
                        disabled={items.length === 0 || isProcessing}
                        className={clsx(
                            "w-full py-4 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95 disabled:opacity-30 disabled:grayscale",
                            "bg-slate-900 dark:bg-[#FFD700] text-white dark:text-slate-950 hover:opacity-90 active:bg-black dark:active:bg-yellow-600"
                        )}
                    >
                        {isProcessing ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white dark:border-gray-950/30 dark:border-t-gray-950 rounded-full animate-spin" />
                        ) : (
                            <>
                                {!isOnline ? <WifiOff size={16} /> : <FileCheck size={18} />}
                                <span>{!isOnline ? 'Guardar Offline' : 'Generar Cotización'}</span>
                            </>
                        )}
                    </button>
                )}
            </div>

            <ClientModal
                isOpen={isClientModalOpen}
                onClose={() => setIsClientModalOpen(false)}
                onSelect={(client) => {
                    setClient(client);
                    setIsClientModalOpen(false);
                }}
            />

            <ProductPreviewTooltip
                anchor={cartItemHover?.element ?? null}
                product={cartItemHover?.product ?? null}
            />
        </div>
    );
}
