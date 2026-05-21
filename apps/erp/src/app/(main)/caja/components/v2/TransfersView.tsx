/**
 * TransfersView — historial de transferencias entre cuentas + acción nueva.
 */
'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeftRight, Plus, ArrowRight } from 'lucide-react';
import { JournalService } from '@/services/JournalService';
import { AccountService } from '@/services/AccountService';
import type { Account } from '@/types/treasury';
import TransferModal from './TransferModal';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';

interface TransferRow {
    id: string;
    date: Date | null;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    description: string;
    bankRef?: string;
    creator: string;
    voided?: boolean;
}

export default function TransfersView() {
    const [transfers, setTransfers] = useState<TransferRow[]>([]);
    const [accountsMap, setAccountsMap] = useState<Map<string, Account>>(new Map());
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const { role } = useAuth();
    const { currentBranch } = useBranch();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [accs, entries] = await Promise.all([
                AccountService.list({ includeInactive: true }),
                JournalService.list({ 
                    referenceType: 'CASH_TRANSFER', 
                    limit: 200,
                    ...(role !== 'GERENTE' && currentBranch?.id ? { branchId: currentBranch.id } : {})
                }),
            ]);
            const map = new Map(accs.map(a => [a.id!, a]));
            setAccountsMap(map);

            // Agrupar por relatedEntryId / referenceId. Tomar sólo CREDIT (origen) para evitar duplicados.
            const credits = entries.filter(e => e.direction === 'CREDIT' && !e.reversesEntryId);
            const rows: TransferRow[] = credits.map(c => {
                const debit = entries.find(d => d.id === c.relatedEntryId)
                    || entries.find(d => d.relatedEntryId === c.id && d.direction === 'DEBIT');
                return {
                    id: c.id!,
                    date: c.date as Date | null,
                    fromAccountId: c.accountId,
                    toAccountId: debit?.accountId || '?',
                    amount: c.amount,
                    description: c.description,
                    bankRef: c.bankRef,
                    creator: c.userName || c.userId || '—',
                    voided: !!c.reversedByEntryId,
                };
            });
            setTransfers(rows);
        } catch (e) {
            toast.error('Error: ' + (e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const accName = (id: string) => accountsMap.get(id)?.name || `#${id.slice(0, 8)}`;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Últimas {transfers.length} transferencias entre cuentas
                </div>
                <button onClick={() => setShowModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-yellow-500 text-black text-[10px] font-black uppercase tracking-[0.2em] hover:bg-yellow-400 active:scale-95 transition shadow-sm">
                    <Plus size={12} /> Nueva transferencia
                </button>
            </div>

            {loading ? (
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 italic py-12 text-center">Cargando…</div>
            ) : transfers.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 p-12 text-center bg-white dark:bg-[#111827]/40">
                    <ArrowLeftRight size={28} className="mx-auto text-slate-400 mb-3" />
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">No hay transferencias registradas.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60">
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-[#111827]">
                            <tr className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                                <th className="text-left px-4 py-3">Fecha</th>
                                <th className="text-left px-4 py-3">Origen → Destino</th>
                                <th className="text-left px-4 py-3">Descripción</th>
                                <th className="text-left px-4 py-3">Ref</th>
                                <th className="text-left px-4 py-3">Por</th>
                                <th className="text-right px-4 py-3">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transfers.map(t => (
                                <tr key={t.id} className={clsx('border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition',
                                    t.voided && 'line-through opacity-50'
                                )}>
                                    <td className="px-4 py-3 tabular-nums text-[10px] font-bold text-slate-500 whitespace-nowrap">
                                        {t.date ? t.date.toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-bold text-slate-900 dark:text-white">{accName(t.fromAccountId)}</span>
                                            <ArrowRight size={11} className="text-slate-400" />
                                            <span className="font-black text-blue-600 dark:text-yellow-500">{accName(t.toAccountId)}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 truncate max-w-xs text-slate-700 dark:text-slate-300">{t.description}</td>
                                    <td className="px-4 py-3 tabular-nums text-[10px] font-bold text-slate-500">{t.bankRef || '—'}</td>
                                    <td className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400">{t.creator}</td>
                                    <td className="px-4 py-3 text-right tabular-nums font-black tracking-tighter text-slate-900 dark:text-white">
                                        Bs. {t.amount.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <TransferModal isOpen={showModal} onClose={() => setShowModal(false)} onTransferred={load} />
        </div>
    );
}
