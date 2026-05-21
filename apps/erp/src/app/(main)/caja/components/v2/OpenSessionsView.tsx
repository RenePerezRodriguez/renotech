/**
 * OpenSessionsView — gerente: lista de sesiones abiertas con acción de force-close.
 */
'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { Wallet, Clock, AlertTriangle, ShieldAlert, User } from 'lucide-react';
import IndustrialModal from '@/components/common/IndustrialModal';
import { CashierSessionService } from '@/services/CashierSessionService';
import { TreasuryConfigService } from '@/services/TreasuryConfigService';
import type { CashierSession } from '@/types/treasury';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { toast } from 'sonner';
import { formatUserName } from '@/utils/formatUserName';
import clsx from 'clsx';

interface SessionRow extends CashierSession {
    expectedEfectivo?: number;
}

export default function OpenSessionsView() {
    const { user, userName } = useAuth();
    const { currentBranch, isConsolidatedView } = useBranch();
    const [rows, setRows] = useState<SessionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [alertHours, setAlertHours] = useState(8);

    const [forceTarget, setForceTarget] = useState<CashierSession | null>(null);
    const [forceReason, setForceReason] = useState('');
    const [forcing, setForcing] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const cfg = await TreasuryConfigService.get();
            setAlertHours(cfg.sessionAlertHours || 8);
            const branchId = isConsolidatedView ? undefined : currentBranch?.id || undefined;
            const list = await CashierSessionService.getOpenSessions(branchId);
            const enriched = await Promise.all(list.map(async (s) => {
                try {
                    const exp = await CashierSessionService.computeExpected(s.id!);
                    return { ...s, expectedEfectivo: (s.openingTotal || 0) + exp.EFECTIVO };
                } catch {
                    return { ...s, expectedEfectivo: undefined };
                }
            }));
            setRows(enriched);
        } catch (e) {
            toast.error('Error: ' + (e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [currentBranch, isConsolidatedView]);

    useEffect(() => { load(); }, [load]);

    const handleForceClose = async () => {
        if (!forceTarget || !user) return;
        if (forceReason.trim().length < 10) {
            toast.error('Razón obligatoria (mín. 10 caracteres)');
            return;
        }
        setForcing(true);
        try {
            await CashierSessionService.forceClose(
                forceTarget.id!,
                { uid: user.uid, name: userName || user.email || 'Gerente' },
                forceReason.trim()
            );
            toast.success('Sesión cerrada forzosamente');
            setForceTarget(null);
            setForceReason('');
            load();
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setForcing(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Sesiones de caja actualmente abiertas {isConsolidatedView ? '(todas las sucursales)' : `(${currentBranch?.name || '—'})`}.
            </div>

            {loading ? (
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 italic py-12 text-center">Cargando…</div>
            ) : rows.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/40 p-12 text-center">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">No hay sesiones abiertas.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {rows.map(s => {
                        const opened = s.openedAt as Date;
                        const hours = opened ? (Date.now() - opened.getTime()) / 3_600_000 : 0;
                        const longSession = hours >= alertHours;
                        return (
                            <div key={s.id} className={clsx(
                                'rounded-2xl border p-5 space-y-4 transition',
                                longSession ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60 hover:border-slate-300 dark:hover:border-white/20'
                            )}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1.5 min-w-0">
                                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-yellow-500 flex items-center gap-1">
                                            <Wallet size={11} /> Cajón #{s.cashDrawerId.slice(0, 8)}
                                        </div>
                                        <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                                            <User size={12} className="text-slate-400 shrink-0" />
                                            {formatUserName(s.cashierName)}
                                        </h3>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                                            <span className="inline-flex items-center gap-1">
                                                <Clock size={10} /> {opened?.toLocaleString?.('es-BO') || '—'}
                                            </span>
                                            <span className={clsx('tabular-nums font-black', longSession ? 'text-amber-600' : 'text-slate-700 dark:text-slate-300')}>
                                                {hours.toFixed(1)} h
                                            </span>
                                            {longSession && <AlertTriangle size={11} className="text-amber-600" />}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-white/5">
                                    <div>
                                        <div className="text-[9px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 font-black">Apertura</div>
                                        <div className="text-lg font-black tabular-nums tracking-tighter text-slate-900 dark:text-white mt-1">Bs. {(s.openingTotal || 0).toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 font-black">Esperado efectivo</div>
                                        <div className="text-lg font-black tabular-nums tracking-tighter text-slate-900 dark:text-white mt-1">
                                            {s.expectedEfectivo != null ? `Bs. ${s.expectedEfectivo.toFixed(2)}` : '—'}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end pt-3 border-t border-slate-100 dark:border-white/5">
                                    <button onClick={() => setForceTarget(s)}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-orange-500/40 text-orange-700 dark:text-orange-400 bg-orange-500/5 hover:bg-orange-500/10 text-[10px] font-black uppercase tracking-[0.15em] active:scale-95 transition">
                                        <ShieldAlert size={11} /> Forzar cierre
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <IndustrialModal
                isOpen={!!forceTarget}
                onClose={() => { setForceTarget(null); setForceReason(''); }}
                title="Forzar cierre de sesión"
                subtitle={formatUserName(forceTarget?.cashierName) || ''}
                theme="stealth"
                icon={<ShieldAlert size={18} strokeWidth={2.5} />}
                maxWidth="max-w-lg"
                footer={
                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setForceTarget(null); setForceReason(''); }}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition active:scale-95">
                            Cancelar
                        </button>
                        <button onClick={handleForceClose} disabled={forcing || forceReason.trim().length < 10}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl bg-orange-500 hover:bg-orange-400 text-white transition active:scale-95 disabled:opacity-40 shadow-sm">
                            {forcing ? 'Cerrando…' : 'Confirmar'}
                        </button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 text-[11px] font-bold text-orange-700 dark:text-orange-400">
                        El cierre forzoso cuadra el efectivo automáticamente al esperado.
                        Quedará registrado quién, cuándo y por qué.
                    </div>
                    <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                            Razón (mín. 10 caracteres)
                        </label>
                        <textarea value={forceReason} onChange={(e) => setForceReason(e.target.value)}
                            rows={3} maxLength={500}
                            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-orange-500 transition resize-none" />
                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-right">{forceReason.length} / 500</div>
                    </div>
                </div>
            </IndustrialModal>
        </div>
    );
}
