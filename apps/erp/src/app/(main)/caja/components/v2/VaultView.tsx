/**
 * VaultView — vista del saldo y movimientos de la Bóveda de la sucursal actual.
 * Muestra saldo actual, historial de transferencias (caja↔bóveda) y permite
 * transferencias rápidas desde aquí.
 */
'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { Lock, ArrowLeftRight, RefreshCw, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { AccountService } from '@/services/AccountService';
import { JournalService } from '@/services/JournalService';
import type { Account, JournalEntry } from '@/types/treasury';
import { useBranch } from '@/contexts/BranchContext';

import { ensureDate } from '@/utils/dateHelpers';
import TransferModal from './TransferModal';
import clsx from 'clsx';

export default function VaultView() {
    const { currentBranch } = useBranch();

    const [vault, setVault] = useState<Account | null>(null);
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [transferOpen, setTransferOpen] = useState(false);

    const load = useCallback(async () => {
        if (!currentBranch?.id) return;
        setLoading(true);
        try {
            const accounts = await AccountService.list({ includeInactive: false, branchId: currentBranch.id });
            const vaultAcc = accounts.find(
                a => a.type === 'CASH_DRAWER' && a.cashDrawerPurpose === 'VAULT'
            );
            setVault(vaultAcc || null);

            if (vaultAcc?.id) {
                const journalEntries = await JournalService.list({ 
                    accountId: vaultAcc.id, 
                    branchId: currentBranch.id,
                    limit: 30 
                });
                setEntries(journalEntries);
            }
        } catch (e) {
            console.error('Error loading vault:', e);
        } finally {
            setLoading(false);
        }
    }, [currentBranch?.id]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return <div className="text-xs font-bold uppercase tracking-wider text-slate-400 italic py-12 text-center">Cargando bóveda…</div>;
    }

    if (!vault) {
        return (
            <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/40 p-12 text-center space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Bóveda no encontrada</div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 max-w-md mx-auto">
                    La bóveda se crea automáticamente con la sucursal. Si no aparece, recarga la página.
                </p>
            </div>
        );
    }

    const balance = vault.currentBalance || 0;

    return (
        <>
            <div className="space-y-4">
                {/* Header Bóveda */}
                <div className="rounded-2xl border border-violet-500/30 bg-linear-to-br from-violet-500/5 to-transparent p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1.5">
                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">Bóveda</div>
                        <div className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                            <Lock size={14} className="text-violet-600 dark:text-violet-400" />
                            {vault.name}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Resguardo de excedentes de efectivo
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setTransferOpen(true)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition shadow-sm">
                            <ArrowLeftRight size={12} /> Transferir
                        </button>
                        <button onClick={load}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-100 dark:hover:bg-white/5 active:scale-95 transition">
                            <RefreshCw size={12} />
                        </button>
                    </div>
                </div>

                {/* Saldo actual */}
                <div className="rounded-2xl border border-violet-500/20 bg-white dark:bg-[#111827]/60 p-6 text-center">
                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">Saldo actual en bóveda</div>
                    <div className={clsx(
                        'mt-2 text-3xl font-black tabular-nums tracking-tighter',
                        balance > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                    )}>
                        Bs. {balance.toFixed(2)}
                    </div>
                </div>

                {/* Historial de movimientos */}
                <div className="space-y-2">
                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        Últimos movimientos de la bóveda
                    </div>
                    {entries.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/40 p-8 text-center">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Sin movimientos registrados aún
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-white/5 text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
                                        <th className="text-left px-4 py-3">Fecha</th>
                                        <th className="text-left px-4 py-3">Descripción</th>
                                        <th className="text-right px-4 py-3">Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {entries.map(e => {
                                        const isCredit = e.direction === 'CREDIT';
                                        const date = ensureDate(e.createdAt);
                                        return (
                                            <tr key={e.id} className="border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition">
                                                <td className="px-4 py-3 tabular-nums text-slate-500 whitespace-nowrap">
                                                    {date?.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: '2-digit' }) || '—'}
                                                    <span className="ml-1.5 text-slate-400">{date?.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) || ''}</span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-bold">
                                                    {e.description || '—'}
                                                </td>
                                                <td className={clsx(
                                                    'px-4 py-3 text-right font-black tabular-nums whitespace-nowrap',
                                                    isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                                )}>
                                                    <span className="inline-flex items-center gap-1">
                                                        {isCredit ? <ArrowDownCircle size={11} /> : <ArrowUpCircle size={11} />}
                                                        {isCredit ? '+' : '-'} Bs. {e.amount.toFixed(2)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <TransferModal isOpen={transferOpen} onClose={() => setTransferOpen(false)} onTransferred={load} />
        </>
    );
}
