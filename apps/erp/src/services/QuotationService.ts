import { db } from '@/lib/firebase';
import {
    collection,
    query,
    orderBy,
    getDocs,
    updateDoc,
    doc,
    Timestamp,
    serverTimestamp,
    getDoc,
    where,
    writeBatch,
    runTransaction
} from 'firebase/firestore';
import { Quotation, QuotationItem, Sale, SaleItem, CashMovement } from '@/types';
import { logAdminAction } from '@/lib/audit';
import { throwStandardError } from '@/utils/errorCodes';
import { SaleService } from './SaleService';

const QUOTATIONS_COLLECTION = 'cotizaciones';

// Helper to remove undefined values before sending to Firestore
const sanitizeData = (data: Record<string, unknown>) => {
    const sanitized: Record<string, unknown> = {};
    Object.keys(data).forEach(key => {
        if (data[key] !== undefined && key !== 'items') { // NEVER save items in header
            sanitized[key] = data[key];
        }
    });
    return sanitized;
};

export const QuotationService = {
    getQuotations: async (branchId?: string) => {
        let q = query(
            collection(db, QUOTATIONS_COLLECTION),
            orderBy('fecha', 'desc')
        );

        if (branchId) {
            q = query(q, where('branchId', '==', branchId));
        }

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                fecha: data.fecha instanceof Timestamp ? data.fecha.toDate() : (data.fecha ? new Date(data.fecha) : new Date()),
                validUntil: data.validUntil instanceof Timestamp ? data.validUntil.toDate() : (data.validUntil ? new Date(data.validUntil) : new Date()),
            } as Quotation;
        });
    },

    getQuotationsByClient: async (clientId: string, branchId?: string) => {
        let q = query(
            collection(db, QUOTATIONS_COLLECTION),
            where('cliente.id', '==', clientId),
            orderBy('fecha', 'desc')
        );

        if (branchId) {
            q = query(q, where('branchId', '==', branchId));
        }

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                fecha: data.fecha instanceof Timestamp ? data.fecha.toDate() : (data.fecha ? new Date(data.fecha) : new Date()),
                validUntil: data.validUntil instanceof Timestamp ? data.validUntil.toDate() : (data.validUntil ? new Date(data.validUntil) : new Date()),
            } as Quotation;
        });
    },

    getQuotationItems: async (quotationId: string): Promise<QuotationItem[]> => {
        const q = query(collection(db, `${QUOTATIONS_COLLECTION}/${quotationId}/items`));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuotationItem));
    },

    getQuotationById: async (id: string) => {
        const docRef = doc(db, QUOTATIONS_COLLECTION, id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const items = await QuotationService.getQuotationItems(id);
            return {
                id: docSnap.id,
                ...data,
                items,
                fecha: data.fecha instanceof Timestamp ? data.fecha.toDate() : (data.fecha ? new Date(data.fecha) : new Date()),
                validUntil: data.validUntil instanceof Timestamp ? data.validUntil.toDate() : (data.validUntil ? new Date(data.validUntil) : new Date()),
            } as Quotation;
        }
        return null;
    },

    createQuotation: async (quotation: Omit<Quotation, 'id'>, branchId: string, adminInfo?: { uid: string, email: string }) => {
        try {
            const itemsList = quotation.items || [];
            const sanitized = sanitizeData(quotation as Record<string, unknown>);
            const newDocRef = doc(collection(db, QUOTATIONS_COLLECTION));

            // writeBatch funciona offline (atomic, encolado en IndexedDB).
            // runTransaction requería ida al servidor — innecesario aquí porque solo hay escrituras.
            const batch = writeBatch(db);

            batch.set(newDocRef, {
                ...sanitized,
                branchId,
                fecha: serverTimestamp(),
                status: 'PENDING',
            });

            itemsList.forEach(item => {
                const itemRef = doc(collection(db, `${QUOTATIONS_COLLECTION}/${newDocRef.id}/items`));
                batch.set(itemRef, { ...item, isVoided: false });
            });

            await batch.commit();

            // logAdminAction usa addDoc → también funciona offline (encolado)
            if (adminInfo) {
                await logAdminAction(
                    adminInfo.uid,
                    adminInfo.email,
                    'CREATE_QUOTATION',
                    newDocRef.id,
                    branchId,
                    `Cotización generada #${newDocRef.id.slice(-8)} para ${quotation.cliente.razonSocial}`
                );
            }

            return newDocRef.id;
        } catch (e) {
            console.error("Error creating quotation:", e);
            throw e;
        }
    },

    updateQuotationStatus: async (id: string, status: Quotation['status'], reason?: string, adminInfo?: { uid: string, email: string, branchId?: string }): Promise<void> => {
        const docRef = doc(db, QUOTATIONS_COLLECTION, id);
        await updateDoc(docRef, {
            status,
            ...(reason ? { notes: reason } : {}),
            updatedAt: serverTimestamp()
        });

        if (adminInfo) {
            await logAdminAction(
                adminInfo.uid,
                adminInfo.email,
                'UPDATE_QUOTATION_STATUS',
                id,
                adminInfo.branchId || 'HQ',
                `Estado de cotización #${id.slice(-8)} cambiado a ${status}${reason ? `. Motivo: ${reason}` : ''}`
            );
        }
    },

    deleteQuotation: async (id: string) => {
        const docRef = doc(db, QUOTATIONS_COLLECTION, id);
        await updateDoc(docRef, { status: 'REJECTED', notes: 'Eliminado por el usuario' });
    },

    voidQuotationItem: async (quotationId: string, itemId: string, adminInfo?: { uid: string, email: string, branchId?: string }) => {
        try {
            const quotationRef = doc(db, QUOTATIONS_COLLECTION, quotationId);
            
            await runTransaction(db, async (transaction) => {
                const quotationSnap = await transaction.get(quotationRef);
                if (!quotationSnap.exists()) throw new Error("La cotización no existe");
                const quotationData = quotationSnap.data() as Quotation;

                const itemRef = doc(db, `${QUOTATIONS_COLLECTION}/${quotationId}/items`, itemId);
                const itemSnap = await transaction.get(itemRef);

                if (!itemSnap.exists()) throw new Error("El ítem no existe");
                const item = itemSnap.data() as QuotationItem;
                if (item.isVoided) throw new Error("El ítem ya está anulado");

                // 1. Mark item as voided in sub-collection
                transaction.update(itemRef, { isVoided: true });

                // 2. Recalculate Totals in Header
                const newTotal = (quotationData.total || 0) - item.subtotal;
                const newSubtotal = (quotationData.subtotal || 0) - item.subtotal;

                transaction.update(quotationRef, {
                    total: Math.max(0, newTotal),
                    subtotal: Math.max(0, newSubtotal),
                    updatedAt: serverTimestamp()
                });
            });

            if (adminInfo) {
                await logAdminAction(
                    adminInfo.uid,
                    adminInfo.email,
                    'VOID_QUOTATION_ITEM',
                    quotationId,
                    adminInfo.branchId || 'HQ',
                    `Ítem anulado de la cotización #${quotationId.slice(-8)}`
                );
            }

            return true;
        } catch (e) {
            console.error("Error al anular ítem de cotización:", e);
            throw e;
        }
    },

    /**
     * Ciclo de Conversión a Venta (Architecture: data_flow.md L42)
     * Transforma una cotización atómicamente en una venta real con descarga de stock.
     */
    convertToSale: async (
        quoteId: string, 
        branchId: string, 
        adminInfo: { uid: string, email: string, name?: string },
        paymentMethod: Sale['metodoPago'],
        cashShiftId?: string
    ) => {
        try {
            const quote = await QuotationService.getQuotationById(quoteId);
            if (!quote) throwStandardError('SYS_TRANSACTION_FAILED', 'Cotización no encontrada.');
            if (quote.status !== 'PENDING') throwStandardError('SYS_TRANSACTION_FAILED', 'La cotización ya ha sido procesada o anulada.');

            const items = await QuotationService.getQuotationItems(quoteId);

            // 1. Transform QuotationItems to SaleItems (preservando precios pactados)
            const saleItems: SaleItem[] = items.map(item => ({
                productId: item.productId,
                productName: item.productName,
                productCode: item.productCode,
                quantity: item.quantity,
                unitPrice: item.unitPrice, // Precio pactado en cotización
                subtotal: item.subtotal,
                costAtSale: 0, // Se hidratará en SaleService
            }));

            const saleData: Omit<Sale, 'id'> = {
                cliente: quote.cliente,
                items: saleItems,
                fecha: new Date(),
                metodoPago: paymentMethod,
                total: quote.total,
                subtotal: quote.subtotal,
                tax: quote.isTaxed ? (quote.total * 0.13) : 0, // IVA boliviano standard
                status: 'COMPLETED',
                branchId,
                usuarioId: adminInfo.uid,
                usuarioEmail: adminInfo.email,
                usuarioNombre: adminInfo.name
            };

            // 2. Orquestar Venta (Atomic ACID)
            const saleId = await SaleService.createSale(saleData, branchId, adminInfo, cashShiftId ? {
                shiftId: cashShiftId,
                amount: quote.total,
                type: 'INGRESO',
                reason: `Conversión Cotización #${quoteId.slice(-6).toUpperCase()}`,
                date: new Date(),
                userId: adminInfo.uid,
                paymentMethod: paymentMethod === 'CREDITO' ? 'EFECTIVO' : paymentMethod
            } as Omit<CashMovement, 'id'> : undefined);

            // 3. Update Quotation Status
            await QuotationService.updateQuotationStatus(quoteId, 'CONVERTED', `Convertida a Venta #${saleId.slice(-6).toUpperCase()}`, adminInfo);

            return saleId;
        } catch (e) {
            console.error("Error in convertToSale:", e);
            throw e;
        }
    }
};
