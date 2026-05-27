'use client';

// Fixed: cashService import case-sensitivity
import { usePosStore } from '@/store/posStore';
import { CashierSessionService } from '@/services/CashierSessionService';
import { TreasuryConfigService } from '@/services/TreasuryConfigService';
import { InstallmentService } from '@/services/InstallmentService';
import { Quotation } from '@/types';
import { CashierSession } from '@/types/treasury';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import {
    ShoppingCart, Trash2, UserIcon, Minus, Plus,
    History, Pause, X, FileText, ArrowRight, FolderOpen, 
    Clock, CalendarDays, Banknote, QrCode, CreditCard, AlertCircle, ChevronRight, Tag, Percent,
    WifiOff, Wifi, Split, Layers, RefreshCw
} from 'lucide-react';
import clsx from 'clsx';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { ClientModal } from '@/components/modals';
import QuotationPickerModal from '@/components/pos/QuotationPickerModal';
import ConfirmModal from '@/components/common/ConfirmModal';
import { useAuth } from '@/contexts/AuthContext';
import { PrintService } from '@/services/PrintService';
import { toast } from 'sonner';
import { useProducts } from '@/hooks/useProducts';
import { useBranch } from '@/contexts/BranchContext';
import { useConfig } from '@/contexts/ConfigContext';
import { midday, localDateStr } from '@/lib/utils';
import { DiscountApprovalService } from '@/services/DiscountApprovalService';
import { useOfflineQueue, enqueueOfflineSale } from '@/hooks/useOfflineQueue';
import NumericInput from '@/components/common/NumericInput';
import { formatTime } from '@/utils/dateHelpers';
import { useProductHoverPreview } from '@/hooks/useProductHoverPreview';
import ProductPreviewTooltip from '@/components/common/ProductPreviewTooltip';

