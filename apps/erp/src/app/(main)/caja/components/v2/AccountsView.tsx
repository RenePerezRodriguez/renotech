/**
 * AccountsView — gestión de cuentas (Tesorería).
 * GERENTE: ver, crear, editar, desactivar.
 */
'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { Wallet, Building2, Smartphone, Plus, Edit3, PowerOff, ShieldOff, ShieldCheck, ListTree } from 'lucide-react';
import { AccountService } from '@/services/AccountService';
import type { Account, AccountType } from '@/types/treasury';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import AccountFormModal from './AccountFormModal';
import AccountStatementModal from './AccountStatementModal';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/common/dialogs';
import clsx from 'clsx';

const TYPE_META: Record<AccountType, { icon: React.ReactNode; color: string; label: string }> = {
    CASH_DRAWER: { icon: <Wallet size={14} />, color: 'amber', label: 'Cajón' },
    BANK: { icon: <Building2 size={14} />, color: 'cyan', label: 'Banco' },
    WALLET: { icon: <Smartphone size={14} />, color: 'violet', label: 'Wallet' },
};

interface AccountsViewProps {
    hideCashDrawers?: boolean;
}

export default function AccountsView({ hideCashDrawers }: AccountsViewProps = {}) {
    const { user, role } = useAuth();
    const { branches, currentBranch, isConsolidatedView, isHQ } = useBranch();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInactive, setShowInactive] = useState(false);
    const [filterType, setFilterType] = useState<AccountType | 'ALL'>('ALL');
    const [viewMode, setViewMode] = useState<'DIRECTORY' | 'LIST'>('DIRECTORY');
    const [filterBranch, setFilterBranch] = useState<string | 'ALL' | 'GLOBAL'>('ALL');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Account | null>(null);
    const [statementAccount, setStatementAccount] = useState<Account | null>(null);

    const branchName = useCallback((id?: string | null) => {
        if (!id) return '—';
        return branches.find(b => b.id === id)?.name || id.slice(0, 8);
    }, [branches]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            // Sucursales no-HQ solo pueden ver sus propias cuentas — ignora filterBranch
            const effectiveBranchId = (!isConsolidatedView && !isHQ && currentBranch?.id)
                ? currentBranch.id
                : (filterBranch === 'ALL' ? undefined : (filterBranch === 'GLOBAL' ? null : filterBranch));

            const list = await AccountService.list({
                includeInactive: showInactive,
                type: filterType === 'ALL' ? undefined : filterType,
                branchId: effectiveBranchId,
            });
            let filteredList = list;
            if (hideCashDrawers) {
                filteredList = list.filter(a => a.type !== 'CASH_DRAWER');
            }
            setAccounts(filteredList);
        } catch (e) {
            toast.error('Error: ' + (e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [showInactive, filterType, filterBranch, hideCashDrawers, isConsolidatedView, isHQ, currentBranch?.id]);

    useEffect(() => { load(); }, [load]);

    // HQ/consolidado: directorio completo. Sucursales: van directo a su lista filtrada.
    useEffect(() => {
        if (!isConsolidatedView && !isHQ && currentBranch?.id) {
            setFilterBranch(currentBranch.id);
            setViewMode('LIST');
        } else {
            setFilterBranch('ALL');
            setViewMode('DIRECTORY');
        }
    }, [isConsolidatedView, isHQ, currentBranch]);

    const handleDeactivate = async (acc: Account) => {
        if (!user) return;
        const ok = await confirmDialog({
            title: 'Desactivar cuenta',
            message: `Desactivar la cuenta "${acc.name}". Su saldo debe ser 0.`,
            variant: 'warning',
            confirmText: 'Desactivar',
        });
        if (!ok) return;
        try {
            await AccountService.deactivate(acc.id!, user.uid);
            toast.success('Cuenta desactivada');
            load();
        } catch (e) {
            toast.error((e as Error).message);
        }
    };

    return (
        <div data-tour="tesoreria-accounts" className="space-y-4">
            {viewMode === 'DIRECTORY' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <div onClick={() => { setFilterBranch('ALL'); setViewMode('LIST'); }}
                        className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60 p-5 hover:border-blue-400 dark:hover:border-yellow-500/50 cursor-pointer transition shadow-sm hover:shadow-md group flex flex-col items-center justify-center text-center">
                        <ListTree className="mb-3 text-blue-500 dark:text-yellow-500 group-hover:scale-110 transition-transform" size={28} />
                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">Todas las cuentas</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">Ver todas sin agrupar</p>
                    </div>
                    {branches.map(b => (
                        <div key={b.id} onClick={() => { setFilterBranch(b.id!); setViewMode('LIST'); }}
                            className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60 p-5 hover:border-blue-400 dark:hover:border-yellow-500/50 cursor-pointer transition shadow-sm hover:shadow-md group flex flex-col items-center justify-center text-center">
                            <Building2 className="mb-3 text-slate-400 dark:text-slate-500 group-hover:text-blue-500 dark:group-hover:text-yellow-500 group-hover:scale-110 transition-all" size={28} />
                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">{b.name}</h3>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">{b.code || 'Sucursal'}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            {role === 'GERENTE' && (isConsolidatedView || isHQ) && (
                                <button onClick={() => setViewMode('DIRECTORY')}
                                    className="mr-2 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/10 transition active:scale-95">
                                    ← Directorio
                                </button>
                            )}
                            {(hideCashDrawers 
                                ? (['ALL', 'BANK', 'WALLET'] as const) 
                                : (['ALL', 'CASH_DRAWER', 'BANK', 'WALLET'] as const)
                            ).map(t => (
                                <button key={t} onClick={() => setFilterType(t)}
                                    className={clsx(
                                        'rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 border',
                                        filterType === t
                                            ? 'bg-blue-500/10 dark:bg-yellow-500/10 text-blue-600 dark:text-yellow-500 border-blue-500/30 dark:border-yellow-500/30'
                                            : 'bg-white dark:bg-white/5 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                                    )}>
                                    {t === 'ALL' ? 'Todas' : TYPE_META[t].label}
                                </button>
                            ))}
                            {role === 'GERENTE' && (isConsolidatedView || isHQ) && (
                                <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}
                                    className="ml-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] outline-none focus:border-yellow-500 transition max-w-[150px] truncate">
                                    <option value="ALL">Todas las sucursales</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            )}
                            <label className="ml-2 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer text-slate-500">
                                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-blue-600 dark:accent-yellow-500" />
                                <span>Mostrar inactivas</span>
                            </label>
                        </div>
                        {role === 'GERENTE' ? (
                            <button onClick={() => { setEditing(null); setModalOpen(true); }}
                                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 shadow-sm self-start sm:self-auto">
                                <Plus size={12} strokeWidth={3} /> Nueva cuenta bancaria / wallet
                            </button>
                        ) : (
                            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                                Solo GERENTE puede crear cuentas
                            </div>
                        )}
                    </div>

            {loading ? (
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 italic py-12 text-center">Cargando…</div>
            ) : accounts.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 p-12 text-center bg-white dark:bg-[#111827]/40">
                    <Wallet size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">No hay cuentas. Crea la primera.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {accounts.map(acc => {
                        const meta = TYPE_META[acc.type];
                        return (
                            <div key={acc.id} onClick={() => setStatementAccount(acc)} className={clsx(
                                'rounded-2xl border p-5 space-y-4 bg-white dark:bg-[#111827]/60 transition-all hover:shadow-md cursor-pointer hover:border-blue-400 dark:hover:border-yellow-500/50',
                                acc.isActive ? 'border-slate-200 dark:border-white/10' : 'border-red-500/30 opacity-60'
                            )}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="space-y-1.5 min-w-0">
                                        <div className={clsx('inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-xl',
                                            meta.color === 'amber' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                                            meta.color === 'cyan' && 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
                                            meta.color === 'violet' && 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
                                        )}>
                                            {meta.icon} {meta.label}
                                        </div>
                                        <h3 className="text-xs font-bold uppercase text-slate-900 dark:text-white truncate">{acc.name}</h3>
                                        {acc.type === 'CASH_DRAWER' && (
                                            <div className="space-y-1">
                                                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{branchName(acc.branchId)}</div>
                                                <div className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10">
                                                    {acc.cashDrawerPurpose === 'VAULT' ? 'Bóveda / Caja fuerte' : 'POS'}
                                                </div>
                                            </div>
                                        )}
                                        {acc.type !== 'CASH_DRAWER' && acc.branchIds && acc.branchIds.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {acc.branchIds.map(id => (
                                                    <span key={id} className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-400 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/10 truncate max-w-[100px]">
                                                        {branchName(id)}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {(acc.type === 'BANK' || acc.type === 'WALLET') && acc.bankName && (
                                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 truncate">
                                                {acc.bankName}{acc.accountNumber ? ` · ${acc.accountNumber}` : ''}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        {acc.isActive
                                            ? <ShieldCheck size={14} className="text-emerald-500" />
                                            : <ShieldOff size={14} className="text-red-500" />}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                                        {acc.type === 'CASH_DRAWER' ? 'Saldo actual' : 'Registrado en sistema'}
                                    </div>
                                    <div className={clsx('font-black text-2xl tracking-tighter tabular-nums',
                                        (acc.currentBalance || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                                            (acc.currentBalance || 0) < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
                                    )}>
                                        Bs. {(acc.currentBalance || 0).toFixed(2)}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 flex-wrap">
                                    {(acc.acceptsPaymentMethods || []).map(m => (
                                        <span key={m} className="text-[8px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10">
                                            {m}
                                        </span>
                                    ))}
                                </div>

                                <div className="flex items-center gap-3 pt-3 border-t border-slate-100 dark:border-white/10">
                                    <button onClick={(e) => { e.stopPropagation(); setStatementAccount(acc); }}
                                        className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 hover:opacity-80 transition">
                                        <ListTree size={10} /> Estado
                                    </button>
                                    {role === 'GERENTE' ? (
                                        <>
                                            <button onClick={(e) => { e.stopPropagation(); setEditing(acc); setModalOpen(true); }}
                                                className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-yellow-500 hover:opacity-80 transition">
                                                <Edit3 size={10} /> Editar
                                            </button>
                                            {acc.isActive && (
                                                <button onClick={(e) => { e.stopPropagation(); handleDeactivate(acc); }}
                                                    className="ml-auto inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-red-600 hover:opacity-80 transition">
                                                    <PowerOff size={10} /> Desactivar
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <div className="ml-auto text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Solo GERENTE puede editar</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            </>
            )}

            <AccountFormModal isOpen={modalOpen} onClose={() => setModalOpen(false)}
                onSaved={load} editing={editing} />
            <AccountStatementModal isOpen={!!statementAccount} onClose={() => setStatementAccount(null)}
                account={statementAccount} />
        </div>
    );
}
