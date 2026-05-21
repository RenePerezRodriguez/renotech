'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sale, Client } from '@/types';
import { SaleService } from '@/services/SaleService';
import { ShoppingBag, Receipt, AlertCircle } from 'lucide-react';
import { ensureDate } from '@/utils/dateHelpers';
import clsx from 'clsx';

import IndustrialModal from '@/components/common/IndustrialModal';

interface ClientHistoryModalProps {
    client: Client | null;
    onClose: () => void;
}

export default function ClientHistoryModal({ client, onClose }: ClientHistoryModalProps) {
    const [sales, setSales] = useState<Sale[]>([]);
    const [loading, setLoading] = useState(true);

    const stats = useMemo(() => {
        const completedSales = sales.filter(s => s.status === 'COMPLETED');
        const totalSpent = completedSales.reduce((acc, s) => acc + s.total, 0);
        const count = completedSales.length;
        const average = count > 0 ? totalSpent / count : 0;
        return { totalSpent, count, average };
    }, [sales]);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!client?.id) return;
            setLoading(true);
            try {
                const history = await SaleService.getSalesByClient(client.id);
                setSales(history);
            } catch (error) {
                console.error("Error fetching client history:", error);
            } finally {
                setLoading(false);
            }
        };

        if (client) {
            fetchHistory();
        }
    }, [client]);

    if (!client) return null;

    return (
        <IndustrialModal
            isOpen={!!client}
            onClose={onClose}
            title={client.razonSocial}
            subtitle="Historical Intelligence"
            icon={<ShoppingBag size={22} strokeWidth={2.5} />}
            theme="cobalt"
            maxWidth="max-w-4xl"
            footer={
                <button
                    onClick={onClose}
                    className="w-full bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[9px] hover:-translate-y-0.5 active:translate-y-px transition-all shadow-xl shadow-slate-900/10 dark:shadow-[#FFD700]/10 antialiased font-mono"
                >
                    RETORNAR AL LISTADO
                </button>
            }
        >
            <div className="space-y-8">
                {/* Stats Summary Section - Elite Layout */}
                {!loading && sales.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="bg-slate-50 dark:bg-[#111827]/40 p-6 rounded-2xl border border-slate-200 dark:border-white/10 shadow-inner flex flex-col items-center text-center">
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-2">Capital Transado</p>
                            <p className="text-2xl font-black tabular-nums text-slate-900 dark:text-white flex items-baseline gap-1">
                                <span className="text-xs text-blue-500 font-bold tracking-normal opacity-50 uppercase">Bs</span>
                                {stats.totalSpent.toLocaleString()}
                            </p>
                        </div>
                        <div className="bg-slate-50 dark:bg-[#111827]/40 p-6 rounded-2xl border border-slate-200 dark:border-white/10 shadow-inner flex flex-col items-center text-center">
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-2">Ticket Promedio</p>
                            <p className="text-2xl font-black tabular-nums text-slate-900 dark:text-white flex items-baseline gap-1">
                                <span className="text-xs text-emerald-500 font-bold tracking-normal opacity-50 uppercase">Bs</span>
                                {stats.average.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                            </p>
                        </div>
                        <div className="bg-slate-50 dark:bg-[#111827]/40 p-6 rounded-2xl border border-slate-200 dark:border-white/10 shadow-inner flex flex-col items-center text-center">
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-2">Frecuencia Operativa</p>
                            <p className="text-2xl font-black tabular-nums text-slate-900 dark:text-white">
                                {stats.count} <span className="text-[10px] text-amber-500 font-black uppercase opacity-60 ml-1 tracking-widest">Ops</span>
                            </p>
                        </div>
                    </div>
                )}

                {/* Content */}
                <div className="min-h-100">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-60 space-y-6">
                            <div className="relative w-12 h-12">
                                <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                            <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.3em] animate-pulse">Deep analysis ongoing...</p>
                        </div>
                    ) : sales.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center space-y-6 opacity-40">
                            <div className="p-8 bg-slate-100 dark:bg-white/5 rounded-3xl">
                                <ShoppingBag size={64} className="text-slate-300 dark:text-slate-600" />
                            </div>
                            <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">Sin actividad registrada actualmente</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {sales.map(sale => (
                                <div key={sale.id} className="bg-slate-50/50 dark:bg-white/5 rounded-3xl p-7 border border-slate-200/40 dark:border-white/10 hover:border-blue-500/30 transition-all group relative overflow-hidden">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
                                        <div className="flex items-center gap-4">
                                            <div className={clsx(
                                                "p-4 rounded-2xl shadow-inner border transition-colors",
                                                sale.status === 'COMPLETED'
                                                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20"
                                                    : "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/20"
                                            )}>
                                                {sale.status === 'COMPLETED' ? <Receipt size={20} /> : <AlertCircle size={20} />}
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                                    {ensureDate(sale.fecha).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/La_Paz' })}
                                                </p>
                                                <p className="font-black text-slate-900 dark:text-white uppercase tracking-tight mt-0.5">
                                                    Orden #{sale.id?.slice(0, 8).toUpperCase()}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="bg-white dark:bg-[#111827] px-6 py-3 rounded-2xl border border-slate-200/60 dark:border-white/10 shadow-sm">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">Importe Neto</p>
                                            <p className="text-xl font-black font-mono text-slate-900 dark:text-white tabular-nums">
                                                <span className="text-sm font-bold text-blue-500 mr-1">Bs.</span>
                                                {sale.total.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Items Table - High Density Technical */}
                                    <div className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200/60 dark:border-white/10 overflow-hidden">
                                        <table className="w-full text-left border-separate border-spacing-0">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-black/40 text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] text-[8px] font-black border-b border-slate-100 dark:border-white/10">
                                                    <th className="px-6 py-4">Descripción Técnica del Ítem</th>
                                                    <th className="px-6 py-4 text-right">Cant.</th>
                                                    <th className="px-6 py-4 text-right">P. Unit</th>
                                                    <th className="px-6 py-4 text-right">Subtotal</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                                {(sale.items || []).map((item, idx) => (
                                                    <tr key={idx} className="text-slate-600 dark:text-slate-300 font-bold group/row hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                                        <td className="px-5 py-3 text-[11px] uppercase tracking-tight">{item?.productName || 'Producto sin nombre'}</td>
                                                        <td className="px-5 py-3 text-right font-mono text-[10px] tabular-nums">{item?.quantity ?? 0}</td>
                                                        <td className="px-5 py-3 text-right font-mono text-[10px] tabular-nums">{item?.unitPrice?.toLocaleString() ?? '0'}</td>
                                                        <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-white">{item?.subtotal?.toLocaleString() ?? '0'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </IndustrialModal>
    );
}