export default function PosCart() {
    const {
        cart,
        client,
        paymentMethod,
        invoiceMode,
        suspendedSales,
        updateQuantity,
        removeFromCart,
        clearCart,
        getTotals,
        setClient,
        suspendSale,
        resumeSale,
        deleteSuspendedSale,
        setItemPriceMode,
        setAllItemsPriceMode,
        createQuotation,
        loadFromQuotation,
        operationDate,
        setOperationDate,
        refreshCartPrices,
        applyDiscount,
        removeDiscount,
        setPendingDiscount,
        clearPendingDiscount,
    } = usePosStore();

    const { user, userName } = useAuth();
    const { currentBranch, isConsolidatedView } = useBranch();
    const { products } = useProducts();
    const { config, refreshConfig } = useConfig();
    const { pendingCount, syncQueue } = useOfflineQueue();
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const { hoverState: cartItemHover, onMouseEnter: onCartItemHoverEnter, onMouseLeave: onCartItemHoverLeave } = useProductHoverPreview(1000);

    useEffect(() => {
        const goOnline = () => setIsOnline(true);
        const goOffline = () => setIsOnline(false);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
    }, []);

    // Zero-Trust / Stale Cache Purge Hook
    useEffect(() => {
        if (products?.length > 0 && cart.length > 0) {
            refreshCartPrices(products);
        }
    }, [products, cart.length, refreshCartPrices]); // 'changed' internal check prevents infinite render cycles

    // === Listener tiempo real: descuentos pendientes del cajero ===
    // Cuando el GERENTE aprueba/rechaza, auto-aplicamos al carrito o avisamos.
    useEffect(() => {
        if (!user?.uid) return;
        const q = query(
            collection(db, 'pending_discount_approvals'),
            where('cashierId', '==', user.uid),
            where('status', 'in', ['APPROVED', 'REJECTED'])
        );
        const unsub = onSnapshot(q, (snap) => {
            snap.docChanges().forEach((change) => {
                if (change.type !== 'added' && change.type !== 'modified') return;
                const data = change.doc.data();
                const approvalId = change.doc.id;
                // Buscar item en el carrito que tenga esta solicitud pendiente
                const currentCart = usePosStore.getState().cart;
                const target = currentCart.find(it => it.pendingDiscount?.approvalId === approvalId);
                if (!target?.product.id) return;

                if (data.status === 'APPROVED') {
                    applyDiscount(
                        target.product.id,
                        data.discountMode,
                        data.discountValue,
                        user.uid,
                        user.email || 'cashier'
                    );
                    clearPendingDiscount(target.product.id);
                    toast.success('Descuento aprobado por gerencia.', {
                        description: `${data.productName} — ahora a Bs. ${Number(data.finalPrice).toFixed(2)}`,
                        duration: 6000,
                    });
                } else if (data.status === 'REJECTED') {
                    clearPendingDiscount(target.product.id);
                    toast.error('Descuento rechazado por gerencia.', {
                        description: data.rejectionReason ? `Motivo: ${data.rejectionReason}` : `${data.productName}`,
                        duration: 8000,
                    });
                }
            });
        }, (err) => {
            console.error('Listener descuentos pendientes:', err);
        });
        return () => unsub();
    }, [user?.uid, user?.email, applyDiscount, clearPendingDiscount]);


    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [isQuotationPickerOpen, setIsQuotationPickerOpen] = useState(false);
    const [isSuspendedModalOpen, setIsSuspendedModalOpen] = useState(false);
    const [isCheckoutConfirmOpen, setIsCheckoutConfirmOpen] = useState(false);
    const [isFinalConfirmOpen, setIsFinalConfirmOpen] = useState(false);
    const [isReplaceCartConfirmOpen, setIsReplaceCartConfirmOpen] = useState(false);
    const [pendingQuotation, setPendingQuotation] = useState<Quotation | null>(null);
    const reopenCheckoutRef = useRef(false);
    const reopenQuotationRef = useRef(false);
    const [requireBankRef, setRequireBankRef] = useState(false);
    const [bankRef, setBankRef] = useState('');
    const [amountReceived, setAmountReceived] = useState<string>('');
    const [splitCash, setSplitCash] = useState<string>('');
    const [splitQR, setSplitQR] = useState<string>('');
    const [installmentCount, setInstallmentCount] = useState<number>(2);
    const [adelanto, setAdelanto] = useState<string>('');
    const [adelantoMethod, setAdelantoMethod] = useState<'EFECTIVO' | 'QR'>('EFECTIVO');
    const [clientOverdueInfo, setClientOverdueInfo] = useState<{ hasOverdue: boolean; count: number; totalOverdue: number } | null>(null);

    const { total, itemCount, subtotal: rawSubtotal, discountAmount } = getTotals();
    const hasInsufficientStock = cart.some(item => !item.product || item.quantity > (item.product.stock ?? 0));

    // Cargar políticas de auditoría (ref comprobante en QR)
    useEffect(() => {
        TreasuryConfigService.get().then(cfg => setRequireBankRef(!!cfg.requireBankRefForDigital)).catch(() => {});
    }, []);

    // Check overdue installments when client changes
    useEffect(() => {
        const check = async () => {
            if (client?.id) {
                const info = await InstallmentService.hasOverdueInstallments(client.id, currentBranch?.id);
                setClientOverdueInfo(info);
            } else {
                setClientOverdueInfo(null);
            }
        };
        check();
    }, [client?.id, currentBranch?.id]);

    const [isProcessing, setIsProcessing] = useState(false);
    const [isSyncingRate, setIsSyncingRate] = useState(false);
    const [openShift, setOpenShift] = useState<CashierSession | null>(null);

    // Check for open shift (modelo "caja por sucursal": acepta sesión propia o de cualquier cajero en la misma sucursal)
    useEffect(() => {
        const checkShift = async () => {
            if (!user?.uid || !currentBranch?.id) return;
            const valid = await CashierSessionService.getOperableSession(user.uid, currentBranch.id);
            setOpenShift(valid);
        };
        if (user && currentBranch?.id) checkShift();
        else setTimeout(() => setOpenShift(null), 0);
    }, [user, currentBranch?.id]);

    // Sync shift when opened/closed from header or other components
    useEffect(() => {
        const syncShift = async () => {
            if (!user?.uid || !currentBranch?.id) return;
            const valid = await CashierSessionService.getOperableSession(user.uid, currentBranch.id);
            setOpenShift(valid);
        };
        window.addEventListener('cash-shift-changed', syncShift);
        return () => window.removeEventListener('cash-shift-changed', syncShift);
    }, [currentBranch?.id, user?.uid]);


    // Hard-block discount modal state
    const [hardBlockModal, setHardBlockModal] = useState<{
        approvalId: string;
        productId: string;
        productName: string;
        effectiveDiscountPct: number;
        finalPrice: number;
        basePrice: number;
        discountMode: 'PERCENTAGE' | 'FIXED_PRICE';
        discountValue: number;
    } | null>(null);

    useEffect(() => {
        if (!hardBlockModal?.approvalId) return;
        const unsub = DiscountApprovalService.subscribeToHardBlockApproval(
            hardBlockModal.approvalId,
            (status, data) => {
                if (status === 'APPROVED') {
                    applyDiscount(
                        hardBlockModal.productId,
                        data.discountMode,
                        data.discountValue,
                        user?.uid ?? '',
                        user?.email ?? ''
                    );
                    toast.success('Descuento aprobado. Venta desbloqueada.', {
                        description: `${data.productName} — Bs. ${data.originalPrice.toFixed(2)} → Bs. ${data.finalPrice.toFixed(2)}`,
                        duration: 6000,
                    });
                } else {
                    toast.error('Descuento rechazado por gerencia.', {
                        description: data.rejectionReason ? `Motivo: ${data.rejectionReason}` : data.productName,
                        duration: 8000,
                    });
                }
                setHardBlockModal(null);
            }
        );
        return () => unsub();
    }, [hardBlockModal?.approvalId, applyDiscount, user?.uid, user?.email]);

    // Discount popover state
    const [discountTarget, setDiscountTarget] = useState<string | null>(null);
    const [discountMode, setDiscountMode] = useState<'PERCENTAGE' | 'FIXED_PRICE'>('PERCENTAGE');
    const [discountValue, setDiscountValue] = useState('');
    const discountInputRef = useRef<HTMLInputElement>(null);

    const handleApplyDiscount = useCallback(async (productId: string) => {
        if (!user?.uid) {
            toast.error('Tu sesión expiró. Inicia sesión de nuevo.');
            return;
        }
        const val = Number(discountValue);
        if (!val || val <= 0) return;

        const item = cart.find(i => i.product.id === productId);
        if (!item) return;

        const basePrice = item.priceMode === 'CON_FACTURA'
            ? (item.product.precioConFactura ?? item.product.precioVenta ?? item.product.precio ?? 0)
            : (item.product.precioSinFactura ?? item.product.precioVenta ?? item.product.precio ?? 0);

        if (basePrice <= 0) {
            toast.error('Este producto no tiene precio válido. Configura el precio antes de aplicar descuentos.');
            return;
        }
        if (discountMode === 'PERCENTAGE' && val >= 100) return;
        if (discountMode === 'FIXED_PRICE' && val >= basePrice) return;

        // Effective discount % (works for both modes)
        const effectiveDiscountPct = discountMode === 'PERCENTAGE'
            ? val
            : (basePrice > 0 ? ((basePrice - val) / basePrice) * 100 : 0);

        const finalPrice = discountMode === 'PERCENTAGE'
            ? Number((basePrice * (1 - val / 100)).toFixed(2))
            : val;

        const hardBlockThreshold = config?.discountHardBlockThresholdPercent ?? 0;
        const threshold = config?.discountApprovalThresholdPercent ?? 0;
        const requiresHardBlock = hardBlockThreshold > 0 && effectiveDiscountPct > hardBlockThreshold;
        const requiresApproval = !requiresHardBlock && threshold > 0 && effectiveDiscountPct > threshold;

        // Tier 3: supera umbral de bloqueo → POS bloqueado hasta aprobación en tiempo real
        if (requiresHardBlock && currentBranch?.id) {
            if (hardBlockModal) {
                toast.info('Ya hay una solicitud de bloqueo activa. Espera la respuesta del gerente.');
                return;
            }
            try {
                const approvalId = await DiscountApprovalService.requestHardBlock({
                    productId,
                    productCode: item.product.codigo || '',
                    productName: item.product.nombre || '',
                    branchId: currentBranch.id,
                    cashierId: user.uid,
                    cashierName: userName ?? user.email ?? '',
                    originalPrice: basePrice,
                    finalPrice,
                    discountMode,
                    discountValue: val,
                    effectiveDiscountPct,
                    thresholdPct: hardBlockThreshold,
                });
                setHardBlockModal({
                    approvalId,
                    productId,
                    productName: item.product.nombre || '',
                    effectiveDiscountPct,
                    finalPrice,
                    basePrice,
                    discountMode,
                    discountValue: val,
                });
            } catch (err) {
                console.error('No se pudo crear solicitud de bloqueo:', err);
                toast.error('No se pudo enviar la solicitud. Intenta nuevamente.');
            }
            setDiscountTarget(null);
            setDiscountValue('');
            return;
        }

        // Tier 2: supera umbral de revisión → envío a bandeja, venta continúa a precio normal
        if (requiresApproval && currentBranch?.id) {
            // Bloquear si ya hay una solicitud pendiente para este producto
            if (item.pendingDiscount) {
                toast.info('Ya hay una solicitud pendiente para este producto.', {
                    description: 'Espera la respuesta del gerente o cancélala desde el carrito.'
                });
                return;
            }
            try {
                const approvalId = await DiscountApprovalService.create({
                    productId,
                    productCode: item.product.codigo || '',
                    productName: item.product.nombre || '',
                    branchId: currentBranch.id,
                    cashierId: user.uid,
                    cashierName: userName ?? user.email ?? '',
                    originalPrice: basePrice,
                    finalPrice,
                    discountMode,
                    discountValue: val,
                    effectiveDiscountPct,
                    thresholdPct: threshold,
                });
                setPendingDiscount(productId, { approvalId, type: discountMode, value: val });
                toast.warning(`Descuento del ${effectiveDiscountPct.toFixed(1)}% enviado al gerente.`, {
                    description: 'Te avisaremos cuando responda. El producto se mantiene a precio normal.'
                });
            } catch (err) {
                console.error('No se pudo crear PendingDiscountApproval:', err);
                toast.error('No se pudo enviar la solicitud. Intenta nuevamente.');
                setDiscountTarget(null);
                setDiscountValue('');
                return;
            }

            setDiscountTarget(null);
            setDiscountValue('');
            return;
        }

        // Descuento dentro del umbral → aplicar al carrito
        applyDiscount(productId, discountMode, val, user.uid, user.email || '');

        if (!requiresApproval) {
            toast.info(`Descuento aplicado: ${discountMode === 'PERCENTAGE' ? `${val}%` : `Bs. ${val}`}`, {
                description: `${item.product.nombre} — Bs. ${basePrice.toFixed(2)} → Bs. ${finalPrice.toFixed(2)}`
            });
        }

        setDiscountTarget(null);
        setDiscountValue('');
    }, [discountValue, discountMode, cart, user, userName, currentBranch, applyDiscount, setPendingDiscount, config, hardBlockModal, setHardBlockModal]);

    const confirmCheckout = useCallback(async () => {
        if (isProcessing) return; // CRITICAL: Stop double execution
        if (!user?.uid) {
            toast.error('Tu sesión expiró. Inicia sesión de nuevo para registrar la venta.');
            return;
        }
        if (!currentBranch?.id) {
            toast.error('Sin sucursal activa', {
                description: 'Selecciona una sucursal desde el selector del encabezado antes de procesar la venta.',
            });
            return;
        }
        setIsProcessing(true);
        setIsFinalConfirmOpen(false);
        setIsCheckoutConfirmOpen(false);
        setBankRef('');

        try {
        const success = await usePosStore.getState().processSale(
            user.uid,
            user.email || '',
            userName ?? '',
            currentBranch.id,
            { uid: user.uid, email: user.email || '?' },
            amountReceived ? Number(amountReceived) : undefined,
            paymentMethod === 'MIXTO' ? { cash: Number(splitCash) || 0, qr: Number(splitQR) || 0 } : undefined,
            paymentMethod === 'CUOTAS' ? installmentCount : undefined,
            paymentMethod === 'CUOTAS' && Number(adelanto) > 0 ? Number(adelanto) : undefined,
            paymentMethod === 'CUOTAS' && Number(adelanto) > 0 ? adelantoMethod : undefined
        );

        if (success) {
            window.dispatchEvent(new Event('cash-shift-changed'));
            const lastSale = usePosStore.getState().lastSale;
            if (lastSale) {
                toast.promise(
                    PrintService.printDocument(lastSale, 'SALE', lastSale.branchId),
                    {
                        loading: 'Generando Recibo...',
                        success: 'Venta registrada y comprobante generado 🚀',
                        error: 'Error al generar el recibo PDF, pero la venta se guardó.'
                    }
                );
            } else {
                toast.success('Venta registrada 🚀');
            }
        } else if (!navigator.onLine) {
            // Offline fallback: only EFECTIVO and QR can be queued safely
            // CUOTAS and MIXTO require server-side installment/movement creation → block offline
            const { paymentMethod: currentPayment } = usePosStore.getState();
            if (currentPayment === 'CUOTAS' || currentPayment === 'MIXTO') {
                toast.error('Pago en cuotas y mixto requieren conexión', {
                    description: 'Cambia a Efectivo o QR para registrar la venta sin internet.',
                    duration: 6000,
                });
                return;
            }

            const { cart: currentCart, client: currentClient, getTotals: getCurrentTotals, operationDate: opDate } = usePosStore.getState();
            const totals = getCurrentTotals();
            const { mapCartToSaleItems } = await import('@/logic/sales').then(m => ({ mapCartToSaleItems: m.SalesLogic.mapCartToSaleItems }));
            const change = (currentPayment === 'EFECTIVO' && amountReceived && Number(amountReceived) > totals.total)
                ? Number(amountReceived) - totals.total : 0;

            const __todayStr = localDateStr();
            const saleData: Omit<import('@/types').Sale, 'id'> = {
                cliente: currentClient || { razonSocial: 'Sin Nombre', tipo: 'PARTICULAR', isActive: true },
                items: mapCartToSaleItems(currentCart),
                total: totals.total,
                fecha: opDate && opDate !== __todayStr ? midday(opDate) : new Date(),
                usuarioId: user.uid,
                usuarioEmail: user.email || '',
                usuarioNombre: userName ?? '',
                metodoPago: currentPayment,
                subtotal: totals.subtotal,
                tax: totals.tax,
                itemCount: totals.itemCount,
                status: 'COMPLETED',
                amountReceived: amountReceived ? Number(amountReceived) : undefined,
                change,
                branchId: currentBranch.id,
            };

            const saleDateObj = saleData.fecha instanceof Date ? saleData.fecha : new Date(saleData.fecha);
            const offlineCashMovement: Omit<import('@/types').CashMovement, 'id'> | undefined =
                (currentPayment === 'EFECTIVO' || currentPayment === 'QR')
                    ? {
                        shiftId: '',
                        type: 'INGRESO' as const,
                        amount: totals.total,
                        reason: `Venta POS (Offline)`,
                        date: saleDateObj,
                        userId: user.uid,
                        paymentMethod: currentPayment as 'EFECTIVO' | 'QR',
                    }
                    : undefined;

            enqueueOfflineSale(
                saleData,
                currentBranch.id,
                { uid: user.uid, email: user.email || '?' },
                offlineCashMovement,
            );

            usePosStore.getState().clearCart();
            toast.warning('Sin conexión — Venta encolada', {
                description: `Se sincronizará automáticamente al reconectar. (${pendingCount + 1} en cola)`,
            });
        } else {
            toast.error('No se pudo registrar la venta', {
                description: 'Verifica que la caja esté abierta y haya stock suficiente. Intenta nuevamente.',
            });
        }
        } catch (err) {
            console.error('confirmCheckout:', err);
            toast.error('Error inesperado al procesar la venta', {
                description: 'Recarga la página e intenta nuevamente. El carrito no se perdió.',
            });
        } finally {
            setIsProcessing(false);
        }
    }, [user, userName, currentBranch, amountReceived, isProcessing, pendingCount, paymentMethod, installmentCount, adelanto, adelantoMethod, splitCash, splitQR]);

    const [isQuotationConfirmOpen, setIsQuotationConfirmOpen] = useState(false);
    const [quotationValidityDays, setQuotationValidityDays] = useState<number | ''>('');
    const [isClearCartConfirmOpen, setIsClearCartConfirmOpen] = useState(false);

    // Triggered by buttons
    const handleQuotationClick = () => {
        if (cart.length === 0 || isProcessing) return;

        if (isConsolidatedView) {
            toast.error('No se pueden generar cotizaciones en vista consolidada. Selecciona una sucursal.');
            return;
        }

        if (!currentBranch?.id) {
            toast.error('No hay sucursal seleccionada');
            return;
        }

        setQuotationValidityDays('');
        setIsQuotationConfirmOpen(true);
    };

    const handleClearCartClick = () => {
        if (cart.length === 0) return;
        setIsClearCartConfirmOpen(true);
    };

    const confirmClearCart = () => {
        clearCart();
        setIsClearCartConfirmOpen(false);
        toast.info('Carrito vaciado');
    };

    const loadQuotationIntoCart = async (quotation: Quotation) => {
        let quotationItems = quotation.items;
        if (!quotationItems || quotationItems.length === 0) {
            try {
                const { QuotationService } = await import('@/services/QuotationService');
                quotationItems = await QuotationService.getQuotationItems(quotation.id!);
            } catch (error) {
                console.error('Error loading quotation items:', error);
                toast.error('No se pudieron cargar los ítems de la cotización');
                return false;
            }
        }

        const itemsWithProducts = (quotationItems || []).map(qItem => {
            const product = products.find(p => p.id === qItem.productId);
            if (product) {
                return {
                    ...qItem,
                    product: product,
                    priceConFactura: qItem.priceConFactura,
                    priceSinFactura: qItem.priceSinFactura,
                    unitPrice: qItem.unitPrice
                };
            }

            const fallback: import('@/types').Product = {
                id: qItem.productId,
                masterId: qItem.productId,
                branchId: '',
                nombre: qItem.productName,
                codigo: 'N/A',
                marca: 'Item de Cotización',
                categoria: '',
                precio: qItem.unitPrice,
                precioConFactura: qItem.priceConFactura || qItem.unitPrice,
                precioSinFactura: qItem.priceSinFactura || qItem.unitPrice,
                costo: 0,
                stock: 0,
                minStock: 0,
                isActive: false,
            };
            return { ...qItem, product: fallback };
        });

        loadFromQuotation(itemsWithProducts, quotation.cliente, !!quotation.isTaxed, quotation.id);
        setIsQuotationPickerOpen(false);
        toast.success(`Cotización #COT-${quotation.id?.slice(-4).toUpperCase()} cargada`);
        return true;
    };

    const handleQuotationSelect = async (quotation: Quotation) => {
        if (cart.length > 0) {
            setPendingQuotation(quotation);
            setIsReplaceCartConfirmOpen(true);
            return;
        }
        await loadQuotationIntoCart(quotation);
    };

    // Actual Logic
    const confirmQuotation = useCallback(async () => {
        if (isProcessing) return; // CRITICAL: Prevent double quotation submit

        if (!client) {
            toast.error('Cliente requerido', {
                description: 'Selecciona un cliente antes de generar la cotización.',
            });
            return;
        }

        if (!quotationValidityDays || quotationValidityDays < 1) {
            toast.error('Días de validez requeridos', {
                description: 'Indica cuántos días tendrá vigencia la cotización (ej. 7, 15 o 30 días).',
            });
            return;
        }
        if (!user?.uid) {
            toast.error('Sesión expirada', {
                description: 'Tu sesión expiró. Inicia sesión de nuevo para continuar.',
            });
            return;
        }
        if (!currentBranch?.id) {
            toast.error('Sin sucursal activa', {
                description: 'Selecciona una sucursal desde el selector del encabezado.',
            });
            return;
        }

        setIsProcessing(true);
        setIsQuotationConfirmOpen(false);
        const notes = '';

        try {
            const result = await createQuotation(
                user.uid,
                user.email || '',
                userName ?? '',
                currentBranch.id,
                notes,
                { uid: user.uid, email: user.email || '?' },
                quotationValidityDays as number
            );

            if (result.success && result.data) {
                const validationUrl = `${window.location.origin}/verificar/${result.id}`;
                const whatsappUrl = `https://wa.me/?text=Hola, aquí tienes tu cotización: ${validationUrl}`;

                try {
                    await PrintService.printDocument(result.data as import('@/types').Sale, 'QUOTATION', currentBranch.id);
                    toast.success('Cotización generada con éxito 📄', {
                        action: {
                            label: 'Enviar WA',
                            onClick: () => window.open(whatsappUrl, '_blank')
                        },
                        duration: 8000
                    });
                } catch (printErr) {
                    console.error('Print quotation:', printErr);
                    toast.warning('Cotización guardada, pero no se pudo generar el PDF.');
                }
            } else {
                toast.error('No se pudo crear la cotización', {
            description: 'Verifica tu conexión e intenta de nuevo.',
        });
            }
        } catch (err) {
            console.error('confirmQuotation:', err);
            toast.error('Error al generar la cotización', {
            description: 'Ocurrió un problema inesperado. Recarga la página e intenta de nuevo.',
        });
        } finally {
            setIsProcessing(false);
        }
    }, [user, userName, currentBranch, createQuotation, isProcessing, quotationValidityDays]);

    const handleCheckout = () => {
        if (cart.length === 0 || isProcessing) return;

        if (isConsolidatedView) {
            toast.error('No se pueden realizar ventas en vista consolidada. Selecciona una sucursal.');
            return;
        }

        if (!currentBranch?.id) {
            toast.error('No hay sucursal seleccionada');
            return;
        }

        if (!openShift) {
            toast.error('Caja cerrada', {
                description: 'Abre tu sesión de caja en el módulo Caja → Mi Caja antes de procesar ventas en efectivo, QR o transferencia.',
            });
            return;
        }
        if (paymentMethod === 'CUOTAS' && Number(adelanto) > 0 && !openShift) {
            toast.error('Debes abrir la caja de esta sucursal antes de registrar el adelanto.');
            return;
        }

        setIsCheckoutConfirmOpen(true);
        if (paymentMethod === 'EFECTIVO') {
            setAmountReceived('');
        }
        if (paymentMethod === 'MIXTO') {
            setSplitCash('');
            setSplitQR('');
        }
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F9') {
                e.preventDefault();
                handleCheckout();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                if (isFinalConfirmOpen) {
                    setIsFinalConfirmOpen(false);
                    return;
                }
                if (isQuotationConfirmOpen || isClearCartConfirmOpen || isClientModalOpen || isQuotationPickerOpen || isCheckoutConfirmOpen) {
                    setIsQuotationConfirmOpen(false);
                    setIsClearCartConfirmOpen(false);
                    setIsClientModalOpen(false);
                    setIsQuotationPickerOpen(false);
                    setIsCheckoutConfirmOpen(false);
                    return;
                }
                if (cart.length > 0) {
                    setIsClearCartConfirmOpen(true);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cart, isProcessing, clearCart, isQuotationConfirmOpen, isClearCartConfirmOpen, isClientModalOpen, isQuotationPickerOpen, isCheckoutConfirmOpen, isFinalConfirmOpen, currentBranch?.id, paymentMethod, openShift, isConsolidatedView]);

    return (
        <div data-tour="pos-cart" className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#020617] shadow-xl h-full max-h-full relative transition-all duration-500">
            {/* Consolidated View Block Overlay */}
            {isConsolidatedView && (
                <div className="absolute inset-0 z-30 bg-slate-900/80 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
                    <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-6 border border-blue-500/30">
                        <ArrowRight size={32} className="text-blue-400 rotate-180" />
                    </div>
                    <h3 className="text-xl font-bold text-white uppercase tracking-tight mb-2">Vista Consolidada Activa</h3>
                    <p className="text-slate-300 text-xs max-w-xs mb-8 leading-relaxed">
                        No es posible realizar ventas o cotizaciones en modo global. Selecciona una sucursal específica.
                    </p>
                    <button 
                        onClick={() => window.dispatchEvent(new CustomEvent('openBranchSelector'))}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                    >
                        Seleccionar Sucursal
                    </button>
                </div>
            )}

            {/* Client Modal */}
            <ClientModal
                isOpen={isClientModalOpen}
                onClose={() => {
                    setIsClientModalOpen(false);
                    if (reopenCheckoutRef.current) {
                        reopenCheckoutRef.current = false;
                        setTimeout(() => setIsCheckoutConfirmOpen(true), 100);
                    }
                    reopenQuotationRef.current = false;
                }}
                onSelect={(c) => {
                    setClient(c);
                    setIsClientModalOpen(false);
                    if (reopenCheckoutRef.current) {
                        reopenCheckoutRef.current = false;
                        setTimeout(() => setIsCheckoutConfirmOpen(true), 100);
                    }
                    if (reopenQuotationRef.current) {
                        reopenQuotationRef.current = false;
                        setQuotationValidityDays('');
                        setTimeout(() => setIsQuotationConfirmOpen(true), 100);
                    }
                }}
            />

            {/* Quotation Picker Modal */}
            <QuotationPickerModal
                isOpen={isQuotationPickerOpen}
                onClose={() => setIsQuotationPickerOpen(false)}
                onSelect={handleQuotationSelect}
            />

            {/* Confirm Clear Cart Modal */}
            <ConfirmModal
                isOpen={isClearCartConfirmOpen}
                onClose={() => setIsClearCartConfirmOpen(false)}
                onConfirm={confirmClearCart}
                title="Vaciar Carrito"
                message="¿Estás seguro de que deseas eliminar todos los productos del carrito?"
            />

            <ConfirmModal
                isOpen={isReplaceCartConfirmOpen}
                onClose={() => {
                    setIsReplaceCartConfirmOpen(false);
                    setPendingQuotation(null);
                }}
                onConfirm={async () => {
                    if (pendingQuotation) {
                        await loadQuotationIntoCart(pendingQuotation);
                        setPendingQuotation(null);
                    }
                    setIsReplaceCartConfirmOpen(false);
                }}
                title="Reemplazar Carrito"
                message="El carrito actual se perderá si cargas esta cotización. ¿Deseas continuar?"
            />

            {/* Quotation Confirmation Modal - Technical */}
            {isQuotationConfirmOpen && (
                <div className="absolute inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-background w-full max-w-sm rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center shrink-0">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Confirmar Cotización</h3>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Genera una proforma con estos productos</p>
                                </div>
                            </div>

                            {/* Cliente — obligatorio */}
                            <button
                                onClick={() => {
                                    setIsQuotationConfirmOpen(false);
                                    reopenQuotationRef.current = true;
                                    setTimeout(() => setIsClientModalOpen(true), 100);
                                }}
                                className={clsx(
                                    "w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left group",
                                    client
                                        ? "bg-slate-900 border-slate-900 text-white"
                                        : "bg-amber-50 dark:bg-amber-500/10 border-amber-400 dark:border-amber-500/50 hover:border-amber-500"
                                )}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={clsx("p-1.5 rounded-xl shrink-0", client ? "bg-yellow-500 text-black" : "bg-amber-400 text-white")}>
                                        <UserIcon size={13} />
                                    </div>
                                    <div className="min-w-0">
                                        {!client && <p className="text-[8px] font-black uppercase tracking-widest text-amber-500 leading-none mb-0.5">★ Requerido</p>}
                                        <span className={clsx("font-black text-[11px] block truncate", client ? "text-white" : "text-amber-800 dark:text-amber-300")}>
                                            {client?.razonSocial || "Seleccionar Cliente"}
                                        </span>
                                    </div>
                                </div>
                                <ChevronRight size={14} className={clsx("shrink-0 transition-transform group-hover:translate-x-0.5", client ? "text-white/50" : "text-amber-400")} />
                            </button>

                            {/* Validez */}
                            <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-500/10 rounded-xl px-3 py-2.5">
                                <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest shrink-0">Validez:</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={quotationValidityDays}
                                    onChange={e => {
                                        const v = e.target.value;
                                        setQuotationValidityDays(v === '' ? '' : Math.max(1, Math.min(365, parseInt(v) || 1)));
                                    }}
                                    placeholder="Ej: 15"
                                    className="w-14 text-center text-[11px] font-black bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-500/30 rounded-xl px-1 py-0.5 text-blue-600 dark:text-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                />
                                <span className="text-[10px] font-bold text-blue-500 dark:text-blue-300 shrink-0">días desde hoy</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setIsQuotationConfirmOpen(false)}
                                    className="px-4 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmQuotation}
                                    disabled={isProcessing || !client}
                                    className="px-4 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {isProcessing ? 'Procesando...' : 'Confirmar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Checkout Confirmation Modal - High Density Technical */}
            {isCheckoutConfirmOpen && createPortal(
                <div className="fixed inset-0 z-9999 bg-slate-900/60 flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-background w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl">
                        <div className="p-6 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-500/10 text-green-500 rounded-xl">
                                    <CreditCard size={20} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-none">Confirmar Cobro</h3>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">Resumen de Transacción</span>
                                </div>
                            </div>
                            <button onClick={() => setIsCheckoutConfirmOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
                            {/* Summary Table */}
                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/10 overflow-hidden">
                                <div className="px-3 py-2 bg-slate-100 dark:bg-white/5 flex justify-between items-center">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Resumen de Venta</span>
                                    <span className="text-[9px] font-bold text-slate-400">{itemCount} Art.</span>
                                </div>
                                <div className="p-3 space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                    {cart.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center gap-4 text-[11px]">
                                            <span className="text-slate-500 font-bold w-6">{item.quantity}x</span>
                                            <span className="flex-1 text-slate-700 dark:text-slate-300 wrap-break-word">{item.product.nombre}</span>
                                            <span className="text-slate-900 dark:text-white font-bold tabular-nums">
                                                Bs. {(item.quantity * (item.fixedPrice !== undefined ? item.fixedPrice : (item.priceMode === 'CON_FACTURA' ? (item.product.precioConFactura ?? item.product.precioVenta ?? item.product.precio ?? 0) : (item.product.precioSinFactura ?? item.product.precioVenta ?? item.product.precio ?? 0)))).toFixed(2)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-3 bg-slate-900 dark:bg-black flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Total Final</span>
                                    <span className="text-xl font-bold text-white tracking-tight">Bs. {total.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Client Selector */}
                            <div data-tour="pos-client" className="bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/10 p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <UserIcon size={14} className={client ? "text-green-500" : "text-slate-400"} />
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cliente</p>
                                            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                                {client?.razonSocial || 'Sin asignar'}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            reopenCheckoutRef.current = true;
                                            setIsCheckoutConfirmOpen(false);
                                            setTimeout(() => setIsClientModalOpen(true), 100);
                                        }}
                                        className="h-8 px-3 rounded-xl border border-slate-200 dark:border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:bg-white dark:hover:bg-white/5 transition-all"
                                    >
                                        {client ? 'Cambiar' : 'Seleccionar'}
                                    </button>
                                </div>
                                {clientOverdueInfo?.hasOverdue && (
                                    <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2">
                                        <AlertCircle size={14} className="text-rose-500 shrink-0" />
                                        <p className="text-[9px] font-bold text-rose-500">
                                            MOROSO — {clientOverdueInfo.count} cuota{clientOverdueInfo.count > 1 ? 's' : ''} vencida{clientOverdueInfo.count > 1 ? 's' : ''} (Bs. {clientOverdueInfo.totalOverdue.toFixed(2)})
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Payment Method Selector */}
                            <div data-tour="pos-payment" className="grid grid-cols-4 gap-2">
                                <button
                                    onClick={() => {
                                        usePosStore.getState().setPaymentMethod('EFECTIVO');
                                        setAmountReceived('');
                                    }}
                                    className={clsx(
                                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                                        paymentMethod === 'EFECTIVO'
                                            ? "border-green-500 bg-green-500/5 text-green-600"
                                            : "border-slate-100 dark:border-white/10 text-slate-400 grayscale"
                                    )}
                                >
                                    <Banknote size={20} />
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Efectivo</span>
                                </button>
                                <button
                                    onClick={() => {
                                        usePosStore.getState().setPaymentMethod('QR');
                                        setAmountReceived(total.toString());
                                    }}
                                    className={clsx(
                                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                                        paymentMethod === 'QR'
                                            ? "border-blue-500 bg-blue-500/5 text-blue-600"
                                            : "border-slate-100 dark:border-white/10 text-slate-400 grayscale"
                                    )}
                                >
                                    <QrCode size={20} />
                                    <span className="text-[9px] font-bold uppercase tracking-widest">QR</span>
                                </button>
                                <button
                                    disabled={!isOnline}
                                    title={!isOnline ? 'Requiere conexión' : undefined}
                                    onClick={() => {
                                        usePosStore.getState().setPaymentMethod('MIXTO');
                                        setSplitCash('');
                                        setSplitQR('');
                                    }}
                                    className={clsx(
                                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed",
                                        paymentMethod === 'MIXTO'
                                            ? "border-yellow-500 bg-yellow-500/5 text-yellow-600"
                                            : "border-slate-100 dark:border-white/10 text-slate-400 grayscale"
                                    )}
                                >
                                    <Split size={20} />
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Mixto</span>
                                </button>
                                <button
                                    disabled={!isOnline}
                                    title={!isOnline ? 'Requiere conexión' : undefined}
                                    onClick={() => {
                                        if (!client?.id) {
                                            toast.error('Cliente requerido para cuotas', {
                                                description: 'Las ventas en cuotas deben asociarse a un cliente registrado. Usa el botón "Cliente" en el carrito.',
                                            });
                                            return;
                                        }
                                        usePosStore.getState().setPaymentMethod('CUOTAS');
                                    }}
                                    className={clsx(
                                        "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed",
                                        paymentMethod === 'CUOTAS'
                                            ? "border-purple-500 bg-purple-500/5 text-purple-600"
                                            : "border-slate-100 dark:border-white/10 text-slate-400 grayscale"
                                    )}
                                >
                                    <Layers size={20} />
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Cuotas</span>
                                </button>
                            </div>

                            {/* Method Content */}
                            <div className="animate-in fade-in duration-300">
                                {paymentMethod === 'QR' ? (
                                    <div className="space-y-4">
                                        {config?.qrImageUrl && (
                                            <div className="flex justify-center p-4 bg-white dark:bg-[#111827] rounded-xl border border-slate-100 dark:border-white/10">
                                                <Image src={config.qrImageUrl} alt="QR" width={140} height={140} unoptimized className="object-contain" />
                                            </div>
                                        )}
                                        <div className="grid grid-cols-1 gap-1">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Datos Bancarios</p>
                                            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-white/5 p-3 rounded-xl border border-slate-100 dark:border-white/10 space-y-1">
                                                <div className="flex justify-between"><span>Banco:</span> <span>{config?.bankName || '---'}</span></div>
                                                <div className="flex justify-between"><span>Cuenta:</span> <span>{config?.accountNumber || '---'}</span></div>
                                                <div className="flex justify-between"><span>Titular:</span> <span>{config?.accountHolder || '---'}</span></div>
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={clsx("text-[9px] font-black uppercase tracking-widest", requireBankRef ? "text-amber-500" : "text-slate-400")}>
                                                {requireBankRef ? "★ N° Comprobante (Obligatorio)" : "N° Comprobante (Opcional)"}
                                            </label>
                                            <input
                                                type="text"
                                                value={bankRef}
                                                onChange={e => setBankRef(e.target.value)}
                                                placeholder="Ej: 123456789"
                                                className={clsx(
                                                    "w-full rounded-xl border-2 px-4 py-2.5 text-sm font-bold outline-none transition-all bg-white dark:bg-white/5 dark:text-white",
                                                    requireBankRef && !bankRef.trim()
                                                        ? "border-amber-400 dark:border-amber-500/50 focus:border-amber-500"
                                                        : "border-slate-100 dark:border-white/10 focus:border-blue-500"
                                                )}
                                            />
                                        </div>
                                    </div>
                                ) : paymentMethod === 'MIXTO' ? (
                                    <div className="space-y-4">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Dividir Pago — Efectivo + QR</p>
                                        <div className="space-y-3">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    <Banknote size={14} className="text-green-500" />
                                                    <label className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Efectivo</label>
                                                </div>
                                                <div className="relative">
                                                    <NumericInput
                                                        autoFocus
                                                        value={splitCash}
                                                        onChange={(val) => {
                                                            setSplitCash(val);
                                                            const cashVal = Number(val) || 0;
                                                            const remaining = Math.max(0, Number((total - cashVal).toFixed(2)));
                                                            setSplitQR(remaining > 0 ? remaining.toString() : '');
                                                        }}
                                                        className="w-full bg-slate-50 dark:bg-white/5 border-2 border-slate-100 dark:border-white/10 focus:border-green-500 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 dark:text-white outline-none transition-all"
                                                        placeholder="0.00"
                                                    />
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">Bs.</div>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    <QrCode size={14} className="text-blue-500" />
                                                    <label className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Pago QR</label>
                                                </div>
                                                <div className="relative">
                                                    <NumericInput
                                                        value={splitQR}
                                                        onChange={(val) => {
                                                            setSplitQR(val);
                                                            const qrVal = Number(val) || 0;
                                                            const remaining = Math.max(0, Number((total - qrVal).toFixed(2)));
                                                            setSplitCash(remaining > 0 ? remaining.toString() : '');
                                                        }}
                                                        className="w-full bg-slate-50 dark:bg-white/5 border-2 border-slate-100 dark:border-white/10 focus:border-blue-500 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 dark:text-white outline-none transition-all"
                                                        placeholder="0.00"
                                                    />
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">Bs.</div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Split Summary */}
                                        {(Number(splitCash) > 0 || Number(splitQR) > 0) && (
                                            <div className={clsx(
                                                "p-3 rounded-xl border flex justify-between items-center text-[11px] font-bold",
                                                Math.abs((Number(splitCash) + Number(splitQR)) - total) < 0.01
                                                    ? "bg-green-500/10 border-green-500/20 text-green-600"
                                                    : "bg-rose-500/10 border-rose-500/20 text-rose-500"
                                            )}>
                                                <span className="uppercase tracking-widest text-[9px]">
                                                    {Math.abs((Number(splitCash) + Number(splitQR)) - total) < 0.01 ? 'Montos correctos' : 'Los montos no cuadran'}
                                                </span>
                                                <span className="tabular-nums">
                                                    Bs. {(Number(splitCash) + Number(splitQR)).toFixed(2)} / {total.toFixed(2)}
                                                </span>
                                            </div>
                                        )}
                                        {config?.qrImageUrl && Number(splitQR) > 0 && (
                                            <div className="flex justify-center p-3 bg-white dark:bg-[#111827] rounded-xl border border-slate-100 dark:border-white/10">
                                                <Image src={config.qrImageUrl} alt="QR" width={120} height={120} unoptimized className="object-contain" />
                                            </div>
                                        )}
                                        {Number(splitQR) > 0 && (
                                            <div className="space-y-1.5">
                                                <label className={clsx("text-[9px] font-black uppercase tracking-widest", requireBankRef ? "text-amber-500" : "text-slate-400")}>
                                                    {requireBankRef ? "★ N° Comprobante QR (Obligatorio)" : "N° Comprobante QR (Opcional)"}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={bankRef}
                                                    onChange={e => setBankRef(e.target.value)}
                                                    placeholder="Ej: 123456789"
                                                    className={clsx(
                                                        "w-full rounded-xl border-2 px-4 py-2.5 text-sm font-bold outline-none transition-all bg-white dark:bg-white/5 dark:text-white",
                                                        requireBankRef && !bankRef.trim()
                                                            ? "border-amber-400 dark:border-amber-500/50 focus:border-amber-500"
                                                            : "border-slate-100 dark:border-white/10 focus:border-blue-500"
                                                    )}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ) : paymentMethod === 'CUOTAS' ? (
                                    (() => {
                                        const adelantoNum = Number(adelanto) || 0;
                                        const financed = total - adelantoNum;
                                        const cuotaAmt = Number((financed / installmentCount).toFixed(2));
                                        return (
                                    <div className="space-y-4">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Plan de Cuotas</p>
                                        {/* Moroso block */}
                                        {clientOverdueInfo?.hasOverdue && (
                                            <div className="p-3 bg-rose-500/10 border-2 border-rose-500/30 rounded-xl space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <AlertCircle size={16} className="text-rose-500" />
                                                    <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Cliente Moroso</span>
                                                </div>
                                                <p className="text-[10px] font-bold text-rose-400">
                                                    {clientOverdueInfo.count} cuota{clientOverdueInfo.count > 1 ? 's' : ''} vencida{clientOverdueInfo.count > 1 ? 's' : ''} por Bs. {clientOverdueInfo.totalOverdue.toFixed(2)}. Se recomienda regularizar antes de otorgar nuevas cuotas.
                                                </p>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 bg-purple-500/5 border border-purple-500/20 rounded-xl p-3">
                                            <UserIcon size={14} className="text-purple-500" />
                                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{client?.razonSocial}</span>
                                            {client?.lineaDeCredito ? (
                                                <span className="ml-auto text-[9px] font-bold text-purple-500 uppercase">Línea: Bs. {client.lineaDeCredito.toFixed(2)}</span>
                                            ) : null}
                                        </div>
                                        {/* Client debt warning */}
                                        {client && (client.saldoDeudor || 0) > 0 && (
                                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <AlertCircle size={14} className="text-amber-500" />
                                                    <span className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest">Deuda activa</span>
                                                </div>
                                                <div className="flex justify-between text-[10px] font-bold">
                                                    <span className="text-slate-500">Deuda actual</span>
                                                    <span className="text-amber-600 dark:text-amber-500 tabular-nums">Bs. {(client.saldoDeudor || 0).toFixed(2)}</span>
                                                </div>
                                                {client.lineaDeCredito ? (
                                                    <div className="flex justify-between text-[10px] font-bold">
                                                        <span className="text-slate-500">Disponible</span>
                                                        <span className="text-slate-700 dark:text-slate-300 tabular-nums">Bs. {(client.lineaDeCredito - (client.saldoDeudor || 0)).toFixed(2)}</span>
                                                    </div>
                                                ) : null}
                                                <div className="flex justify-between text-[10px] font-bold">
                                                    <span className="text-slate-500">Nueva deuda total</span>
                                                    <span className="text-rose-500 tabular-nums">Bs. {((client.saldoDeudor || 0) + financed).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        )}
                                        {/* Adelanto (Down Payment) */}
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adelanto</label>
                                                <button onClick={() => setAdelanto(Math.round(total * 0.3).toString())} className="text-[10px] font-bold text-purple-500 uppercase hover:underline">30%</button>
                                            </div>
                                            <div className="relative">
                                                <NumericInput
                                                    value={adelanto}
                                                    onChange={(val) => {
                                                        if (Number(val) <= total) setAdelanto(val);
                                                    }}
                                                    className={clsx(
                                                        "w-full bg-slate-50 dark:bg-white/5 border-2 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 dark:text-white outline-none transition-all",
                                                        Number(adelanto) > total ? "border-red-500" : "border-slate-100 dark:border-white/10 focus:border-purple-500"
                                                    )}
                                                    placeholder="0.00 (opcional)"
                                                />
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">Bs.</div>
                                            </div>
                                            {Number(adelanto) > 0 && (
                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                    {(['EFECTIVO', 'QR'] as const).map(m => (
                                                        <button
                                                            key={m}
                                                            onClick={() => setAdelantoMethod(m)}
                                                            className={clsx(
                                                                "h-9 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all",
                                                                adelantoMethod === m
                                                                    ? "bg-purple-500 text-white border-purple-500"
                                                                    : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400"
                                                            )}
                                                        >
                                                            {m === 'EFECTIVO' ? 'Efectivo' : 'QR'}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Número de Cuotas</label>
                                            <div className="grid grid-cols-4 gap-2">
                                                {[2, 3, 4, 6].map(n => (
                                                    <button
                                                        key={n}
                                                        onClick={() => setInstallmentCount(n)}
                                                        className={clsx(
                                                            "py-3 rounded-xl font-black text-sm border-2 transition-all",
                                                            installmentCount === n
                                                                ? "border-purple-500 bg-purple-500/10 text-purple-600"
                                                                : "border-slate-100 dark:border-white/10 text-slate-400"
                                                        )}
                                                    >
                                                        {n}x
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/10 p-3 space-y-2">
                                            {adelantoNum > 0 && (
                                                <div className="flex justify-between text-[10px] font-bold">
                                                    <span className="text-green-600 uppercase tracking-widest">Adelanto (hoy)</span>
                                                    <span className="text-green-600 tabular-nums">Bs. {adelantoNum.toFixed(2)}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-[10px] font-bold">
                                                <span className="text-slate-400 uppercase tracking-widest">Financiado</span>
                                                <span className="text-slate-900 dark:text-white tabular-nums">Bs. {financed.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between text-[10px] font-bold">
                                                <span className="text-slate-400 uppercase tracking-widest">Valor por cuota</span>
                                                <span className="text-slate-900 dark:text-white tabular-nums">Bs. {cuotaAmt.toFixed(2)}</span>
                                            </div>
                                            <div className="border-t border-slate-100 dark:border-white/10 pt-2 space-y-1">
                                                {Array.from({ length: installmentCount }, (_, i) => {
                                                    const dueDate = new Date();
                                                    dueDate.setMonth(dueDate.getMonth() + i + 1);
                                                    const amt = i === installmentCount - 1
                                                        ? Number((financed - cuotaAmt * (installmentCount - 1)).toFixed(2))
                                                        : cuotaAmt;
                                                    return (
                                                        <div key={i} className="flex justify-between text-[10px]">
                                                            <span className="text-slate-400 font-bold">Cuota {i + 1} — {dueDate.toLocaleDateString('es-BO', { month: 'short', year: 'numeric' })}</span>
                                                            <span className="text-slate-600 dark:text-slate-300 font-bold tabular-nums">Bs. {amt.toFixed(2)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                        );
                                    })()
                                ) : (
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Efectivo Recibido</label>
                                                <button onClick={() => setAmountReceived(total.toString())} className="text-[10px] font-bold text-blue-500 uppercase hover:underline">Monto Exacto</button>
                                            </div>
                                            <div className="relative">
                                                <NumericInput
                                                    autoFocus
                                                    value={amountReceived}
                                                    onChange={setAmountReceived}
                                                    className="w-full bg-slate-50 dark:bg-white/5 border-2 border-slate-100 dark:border-white/10 focus:border-green-500 rounded-xl px-4 py-4 text-2xl font-bold text-slate-900 dark:text-white outline-none transition-all"
                                                    placeholder="0.00"
                                                />
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Bs.</div>
                                            </div>
                                        </div>
                                        {Number(amountReceived) >= total && (
                                            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex justify-between items-center animate-in slide-in-from-top-2">
                                                <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Cambio a Entregar</span>
                                                <span className="text-2xl font-bold text-green-600">Bs. {(Number(amountReceived) - total).toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-6 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/10 flex gap-3">
                            <button
                                onClick={() => setIsCheckoutConfirmOpen(false)}
                                className="flex-1 py-3 px-4 rounded-xl font-bold text-[10px] uppercase tracking-widest text-slate-500 hover:bg-white dark:hover:bg-white/5 border border-slate-200 dark:border-white/10 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => setIsFinalConfirmOpen(true)}
                                disabled={
                                    isProcessing ||
                                    (paymentMethod === 'EFECTIVO' && Number(amountReceived) < total) ||
                                    (paymentMethod === 'MIXTO' && Math.abs((Number(splitCash) + Number(splitQR)) - total) >= 0.01) ||
                                    (paymentMethod === 'CUOTAS' && !client?.id) ||
                                    (requireBankRef && (paymentMethod === 'QR' || (paymentMethod === 'MIXTO' && Number(splitQR) > 0)) && !bankRef.trim())
                                }
                                className="flex-2 py-3 px-4 rounded-xl font-bold text-[10px] uppercase tracking-widest bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black hover:opacity-90 disabled:opacity-30 disabled:grayscale transition-all shadow-lg active:scale-95"
                            >
                                {isProcessing ? 'Procesando...' : 'Confirmar Venta'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Final Confirmation Alert - Technical Compact */}
            {isFinalConfirmOpen && createPortal(
                <div onClick={() => !isProcessing && setIsFinalConfirmOpen(false)} className="fixed inset-0 z-10000 bg-slate-950/80 flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-200">
                    <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-background w-full max-w-xs rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden relative">
                        <button onClick={() => setIsFinalConfirmOpen(false)} disabled={isProcessing} className="absolute top-2 right-2 p-1.5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-all z-10 disabled:opacity-30"><X size={14} className="text-slate-400" /></button>
                        <div className="p-6 text-center space-y-4">
                            <div className="w-12 h-12 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-2">
                                <AlertCircle size={24} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">Confirmación Final</h3>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest">¿Estás seguro de finalizar?</p>
                            </div>

                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 border border-slate-100 dark:border-white/10 space-y-2 text-left">
                                <div className="flex justify-between items-baseline text-[10px] font-bold">
                                    <span className="text-slate-400 uppercase tracking-widest">Total</span>
                                    <span className="text-slate-900 dark:text-white">Bs. {total.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-baseline text-[10px] font-bold">
                                    <span className="text-slate-400 uppercase tracking-widest">Método</span>
                                    <span className="text-blue-500 uppercase">{paymentMethod}</span>
                                </div>
                                {paymentMethod === 'MIXTO' && (
                                    <>
                                        <div className="flex justify-between items-baseline text-[10px] font-bold">
                                            <span className="text-slate-400 uppercase tracking-widest">Efectivo</span>
                                            <span className="text-green-500">Bs. {Number(splitCash).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-baseline text-[10px] font-bold">
                                            <span className="text-slate-400 uppercase tracking-widest">QR</span>
                                            <span className="text-blue-500">Bs. {Number(splitQR).toFixed(2)}</span>
                                        </div>
                                    </>
                                )}
                                {paymentMethod === 'CUOTAS' && (
                                    <>
                                        {Number(adelanto) > 0 && (
                                            <div className="flex justify-between items-baseline text-[10px] font-bold">
                                                <span className="text-slate-400 uppercase tracking-widest">Adelanto</span>
                                                <span className="text-green-500">Bs. {Number(adelanto).toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-baseline text-[10px] font-bold">
                                            <span className="text-slate-400 uppercase tracking-widest">Cuotas</span>
                                            <span className="text-purple-500">{installmentCount}x Bs. {((total - (Number(adelanto) || 0)) / installmentCount).toFixed(2)}</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <button
                                    onClick={() => setIsFinalConfirmOpen(false)}
                                    className="px-4 py-2.5 rounded-xl font-bold text-[9px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                                >
                                    Corregir
                                </button>
                                <button
                                    onClick={confirmCheckout}
                                    disabled={isProcessing}
                                    className="px-4 py-2.5 rounded-xl font-bold text-[9px] uppercase tracking-widest bg-rose-600 hover:bg-rose-500 text-white shadow-lg disabled:opacity-50 disabled:grayscale transition-all active:scale-95"
                                >
                                    {isProcessing ? 'Procesando...' : 'Confirmar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Suspended Sales Modal - Technical */}
            {isSuspendedModalOpen && (
                <div className="absolute inset-0 z-50 bg-slate-950/90 p-4 animate-in slide-in-from-bottom-10">
                    <div className="h-full flex flex-col bg-white dark:bg-background rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-2xl">
                        <div className="p-4 border-b border-slate-100 dark:border-white/10 flex justify-between items-center">
                            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-[0.2em] flex items-center gap-2">
                                <Pause size={14} className="text-yellow-500" />
                                Ventas en Espera
                            </h3>
                            <button onClick={() => setIsSuspendedModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {suspendedSales.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-40">
                                    <History size={32} className="mb-2" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest">Sin ventas pausadas</p>
                                </div>
                            ) : (
                                suspendedSales.map(sale => (
                                    <div key={sale.id} className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 p-3 rounded-xl flex justify-between items-center hover:border-yellow-500/30 transition-all group">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="text-[9px] font-bold bg-yellow-500/10 text-yellow-600 px-1.5 py-0.5 rounded uppercase">{formatTime(new Date(sale.date))}</span>
                                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 wrap-break-word">{sale.client?.razonSocial || 'Público General'}</span>
                                            </div>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{sale.cart.length} Art. • Bs. {sale.total.toFixed(2)}</p>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => { resumeSale(sale.id); setIsSuspendedModalOpen(false); }}
                                                className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all"
                                                title="Recuperar"
                                            >
                                                <Plus size={16} />
                                            </button>
                                            <button
                                                onClick={() => deleteSuspendedSale(sale.id)}
                                                className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            {/* Header - High Density Technical */}
            <div className="p-3 sm:p-4 bg-white dark:bg-[#111827] border-b border-slate-100 dark:border-white/10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0 z-10 min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-[#FFD700] flex items-center justify-center shadow-lg shadow-black/10 dark:shadow-[#FFD700]/10 shrink-0">
                        <ShoppingCart size={20} className="text-white dark:text-black" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-tight leading-none mb-1">Tu Carrito</h2>
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{itemCount} Artículos</span>
                        {(!isOnline || pendingCount > 0) && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                                {!isOnline ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-[8px] font-black text-yellow-600 uppercase tracking-widest">
                                        <WifiOff size={9} /> Offline
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/10 rounded-xl text-[8px] font-black text-blue-500 uppercase tracking-widest">
                                        <Wifi size={9} /> Online
                                    </span>
                                )}
                                {pendingCount > 0 && (
                                    <button
                                        onClick={() => { if (isOnline) syncQueue(); }}
                                        className="px-1.5 py-0.5 bg-yellow-500 text-black rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-yellow-400 transition-all"
                                    >
                                        {pendingCount} en cola
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1.5 w-full sm:w-auto">
                    {/* Utility Buttons */}
                    <button
                        onClick={() => {
                            const allowRetro = config?.allowRetroactiveSales === true;
                            if (!operationDate && !allowRetro) {
                                toast.warning('No puedes registrar ventas con fecha pasada.', {
                                    description: 'Pide al gerente que autorice esta opción.'
                                });
                                return;
                            }
                            if (operationDate) {
                                setOperationDate(null);
                                toast.info('Vuelto a tiempo real');
                            } else {
                                const yesterday = new Date();
                                yesterday.setDate(yesterday.getDate() - 1);
                                setOperationDate(yesterday.toISOString().split('T')[0]);
                                toast.warning('Modo Retroactivo activado');
                            }
                        }}
                        className={clsx(
                            "p-2 rounded-xl transition-all border",
                            operationDate
                                ? "bg-orange-50 border-orange-200 text-orange-600 animate-pulse"
                                : "bg-slate-50 dark:bg-white/5 border-transparent text-slate-400 hover:text-slate-600"
                        )}
                        title="Modo Retroactivo"
                    >
                        {operationDate ? <Clock size={16} /> : <CalendarDays size={16} />}
                    </button>

                    <div className="w-px h-6 bg-slate-100 dark:bg-white/5 mx-0.5" />

                    <button
                        onClick={() => setIsQuotationPickerOpen(true)}
                        className="p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 hover:bg-blue-100 transition-all border border-transparent"
                        title="Cargar Cotización"
                    >
                        <FolderOpen size={16} />
                    </button>

                    <button
                        onClick={() => { if (cart.length > 0) suspendSale(); }}
                        disabled={cart.length === 0}
                        className="p-2 rounded-xl bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-yellow-600 transition-all border border-transparent disabled:opacity-30"
                        title="Suspender Venta"
                    >
                        <Pause size={16} />
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setIsSuspendedModalOpen(true)}
                            className="p-2 rounded-xl bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all border border-transparent"
                            title="Ventas Pausadas"
                        >
                            <History size={16} />
                        </button>
                        {suspendedSales.length > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-yellow-500 rounded-full border-2 border-white dark:border-white/10" />
                        )}
                    </div>

                    <div className="w-px h-6 bg-slate-100 dark:bg-white/5 mx-0.5" />

                    <button
                        onClick={handleClearCartClick}
                        className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                        title="Vaciar Carrito"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            {/* Client & Configuration - High Density */}
            <div className="px-4 py-2 bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/10 flex flex-col gap-2">
                <div className="flex gap-2">
                    <button
                        data-tour="pos-client"
                        onClick={() => setIsClientModalOpen(true)}
                        className={clsx(
                            "flex-1 flex items-center justify-between p-2.5 rounded-xl border transition-all text-left group",
                            client
                                ? "bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/20"
                                : "bg-white dark:bg-[#111827] border-slate-200 dark:border-white/10 text-slate-500"
                        )}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <div className={clsx("p-1.5 rounded-xl", client ? "bg-yellow-500 text-black" : "bg-slate-100 dark:bg-white/5 text-slate-400")}>
                                <UserIcon size={14} />
                            </div>
                            <span className="text-[11px] font-bold wrap-break-word">
                                {client?.razonSocial || "Consumidor Final"}
                            </span>
                        </div>
                        {client ? (
                            <X size={14} onClick={(e) => { e.stopPropagation(); setClient(null); }} className="text-white/50 hover:text-white" />
                        ) : (
                            <ChevronRight size={14} className="text-slate-300 group-hover:translate-x-0.5 transition-transform" />
                        )}
                    </button>

                    <div className="inline-flex p-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                        <button
                            onClick={() => setAllItemsPriceMode('CON_FACTURA')}
                            className={clsx(
                                "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all",
                                invoiceMode === 'CON_FACTURA' ? "bg-white dark:bg-white/10 text-blue-600 shadow-sm" : "text-slate-400"
                            )}
                        >
                            C/F
                        </button>
                        <button
                            onClick={() => setAllItemsPriceMode('SIN_FACTURA')}
                            className={clsx(
                                "px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all",
                                invoiceMode === 'SIN_FACTURA' ? "bg-white dark:bg-white/10 text-green-600 shadow-sm" : "text-slate-400"
                            )}
                        >
                            S/F
                        </button>
                    </div>
                </div>

                {operationDate && (
                    <div className="flex items-center justify-between px-3 py-2 bg-orange-500/10 border border-orange-500/20 rounded-xl animate-in slide-in-from-top-1">
                        <div className="flex items-center gap-2">
                            <CalendarDays size={14} className="text-orange-500" />
                            <span className="text-[9px] font-bold text-orange-600 uppercase tracking-widest">Post-Fecha:</span>
                        </div>
                        <input
                            type="date"
                            value={operationDate}
                            max={localDateStr()}
                            onChange={(e) => setOperationDate(e.target.value)}
                            className="bg-transparent text-[11px] font-bold text-orange-700 outline-none"
                        />
                    </div>
                )}
            </div>

            {/* Item List - High Density Technical */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-2 custom-scrollbar bg-white dark:bg-[#020617]">
                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-white/10 opacity-40">
                        <ShoppingCart size={48} strokeWidth={1} className="mb-4" />
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Seleccione productos</p>
                    </div>
                ) : (
                    cart.map((item) => {
                        const currentPrice = item.fixedPrice !== undefined
                            ? item.fixedPrice
                            : (item.priceMode === 'CON_FACTURA'
                                ? (item.product.precioConFactura ?? item.product.precioVenta ?? item.product.precio ?? 0)
                                : (item.product.precioSinFactura ?? item.product.precioVenta ?? item.product.precio ?? 0));

                        return (
                            <div
                                key={item.product.id}
                                onMouseEnter={(e) => onCartItemHoverEnter(e, item.product)}
                                onMouseLeave={onCartItemHoverLeave}
                                className={clsx(
                                    "group p-3 rounded-2xl border transition-all relative overflow-hidden",
                                    item.quantity > item.product.stock
                                        ? "bg-yellow-500/5 border-yellow-500/20 dark:border-yellow-500/10"
                                        : "bg-slate-50/50 dark:bg-[#111827]/40 border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10"
                                )}
                            >
                                <div className="flex justify-between items-start gap-4 mb-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] wrap-break-word">
                                                {item.product.marca || 'GENÉRICO'}
                                            </span>
                                            {item.quantity > item.product.stock && (
                                                <span className="px-1.5 py-0.5 bg-yellow-500 text-black text-[8px] font-black rounded-xl uppercase tracking-widest">Cotización</span>
                                            )}
                                            {item.discount && (
                                                <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[8px] font-black rounded-xl uppercase tracking-widest">
                                                    {item.discount.type === 'PERCENTAGE' ? `-${item.discount.value}%` : `Bs.${item.discount.value}`}
                                                </span>
                                            )}
                                        </div>
                                        <h4 className="text-xs font-bold uppercase text-slate-900 dark:text-white leading-tight">
                                            {item.product.nombre}
                                        </h4>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{item.product.codigo}</span>
                                            {item.product.codigoFabrica && (
                                                <span className="text-[9px] font-bold text-blue-500/60">{item.product.codigoFabrica}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        {/* CF/SF Toggle */}
                                        <div 
                                            onClick={() => setItemPriceMode(item.product.id!, item.priceMode === 'CON_FACTURA' ? 'SIN_FACTURA' : 'CON_FACTURA')}
                                            className="inline-flex p-0.5 bg-slate-200 dark:bg-white/10 rounded-xl cursor-pointer mb-1"
                                        >
                                            <div className={clsx(
                                                "px-1.5 py-0.5 rounded-xl text-[8px] font-black transition-all",
                                                item.priceMode === 'CON_FACTURA' ? "bg-white dark:bg-slate-800 text-blue-600 shadow-sm" : "text-slate-400"
                                            )}>CF</div>
                                            <div className={clsx(
                                                "px-1.5 py-0.5 rounded-xl text-[8px] font-black transition-all",
                                                item.priceMode === 'SIN_FACTURA' ? "bg-white dark:bg-slate-800 text-blue-600 shadow-sm" : "text-slate-400"
                                            )}>SF</div>
                                        </div>
                                        {item.pendingDiscount && (
                                            <span className="inline-block px-1.5 py-0.5 mb-1 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 text-[8px] font-black uppercase tracking-wider animate-pulse">
                                                Esperando gerente
                                            </span>
                                        )}
                                        {item.discount && (
                                            <p className="text-[9px] font-bold text-slate-400 line-through tabular-nums">
                                                Bs. {item.discount.originalPrice.toFixed(2)}
                                            </p>
                                        )}
                                        <p className="text-sm font-black tabular-nums tracking-tighter text-slate-900 dark:text-white">
                                            Bs. {currentPrice.toFixed(2)}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-white/10 p-1 shadow-sm">
                                            <button
                                                onClick={() => updateQuantity(item.product.id!, Math.max(1, item.quantity - 1))}
                                                className="w-6 h-6 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 transition-colors"
                                            >
                                                <Minus size={12} />
                                            </button>
                                            <NumericInput 
                                                value={item.quantity}
                                                onChange={(val) => updateQuantity(item.product.id!, Number(val))}
                                                className="w-10 text-center text-[13px] font-black bg-transparent text-slate-900 dark:text-white outline-none tabular-nums"
                                            />
                                            <button
                                                onClick={() => updateQuantity(item.product.id!, item.quantity + 1)}
                                                className="w-6 h-6 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 transition-colors"
                                            >
                                                <Plus size={12} />
                                            </button>
                                        </div>
                                        {/* Discount toggle */}
                                        <button
                                            onClick={() => {
                                                if (item.pendingDiscount) {
                                                    toast.info('Ya hay una solicitud pendiente.', {
                                                        description: 'Espera la respuesta del gerente o cancela desde la X.'
                                                    });
                                                    return;
                                                }
                                                if (discountTarget === item.product.id) {
                                                    setDiscountTarget(null);
                                                } else {
                                                    setDiscountTarget(item.product.id!);
                                                    setDiscountMode('PERCENTAGE');
                                                    setDiscountValue('');
                                                    setTimeout(() => discountInputRef.current?.focus(), 100);
                                                }
                                            }}
                                            className={clsx(
                                                "p-1.5 rounded-xl border transition-all",
                                                item.pendingDiscount
                                                    ? "border-orange-500/40 bg-orange-500/10 text-orange-600 animate-pulse"
                                                    : item.discount
                                                    ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                                    : "border-slate-100 dark:border-white/10 text-slate-400 hover:text-yellow-600 hover:border-yellow-500/30"
                                            )}
                                            title={item.pendingDiscount ? 'Solicitud pendiente de gerente' : item.discount ? 'Modificar descuento' : 'Aplicar descuento'}
                                        >
                                            <Tag size={12} />
                                        </button>
                                        {item.pendingDiscount && (
                                            <button
                                                onClick={() => {
                                                    clearPendingDiscount(item.product.id!);
                                                    toast.info('Solicitud quitada del carrito.', {
                                                        description: 'La aprobación queda en bandeja del gerente igual.'
                                                    });
                                                }}
                                                className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                                                title="Quitar solicitud pendiente"
                                            >
                                                <X size={12} />
                                            </button>
                                        )}
                                        {item.discount && (
                                            <button
                                                onClick={() => removeDiscount(item.product.id!)}
                                                className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                                                title="Quitar descuento"
                                            >
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest tabular-nums">
                                            Sub: <span className="text-slate-900 dark:text-white">Bs. {(item.quantity * currentPrice).toFixed(2)}</span>
                                        </p>
                                        <button
                                            onClick={() => removeFromCart(item.product.id!)}
                                            className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Inline Discount Popover */}
                                {discountTarget === item.product.id && (
                                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/5 flex items-center gap-2 animate-in slide-in-from-top-1 duration-150">
                                        <div className="flex p-0.5 bg-slate-200 dark:bg-white/10 rounded-xl shrink-0">
                                            <button
                                                onClick={() => { setDiscountMode('PERCENTAGE'); setDiscountValue(''); }}
                                                className={clsx("px-2 py-1 rounded-xl text-[8px] font-black uppercase transition-all", discountMode === 'PERCENTAGE' ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm" : "text-slate-400")}
                                            >
                                                <Percent size={10} />
                                            </button>
                                            <button
                                                onClick={() => { setDiscountMode('FIXED_PRICE'); setDiscountValue(''); }}
                                                className={clsx("px-2 py-1 rounded-xl text-[8px] font-black uppercase transition-all", discountMode === 'FIXED_PRICE' ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm" : "text-slate-400")}
                                            >
                                                Bs.
                                            </button>
                                        </div>
                                        <NumericInput
                                            ref={discountInputRef}
                                            placeholder={discountMode === 'PERCENTAGE' ? '% desc.' : 'Precio final'}
                                            value={discountValue}
                                            onChange={setDiscountValue}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleApplyDiscount(item.product.id!); if (e.key === 'Escape') setDiscountTarget(null); }}
                                            className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-slate-900 dark:text-white outline-none focus:border-yellow-500 transition-all tabular-nums"
                                        />
                                        <button
                                            onClick={() => handleApplyDiscount(item.product.id!)}
                                            disabled={!discountValue || Number(discountValue) <= 0}
                                            className="px-3 py-1.5 bg-yellow-500 text-black rounded-xl text-[9px] font-black uppercase tracking-[0.15em] disabled:opacity-30 active:scale-95 transition-all shrink-0"
                                        >
                                            Aplicar
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer Summary - Clean & Technical */}
            <div className="p-4 bg-slate-900 dark:bg-black border-t border-white/5 space-y-4 shrink-0">
                <div className="space-y-2">
                    {discountAmount > 0 && (
                        <>
                            <div className="flex justify-between items-center text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                <span>Subtotal</span>
                                <span className="tabular-nums">Bs. {rawSubtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] font-bold text-rose-400 uppercase tracking-widest">
                                <span>Descuento</span>
                                <span className="tabular-nums">- Bs. {discountAmount.toFixed(2)}</span>
                            </div>
                        </>
                    )}
                    <div className="flex justify-between items-end border-b border-white/5 pb-4">
                        <span className="text-xs font-bold text-white uppercase tracking-tight">Total a Cobrar</span>
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-[0.2em] leading-none mb-1">Bolivianos</span>
                            <span className="text-2xl font-black text-white tracking-tighter tabular-nums leading-none">
                                {total.toFixed(0)}<span className="text-xs opacity-50 font-bold">.{(total.toFixed(2).split('.')[1])}</span>
                            </span>
                        </div>
                    </div>

                    {/* USD Conversion Widget - Dynamic BI */}
                    <div className="flex justify-between items-center px-3 py-2 bg-white/5 rounded-xl border border-white/5 animate-in fade-in duration-700">
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500 text-[10px] font-black underline">
                                $
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Referencial USD</span>
                                <span className="text-[8px] font-bold text-slate-600 tabular-nums">1 USD = Bs {(config?.exchangeRate || 9.30).toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-emerald-400 font-mono tracking-tighter">
                                $ {(total / (config?.exchangeRate || 9.30)).toFixed(2)}
                            </span>
                            <button
                                type="button"
                                disabled={isSyncingRate}
                                onClick={async () => {
                                    setIsSyncingRate(true);
                                    try {
                                        const res = await fetch('/api/exchange-rate');
                                        const data = await res.json();
                                        if (data.venta && data.venta > 1) {
                                            const { ConfigService } = await import('@/services/ConfigService');
                                            const cfg = await ConfigService.getGlobalConfig();
                                            if (cfg) {
                                                await ConfigService.saveConfig({ ...cfg, exchangeRate: data.venta }, undefined);
                                            }
                                            toast.success(`TC actualizado: Bs ${data.venta}`, { description: `Fuente: ${data.source}` });
                                            // Refresh config context
                                            refreshConfig();
                                        } else {
                                            toast.error('No se pudo obtener el TC');
                                        }
                                    } catch {
                                        toast.error('Error de conexión');
                                    } finally {
                                        setIsSyncingRate(false);
                                    }
                                }}
                                className="p-1 rounded-xl hover:bg-white/10 text-slate-500 hover:text-emerald-400 transition-all"
                                title="Sincronizar con BCB"
                            >
                                <RefreshCw size={10} className={isSyncingRate ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={handleQuotationClick}
                        disabled={cart.length === 0 || isProcessing}
                        className="flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-20 active:scale-95"
                    >
                        <FileText size={14} />
                        Proforma
                    </button>
                    <button
                        data-tour="pos-checkout"
                        onClick={handleCheckout}
                        disabled={cart.length === 0 || isProcessing || hasInsufficientStock}
                        className={clsx(
                            "flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-30 disabled:grayscale",
                            invoiceMode === 'CON_FACTURA' 
                                ? "bg-yellow-500 text-black shadow-yellow-500/10 hover:bg-yellow-400" 
                                : "bg-white text-black shadow-white/5 hover:bg-slate-100"
                        )}
                    >
                        {hasInsufficientStock ? 'Stock Insuficiente' : !isOnline ? 'Encolar Venta (F9)' : 'Cobrar (F9)'}
                        <ArrowRight size={14} />
                    </button>
                </div>
            </div>
            <ProductPreviewTooltip
                anchor={cartItemHover?.element ?? null}
                product={cartItemHover?.product ?? null}
            />

            {hardBlockModal && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 flex flex-col items-center gap-5 border border-slate-200 dark:border-white/10">
                        <div className="flex flex-col items-center gap-2 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-1">
                                <AlertCircle size={32} className="text-rose-500" />
                            </div>
                            <h2 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                Descuento bloqueado
                            </h2>
                            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                Esperando aprobación del gerente
                            </p>
                        </div>
                        <div className="w-full rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-4 space-y-1 text-center">
                            <p className="text-xl font-black text-rose-500">{hardBlockModal.effectiveDiscountPct.toFixed(1)}% descuento</p>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{hardBlockModal.productName}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Bs. {hardBlockModal.basePrice.toFixed(2)} → Bs. {hardBlockModal.finalPrice.toFixed(2)}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                            El gerente recibió la solicitud. Esta ventana se cerrará automáticamente.
                        </div>
                        <button
                            onClick={() => setHardBlockModal(null)}
                            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-white uppercase tracking-widest transition-colors"
                        >
                            Cancelar solicitud
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
