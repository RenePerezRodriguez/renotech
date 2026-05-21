/**
 * TransferModal — transferencia atómica entre dos cuentas usando Cloud Function.
 */
'use client';
import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, ArrowDown, AlertTriangle } from 'lucide-react';
import IndustrialModal from '@/components/common/IndustrialModal';
import { AccountService } from '@/services/AccountService';
import { TreasuryConfigService } from '@/services/TreasuryConfigService';
import type { Account } from '@/types/treasury';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/lib/firebase';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onTransferred: () => void;
}

const ACCOUNT_LABEL: Record<string, string> = {
    CASH_DRAWER: 'Cajón',
    BANK: 'Banco',
    WALLET: 'Wallet',
};

const ACCOUNT_GROUP_LABEL: Record<string, string> = {
    'CASH_DRAWER_POS': 'Cajón · POS',
    'CASH_DRAWER_VAULT': 'Cajón · Bóveda',
    'BANK': 'Banco',
    'WALLET': 'Wallet',
};

const ACCOUNT_TYPE_ORDER: Record<string, number> = {
    CASH_DRAWER_POS: 0,
    CASH_DRAWER_VAULT: 1,
    BANK: 2,
    WALLET: 3,
};

const getDrawerPurpose = (account: Account): 'POS' | 'VAULT' => {
    if (account.cashDrawerPurpose) return account.cashDrawerPurpose;
    const lower = account.name?.toLowerCase() || '';
    return lower.includes('boveda') || lower.includes('vault') ? 'VAULT' : 'POS';
};

export default function TransferModal({ isOpen, onClose, onTransferred }: Props) {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [fromId, setFromId] = useState('');
    const [toId, setToId] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [bankRef, setBankRef] = useState('');
    const [requireBankRef, setRequireBankRef] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const { role } = useAuth();
    const { currentBranch } = useBranch();
    const isGerente = role === 'GERENTE';

    useEffect(() => {
        if (!isOpen) return;
        
        const branchFilter = (!isGerente && !currentBranch) 
            ? 'INVALID_BRANCH' 
            : (isGerente && !currentBranch ? undefined : currentBranch?.id);

        AccountService.list({ includeInactive: false, branchId: branchFilter }).then(list => {
            const typeOrder: Record<string, number> = { CASH_DRAWER: 0, BANK: 1, WALLET: 2 };
            const sorted = [...list].sort((a, b) => {
                const typeDiff = typeOrder[a.type] - typeOrder[b.type];
                if (typeDiff !== 0) return typeDiff;
                if (a.type === 'CASH_DRAWER' && b.type === 'CASH_DRAWER') {
                    const aVault = a.cashDrawerPurpose === 'VAULT' ? 1 : 0;
                    const bVault = b.cashDrawerPurpose === 'VAULT' ? 1 : 0;
                    if (aVault !== bVault) return aVault - bVault;
                }
                return a.name.localeCompare(b.name);
            });
            setAccounts(sorted);
        });
        TreasuryConfigService.get().then(cfg => setRequireBankRef(!!cfg.requireBankRefForDigital));
        setFromId(''); setToId(''); setAmount(''); setDescription(''); setBankRef('');
    }, [isOpen]);

    const fromAccount = accounts.find(a => a.id === fromId);
    const toAccount = accounts.find(a => a.id === toId);
    const amountNum = parseFloat(amount) || 0;
    const involvesNonCash = (fromAccount && fromAccount.type !== 'CASH_DRAWER') || (toAccount && toAccount.type !== 'CASH_DRAWER');
    const missingBankRef = !!involvesNonCash && requireBankRef && bankRef.trim().length === 0;
    const involvesVault = (fromAccount?.type === 'CASH_DRAWER' && getDrawerPurpose(fromAccount) === 'VAULT')
        || (toAccount?.type === 'CASH_DRAWER' && getDrawerPurpose(toAccount) === 'VAULT');

    const canSubmit = fromId && toId && fromId !== toId && amountNum > 0 && description.trim().length >= 5 && !submitting && !missingBankRef;

    const submit = async () => {
        if (!canSubmit || !fromAccount) return;
        if (fromAccount.type === 'CASH_DRAWER' && (fromAccount.currentBalance || 0) < amountNum) {
            toast.error('Saldo insuficiente en la cuenta origen');
            return;
        }
        setSubmitting(true);
        try {
            // La Cloud Function `transferAtomic` resuelve y valida server-side las sesiones
            // OPEN de origen/destino cuando son CASH_DRAWER (admin SDK bypassa rules \u2192
            // soporta cross-branch). Si no encuentra exactamente 1 sesi\u00f3n OPEN devuelve error.
            const fn = httpsCallable(getFunctions(app, 'us-central1'), 'transferAtomic');
            await fn({
                fromAccountId: fromId,
                toAccountId: toId,
                amount: amountNum,
                description: description.trim(),
                bankRef: bankRef.trim() || undefined,
            });
            toast.success('Transferencia realizada');
            window.dispatchEvent(new Event('cash-shift-changed'));
            onTransferred();
            onClose();
        } catch (e) {
            const err = e as { message?: string; details?: { message?: string } };
            toast.error(err?.details?.message || err?.message || 'Error en transferencia');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <IndustrialModal
            isOpen={isOpen} onClose={onClose}
            title="Nueva transferencia"
            subtitle="Tesorería"
            theme="stealth"
            icon={<ArrowLeftRight size={18} strokeWidth={2.5} />}
            maxWidth="max-w-xl"
            footer={
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition active:scale-95">
                        Cancelar
                    </button>
                    <button onClick={submit} disabled={!canSubmit}
                        className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
                        {submitting ? 'Procesando…' : 'Transferir'}
                    </button>
                </div>
            }
        >
            <div className="space-y-5">
                <AccountPicker label="Origen" accounts={accounts} value={fromId} onChange={setFromId} excludeId={toId} />

                <div className="flex justify-center">
                    <div className="w-9 h-9 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                        <ArrowDown size={16} className="text-yellow-600 dark:text-yellow-500" />
                    </div>
                </div>

                <AccountPicker label="Destino" accounts={accounts} value={toId} onChange={setToId} excludeId={fromId} />

                <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Monto</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-wider text-slate-400">Bs.</span>
                        <input type="number" inputMode="decimal" min={0} step="0.01" value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-lg font-black tabular-nums tracking-tighter outline-none focus:border-yellow-500 transition" />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Descripción</label>
                    <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200}
                        placeholder="Ej. Depósito de caja a banco BNB"
                        className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-yellow-500 transition" />
                </div>

                {involvesNonCash && (
                    <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{requireBankRef ? 'Referencia bancaria (obligatorio)' : 'Referencia bancaria (opcional)'}</label>
                        <input type="text" value={bankRef} onChange={(e) => setBankRef(e.target.value)} maxLength={80}
                            placeholder="Nº de operación / comprobante"
                            className={clsx('w-full rounded-xl border bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none transition',
                                missingBankRef ? 'border-red-500 focus:border-red-500' : 'border-slate-200 dark:border-white/10 focus:border-yellow-500'
                            )} />
                        {missingBankRef && (
                            <div className="text-[10px] font-bold text-red-600 flex items-center gap-1 uppercase tracking-wider">
                                <AlertTriangle size={12} /> Referencia bancaria obligatoria según configuración
                            </div>
                        )}
                    </div>
                )}

                {involvesVault && (
                    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3 text-sm text-slate-600 dark:text-slate-300">
                        La bóveda no necesita sesión OPEN para recibir o enviar fondos. Solo las cajas POS requieren sesión abierta.
                    </div>
                )}
            </div>
        </IndustrialModal>
    );
}

