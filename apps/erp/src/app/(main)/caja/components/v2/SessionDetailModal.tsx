/**
 * SessionDetailModal — detalle completo de una sesión + sus asientos.
 * Permite reabrir sesiones BLOCKED (gerente).
 */
'use client';
import React, { useEffect, useState } from 'react';
import { History, RotateCw, AlertTriangle, ShieldAlert, CheckCircle2, FileText } from 'lucide-react';
import IndustrialModal from '@/components/common/IndustrialModal';
import { CashierSessionService } from '@/services/CashierSessionService';
import { PrintService } from '@/services/PrintService';
import type { CashierSession } from '@/types/treasury';
import { useAuth } from '@/contexts/AuthContext';
import SessionEntriesTable from './SessionEntriesTable';
import { toast } from 'sonner';
import { formatUserName } from '@/utils/formatUserName';
import clsx from 'clsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onChanged: () => void;
    session: CashierSession | null;
}

export default function SessionDetailModal({ isOpen, onClose, onChanged, session }: Props) {
    const { user, userName, role } = useAuth();
    const [reopening, setReopening] = useState(false);
    const [reopenReason, setReopenReason] = useState('');
    const [acknowledging, setAcknowledging] = useState(false);
    const [ackReason, setAckReason] = useState('');
    const [liveExpected, setLiveExpected] = useState<{ EFECTIVO: number; QR: number; TRANSFERENCIA: number } | null>(null);

    // Recalcular esperados al vuelo desde los asientos contables.
    // Necesario para sesiones cerradas antes del fix del bug de QR/TRANSF
    // (las que tienen closingExpected.QR/TRANSFERENCIA = 0 mal guardado).
    useEffect(() => {
        if (!isOpen || !session?.id) { setLiveExpected(null); return; }
        let cancelled = false;
        CashierSessionService.computeExpected(session.id)
            .then(r => { if (!cancelled) setLiveExpected(r); })
            .catch(() => { if (!cancelled) setLiveExpected(null); });
        return () => { cancelled = true; };
    }, [isOpen, session?.id]);

    if (!session) return null;

    const isGerente = role === 'GERENTE';
    const opened = session.openedAt as Date;
    const closed = session.closedAt as Date | undefined;
    const exp = session.closingExpected;
    const dec = session.closingDeclared;
    const diff = session.closingDifference;

    const handleReopen = async () => {
        if (!user) return;
        if (reopenReason.trim().length < 10) {
            toast.error('Razón obligatoria (mín. 10 caracteres)');
            return;
        }
        setReopening(true);
        try {
            await CashierSessionService.reopenSession(
                session.id!,
                { uid: user.uid, name: userName || user.email || 'Gerente' },
                reopenReason.trim(),
                { acknowledgeBlocked: true }
            );
            toast.success('Sesión reabierta');
            setReopenReason('');
            onChanged();
            onClose();
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setReopening(false);
        }
    };

    const handleAcknowledge = async () => {
        if (ackReason.trim().length < 10) {
            toast.error('Razón obligatoria (mín. 10 caracteres)');
            return;
        }
        setAcknowledging(true);
        try {
            await CashierSessionService.acknowledgeBlockedSession(session.id!, ackReason.trim());
            toast.success('Sesión cerrada definitivamente');
            setAckReason('');
            onChanged();
            onClose();
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setAcknowledging(false);
        }
    };

    const handlePrintReport = async () => {
        try {
            await PrintService.printSessionReport(session);
        } catch (e) {
            toast.error('Error al generar PDF: ' + (e as Error).message);
        }
    };

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={`Sesión de ${formatUserName(session.cashierName)}`}
            subtitle={`Cajón #${session.cashDrawerId.slice(0, 8)} · ${session.status}`}
            theme="stealth"
            icon={<History size={18} strokeWidth={2.5} />}
            maxWidth="max-w-4xl"
        >
            <div className="space-y-5">
                {/* Header info */}
                <div className="flex justify-between items-center">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        Resumen del turno
                    </div>
                    {session.status !== 'OPEN' && (
                        <button onClick={handlePrintReport}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5 text-blue-600 dark:text-yellow-500 transition active:scale-95 shadow-sm">
                            <FileText size={12} />
                            Ver Informe PDF
                        </button>
                    )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Info label="Apertura" value={opened?.toLocaleString?.('es-BO') || '—'} />
                    <Info label="Cierre" value={closed?.toLocaleString?.('es-BO') || '—'} />
                    <Info label="Apertura efectivo" value={`Bs. ${(session.openingTotal || 0).toFixed(2)}`} />
                    <Info label="Severidad" value={session.discrepancySeverity || 'NONE'} />
                </div>
                {session.reopenedByName && (
                    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#111827]/50 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                        <div className="font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 text-[9px] mb-1">Reabierta por</div>
                        <div>{formatUserName(session.reopenedByName)}{session.reopenedByRole ? ` · ${session.reopenedByRole}` : ''}</div>
                        {session.reopenedAt && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{(session.reopenedAt as Date).toLocaleString('es-BO')}</div>
                        )}
                    </div>
                )}
                {session.blockedAcknowledgedByName && (
                    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#111827]/50 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                        <div className="font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 text-[9px] mb-1">Aceptado por</div>
                        <div>{formatUserName(session.blockedAcknowledgedByName)}{session.blockedAcknowledgedByRole ? ` · ${session.blockedAcknowledgedByRole}` : ''}</div>
                        {session.blockedAcknowledgedAt && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{(session.blockedAcknowledgedAt as Date).toLocaleString('es-BO')}</div>
                        )}
                    </div>
                )}
                {session.closedByName && (
                    <div className="mt-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#111827]/50 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                        <div className="font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 text-[9px] mb-1">Cerrado por</div>
                        <div>{formatUserName(session.closedByName)}{session.closedByRole ? ` · ${session.closedByRole}` : ''}</div>
                    </div>
                )}

                {/* Cuadre */}
                {(exp || dec) && (
                    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60 p-5 space-y-3">
                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-yellow-500">Cuadre</div>
                        <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-white/5">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 dark:bg-[#111827]">
                                    <tr className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                                        <th className="text-left py-2 px-3">Método</th>
                                        <th className="text-right py-2 px-3">Esperado</th>
                                        <th className="text-right py-2 px-3">Declarado</th>
                                        <th className="text-right py-2 px-3">Diferencia</th>
                                    </tr>
                                </thead>
                                <tbody className="tabular-nums">
                                    {(['EFECTIVO', 'QR', 'TRANSFERENCIA'] as const).map(m => {
                                        // Para EFECTIVO usamos siempre el valor guardado (incluye openingTotal).
                                        // Para QR/TRANSF preferimos el live si difiere del guardado (sesiones del bug).
                                        const stored = exp?.[m] ?? 0;
                                        const live = liveExpected?.[m];
                                        const e = m === 'EFECTIVO'
                                            ? stored
                                            : (live !== undefined && Math.abs(live - stored) > 0.01 ? live : stored);
                                        const d = dec?.[m] ?? 0;
                                        const df = d - e;
                                        const isStale = m !== 'EFECTIVO' && live !== undefined && Math.abs(live - stored) > 0.01;
                                        return (
                                            <tr key={m} className="border-t border-slate-100 dark:border-white/5">
                                                <td className="py-2 px-3 font-black uppercase tracking-wider text-[10px] text-slate-700 dark:text-slate-300">{m}</td>
                                                <td className="py-2 px-3 text-right font-bold text-slate-700 dark:text-slate-300">
                                                    {e.toFixed(2)}
                                                    {isStale && (
                                                        <span className="ml-1 text-[8px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400" title={`Recalculado al vuelo (guardado: ${stored.toFixed(2)})`}>· RECALC</span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right font-bold text-slate-700 dark:text-slate-300">{d.toFixed(2)}</td>
                                                <td className={clsx('py-2 px-3 text-right font-black tracking-tighter',
                                                    df > 0.01 ? 'text-emerald-600' : df < -0.01 ? 'text-red-600' : 'text-slate-400'
                                                )}>
                                                    {df > 0 ? '+' : ''}{df.toFixed(2)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {diff && (() => {
                                        // Recalcular total con los esperados live cuando aplica
                                        const liveTotal = (() => {
                                            if (!liveExpected) return diff.total;
                                            const eEf = exp?.EFECTIVO ?? 0;
                                            const eQR = liveExpected.QR;
                                            const eTr = liveExpected.TRANSFERENCIA;
                                            const dEf = dec?.EFECTIVO ?? 0;
                                            const dQR = dec?.QR ?? 0;
                                            const dTr = dec?.TRANSFERENCIA ?? 0;
                                            return (dEf - eEf) + (dQR - eQR) + (dTr - eTr);
                                        })();
                                        return (
                                            <tr className="border-t-2 border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#111827]/50">
                                                <td className="py-2 px-3 font-black uppercase tracking-wider text-[10px] text-slate-900 dark:text-white">TOTAL</td>
                                                <td colSpan={2}></td>
                                                <td className={clsx('py-2 px-3 text-right font-black text-lg tracking-tighter',
                                                    liveTotal > 0.01 ? 'text-emerald-600' : liveTotal < -0.01 ? 'text-red-600' : 'text-slate-400'
                                                )}>
                                                    {liveTotal > 0 ? '+' : ''}{liveTotal.toFixed(2)}
                                                </td>
                                            </tr>
                                        );
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Force close info */}
                {session.status === 'FORCE_CLOSED' && (
                    <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4 text-[11px] font-bold text-orange-700 dark:text-orange-400 space-y-1">
                        <div className="flex items-center gap-1.5 font-black uppercase tracking-wider">
                            <ShieldAlert size={12} /> Cierre forzoso
                        </div>
                        <div><strong>Por:</strong> {formatUserName(session.forceClosedByName || session.forceClosedBy)}{session.forceClosedByRole ? ` · ${session.forceClosedByRole}` : ''}</div>
                        <div><strong>Razón:</strong> {session.forceCloseReason}</div>
                    </div>
                )}

                {/* Blocked info */}
                {session.status === 'BLOCKED' && (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-[11px] font-bold text-red-700 dark:text-red-400 space-y-1">
                        <div className="flex items-center gap-1.5 font-black uppercase tracking-wider">
                            <AlertTriangle size={12} /> Sesión bloqueada por discrepancia crítica
                        </div>
                        <div><strong>Razón:</strong> {session.blockedReason}</div>
                    </div>
                )}

                {/* Reopen / Acknowledge (gerente, BLOCKED only) */}
                {session.status === 'BLOCKED' && isGerente && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 space-y-3">
                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-yellow-700 dark:text-yellow-500 flex items-center gap-1.5">
                                <RotateCw size={12} /> Reabrir sesión
                            </div>
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                                Vuelve la sesión a OPEN para que la cajera la cuente otra vez.
                                <strong className="block mt-1 text-yellow-700 dark:text-yellow-500">Requiere que la cajera no tenga otra sesión abierta.</strong>
                            </p>
                            <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)}
                                placeholder="Motivo de reapertura (mín. 10 caracteres)"
                                rows={2} maxLength={500}
                                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-yellow-500 transition resize-none" />
                            <div className="flex justify-end">
                                <button onClick={handleReopen} disabled={reopening || reopenReason.trim().length < 10}
                                    className="px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase tracking-[0.2em] transition active:scale-95 disabled:opacity-40 shadow-sm">
                                    {reopening ? 'Reabriendo…' : 'Reabrir'}
                                </button>
                            </div>
                        </div>
                        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3">
                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                                <CheckCircle2 size={12} /> Aceptar y cerrar definitivamente
                            </div>
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                                Acepta la diferencia tal cual. La sesión queda CERRADA.
                                Si hay diferencia en efectivo, se asienta un ajuste automático para que el saldo del cajón cuadre con la realidad.
                            </p>
                            <textarea value={ackReason} onChange={(e) => setAckReason(e.target.value)}
                                placeholder="Justificación (mín. 10 caracteres)"
                                rows={2} maxLength={500}
                                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition resize-none" />
                            <div className="flex justify-end">
                                <button onClick={handleAcknowledge} disabled={acknowledging || ackReason.trim().length < 10}
                                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-[0.2em] transition active:scale-95 disabled:opacity-40 shadow-sm">
                                    {acknowledging ? 'Procesando…' : 'Aceptar y cerrar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Asientos */}
                <div className="space-y-2">
                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-yellow-500">
                        Movimientos contables
                    </div>
                    <SessionEntriesTable
                        sessionId={session.id!}
                        branchId={session.branchId}
                        windowFrom={opened}
                        windowTo={closed}
                        canReverse={false}
                    />
                </div>
            </div>
        </IndustrialModal>
    );
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60 px-4 py-3">
            <div className="text-[9px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 font-black">{label}</div>
            <div className="text-sm font-black tabular-nums tracking-tight text-slate-900 dark:text-white mt-1">{value}</div>
        </div>
    );
}
