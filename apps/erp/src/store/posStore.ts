import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { toast } from 'sonner';
import { Product, CartItem, Client, Sale, SuspendedSale, QuotationItem, Quotation, CashMovement } from '@/types';
import { SaleService } from '@/services/SaleService';
import { QuotationService } from '@/services/QuotationService';
import { PricingLogic } from '@/logic/pricing';
import { SalesLogic } from '@/logic/sales';
import { midday, localDateStr } from '@/lib/utils';

export interface PosState {
    // State
    cart: CartItem[];
    client: Client | null;
    lastSale: Sale | null;
    pendingQuotationId: string | null; // ID de cotización activa cargada al POS
    paymentMethod: 'EFECTIVO' | 'QR' | 'MIXTO' | 'CUOTAS';
    invoiceMode: 'CON_FACTURA' | 'SIN_FACTURA';
    viewMode: 'grid' | 'list';
    searchTerm: string;
    selectedCategory: string;
    operationDate: string | null; // ISO Date String
    suspendedSales: SuspendedSale[];

    // Computeds (Derived state helpers)
    getTotals: () => { subtotal: number; tax: number; total: number; itemCount: number; discountAmount: number };

    // Actions
    addToCart: (product: Product, quantity?: number) => void;
    removeFromCart: (productId: string) => void;
    updateQuantity: (productId: string, quantity: number) => void;
    setClient: (client: Client | null) => void;
    setPaymentMethod: (method: 'EFECTIVO' | 'QR' | 'MIXTO' | 'CUOTAS') => void;
    setInvoiceMode: (mode: 'CON_FACTURA' | 'SIN_FACTURA') => void;
    setSearchTerm: (term: string) => void;
    setCategory: (category: string) => void;
    setViewMode: (mode: 'grid' | 'list') => void;
    setItemPriceMode: (productId: string, mode: 'CON_FACTURA' | 'SIN_FACTURA') => void;
    setAllItemsPriceMode: (mode: 'CON_FACTURA' | 'SIN_FACTURA') => void;
    setOperationDate: (date: string | null) => void;
    clearCart: () => void;
    suspendSale: () => void;
    resumeSale: (id: string) => void;
    deleteSuspendedSale: (id: string) => void;
    processSale: (userId: string, userEmail: string, userName: string, branchId: string, adminInfo?: { uid: string, email: string }, amountReceived?: number, splitPayment?: { cash: number; qr: number }, installments?: number, adelanto?: number, adelantoMethod?: 'EFECTIVO' | 'QR') => Promise<boolean>;
    createQuotation: (userId: string, userEmail: string, userName: string, branchId: string, notes?: string, adminInfo?: { uid: string, email: string }, validityDays?: number) => Promise<{ success: boolean; id?: string; data?: unknown }>;
    loadFromQuotation: (items: (QuotationItem & { product: Product })[], client: Client | null, isTaxed: boolean, quotationId?: string) => void;
    refreshCartPrices: (products: Product[]) => void;
    applyDiscount: (productId: string, type: 'PERCENTAGE' | 'FIXED_PRICE', value: number, userId: string, userEmail: string) => void;
    removeDiscount: (productId: string) => void;
    setPendingDiscount: (productId: string, pending: { approvalId: string; type: 'PERCENTAGE' | 'FIXED_PRICE'; value: number }) => void;
    clearPendingDiscount: (productId: string) => void;
}