function AccountPicker({ label, accounts, value, onChange, excludeId }:
    { label: string; accounts: Account[]; value: string; onChange: (id: string) => void; excludeId?: string }) {
    const filtered = accounts.filter(a => a.id !== excludeId);
    const selected = accounts.find(a => a.id === value);
    const groups = filtered.reduce((acc, account) => {
        const key = account.type === 'CASH_DRAWER'
            ? (getDrawerPurpose(account) === 'VAULT' ? 'CASH_DRAWER_VAULT' : 'CASH_DRAWER_POS')
            : account.type;
        acc[key] = acc[key] || [];
        acc[key].push(account);
        return acc;
    }, {} as Record<string, Account[]>);

    return (
        <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{label}</label>
            <select value={value} onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-yellow-500 transition">
                <option value="">— Seleccionar cuenta —</option>
                {Object.keys(groups)
                    .sort((a, b) => ACCOUNT_TYPE_ORDER[a] - ACCOUNT_TYPE_ORDER[b])
                    .map(groupKey => (
                        <optgroup key={groupKey} label={ACCOUNT_GROUP_LABEL[groupKey]}>
                            {groups[groupKey].map(a => (
                                <option key={a.id} value={a.id!}>
                                    {a.name} — Bs. {(a.currentBalance || 0).toFixed(2)}
                                </option>
                            ))}
                        </optgroup>
                    ))}
            </select>
            {selected && (
                <div className={clsx('text-[10px] font-bold tabular-nums uppercase tracking-wider',
                    (selected.currentBalance || 0) > 0 ? 'text-emerald-600' : 'text-slate-400'
                )}>
                    Saldo actual: Bs. {(selected.currentBalance || 0).toFixed(2)}
                </div>
            )}
        </div>
    );
}
