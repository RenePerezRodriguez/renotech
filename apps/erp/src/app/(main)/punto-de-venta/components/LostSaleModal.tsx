'use client';

import { useState } from 'react';
import { Product } from '@/types';
import { SaleService } from '@/services/SaleService';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { toast } from 'sonner';
import { 
    X, AlertCircle, PackageSearch, DollarSign, Tag, Info, Save 
} from 'lucide-react';
import clsx from 'clsx';
import NumericInput from '@/components/common/NumericInput';

interface LostSaleModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product;
}

type LostReason = 'STOCK' | 'PRICE' | 'BRAND' | 'OTHER';

export default function LostSaleModal({ isOpen, onClose, product }: LostSaleModalProps) {
    const { user, userName } = useAuth();
    const { currentBranch } = useBranch();
    const [reason, setReason] = useState<LostReason>('STOCK');
    const [qty, setQty] = useState(1);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!user || !currentBranch) return;

        setLoading(true);
        try {
            await SaleService.registerLostSale({
                masterId: product.masterId,
                productName: product.nombre,
                qty,
                reason,
                notes,
                branchId: currentBranch.id!,
                userId: user.uid,
                userName: userName ?? ''
            });

            toast.success('Venta perdida registrada', {
                description: 'Esta información ayudará a optimizar el inventario y precios.'
            });
            onClose();
        } catch {
            toast.error('Error al registrar');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-9999 flex items-center justify-center p-4">
            <div 
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />
            
            <div className="relative w-full max-w-md bg-white dark:bg-[#020617] rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-white/10 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-yellow-500/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-500 rounded-xl text-black">
                            <AlertCircle size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Reg. Venta Perdida</h2>
                            <p className="text-[10px] font-black text-yellow-600 dark:text-yellow-400 uppercase tracking-[0.2em]">Costo de Oportunidad</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl text-slate-400 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Product Info */}
                    <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{product.codigo}</span>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{product.nombre}</h4>
                    </div>

                    {/* Reason Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { id: 'STOCK' as LostReason, label: 'Sin Stock', icon: PackageSearch, color: 'text-amber-500' },
                            { id: 'PRICE' as LostReason, label: 'Precio Alto', icon: DollarSign, color: 'text-blue-500' },
                            { id: 'BRAND' as LostReason, label: 'Marca/Origen', icon: Tag, color: 'text-blue-500' },
                            { id: 'OTHER' as LostReason, label: 'Otro/Desistió', icon: Info, color: 'text-slate-500' },
                        ].map((item) => (
                            <button
                                key={item.id}
                                onClick={() => setReason(item.id)}
                                className={clsx(
                                    "flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all active:scale-95",
                                    reason === item.id 
                                        ? "bg-slate-900 dark:bg-white border-slate-900 dark:border-white text-white dark:text-black shadow-lg"
                                        : "bg-white dark:bg-[#111827] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-yellow-500/30"
                                )}
                            >
                                <item.icon size={20} className={reason === item.id ? (item.id === 'STOCK' ? 'text-amber-500' : '') : item.color} />
                                <span className="text-[10px] font-black uppercase tracking-wider">{item.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Quantity */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cantidad Solicitada</label>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => setQty(Math.max(1, qty - 1))}
                                className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-white/5 rounded-xl text-slate-600 dark:text-white font-bold"
                            > - </button>
                            <NumericInput 
                                value={qty}
                                onChange={(val) => setQty(Number(val))}
                                className="flex-1 bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl p-2 text-center font-black text-slate-900 dark:text-white tabular-nums"
                            />
                            <button 
                                onClick={() => setQty(qty + 1)}
                                className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-white/5 rounded-xl text-slate-600 dark:text-white font-bold"
                            > + </button>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observaciones (Opcional)</label>
                        <textarea 
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Ej: El cliente buscaba marca japonesa específicamente..."
                            className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-yellow-500/20 outline-none transition-all resize-none h-24"
                        />
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-slate-50 dark:bg-white/5 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 h-12 bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-2 h-12 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all shadow-lg shadow-yellow-500/20 active:scale-95"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save size={16} />
                                Guardar Registro
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
