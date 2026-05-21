'use client';
import React, { useEffect, useState } from 'react';
import { Settings, Save, Building2 } from 'lucide-react';
import { AccountService } from '@/services/AccountService';
import { BranchService } from '@/services/BranchService';
import type { Account } from '@/types/treasury';
import { useBranch } from '@/contexts/BranchContext';
import { toast } from 'sonner';

export default function CajaSettingsView() {
    const { currentBranch, refreshBranches } = useBranch();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Local state for the settings
    const [defaultAccounts, setDefaultAccounts] = useState<{ QR?: string | null; TRANSFERENCIA?: string | null }>({});

    useEffect(() => {
        if (!currentBranch) return;
        setLoading(true);
        AccountService.list({ branchId: currentBranch.id, includeInactive: false })
            .then(a => {
                setAccounts(a);
                // Initialize local state from currentBranch
                setDefaultAccounts(currentBranch.config?.defaultAccounts || {});
            })
            .catch(e => toast.error('Error cargando cuentas: ' + (e as Error).message))
            .finally(() => setLoading(false));
    }, [currentBranch]);

    const updateDefault = (m: 'QR' | 'TRANSFERENCIA', accountId: string | null) => {
        setDefaultAccounts(prev => ({ ...prev, [m]: accountId }));
    };

    const save = async () => {
        if (!currentBranch?.id) return;
        setSaving(true);
        try {
            // Solo guardamos los IDs (bankAccountId / walletAccountId).
            // Los datos del recibo (bankName, accountNumber, qrImageUrl, etc.)
            // se resuelven en VIVO desde /accounts/{id} en ConfigService.getConfig,
            // así editar la cuenta en Tesorería se refleja al instante en los
            // recibos sin necesidad de re-guardar esta vista.
            const updatedConfig = {
                ...(currentBranch.config || { canReceiveTransfers: true, canRequestTransfers: true }),
                defaultAccounts,
                receiptDetails: {
                    ...(currentBranch.config?.receiptDetails || {}),
                    bankAccountId: defaultAccounts['TRANSFERENCIA'] || null,
                    walletAccountId: defaultAccounts['QR'] || null,
                }
            };

            await BranchService.update(currentBranch.id, { config: updatedConfig });
            await refreshBranches();
            toast.success('Ajustes guardados — los datos bancarios se leerán siempre de la cuenta seleccionada');
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    if (!currentBranch) {
        return <div className="text-xs font-bold uppercase tracking-wider text-slate-400 italic py-12 text-center">Selecciona una sucursal</div>;
    }

    if (loading) {
        return <div className="text-xs font-bold uppercase tracking-wider text-slate-400 italic py-12 text-center">Cargando ajustes…</div>;
    }

    return (
        <div className="max-w-3xl space-y-5 py-4">
            <div className="flex items-center gap-3 px-1 pb-2">
                <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-white/10 flex items-center justify-center shadow-sm">
                    <Building2 size={20} className="text-white" />
                </div>
                <div>
                    <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-1">
                        Ajustes de Sucursal
                    </h2>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        {currentBranch.name}
                    </p>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60 p-5 space-y-4">
                <div className="border-b border-slate-200 dark:border-white/10 pb-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white flex items-center gap-2">
                        <Settings size={12} className="text-blue-600 dark:text-yellow-500" />
                        Cuentas por defecto
                    </h3>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1">
                        Cuenta destino al registrar pagos digitales (EFECTIVO siempre va a la caja abierta de la sucursal)
                    </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(['QR', 'TRANSFERENCIA'] as const).map(m => (
                        <div key={m} className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{m}</label>
                            <select value={defaultAccounts[m] || ''}
                                onChange={(e) => updateDefault(m, e.target.value || null)}
                                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-yellow-500 transition">
                                <option value="">— Sin asignar —</option>
                                {accounts
                                    .filter(a => (a.acceptsPaymentMethods || []).includes(m))
                                    .map(a => <option key={a.id} value={a.id!}>{a.name}</option>)}
                            </select>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-end pt-2">
                <button onClick={save} disabled={saving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-yellow-500 hover:opacity-90 text-white dark:text-black text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition disabled:opacity-40 shadow-sm">
                    <Save size={14} /> {saving ? 'Guardando…' : 'Guardar Ajustes'}
                </button>
            </div>
        </div>
    );
}
