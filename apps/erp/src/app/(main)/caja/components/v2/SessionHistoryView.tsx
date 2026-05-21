/**
 * SessionHistoryView — historial de sesiones cerradas/forzadas (gerente).
 * Drilldown a SessionDetailModal con asientos contables.
 */
'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { History, User, Wallet, Clock, AlertTriangle, ShieldAlert, RotateCw, FileText } from 'lucide-react';
import { CashierSessionService } from '@/services/CashierSessionService';
import { PrintService } from '@/services/PrintService';
import type { CashierSession } from '@/types/treasury';
import { useBranch } from '@/contexts/BranchContext';
import SessionDetailModal from './SessionDetailModal';
import { toast } from 'sonner';
import { formatUserName } from '@/utils/formatUserName';
import clsx from 'clsx';

const SEVERITY_META: Record<string, { label: string; cls: string }> = {
    NONE: { label: 'Sin diferencia', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
    TOLERATED: { label: 'Tolerada', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
    MEDIUM: { label: 'Media', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
    HIGH: { label: 'Alta', cls: 'bg-orange-500/10 text-orange-700 dark:text-orange-400' },
    CRITICAL: { label: 'Crítica', cls: 'bg-red-500/10 text-red-700 dark:text-red-400' },
};

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    CLOSED: { label: 'Cerrada', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', icon: <Wallet size={11} /> },
    FORCE_CLOSED: { label: 'Forzada', cls: 'bg-orange-500/10 text-orange-700 dark:text-orange-400', icon: <ShieldAlert size={11} /> },
    BLOCKED: { label: 'Bloqueada', cls: 'bg-red-500/10 text-red-700 dark:text-red-400', icon: <AlertTriangle size={11} /> },
};

export default function SessionHistoryView() {
    const { currentBranch, isConsolidatedView } = useBranch();
    const [sessions, setSessions] = useState<CashierSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [selected, setSelected] = useState<CashierSession | null>(null);

    const handlePrintReport = async (s: CashierSession) => {
        try {
            await PrintService.printSessionReport(s);
        } catch (e) {
            toast.error('Error al generar PDF: ' + (e as Error).message);
        }
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const branchId = isConsolidatedView ? undefined : currentBranch?.id || undefined;
            const list = await CashierSessionService.getHistory({
                branchId,
                from: from ? new Date(from) : undefined,
                to: to ? new Date(to) : undefined,
                limit: 100,
            });
            setSessions(list);
        } catch (e) {
            toast.error('Error: ' + (e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [currentBranch, isConsolidatedView, from, to]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="space-y-4">
            {sessions.some(s => s.status === 'BLOCKED') && (
                <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                        <p className="text-xs font-black uppercase tracking-tight text-red-700 dark:text-red-400">
                            Hay sesiones bloqueadas por discrepancia crítica
                        </p>
                        <p className="text-[11px] font-bold text-red-700/80 dark:text-red-400/80">
                            Solo el gerente puede revisarlas y reabrirlas. Pulsa <strong>“Revisar →”</strong> en la fila roja
                            para ver el detalle, justificar la reapertura (mín. 10 caracteres) y volverla a OPEN.
                            La cajera podrá entonces declarar de nuevo y cerrarla correctamente.
                        </p>
                    </div>
                </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Desde</label>
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                        className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs font-bold outline-none focus:border-yellow-500 transition" />
                </div>
                <div className="flex items-center gap-1.5">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Hasta</label>
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                        className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs font-bold outline-none focus:border-yellow-500 transition" />
                </div>
                {(from || to) && (
                    <button onClick={() => { setFrom(''); setTo(''); }}
                        className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-slate-900 dark:hover:text-white transition">
                        Limpiar
                    </button>
                )}
                <div className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {sessions.length} sesión{sessions.length !== 1 ? 'es' : ''}
                </div>
            </div>

            {loading ? (
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 italic py-12 text-center">Cargando…</div>
            ) : sessions.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/40 p-12 text-center">
                    <History size={28} className="mx-auto text-slate-400 mb-3" />
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">No hay sesiones en el periodo.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60">
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-[#111827]">
                            <tr className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                                <th className="text-left px-4 py-3">Cajero</th>
                                <th className="text-left px-4 py-3">Cajón</th>
                                <th className="text-left px-4 py-3">Apertura → Cierre</th>
                                <th className="text-right px-4 py-3">Esperado</th>
                                <th className="text-right px-4 py-3">Declarado</th>
                                <th className="text-right px-4 py-3">Diferencia</th>
                                <th className="text-center px-4 py-3">Estado</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessions.map(s => {
                                const opened = s.openedAt as Date;
                                const closed = s.closedAt as Date | undefined;
                                const exp = s.closingExpected?.EFECTIVO ?? 0;
                                const dec = s.closingDeclared?.EFECTIVO ?? 0;
                                const diff = s.closingDifference?.total ?? 0;
                                const sev = s.discrepancySeverity || 'NONE';
                                const sevMeta = SEVERITY_META[sev];
                                const stMeta = STATUS_META[s.status];
                                return (
                                    <tr key={s.id} className="border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <User size={11} className="text-slate-400" />
                                                <span className="font-bold text-slate-900 dark:text-white">{formatUserName(s.cashierName)}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-[10px] font-bold text-slate-500">#{s.cashDrawerId.slice(0, 8)}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                                <Clock size={10} />
                                                <span>{opened?.toLocaleString?.('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) || '—'}</span>
                                            </div>
                                            {closed && (
                                                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                                                    <RotateCw size={10} />
                                                    <span>{closed.toLocaleString?.('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) || '—'}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-700 dark:text-slate-300">{exp.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-700 dark:text-slate-300">{dec.toFixed(2)}</td>
                                        <td className={clsx('px-4 py-3 text-right tabular-nums font-black tracking-tighter',
                                            diff > 0.01 ? 'text-emerald-600' : diff < -0.01 ? 'text-red-600' : 'text-slate-400'
                                        )}>
                                            {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="inline-flex flex-col items-center gap-1">
                                                <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-xl text-[9px] font-black uppercase tracking-wider', stMeta?.cls)}>
                                                    {stMeta?.icon} {stMeta?.label}
                                                </span>
                                                {sev !== 'NONE' && (
                                                    <span className={clsx('px-2 py-0.5 rounded-xl text-[9px] font-black uppercase tracking-wider', sevMeta?.cls)}>
                                                        {sevMeta?.label}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2.5">
                                                <button onClick={() => setSelected(s)}
                                                    className={clsx(
                                                        'text-[10px] font-black uppercase tracking-[0.15em] hover:underline',
                                                        s.status === 'BLOCKED'
                                                            ? 'text-red-600 dark:text-red-400'
                                                            : 'text-blue-600 dark:text-yellow-500'
                                                    )}>
                                                    {s.status === 'BLOCKED' ? 'Revisar →' : 'Ver'}
                                                </button>
                                                <button onClick={() => handlePrintReport(s)}
                                                    title="Descargar informe PDF"
                                                    className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white transition active:scale-90">
                                                    <FileText size={13} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <SessionDetailModal isOpen={!!selected} onClose={() => setSelected(null)}
                onChanged={load}
                session={selected} />
        </div>
    );
}
