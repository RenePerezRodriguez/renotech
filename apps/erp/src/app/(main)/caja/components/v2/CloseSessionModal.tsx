/**
 * CloseSessionModal — cierre de sesión de cajero.
 *
 * Flujo:
 *  1. Cargar `expected` (sistema) via CashierSessionService.computeExpected.
 *  2. Cajero declara denominaciones de efectivo + totales QR + TRANSFER (declaración a ciegas).
 *  3. Comparar y mostrar diferencias.
 *  4. Si severity > TOLERATED → modal de confirmación obligatoria.
 *  5. Si CRÍTICA → la sesión queda BLOCKED hasta que gerente revise.
 */
'use client';
import React, { useEffect, useState } from 'react';
import { LogOut, AlertTriangle, ShieldAlert } from 'lucide-react';
import IndustrialModal from '@/components/common/IndustrialModal';
import DenominationsInput from './DenominationsInput';
import { CashierSessionService } from '@/services/CashierSessionService';
import type { CashierSession, CashDenominations } from '@/types/treasury';
import { calculateDenominationsTotal } from '@/types/treasury';
import { PrintService } from '@/services/PrintService';
import { toast } from 'sonner';
import clsx from 'clsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onClosed: () => void;
    session: CashierSession;
    cashierName: string;
}

type Step = 'BLIND' | 'COMPARE' | 'CONFIRM_DISCREPANCY';

