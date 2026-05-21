'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { PurchaseService } from '@/services/PurchaseService';
import { CashierSessionService } from '@/services/CashierSessionService';
import { AccountService } from '@/services/AccountService';
import { TreasuryConfigService } from '@/services/TreasuryConfigService';
import { PurchaseItem, Purchase } from '@/types';
import { ShoppingCart, Trash2, Save, Calendar, Building2, X, Package, CheckCircle, AlertTriangle, ChevronRight, Banknote, Send, QrCode, FileText, ArrowDownToLine } from 'lucide-react';
import clsx from 'clsx';
import EmpresaAccountSelector, { SelectedEmpresaAccount } from '@/components/common/EmpresaAccountSelector';
import CapitalInjectionModal from '@/components/modals/CapitalInjectionModal';
import { toast } from 'sonner';
import { PrintService } from '@/services/PrintService';
import { useBranch } from '@/contexts/BranchContext';
import { usePurchaseStore, PurchasePaymentMethod } from '@/store/purchaseStore';
import { useAuth } from '@/contexts/AuthContext';
import { useConfig } from '@/contexts/ConfigContext';
import { isMatriz } from '@/lib/branch';
import { midday, localDateStr } from '@/lib/utils';
import NumericInput from '@/components/common/NumericInput';

interface PurchaseCartProps {
    items: PurchaseItem[];
    onRemoveItem: (index: number) => void;
    onUpdateItem: (index: number, updates: Partial<PurchaseItem>) => void;
    onClearCart: () => void;
}

