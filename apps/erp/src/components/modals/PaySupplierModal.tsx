'use client';

import { useState, useMemo, useEffect } from 'react';
import { SupplierAccount } from '@/types';
import { SupplierAccountService } from '@/services/SupplierAccountService';
import { CashierSessionService } from '@/services/CashierSessionService';
import { TreasuryConfigService } from '@/services/TreasuryConfigService';
import { CashierSession } from '@/types/treasury';
import IndustrialModal from '@/components/common/IndustrialModal';
import NumericInput from '@/components/common/NumericInput';
import { Wallet, Banknote, QrCode, Send, Save, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { logAdminAction } from '@/lib/audit';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    account: SupplierAccount | null;
    onSuccess?: () => void;
}

type PayMethod = 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';

const fmtBob = (n?: number) =>
    new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n || 0);

export default function PaySupplierModal({ isOpen, onClose, account, onSuccess }: Props) {
    const { user } = useAuth();
    const { currentBranch } = useBranch();
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<PayMethod>('EFECTIVO');
    const [reference, setReference] = useState('');
    const [saving, setSaving] = useState(false);
    const [shift, setShift] = useState<CashierSession | null>(null);
    const [loadingShift, setLoadingShift] = useState(false);
    const [requireBankRef, setRequireBankRef] = useState(false);

    useEffect(() => {
        TreasuryConfigService.get().then(cfg => setRequireBankRef(!!cfg.requireBankRefForDigital)).catch(() => {});
    }, []);

    const debt = Number(account?.saldo || 0);
    const amt = Number(amount) || 0;

    useEffect(() => {
        if (!isOpen) return;
        setAmount(debt > 0 ? debt.toFixed(2) : '');
        setMethod('EFECTIVO');
        setReference('');
        // Buscar sesión abierta del cajero actual
        if (user?.uid && currentBranch?.id) {
            setLoadingShift(true);
            CashierSessionService.getOperableSession(user.uid, currentBranch.id)
                .then((s) => setShift(s))
                .catch(() => setShift(null))
                .finally(() => setLoadingShift(false));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, account?.id]);

    const remaining = useMemo(() => debt - amt, [debt, amt]);
    const overpay = amt > debt && debt > 0;

    const cashUnavailable = !shift;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!account?.id) return;
        if (amt <= 0) {
            toast.error('Monto debe ser mayor a 0');
            return;
        }
        if (cashUnavailable) {
            toast.error('Debes abrir una sesión de caja en esta sucursal antes de pagar al proveedor.');
            return;
        }
        // BUG-FIX: bloquear overpay para evitar saldos negativos accidentales.
        // Si la deuda es 0 o negativa (proveedor a favor), no permitir más pagos.
        if (debt <= 0) {
            toast.error('Esta cuenta no tiene deuda pendiente.');
            return;
        }
        if (amt > debt + 0.01) {
            toast.error(`El monto excede la deuda. Máximo: ${fmtBob(debt)}`);
            return;
        }
        if ((method === 'QR' || method === 'TRANSFERENCIA') && requireBankRef && !reference.trim()) {
            toast.error('Referencia bancaria obligatoria para QR/Transferencia (configurado en Tesorería).');
            return;
        }
        setSaving(true);
        try {
            await SupplierAccountService.payAtomic({
                supplierAccountId: account.id,
                amount: amt,
                paymentMethod: method,
                branchId: currentBranch!.id!,
                userId: user?.uid || 'unknown',
                userName: user?.email || 'unknown',
                cashierId: user?.uid,
                reference: reference || undefined,
                descriptionExtra: `${account.empresaNombre}${account.alias ? ` (${account.alias})` : ''}`,
            });

            // Audit log adicional para pagos no-EFECTIVO (con detalle bancario)
            if (method === 'QR' || method === 'TRANSFERENCIA') {
                await logAdminAction(
                    user?.uid || 'unknown',
                    user?.email || 'unknown',
                    'PAYMENT_SUPPLIER_NONCASH',
                    account.id,
                    currentBranch?.id || 'HQ',
                    `${method} · Bs. ${amt.toFixed(2)} → ${account.empresaNombre}${account.alias ? ` (${account.alias})` : ''}${reference ? ` · Ref: ${reference}` : ''}`
                ).catch(err => console.error('Audit log falló (no bloqueante):', err));
            }

            toast.success(`Pago registrado · ${fmtBob(amt)}`);
            onSuccess?.();
            onClose();
        } catch (err) {
            console.error(err);
            const msg = err instanceof Error ? err.message : 'Error al registrar pago';
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen || !account) return null;

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title="Pagar a Proveedor"
            subtitle={`${account.empresaNombre}${account.alias ? ` · ${account.alias}` : ''}`}
            icon={<Wallet size={24} strokeWidth={2.5} />}
            iconBg="bg-emerald-500"
            iconColor="text-white"
            maxWidth="max-w-lg"
        >
            <form onSubmit={handleSubmit} className="pt-4 space-y-5">
                {/* Saldo actual */}
                <div className={clsx(
                    'rounded-2xl p-4 border',
                    debt > 0
                        ? 'bg-rose-50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20'
                        : debt < 0
                            ? 'bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20'
                            : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10'
                )}>
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-500">
                            {debt > 0 ? 'Saldo pendiente' : debt < 0 ? 'A favor' : 'Sin saldo'}
                        </span>
                        <span className={clsx(
                            'text-xl font-black tabular-nums',
                            debt > 0 ? 'text-rose-600 dark:text-rose-400' : debt < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                        )}>
                            {fmtBob(Math.abs(debt))}
                        </span>
                    </div>
                </div>

                {/* Monto */}
                <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2 ml-1">
                        Monto a pagar (BOB)
                    </label>
                    <NumericInput
                        value={amount}
                        onChange={(v) => setAmount(v)}
                        placeholder="0.00"
                        className="w-full text-2xl font-black p-4 rounded-2xl bg-slate-100/50 dark:bg-white/5 border-2 border-transparent focus:border-emerald-500 outline-none transition-all"
                    />
                    {debt > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                            <button
                                type="button"
                                onClick={() => setAmount(debt.toFixed(2))}
                                className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 underline-offset-2 hover:underline"
                            >
                                Pagar todo ({fmtBob(debt)})
                            </button>
                            <span className="text-slate-300">·</span>
                            <button
                                type="button"
                                onClick={() => setAmount((debt / 2).toFixed(2))}
                                className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700"
                            >
                                Mitad
                            </button>
                        </div>
                    )}
                </div>

                {/* Método de pago */}
                <div>
                    <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2 ml-1">
                        Método de pago
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { v: 'EFECTIVO' as PayMethod, label: 'Efectivo', icon: Banknote },
                            { v: 'QR' as PayMethod, label: 'QR', icon: QrCode },
                            { v: 'TRANSFERENCIA' as PayMethod, label: 'Transf.', icon: Send },
                        ].map(({ v, label, icon: Icon }) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setMethod(v)}
                                className={clsx(
                                    'flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all active:scale-95',
                                    method === v
                                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                        : 'border-slate-200 dark:border-white/10 text-slate-500 hover:border-slate-300'
                                )}
                            >
                                <Icon size={16} strokeWidth={2.5} />
                                <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Referencia (QR/Transferencia) */}
                {(method === 'QR' || method === 'TRANSFERENCIA') && (
                    <div>
                        <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2 ml-1">
                            Referencia ({requireBankRef ? 'obligatoria' : 'opcional'})
                        </label>
                        <input
                            type="text"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder="Nº comprobante, código de transacción..."
                            required={requireBankRef}
                            className="w-full p-3 rounded-xl bg-slate-100/50 dark:bg-white/5 border-2 border-transparent focus:border-emerald-500 outline-none text-sm font-bold"
                        />
                    </div>
                )}

                {/* Aviso de caja para EFECTIVO */}
                {method === 'EFECTIVO' && (
                    <div className={clsx(
                        'rounded-xl p-3 flex items-start gap-2 text-[11px]',
                        cashUnavailable
                            ? 'bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400'
                            : 'bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400'
                    )}>
                        {cashUnavailable ? <AlertTriangle size={14} className="shrink-0 mt-0.5" /> : <Info size={14} className="shrink-0 mt-0.5" />}
                        <span>
                            {loadingShift
                                ? 'Verificando turno de caja...'
                                : cashUnavailable
                                    ? 'No hay caja abierta. Para pagar en efectivo necesitas abrir un turno desde Caja.'
                                    : `Se descontará Bs. ${amt.toFixed(2)} de la caja abierta y se registrará como movimiento PAGO_PROVEEDOR.`}
                        </span>
                    </div>
                )}

                {/* Resumen */}
                {amt > 0 && (
                    <div className="rounded-2xl bg-slate-50 dark:bg-white/5 p-4 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Saldo actual:</span>
                            <span className="font-bold tabular-nums">{fmtBob(debt)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">Pago:</span>
                            <span className="font-bold tabular-nums text-emerald-600">− {fmtBob(amt)}</span>
                        </div>
                        <div className="flex justify-between pt-1.5 border-t border-slate-200 dark:border-white/10">
                            <span className="font-black uppercase text-[10px] tracking-widest">Saldo después:</span>
                            <span className={clsx(
                                'font-black tabular-nums',
                                remaining > 0 ? 'text-rose-500' : remaining < 0 ? 'text-emerald-500' : 'text-slate-500'
                            )}>
                                {fmtBob(remaining)}
                            </span>
                        </div>
                        {overpay && (
                            <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                                <AlertTriangle size={11} /> El pago supera la deuda — quedará a favor.
                            </p>
                        )}
                    </div>
                )}

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
                        disabled={saving || amt <= 0 || cashUnavailable}
                        className="flex-2 bg-emerald-600 hover:bg-emerald-500 text-white h-11 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <Save size={14} strokeWidth={3} />
                        {saving ? 'Procesando...' : `Registrar pago · ${fmtBob(amt)}`}
                    </button>
                </div>
            </form>
        </IndustrialModal>
    );
}
