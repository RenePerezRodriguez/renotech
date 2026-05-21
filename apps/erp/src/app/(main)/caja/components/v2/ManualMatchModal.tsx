/**
 * ManualMatchModal — para una línea no matcheada de un batch, listar journal_entries
 * candidatos de la cuenta y permitir match manual.
 */
'use client';
import React, { useEffect, useState } from 'react';
import { X, Link2, Search } from 'lucide-react';
import { JournalService } from '@/services/JournalService';
import { BankReconciliationService } from '@/services/BankReconciliationService';
import { useAuth } from '@/contexts/AuthContext';
import type { BankStatementLine, JournalEntry } from '@/types/treasury';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/common/dialogs';
import clsx from 'clsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    batchId: string;
    lineIndex: number;
    line: BankStatementLine;
    accountId: string;
    onMatched?: () => void;
}

const fmtBob = (n: number) => new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n);

export default function ManualMatchModal({ isOpen, onClose, batchId, lineIndex, line, accountId, onMatched }: Props) {
    const { user, userName } = useAuth();
    const [candidates, setCandidates] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [matchingId, setMatchingId] = useState<string | null>(null);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        JournalService.list({ accountId, limit: 200 })
            .then(entries => {
                // Solo PENDING, misma dirección
                const lineDir = line.direction;
                setCandidates(entries.filter(e =>
                    e.reconciliationStatus === 'PENDING' &&
                    e.direction === lineDir &&
                    !e.reversesEntryId &&
                    !e.reversedByEntryId
                ));
            })
            .catch(e => toast.error('Error: ' + (e as Error).message))
            .finally(() => setLoading(false));
    }, [isOpen, accountId, line.direction]);

    if (!isOpen) return null;

    const filtered = candidates.filter(c => {
        if (!filter) return true;
        const q = filter.toLowerCase();
        return c.description?.toLowerCase().includes(q)
            || c.bankRef?.toLowerCase().includes(q)
            || String(c.amount).includes(q);
    });

    const handleMatch = async (entry: JournalEntry) => {
        if (!user) return;
        if (Math.abs(entry.amount - line.amount) > 0.01) {
            const ok = await confirmDialog({
                title: 'Conciliar con diferencia',
                message: `El monto del asiento (${fmtBob(entry.amount)}) no coincide con la línea (${fmtBob(line.amount)}). ¿Vincular de todos modos?`,
                variant: 'warning',
                confirmText: 'Vincular',
            });
            if (!ok) return;
        }
        setMatchingId(entry.id!);
        try {
            await BankReconciliationService.manualMatch(batchId, lineIndex, entry.id!,
                { uid: user.uid, name: userName || user.email || 'Gerente' });
            toast.success('Movimiento vinculado correctamente');
            onMatched?.();
            onClose();
        } catch (e) {
            toast.error('Error: ' + (e as Error).message);
        } finally {
            setMatchingId(null);
        }
    };

    const lineDate = line.date instanceof Date ? line.date : new Date(line.date);

    return (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/60 dark:bg-black/80 p-4">
            <div className="bg-white dark:bg-[#020617] w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/10 bg-slate-900 dark:bg-[#111827]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-yellow-500 flex items-center justify-center text-black">
                            <Link2 size={18} />
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Vincular manualmente</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/70 transition"><X size={16} /></button>
                </div>

                <div className="p-5 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#111827]/40">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 font-black mb-2">Movimiento del banco</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                        <div><span className="text-slate-400 text-[9px] font-black uppercase tracking-wider block">Fecha</span> <span className="tabular-nums font-bold text-slate-900 dark:text-white">{lineDate.toLocaleDateString('es-BO')}</span></div>
                        <div><span className="text-slate-400 text-[9px] font-black uppercase tracking-wider block">Monto</span> <span className="font-black tabular-nums tracking-tighter text-slate-900 dark:text-white">{fmtBob(line.amount)}</span></div>
                        <div><span className="text-slate-400 text-[9px] font-black uppercase tracking-wider block">Dir</span> <span className={clsx('font-black uppercase tracking-wider', line.direction === 'DEBIT' ? 'text-emerald-600' : 'text-rose-600')}>{line.direction}</span></div>
                        <div><span className="text-slate-400 text-[9px] font-black uppercase tracking-wider block">Ref</span> <span className="tabular-nums text-[10px] font-bold text-slate-700 dark:text-slate-300">{line.bankRef}</span></div>
                    </div>
                    <p className="text-[10px] mt-2 text-slate-500 dark:text-slate-400 italic">{line.description}</p>
                </div>

                <div className="p-4 border-b border-slate-200 dark:border-white/10">
                    <div className="relative">
                        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={filter} onChange={e => setFilter(e.target.value)}
                            placeholder="Filtrar por monto, descripción o ref…"
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs font-bold outline-none focus:border-yellow-500 transition" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="text-center text-xs font-bold uppercase tracking-wider text-slate-400 italic py-12">Cargando candidatos…</div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center text-xs font-bold uppercase tracking-wider text-slate-500 italic py-12">
                            No hay operaciones registradas en el sistema con dirección {line.direction} en esta cuenta.
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {filtered.map(c => {
                                const cd = c.date as unknown;
                                const cDate = cd instanceof Date
                                    ? cd
                                    : (typeof cd === 'object' && cd !== null && typeof (cd as { toDate?: () => Date }).toDate === 'function')
                                        ? (cd as { toDate: () => Date }).toDate()
                                        : new Date(cd as string);
                                const amountClose = Math.abs(c.amount - line.amount) <= 0.01;
                                return (
                                    <li key={c.id}
                                        className={clsx('flex items-center justify-between gap-3 p-3 rounded-xl border bg-white dark:bg-white/5 transition',
                                            amountClose ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-200 dark:border-white/10 hover:border-slate-300'
                                        )}>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 text-[11px]">
                                                <span className="tabular-nums text-[10px] font-bold text-slate-500">{cDate.toLocaleDateString('es-BO')}</span>
                                                <span className="font-black tabular-nums tracking-tighter text-slate-900 dark:text-white">{fmtBob(c.amount)}</span>
                                                {amountClose && <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600">≈ Posible vínculo</span>}
                                            </div>
                                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-1">{c.description}</div>
                                            {c.bankRef && <div className="text-[10px] tabular-nums font-bold text-slate-400">Ref: {c.bankRef}</div>}
                                        </div>
                                        <button onClick={() => handleMatch(c)} disabled={matchingId === c.id}
                                            className="px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase tracking-[0.15em] active:scale-95 transition disabled:opacity-50 whitespace-nowrap shadow-sm">
                                            {matchingId === c.id ? '…' : 'Vincular'}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
