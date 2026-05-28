/**
 * OpenSessionModal — apertura de sesión de cajero.
 * - Selecciona cajón disponible (cuentas CASH_DRAWER activas de su sucursal).
 * - Declara denominaciones iniciales.
 * - Primera sesión: acepta cualquier monto (saldo inicial).
 * - Siguientes sesiones: el monto DEBE coincidir exactamente con el saldo del cajón.
 */
'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { Lock, Wallet, Info } from 'lucide-react';
import IndustrialModal from '@/components/common/IndustrialModal';
import DenominationsInput from './DenominationsInput';
import { AccountService } from '@/services/AccountService';
import { CashierSessionService } from '@/services/CashierSessionService';
import type { Account, CashDenominations } from '@/types/treasury';
import { calculateDenominationsTotal } from '@/types/treasury';
import { toast } from 'sonner';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onOpened: (sessionId: string) => void;
    cashierId: string;
    cashierName: string;
    cashierRole?: string;
    branchId: string | null;
}

export default function OpenSessionModal({ isOpen, onClose, onOpened, cashierId, cashierName, cashierRole, branchId }: Props) {
    const [drawers, setDrawers] = useState<Account[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [selectedDrawerId, setSelectedDrawerId] = useState<string>('');
    const [denoms, setDenoms] = useState<CashDenominations>({});
    const [notes, setNotes] = useState('');
    const [initialJustification, setInitialJustification] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        AccountService.list({ type: 'CASH_DRAWER', branchId: branchId || undefined, includeInactive: false })
            .then(list => {
                const posDrawers = list.filter(d => d.cashDrawerPurpose !== 'VAULT');
                setDrawers(posDrawers);
                if (posDrawers.length === 1) setSelectedDrawerId(posDrawers[0].id!);
            })
            .catch(e => toast.error('Error cargando cajones: ' + (e as Error).message))
            .finally(() => setLoading(false));
    }, [isOpen, branchId]);

    useEffect(() => {
        if (!isOpen) {
            setSelectedDrawerId('');
            setDenoms({});
            setNotes('');
            setInitialJustification('');
        }
    }, [isOpen]);

    const total = useMemo(() => calculateDenominationsTotal(denoms), [denoms]);
    const selectedDrawer = useMemo(() => drawers.find(d => d.id === selectedDrawerId) || null, [drawers, selectedDrawerId]);
    const previousBalance = selectedDrawer?.currentBalance ?? 0;
    // BUG-05: una cuenta con openingBalance === undefined nunca tuvo una sesión (primera vez real).
    // Una cuenta con openingBalance seteado (aunque sea 0) ya pasó por apertura — el saldo 0
    // significa que cerraron el turno con caja vacía, lo cual es válido y debe verificarse.
    const isFirstSession = selectedDrawer !== null && (selectedDrawer as Account & { openingBalance?: number }).openingBalance === undefined;
    const hasMismatch = !!selectedDrawer && !isFirstSession && Math.abs(total - previousBalance) >= 0.01;
    const needsInitialJustification = isFirstSession && total > 0;
    const canSubmit = !!selectedDrawerId && !submitting && !hasMismatch
        && (!needsInitialJustification || initialJustification.trim().length >= 10);

    const handleSubmit = async () => {
        if (!selectedDrawerId) return toast.error('Selecciona un cajón');
        if (hasMismatch) {
            return toast.error(`El efectivo declarado (Bs. ${total.toFixed(2)}) no coincide con el saldo del cajón (Bs. ${previousBalance.toFixed(2)}). El efectivo físico no puede cambiar entre cierre y apertura.`);
        }
        setSubmitting(true);
        try {
            const id = await CashierSessionService.openSession({
                cashDrawerId: selectedDrawerId,
                cashierId,
                cashierName,
                cashierRole,
                openingDenominations: denoms,
                openingNotes: needsInitialJustification
                    ? `[FONDO INICIAL] ${initialJustification.trim()}`
                    : notes.trim() || undefined,
            });
            window.dispatchEvent(new Event('cash-shift-changed'));
            toast.success(`Sesión abierta · efectivo inicial Bs. ${total.toFixed(2)}`);
            onOpened(id);
            onClose();
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title="Abrir sesión de caja"
            subtitle="Inicio de turno"
            theme="stealth"
            icon={<Lock size={18} strokeWidth={2.5} />}
            maxWidth="max-w-2xl"
            footer={
                <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Cajero: <span className="font-black text-slate-900 dark:text-white">{cashierName}</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} disabled={submitting}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition active:scale-95">
                            Cancelar
                        </button>
                        <button onClick={handleSubmit} disabled={!canSubmit}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
                            {submitting ? 'Abriendo…' : 'Abrir sesión'}
                        </button>
                    </div>
                </div>
            }
        >
            <div className="space-y-6">
                {/* Cajón */}
                <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 flex items-center gap-2">
                        <Wallet size={12} /> Cajón físico
                    </label>
                    {loading ? (
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 italic">Cargando cajones disponibles…</div>
                    ) : drawers.length === 0 ? (
                        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs font-bold text-amber-700 dark:text-amber-400">
                            No hay cajones operativos disponibles en tu sucursal. Pide al gerente que cree uno en Tesorería → Cuentas y marque su uso como POS.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {drawers.map(d => (
                                <button
                                    key={d.id!}
                                    type="button"
                                    onClick={() => setSelectedDrawerId(d.id!)}
                                    className={`text-left rounded-xl border px-4 py-3 transition-all active:scale-95 ${
                                        selectedDrawerId === d.id
                                            ? 'border-yellow-500 bg-yellow-500/10 shadow-sm'
                                            : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:border-slate-300 dark:hover:border-white/20'
                                    }`}
                                >
                                    <div className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white">{d.name}</div>
                                    <div className="text-[10px] font-bold tabular-nums uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">
                                        Saldo actual: Bs. {(d.currentBalance || 0).toFixed(2)}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Denominaciones */}
                <DenominationsInput
                    value={denoms}
                    onChange={setDenoms}
                    label="Conteo inicial de efectivo"
                />

                {/* Error: diferencia detectada (solo en sesiones posteriores) */}
                {hasMismatch && (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 px-4 py-3 text-xs font-bold text-rose-700 dark:text-rose-400 space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em]">No se puede abrir la sesión</div>
                        <div className="text-[10px] font-bold tracking-wider opacity-90">
                            El efectivo declarado (Bs. {total.toFixed(2)}) no coincide con el saldo del cajón (Bs. {previousBalance.toFixed(2)}).
                            El efectivo físico no puede cambiar entre el cierre y la apertura. Verificá el conteo.
                        </div>
                    </div>
                )}

                {/* Primera sesión */}
                {isFirstSession && selectedDrawer && (
                    <div className="rounded-xl border border-blue-500/40 bg-blue-500/5 px-4 py-3 space-y-3">
                        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                            <Info size={13} strokeWidth={2.5} className="shrink-0" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Primera apertura de este cajón</span>
                        </div>
                        <p className="text-[10px] font-bold text-blue-700/80 dark:text-blue-400/80 leading-relaxed">
                            No existe saldo previo. Si arrancás con un fondo de cambio ingresá las denominaciones arriba y justificá el origen del capital. Si abrís en cero dejá el conteo vacío.
                        </p>

                        {/* Justificación obligatoria cuando hay capital inicial */}
                        {needsInitialJustification && (
                            <div className="space-y-1.5 pt-1">
                                <label className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-700 dark:text-blue-400 flex items-center gap-1">
                                    Justificación del fondo inicial
                                    <span className="text-rose-500">*</span>
                                </label>
                                <textarea
                                    value={initialJustification}
                                    onChange={(e) => setInitialJustification(e.target.value)}
                                    rows={2}
                                    maxLength={300}
                                    placeholder="Ej: Fondo de cambio autorizado por gerencia para apertura de sucursal…"
                                    className="w-full rounded-xl border border-blue-300 dark:border-blue-500/40 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-yellow-500 transition resize-none"
                                />
                                {initialJustification.trim().length > 0 && initialJustification.trim().length < 10 && (
                                    <p className="text-[9px] font-bold text-rose-500">Mínimo 10 caracteres ({initialJustification.trim().length}/10)</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Notas (sesiones normales o primera sesión sin capital) */}
                {(!isFirstSession || !needsInitialJustification) && (
                    <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                            Notas (opcional)
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            maxLength={300}
                            placeholder="Observaciones del inicio de turno…"
                            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold outline-none focus:border-yellow-500 transition resize-none"
                        />
                    </div>
                )}
            </div>
        </IndustrialModal>
    );
}
