import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, doc, Timestamp, runTransaction, serverTimestamp, getDoc, increment } from 'firebase/firestore';
import { Purchase, InventoryMovement } from '@/types';
import { SupplierService } from '@/services/SupplierService';
import { logAdminAction } from '@/lib/audit';
import { JournalService } from './JournalService';
import { throwStandardError } from '@/utils/errorCodes';

const PURCHASE_COLLECTION = 'compras';
const PRODUCT_COLLECTION = 'productos';
const SUPPLIER_ACCOUNT_COLLECTION = 'cuentas_proveedores';

export const PurchaseService = {
    // Suppliers
    getSuppliers: async () => {
        return SupplierService.getSuppliers();
    },

    // Get Purchase Items from Sub-collection
    getPurchaseItems: async (purchaseId: string) => {
        const q = query(collection(db, `${PURCHASE_COLLECTION}/${purchaseId}/items`));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // Get Purchase by ID
    getPurchaseById: async (id: string) => {
        const docRef = doc(db, PURCHASE_COLLECTION, id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return null;
        
        const items = await PurchaseService.getPurchaseItems(id);
        const data = docSnap.data()!;
        return {
            id: docSnap.id,
            ...data,
            items,
            date: (data.date as Timestamp).toDate()
        } as unknown as Purchase;
    },

    // Create Purchase Header + Items in Sub-collection
    createPurchase: async (purchase: Omit<Purchase, 'id'>, branchId: string, adminInfo?: { uid: string, email: string, branchId: string, name?: string }) => {
        if (adminInfo && adminInfo.branchId !== branchId && adminInfo.branchId !== 'HQ') {
            throwStandardError('AUTH_BRANCH_ACCESS', `Solicitado: ${branchId}, Usuario: ${adminInfo.branchId}`);
        }

        const itemsList = purchase.items || [];
        if (itemsList.length === 0) {
            throwStandardError('PURCH_NOT_FOUND', 'La compra no contiene ítems');
        }
        for (const it of itemsList) {
            if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
                throwStandardError('INV_INVALID_ADJUSTMENT', `Cantidad inválida para ${it.productName || it.productId}`);
            }
            if (!Number.isFinite(it.cost) || it.cost < 0) {
                throwStandardError('INV_INVALID_ADJUSTMENT', `Costo inválido para ${it.productName || it.productId}`);
            }
        }

        // Defensa: recalcular total server-side a partir de los items.
        // Evita que un cliente envíe total=0 con items reales (no descontaría caja ni
        // sumaría deuda) o un total inflado.
        const computedTotal = itemsList.reduce((s, it) => s + (it.cost * it.quantity), 0);
        if (!Number.isFinite(purchase.total) || Math.abs(purchase.total - computedTotal) > 0.01) {
            // Si difiere por más de 1 centavo, lo corregimos al valor calculado.
            console.warn(`[Purchase] Total cliente (${purchase.total}) difiere del calculado (${computedTotal}). Usando calculado.`);
            purchase = { ...purchase, total: Math.round(computedTotal * 100) / 100 };
        }

        const paymentMethod = purchase.paymentMethod || 'EFECTIVO';
        const needsJournalEntry = (paymentMethod === 'EFECTIVO' || paymentMethod === 'QR' || paymentMethod === 'TRANSFERENCIA') && purchase.total > 0;

        // PRE-RESOLVER cuenta de tesorería (fuera de la tx). Si EFECTIVO requiere sesión OPEN.
        let resolvedAccount: { accountId: string; sessionId: string | null } | null = null;
        if (needsJournalEntry) {
            resolvedAccount = await JournalService.resolveAccountId({
                branchId,
                paymentMethod: paymentMethod as 'EFECTIVO' | 'QR' | 'TRANSFERENCIA',
                cashierId: paymentMethod === 'EFECTIVO' ? adminInfo?.uid : undefined,
            });
        }

        // PRE-VALIDACIÓN: si CREDITO, verificar que la cuenta del proveedor exista.
        if (paymentMethod === 'CREDITO' && purchase.total > 0) {
            if (!purchase.supplierId) {
                throwStandardError('PURCH_NOT_FOUND', 'Cuenta de proveedor requerida para compras a crédito.');
            }
            const accSnap = await getDoc(doc(db, SUPPLIER_ACCOUNT_COLLECTION, purchase.supplierId));
            if (!accSnap.exists()) {
                throwStandardError('PURCH_NOT_FOUND', 'La cuenta del proveedor no existe. Selecciona una cuenta válida.');
            }
        }

        const newPurchaseRef = doc(collection(db, PURCHASE_COLLECTION));

        try {
            await runTransaction(db, async (transaction) => {
                // 0. Si es CRÉDITO, leer la cuenta del proveedor PRIMERO (todos los reads van antes
                //    de los writes en una transacción Firestore). Necesitamos el empresaId para
                //    propagar el saldo al documento de la empresa.
                let creditAccountRef: ReturnType<typeof doc> | null = null;
                let creditEmpresaRef: ReturnType<typeof doc> | null = null;
                if (paymentMethod === 'CREDITO' && purchase.total > 0 && purchase.supplierId) {
                    creditAccountRef = doc(db, SUPPLIER_ACCOUNT_COLLECTION, purchase.supplierId);
                    const accSnap = await transaction.get(creditAccountRef);
                    if (!accSnap.exists()) {
                        throwStandardError('PURCH_NOT_FOUND', 'La cuenta del proveedor no existe.');
                    }
                    const accData = accSnap.data() as { empresaId?: string };
                    if (accData.empresaId) {
                        creditEmpresaRef = doc(db, 'empresas', accData.empresaId);
                    }
                }

                // 0b. Leer cuenta de tesorería para EFECTIVO/QR/TRANSFERENCIA (read antes de writes).
                const accRead = (needsJournalEntry && resolvedAccount)
                    ? await JournalService.txReadAccount(transaction, resolvedAccount.accountId)
                    : null;
                if (accRead && paymentMethod === 'EFECTIVO' && accRead.account.currentBalance < purchase.total) {
                    throwStandardError('PURCH_CASH_INSUFFICIENT', `Disponible: Bs. ${accRead.account.currentBalance.toFixed(2)} · Requerido: Bs. ${purchase.total.toFixed(2)}`);
                }
                // Re-validar sesión OPEN dentro de la TX (anti-race)
                if (resolvedAccount?.sessionId) {
                    await JournalService.txEnsureSessionOpen(transaction, resolvedAccount.sessionId);
                }

                // 1. Get all product Refs
                const productRefs = itemsList.map(item => doc(db, PRODUCT_COLLECTION, item.productId)); // Might be local productId OR masterId
                const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

                // 1.5. Pre-fetch master documents for missing products (to allow auto-creation)
                const masterDocs: Record<string, import('firebase/firestore').DocumentData> = {};
                for (let index = 0; index < productDocs.length; index++) {
                    if (!productDocs[index].exists()) {
                        const mRef = doc(db, 'catalogo_maestro', itemsList[index].productId);
                        const mSnap = await transaction.get(mRef);
                        if (mSnap.exists()) {
                            masterDocs[itemsList[index].productId] = mSnap.data();
                        }
                    }
                }

                // 1.6. Pre-fetch ALL master catalog docs for UOM conversion (MUST be before any writes)
                const masterCatalogCache: Record<string, import('firebase/firestore').DocumentData | null> = {};
                for (let index = 0; index < productDocs.length; index++) {
                    const item = itemsList[index];
                    const productData = productDocs[index].data();
                    const masterIdToUse = productData?.masterId || item.productId;
                    if (!masterCatalogCache[masterIdToUse] && masterCatalogCache[masterIdToUse] !== null) {
                        // Check if already fetched in step 1.5
                        if (masterDocs[masterIdToUse]) {
                            masterCatalogCache[masterIdToUse] = masterDocs[masterIdToUse];
                        } else {
                            const masterRef = doc(db, 'catalogo_maestro', masterIdToUse);
                            const masterSnap = await transaction.get(masterRef);
                            masterCatalogCache[masterIdToUse] = masterSnap.exists() ? masterSnap.data() : null;
                        }
                    }
                }

                // 2. Prepare Updates (ALL reads are done, now only writes)
                for (let index = 0; index < productDocs.length; index++) {
                    const docSnap = productDocs[index];
                    const item = itemsList[index];
                    let productData = docSnap.data();
                    let targetDocRef = productRefs[index];
                    let isNewLocalProduct = false;

                    if (!docSnap.exists()) {
                        // Is it a master product being bought for the first time?
                        const mData = masterDocs[item.productId];
                        if (mData) {
                            isNewLocalProduct = true;
                            // The productId was actually the masterId. We MUST use a deterministic local product Id.
                            targetDocRef = doc(db, PRODUCT_COLLECTION, `${branchId}_${item.productId}`);
                            productData = {
                                masterId: item.productId,
                                branchId: branchId,
                                nombre: mData.nombre || item.productName || 'Producto',
                                codigo: mData.codigo || 'S/N',
                                marca: mData.marca || '',
                                categoria: mData.categoriaId || '',
                                stock: 0,
                                minStock: 5,
                                isActive: true,
                                ubicacionFisica: '',
                                precioOverride: mData.precioConFactura ?? mData.precioDefault ?? null,
                                precioConFactura: mData.precioConFactura ?? mData.precioDefault ?? null,
                                precioSinFactura: mData.precioSinFactura ?? mData.precioDefault ?? null,
                                precioMayorista: mData.precioMayorista ?? null,
                                createdAt: serverTimestamp(),
                                updatedAt: serverTimestamp()
                            };
                        } else {
                            throwStandardError('INV_PRODUCT_NOT_FOUND', item.productName);
                        }
                    } else if (productData?.branchId && productData.branchId !== branchId) {
                        throwStandardError('AUTH_BRANCH_ACCESS', item.productName);
                    }

                    // --- LOGISTIC INTELLIGENCE: UOM Multiplier (Architecture: database_schema.md L31) ---
                    let finalQuantity = item.quantity;
                    let finalUnitCost = item.cost;
                    
                    // Use pre-fetched master data for conversion factor
                    const masterIdToUse = productData?.masterId || item.productId;
                    const mData = masterCatalogCache[masterIdToUse];
                    if (mData) {
                        const uom = mData.uomConversion;
                        // If item unit matches "from" and master unit matches "to", apply factor
                        if (uom && item.unit === uom.fromUnit && mData.unidad === uom.toUnit && uom.factor > 0) {
                            finalQuantity = item.quantity * uom.factor;
                            finalUnitCost = item.cost / uom.factor;
                        }
                    }

                    const currentStock = productData?.stock || 0;
                    const newStock = currentStock + finalQuantity;

                    // Update or Create Product
                    if (isNewLocalProduct) {
                        const newData: Record<string, unknown> = {
                            ...productData,
                            stock: newStock,
                            costo: finalUnitCost,
                            updatedAt: serverTimestamp()
                        };
                        transaction.set(targetDocRef, newData);
                    } else {
                        transaction.update(targetDocRef, {
                            stock: newStock,
                            costo: finalUnitCost,
                            updatedAt: serverTimestamp()
                        });
                    }

                    // Log Movement (with MasterId)
                    const purchaseDate = (purchase.date instanceof Timestamp) 
                        ? purchase.date 
                        : ((purchase.date instanceof Date) ? Timestamp.fromDate(purchase.date) : serverTimestamp());
                    const movRef = doc(collection(db, 'movimientos'));
                    transaction.set(movRef, {
                        productId: targetDocRef.id,
                        masterId: productData?.masterId || item.productId, // Mandatory
                        branchId: branchId, 
                        type: 'ENTRADA',
                        quantity: finalQuantity,
                        currentStock: newStock,
                        previousStock: currentStock,
                        reason: `Compra a ${purchase.supplierName} #${newPurchaseRef.id.slice(-6).toUpperCase()}${item.unit ? ` (${item.quantity} ${item.unit})` : ''}`,
                        referenceId: newPurchaseRef.id,
                        date: purchaseDate, 
                        userId: adminInfo?.uid,
                        userEmail: adminInfo?.email,
                        userName: adminInfo?.name,
                        createdAt: serverTimestamp()
                    } as InventoryMovement);
                }

                // 3. Create Purchase Header (No items array)
                const sanitizedHeader: Record<string, unknown> = {
                    supplierId: purchase.supplierId,
                    supplierName: purchase.supplierName,
                    date: (purchase.date instanceof Timestamp) ? purchase.date : ((purchase.date instanceof Date) ? Timestamp.fromDate(purchase.date) : serverTimestamp() as unknown as Timestamp),
                    createdAt: serverTimestamp(),
                    total: purchase.total,
                    itemCount: itemsList.length,
                    status: 'RECEIVED',
                    notes: purchase.notes || '',
                    branchId: branchId,
                    paymentMethod,
                    paymentReference: purchase.paymentReference || '',
                    usuarioId: adminInfo?.uid,
                    usuarioEmail: adminInfo?.email,
                    usuarioNombre: adminInfo?.name ?? ''
                };
                if (purchase.dueDate) {
                    sanitizedHeader.dueDate = (purchase.dueDate instanceof Date)
                        ? Timestamp.fromDate(purchase.dueDate)
                        : purchase.dueDate;
                }
                transaction.set(newPurchaseRef, sanitizedHeader);

                // 3b. Si es CRÉDITO, sumar al saldo del proveedor Y al saldoTotal de la empresa
                //     (atomic en la misma tx). Esto reemplaza la llamada a SupplierAccountService.adjustSaldo
                //     que se hacía antes en frontend (que actualizaba ambos documentos).
                if (paymentMethod === 'CREDITO' && purchase.total > 0 && creditAccountRef) {
                    transaction.update(creditAccountRef, {
                        saldo: increment(purchase.total),
                        updatedAt: serverTimestamp()
                    });
                    if (creditEmpresaRef) {
                        transaction.update(creditEmpresaRef, {
                            saldoTotal: increment(purchase.total),
                            updatedAt: serverTimestamp()
                        });
                    }
                }

                // 4. Create Items in Sub-collection
                itemsList.forEach(item => {
                    const itemRef = doc(collection(db, `${PURCHASE_COLLECTION}/${newPurchaseRef.id}/items`));
                    transaction.set(itemRef, item);
                });

                // 5. Asentar el EGRESO de tesorería dentro de la misma tx (atomicidad total).
                if (accRead && resolvedAccount) {
                    JournalService.txWriteEntry(transaction, accRead, {
                        accountId: resolvedAccount.accountId,
                        amount: purchase.total,
                        paymentMethod: paymentMethod as 'EFECTIVO' | 'QR' | 'TRANSFERENCIA',
                        category: 'COMPRA_STOCK',
                        description: `Pago ${paymentMethod} a ${purchase.supplierName} · ${itemsList.length} ${itemsList.length === 1 ? 'producto' : 'productos'} (Compra #${newPurchaseRef.id.slice(-6).toUpperCase()})`,
                        referenceType: 'PURCHASE',
                        referenceId: newPurchaseRef.id,
                        sessionId: resolvedAccount.sessionId,
                        branchId,
                        userId: adminInfo?.uid || 'system',
                        userName: adminInfo?.name || adminInfo?.email || 'system',
                    });
                }
            });

            if (adminInfo) {
                await logAdminAction(adminInfo.uid, adminInfo.email, 'CREATE_PURCHASE', newPurchaseRef.id, branchId, `Compra registrada - Total: Bs. ${purchase.total}`);
            }

            return newPurchaseRef.id;

        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throwStandardError('SYS_TRANSACTION_FAILED', `No se pudo completar el registro de la compra. ${detail}`);
        }
    },

    getPurchases: async (branchId?: string) => {
        let q = query(collection(db, PURCHASE_COLLECTION), orderBy('date', 'desc'));
        if (branchId) {
            q = query(q, where('branchId', '==', branchId));
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            date: (doc.data().date as Timestamp).toDate()
        })) as Purchase[];
    }
};
