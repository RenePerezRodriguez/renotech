'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Product } from '@/types';
import { InventoryService } from '@/services/InventoryService';
import { useAuth } from '@/contexts/AuthContext';
import { Save, RotateCcw, ChevronUp, ChevronDown, Loader2, TrendingUp, TrendingDown, Package, Info } from 'lucide-react';
import clsx from 'clsx';
import { useBranch } from '@/contexts/BranchContext';
import IndustrialModal from '@/components/common/IndustrialModal';
import { toast } from 'sonner';
import NumericInput from '@/components/common/NumericInput';

interface StockAdjustmentModalProps {
    product: Product | null;
    onClose: () => void;
    onSuccess: () => void;
}

export default function StockAdjustmentModal({ product, onClose, onSuccess }: StockAdjustmentModalProps) {
    const { user } = useAuth();
    const { currentBranch } = useBranch();
    const [quantity, setQuantity] = useState('');
    const [type, setType] = useState<'ENTRADA' | 'SALIDA'>('ENTRADA');
    const [reason, setReason] = useState('');
    const [referenceId, setReferenceId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const currentStock = product?.stock || 0;
    const adjustQty = Number(quantity) || 0;
    const newStock = type === 'ENTRADA' ? currentStock + adjustQty : currentStock - adjustQty;
    const isValid = adjustQty > 0 && reason.trim().length > 3 && (type === 'ENTRADA' || (type === 'SALIDA' && newStock >= 0));

    const handleSubmit = useCallback(async () => {
        if (!isValid || !user || !product || !currentBranch?.id) return;
        
        setIsSubmitting(true);
        try {
            await InventoryService.adjustStock(
                product.id!,
                adjustQty,
                type,
                reason,
                user.uid,
                user.displayName || 'SISTEMA',
                currentBranch.id,
                referenceId // Pass the audit reference
            );
            onSuccess();
            onClose();
        } catch {
            toast.error('Error al ajustar el stock');
        } finally {
            setIsSubmitting(false);
        }
    }, [isValid, user, product, currentBranch, adjustQty, type, reason, referenceId, onSuccess, onClose]);

    // Solo hace focus al número al abrir el modal, NO en cada cambio de estado
    useEffect(() => {
        if (product) {
            setTimeout(() => inputRef.current?.focus(), 120);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product?.id]);

    // Listener de teclado: Enter confirma solo si el foco NO está en un campo de texto
    useEffect(() => {
        if (!product) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
                if (isValid && !isSubmitting) handleSubmit();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [product, isValid, isSubmitting, handleSubmit]);

    const stepQty = (dir: number) => {
        const val = Math.max(0, (Number(quantity) || 0) + dir);
        setQuantity(val === 0 ? '' : String(val));
    };

    if (!product) return null;

    return (
        <IndustrialModal
            isOpen={!!product}
            onClose={onClose}
            title="CONTROL DE INVENTARIO"
            subtitle={`Ajuste Operativo: ${product.codigo || 'N/A'}`}
            icon={<RotateCcw size={22} className="animate-pulse-slow active:rotate-180 transition-transform duration-500" />}
            maxWidth="max-w-4xl"
        >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full min-h-112.5">
                <div className="md:col-span-7 flex flex-col space-y-7 border-r border-slate-100 dark:border-white/10 pr-8">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
                            <label className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-500 dark:text-[#FFD700] flex items-center gap-2">
                                <Package size={14} strokeWidth={3} />
                                Producto en Proceso
                            </label>
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-[#FFD700] animate-pulse" />
                                <span className="px-2 py-0.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400">
                                    {product.codigo?.toUpperCase() || 'N/A'}
                                </span>
                            </div>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase italic tracking-tighter leading-none py-1">
                            {product.nombre}
                        </h2>
                    </div>

                    {/* ENTRADA / SALIDA Toggle */}
                    <div className="grid grid-cols-2 bg-slate-100 dark:bg-black/40 p-1.5 rounded-2xl border border-slate-200 dark:border-white/10">
                        <button
                            onClick={() => setType('ENTRADA')}
                            className={clsx(
                                "py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] transition-all flex items-center justify-center gap-2 border",
                                type === 'ENTRADA' 
                                    ? "bg-white dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 shadow-xl" 
                                    : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 border-transparent"
                            )}
                        >
                            <TrendingUp size={14} strokeWidth={3} />
                            Añadir stock
                        </button>
                        <button
                            onClick={() => setType('SALIDA')}
                            className={clsx(
                                "py-3 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] transition-all flex items-center justify-center gap-2 border",
                                type === 'SALIDA' 
                                    ? "bg-white dark:bg-rose-500/10 text-rose-600 dark:text-rose-500 border-rose-200 dark:border-rose-500/30 shadow-xl" 
                                    : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 border-transparent"
                            )}
                        >
                            <TrendingDown size={14} strokeWidth={3} />
                            Retirar stock
                        </button>
                    </div>

                    {/* Quantity Selector */}
                    <div className="bg-slate-50 dark:bg-black/20 p-8 rounded-3xl border border-slate-100 dark:border-white/10 flex flex-col items-center justify-center space-y-4 shadow-inner">
                        <span className="text-[10px] uppercase font-black tracking-[0.3em] text-slate-400 dark:text-slate-500">Volumen a Procesar</span>
                        <div className="flex items-center gap-8">
                            <div className="flex flex-col gap-1.5">
                                <button onClick={() => stepQty(1)} className="p-2.5 rounded-xl bg-white dark:bg-white/5 hover:bg-emerald-500 hover:text-white dark:hover:text-black text-slate-400 transition-all border border-slate-200 dark:border-white/10 shadow-sm active:scale-90">
                                    <ChevronUp size={22} strokeWidth={4} />
                                </button>
                                <button onClick={() => stepQty(-1)} className="p-2.5 rounded-xl bg-white dark:bg-white/5 hover:bg-rose-500 hover:text-white dark:hover:text-black text-slate-400 transition-all border border-slate-200 dark:border-white/10 shadow-sm active:scale-90">
                                    <ChevronDown size={22} strokeWidth={4} />
                                </button>
                            </div>
                            
                            <div className="relative group">
                                <NumericInput
                                    ref={inputRef}
                                    value={quantity}
                                    onChange={setQuantity}
                                    allowNegative
                                    placeholder="0"
                                    className="w-40 text-center text-8xl font-black bg-transparent border-none focus:ring-0 outline-none p-0 text-slate-900 dark:text-white font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none selection:bg-blue-500/20"
                                />
                            </div>
 
                            <span className="text-2xl font-black text-slate-300 dark:text-slate-700 uppercase tracking-tighter self-end mb-2">{product.unidad || 'PZ'}</span>
                        </div>
                    </div>

                    {/* Reasoning & Reference */}
                    <div className="flex-1 flex flex-col space-y-3">
                        {/* Justificación — ancho completo */}
                        <div className="space-y-1.5">
                            <label className="text-[9px] uppercase font-black tracking-[0.2em] text-slate-400 dark:text-slate-500 flex items-center gap-2">
                                <Info size={12} className="text-blue-500 dark:text-[#FFD700]" />
                                Justificación Técnica *
                            </label>
                            <textarea
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder="Motivo del ajuste..."
                                rows={3}
                                className="w-full bg-slate-100 dark:bg-black/60 rounded-xl border border-slate-200 dark:border-white/10 focus:border-blue-500/30 dark:focus:border-[#FFD700]/30 focus:bg-white dark:focus:bg-black/80 px-3 py-2.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 outline-none transition-all resize-none leading-relaxed placeholder:text-slate-400 dark:placeholder:text-slate-700"
                            />
                        </div>
                        {/* Referencia — fila compacta */}
                        <div className="space-y-1.5">
                            <label className="text-[9px] uppercase font-black tracking-[0.2em] text-slate-400 dark:text-slate-500 flex items-center gap-2">
                                <RotateCcw size={12} className="text-indigo-500" />
                                Referencia (opcional)
                            </label>
                            <input
                                type="text"
                                value={referenceId}
                                onChange={e => setReferenceId(e.target.value)}
                                placeholder="Ej: ENV-004, REN-021, compra-proveedor"
                                className="w-full h-10 bg-slate-100 dark:bg-black/60 rounded-xl border border-slate-200 dark:border-white/10 focus:border-blue-500/30 dark:focus:border-[#FFD700]/30 focus:bg-white dark:focus:bg-black/80 px-3 text-[11px] font-bold text-slate-700 dark:text-slate-300 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-700 uppercase"
                            />
                        </div>
                    </div>
                </div>

                {/* Right Column: Projection (5 cols) */}
                <div className="md:col-span-5 flex flex-col justify-between space-y-6">
                    <div className="bg-linear-to-br from-slate-50 to-white dark:from-white/5 dark:to-transparent p-7 rounded-3xl border border-slate-200 dark:border-white/10 relative overflow-hidden group shadow-sm">
                        <div className="absolute top-0 right-0 p-4 opacity-[0.03] dark:opacity-10 group-hover:opacity-20 transition-opacity">
                            <TrendingUp size={120} className={type === 'ENTRADA' ? "text-emerald-500" : "text-rose-500"} />
                        </div>
                        
                        <div className="relative z-10 space-y-10">
                            <div>
                                <span className="text-[10px] uppercase font-black text-slate-400 dark:text-slate-500 tracking-widest block mb-2">Estado Actual</span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-5xl font-black font-mono text-slate-900 dark:text-white dark:opacity-40">{currentStock}</span>
                                    <span className="text-xs font-bold text-slate-400 dark:text-slate-600 uppercase">{product.unidad || 'PZ'}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 py-2">
                                <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                                <div className={clsx(
                                    "px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border shadow-sm",
                                    type === 'ENTRADA' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-200 dark:border-emerald-500/20" : "bg-rose-500/10 text-rose-600 dark:text-rose-500 border-rose-200 dark:border-rose-500/20"
                                )}>
                                    {type === 'ENTRADA' ? '+' : '-'} {adjustQty}
                                </div>
                                <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                            </div>

                            <div>
                                <span className="text-[10px] uppercase font-black text-blue-500 dark:text-(--industrial-accent) tracking-widest block mb-2">Proyección Final</span>
                                <div className="flex items-baseline gap-2">
                                    <div className={clsx(
                                        "text-7xl font-black font-mono transition-all",
                                        newStock < 0 ? "text-rose-600 dark:text-rose-500" : (newStock > currentStock ? "text-emerald-600 dark:text-emerald-500" : "text-slate-900 dark:text-white")
                                    )}>
                                        {newStock}
                                    </div>
                                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">En Almacén</span>
                                </div>
                                {newStock < 0 && (
                                    <p className="mt-3 text-[10px] font-bold text-rose-500 uppercase animate-pulse flex items-center gap-2">
                                        <Info size={12} />
                                        Error: Inventario insuficiente
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action Bar */}
                    <div className="space-y-4">
                        <button
                            onClick={handleSubmit}
                            disabled={!isValid || isSubmitting}
                            className={clsx(
                                "w-full h-16 rounded-3xl font-black uppercase tracking-[0.3em] text-[11px] shadow-2xl transition-all active:scale-[0.98] disabled:opacity-20 flex items-center justify-center gap-4 border-2 group",
                                type === 'ENTRADA' 
                                    ? "bg-emerald-600 border-emerald-500/50 text-white hover:bg-emerald-500 hover:shadow-emerald-500/20" 
                                    : "bg-rose-600 border-rose-500/50 text-white hover:bg-rose-500 hover:shadow-rose-500/20"
                            )}
                        >
                            {isSubmitting ? (
                                <Loader2 className="animate-spin" size={20} />
                            ) : (
                                <>
                                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Save size={16} strokeWidth={3} className="group-hover:rotate-12 transition-transform" />
                                    </div>
                                    Ejecutar Ajuste
                                </>
                            )}
                        </button>
                        
                        <div className="flex items-center justify-center gap-6 opacity-40">
                            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">[ ESC ] Cancelar</span>
                            <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-white/5" />
                            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">[ ENTER ] Confirmar</span>
                        </div>
                    </div>
                </div>
            </div>
        </IndustrialModal>
    );
}
