'use client';

import { useEffect, useState } from 'react';
import { SupplierAccount } from '@/types';
import {
    SupplierPaymentHistoryService,
    SupplierHistoryEvent,
} from '@/services/SupplierPaymentHistoryService';
import {
    Banknote, Send, QrCode, FileText, Loader2, History, ChevronDown, ChevronUp, Undo2
} from 'lucide-react';
import clsx from 'clsx';
import TransactionDetailsModal from '@/components/modals/TransactionDetailsModal';

interface Props {
    accounts: SupplierAccount[];
    /** Cambiar este valor fuerza un re-fetch del historial (útil tras un pago). */
    refreshKey?: number;
}

const fmtBob = (n: number) =>
    new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n || 0);

const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat('es-BO', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }).format(d);

const KIND_META: Record<SupplierHistoryEvent['kind'], { icon: React.ElementType; label: string; color: string; sign: '+' | '-' }> = {
    PAGO_EFECTIVO: { icon: Banknote, label: 'Pago efectivo', color: 'text-emerald-600 dark:text-emerald-400', sign: '-' },
    PAGO_TRANSFER: { icon: Send, label: 'Transferencia', color: 'text-emerald-600 dark:text-emerald-400', sign: '-' },
    PAGO_QR: { icon: QrCode, label: 'Pago QR', color: 'text-emerald-600 dark:text-emerald-400', sign: '-' },
    COMPRA_CREDITO: { icon: FileText, label: 'Compra a crédito', color: 'text-rose-600 dark:text-rose-400', sign: '+' },
    COMPRA_EFECTIVO: { icon: Banknote, label: 'Compra efectivo', color: 'text-emerald-700 dark:text-emerald-300', sign: '-' },
    COMPRA_TRANSFER: { icon: Send, label: 'Compra transferencia', color: 'text-emerald-700 dark:text-emerald-300', sign: '-' },
    COMPRA_QR: { icon: QrCode, label: 'Compra QR', color: 'text-emerald-700 dark:text-emerald-300', sign: '-' },
    DEVOLUCION: { icon: Undo2, label: 'Devolución', color: 'text-amber-500 dark:text-amber-400', sign: '-' },
};

export default function SupplierHistorySection({ accounts, refreshKey = 0 }: Props) {
    const [open, setOpen] = useState(true);
    const [events, setEvents] = useState<SupplierHistoryEvent[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<SupplierHistoryEvent | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || accounts.length === 0) return;
        let cancel = false;
        // Patrón imperativo de fetch al expandir.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        Promise.all(accounts.map(a => SupplierPaymentHistoryService.getForAccount(a.id!, 30)))
            .then(results => {
                if (cancel) return;
                const flat = results.flat().sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 50);
                setEvents(flat);
            })
            .catch(() => { if (!cancel) setEvents([]); })
            .finally(() => { if (!cancel) setLoading(false); });
        return () => { cancel = true; };
    }, [open, accounts, refreshKey]);

    // Auto-abrir el historial cuando llega un refresh (ej. tras un pago).
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (refreshKey > 0) setOpen(true);
    }, [refreshKey]);

    if (accounts.length === 0) return null;

    return (
        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5/40 overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                        <History size={15} className="text-purple-500" />
                    </div>
                    <div className="text-left">
                        <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                            Historial de movimientos
                        </h4>
                        <p className="text-[10px] text-slate-400 font-bold">
                            Pagos, compras (crédito y contado) y devoluciones de todas las cuentas
                        </p>
                    </div>
                </div>
                {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </button>

            {open && (
                <div className="border-t border-slate-100 dark:border-white/10">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 size={20} className="animate-spin text-purple-500" />
                        </div>
                    ) : events.length === 0 ? (
                        <p className="text-center text-[11px] text-slate-400 py-10 font-bold">Sin movimientos registrados</p>
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-gray-800 max-h-96 overflow-auto custom-scrollbar">
                            {events.map(ev => {
                                const meta = KIND_META[ev.kind];
                                const Icon = meta.icon;
                                return (
                                    <li 
                                        key={`${ev.kind}-${ev.id}`} 
                                        className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                                        onClick={() => setSelectedEvent(ev)}
                                    >
                                        <div className={clsx(
                                            'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
                                            meta.sign === '+' ? 'bg-rose-500/10' : 'bg-emerald-500/10'
                                        )}>
                                            <Icon size={13} className={meta.color} strokeWidth={2.5} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                                                    {meta.label}
                                                </span>
                                                {ev.reference && (
                                                    <span className="text-[9px] font-mono text-slate-400 truncate">· {ev.reference}</span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-slate-500 truncate">
                                                {fmtDate(ev.date)}
                                                {ev.userLabel && <> · {ev.userLabel}</>}
                                            </p>
                                        </div>
                                        <span className={clsx('text-sm font-black tabular-nums shrink-0', meta.color)}>
                                            {meta.sign}{fmtBob(ev.amount)}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
            
            <TransactionDetailsModal
                isOpen={!!selectedEvent}
                onClose={() => setSelectedEvent(null)}
                event={selectedEvent}
            />
        </section>
    );
}