export default function CloseSessionModal({ isOpen, onClose, onClosed, session, cashierName }: Props) {
    const [step, setStep] = useState<Step>('BLIND');
    const [denoms, setDenoms] = useState<CashDenominations>({});
    const [declaredQR, setDeclaredQR] = useState('');
    const [declaredTransfer, setDeclaredTransfer] = useState('');
    const [notes, setNotes] = useState('');
    const [expected, setExpected] = useState<{ EFECTIVO: number; QR: number; TRANSFERENCIA: number } | null>(null);
    const [expectedAt, setExpectedAt] = useState<number>(0);
    const [loadingExpected, setLoadingExpected] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setStep('BLIND');
            setDenoms({});
            setDeclaredQR('');
            setDeclaredTransfer('');
            setNotes('');
            setExpected(null);
            setExpectedAt(0);
        }
    }, [isOpen]);

    const declaredEfectivo = calculateDenominationsTotal(denoms);
    const declQR = parseFloat(declaredQR) || 0;
    const declTransfer = parseFloat(declaredTransfer) || 0;

    const goToCompare = async () => {
        setLoadingExpected(true);
        try {
            const exp = await CashierSessionService.computeExpected(session.id!);
            setExpected(exp);
            setExpectedAt(Date.now());
            setStep('COMPARE');
        } catch (e) {
            toast.error('Error calculando esperados: ' + (e as Error).message);
        } finally {
            setLoadingExpected(false);
        }
    };

    const refreshExpected = async () => {
        setLoadingExpected(true);
        try {
            const exp = await CashierSessionService.computeExpected(session.id!);
            setExpected(exp);
            setExpectedAt(Date.now());
            toast.success('Totales actualizados');
        } catch (e) {
            toast.error('Error: ' + (e as Error).message);
        } finally {
            setLoadingExpected(false);
        }
    };

    const isStale = expectedAt > 0 && (Date.now() - expectedAt) > 30_000;

    // Tick para re-evaluar isStale cada 5 segundos mientras el step COMPARE está abierto
    const [, setTick] = useState(0);
    useEffect(() => {
        if (!isOpen || step !== 'COMPARE' || expectedAt === 0) return;
        const id = setInterval(() => setTick(t => t + 1), 5000);
        return () => clearInterval(id);
    }, [isOpen, step, expectedAt]);

    const diffEfectivo = expected ? declaredEfectivo - expected.EFECTIVO : 0;
    const diffQR = expected ? declQR - expected.QR : 0;
    const diffTransfer = expected ? declTransfer - expected.TRANSFERENCIA : 0;
    const maxAbsDiff = Math.max(Math.abs(diffEfectivo), Math.abs(diffQR), Math.abs(diffTransfer));

    const submit = async (confirmed: boolean) => {
        setSubmitting(true);
        try {
            const result = await CashierSessionService.closeSession({
                sessionId: session.id!,
                cashierId: session.cashierId,
                cashierName,
                closingDenominations: denoms,
                declaredQR: declQR,
                declaredTransferencia: declTransfer,
                closingNotes: notes.trim(),
                confirmedDiscrepancy: confirmed,
            });
            // Abrir automáticamente el PDF del informe de cierre de caja
            try {
                const closedSession = await CashierSessionService.getById(session.id!);
                if (closedSession) {
                    await PrintService.printSessionReport(closedSession);
                }
            } catch (printErr) {
                console.error('[SessionPrint] Error al generar PDF automático:', printErr);
                toast.warning('Sesión guardada, pero no se pudo abrir el PDF automáticamente.');
            }

            if (result.status === 'BLOCKED') {
                toast.error(`Sesión BLOQUEADA por discrepancia CRÍTICA. Solo el gerente puede destrabarla.`, { duration: 8000 });
            } else {
                toast.success(`Sesión cerrada · severidad ${result.severity}`);
            }
            window.dispatchEvent(new Event('cash-shift-changed'));
            onClosed();
            onClose();
        } catch (e) {
            const msg = (e as Error).message;
            if (msg === 'CONFIRM_DISCREPANCY') {
                setStep('CONFIRM_DISCREPANCY');
            } else {
                toast.error(msg);
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={step === 'BLIND' ? 'Conteo a ciegas' : step === 'COMPARE' ? 'Cuadre del turno' : 'Discrepancia detectada'}
            subtitle="Cierre de caja"
            theme="stealth"
            icon={step === 'CONFIRM_DISCREPANCY' ? <ShieldAlert size={18} strokeWidth={2.5} /> : <LogOut size={18} strokeWidth={2.5} />}
            maxWidth="max-w-2xl"
            footer={renderFooter()}
        >
            {step === 'BLIND' && (
                <div className="space-y-6">
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        Declara primero lo que realmente tienes en caja (efectivo + totales digitales).
                        El sistema mostrará los esperados sólo después de tu declaración.
                    </div>

                    <DenominationsInput value={denoms} onChange={setDenoms} label="Efectivo en caja" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <DigitalInput label="Total QR (neto)" value={declaredQR} onChange={setDeclaredQR} />
                        <DigitalInput label="Total Transferencias (neto)" value={declaredTransfer} onChange={setDeclaredTransfer} />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                            Notas (opcional)
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            maxLength={300}
                            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition resize-none"
                        />
                    </div>
                </div>
            )}

            {step === 'COMPARE' && expected && (
                <div className="space-y-3">
                    {isStale && (
                        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-3">
                            <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                                Los totales se calcularon hace más de 30 segundos. Pueden haber entrado nuevos movimientos.
                            </div>
                            <button onClick={refreshExpected} disabled={loadingExpected}
                                className="px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] rounded-xl bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-40 transition active:scale-95 shrink-0">
                                {loadingExpected ? '…' : 'Actualizar'}
                            </button>
                        </div>
                    )}
                    <CompareRow label="Efectivo" declared={declaredEfectivo} expected={expected.EFECTIVO} diff={diffEfectivo} />
                    <CompareRow label="QR" declared={declQR} expected={expected.QR} diff={diffQR} />
                    <CompareRow label="Transferencia" declared={declTransfer} expected={expected.TRANSFERENCIA} diff={diffTransfer} />
                </div>
            )}

            {step === 'CONFIRM_DISCREPANCY' && (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-orange-500/40 bg-orange-500/10 p-5">
                        <div className="flex items-start gap-3">
                            <AlertTriangle size={20} className="text-orange-600 mt-0.5 shrink-0" />
                            <div className="space-y-1">
                                <p className="text-sm font-black uppercase tracking-tight text-orange-700 dark:text-orange-400">
                                    Discrepancia significativa
                                </p>
                                <p className="text-xs font-bold text-orange-700/80 dark:text-orange-400/80">
                                    La diferencia máxima es de Bs. {maxAbsDiff.toFixed(2)}. Esta acción quedará registrada en auditoría.
                                </p>
                            </div>
                        </div>
                    </div>
                    {expected && (
                        <div className="space-y-2">
                            <CompareRow label="Efectivo" declared={declaredEfectivo} expected={expected.EFECTIVO} diff={diffEfectivo} compact />
                            <CompareRow label="QR" declared={declQR} expected={expected.QR} diff={diffQR} compact />
                            <CompareRow label="Transferencia" declared={declTransfer} expected={expected.TRANSFERENCIA} diff={diffTransfer} compact />
                        </div>
                    )}
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        Si confirmas, la sesión cerrará con esta discrepancia. Si la diferencia supera el umbral CRÍTICO definido por el gerente,
                        la sesión quedará <strong className="text-red-600">BLOQUEADA</strong> hasta su revisión.
                    </p>
                </div>
            )}
        </IndustrialModal>
    );

    function renderFooter() {
        if (step === 'BLIND') {
            return (
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition active:scale-95">
                        Cancelar
                    </button>
                    <button
                        onClick={goToCompare}
                        disabled={loadingExpected}
                        className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition active:scale-95 shadow-sm"
                    >
                        {loadingExpected ? 'Calculando…' : 'Comparar con sistema →'}
                    </button>
                </div>
            );
        }
        if (step === 'COMPARE') {
            return (
                <div className="flex justify-end gap-2">
                    <button onClick={() => setStep('BLIND')} className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition active:scale-95">
                        ← Editar declaración
                    </button>
                    <button onClick={() => submit(false)} disabled={submitting}
                        className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition active:scale-95 shadow-sm">
                        {submitting ? 'Cerrando…' : 'Cerrar sesión'}
                    </button>
                </div>
            );
        }
        // CONFIRM_DISCREPANCY
        return (
            <div className="flex justify-end gap-2">
                <button onClick={() => setStep('COMPARE')} className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition active:scale-95">
                    ← Revisar
                </button>
                <button onClick={() => submit(true)} disabled={submitting}
                    className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-40 transition active:scale-95 shadow-sm">
                    {submitting ? 'Cerrando…' : 'Confirmar y cerrar con diferencia'}
                </button>
            </div>
        );
    }
}

function DigitalInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{label}</label>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black tabular-nums text-slate-400 uppercase tracking-wider">Bs.</span>
                <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-lg font-black tracking-tighter tabular-nums outline-none focus:border-emerald-500 transition"
                />
            </div>
        </div>
    );
}

