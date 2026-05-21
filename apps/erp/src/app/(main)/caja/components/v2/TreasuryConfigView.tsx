/**
 * TreasuryConfigView — configuración global de tesorería (gerente).
 */
'use client';
import React, { useEffect, useState } from 'react';
import { Settings, Save } from 'lucide-react';
import { TreasuryConfigService } from '@/services/TreasuryConfigService';
import { AccountService } from '@/services/AccountService';
import { ConfigService } from '@/services/ConfigService';
import type { TreasuryConfig, Account } from '@/types/treasury';
import type { AppConfig } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export default function TreasuryConfigView() {
    const { user, userName } = useAuth();
    const [cfg, setCfg] = useState<TreasuryConfig | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        Promise.all([
            TreasuryConfigService.get(true),
            AccountService.list({ includeInactive: false }),
        ]).then(([c, a]) => {
            setCfg(c);
            setAccounts(a);
        }).catch(e => toast.error('Error: ' + (e as Error).message))
            .finally(() => setLoading(false));
    }, []);

    const update = <K extends keyof TreasuryConfig>(key: K, value: TreasuryConfig[K]) => {
        setCfg(prev => prev ? { ...prev, [key]: value } : prev);
    };

    const save = async () => {
        if (!cfg || !user) return;
        setSaving(true);
        try {
            await TreasuryConfigService.update(cfg, { uid: user.uid, name: userName || user.email || 'Gerente' });
            toast.success('Configuración actualizada');
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    if (loading || !cfg) {
        return <div className="text-xs font-bold uppercase tracking-wider text-slate-400 italic py-12 text-center">Cargando configuración…</div>;
    }

    return (
        <div className="max-w-3xl space-y-5">
            <Section title="Límites operativos del cajero" subtitle="Si exceden, requieren aprobación de gerente">
                <NumField label="Límite gasto sin aprobación (Bs.)" value={cfg.cashierExpenseLimit}
                    onChange={(v) => update('cashierExpenseLimit', v)} />
                <NumField label="Límite egreso manual sin aprobación (Bs.)" value={cfg.cashierManualEgresoLimit}
                    onChange={(v) => update('cashierManualEgresoLimit', v)} />
            </Section>

            <Section title="Umbrales de discrepancia al cierre" subtitle="En bolivianos. Define severidad de la diferencia">
                <NumField label="Tolerancia (sin alerta)" value={cfg.discrepancyTolerance}
                    onChange={(v) => update('discrepancyTolerance', v)} />
                <NumField label="Diferencia media" value={cfg.discrepancyMedium}
                    onChange={(v) => update('discrepancyMedium', v)} />
                <NumField label="Diferencia alta (bloquea sesión)" value={cfg.discrepancyHigh}
                    onChange={(v) => update('discrepancyHigh', v)} />
            </Section>

            <Section title="Sesiones de caja" subtitle="Alertas operativas por duración de la sesión">
                <NumField label="Horas para mostrar alerta" value={cfg.sessionAlertHours}
                    onChange={(v) => update('sessionAlertHours', v)} />
                <NumField label="Horas para sugerir cierre forzoso" value={cfg.sessionForceCloseHours}
                    onChange={(v) => update('sessionForceCloseHours', v)} />
            </Section>

            <Section title="Auditoría y Conciliación" subtitle="Políticas para el respaldo de operaciones">
                <ToggleField label="Ref. en pagos digitales" description="Exigir número de comprobante al cobrar con QR o Transferencia." value={cfg.requireBankRefForDigital}
                    onChange={(v) => update('requireBankRefForDigital', v)} />
                <ToggleField label="Foto en gastos" description="Exigir foto del recibo/factura al registrar un egreso." value={cfg.requireExpenseReceipt}
                    onChange={(v) => update('requireExpenseReceipt', v)} />
                <NumField label="Alerta días sin conciliar" value={cfg.autoReconcileWithinDays || 7}
                    onChange={(v) => update('autoReconcileWithinDays', v)} />
            </Section>

            <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-white/10">
                <button onClick={save} disabled={saving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition disabled:opacity-40 shadow-sm">
                    <Save size={14} /> {saving ? 'Guardando…' : 'Guardar configuración'}
                </button>
            </div>
        </div>
    );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60 p-5 space-y-4">
            <div className="border-b border-slate-200 dark:border-white/10 pb-3">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white flex items-center gap-2">
                    <Settings size={12} className="text-blue-600 dark:text-yellow-500" />
                    {title}
                </h3>
                {subtitle && <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1">{subtitle}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
        </div>
    );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
        <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{label}</label>
            <input type="number" inputMode="decimal" min={0} step="0.01" value={value}
                onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-black tabular-nums tracking-tighter outline-none focus:border-yellow-500 transition" />
        </div>
    );
}

function ToggleField({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition">
            <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="sr-only" />
                <div className={`w-10 h-5 rounded-full transition-colors ${value ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${value ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
            </div>
            <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white leading-tight">{label}</div>
                {description && <div className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{description}</div>}
            </div>
        </label>
    );
}
