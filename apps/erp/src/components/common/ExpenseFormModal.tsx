'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Calendar, Tag, FileText, Building2, Hash, Wallet, QrCode, Banknote, Image as ImageIcon, X as XIcon, AlertTriangle, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import clsx from 'clsx';
import { ExpenseService } from '@/services/ExpenseService';
import { JournalService } from '@/services/JournalService';
import { CashierSessionService } from '@/services/CashierSessionService';
import { TreasuryConfigService } from '@/services/TreasuryConfigService';
import { OperationalExpense } from '@/types';
import { CashierSession, JournalCategory } from '@/types/treasury';
import { midday, localDateStr } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useConfig } from '@/contexts/ConfigContext';
import IndustrialModal from '@/components/common/IndustrialModal';
import NumericInput from '@/components/common/NumericInput';
import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { processAndCompressImage } from '@/utils/imageProcessing';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/common/dialogs';
import { isEncargadoVentas } from '@/utils/roles';

// Umbral por encima del cual se requiere doble confirmación del usuario.
const LARGE_AMOUNT_THRESHOLD = 500;
const DEFAULT_CASHIER_EXPENSE_LIMIT = 200; // Bs. fallback si la sucursal no tiene cashierExpenseLimit configurado

// Categorías de gasto operativo (van al libro de gastos + asiento automático).
const EXPENSE_CATEGORIES: { value: OperationalExpense['category']; label: string }[] = [
    { value: 'ALQUILER', label: 'Alquiler' },
    { value: 'SERVICIOS', label: 'Servicios (Luz, Agua, Internet)' },
    { value: 'TRANSPORTE', label: 'Transporte / Fletes' },
    { value: 'ALIMENTACION', label: 'Alimentación' },
    { value: 'LIMPIEZA', label: 'Limpieza / Insumos' },
    { value: 'MARKETING', label: 'Marketing / Publicidad' },
    { value: 'MANTENIMIENTO', label: 'Mantenimiento / Reparaciones' },
    { value: 'SUELDOS', label: 'Sueldos / Honorarios' },
    { value: 'IMPUESTOS', label: 'Impuestos / Tasas' },
    { value: 'OTROS', label: 'Otros (especificar)' },
];

// Categorías de tesorería (solo Gerencia). Generan asiento contable directo, no entran al libro de gastos operativos.
type TreasuryEgresoCategory = 'DEPOSITO_BANCO' | 'RETIRO_UTILIDADES' | 'AJUSTE_NEGATIVO';
type TreasuryIngresoCategory = 'INYECCION_CAPITAL' | 'AJUSTE_POSITIVO';
type TreasuryCategory = TreasuryEgresoCategory | TreasuryIngresoCategory;

const TREASURY_EGRESO_CATEGORIES: { value: TreasuryEgresoCategory; label: string }[] = [
    { value: 'DEPOSITO_BANCO', label: 'Depósito al banco' },
    { value: 'RETIRO_UTILIDADES', label: 'Retiro de utilidades' },
    { value: 'AJUSTE_NEGATIVO', label: 'Ajuste negativo (faltante)' },
];

const TREASURY_INGRESO_CATEGORIES: { value: TreasuryIngresoCategory; label: string }[] = [
    { value: 'INYECCION_CAPITAL', label: 'Inyección de capital (aporte de dueño)' },
    { value: 'AJUSTE_POSITIVO', label: 'Ajuste positivo (sobrante)' },
];

const TREASURY_CATEGORIES: TreasuryCategory[] = [
    ...TREASURY_EGRESO_CATEGORIES.map(c => c.value),
    ...TREASURY_INGRESO_CATEGORIES.map(c => c.value),
];

type FormCategory = OperationalExpense['category'] | TreasuryCategory;

function isTreasury(cat: FormCategory): cat is TreasuryCategory {
    return (TREASURY_CATEGORIES as string[]).includes(cat);
}
function isTreasuryIngreso(cat: FormCategory): cat is TreasuryIngresoCategory {
    return TREASURY_INGRESO_CATEGORIES.some(c => c.value === cat);
}

interface ExpenseFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated?: () => void;
}

