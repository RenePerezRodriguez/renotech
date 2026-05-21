import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, orderBy, Timestamp, serverTimestamp, runTransaction, doc, getDoc, limit } from 'firebase/firestore';
import { Sale, InventoryMovement, SaleItem, CashMovement, Installment } from '@/types';
import { logAdminAction } from '@/lib/audit';
import { JournalService } from './JournalService';
import { throwStandardError } from '@/utils/errorCodes';

const COLLECTION_NAME = 'ventas';

export const SaleService = {
    // Create Sale Header + Sub-collection Items
    createSale: async (
        sale: Omit<Sale, 'id'>, 
        branchId: string, 
        adminInfo?: { uid: string, email: string }, 
        cashMovement?: Omit<CashMovement, 'id'>,
        splitCashMovements?: { cash: Omit<CashMovement, 'id'>; qr: Omit<CashMovement, 'id'> },
        installments?: number
    ) => {
        try {
            if (!sale.items) throwStandardError('SYS_TRANSACTION_FAILED', 'No hay ítems en la venta');

            // Pre-generate ID
            const newSaleRef = doc(collection(db, COLLECTION_NAME));

            // Pre-resolver cuentas de tesorería (fuera de la tx). EFECTIVO requiere sesión OPEN.
            const cashierId = sale.usuarioId || adminInfo?.uid;
            type Resolved = { accountId: string; sessionId: string | null };
            let resolvedCash: Resolved | null = null;       // EFECTIVO/CUOTAS adelanto
            let resolvedDigital: Resolved | null = null;    // QR
            let resolvedSingle: Resolved | null = null;     // EFECTIVO simple, QR simple, TRANSFERENCIA
            if (sale.metodoPago === 'MIXTO' && splitCashMovements) {
                resolvedCash = await JournalService.resolveAccountId({ branchId, paymentMethod: 'EFECTIVO', cashierId });
                resolvedDigital = await JournalService.resolveAccountId({ branchId, paymentMethod: 'QR' });
            } else if (sale.metodoPago === 'EFECTIVO' && cashMovement) {
                resolvedSingle = await JournalService.resolveAccountId({ branchId, paymentMethod: 'EFECTIVO', cashierId });
            } else if (sale.metodoPago === 'QR' && cashMovement) {
                resolvedSingle = await JournalService.resolveAccountId({ branchId, paymentMethod: 'QR' });
            } else if (sale.metodoPago === 'CUOTAS' && cashMovement && (sale.adelanto || 0) > 0) {
                const adelantoMethod = (cashMovement.paymentMethod || 'EFECTIVO') as 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
                resolvedCash = await JournalService.resolveAccountId({
                    branchId,
                    paymentMethod: adelantoMethod,
                    cashierId: adelantoMethod === 'EFECTIVO' ? cashierId : undefined,
                });
            }
            
            await runTransaction(db, async (transaction) => {
                // ============================================================
                // PHASE 1: ALL READS (Firestore requires reads before writes)
                // ============================================================
                const itemsList = sale.items!;

                // 1a. Read all product documents
                const productRefs = itemsList.map(item => doc(db, 'productos', item.productId));
                const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

                // 1b. Pre-read client document if CREDITO or CUOTAS payment
                let clientSnap: import('firebase/firestore').DocumentSnapshot | null = null;
                let clientRef: import('firebase/firestore').DocumentReference | null = null;
                if ((sale.metodoPago === 'CREDITO' || sale.metodoPago === 'CUOTAS') && sale.cliente.id) {
                    clientRef = doc(db, 'clientes', sale.cliente.id);
                    clientSnap = await transaction.get(clientRef);
                }

                // 1c. Pre-read master catalog documents for CRM reminders
                const masterCatalogDocs: Map<string, import('firebase/firestore').DocumentSnapshot> = new Map();
                if (sale.cliente.id) {
                    const masterIds = new Set<string>();
                    for (const pSnap of productDocs) {
                        const pData = pSnap.data();
                        if (pData?.masterId) masterIds.add(pData.masterId);
                    }
                    for (const masterId of masterIds) {
                        const masterRef = doc(db, 'catalogo_maestro', masterId);
                        const masterSnap = await transaction.get(masterRef);
                        masterCatalogDocs.set(masterId, masterSnap);
                    }
                }

                // 1d. Pre-read KIT component docs deterministically and transactionally
                const kitComponentCache: Map<string, { ref: import('firebase/firestore').DocumentReference; data: import('firebase/firestore').DocumentData; }> = new Map();
                const kitCompRefsToFetch: { cacheKey: string; ref: import('firebase/firestore').DocumentReference }[] = [];

                for (let i = 0; i < productDocs.length; i++) {
                    const productData = productDocs[i].data();
                    if (productData?.type === 'KIT' && productData.kitItems && Array.isArray(productData.kitItems)) {
                        for (const kitItem of productData.kitItems) {
                            const cacheKey = `${kitItem.masterId}_${branchId}`;
                            // Evitar duplicados si varios kits usan el mismo componente
                            if (!kitComponentCache.has(cacheKey) && !kitCompRefsToFetch.some(x => x.cacheKey === cacheKey)) {
                                const compRef = doc(db, 'productos', `${branchId}_${kitItem.masterId}`);
                                kitCompRefsToFetch.push({ cacheKey, ref: compRef });
                            }
                        }
                    }
                }

                if (kitCompRefsToFetch.length > 0) {
                    const compDocs = await Promise.all(kitCompRefsToFetch.map(x => transaction.get(x.ref)));
                    for (let i = 0; i < compDocs.length; i++) {
                        const snap = compDocs[i];
                        const key = kitCompRefsToFetch[i].cacheKey;
                        if (snap.exists()) {
                            kitComponentCache.set(key, { ref: snap.ref, data: snap.data()! });
                        }
                    }
                }

                // 1e. Read Treasury accounts (must be done in PHASE 1 reads)
                const accCash = resolvedCash ? await JournalService.txReadAccount(transaction, resolvedCash.accountId) : null;
                const accDigital = resolvedDigital ? await JournalService.txReadAccount(transaction, resolvedDigital.accountId) : null;
                const accSingle = resolvedSingle ? await JournalService.txReadAccount(transaction, resolvedSingle.accountId) : null;
                // Re-validar dentro de la TX que la sesión EFECTIVO sigue OPEN (anti-race vs cierre forzado)
                if (resolvedCash?.sessionId) await JournalService.txEnsureSessionOpen(transaction, resolvedCash.sessionId);
                if (resolvedSingle?.sessionId) await JournalService.txEnsureSessionOpen(transaction, resolvedSingle.sessionId);

                // ============================================================
                // PHASE 2: VALIDATION (read-only, no writes)
                // ============================================================

                // 2a. Validate product existence, stock and branch access
                for (let i = 0; i < productDocs.length; i++) {
                    const docSnap = productDocs[i];
                    const item = itemsList[i];
                    if (!docSnap.exists()) throwStandardError('INV_PRODUCT_NOT_FOUND', item.productName);

                    const productData = docSnap.data();
                    if (!productData) throwStandardError('INV_PRODUCT_NOT_FOUND', item.productName);
                    
                    if (productData.branchId && productData.branchId !== branchId) {
                        throwStandardError('AUTH_BRANCH_ACCESS', item.productName);
                    }

                    const currentStock = productData.stock || 0;
                    if (currentStock < item.quantity) {
                        throwStandardError('INV_INSUFFICIENT_STOCK', item.productName);
                    }

                    // KIT component validation (using cached data)
                    if (productData.type === 'KIT' && productData.kitItems && Array.isArray(productData.kitItems)) {
                        for (const kitItem of productData.kitItems) {
                            const cacheKey = `${kitItem.masterId}_${branchId}`;
                            const compQtyNeeded = kitItem.qty * item.quantity;
                            const cached = kitComponentCache.get(cacheKey);

                            if (!cached) {
                                throwStandardError('INV_PRODUCT_NOT_FOUND', `Componente de kit (Master ID: ${kitItem.masterId})`);
                            }
                            if ((cached!.data.stock || 0) < compQtyNeeded) {
                                throwStandardError('INV_INSUFFICIENT_STOCK', `Componente "${cached!.data.nombre || kitItem.masterId}" para el Kit ${item.productName}`);
                            }
                        }
                    }
                }

                // 2b. Recalculate Totals (Zero-Trust)
                let serverCalculatedSubtotal = 0;
                productDocs.forEach((docSnap, index) => {
                    const item = itemsList[index];
                    const productData = docSnap.data();
                    
                    const strictQuantity = Number(item.quantity);
                    const incomingPrice = Number(item.unitPrice);
                    const livePrecioSinFactura = Number(productData?.precioSinFactura ?? productData?.precioVenta ?? 0);
                    const livePrecioConFactura = Number(productData?.precioConFactura ?? productData?.precioVenta ?? 0);

                    // Price Protection
                    if (incomingPrice < livePrecioSinFactura && incomingPrice < livePrecioConFactura && !adminInfo) {
                        throwStandardError('AUTH_ROLE_INSUFFICIENT', `Precio debajo del mínimo para ${item.productName}`);
                    }

                    const expectedSubtotal = Number((strictQuantity * incomingPrice).toFixed(2));
                    serverCalculatedSubtotal += expectedSubtotal;
                });

                const expectedTotal = Number((serverCalculatedSubtotal + Number(sale.tax || 0)).toFixed(2));
                if (Number(sale.total) !== expectedTotal) {
                    throwStandardError('POS_TOTAL_MISMATCH');
                }

                // 2c. Validate credit limit if CREDITO or CUOTAS
                // Línea de crédito siempre habilitada por defecto. Si el cliente tiene un creditLimit > 0
                // configurado, se respeta como tope. Si es 0 o no está configurado, se permite sin tope.
                if ((sale.metodoPago === 'CREDITO' || sale.metodoPago === 'CUOTAS') && clientSnap?.exists()) {
                    const clientData = clientSnap.data()!;
                    const currentDebt = clientData.saldoDeudor || 0;
                    const creditLimit = clientData.lineaDeCredito || 0;

                    if (creditLimit > 0 && currentDebt + expectedTotal > creditLimit) {
                        throwStandardError('POS_CREDIT_NOT_ALLOWED', `Límite: ${creditLimit}, Deuda Actual: ${currentDebt}`);
                    }
                }

                // ============================================================
                // PHASE 3: ALL WRITES (after all reads are done)
                // ============================================================

                // 3a. Update Stock and Log Movements (With Kit Expansion)
                const saleDate = sale.fecha instanceof Date 
                    ? Timestamp.fromDate(sale.fecha) 
                    : (sale.fecha || serverTimestamp());

                for (let index = 0; index < productDocs.length; index++) {
                    const docSnap = productDocs[index];
                    const item = itemsList[index];
                    const productData = docSnap.data()!;
                    const currentStock = productData.stock || 0;
                    const newStock = currentStock - item.quantity;

                    // Update Main Product Stock
                    transaction.update(productRefs[index], {
                        stock: newStock,
                        lastSaleAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });

                    // AUDIT ALERT: STOCK_LOW
                    if (newStock <= (productData.minStock || 0)) {
                        const alertRef = doc(collection(db, 'alertas_auditoria'));
                        transaction.set(alertRef, {
                            type: 'INVENTORY_THRESHOLD',
                            severity: newStock <= 0 ? 'HIGH' : 'MEDIUM',
                            branchId,
                            userId: sale.usuarioId,
                            message: `ALERTA DE REABASTECIMIENTO: "${productData.nombre || item.productName}" alcanzó stock crítico (${newStock}).`,
                            metadata: { productId: docSnap.id, stock: newStock, minStock: productData.minStock },
                            isRead: false,
                            createdAt: serverTimestamp()
                        });
                    }

                    // Log Main Product Movement
                    const movRef = doc(collection(db, 'movimientos'));
                    transaction.set(movRef, {
                        productId: docSnap.id,
                        masterId: productData.masterId,
                        branchId: branchId,
                        type: 'SALIDA',
                        quantity: item.quantity,
                        currentStock: newStock,
                        previousStock: currentStock,
                        reason: `Venta #${newSaleRef.id.slice(-6).toUpperCase()} — ${sale.cliente?.razonSocial || 'Cliente Casual'}${productData.type === 'KIT' ? ' (KIT)' : ''}`,
                        referenceId: newSaleRef.id,
                        date: saleDate,
                        userId: sale.usuarioId,
                        userName: sale.usuarioNombre || sale.usuarioEmail || 'SISTEMA',
                        createdAt: serverTimestamp()
                    } as InventoryMovement);

                    // KIT EXPANSION: Discount components using cached data
                    if (productData.type === 'KIT' && productData.kitItems && Array.isArray(productData.kitItems)) {
                        for (const kitItem of productData.kitItems) {
                            const cacheKey = `${kitItem.masterId}_${branchId}`;
                            const cached = kitComponentCache.get(cacheKey);
                            if (cached) {
                                const componentQty = kitItem.qty * item.quantity;
                                const compCurrentStock = cached.data.stock || 0;
                                const compNewStock = compCurrentStock - componentQty;

                                transaction.update(cached.ref, {
                                    stock: compNewStock,
                                    updatedAt: serverTimestamp()
                                });

                                const compMovRef = doc(collection(db, 'movimientos'));
                                transaction.set(compMovRef, {
                                    productId: cached.ref.id,
                                    masterId: kitItem.masterId,
                                    branchId: branchId,
                                    type: 'SALIDA',
                                    quantity: componentQty,
                                    currentStock: compNewStock,
                                    previousStock: compCurrentStock,
                                    reason: `Descuento por Kit: ${productData.nombre} (Venta #${newSaleRef.id.slice(-6).toUpperCase()} — ${sale.cliente?.razonSocial || 'Cliente Casual'})`,
                                    referenceId: newSaleRef.id,
                                    date: saleDate,
                                    userId: sale.usuarioId,
                                    userName: sale.usuarioNombre || sale.usuarioEmail || 'SISTEMA',
                                    createdAt: serverTimestamp()
                                } as InventoryMovement);
                            }
                        }
                    }
                }

                // 3b. Create Sale Header
                const sanitizedHeader: Record<string, unknown> = {
                    branchId,
                    cliente: sale.cliente,
                    fecha: sale.fecha instanceof Date ? Timestamp.fromDate(sale.fecha) : sale.fecha,
                    createdAt: serverTimestamp(),
                    status: 'COMPLETED',
                    usuarioId: sale.usuarioId,
                    usuarioEmail: sale.usuarioEmail || '',
                    usuarioNombre: sale.usuarioNombre || '',
                    metodoPago: sale.metodoPago,
                    subtotal: Number(sale.subtotal),
                    tax: Number(sale.tax || 0),
                    total: Number(sale.total),
                    itemCount: Number(sale.itemCount),
                    amountReceived: sale.amountReceived ? Number(sale.amountReceived) : null,
                    change: sale.change ? Number(sale.change) : null
                };
                // Append split payment data
                if (sale.metodoPago === 'MIXTO' && sale.splitCash != null && sale.splitQR != null) {
                    sanitizedHeader.splitCash = Number(sale.splitCash);
                    sanitizedHeader.splitQR = Number(sale.splitQR);
                }
                // Append installment data
                if (sale.metodoPago === 'CUOTAS' && sale.installments) {
                    sanitizedHeader.installments = Number(sale.installments);
                    sanitizedHeader.installmentAmount = Number(sale.installmentAmount || 0);
                    sanitizedHeader.adelanto = Number(sale.adelanto || 0);
                }
                transaction.set(newSaleRef, sanitizedHeader);

                // 3c. Create Items in Sub-collection (Industrial Margin Preservation)
                itemsList.forEach((item, index) => {
                    const itemRef = doc(collection(db, `${COLLECTION_NAME}/${newSaleRef.id}/items`));
                    const pData = productDocs[index].data();
                    transaction.set(itemRef, { 
                        ...item, 
                        costAtSale: Number(pData?.costo || 0), // FIFO Traceability
                        isVoided: false 
                    });
                });

                // 3d. Cash Movement or Credit Account
                if (sale.metodoPago === 'MIXTO' && splitCashMovements && resolvedCash && resolvedDigital && accCash && accDigital) {
                    JournalService.txWriteEntry(transaction, accCash, {
                        accountId: resolvedCash.accountId,
                        amount: Number(sale.splitCash || splitCashMovements.cash.amount || 0),
                        paymentMethod: 'EFECTIVO',
                        category: 'VENTA',
                        description: `Venta #${newSaleRef.id.slice(-6).toUpperCase()} (parte EFECTIVO)`,
                        referenceType: 'SALE',
                        referenceId: newSaleRef.id,
                        sessionId: resolvedCash.sessionId,
                        branchId,
                        userId: sale.usuarioId || adminInfo?.uid || 'system',
                        userName: sale.usuarioNombre || sale.usuarioEmail || '',
                    });
                    JournalService.txWriteEntry(transaction, accDigital, {
                        accountId: resolvedDigital.accountId,
                        amount: Number(sale.splitQR || splitCashMovements.qr.amount || 0),
                        paymentMethod: 'QR',
                        category: 'VENTA',
                        description: `Venta #${newSaleRef.id.slice(-6).toUpperCase()} (parte QR)`,
                        referenceType: 'SALE',
                        referenceId: newSaleRef.id,
                        sessionId: resolvedDigital.sessionId,
                        branchId,
                        userId: sale.usuarioId || adminInfo?.uid || 'system',
                        userName: sale.usuarioNombre || sale.usuarioEmail || '',
                    });
                } else if (sale.metodoPago === 'CUOTAS' && clientRef && clientSnap?.exists()) {
                    // Installment plan: create N entries in cuentas_corrientes
                    const clientData = clientSnap.data()!;
                    const currentDebt = clientData.saldoDeudor || 0;
                    const numInstallments = Math.max(1, installments || sale.installments || 1);
                    const adelantoAmt = sale.adelanto || 0;
                    const creditAmount = expectedTotal - adelantoAmt; // Only the remaining is financed
                    if (creditAmount <= 0) {
                        throwStandardError('POS_CREDIT_NOT_ALLOWED', 'El adelanto no puede ser mayor o igual al total. Usa otro método de pago.');
                    }
                    if (numInstallments < 1) {
                        throwStandardError('POS_CREDIT_NOT_ALLOWED', 'El número de cuotas debe ser al menos 1');
                    }
                    const installmentAmt = Number((creditAmount / numInstallments).toFixed(2));

                    // Denormalized fields for display without joins
                    const clientName = sale.cliente?.razonSocial || 'Sin nombre';
                    const productsSummary = (sale.items || [])
                        .slice(0, 3)
                        .map(i => `${i.productName} x${i.quantity}`)
                        .join(', ') + ((sale.items?.length || 0) > 3 ? ` (+${(sale.items?.length || 0) - 3} más)` : '');

                    // Client debt increases only by the financed amount (total - adelanto)
                    transaction.update(clientRef, {
                        saldoDeudor: currentDebt + creditAmount,
                        lastCreditSaleAt: serverTimestamp()
                    });

                    // Cash movement for adelanto (if any)
                    if (cashMovement && adelantoAmt > 0 && resolvedCash && accCash) {
                        const adMethod = (cashMovement.paymentMethod || 'EFECTIVO') as 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
                        JournalService.txWriteEntry(transaction, accCash, {
                            accountId: resolvedCash.accountId,
                            amount: adelantoAmt,
                            paymentMethod: adMethod,
                            category: 'VENTA',
                            description: `Adelanto Venta #${newSaleRef.id.slice(-6).toUpperCase()}`,
                            referenceType: 'SALE',
                            referenceId: newSaleRef.id,
                            sessionId: resolvedCash.sessionId,
                            branchId,
                            userId: sale.usuarioId || adminInfo?.uid || 'system',
                            userName: sale.usuarioNombre || sale.usuarioEmail || '',
                        });
                    }

                    for (let cuota = 1; cuota <= numInstallments; cuota++) {
                        const dueDate = new Date(sale.fecha instanceof Date ? sale.fecha : new Date());
                        dueDate.setMonth(dueDate.getMonth() + cuota);

                        const arRef = doc(collection(db, 'cuentas_corrientes'));
                        transaction.set(arRef, {
                            clientId: sale.cliente.id,
                            clientName,
                            saleId: newSaleRef.id,
                            totalAmount: creditAmount, // Financed amount (without adelanto)
                            saleTotal: expectedTotal,  // Full sale total for reference
                            adelanto: adelantoAmt,
                            productsSummary,
                            installmentNumber: cuota,
                            installmentsTotal: numInstallments,
                            amount: cuota === numInstallments 
                                ? Number((creditAmount - installmentAmt * (numInstallments - 1)).toFixed(2))
                                : installmentAmt,
                            remainingBalance: cuota === numInstallments 
                                ? Number((creditAmount - installmentAmt * (numInstallments - 1)).toFixed(2))
                                : installmentAmt,
                            dueDate: Timestamp.fromDate(dueDate),
                            status: 'PENDING',
                            branchId,
                            createdAt: serverTimestamp()
                        });
                    }
                } else if ((sale.metodoPago === 'EFECTIVO' || sale.metodoPago === 'QR') && cashMovement && resolvedSingle && accSingle) {
                    const clientLabel = sale.cliente?.razonSocial || 'Cliente Casual';
                    const itemsCount = (sale.items?.length || 0);
                    JournalService.txWriteEntry(transaction, accSingle, {
                        accountId: resolvedSingle.accountId,
                        amount: Number(cashMovement.amount || sale.total),
                        paymentMethod: sale.metodoPago as 'EFECTIVO' | 'QR',
                        category: 'VENTA',
                        description: `Venta ${sale.metodoPago} a ${clientLabel} · ${itemsCount} ${itemsCount === 1 ? 'producto' : 'productos'} (Venta #${newSaleRef.id.slice(-6).toUpperCase()})`,
                        referenceType: 'SALE',
                        referenceId: newSaleRef.id,
                        sessionId: resolvedSingle.sessionId,
                        branchId,
                        userId: sale.usuarioId || adminInfo?.uid || 'system',
                        userName: sale.usuarioNombre || sale.usuarioEmail || '',
                    });
                } else if (sale.metodoPago === 'CREDITO' && clientRef && clientSnap?.exists()) {
                    const clientData = clientSnap.data()!;
                    const currentDebt = clientData.saldoDeudor || 0;

                    transaction.update(clientRef, {
                        saldoDeudor: currentDebt + expectedTotal,
                        lastCreditSaleAt: serverTimestamp()
                    });
                    
                    const arRef = doc(collection(db, 'cuentas_corrientes'));
                    transaction.set(arRef, {
                        clientId: sale.cliente.id,
                        saleId: newSaleRef.id,
                        totalAmount: expectedTotal,
                        remainingBalance: expectedTotal,
                        status: 'PENDING',
                        branchId,
                        createdAt: serverTimestamp()
                    });
                }

                // 3e. AUTOMATED CRM REMINDERS (using pre-fetched master catalog)
                if (sale.cliente.id) {
                    for (let i = 0; i < productDocs.length; i++) {
                        const pSnap = productDocs[i];
                        const pData = pSnap.data();
                        if (pData?.masterId) {
                            const masterSnap = masterCatalogDocs.get(pData.masterId);
                            const mData = masterSnap?.data();

                            if (mData?.maintenanceMonths && mData.maintenanceMonths > 0) {
                                const scheduledDate = new Date();
                                scheduledDate.setMonth(scheduledDate.getMonth() + mData.maintenanceMonths);
                                
                                const reminderRef = doc(collection(db, 'recordatorios_cliente'));
                                transaction.set(reminderRef, {
                                    clientId: sale.cliente.id,
                                    clientName: sale.cliente.razonSocial,
                                    clientPhone: sale.cliente.telefono || '',
                                    productId: pSnap.id,
                                    productName: pData.nombre || mData.nombre,
                                    scheduledDate: Timestamp.fromDate(scheduledDate),
                                    type: 'MAINTENANCE',
                                    status: 'PENDING',
                                    branchId: branchId,
                                    createdAt: serverTimestamp()
                                });
                            }
                        }
                    }
                }
            });

            if (adminInfo) {
                await logAdminAction(adminInfo.uid, adminInfo.email, 'CREATE_SALE', newSaleRef.id, branchId, `Venta generada (Total: Bs. ${sale.total.toFixed(2)})`);
            }

            return newSaleRef.id;

        } catch (e) {
            throw e;
        }
    },

    // Get Sale Items from Sub-collection
    getSaleItems: async (saleId: string): Promise<SaleItem[]> => {
        const q = query(collection(db, `${COLLECTION_NAME}/${saleId}/items`));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SaleItem));
    },

    // Void Sale (Refactored)
    voidSale: async (saleId: string, userId: string, reason: string, adminInfo?: { uid: string, email: string, branchId: string }) => {
        try {
            const saleRef = doc(db, COLLECTION_NAME, saleId);
            const saleSnap = await getDoc(saleRef);
            if (!saleSnap.exists()) throwStandardError('SALE_NOT_FOUND');
            const saleData = saleSnap.data() as Sale;

            if (saleData.status === 'VOIDED') throwStandardError('POS_VOID_ALREADY_PROCESSED');

            // Pre-resolver cuentas para reverso (segun metodo de pago original)
            type Resolved = { accountId: string; sessionId: string | null };
            let resolvedCash: Resolved | null = null;
            let resolvedDigital: Resolved | null = null;
            let resolvedSingle: Resolved | null = null;
            const userName = adminInfo?.email || saleData.usuarioNombre || 'SISTEMA';
            if (saleData.metodoPago === 'MIXTO') {
                resolvedCash = await JournalService.resolveAccountId({ branchId: saleData.branchId, paymentMethod: 'EFECTIVO', cashierId: userId });
                resolvedDigital = await JournalService.resolveAccountId({ branchId: saleData.branchId, paymentMethod: 'QR' });
            } else if (saleData.metodoPago === 'EFECTIVO') {
                resolvedSingle = await JournalService.resolveAccountId({ branchId: saleData.branchId, paymentMethod: 'EFECTIVO', cashierId: userId });
            } else if (saleData.metodoPago === 'QR') {
                resolvedSingle = await JournalService.resolveAccountId({ branchId: saleData.branchId, paymentMethod: 'QR' });
            } else if (saleData.metodoPago === 'CUOTAS' && Number(saleData.adelanto || 0) > 0) {
                resolvedSingle = await JournalService.resolveAccountId({ branchId: saleData.branchId, paymentMethod: 'EFECTIVO', cashierId: userId });
            }

            const saleItems = await SaleService.getSaleItems(saleId);
            // Pre-leer sub-colecciones FUERA de la TX (no son lecturas transaccionales pero deben ocurrir antes)
            const itemsSnap = await getDocs(collection(db, `${COLLECTION_NAME}/${saleId}/items`));
            const cuotasSnap = (saleData.metodoPago === 'CUOTAS')
                ? await getDocs(query(collection(db, 'cuentas_corrientes'), where('saleId', '==', saleId)))
                : null;

            await runTransaction(db, async (transaction) => {
                // ============= FASE 1: TODAS LAS LECTURAS =============
                // Cuentas
                const accCash = resolvedCash ? await JournalService.txReadAccount(transaction, resolvedCash.accountId) : null;
                const accDigital = resolvedDigital ? await JournalService.txReadAccount(transaction, resolvedDigital.accountId) : null;
                const accSingle = resolvedSingle ? await JournalService.txReadAccount(transaction, resolvedSingle.accountId) : null;
                if (resolvedCash?.sessionId) await JournalService.txEnsureSessionOpen(transaction, resolvedCash.sessionId);
                if (resolvedSingle?.sessionId) await JournalService.txEnsureSessionOpen(transaction, resolvedSingle.sessionId);

                // Pre-leer TODOS los productos antes de cualquier escritura
                type ProductRead = { item: typeof saleItems[number]; ref: ReturnType<typeof doc>; data: Record<string, unknown> | null };
                const productReads: ProductRead[] = [];
                for (const item of saleItems) {
                    if (item.isVoided) continue;
                    const productRef = doc(db, 'productos', item.productId);
                    const productSnap = await transaction.get(productRef);
                    productReads.push({ item, ref: productRef, data: productSnap.exists() ? productSnap.data() : null });
                }

                // Pre-leer cliente si aplica (para CUOTAS con deuda pendiente o CREDITO)
                let clientRef: ReturnType<typeof doc> | null = null;
                let clientCurrentDebt = 0;
                let clientExists = false;
                if (saleData.cliente?.id && (saleData.metodoPago === 'CUOTAS' || saleData.metodoPago === 'CREDITO')) {
                    clientRef = doc(db, 'clientes', saleData.cliente.id);
                    const clientSnap = await transaction.get(clientRef);
                    if (clientSnap.exists()) {
                        clientExists = true;
                        clientCurrentDebt = Number(clientSnap.data().saldoDeudor) || 0;
                    }
                }

                // Calcular pendingDebt de CUOTAS antes de escribir
                let pendingDebt = 0;
                if (cuotasSnap) {
                    cuotasSnap.forEach(cuotaDoc => {
                        const cData = cuotaDoc.data();
                        if (cData.status !== 'PAID') pendingDebt += cData.remainingBalance || 0;
                    });
                }

                // ============= FASE 2: TODAS LAS ESCRITURAS =============
                // 1. Restore Stock
                for (const pr of productReads) {
                    if (!pr.data) continue;
                    const pData = pr.data;
                    const currentStock = Number(pData.stock) || 0;
                    const newStock = currentStock + pr.item.quantity;

                    transaction.update(pr.ref, { stock: newStock, updatedAt: serverTimestamp() });

                    const movRef = doc(collection(db, 'movimientos'));
                    transaction.set(movRef, {
                        productId: pr.item.productId,
                        masterId: pData.masterId,
                        branchId: saleData.branchId,
                        type: 'ENTRADA',
                        quantity: pr.item.quantity,
                        currentStock: newStock,
                        previousStock: currentStock,
                        reason: `Anulación Venta #${saleId.slice(-6).toUpperCase()} — ${saleData.cliente?.razonSocial || 'Cliente Casual'}: ${reason}`,
                        referenceId: saleId,
                        date: serverTimestamp(),
                        userId: userId,
                        userName: adminInfo?.email || saleData.usuarioNombre || 'SISTEMA',
                        createdAt: serverTimestamp()
                    } as InventoryMovement);
                }

                // 2. Void Header
                transaction.update(saleRef, {
                    status: 'VOIDED',
                    voidedAt: serverTimestamp(),
                    voidedBy: userId,
                    voidReason: reason
                });

                // 3. Void All Items in Sub-collection
                itemsSnap.forEach(itemDoc => {
                    transaction.update(itemDoc.ref, { isVoided: true });
                });

                // 4. Cash Movement or Credit Reset
                if (saleData.metodoPago === 'CUOTAS' && saleData.cliente?.id) {
                    // Cancelar cuotas pendientes
                    if (cuotasSnap) {
                        cuotasSnap.forEach(cuotaDoc => {
                            const cData = cuotaDoc.data();
                            if (cData.status !== 'PAID') {
                                transaction.update(cuotaDoc.ref, { status: 'CANCELLED', remainingBalance: 0 });
                            }
                        });
                    }
                    // Reducir saldoDeudor del cliente
                    if (pendingDebt > 0 && clientRef && clientExists) {
                        transaction.update(clientRef, {
                            saldoDeudor: Math.max(0, clientCurrentDebt - pendingDebt)
                        });
                    }
                    // Reverse adelanto cash movement if there was one
                    const adelantoAmt = Number(saleData.adelanto || 0);
                    if (adelantoAmt > 0 && resolvedSingle && accSingle) {
                        JournalService.txWriteEntry(transaction, accSingle, {
                            accountId: resolvedSingle.accountId,
                            amount: adelantoAmt,
                            paymentMethod: 'EFECTIVO',
                            category: 'DEVOLUCION_VENTA',
                            description: `Anulación Adelanto Venta #${saleId.slice(-6)} (${reason})`,
                            referenceType: 'SALE',
                            referenceId: saleId,
                            sessionId: resolvedSingle.sessionId,
                            branchId: saleData.branchId,
                            userId,
                            userName,
                        });
                    }
                } else if (saleData.metodoPago === 'MIXTO' && resolvedCash && resolvedDigital && accCash && accDigital) {
                    JournalService.txWriteEntry(transaction, accCash, {
                        accountId: resolvedCash.accountId,
                        amount: Number(saleData.splitCash || 0),
                        paymentMethod: 'EFECTIVO',
                        category: 'DEVOLUCION_VENTA',
                        description: `Anulación Venta #${saleId.slice(-6)} parte EFECTIVO (${reason})`,
                        referenceType: 'SALE',
                        referenceId: saleId,
                        sessionId: resolvedCash.sessionId,
                        branchId: saleData.branchId,
                        userId,
                        userName,
                    });
                    JournalService.txWriteEntry(transaction, accDigital, {
                        accountId: resolvedDigital.accountId,
                        amount: Number(saleData.splitQR || 0),
                        paymentMethod: 'QR',
                        category: 'DEVOLUCION_VENTA',
                        description: `Anulación Venta #${saleId.slice(-6)} parte QR (${reason})`,
                        referenceType: 'SALE',
                        referenceId: saleId,
                        sessionId: resolvedDigital.sessionId,
                        branchId: saleData.branchId,
                        userId,
                        userName,
                    });
                } else if ((saleData.metodoPago === 'EFECTIVO' || saleData.metodoPago === 'QR') && resolvedSingle && accSingle) {
                    JournalService.txWriteEntry(transaction, accSingle, {
                        accountId: resolvedSingle.accountId,
                        amount: Number(saleData.total),
                        paymentMethod: saleData.metodoPago as 'EFECTIVO' | 'QR',
                        category: 'DEVOLUCION_VENTA',
                        description: `Anulación Venta #${saleId.slice(-6)} (${reason})`,
                        referenceType: 'SALE',
                        referenceId: saleId,
                        sessionId: resolvedSingle.sessionId,
                        branchId: saleData.branchId,
                        userId,
                        userName,
                    });
                } else if (saleData.metodoPago === 'CREDITO' && saleData.cliente?.id) {
                    // Si fue a crédito, no sale efectivo de la caja. Solo se perdona la deuda.
                    if (clientRef && clientExists) {
                        transaction.update(clientRef, {
                            saldoDeudor: Math.max(0, clientCurrentDebt - Number(saleData.total))
                        });
                    }
                }
            });

            if (adminInfo) {
                await logAdminAction(adminInfo.uid, adminInfo.email, 'VOID_SALE', saleId, adminInfo.branchId, `Venta anulada (Motivo: ${reason})`);
            }

            return true;
        } catch (e) {
            throw e;
        }
    },

    // Void Single Item (Refactored)
    voidSaleItem: async (saleId: string, itemId: string, userId: string, reason: string, adminInfo?: { uid: string, email: string, branchId: string }) => {
        try {
            const saleRef = doc(db, COLLECTION_NAME, saleId);
            const saleSnap = await getDoc(saleRef);
            if (!saleSnap.exists()) throwStandardError('SALE_NOT_FOUND');
            const saleData = saleSnap.data() as Sale;
            if (saleData.status === 'VOIDED') {
                throwStandardError('POS_VOID_ALREADY_PROCESSED', 'Venta ya anulada por completo');
            }

            // Pre-resolver cuenta para reverso parcial (segun metodo). MIXTO no soportado a nivel item.
            type Resolved = { accountId: string; sessionId: string | null };
            let resolvedSingle: Resolved | null = null;
            const userName = adminInfo?.email || saleData.usuarioNombre || 'SISTEMA';
            if (saleData.metodoPago === 'EFECTIVO') {
                resolvedSingle = await JournalService.resolveAccountId({ branchId: saleData.branchId, paymentMethod: 'EFECTIVO', cashierId: userId });
            } else if (saleData.metodoPago === 'QR') {
                resolvedSingle = await JournalService.resolveAccountId({ branchId: saleData.branchId, paymentMethod: 'QR' });
            }

            // Pre-leer item FUERA de TX para saber productId y poder pre-cargar getDocs de cuotas
            const itemRefPre = doc(db, `${COLLECTION_NAME}/${saleId}/items`, itemId);
            const itemSnapPre = await getDoc(itemRefPre);
            if (!itemSnapPre.exists()) throwStandardError('SYS_DOCUMENT_NOT_FOUND', "Ítem de venta");
            const itemPre = itemSnapPre.data() as SaleItem;
            if (itemPre.isVoided) throwStandardError('POS_VOID_ALREADY_PROCESSED');

            // Pre-cargar cuentas_corrientes para CREDITO
            const arSnapPre = (saleData.metodoPago === 'CREDITO' && saleData.cliente?.id)
                ? await getDocs(query(collection(db, 'cuentas_corrientes'), where('saleId', '==', saleId)))
                : null;

            await runTransaction(db, async (transaction) => {
                // ============= FASE 1: TODAS LAS LECTURAS =============
                const itemRef = doc(db, `${COLLECTION_NAME}/${saleId}/items`, itemId);
                const itemSnap = await transaction.get(itemRef);
                if (!itemSnap.exists()) throwStandardError('SYS_DOCUMENT_NOT_FOUND', "Ítem de venta");
                const item = itemSnap.data() as SaleItem;
                if (item.isVoided) throwStandardError('POS_VOID_ALREADY_PROCESSED');

                const productRef = doc(db, 'productos', item.productId);
                const productSnap = await transaction.get(productRef);

                let clientRef: ReturnType<typeof doc> | null = null;
                let clientCurrentDebt = 0;
                let clientExists = false;
                if (saleData.metodoPago === 'CREDITO' && saleData.cliente?.id) {
                    clientRef = doc(db, 'clientes', saleData.cliente.id);
                    const clientSnap = await transaction.get(clientRef);
                    if (clientSnap.exists()) {
                        clientExists = true;
                        clientCurrentDebt = Number(clientSnap.data().saldoDeudor) || 0;
                    }
                }

                const accSingle = resolvedSingle ? await JournalService.txReadAccount(transaction, resolvedSingle.accountId) : null;
                if (resolvedSingle?.sessionId) await JournalService.txEnsureSessionOpen(transaction, resolvedSingle.sessionId);

                // ============= FASE 2: TODAS LAS ESCRITURAS =============
                // 1. Mark item voided
                transaction.update(itemRef, { isVoided: true });

                // 2. Restore Stock
                if (productSnap.exists()) {
                    const pData = productSnap.data();
                    const currentStock = pData.stock || 0;
                    const newStock = currentStock + item.quantity;
                    transaction.update(productRef, { stock: newStock, updatedAt: serverTimestamp() });

                    const movRef = doc(collection(db, 'movimientos'));
                    transaction.set(movRef, {
                        productId: item.productId,
                        masterId: pData.masterId,
                        branchId: saleData.branchId,
                        type: 'ENTRADA',
                        quantity: item.quantity,
                        currentStock: newStock,
                        previousStock: currentStock,
                        reason: `Devolución Ítem Venta #${saleId.slice(-6).toUpperCase()} — ${saleData.cliente?.razonSocial || 'Cliente Casual'}`,
                        referenceId: saleId,
                        date: serverTimestamp(),
                        userId: userId,
                        userName: adminInfo?.email || saleData.usuarioNombre || 'SISTEMA',
                        createdAt: serverTimestamp()
                    } as InventoryMovement);
                }

                // 3. Update Header Totals (recalcular tax proporcional)
                const prevSubtotal = Number(saleData.subtotal) || 0;
                const prevTax = Number(saleData.tax) || 0;
                const taxRate = prevSubtotal > 0 ? prevTax / prevSubtotal : 0;
                const newSubtotal = Math.max(0, prevSubtotal - Number(item.subtotal));
                const newTax = Number((newSubtotal * taxRate).toFixed(2));
                const newTotal = Math.max(0, newSubtotal + newTax);

                transaction.update(saleRef, {
                    subtotal: Number(newSubtotal.toFixed(2)),
                    tax: newTax,
                    total: Number(newTotal.toFixed(2)),
                    updatedAt: serverTimestamp(),
                    lastVoidReason: reason,
                    lastVoidedBy: userId
                });

                // 4. Cash Movement or Credit Debt Reduction
                if (['EFECTIVO', 'TARJETA', 'QR'].includes(saleData.metodoPago) && resolvedSingle && accSingle) {
                    JournalService.txWriteEntry(transaction, accSingle, {
                        accountId: resolvedSingle.accountId,
                        amount: Number(item.subtotal),
                        paymentMethod: saleData.metodoPago === 'QR' ? 'QR' : 'EFECTIVO',
                        category: 'DEVOLUCION_VENTA',
                        description: `Devolución Ítem en Venta #${saleId.slice(-6)} (${reason})`,
                        referenceType: 'SALE',
                        referenceId: saleId,
                        sessionId: resolvedSingle.sessionId,
                        branchId: saleData.branchId,
                        userId,
                        userName,
                    });
                } else if (saleData.metodoPago === 'CREDITO' && saleData.cliente?.id) {
                    if (clientRef && clientExists) {
                        transaction.update(clientRef, {
                            saldoDeudor: Math.max(0, clientCurrentDebt - Number(item.subtotal))
                        });
                    }

                    // También actualizar cuentas_corrientes vinculadas a esta venta
                    if (arSnapPre) {
                        let remainingDelta = Number(item.subtotal);
                        for (const arDoc of arSnapPre.docs) {
                            if (remainingDelta <= 0) break;
                            const arData = arDoc.data();
                            if (arData.status === 'PAID' || arData.status === 'CANCELLED') continue;
                            const cur = Number(arData.remainingBalance) || 0;
                            const reduce = Math.min(cur, remainingDelta);
                            const newRemaining = Math.max(0, cur - reduce);
                            transaction.update(arDoc.ref, {
                                remainingBalance: newRemaining,
                                ...(newRemaining <= 0 ? { status: 'PAID' } : {})
                            });
                            remainingDelta -= reduce;
                        }
                    }
                }
            });

            if (adminInfo) {
                await logAdminAction(adminInfo.uid, adminInfo.email, 'VOID_SALE_ITEM', itemId, adminInfo.branchId, `Devolución de ítem en Venta #${saleId.slice(-6)} (Motivo: ${reason})`);
            }

            return true;
        } catch (e) {
            throw e;
        }
    },

    // Queries (Simplified for list views)

    getInstallmentsBySaleId: async (saleId: string): Promise<Installment[]> => {
        const q = query(collection(db, 'cuentas_corrientes'), where('saleId', '==', saleId));
        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Installment))
            .sort((a, b) => a.installmentNumber - b.installmentNumber);
    },

    getRecentSales: async (limitCount: number = 10, branchId?: string) => {
        const q = query(collection(db, COLLECTION_NAME), orderBy('fecha', 'desc'));
        const snapshot = await getDocs(q);
        let sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), fecha: doc.data().fecha.toDate() } as Sale));
        if (branchId) sales = sales.filter(s => s.branchId === branchId);
        return sales.slice(0, limitCount);
    },

    getSalesByDateRange: async (startDate: Date, endDate: Date, branchId?: string) => {
        const start = Timestamp.fromDate(startDate);
        const end = Timestamp.fromDate(endDate);
        const constraints = [where('fecha', '>=', start), where('fecha', '<=', end), orderBy('fecha', 'desc')];
        if (branchId) constraints.splice(0, 0, where('branchId', '==', branchId));
        const q = query(collection(db, COLLECTION_NAME), ...constraints);
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), fecha: doc.data().fecha.toDate() } as Sale));
    },

    getSalesByClient: async (clientId: string, branchId?: string) => {
        const constraints = [where('cliente.id', '==', clientId), orderBy('fecha', 'desc')];
        if (branchId) constraints.splice(0, 0, where('branchId', '==', branchId));
        const q = query(collection(db, COLLECTION_NAME), ...constraints);
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), fecha: doc.data().fecha.toDate() } as Sale));
    },

    // --- CARTERA Y COBRANZA (AR) ---
    registerPayment: async (arId: string, clientId: string, amount: number, paymentMethod: string, userId: string, branchId: string, notes: string = '') => {
        try {
            const method = (paymentMethod === 'QR' ? 'QR' : paymentMethod === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'EFECTIVO') as 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
            const resolved = await JournalService.resolveAccountId({
                branchId,
                paymentMethod: method,
                cashierId: method === 'EFECTIVO' ? userId : undefined,
            });

            await runTransaction(db, async (transaction) => {
                const arRef = doc(db, 'cuentas_corrientes', arId);
                const clientRef = doc(db, 'clientes', clientId);

                // === FASE 1: TODAS LAS LECTURAS PRIMERO (Firestore TX rule) ===
                const arSnap = await transaction.get(arRef);
                if (!arSnap.exists()) throwStandardError('SYS_DOCUMENT_NOT_FOUND', "Cuenta Corriente");

                const clientSnap = await transaction.get(clientRef);

                const accRead = await JournalService.txReadAccount(transaction, resolved.accountId);
                if (resolved.sessionId) await JournalService.txEnsureSessionOpen(transaction, resolved.sessionId);

                const arData = arSnap.data();
                const currentBalance = arData.remainingBalance || 0;
                const newBalance = Math.max(0, currentBalance - amount);

                // === FASE 2: TODAS LAS ESCRITURAS ===

                // 1. Update AR Header
                transaction.update(arRef, {
                    remainingBalance: newBalance,
                    status: newBalance === 0 ? 'PAID' : 'PARTIAL',
                    lastPaymentAt: serverTimestamp()
                });

                // 2. Register Abono Sub-collection
                const abonoRef = doc(collection(db, `cuentas_corrientes/${arId}/abonos`));
                transaction.set(abonoRef, {
                    amount,
                    date: serverTimestamp(),
                    paymentMethod,
                    userId,
                    createdAt: serverTimestamp()
                });

                // 3. Update Client Debt
                if (clientSnap.exists()) {
                    const cData = clientSnap.data();
                    transaction.update(clientRef, {
                        saldoDeudor: Math.max(0, (cData.saldoDeudor || 0) - amount)
                    });
                }

                // 4. Journal entry (INGRESO en caja/cuenta digital)
                JournalService.txWriteEntry(transaction, accRead, {
                    accountId: resolved.accountId,
                    amount,
                    paymentMethod: method,
                    category: 'ABONO_CLIENTE',
                    description: notes?.trim()
                        ? `Abono Cta Corriente (Ref: ${arId.slice(-6)}) · ${notes.trim()}`
                        : `Abono a Cuenta Corriente (Ref: ${arId.slice(-6)})`,
                    referenceType: 'NONE',
                    referenceId: arId,
                    sessionId: resolved.sessionId,
                    branchId,
                    userId,
                    userName: '',
                });
            });
            return true;
        } catch (e) {
            throw e;
        }
    },

    // --- VENTAS PERDIDAS (OPPORTUNITY COST) ---
    registerLostSale: async (lostSale: {
        masterId: string, 
        productName: string, 
        qty: number, 
        reason: 'PRICE' | 'STOCK' | 'BRAND' | 'OTHER',
        branchId: string,
        userId: string,
        userName?: string,
        notes?: string
    }) => {
        try {
            const docRef = await addDoc(collection(db, 'ventas_perdidas'), {
                ...lostSale,
                date: serverTimestamp()
            });
            return docRef.id;
        } catch (error) {
            throw error;
        }
    }
};