function CompareRow({ label, declared, expected, diff, compact }: { label: string; declared: number; expected: number; diff: number; compact?: boolean }) {
    const isOk = Math.abs(diff) < 0.01;
    // diff = declarado - esperado.
    //   diff > 0 → declaraste MÁS de lo que el sistema esperaba  → SOBRAN
    //   diff < 0 → declaraste MENOS de lo que el sistema esperaba → FALTAN
    const status = isOk ? 'CUADRA' : diff > 0 ? 'SOBRAN' : 'FALTAN';
    const expectedNegative = expected < 0;
    return (
        <div className={clsx(
            'rounded-2xl border px-5 py-4',
            isOk ? 'border-emerald-500/30 bg-emerald-500/5' : diff > 0 ? 'border-blue-500/40 bg-blue-500/5' : 'border-orange-500/40 bg-orange-500/5',
            compact && 'py-3'
        )}>
            <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-700 dark:text-white">{label}</div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-bold tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <span>Sistema dice:</span>
                        <span className="font-black text-slate-900 dark:text-white">Bs. {Math.abs(expected).toFixed(2)}{expectedNegative ? ' (egreso neto)' : ''}</span>
                        <span>Tú declaras:</span>
                        <span className="font-black text-slate-900 dark:text-white">Bs. {declared.toFixed(2)}</span>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <div className={clsx(
                        'text-[9px] font-black uppercase tracking-[0.25em]',
                        isOk ? 'text-emerald-600 dark:text-emerald-400' : diff > 0 ? 'text-blue-600 dark:text-yellow-500' : 'text-rose-600 dark:text-rose-400'
                    )}>
                        {status}
                    </div>
                    {!isOk && (
                        <div className={clsx(
                            'font-black tabular-nums tracking-tighter text-2xl mt-0.5',
                            diff > 0 ? 'text-blue-600 dark:text-yellow-500' : 'text-rose-600 dark:text-rose-400'
                        )}>
                            Bs. {Math.abs(diff).toFixed(2)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