export default function PurchaseCart({ items, onRemoveItem, onUpdateItem, onClearCart }: PurchaseCartProps) {
    const router = useRouter();
    const { currentBranch } = useBranch();
    const { user, userName } = useAuth();
    const { config } = useConfig();
    const todayStr = localDateStr();
    const allowRetroPurchases = config?.allowRetroactivePurchases === true;
    const canRetroDate = allowRetroPurchases;
    const dateMin = canRetroDate ? undefined : todayStr;
    const dateMax = todayStr;
    const [selectorOpen, setSelectorOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [cashBalance, setCashBalance] = useState<number | null>(null);
    const [hasShift, setHasShift] = useState<boolean | null>(null);
    const [showCapitalModal, setShowCapitalModal] = useState(false);
    const [requireBankRef, setRequireBankRef] = useState(false);

    useEffect(() => {
        TreasuryConfigService.get().then(cfg => setRequireBankRef(!!cfg.requireBankRefForDigital)).catch(() => {});
    }, []);

    // Store State
    const supplierId = usePurchaseStore(state => state.supplierId);
    const supplierName = usePurchaseStore(state => state.supplierName);
    const date = usePurchaseStore(state => state.date) || localDateStr();
    const setSupplier = usePurchaseStore(state => state.setSupplier);
    const setDate = usePurchaseStore(state => state.setDate);
    const paymentMethod = usePurchaseStore(state => state.paymentMethod);
    const setPaymentMethod = usePurchaseStore(state => state.setPaymentMethod);
    const paymentReference = usePurchaseStore(state => state.paymentReference);
    const setPaymentReference = usePurchaseStore(state => state.setPaymentReference);
    const dueDate = usePurchaseStore(state => state.dueDate);
    const setDueDate = usePurchaseStore(state => state.setDueDate);

    const branchIsMatriz = isMatriz(currentBranch);

    // Default a CRÉDITO en matriz si está vacío (mejor UX)
    useEffect(() => {
        if (branchIsMatriz && paymentMethod === 'EFECTIVO') {
            setPaymentMethod('TRANSFERENCIA');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [branchIsMatriz]);

    // Cargar saldo de cajón del cajero si paymentMethod EFECTIVO
    const [refreshTick, setRefreshTick] = useState(0);
    useEffect(() => {
        if (paymentMethod !== 'EFECTIVO' || !currentBranch?.id || !user?.uid) {
            setCashBalance(null);
            setHasShift(null);
            return;
        }
        let cancel = false;
        (async () => {
            try {
                const session = await CashierSessionService.getOperableSession(user.uid, currentBranch?.id);
                if (cancel) return;
                if (!session) { setHasShift(false); setCashBalance(null); return; }
                setHasShift(true);
                const account = await AccountService.getById(session.cashDrawerId);
                if (cancel) return;
                setCashBalance(account?.currentBalance ?? 0);
            } catch {
                if (!cancel) { setHasShift(null); setCashBalance(null); }
            }
        })();
        return () => { cancel = true; };
    }, [paymentMethod, currentBranch?.id, user?.uid, refreshTick]);

    const handleSelectEmpresa = (sel: SelectedEmpresaAccount) => {
        const display = sel.account.alias
            ? `${sel.empresa.nombre} \u2014 ${sel.account.alias}`
            : sel.account.nit
                ? `${sel.empresa.nombre} \u2014 NIT ${sel.account.nit}`
                : sel.empresa.nombre;
        setSupplier(sel.account.id || null, display);
    };

    const totalAmount = items.reduce((acc, i) => acc + (i.cost * i.quantity), 0);
    const totalItems = items.reduce((acc, i) => acc + i.quantity, 0);

    const handleRequestSubmit = () => {
        if (items.length === 0) {
            toast.error('Agrega al menos un producto a la compra');
            return;
        }
        if (!supplierId) {
            toast.error('Por favor, selecciona una empresa/cuenta de proveedor');
            return;
        }
        if (!currentBranch?.id) {
            toast.error('No hay sucursal seleccionada');
            return;
        }
        // Validaciones por método de pago
        if (paymentMethod === 'EFECTIVO') {
            if (hasShift === false) {
                toast.error('No hay caja abierta. Cambia a Transferencia/QR/Crédito o abre la caja.');
                return;
            }
            if (cashBalance !== null && cashBalance < totalAmount) {
                toast.error(`Saldo insuficiente en caja (Bs. ${cashBalance.toFixed(2)}). Registra un Ingreso de Capital primero.`);
                return;
            }
        }
        if ((paymentMethod === 'QR' || paymentMethod === 'TRANSFERENCIA') && requireBankRef && !paymentReference.trim()) {
            toast.error('Referencia bancaria obligatoria para pagos QR/Transferencia (configurado en Tesorería).');
            return;
        }
        setShowConfirmation(true);
    };

    const handleSubmit = async () => {
        if (!supplierId || items.length === 0 || !currentBranch?.id) return;

        setIsProcessing(true);

        try {
            // Si la fecha es HOY, usar la hora actual real (más útil para auditoría).
            // Si es retroactiva, usar mediodía hora Bolivia para evitar drift de timezone.
            const isToday = date === todayStr;
            const purchaseDate = isToday
                ? new Date()
                : midday(date);

            const purchaseId = await PurchaseService.createPurchase({
                supplierId,
                supplierName: supplierName || 'Desconocido',
                date: purchaseDate,
                items,
                total: totalAmount,
                status: 'RECEIVED',
                branchId: currentBranch.id,
                paymentMethod,
                paymentReference: (paymentMethod === 'TRANSFERENCIA' || paymentMethod === 'QR') ? paymentReference : '',
                dueDate: paymentMethod === 'CREDITO' && dueDate
                    ? (dueDate === todayStr ? new Date() : midday(dueDate))
                    : undefined,
            }, currentBranch.id, {
                uid: user?.uid || 'unknown',
                email: user?.email || 'Admin',
                branchId: currentBranch.id,
                name: userName ?? undefined
            });

            // Abrir automáticamente el PDF generado
            try {
                const purchaseObj: Purchase = {
                    id: purchaseId,
                    supplierId,
                    supplierName: supplierName || 'Desconocido',
                    date: purchaseDate,
                    items,
                    total: totalAmount,
                    status: 'RECEIVED',
                    branchId: currentBranch.id,
                    paymentMethod,
                    paymentReference: (paymentMethod === 'TRANSFERENCIA' || paymentMethod === 'QR') ? paymentReference : '',
                    dueDate: paymentMethod === 'CREDITO' && dueDate
                        ? (dueDate === todayStr ? new Date() : midday(dueDate))
                        : undefined,
                };
                await PrintService.printPurchase(purchaseObj, items, currentBranch.id);
            } catch (printErr) {
                console.error('[PurchasePrint] Error opening automatic PDF:', printErr);
                toast.warning('Compra guardada, pero no se pudo abrir el PDF automáticamente. Verifica los permisos de ventanas emergentes.');
            }

            const msgByMethod: Record<PurchasePaymentMethod, string> = {
                EFECTIVO: 'Compra registrada y descontada de caja',
                TRANSFERENCIA: 'Compra registrada (pago por transferencia)',
                QR: 'Compra registrada (pago QR)',
                CREDITO: 'Compra registrada como cuenta por pagar',
            };
            toast.success(msgByMethod[paymentMethod]);
            onClearCart();
            setShowConfirmation(false);
            router.push('/compras');
        } catch (e) {
            console.error(e);
            toast.error(e instanceof Error ? e.message : 'Error al registrar la compra');
            setShowConfirmation(false);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col h-full min-w-0 bg-white dark:bg-[#111827] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden transition-colors">
            {/* Header */}
            <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-white/10 bg-linear-to-br from-slate-800 to-slate-900 dark:from-gray-900 dark:to-gray-950">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-white/20 p-2 rounded-xl">
                            <ShoppingCart className="text-white" size={20} />
                        </div>
                        <div>
                            <h2 className="font-black text-white text-sm uppercase tracking-wider">Orden de Compra</h2>
                            <p className="text-yellow-500 dark:text-yellow-400 text-xs">
                                {items.length} productos · {totalItems} unidades
                            </p>
                        </div>
                    </div>
                    {items.length > 0 && (
                        <button
                            onClick={onClearCart}
                            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition"
                            title="Limpiar carrito"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Supplier & Date */}
            <div data-tour="compras-supplier" className="p-4 space-y-3 shrink-0 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-[#111827]/50">
                <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Building2 size={12} /> Empresa / Cuenta
                    </label>
                    <button
                        type="button"
                        onClick={() => setSelectorOpen(true)}
                        className="w-full flex items-center gap-2 border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white rounded-xl text-sm font-bold hover:border-yellow-500 outline-none p-2.5 transition-all text-left"
                    >
                        <Building2 size={16} className="text-slate-400 shrink-0" />
                        <span className="flex-1 truncate">
                            {supplierName || <span className="text-slate-400 font-normal">Seleccionar empresa y cuenta...</span>}
                        </span>
                        <ChevronRight size={16} className="text-slate-400 shrink-0" />
                    </button>
                </div>
                <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Calendar size={12} /> Fecha de Compra
                    </label>
                    <input
                        type="date"
                        className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white rounded-xl text-sm font-bold focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none p-2.5 transition-all"
                        value={date}
                        min={dateMin}
                        max={dateMax}
                        onChange={e => {
                            const v = e.target.value;
                            if (!canRetroDate && v < todayStr) {
                                toast.warning('No puedes registrar compras con fecha pasada. Pide al gerente que autorice esta opción.');
                                return;
                            }
                            setDate(v);
                        }}
                    />
                </div>

                {/* Método de Pago */}
                <div data-tour="compras-payment">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Banknote size={12} /> ¿Cómo se paga esta compra?
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                        {[
                            { v: 'EFECTIVO' as PurchasePaymentMethod, label: 'Efectivo', icon: Banknote },
                            { v: 'TRANSFERENCIA' as PurchasePaymentMethod, label: 'Transf.', icon: Send },
                            { v: 'QR' as PurchasePaymentMethod, label: 'QR', icon: QrCode },
                            { v: 'CREDITO' as PurchasePaymentMethod, label: 'Crédito', icon: FileText },
                        ].map(({ v, label, icon: Icon }) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setPaymentMethod(v)}
                                className={clsx(
                                    'flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all active:scale-95',
                                    paymentMethod === v
                                        ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                                        : 'border-slate-200 dark:border-white/10 text-slate-500 hover:border-slate-300'
                                )}
                            >
                                <Icon size={14} strokeWidth={2.5} />
                                <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Estado caja para EFECTIVO */}
                    {paymentMethod === 'EFECTIVO' && (
                        <div className={clsx(
                            'mt-2 rounded-xl p-2 text-[10px] flex items-start gap-2',
                            hasShift === false
                                ? 'bg-rose-50 dark:bg-rose-500/5 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'
                                : (cashBalance !== null && cashBalance < totalAmount && totalAmount > 0)
                                    ? 'bg-amber-50 dark:bg-amber-500/5 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                                    : 'bg-blue-50 dark:bg-blue-500/5 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20'
                        )}>
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                            <div className="flex-1">
                                {hasShift === false ? (
                                    <span>No hay caja abierta. Cambia de método o abre la caja.</span>
                                ) : cashBalance !== null ? (
                                    <span>
                                        Saldo en caja: <strong>Bs. {cashBalance.toFixed(2)}</strong>
                                        {totalAmount > 0 && cashBalance < totalAmount && (
                                            <> · Faltan <strong>Bs. {(totalAmount - cashBalance).toFixed(2)}</strong></>
                                        )}
                                    </span>
                                ) : (
                                    <span>Verificando saldo de caja...</span>
                                )}
                            </div>
                            {cashBalance !== null && cashBalance < totalAmount && totalAmount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowCapitalModal(true)}
                                    className="shrink-0 flex items-center gap-1 px-2 h-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[9px] font-black uppercase tracking-wider"
                                >
                                    <ArrowDownToLine size={10} strokeWidth={3} />
                                    Inyectar
                                </button>
                            )}
                        </div>
                    )}

                    {/* Referencia QR/Transferencia */}
                    {(paymentMethod === 'TRANSFERENCIA' || paymentMethod === 'QR') && (
                        <input
                            type="text"
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            placeholder={paymentMethod === 'QR'
                                ? `Nº comprobante QR (${requireBankRef ? 'obligatorio' : 'opcional'})`
                                : `Nº transferencia / banco (${requireBankRef ? 'obligatorio' : 'opcional'})`}
                            required={requireBankRef}
                            className="mt-2 w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white rounded-xl text-xs font-bold focus:border-yellow-500 outline-none p-2 transition-all"
                        />
                    )}

                    {/* DueDate Crédito */}
                    {paymentMethod === 'CREDITO' && (
                        <div className="mt-2">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Vence el (opcional)</label>
                            <input
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                min={todayStr}
                                className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white rounded-xl text-xs font-bold focus:border-yellow-500 outline-none p-2 transition-all"
                            />
                            <p className="text-[9px] text-slate-400 mt-1">Esta compra sumará Bs. {totalAmount.toFixed(2)} al saldo del proveedor.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-white dark:bg-[#111827]">
                {items.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 space-y-3 opacity-50">
                        <Package size={48} strokeWidth={1} />
                        <p className="font-black text-sm uppercase tracking-widest">Sin productos</p>
                        <p className="text-xs text-center">Selecciona productos de la grilla</p>
                    </div>
                ) : (
                    items.map((item, idx) => (
                        <div
                            key={idx}
                            className="group flex flex-col p-3 rounded-2xl bg-slate-50 dark:bg-white/5/50 border border-transparent hover:border-yellow-200 dark:hover:border-[#FFD700]/30 transition-all"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex-1 min-w-0 pr-2">
                                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 wrap-break-word leading-tight">
                                        {item.productName}
                                    </h4>
                                    <p className="text-[9px] font-mono text-slate-400 mt-0.5">
                                        {item.productCode}
                                    </p>
                                </div>
                                <button
                                    onClick={() => onRemoveItem(idx)}
                                    className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex-1">
                                    <label className="text-[8px] font-bold text-slate-400 uppercase">Cantidad</label>
                                    <NumericInput
                                        className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white rounded-xl text-sm font-bold focus:border-yellow-500 outline-none p-1.5 text-center"
                                        value={item.quantity}
                                        onChange={(val) => onUpdateItem(idx, { quantity: Math.max(1, parseInt(val) || 1) })}
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[8px] font-bold text-slate-400 uppercase">Costo Unit.</label>
                                    <NumericInput
                                        className="w-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white rounded-xl text-sm font-bold focus:border-yellow-500 outline-none p-1.5 text-center"
                                        value={item.cost}
                                        onChange={(val) => onUpdateItem(idx, { cost: Math.max(0, parseFloat(val) || 0) })}
                                    />
                                </div>
                                <div className="w-20 text-right">
                                    <label className="text-[8px] font-bold text-slate-400 uppercase">Subtotal</label>
                                    <p className="text-sm font-black text-yellow-600 dark:text-yellow-400">
                                        Bs. {(item.quantity * item.cost).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer - Totals */}
            <div className="p-4 border-t border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-[#111827] space-y-3 shrink-0">
                <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-500">Total Compra</span>
                    <span className="text-2xl font-black text-slate-900 dark:text-yellow-400">
                        Bs. {totalAmount.toFixed(2)}
                    </span>
                </div>

                <button
                    data-tour="compras-confirm"
                    onClick={handleRequestSubmit}
                    disabled={items.length === 0 || isProcessing}
                    className={clsx(
                        "group w-full py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none font-black uppercase tracking-widest text-sm",
                        "bg-slate-900 dark:bg-[#FFD700] text-yellow-500 dark:text-black hover:bg-black dark:hover:bg-yellow-400 shadow-yellow-500/20"
                    )}
                >
                    {isProcessing ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <Save size={20} />
                            Registrar Entrada
                        </>
                    )}
                </button>
            </div>

            <EmpresaAccountSelector
                isOpen={selectorOpen}
                onClose={() => setSelectorOpen(false)}
                onSelect={handleSelectEmpresa}
                branchId={currentBranch?.id}
                title="Seleccionar Empresa para Compra"
                confirmLabel="Usar para esta compra"
            />

            <CapitalInjectionModal
                isOpen={showCapitalModal}
                onClose={() => setShowCapitalModal(false)}
                suggestedAmount={cashBalance !== null && totalAmount > cashBalance ? totalAmount - cashBalance : 0}
                reasonHint={`Para cubrir compra de ${supplierName || 'proveedor'}`}
                onSuccess={() => setRefreshTick(t => t + 1)}
            />

            {/* Confirmation Modal (portal a body para escapar stacking contexts del layout) */}
            {showConfirmation && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-1000 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200" onClick={() => !isProcessing && setShowConfirmation(false)}>
                    <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-[#111827] rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] shadow-2xl border-t sm:border border-slate-200 dark:border-white/10 flex flex-col overflow-hidden">
                        {/* Header */}
                        <div className="p-5 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 flex items-start gap-3">
                            <div className="p-2 bg-amber-100 dark:bg-amber-500/10 rounded-xl shrink-0">
                                <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-black text-slate-900 dark:text-white text-base">Confirmar Compra</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Revisa los datos antes de registrar la entrada de mercancía</p>
                            </div>
                            <button onClick={() => !isProcessing && setShowConfirmation(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition text-slate-400">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                            {/* Supplier & Date */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-slate-50 dark:bg-white/5/50 rounded-xl">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Proveedor</span>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 wrap-break-word">
                                        {supplierName || 'N/A'}
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-50 dark:bg-white/5/50 rounded-xl">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Fecha</span>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                                        {midday(date).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </p>
                                </div>
                            </div>

                            {/* Sucursal */}
                            <div className="p-3 bg-blue-50 dark:bg-blue-500/5 rounded-xl border border-blue-100 dark:border-blue-500/10">
                                <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">Sucursal destino</span>
                                <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{currentBranch?.name || currentBranch?.id}</p>
                            </div>

                            {/* Items */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Productos ({items.length})</span>
                                    <span className="text-[10px] font-bold text-slate-400">{totalItems} unidades</span>
                                </div>
                                <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
                                    <div className="max-h-50 overflow-y-auto custom-scrollbar divide-y divide-gray-100 dark:divide-gray-800">
                                        {items.map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-white/2 transition-colors">
                                                <div className="flex-1 min-w-0 pr-3">
                                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 wrap-break-word">{item.productName}</p>
                                                    <p className="text-[9px] font-mono text-slate-400 mt-0.5">{item.productCode}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                        {item.quantity} × Bs. {item.cost.toFixed(2)}
                                                    </p>
                                                    <p className="text-[10px] font-bold text-yellow-600 dark:text-yellow-400">
                                                        Bs. {(item.quantity * item.cost).toFixed(2)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Total */}
                            <div className="flex justify-between items-center p-4 bg-slate-900 dark:bg-black/40 rounded-xl">
                                <span className="text-sm font-bold text-slate-300">Total a registrar</span>
                                <span className="text-xl font-black text-yellow-400">
                                    Bs. {totalAmount.toFixed(2)}
                                </span>
                            </div>

                            {/* Notice */}
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
                                Al confirmar, el stock de cada producto se actualizará automáticamente y se registrará el movimiento en el Kardex.
                            </p>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 flex gap-3">
                            <button
                                onClick={() => setShowConfirmation(false)}
                                disabled={isProcessing}
                                className="flex-1 py-3 px-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-white/10 transition disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={isProcessing}
                                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20"
                            >
                                {isProcessing ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <CheckCircle size={16} />
                                        Confirmar Compra
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

