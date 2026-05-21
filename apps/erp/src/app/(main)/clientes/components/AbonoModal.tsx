'use client';

import { useState, useEffect } from 'react';
import { ClientService } from '@/services/ClientService';
import { TreasuryConfigService } from '@/services/TreasuryConfigService';
import { CashierSessionService } from '@/services/CashierSessionService';
import { CashierSession } from '@/types/treasury';
import { Banknote, QrCode, Building2, Loader2, CheckCircle2, AlertCircle, History } from 'lucide-react';
import IndustrialModal, { IndustrialTheme } from '@/components/common/IndustrialModal';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/common/dialogs';
import clsx from 'clsx';
import NumericInput from '@/components/common/NumericInput';

interface AbonoModalProps {
    isOpen: boolean;
    onClose: () => void;
    client: {
        id: string;
        razonSocial: string;
        nit?: string;
        balance: number;
    };
    onSuccess: () => void;
}

type PaymentMethod = 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';

export default function AbonoModal({
    isOpen,
    onClose,
    client,
    onSuccess
}: AbonoModalProps) {
    const { user, branchId } = useAuth();
    const [method, setMethod] = useState<PaymentMethod>('EFECTIVO');
    const [amount, setAmount] = useState<number>(0);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
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

    const handleProcess = async () => {
        if (amount <= 0) {
            toast.error("El monto debe ser mayor a cero");
            return;
        }

        if (amount > client.balance) {
            const ok = await confirmDialog({
                title: 'Saldo a favor',
                message: `El monto (${amount}) supera el saldo pendiente (${client.balance}). ¿Desea registrar saldo a favor?`,
                variant: 'warning',
                confirmText: 'Registrar',
            });
            if (!ok) return;
        }

        if (!branchId || !user?.uid) {
            toast.error("Sesión industrial no válida");
            return;
        }

        if ((method === 'QR' || method === 'TRANSFERENCIA') && requireBankRef && !notes.trim()) {
            toast.error('Referencia bancaria obligatoria para QR/Transferencia (configurado en Tesorería).');
            return;
        }

        if (!currentShift) {
            toast.error('Debes abrir una sesión de caja en esta sucursal antes de registrar el cobro.');
            return;
        }

        setLoading(true);
        try {
            await ClientService.registerPayment(
                client.id,
                amount,
                method,
                user.uid,
                user.email || 'Admin',
                branchId,
                notes || 'Abono manual registrado en plataforma de control de socios',
            );

            toast.success("Pago registrado exitosamente");
            onSuccess();
            onClose();
        } catch (error: unknown) {
            console.error("Error processing payment:", error);
            const msg = error instanceof Error ? error.message : "Error al registrar pago";
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
                onClick={handleProcess}
                disabled={loading || amount <= 0 || !currentShift}
                style={{ backgroundColor: 'var(--industrial-accent)' }}
                className="flex-2 h-12 rounded-xl text-slate-950 text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
            >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                Confirmar Recaudación de Fondos
            </button>
        </div>
    );

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title="Recaudación de Cartera"
            subtitle={`SOCIO IDENTIFICADO • ${client.razonSocial.toUpperCase()}`}
            icon={<Banknote size={20} />}
            theme={theme}
            maxWidth="max-w-md"
            footer={footer}
        >
            <div className="space-y-6">
                {/* Client Status Summary */}
                <div className="p-4 bg-slate-900 border border-white/5 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                            <History size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Saldo Pendiente</p>
                            <p className="text-xl font-black text-white font-mono">{client.balance.toFixed(2)} <span className="text-[10px] text-slate-400">Bs.</span></p>
                        </div>
                    </div>
                </div>

                {/* Amount Input */}
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Monto a Recaudar (Bs.)</label>
                    <div className="relative">
                        <NumericInput
                            value={amount || ''}
                            onChange={(val) => setAmount(Number(val))}
                            placeholder="0.00"
                            className="w-full h-16 bg-white dark:bg-white/5 border-2 border-slate-200 dark:border-white/10 rounded-2xl px-6 text-2xl font-black font-mono focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none"
                        />
                        {amount === client.balance && amount > 0 && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 px-3 py-1 bg-emerald-500 text-white rounded-xl text-[8px] font-black uppercase tracking-[0.2em] shadow-lg animate-in zoom-in-50">
                                Saldo Total
                            </div>
                        )}
                    </div>
                </div>

                {/* Payment Method Selector */}
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Método de Captación de Capital</label>
                    <div className="grid grid-cols-3 gap-2">
                        <PaymentMethodButton 
                            active={method === 'EFECTIVO'} 
                            onClick={() => setMethod('EFECTIVO')} 
                            label="Efectivo" 
                            icon={<Banknote size={16} />} 
                        />
                        <PaymentMethodButton 
                            active={method === 'QR'} 
                            onClick={() => setMethod('QR')} 
                            label="Código QR" 
                            icon={<QrCode size={16} />} 
                        />
                        <PaymentMethodButton 
                            active={method === 'TRANSFERENCIA'} 
                            onClick={() => setMethod('TRANSFERENCIA')} 
                            label="Transferencia" 
                            icon={<Building2 size={16} />} 
                        />
                    </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Notas / Referencia de Pago{(method === 'QR' || method === 'TRANSFERENCIA') && requireBankRef ? ' (Obligatoria)' : ''}</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ej: Pago de factura #1234, Transferencia bancaria, etc."
                        className="w-full h-20 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-[11px] font-bold focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all outline-none resize-none uppercase"
                    />
                </div>

                <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl flex items-start gap-3">
                    <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={14} />
                    <p className="text-[9px] font-bold text-amber-500/80 uppercase leading-relaxed tracking-wider italic">
                        Esta operación es definitiva. El ingreso se registrará en la caja de la sucursal actual y el saldo del socio se actualizará en tiempo real.
                    </p>
                </div>
            </div>
        </IndustrialModal>
    );
}

function PaymentMethodButton({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "h-20 flex flex-col items-center justify-center gap-1.5 rounded-xl border transition-all active:scale-95 group relative overflow-hidden",
                active 
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-sm shadow-emerald-500/5" 
                    : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20"
            )}
        >
            <div className={clsx(
                "p-2 rounded-xl transition-colors",
                active ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-slate-100 dark:bg-white/5 group-hover:bg-slate-200 dark:group-hover:bg-white/10"
            )}>
                {icon}
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest leading-none">{label}</span>
        </button>
    );
}