export const usePosStore = create<PosState>()(
    persist(
        (set, get) => ({
            // Initial State
            cart: [] as CartItem[],
            client: null as Client | null,
            lastSale: null as Sale | null,
            pendingQuotationId: null as string | null,
            paymentMethod: 'EFECTIVO',
            invoiceMode: 'CON_FACTURA', // Default (Legal)
            viewMode: 'grid',
            searchTerm: '',
            selectedCategory: 'Todos',
            operationDate: null,
            suspendedSales: [] as SuspendedSale[],

            // Getters
            getTotals: () => {
                const { cart } = get();
                return PricingLogic.calculateTotals(cart);
            },

            // Actions
            addToCart: (product: Product, quantity: number = 1) => {
                const { cart } = get();
                const existingItem = cart.find((item: CartItem) => item.product.id === product.id);

                // Validación de stock offline: usar snapshot local si no hay conexión
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                    try {
                        const snapshot: Record<string, number> = JSON.parse(
                            localStorage.getItem('renotech_stock_snapshot') || '{}'
                        );
                        const snapshotStock = snapshot[product.id!] ?? product.stock ?? 0;
                        const inCart = existingItem ? existingItem.quantity : 0;
                        const available = snapshotStock - inCart;
                        if (available < quantity) {
                            const { toast } = require('sonner');
                            toast.error(`Stock insuficiente (offline) — disponible: ${Math.max(0, available)}`, {
                                description: 'Snapshot tomado al conectarse por última vez',
                            });
                            return;
                        }
                    } catch { /* si falla, dejar pasar — no bloquear por error interno */ }
                }

                if (existingItem) {
                    const newQuantity = existingItem.quantity + quantity;
                    get().updateQuantity(product.id!, newQuantity);
                } else {
                    const { invoiceMode } = get();
                    set({ cart: [...cart, { product, quantity: quantity, priceMode: invoiceMode }] });
                }
            },

            removeFromCart: (productId: string) => {
                set((state: PosState) => ({
                    cart: state.cart.filter((item: CartItem) => item.product.id !== productId)
                }));
            },

            refreshCartPrices: (products: Product[]) => {
                set((state: PosState) => {
                    let changed = false;
                    const newCart = state.cart.map((item: CartItem) => {
                        const dbProduct = products.find(p => p.id === item.product.id);
                        if (!dbProduct) return item; 
                        
                        // Check if prices, stock or soft-deletion changed globally
                        if (
                            item.product.precioSinFactura !== dbProduct.precioSinFactura ||
                            item.product.precioConFactura !== dbProduct.precioConFactura ||
                            item.product.stock !== dbProduct.stock ||
                            item.product.isActive !== dbProduct.isActive
                        ) {
                            changed = true;
                            return { ...item, product: dbProduct };
                        }
                        return item;
                    }).filter(item => item.product.isActive !== false); // Auto-purge discontinued items

                    if (!changed) return state; 
                    return { cart: newCart };
                });
            },

            updateQuantity: (productId: string, quantity: number) => {
                set((state: PosState) => {
                    const item = state.cart.find((i: CartItem) => i.product.id === productId);
                    if (!item) return state;

                    if (quantity <= 0) {
                        return { cart: state.cart.filter((i: CartItem) => i.product.id !== productId) };
                    }

                    // Allow arbitrary quantity (will be blocked from checkout if exceeds stock, but valid for quotation)
                    const finalQty = quantity;

                    return {
                        cart: state.cart.map((i: CartItem) => i.product.id === productId ? { ...i, quantity: finalQty } : i)
                    };
                });
            },

            setClient: (client: Client | null) => set({ client }),
            setPaymentMethod: (paymentMethod: 'EFECTIVO' | 'QR' | 'MIXTO' | 'CUOTAS') => set({ paymentMethod }),
            setInvoiceMode: (invoiceMode: 'CON_FACTURA' | 'SIN_FACTURA') => set({ invoiceMode }),
            setSearchTerm: (searchTerm: string) => set({ searchTerm }),
            setCategory: (selectedCategory: string) => set({ selectedCategory, searchTerm: '' }),
            setViewMode: (viewMode: 'grid' | 'list') => set({ viewMode }),

            setItemPriceMode: (productId: string, mode: 'CON_FACTURA' | 'SIN_FACTURA') => {
                const deriveFixedPriceForMode = (item: CartItem, newMode: 'CON_FACTURA' | 'SIN_FACTURA') => {
                    if (item.quotationPriceConFactura === undefined && item.quotationPriceSinFactura === undefined) {
                        return item.fixedPrice;
                    }

                    const modePrice = newMode === 'CON_FACTURA'
                        ? item.quotationPriceConFactura ?? item.product.precioConFactura ?? item.product.precio
                        : item.quotationPriceSinFactura ?? item.product.precioSinFactura ?? item.product.precio;

                    return modePrice;
                };

                set((state: PosState) => ({
                    cart: state.cart.map((item: CartItem) =>
                        item.product.id === productId
                            ? { ...item, priceMode: mode, fixedPrice: deriveFixedPriceForMode(item, mode) }
                            : item
                    )
                }));
            },

            setAllItemsPriceMode: (mode: 'CON_FACTURA' | 'SIN_FACTURA') => {
                const deriveFixedPriceForMode = (item: CartItem, newMode: 'CON_FACTURA' | 'SIN_FACTURA') => {
                    if (item.quotationPriceConFactura === undefined && item.quotationPriceSinFactura === undefined) {
                        return item.fixedPrice;
                    }

                    return newMode === 'CON_FACTURA'
                        ? item.quotationPriceConFactura ?? item.product.precioConFactura ?? item.product.precio
                        : item.quotationPriceSinFactura ?? item.product.precioSinFactura ?? item.product.precio;
                };

                set((state: PosState) => ({
                    cart: state.cart.map((item: CartItem) => ({
                        ...item,
                        priceMode: mode,
                        fixedPrice: deriveFixedPriceForMode(item, mode),
                    })),
                    invoiceMode: mode
                }));
            },

            setOperationDate: (operationDate: string | null) => set({ operationDate }),

            clearCart: () => set({
                cart: [],
                client: null,
                pendingQuotationId: null,
                paymentMethod: 'EFECTIVO',
                invoiceMode: 'CON_FACTURA',
                searchTerm: '',
                selectedCategory: 'Todos',
            }),

            suspendSale: () => {
                const { cart, client, getTotals, suspendedSales } = get();
                if (cart.length === 0) return;

                const newSuspended: SuspendedSale = {
                    id: Math.random().toString(36).substr(2, 9),
                    cart: [...cart],
                    client,
                    date: new Date(),
                    total: getTotals().total
                };

                set({
                    suspendedSales: [newSuspended, ...suspendedSales],
                    cart: [],
                    client: null
                });
            },

            resumeSale: (id: string) => {
                const { suspendedSales } = get();
                const sale = suspendedSales.find(s => s.id === id);
                if (!sale) return;

                set({
                    cart: sale.cart,
                    client: sale.client,
                    suspendedSales: suspendedSales.filter(s => s.id !== id)
                });
            },

            deleteSuspendedSale: (id: string) => {
                set((state) => ({
                    suspendedSales: state.suspendedSales.filter(s => s.id !== id)
                }));
            },

            processSale: async (userId: string, userEmail: string, userName: string, branchId: string, adminInfo?: { uid: string, email: string }, amountReceived?: number, splitPayment?: { cash: number; qr: number }, installments?: number, adelanto?: number, adelantoMethod?: 'EFECTIVO' | 'QR') => {
                const { cart, client, paymentMethod, getTotals } = get();
                const totals = getTotals();
                const { operationDate } = get();

                const change = (paymentMethod === 'EFECTIVO' && amountReceived && amountReceived > totals.total) 
                    ? amountReceived - totals.total 
                    : (paymentMethod === 'MIXTO' && splitPayment && splitPayment.cash > 0)
                        ? 0 // No change in split payments (exact amounts)
                        : 0;

                const __todayStr = localDateStr();
                const saleData: Omit<Sale, 'id'> = {
                    cliente: client || { razonSocial: 'Sin Nombre', tipo: 'PARTICULAR', isActive: true },
                    items: SalesLogic.mapCartToSaleItems(cart),
                    total: totals.total,
                    fecha: operationDate && operationDate !== __todayStr ? midday(operationDate) : new Date(),
                    usuarioId: userId,
                    usuarioEmail: userEmail,
                    usuarioNombre: userName,
                    metodoPago: paymentMethod,
                    subtotal: totals.subtotal,
                    tax: totals.tax,
                    itemCount: totals.itemCount,
                    status: 'COMPLETED',
                    amountReceived: amountReceived,
                    change: change,
                    branchId: branchId,
                    // Split Payment fields
                    ...(paymentMethod === 'MIXTO' && splitPayment ? { splitCash: splitPayment.cash, splitQR: splitPayment.qr } : {}),
                    // Installment fields
                    ...(paymentMethod === 'CUOTAS' && installments ? { installments, installmentAmount: Number(((totals.total - (adelanto || 0)) / Math.max(1, installments)).toFixed(2)), adelanto: adelanto || 0 } : {}),
                };

                try {
                    // SaleService valida sesión OPEN internamente vía JournalService.resolveAccountId
                    const saleDateObj = saleData.fecha instanceof Date ? saleData.fecha : new Date(saleData.fecha);

                    let cashMovementPayload = undefined;
                    let splitCashMovements: { cash: Omit<CashMovement, 'id'>; qr: Omit<CashMovement, 'id'> } | undefined = undefined;

                    const isRetroactive = !!operationDate && operationDate !== __todayStr;

                    if (!isRetroactive) {
                        if (paymentMethod === 'MIXTO' && splitPayment) {
                            splitCashMovements = {
                                cash: {
                                    shiftId: '',
                                    type: 'INGRESO' as const,
                                    amount: splitPayment.cash,
                                    reason: `Venta POS (Efectivo - Pago Mixto)`,
                                    date: saleDateObj,
                                    userId: userId,
                                    paymentMethod: 'EFECTIVO'
                                },
                                qr: {
                                    shiftId: '',
                                    type: 'INGRESO' as const,
                                    amount: splitPayment.qr,
                                    reason: `Venta POS (QR - Pago Mixto)`,
                                    date: saleDateObj,
                                    userId: userId,
                                    paymentMethod: 'QR'
                                }
                            };
                        } else if (paymentMethod === 'CUOTAS' && adelanto && adelanto > 0) {
                            cashMovementPayload = {
                                shiftId: '',
                                type: 'INGRESO' as const,
                                amount: adelanto,
                                reason: `Adelanto Venta a Cuotas (${adelantoMethod || 'EFECTIVO'})`,
                                date: saleDateObj,
                                userId: userId,
                                paymentMethod: (adelantoMethod || 'EFECTIVO') as 'EFECTIVO' | 'QR'
                            };
                        } else if (paymentMethod !== 'CUOTAS') {
                            cashMovementPayload = {
                                shiftId: '',
                                type: 'INGRESO' as const,
                                amount: totals.total,
                                reason: 'Venta POS',
                                date: saleDateObj,
                                userId: userId,
                                paymentMethod: paymentMethod as 'EFECTIVO' | 'QR'
                            };
                        }
                    }

                    const id = await SaleService.createSale(saleData, branchId, adminInfo, cashMovementPayload, splitCashMovements, installments);

                    // Si la venta provino de una cotización, marcarla como CONVERTED
                    const { pendingQuotationId } = get();
                    if (pendingQuotationId) {
                        try {
                            await QuotationService.updateQuotationStatus(
                                pendingQuotationId,
                                'CONVERTED',
                                `Convertida a Venta #${id.slice(-6).toUpperCase()}`,
                                adminInfo ? { uid: adminInfo.uid, email: adminInfo.email } : undefined
                            );
                        } catch (qError) {
                            console.error('No se pudo actualizar estado de cotización:', qError);
                        }
                    }

                    set({ lastSale: { ...saleData, id } });
                    get().clearCart();
                    return true;
                } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Error desconocido al procesar la venta.');
                    return false;
                }
            },

            createQuotation: async (userId: string, userEmail: string, userName: string, branchId: string, notes?: string, adminInfo?: { uid: string, email: string }, validityDays: number = 1) => {
                const { cart, client, getTotals, operationDate } = get();
                const totals = getTotals();

                // Prepare Quotation Data
                const __todayStrQ = localDateStr();
                const __quotFecha = operationDate && operationDate !== __todayStrQ ? midday(operationDate) : new Date();
                const quotationData = {
                    cliente: client || { razonSocial: 'Sin Nombre', tipo: 'PARTICULAR' as const, isActive: true },
                    items: SalesLogic.mapCartToSaleItems(cart),
                    total: totals.total,
                    subtotal: totals.subtotal,
                    fecha: __quotFecha,
                    validUntil: new Date(__quotFecha.getTime() + validityDays * 24 * 60 * 60 * 1000),
                    status: 'PENDING' as const,
                    usuarioId: userId,
                    usuarioEmail: userEmail,
                    usuarioNombre: userName,
                    notes: notes || '',
                    isTaxed: get().invoiceMode === 'CON_FACTURA', // Save the preference
                    branchId: branchId // Ensure it is explicitly assigned
                };

                try {
                    // Dynamically import to avoid circular dependency issues if any, though standard import is better. 
                    // validUntil and others are handled by mapped types if needed, but QuotationService expects specific types.
                    // Using the service directly.
                    const { QuotationService } = await import('@/services/QuotationService');
                    const id = await QuotationService.createQuotation(quotationData as Omit<Quotation, 'id'>, branchId, adminInfo);

                    get().clearCart();
                    return { success: true, id, data: { ...quotationData, id } };
                } catch (error) {
                    return { success: false };
                }
            },

            loadFromQuotation: (items: (QuotationItem & { product: Product })[], client: Client | null, isTaxed: boolean, quotationId?: string) => {
                const priceMode = isTaxed ? 'CON_FACTURA' : 'SIN_FACTURA';
                set({
                    cart: items.map(item => ({
                        product: item.product,
                        quantity: item.quantity,
                        priceMode: priceMode as 'CON_FACTURA' | 'SIN_FACTURA',
                        fixedPrice: item.unitPrice,
                        quotationPriceConFactura: item.priceConFactura,
                        quotationPriceSinFactura: item.priceSinFactura,
                    })),
                    client,
                    invoiceMode: priceMode as 'CON_FACTURA' | 'SIN_FACTURA',
                    pendingQuotationId: quotationId ?? null,
                });
            },

            applyDiscount: (productId: string, type: 'PERCENTAGE' | 'FIXED_PRICE', value: number, userId: string, userEmail: string) => {
                set((state: PosState) => ({
                    cart: state.cart.map((item: CartItem) => {
                        if (item.product.id !== productId) return item;
                        // Use PricingLogic with fixedPrice stripped to get the real base price
                        const basePrice = PricingLogic.calculateItemUnitPrice({ ...item, fixedPrice: undefined });
                        const finalPrice = type === 'PERCENTAGE'
                            ? Number((basePrice * (1 - value / 100)).toFixed(2))
                            : value;
                        return {
                            ...item,
                            fixedPrice: finalPrice,
                            discount: {
                                type,
                                value,
                                originalPrice: basePrice,
                                appliedBy: userId,
                                appliedByEmail: userEmail,
                                appliedAt: new Date().toISOString(),
                            },
                        };
                    }),
                }));
            },

            removeDiscount: (productId: string) => {
                set((state: PosState) => ({
                    cart: state.cart.map((item: CartItem) => {
                        if (item.product.id !== productId) return item;
                        const { discount: _d, fixedPrice: _fp, ...rest } = item;
                        return rest as CartItem;
                    }),
                }));
            },

            setPendingDiscount: (productId: string, pending: { approvalId: string; type: 'PERCENTAGE' | 'FIXED_PRICE'; value: number }) => {
                set((state: PosState) => ({
                    cart: state.cart.map((item: CartItem) =>
                        item.product.id === productId
                            ? { ...item, pendingDiscount: { ...pending, requestedAt: new Date().toISOString() } }
                            : item
                    ),
                }));
            },

            clearPendingDiscount: (productId: string) => {
                set((state: PosState) => ({
                    cart: state.cart.map((item: CartItem) => {
                        if (item.product.id !== productId) return item;
                        const { pendingDiscount: _p, ...rest } = item;
                        return rest as CartItem;
                    }),
                }));
            },


        }),
        {
            name: 'pos-storage',
            storage: typeof window !== 'undefined' ? createJSONStorage(() => sessionStorage) : undefined,
            partialize: (state) => ({
                cart: state.cart,
                client: state.client,
                suspendedSales: state.suspendedSales,
                invoiceMode: state.invoiceMode,
                viewMode: state.viewMode,
                operationDate: state.operationDate
            }), // Only persist these fields
        }
    ));