export default function ExpenseFormModal({ isOpen, onClose, onCreated }: ExpenseFormModalProps) {
    const { user, userName, role } = useAuth();
    const { currentBranch } = useBranch();
    const { config } = useConfig();
    const [cashierLimit, setCashierLimit] = useState(DEFAULT_CASHIER_EXPENSE_LIMIT);
    const allowRetroactiveExpenses = config?.allowRetroactiveExpenses === true;
    const todayStr = localDateStr();

    const [direction, setDirection] = useState<'INGRESO' | 'EGRESO'>('EGRESO');
    const [formDate, setFormDate] = useState(todayStr);
    const [formAmount, setFormAmount] = useState('');
    const [formCategory, setFormCategory] = useState<FormCategory>('OTROS');
    const [formDescription, setFormDescription] = useState('');
    const [formSupplier, setFormSupplier] = useState('');
    const [formReceipt, setFormReceipt] = useState('');
    const [formCustomCategory, setFormCustomCategory] = useState('');
    const [formPaymentMethod, setFormPaymentMethod] = useState<'EFECTIVO' | 'QR' | 'TRANSFERENCIA'>('EFECTIVO');
    const [formReceiptFile, setFormReceiptFile] = useState<File | null>(null);
    const [uploadingReceipt, setUploadingReceipt] = useState(false);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [currentShift, setCurrentShift] = useState<CashierSession | null>(null);
    const [checkingShift, setCheckingShift] = useState(false);
    const [requireReceipt, setRequireReceipt] = useState(false);
    const [requireBankRef, setRequireBankRef] = useState(false);
    const [formBankRef, setFormBankRef] = useState('');

    const isToday = formDate === todayStr;
    const needsShift = isToday && !currentShift;
    const isRetroactive = !isToday;

    const resetForm = useCallback(() => {
        setDirection('EGRESO');
        setFormDate(localDateStr());
        setFormAmount('');
        setFormCategory('OTROS');
        setFormCustomCategory('');
        setFormDescription('');
        setFormSupplier('');
        setFormReceipt('');
        setFormBankRef('');
        setFormPaymentMethod('EFECTIVO');
        setFormReceiptFile(null);
    }, []);

    // Cuando cambia la dirección, ajusta categoría por defecto si la actual no aplica.
    useEffect(() => {
        if (direction === 'INGRESO') {
            if (!isTreasuryIngreso(formCategory)) {
                setFormCategory('INYECCION_CAPITAL');
            }
        } else {
            // EGRESO: si está en una de ingreso, vuelve a OTROS
            if (isTreasuryIngreso(formCategory)) {
                setFormCategory('OTROS');
            }
        }
    }, [direction, formCategory]);

    const checkShift = useCallback(async () => {
        if (!currentBranch?.id || !user?.uid) return;
        setCheckingShift(true);
        try {
            const valid = await CashierSessionService.getOperableSession(user.uid, currentBranch.id);
            setCurrentShift(valid);
        } catch { setCurrentShift(null); }
        finally { setCheckingShift(false); }
    }, [currentBranch?.id, user?.uid]);

    // Reset form and check shift when modal opens
    useEffect(() => {
        if (isOpen) {
            resetForm();
            checkShift();
            TreasuryConfigService.get()
                .then(cfg => {
                    setRequireReceipt(!!cfg.requireExpenseReceipt);
                    setRequireBankRef(!!cfg.requireBankRefForDigital);
                    setCashierLimit(cfg.cashierExpenseLimit ?? DEFAULT_CASHIER_EXPENSE_LIMIT);
                })
                .catch(() => {
                    setRequireReceipt(false);
                    setRequireBankRef(false);
                    setCashierLimit(DEFAULT_CASHIER_EXPENSE_LIMIT);
                });
        }
    }, [isOpen, resetForm, checkShift]);

    const parsedAmount = parseFloat(formAmount) || 0;

    // Saldo disponible en EFECTIVO en la sesión actual del cajero
    const cashBalance = 0; // Validación de saldo se hace en el servidor (txWriteEntry valida no-negativo)

    const insufficientCash = false; // El servidor valida
    const isLargeAmount = parsedAmount >= LARGE_AMOUNT_THRESHOLD;
    const isCashier = isEncargadoVentas(role);
    const treasuryMode = isTreasury(formCategory);
    // Solicitud de aprobación solo aplica a gastos operativos (libro de gastos) del cajero.
    const requiresManagerApproval = !treasuryMode && direction === 'EGRESO' && isCashier && parsedAmount > cashierLimit;

    const handleCreate = async () => {
        if (!user || !currentBranch?.id || !formAmount || !formDescription) return;

        // Comprobante (foto) obligatorio si la política de Tesorería lo exige (aplica a egresos).
        if (direction === 'EGRESO' && requireReceipt && !formReceiptFile) {
            toast.error('Comprobante (foto) obligatorio según configuración de Tesorería.');
            return;
        }

        // Referencia bancaria obligatoria para QR/TRANSFERENCIA si la política lo exige.
        if (formPaymentMethod !== 'EFECTIVO' && requireBankRef && !formBankRef.trim()) {
            toast.error('Número de referencia obligatorio para pagos QR/Transferencia según configuración de Tesorería.');
            return;
        }

        const finalDescription = formCategory === 'OTROS' && formCustomCategory
            ? `[${formCustomCategory.toUpperCase()}] ${formDescription}`
            : formDescription;

        // ============================================================
        // RUTA 1 — Movimiento de tesorería (asiento contable directo)
        // ============================================================
        if (treasuryMode) {
            if (isToday && !currentShift && formPaymentMethod === 'EFECTIVO') {
                // Para EFECTIVO de hoy se requiere caja abierta de la sucursal.
                const branchSess = await CashierSessionService.getCurrentBranchSession(currentBranch.id).catch(() => null);
                if (!branchSess) {
                    toast.error('No hay caja abierta en esta sucursal. Abre una para registrar movimientos en EFECTIVO.');
                    return;
                }
            }

            if (isLargeAmount) {
                const ok = await confirmDialog({
                    title: 'Confirmar movimiento elevado',
                    message: `Este movimiento es de Bs. ${parsedAmount.toFixed(2)}. ¿Confirmas el registro?`,
                    variant: 'warning',
                    confirmText: 'Registrar',
                });
                if (!ok) return;
            }

            setSaving(true);
            try {
                const { accountId, sessionId } = await JournalService.resolveAccountId({
                    branchId: currentBranch.id,
                    paymentMethod: formPaymentMethod,
                    cashierId: user.uid,
                });
                await JournalService.createEntry({
                    accountId,
                    amount: parsedAmount,
                    paymentMethod: formPaymentMethod,
                    category: formCategory as JournalCategory,
                    description: finalDescription,
                    referenceType: 'MANUAL_ADJUSTMENT',
                    referenceId: '',
                    sessionId,
                    branchId: currentBranch.id,
                    userId: user.uid,
                    userName: userName ?? '',
                    date: isToday ? new Date() : midday(formDate),
                    bankRef: formPaymentMethod !== 'EFECTIVO' ? (formBankRef.trim() || undefined) : undefined,
                });
                toast.success(`${direction === 'INGRESO' ? 'Ingreso' : 'Egreso'} registrado · Bs. ${parsedAmount.toFixed(2)}`);
                onClose();
                onCreated?.();
            } catch (error) {
                console.error('Error creating treasury entry:', error);
                toast.error(error instanceof Error ? error.message : 'No se pudo registrar el movimiento.');
            } finally {
                setSaving(false);
            }
            return;
        }

        // ============================================================
        // RUTA 2 — Gasto operativo (libro de gastos + asiento auto)
        // ============================================================

        // Modo SOLICITUD: CAJERO sobre el umbral envía como pendiente de aprobación.
        if (requiresManagerApproval) {
            const ok = await confirmDialog({
                title: 'Solicitud requiere aprobación',
                message: `Este gasto (Bs. ${parsedAmount.toFixed(2)}) requiere aprobación de un GERENTE. Se enviará como SOLICITUD pendiente. El egreso de caja se registrará cuando el GERENTE apruebe.`,
                variant: 'info',
                confirmText: 'Enviar solicitud',
            });
            if (!ok) return;

            setSaving(true);
            try {
                let receiptUrl: string | undefined;
                if (formReceiptFile) {
                    setUploadingReceipt(true);
                    try {
                        const compressed = await processAndCompressImage(formReceiptFile);
                        const path = `expenses/${currentBranch.id}/${Date.now()}_${formReceiptFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                        const sref = storageRef(storage, path);
                        await uploadBytes(sref, compressed);
                        receiptUrl = await getDownloadURL(sref);
                    } finally {
                        setUploadingReceipt(false);
                    }
                }
                await ExpenseService.createPending({
                    branchId: currentBranch.id,
                    date: isToday ? new Date() : midday(formDate),
                    amount: parsedAmount,
                    category: formCategory as OperationalExpense['category'],
                    description: finalDescription,
                    supplierName: formSupplier || undefined,
                    receiptNumber: formReceipt || undefined,
                    receiptUrl,
                    paymentMethod: formPaymentMethod,
                    bankRef: formPaymentMethod !== 'EFECTIVO' ? (formBankRef.trim() || undefined) : undefined,
                    userId: user.uid,
                    userName: userName ?? ''
                }, currentBranch.id);
                toast.success('Solicitud enviada. Un GERENTE deberá aprobarla en el panel de Gerencia.');
                onClose();
                onCreated?.();
            } catch (error) {
                console.error('Error sending expense for approval:', error);
                toast.error(error instanceof Error ? error.message : 'No se pudo enviar la solicitud.');
            } finally {
                setSaving(false);
            }
            return;
        }

        if (isToday && !currentShift) {
            toast.error('Debes abrir un turno de caja en esta sucursal para registrar movimientos de hoy.');
            return;
        }

        // Confirmación por monto grande
        if (isLargeAmount) {
            const ok = await confirmDialog({
                title: 'Confirmar gasto elevado',
                message: `Este gasto es de Bs. ${parsedAmount.toFixed(2)}. ¿Confirmas el registro?`,
                variant: 'warning',
                confirmText: 'Registrar',
            });
            if (!ok) return;
        }

        setSaving(true);
        try {
            // 1) Subir comprobante si lo hay
            let receiptUrl: string | undefined;
            if (formReceiptFile) {
                setUploadingReceipt(true);
                try {
                    const compressed = await processAndCompressImage(formReceiptFile);
                    const path = `expenses/${currentBranch.id}/${Date.now()}_${formReceiptFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                    const sref = storageRef(storage, path);
                    await uploadBytes(sref, compressed);
                    receiptUrl = await getDownloadURL(sref);
                } finally {
                    setUploadingReceipt(false);
                }
            }

            // 2) Crear el gasto operativo (el servicio asienta el EGRESO automáticamente,
            //    salvo gastos retroactivos que no impactan tesorería actual).
            const expensePayload: Omit<OperationalExpense, 'id' | 'status' | 'createdAt'> = {
                branchId: currentBranch.id,
                date: isToday ? new Date() : midday(formDate),
                amount: parsedAmount,
                category: formCategory as OperationalExpense['category'],
                description: finalDescription,
                supplierName: formSupplier || undefined,
                receiptNumber: formReceipt || undefined,
                receiptUrl,
                paymentMethod: formPaymentMethod,
                bankRef: formPaymentMethod !== 'EFECTIVO' ? (formBankRef.trim() || undefined) : undefined,
                userId: user.uid,
                userName: userName ?? ''
            };
            await ExpenseService.create(expensePayload, currentBranch.id);

            onClose();
            onCreated?.();
        } catch (error) {
            console.error('Error creating expense:', error);
            toast.error(error instanceof Error ? error.message : 'No se pudo registrar el gasto.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={direction === 'INGRESO' ? 'Registrar Ingreso' : treasuryMode ? 'Registrar Egreso de Tesorería' : 'Registrar Gasto Operativo'}
            subtitle={direction === 'INGRESO'
                ? 'Inyección de capital o ajuste positivo en caja.'
                : treasuryMode
                    ? 'Depósitos al banco, retiros, ajustes y otros movimientos especiales.'
                    : 'Libro de Gastos Generales — alquiler, servicios, transporte, sueldos y otros gastos de operación.'}
            icon={direction === 'INGRESO' ? <ArrowDownCircle size={24} /> : <ArrowUpCircle size={24} />}
            theme="stealth"
            maxWidth="max-w-lg"
            footer={
                <div className="flex gap-4 items-center">
                    <button
                        onClick={onClose}
                        className="px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={saving || !formAmount || !formDescription || (!requiresManagerApproval && needsShift && !treasuryMode) || (!treasuryMode && requireReceipt && !formReceiptFile)}
                        className={clsx(
                            "flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 shadow-xl",
                            saving || !formAmount || !formDescription || (!requiresManagerApproval && needsShift && !treasuryMode)
                                ? "bg-slate-100 dark:bg-white/5 text-slate-300 dark:text-slate-600 cursor-not-allowed"
                                : requiresManagerApproval
                                    ? "bg-amber-500 text-black hover:scale-[1.02] active:scale-95"
                                    : direction === 'INGRESO'
                                        ? "bg-emerald-600 text-white hover:scale-[1.02] active:scale-95"
                                        : "bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black hover:scale-[1.02] active:scale-95"
                        )}
                    >
                        {saving
                            ? 'Guardando...'
                            : requiresManagerApproval
                                ? 'Solicitar Aprobación'
                                : direction === 'INGRESO'
                                    ? 'Registrar Ingreso'
                                    : treasuryMode
                                        ? 'Registrar Egreso'
                                        : isToday ? 'Registrar + Egreso en Caja' : 'Registrar Gasto'}
                    </button>
                </div>
            }
        >
            <div className="space-y-5 p-1">
                {/* Direction toggle: INGRESO / EGRESO */}
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => setDirection('EGRESO')}
                        className={clsx(
                            'py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 flex items-center justify-center gap-2 transition-all',
                            direction === 'EGRESO'
                                ? 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400 shadow-sm'
                                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-500 hover:border-slate-300'
                        )}
                    >
                        <ArrowUpCircle size={14} /> Egreso
                    </button>
                    <button
                        type="button"
                        onClick={() => setDirection('INGRESO')}
                        className={clsx(
                            'py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 flex items-center justify-center gap-2 transition-all',
                            direction === 'INGRESO'
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shadow-sm'
                                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-500 hover:border-slate-300'
                        )}
                    >
                        <ArrowDownCircle size={14} /> Ingreso
                    </button>
                </div>

                {/* Date */}
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                        <Calendar size={10} strokeWidth={3} />
                        Fecha del Movimiento
                    </label>
                    <input
                        type="date"
                        value={formDate}
                        max={todayStr}
                        min={allowRetroactiveExpenses ? undefined : todayStr}
                        onChange={e => {
                            const v = e.target.value;
                            if (!allowRetroactiveExpenses && v < todayStr) {
                                toast.error('No puedes registrar movimientos con fecha pasada. Pide al gerente que autorice esta opción.');
                                return;
                            }
                            setFormDate(v);
                        }}
                        className="w-full bg-slate-50 dark:bg-[#111827]/50 border-2 border-slate-100 dark:border-white/10 rounded-2xl p-4 text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white focus:border-yellow-500 outline-none shadow-inner"
                    />
                    {isRetroactive && (
                        <p className="text-[9px] font-bold text-amber-500 ml-1">Registro retroactivo — se asienta con la fecha indicada en la cuenta correspondiente.</p>
                    )}
                    {isToday && !checkingShift && currentShift && (
                        <p className="text-[9px] font-bold text-emerald-500 ml-1">Se registrará como {direction === 'INGRESO' ? 'ingreso' : 'egreso'} en el turno abierto</p>
                    )}
                    {needsShift && !checkingShift && (
                        <p className="text-[9px] font-bold text-rose-500 ml-1">Debe abrir un turno de caja para movimientos de hoy</p>
                    )}
                    {checkingShift && (
                        <p className="text-[9px] font-bold text-slate-400 ml-1">Verificando turno...</p>
                    )}
                </div>

                {/* Category */}
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                        <Tag size={10} strokeWidth={3} />
                        Categoría
                    </label>
                    <select
                        value={formCategory}
                        onChange={e => setFormCategory(e.target.value as FormCategory)}
                        className="w-full bg-slate-50 dark:bg-[#111827]/50 border-2 border-slate-100 dark:border-white/10 rounded-2xl p-4 text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white focus:border-yellow-500 outline-none shadow-inner appearance-none"
                    >
                        {direction === 'INGRESO' ? (
                            <optgroup label="Ingresos de tesorería">
                                {TREASURY_INGRESO_CATEGORIES.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </optgroup>
                        ) : (
                            <>
                                <optgroup label="Gastos operativos (libro de gastos)">
                                    {EXPENSE_CATEGORIES.map(cat => (
                                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="Egresos especiales / tesorería">
                                    {TREASURY_EGRESO_CATEGORIES.map(c => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                </optgroup>
                            </>
                        )}
                    </select>
                    {formCategory === 'OTROS' && (
                        <input
                            type="text"
                            value={formCustomCategory}
                            onChange={e => setFormCustomCategory(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-[#111827]/50 border-2 border-slate-100 dark:border-white/10 rounded-2xl p-3.5 text-[11px] font-bold text-slate-900 dark:text-white focus:border-yellow-500 outline-none shadow-inner mt-2"
                            placeholder="Especifique el tipo de gasto..."
                        />
                    )}
                </div>

                {/* Amount */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Monto (Bs.)</label>
                    <NumericInput
                        value={formAmount}
                        onChange={setFormAmount}
                        className="w-full bg-slate-50 dark:bg-[#111827]/50 border-2 border-slate-100 dark:border-white/10 rounded-2xl p-5 text-2xl font-black text-slate-900 dark:text-white focus:border-yellow-500 outline-none shadow-inner"
                        placeholder="0.00"
                        autoFocus
                    />
                </div>

                {/* Payment method */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Método de Pago</label>
                    <div className="grid grid-cols-3 gap-2">
                        {([
                            { value: 'EFECTIVO' as const, label: 'Efectivo', icon: Wallet, hint: 'Afecta bóveda', color: 'amber' },
                            { value: 'QR' as const, label: 'QR', icon: QrCode, hint: 'Digital', color: 'indigo' },
                            { value: 'TRANSFERENCIA' as const, label: 'Transf', icon: Banknote, hint: 'Bancaria', color: 'sky' }
                        ]).map(opt => {
                            const Icon = opt.icon;
                            const active = formPaymentMethod === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setFormPaymentMethod(opt.value)}
                                    className={clsx(
                                        "flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border-2 transition-all",
                                        active
                                            ? opt.color === 'amber' ? "bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400"
                                              : opt.color === 'indigo' ? "bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-400"
                                              : "bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-400"
                                            : "bg-slate-50 dark:bg-[#111827]/50 border-slate-100 dark:border-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                                    )}
                                >
                                    <Icon size={18} strokeWidth={2.5} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">{opt.label}</span>
                                    <span className="text-[8px] font-bold uppercase tracking-wider opacity-60">{opt.hint}</span>
                                </button>
                            );
                        })}
                    </div>
                    {isToday && formPaymentMethod !== 'EFECTIVO' && (
                        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 ml-1 mt-1">
                            Este movimiento NO afectará el efectivo de la bóveda física.
                        </p>
                    )}
                </div>

                {/* Referencia bancaria (QR / TRANSFERENCIA) */}
                {formPaymentMethod !== 'EFECTIVO' && (
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                            <Hash size={10} strokeWidth={3} />
                            Referencia bancaria / N° comprobante
                            <span className={clsx("normal-case tracking-normal font-medium", requireBankRef ? "text-rose-500" : "text-slate-300 dark:text-slate-700")}>
                                {requireBankRef ? '(obligatorio)' : '(opcional)'}
                            </span>
                        </label>
                        <input
                            type="text"
                            value={formBankRef}
                            onChange={e => setFormBankRef(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-[#111827]/50 border-2 border-slate-100 dark:border-white/10 rounded-2xl p-3.5 text-[11px] font-bold text-slate-900 dark:text-white focus:border-yellow-500 outline-none shadow-inner"
                            placeholder="Ej. 123456789 / NRO. operación bancaria"
                        />
                    </div>
                )}

                {/* Saldo de bóveda + warning de insuficiencia (solo si afecta efectivo) */}
                {isToday && currentShift && formPaymentMethod === 'EFECTIVO' && direction === 'EGRESO' && (
                    <div className={clsx(
                        "rounded-2xl p-3 border flex items-center justify-between gap-3",
                        insufficientCash
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                            : "bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 text-slate-500 dark:text-slate-400"
                    )}>
                        <div className="flex items-center gap-2">
                            {insufficientCash && <AlertTriangle size={14} strokeWidth={2.5} />}
                            <span className="text-[10px] font-black uppercase tracking-widest">Saldo en bóveda</span>
                        </div>
                        <span className="text-sm font-black font-mono tabular-nums">
                            Bs. {cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                )}
                {isLargeAmount && (
                    <div className="rounded-2xl p-3 border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-2">
                        <AlertTriangle size={14} strokeWidth={2.5} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Monto elevado — se pedirá confirmación</span>
                    </div>
                )}
                {requiresManagerApproval && (
                    <div className="rounded-2xl p-3 border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center gap-2">
                        <AlertTriangle size={14} strokeWidth={2.5} />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                            Gastos &gt; Bs. {cashierLimit} se enviarán como SOLICITUD a un GERENTE
                        </span>
                    </div>
                )}

                {/* Description */}
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                        <FileText size={10} strokeWidth={3} />
                        Descripción
                    </label>
                    <textarea
                        value={formDescription}
                        onChange={e => setFormDescription(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-[#111827]/50 border-2 border-slate-100 dark:border-white/10 rounded-2xl p-4 text-[11px] font-bold text-slate-900 dark:text-white focus:border-yellow-500 outline-none shadow-inner min-h-20"
                        placeholder={direction === 'INGRESO' ? 'Detalle del ingreso...' : treasuryMode ? 'Detalle del movimiento...' : 'Detalle del gasto...'}
                    />
                </div>

                {/* Optional: Supplier + Receipt (solo gastos operativos) */}
                {!treasuryMode && (
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                            <Building2 size={10} strokeWidth={3} />
                            Proveedor
                            <span className="text-slate-300 dark:text-slate-700 normal-case tracking-normal font-medium">(opcional)</span>
                        </label>
                        <input
                            type="text"
                            value={formSupplier}
                            onChange={e => setFormSupplier(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-[#111827]/50 border-2 border-slate-100 dark:border-white/10 rounded-2xl p-3.5 text-[11px] font-bold text-slate-900 dark:text-white focus:border-yellow-500 outline-none shadow-inner"
                            placeholder="Nombre..."
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                            <Hash size={10} strokeWidth={3} />
                            Nro. Recibo
                            <span className="text-slate-300 dark:text-slate-700 normal-case tracking-normal font-medium">(opcional)</span>
                        </label>
                        <input
                            type="text"
                            value={formReceipt}
                            onChange={e => setFormReceipt(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-[#111827]/50 border-2 border-slate-100 dark:border-white/10 rounded-2xl p-3.5 text-[11px] font-bold text-slate-900 dark:text-white focus:border-yellow-500 outline-none shadow-inner"
                            placeholder="Factura/Recibo..."
                        />
                    </div>
                </div>
                )}

                {/* Comprobante (imagen) — cualquier egreso (operativo o tesorería) si la política lo exige u opcional */}
                {direction === 'EGRESO' && (
                <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                        <ImageIcon size={10} strokeWidth={3} />
                        Comprobante (foto)
                        <span className={clsx("normal-case tracking-normal font-medium", requireReceipt ? "text-rose-500" : "text-slate-300 dark:text-slate-700")}>
                            {requireReceipt ? '(obligatorio)' : '(opcional)'}
                        </span>
                    </label>
                    {!formReceiptFile ? (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className={clsx(
                                "w-full bg-slate-50 dark:bg-[#111827]/50 border-2 border-dashed rounded-2xl p-4 text-[11px] font-bold transition-all flex items-center justify-center gap-2",
                                requireReceipt
                                    ? "border-rose-300 dark:border-rose-500/40 text-rose-500 hover:border-rose-500 hover:text-rose-600"
                                    : "border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 hover:border-yellow-500 hover:text-slate-700 dark:hover:text-white"
                            )}
                        >
                            <ImageIcon size={14} strokeWidth={2.5} />
                            Subir foto de la factura/recibo
                        </button>
                    ) : (
                        <div className="flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-3">
                            <ImageIcon size={16} className="text-emerald-500" strokeWidth={2.5} />
                            <span className="flex-1 text-[11px] font-bold text-slate-700 dark:text-white truncate">
                                {formReceiptFile.name}
                            </span>
                            <span className="text-[9px] font-black text-slate-400">
                                {(formReceiptFile.size / 1024).toFixed(0)} KB
                            </span>
                            <button
                                type="button"
                                onClick={() => { setFormReceiptFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                className="p-1 text-slate-400 hover:text-rose-500"
                                title="Quitar archivo"
                            >
                                <XIcon size={14} strokeWidth={2.5} />
                            </button>
                        </div>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            if (!f.type.startsWith('image/')) {
                                toast.error('El comprobante debe ser una imagen (JPG/PNG/WebP).');
                                e.target.value = '';
                                return;
                            }
                            const MAX_BYTES = 10 * 1024 * 1024;
                            if (f.size > MAX_BYTES) {
                                toast.error('El comprobante supera 10 MB. Reduce su tamaño.');
                                e.target.value = '';
                                return;
                            }
                            setFormReceiptFile(f);
                        }}
                    />
                    {uploadingReceipt && (
                        <p className="text-[9px] font-bold text-blue-500 ml-1">Subiendo comprobante...</p>
                    )}
                </div>
                )}
            </div>
        </IndustrialModal>
    );
}
