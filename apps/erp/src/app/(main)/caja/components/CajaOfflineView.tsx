'use client';
import { useState } from 'react';
import { WifiOff, Wallet, CheckCircle } from 'lucide-react';
import { enqueueOfflineExpense, ExpenseCategoryCode } from '@/hooks/useOfflineExpenseQueue';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';

const EXPENSE_CATEGORIES: { value: ExpenseCategoryCode; label: string }[] = [
    { value: 'TRANSPORTE',   label: 'Transporte / Fletes' },
    { value: 'LIMPIEZA',     label: 'Materiales de limpieza' },
    { value: 'SERVICIOS',    label: 'Servicios (agua, luz, internet)' },
    { value: 'ALIMENTACION', label: 'Alimentación del personal' },
    { value: 'MANTENIMIENTO',label: 'Mantenimiento' },
    { value: 'MARKETING',    label: 'Marketing / Publicidad' },
    { value: 'OTROS',        label: 'Otros' },
];

export default function CajaOfflineView() {
    const { user, userName } = useAuth();
    const { currentBranch } = useBranch();
    const { pendingCount: salesPending } = useOfflineQueue();

    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState<ExpenseCategoryCode>(EXPENSE_CATEGORIES[0].value);
    const [description, setDescription] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'EFECTIVO' | 'QR'>('EFECTIVO');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = () => {
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) { toast.error('Ingresa un monto válido'); return; }
        if (!description.trim()) { toast.error('Describe el gasto'); return; }
        if (!user || !currentBranch?.id) { toast.error('Sin sesión activa'); return; }

        enqueueOfflineExpense({
            amount: amt,
            category,
            description: description.trim(),
            paymentMethod,
            userId: user.uid,
            userName: userName || user.email || 'Cajero',
            branchId: currentBranch.id,
            date: new Date().toISOString(),
        });

        toast.success('Gasto registrado en cola offline', {
            description: 'Se subirá automáticamente al reconectarse',
        });

        setAmount('');
        setDescription('');
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 3000);
    };

    return (
        <div className="flex flex-col gap-5 max-w-lg mx-auto mt-8 px-4">
            {/* Banner offline */}
            <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                <WifiOff size={18} className="text-amber-500 shrink-0" />
                <div>
                    <p className="text-[11px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                        Caja en modo offline
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Apertura, cierre y transferencias requieren conexión.
                        Solo puedes registrar gastos que se sincronizarán al reconectarte.
                    </p>
                </div>
            </div>

            {/* Ventas en cola */}
            {salesPending > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                    <Wallet size={16} className="text-blue-500 shrink-0" />
                    <p className="text-[11px] font-black text-blue-600 dark:text-blue-400">
                        {salesPending} venta{salesPending !== 1 ? 's' : ''} en cola · se sincronizará{salesPending !== 1 ? 'n' : ''} al reconectarte
                    </p>
                </div>
            )}

            {/* Formulario de gasto offline */}
            <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-3xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-white/10 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center">
                        <Wallet size={16} className="text-rose-500" />
                    </div>
                    <div>
                        <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">Registrar gasto offline</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Se procesará cuando vuelva la conexión</p>
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    {/* Monto */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                            Monto (Bs.) <span className="text-rose-500">*</span>
                        </label>
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 transition-all"
                        />
                    </div>

                    {/* Categoría */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Categoría</label>
                        <select
                            value={category}
                            onChange={e => setCategory(e.target.value as ExpenseCategoryCode)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 transition-all"
                        >
                            {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </div>

                    {/* Descripción */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                            Descripción <span className="text-rose-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Detalle del gasto..."
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 transition-all"
                        />
                    </div>

                    {/* Método de pago */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Método</label>
                        <div className="flex gap-2">
                            {(['EFECTIVO', 'QR'] as const).map(m => (
                                <button
                                    key={m}
                                    onClick={() => setPaymentMethod(m)}
                                    className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${
                                        paymentMethod === m
                                            ? 'bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black'
                                            : 'bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10'
                                    }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleSubmit}
                        className="w-full py-3.5 rounded-2xl bg-rose-500 text-white text-[11px] font-black uppercase tracking-widest hover:bg-rose-600 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        {submitted ? <><CheckCircle size={14} /> Gasto en cola</> : 'Registrar Gasto Offline'}
                    </button>
                </div>
            </div>
        </div>
    );
}
