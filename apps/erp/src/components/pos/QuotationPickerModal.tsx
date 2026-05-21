'use client';

import { useState, useEffect, useMemo } from 'react';
import { Quotation } from '@/types';
import { QuotationService } from '@/services/QuotationService';
import { Search, FileText, Calendar, Package, ShoppingCart, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useBranch } from '@/contexts/BranchContext';

import IndustrialModal from '@/components/common/IndustrialModal';
import { formatDate } from '@/utils/dateHelpers';

interface QuotationPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (quotation: Quotation) => void;
}

export default function QuotationPickerModal({ isOpen, onClose, onSelect }: QuotationPickerModalProps) {
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [loadingItemsId, setLoadingItemsId] = useState<string | null>(null);
    const { currentBranch } = useBranch();

    useEffect(() => {
        if (!isOpen) {
            setSearchTerm('');
            setExpandedId(null);
            return;
        }

        const load = async () => {
            setLoading(true);
            try {
                const allQuotations = await QuotationService.getQuotations(currentBranch?.id);
                const pending = allQuotations.filter(q => q.status === 'PENDING');
                setQuotations(pending);
            } catch (error) {
                console.error("Error loading quotations:", error);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [isOpen, currentBranch?.id]);

    const filteredQuotations = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();
        return quotations.filter(q =>
            (q.cliente.razonSocial?.toLowerCase() || '').includes(lowerSearch) ||
            (q.id?.toLowerCase() || '').includes(lowerSearch) ||
            (q.cliente.nit || '').includes(lowerSearch)
        );
    }, [searchTerm, quotations]);

    if (!isOpen) return null;

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title="Cargar Cotización"
            subtitle="Operaciones POS"
            icon={<FileText size={22} strokeWidth={2.5} />}
            theme="stealth"
            maxWidth="max-w-2xl"
        >
            <div className="flex flex-col space-y-6">
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-(--industrial-accent) transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por cliente, NIT o código..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 dark:border-white/10 py-4 pl-12 pr-4 text-xs font-bold focus:border-(--industrial-accent) focus:outline-none focus:ring-4 focus:ring-(--industrial-accent-soft) shadow-inner bg-slate-50 dark:bg-black/20 dark:text-white transition-all placeholder:text-slate-400"
                        autoFocus
                    />
                </div>

                <div className="flex-1 overflow-y-auto min-h-100 space-y-4 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-60 space-y-4">
                            <Loader2 className="w-10 h-10 text-(--industrial-accent) animate-spin opacity-50" />
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Analizando Datos...</span>
                        </div>
                    ) : filteredQuotations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 opacity-20">
                            <FileText size={48} strokeWidth={1} className="mb-2" />
                            <p className="text-[10px] font-black uppercase tracking-widest">No se encontraron activos pendientes</p>
                        </div>
                    ) : (
                        filteredQuotations.map(quotation => {
                            const isExpanded = expandedId === quotation.id;
                            const itemCount = quotation.items?.length || 0;

                            return (
                                <div
                                    key={quotation.id}
                                    className="bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/10 hover:border-(--industrial-accent) transition-all overflow-hidden group shadow-sm hover:shadow-xl"
                                >
                                    {/* Header */}
                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-black/40 flex items-center justify-center text-(--industrial-accent) shadow-sm border border-slate-100 dark:border-white/10">
                                                    <FileText size={20} strokeWidth={2.5} />
                                                </div>
                                                <div>
                                                    <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-tight text-sm group-hover:text-(--industrial-accent) transition-colors">
                                                        {quotation.cliente.razonSocial || 'Consumidor Final'}
                                                    </h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                                            NIT: {quotation.cliente.nit || 'S/N'}
                                                        </span>
                                                        <div className="w-1 h-1 rounded-full bg-slate-200 dark:bg-white/5" />
                                                        <span className="text-[10px] font-black text-emerald-500 uppercase font-mono tracking-tighter">
                                                            Bs {quotation.total.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="bg-slate-900 text-white dark:bg-[#FFD700]/10 dark:text-[#FFD700] text-[9px] font-black px-3 py-1.5 rounded-xl uppercase tracking-[0.2em] border border-white/10 dark:border-[#FFD700]/20">
                                                COT-{quotation.id?.slice(-8).toUpperCase()}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-6 py-3 border-t border-slate-200/50 dark:border-white/10">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={12} className="text-slate-400" />
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{formatDate(quotation.fecha)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Package size={12} className="text-blue-500" />
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{itemCount} Ítems</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expandable Items Section */}
                                    <div className="border-t border-slate-200/50 dark:border-white/10 bg-black/5">
                                        <button
                                            onClick={async () => {
                                                if (isExpanded) {
                                                    setExpandedId(null);
                                                    return;
                                                }

                                                if (quotation.items === undefined) {
                                                    setLoadingItemsId(quotation.id || null);
                                                    try {
                                                        const { QuotationService } = await import('@/services/QuotationService');
                                                        const items = await QuotationService.getQuotationItems(quotation.id!);
                                                        setQuotations(prev => prev.map(q => q.id === quotation.id ? { ...q, items } : q));
                                                    } catch (error) {
                                                        console.error('Error loading quotation items:', error);
                                                    } finally {
                                                        setLoadingItemsId(null);
                                                    }
                                                }

                                                setExpandedId(quotation.id || null);
                                            }}
                                            className="w-full px-6 py-3 flex items-center justify-between text-[10px] font-black text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all uppercase tracking-widest"
                                        >
                                            <span className="flex items-center gap-2">
                                                {isExpanded ? <ChevronUp size={14} strokeWidth={3} /> : <ChevronDown size={14} strokeWidth={3} />}
                                                {loadingItemsId === quotation.id && !isExpanded ? 'Cargando ítems...' : isExpanded ? 'Contraer Detalle' : 'Ver Inventario Solicitado'}
                                            </span>
                                        </button>

                                        {isExpanded && quotation.items && (
                                            <div className="px-6 pb-6 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                                                {quotation.items.length === 0 ? (
                                                    <div className="px-4 py-6 text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
                                                        Esta cotización no contiene ítems.
                                                    </div>
                                                ) : (
                                                    quotation.items.map((item, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="flex items-center justify-between bg-white dark:bg-white/5 rounded-xl px-4 py-3 border border-slate-100 dark:border-white/10"
                                                        >
                                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                <span className="bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 font-black w-7 h-7 rounded-xl flex items-center justify-center text-[10px] shrink-0 border border-slate-200 dark:border-white/10">
                                                                    {item?.quantity ?? 0}
                                                                </span>
                                                                <span className="font-bold text-slate-700 dark:text-slate-300 wrap-break-word text-[11px] uppercase tracking-tight">
                                                                    {item?.productName || 'N/A'}
                                                                </span>
                                                            </div>
                                                            <span className="font-black text-slate-900 dark:text-white ml-4 shrink-0 font-mono text-xs text-right">
                                                                {item?.subtotal?.toLocaleString() ?? '0.00'}
                                                            </span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Button */}
                                    <button
                                        onClick={() => {
                                            onSelect(quotation);
                                            onClose();
                                        }}
                                        className="w-full h-14 flex items-center justify-center gap-3 font-black text-[10px] transition-all uppercase tracking-[0.3em] bg-slate-900 hover:bg-slate-800 dark:bg-white/10 dark:hover:bg-white/20 text-white dark:text-[#FFD700] border-t border-white/5"
                                    >
                                        <ShoppingCart size={16} strokeWidth={3} />
                                        Inyectar al POS
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </IndustrialModal>
    );
}
