'use client';

import { useState, useEffect } from 'react';
import { SaleService } from '@/services/SaleService';
import { TreasuryConfigService } from '@/services/TreasuryConfigService';
import { CashierSessionService } from '@/services/CashierSessionService';
import { CashierSession } from '@/types/treasury';
import { DollarSign, CreditCard, Banknote, Building2, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import IndustrialModal, { IndustrialTheme } from '@/components/common/IndustrialModal';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import clsx from 'clsx';
import NumericInput from '@/components/common/NumericInput';

interface AbonoModalProps {
    isOpen: boolean;
    onClose: () => void;
    clientId: string;
    clientName: string;
    arId: string; // Account Receivable ID
    currentBalance: number;
    onSuccess: () => void;
}

type PaymentMethod = 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';

export default function AbonoModal({
    isOpen,
    onClose,
    clientId,
    clientName,
    arId,
    currentBalance,
    onSuccess
}: AbonoModalProps) {
    const { user, branchId } = useAuth();
    const [amount, setAmount] = useState<string>('');
    const [method, setMethod] = useState<PaymentMethod>('EFECTIVO');
    const [loading, setLoading] = useState(false);
    const [reference, setReference] = useState('');
    const [requireBankRef, setRequireBankRef] = useState(false);
    const [currentShift, setCurrentShift] = useState<CashierSession | null>(null);

    useEffect(() => {
        TreasuryConfigService.get().then(cfg => setRequireBankRef(!!cfg.requireBankRefForDigital)).catch(() => {});
    }, []);

    useEffect(() => {
        if (!isOpen || !user?.uid || !branchId) { setCurrentShift(null); return; }
        CashierSessionService.getOperableSession(user.uid, branchId)
            .then(s => setCurrentShift(s))
            .catch(() => setCurrentShift(null));
    }, [isOpen, user?.uid, branchId]);

    const theme: IndustrialTheme = 'stealth';

    const handleRegister = async () => {
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            toast.error("Monto inválido");
            return;
        }

        if (numAmount > currentBalance) {
            toast.error("El abono no puede exceder el saldo deudor");
            return;
        }

        if ((method === 'QR' || method === 'TRANSFERENCIA') && requireBankRef && !reference.trim()) {
            toast.error('Referencia bancaria obligatoria para QR/Transferencia (configurado en Tesorería).');
            return;
        }

        if (!currentShift) {
            toast.error('Debes abrir una sesión de caja en esta sucursal antes de registrar el cobro.');
            return;
        }

        setLoading(true);
        try {
            await SaleService.registerPayment(
                arId,
                clientId,
                numAmount,
                method,
                user?.uid || '',
                branchId || '',
                reference
            );

            toast.success("Abono registrado exitosamente");
            onSuccess();
            onClose();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Error al registrar abono';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const footer = (
        <div className="flex gap-3 w-full">
            <button
                onClick={onClose}
                className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
            >
                Cancelar
            </button>
            <button
                onClick={handleRegister}
                disabled={loading || !amount || parseFloat(amount) <= 0 || !currentShift}
                style={{ backgroundColor: 'var(--industrial-accent)' }}
                className="flex-2 h-12 rounded-xl text-slate-950 text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-500/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
            >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                Confirmar Transacción
            </button>
        </div>
    );

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title="Registro de Abono"
            subtitle={`CARTERA DE CRÉDITO • ${clientName.toUpperCase()}`}
            icon={<DollarSign size={20} />}
            theme={theme}
            maxWidth="max-w-md"
            footer={footer}
        >
            <div className="space-y-6">
                {/* Balance Summary */}
                <div className="p-6 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl flex flex-col items-center">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Saldo Deudor Actual</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-xs font-black text-slate-400">Bs.</span>
                        <span className="text-4xl font-black text-slate-900 dark:text-white font-mono tracking-tighter">{currentBalance.toFixed(2)}</span>
                    </div>
                </div>

                {/* Input Amount */}
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Monto a Abonar</label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                            <Banknote size={16} />
                        </div>
                        <NumericInput
                            value={amount}
                            onChange={setAmount}
                            placeholder="0.00"
                            className="w-full h-14 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-12 pr-4 text-lg font-black font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                        />
                    </div>
                </div>

                {/* Method Selector */}
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Método de Pago</label>
                    <div className="grid grid-cols-3 gap-2">
                        <MethodButton 
                            active={method === 'EFECTIVO'} 
                            onClick={() => setMethod('EFECTIVO')} 
                            label="Efectivo" 
                            icon={<Banknote size={16} />} 
                        />
                        <MethodButton 
                            active={method === 'QR'} 
                            onClick={() => setMethod('QR')} 
                            label="Pago QR" 
                            icon={<CreditCard size={16} />} 
                        />
                        <MethodButton 
                            active={method === 'TRANSFERENCIA'} 
                            onClick={() => setMethod('TRANSFERENCIA')} 
                            label="Transfer." 
                            icon={<Building2 size={16} />} 
                        />
                    </div>
                </div>

                {/* Reference */}
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Referencia / Observación ({(method === 'QR' || method === 'TRANSFERENCIA') && requireBankRef ? 'Obligatoria' : 'Opcional'})</label>
                    <textarea
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        className="w-full h-20 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-[11px] font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none resize-none uppercase"
                    />
                </div>

                {parseFloat(amount) > 0 && (
                    <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <AlertTriangle className="text-indigo-500 shrink-0 mt-0.5" size={14} />
                        <div>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-1">Nuevo Balance Proyectado</p>
                            <p className="text-sm font-black text-indigo-100 font-mono">
                                Bs. {(currentBalance - parseFloat(amount || '0')).toFixed(2)}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </IndustrialModal>
    );
}

function MethodButton({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "h-20 flex flex-col items-center justify-center gap-2 rounded-xl border transition-all active:scale-95 group",
                active 
                    ? "bg-indigo-500/10 border-indigo-500 text-indigo-500 shadow-sm shadow-indigo-500/5" 
                    : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20"
            )}
        >
            <div className={clsx(
                "p-2 rounded-xl transition-colors",
                active ? "bg-indigo-500 text-white" : "bg-slate-100 dark:bg-white/5 group-hover:bg-slate-200 dark:group-hover:bg-white/10"
            )}>
                {icon}
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
        </button>
    );
}
