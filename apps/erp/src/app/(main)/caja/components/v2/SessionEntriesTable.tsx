/**
 * SessionEntriesTable — lista los journal_entries de una sesión.
 * Muestra dirección, monto, método, categoría, descripción, hora.
 */
'use client';
import React, { useEffect, useState } from 'react';
import { JournalService } from '@/services/JournalService';
import type { JournalEntry } from '@/types/treasury';
import { ensureDate } from '@/utils/dateHelpers';
import { ArrowDownCircle, ArrowUpCircle, Banknote, QrCode, Building2, RotateCcw } from 'lucide-react';
import clsx from 'clsx';

interface Props {
    sessionId: string;
    branchId?: string;
    windowFrom?: Date;
    windowTo?: Date;
    refreshKey?: number;
    onReverse?: (entry: JournalEntry) => void;
    canReverse?: boolean;
}

export default function SessionEntriesTable({ sessionId, branchId, windowFrom, windowTo, refreshKey, onReverse, canReverse }: Props) {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        // Patr\u00f3n imperativo de data-fetching: marcamos loading al disparar el request.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        const cashP = JournalService.list({ sessionId, branchId, limit: 200 });
        const digitalP = branchId && windowFrom
            ? JournalService.list({ branchId, from: windowFrom, to: windowTo, limit: 500 })
                .then(list => list.filter(e => e.paymentMethod !== 'EFECTIVO'))
            : Promise.resolve([] as JournalEntry[]);
        Promise.all([cashP, digitalP])
            .then(([cash, digital]) => {
                if (!alive) return;
                const merged = [...cash, ...digital]
                    .filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i)
                    .sort((a, b) => {
                        const da = ensureDate(a.date).getTime();
                        const dbt = ensureDate(b.date).getTime();
                        return dbt - da;
                    });
                setEntries(merged);
            })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [sessionId, branchId, windowFrom, windowTo, refreshKey]);

    if (loading) {
        return <div className="text-xs italic font-bold uppercase tracking-wider text-slate-400 py-8 text-center">Cargando movimientos…</div>;
    }
    if (entries.length === 0) {
        return <div className="text-xs italic font-bold uppercase tracking-wider text-slate-400 py-8 text-center">Sin movimientos en esta sesión todavía</div>;
    }

    return (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60">
            <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-[#111827]">
                    <tr className="text-left text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        <th className="px-4 py-3">Hora</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Método</th>
                        <th className="px-4 py-3">Categoría</th>
                        <th className="px-4 py-3">Descripción</th>
                        <th className="px-4 py-3 text-right">Monto</th>
                        {canReverse && <th className="px-4 py-3"></th>}
                    </tr>
                </thead>
                <tbody>
                    {entries.map(e => {
                        const isReversed = !!e.reversedByEntryId || !!e.voidedAt;
                        const isReversal = !!e.reversesEntryId;
                        return (
                            <tr key={e.id} className={clsx(
                                'border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition',
                                isReversed && 'opacity-50 line-through'
                            )}>
                                <td className="px-4 py-3 tabular-nums text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                    {(e.date as Date)?.toLocaleTimeString?.('es-BO', { hour: '2-digit', minute: '2-digit' }) || '—'}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={clsx('inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider', e.direction === 'DEBIT' ? 'text-emerald-600' : 'text-red-600')}>
                                        {e.direction === 'DEBIT' ? <ArrowDownCircle size={12} /> : <ArrowUpCircle size={12} />}
                                        {e.direction === 'DEBIT' ? 'Ingreso' : 'Egreso'}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        {e.paymentMethod === 'EFECTIVO' && <Banknote size={12} />}
                                        {e.paymentMethod === 'QR' && <QrCode size={12} />}
                                        {e.paymentMethod === 'TRANSFERENCIA' && <Building2 size={12} />}
                                        {e.paymentMethod}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
                                    {e.category}
                                </td>
                                <td className="px-4 py-3 max-w-130 text-slate-700 dark:text-slate-300 wrap-break-word" title={e.description}>
                                    {isReversal && <span className="text-orange-600 mr-1 font-black uppercase tracking-wider text-[9px]">[REVERSO]</span>}
                                    {e.description}
                                </td>
                                <td className={clsx(
                                    'px-4 py-3 font-black tabular-nums tracking-tighter text-right',
                                    e.direction === 'DEBIT' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                                )}>
                                    {e.direction === 'DEBIT' ? '+' : '-'}{e.amount.toFixed(2)}
                                </td>
                                {canReverse && (
                                    <td className="px-3 py-3">
                                        {!isReversed && !isReversal && onReverse && (
                                            <button
                                                onClick={() => onReverse(e)}
                                                className="text-orange-600 hover:bg-orange-500/10 p-2 rounded-xl transition active:scale-95"
                                                title="Reversar"
                                            >
                                                <RotateCcw size={12} />
                                            </button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
