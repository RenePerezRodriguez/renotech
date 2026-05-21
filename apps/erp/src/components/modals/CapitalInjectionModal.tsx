'use client';

import { useState, useEffect } from 'react';
import { CashierSessionService } from '@/services/CashierSessionService';
import { JournalService } from '@/services/JournalService';
import { CashierSession } from '@/types/treasury';
import IndustrialModal from '@/components/common/IndustrialModal';
import NumericInput from '@/components/common/NumericInput';
import { ArrowDownToLine, Save, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    suggestedAmount?: number;
    reasonHint?: string;
    onSuccess?: () => void;
}

type Origen =
    | 'APORTE_DUENO'
    | 'REPOSICION_BANCO'
    | 'PRESTAMO'
    | 'OTRO';

const ORIGENES: { value: Origen; label: string; hint: string }[] = [
    { value: 'APORTE_DUENO', label: 'Aporte del dueño', hint: 'Capital propio inyectado' },
    { value: 'REPOSICION_BANCO', label: 'Reposición desde banco', hint: 'Retiro bancario para caja' },
    { value: 'PRESTAMO', label: 'Préstamo', hint: 'Crédito de terceros' },
    { value: 'OTRO', label: 'Otro origen', hint: 'Justificar abajo' },
];

const fmtBob = (n?: number) =>
    new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n || 0);

export default function CapitalInjectionModal({
    isOpen,
    onClose,
    suggestedAmount,
    reasonHint,
    onSuccess,
}: Props) {
    const { user } = useAuth();
    const { currentBranch } = useBranch();
    const [amount, setAmount] = useState('');
    const [origen, setOrigen] = useState<Origen>('APORTE_DUENO');
    const [justificacion, setJustificacion] = useState('');
    const [shift, setShift] = useState<CashierSession | null>(null);
    const [loadingShift, setLoadingShift] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setAmount(suggestedAmount && suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '');
        setOrigen('APORTE_DUENO');
        setJustificacion(reasonHint || '');
        if (currentBranch?.id && user?.uid) {
            setLoadingShift(true);
            CashierSessionService.getOperableSession(user.uid, currentBranch.id)
                .then((s) => setShift(s))
                .catch(() => setShift(null))
                .finally(() => setLoadingShift(false));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const amt = Number(amount) || 0;
    const noShift = !shift && !loadingShift;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (amt <= 0) {
            toast.error('Monto debe ser mayor a 0');
            return;
        }
        if (!justificacion.trim() || justificacion.trim().length < 5) {
            toast.error('Justificación obligatoria (mín. 5 caracteres)');
            return;
        }
        if (noShift) {
            toast.error('No hay caja abierta. Abre un turno antes de inyectar capital.');
            return;
        }
        setSaving(true);
        try {
            const origenLabel = ORIGENES.find(o => o.value === origen)?.label || origen;
            const { accountId, sessionId } = await JournalService.resolveAccountId({
                branchId: currentBranch!.id!,
                paymentMethod: 'EFECTIVO',
                cashierId: user?.uid,
            });
            await JournalService.createEntry({
                accountId,
                amount: amt,
                paymentMethod: 'EFECTIVO',
                category: 'INYECCION_CAPITAL',
                description: `Inyección de capital · ${origenLabel} · ${justificacion.trim()}`,
                referenceType: 'CAPITAL_INJECTION',
                referenceId: shift!.id!,
                sessionId,
                branchId: currentBranch!.id!,
                userId: user?.uid || 'unknown',
                userName: user?.email || 'unknown',
            });
            toast.success(`Capital registrado · ${fmtBob(amt)}`);
            onSuccess?.();
            onClose();
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'Error al registrar capital');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title="Ingreso de Capital"
            subtitle="Registra dinero que entra a la bóveda fuera de las ventas"
            icon={<ArrowDownToLine size={24} strokeWidth={2.5} />}
            iconBg="bg-blue-500"
            iconColor="text-white"
            maxWidth="max-w-lg"
        >
            <form onSubmit={handleSubmit} className="pt-4 space-y-5">
                {noShift && (
                    <div className="rounded-xl p-3 flex items-start gap-2 text-[11px] bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span>No hay caja abierta en {currentBranch?.name || 'esta sucursal'}. Abre un turno desde el módulo Caja antes de continuar.</span>
                    </div>
                )}

                {/* Monto */}
                <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2 ml-1">
                        Monto a ingresar (BOB)
                    </label>
                    <NumericInput
                        value={amount}
                        onChange={(v) => setAmount(v)}
                        placeholder="0.00"
                        className="w-full text-2xl font-black p-4 rounded-2xl bg-slate-100/50 dark:bg-white/5 border-2 border-transparent focus:border-blue-500 outline-none transition-all"
                    />
                </div>

                {/* Origen */}
                <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2 ml-1">
                        Origen del dinero
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        {ORIGENES.map(o => (
                            <button
                                key={o.value}
                                type="button"
                                onClick={() => setOrigen(o.value)}
                                className={clsx(
                                    'p-3 rounded-xl border-2 transition-all text-left active:scale-[0.98]',
                                    origen === o.value
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                                        : 'border-slate-200 dark:border-white/10 hover:border-slate-300'
                                )}
                            >
                                <div className="text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                    {o.label}
                                </div>
                                <div className="text-[9px] text-slate-500 mt-0.5">{o.hint}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Justificación */}
                <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2 ml-1">
                        Justificación (obligatoria)
                    </label>
                    <textarea
                        value={justificacion}
                        onChange={(e) => setJustificacion(e.target.value)}
                        rows={3}
                        placeholder="Ej: Retiro de cuenta XYZ para pagar compra de proveedor ABC."
                        className="w-full p-3 rounded-xl bg-slate-100/50 dark:bg-white/5 border-2 border-transparent focus:border-blue-500 outline-none text-sm font-bold resize-none"
                    />
                </div>

                {/* Acciones */}
                <div className="pt-4 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 h-11 rounded-xl font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={saving || amt <= 0 || noShift}
                        className="flex-2 bg-blue-600 hover:bg-blue-500 text-white h-11 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <Save size={14} strokeWidth={3} />
                        {saving ? 'Procesando...' : `Registrar ${fmtBob(amt)}`}
                    </button>
                </div>
            </form>
        </IndustrialModal>
    );
}
