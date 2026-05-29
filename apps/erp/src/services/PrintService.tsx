// src/services/printService.tsx
import React from 'react';
import QRCode from 'qrcode';
import { ConfigService } from '@/services/ConfigService';
import { AccountService } from '@/services/AccountService';
import { AppConfig } from '@/types';
import { Sale, Quotation, Product, Installment, InstallmentPaymentHistory, Envio, EnvioItem, Pedido, PedidoItem, Purchase, PurchaseItem } from '@/types';
import { Account, CashierSession } from '@/types/treasury';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const PrintService = {
    /**
     * Generates and opens a PDF document for Sales or Quotations in a new tab.
     * Uses centralized configuration fetching and a single logic block for PDF rendering.
     *
     * @param documentData - The Sale or Quotation object
     * @param type - Type of document ('SALE' | 'QUOTATION')
     * @param branchId - The branch ID where the document was emitted (optional)
     */
    async printDocument(documentData: Sale | Quotation, type: 'SALE' | 'QUOTATION', branchId?: string) {
        try {
            // 1. Fetch unified config (Global + Branch overrides)
            let config = await ConfigService.getConfig(branchId);

            if (!config) {
                // Try to get global config directly if no branch
                config = await ConfigService.getConfig() || {} as AppConfig;
            }

            // 2. Generate QR Code for external validation
            const validationUrl = `${window.location.origin}/verificar/${documentData.id}`;
            const qrCodeUrl = await QRCode.toDataURL(validationUrl, { width: 120, margin: 1 });

            // 2.5 Load bank accounts for this branch (BANK type, active, available to branch).
            // Si el documento es de una sucursal, mostramos sus cuentas. Si es global, todas activas.
            let bankAccounts: Account[] = [];
            try {
                const docBranchId = (documentData as { branchId?: string }).branchId || branchId;
                const all = await AccountService.list({
                    type: 'BANK',
                    branchId: docBranchId,
                    includeInactive: false,
                });
                bankAccounts = all;
            } catch (accErr) {
                console.warn('[PrintService] No se pudieron cargar cuentas bancarias:', accErr);
            }

            // 3. Dynamic Imports for React-PDF (heavy lib, keep it out of main bundle)
            const { pdf } = await import('@react-pdf/renderer');
            const ReceiptDocument = (await import('@/components/pos/ReceiptPDF')).default;

            // 3.5 Sanitize legacy/corrupt payloads to prevent Uncaught TypeErrors inside React-PDF Render engine
            // 3.6 Hydrate items from sub-collection if missing (Firestore sub-collection pattern)
            let hydratedItems = documentData.items;
            if ((!hydratedItems || hydratedItems.length === 0) && documentData.id) {
                try {
                    const subPath = type === 'SALE' ? 'ventas' : 'cotizaciones';
                    const itemsSnap = await getDocs(query(collection(db, `${subPath}/${documentData.id}/items`)));
                    hydratedItems = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as typeof documentData.items;
                } catch (subErr) {
                    console.warn('[PrintService] Could not hydrate items from sub-collection:', subErr);
                }
            }

            const sanitizedData = {
                ...documentData,
                cliente: documentData.cliente || { razonSocial: 'CLIENTE SIN REGISTRO', tipo: 'PARTICULAR' },
                metodoPago: (documentData as Sale).metodoPago || 'EFECTIVO',
                total: documentData.total || 0,
                subtotal: documentData.subtotal || documentData.total || 0,
                // Preserve CUOTAS fields explicitly
                installments: (documentData as Sale).installments,
                installmentAmount: (documentData as Sale).installmentAmount,
                adelanto: (documentData as Sale).adelanto,
                items: hydratedItems?.map(item => ({
                    ...item,
                    productName: item.productName || 'Producto Desconocido',
                    quantity: item.quantity || 1,
                    unitPrice: item.unitPrice || 0,
                    subtotal: item.subtotal || 0
                })) || []
            };

            // 4. Render PDF to Blob
            const blob = await pdf(
                <ReceiptDocument
                    sale={sanitizedData as Sale}
                    qrCodeUrl={qrCodeUrl}
                    config={config || undefined}
                    type={type}
                    validationUrl={validationUrl}
                    bankAccounts={bankAccounts}
                />
            ).toBlob();

            // 5. Open PDF in a new window/tab
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');

        } catch (error) {
            console.error(`[PrintService] Error generating ${type} PDF:`, error);
            throw new Error('Error al generar el documento PDF.');
        }
    },

    async printProductQR(product: Product) {
        try {
            // 1. Generate QR Code (using code or ID)
            const qrCodeUrl = await QRCode.toDataURL(product.codigo || product.id || '', { 
                width: 200, 
                margin: 1,
                errorCorrectionLevel: 'M'
            });

            // 2. Dynamic Imports for React-PDF
            const { pdf } = await import('@react-pdf/renderer');
            const ProductQRLabelPDF = (await import('@/components/inventory/ProductQRLabelPDF')).default;

            // 3. Render PDF to Blob
            const blob = await pdf(
                <ProductQRLabelPDF
                    product={product}
                    qrCodeUrl={qrCodeUrl}
                />
            ).toBlob();

            // 4. Open PDF in a new window/tab
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');

        } catch (error) {
            console.error(`[PrintService] Error generating QR PDF:`, error);
            throw new Error('Error al generar la etiqueta QR.');
        }
    },

    async printInstallmentReceipt(params: {
        installment: Installment;
        paidAmount: number;
        paymentMethod: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
        clientName: string;
        clientNit?: string;
        paidCuotas: number;
        pendingCuotas: number;
        totalDebtRemaining: number;
        nextDueDate?: Date;
        branchName?: string;
        cashierName?: string;
        notes?: string;
    }) {
        try {
            // Fetch config for bank info, branch details, etc.
            let config = await ConfigService.getConfig(params.installment.branchId);
            if (!config) config = await ConfigService.getConfig() || {} as AppConfig;

            const { pdf } = await import('@react-pdf/renderer');
            const InstallmentReceiptPDF = (await import('@/components/pos/InstallmentReceiptPDF')).default;

            const blob = await pdf(
                <InstallmentReceiptPDF {...params} config={{
                    branchName: params.branchName || config.branchName,
                    address: config.address,
                    phone: config.phone,
                    email: config.email,
                    city: config.city,
                    nit: config.nit,
                    bankName: config.bankName,
                    accountNumber: config.accountNumber,
                    accountType: config.accountType,
                    accountHolder: config.accountHolder,
                    qrImageUrl: config.qrImageUrl,
                }} />
            ).toBlob();

            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (error) {
            console.error('[PrintService] Error generating Installment Receipt PDF:', error);
            throw new Error('Error al generar el comprobante de cobro.');
        }
    },

    async printCreditReceipt(params: {
        credit: {
            saleId: string;
            clientName: string;
            clientNit?: string;
            saleTotal: number;
            totalRemaining: number;
            pendingCount: number;
            paidCount: number;
            totalInstallments: number;
            productsSummary?: string;
            adelanto?: number;
            nextDueDate?: Date;
            installments: Installment[];
            branchId: string;
        };
        paymentHistory: InstallmentPaymentHistory[];
        branchName?: string;
    }) {
        try {
            let config = await ConfigService.getConfig(params.credit.branchId);
            if (!config) config = await ConfigService.getConfig() || {} as AppConfig;

            const { pdf } = await import('@react-pdf/renderer');
            const CreditReceiptPDF = (await import('@/components/pos/CreditReceiptPDF')).default;

            const blob = await pdf(
                <CreditReceiptPDF
                    credit={params.credit}
                    paymentHistory={params.paymentHistory}
                    branchName={params.branchName || config.branchName}
                    config={{
                        branchName: params.branchName || config.branchName,
                        address: config.address,
                        phone: config.phone,
                        email: config.email,
                        city: config.city,
                        nit: config.nit,
                        bankName: config.bankName,
                        accountNumber: config.accountNumber,
                        accountType: config.accountType,
                        accountHolder: config.accountHolder,
                        qrImageUrl: config.qrImageUrl,
                    }}
                />
            ).toBlob();

            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (error) {
            console.error('[PrintService] Error generating Credit Receipt PDF:', error);
            throw new Error('Error al generar el recibo de deuda.');
        }
    },

    /**
     * Genera la guía de envío interno (PDF) entre sucursales.
     * @param envio Envio document
     * @param items EnvioItem list (subcolección)
     * @param branchId Sucursal de despacho para tomar config (opcional)
     */
    async printEnvioGuide(envio: Envio, items: EnvioItem[], branchId?: string) {
        try {
            const config = await ConfigService.getConfig(branchId || envio.fromBranchId)
                || await ConfigService.getConfig()
                || {} as AppConfig;

            const { pdf } = await import('@react-pdf/renderer');
            const EnvioGuidePDF = (await import('@/components/envios/EnvioGuidePDF')).default;

            const blob = await pdf(
                <EnvioGuidePDF envio={envio} items={items} config={config} />
            ).toBlob();

            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (error) {
            console.error('[PrintService] Error generating Envio Guide PDF:', error);
            throw new Error('Error al generar la guía de envío.');
        }
    },

    /**
     * Genera la guía de pedido inter-sucursal (PDF).
     */
    async printPedidoGuide(pedido: Pedido, items: PedidoItem[], branchId?: string) {
        try {
            const config = await ConfigService.getConfig(branchId || pedido.fromBranchId)
                || await ConfigService.getConfig()
                || {} as AppConfig;

            const { pdf } = await import('@react-pdf/renderer');
            const PedidoGuidePDF = (await import('@/components/pedidos/PedidoGuidePDF')).default;

            const blob = await pdf(
                <PedidoGuidePDF pedido={pedido} items={items} config={config} />
            ).toBlob();

            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (error) {
            console.error('[PrintService] Error generating Pedido Guide PDF:', error);
            throw new Error('Error al generar la guía de pedido.');
        }
    },

    /**
     * Genera el PDF de una Orden de Compra y lo abre en nueva pestaña.
     * @param purchase Objeto Purchase
     * @param items PurchaseItem[] — si está vacío se intenta hidratar desde la subcolección.
     * @param branchId ID de sucursal para config (opcional)
     */
    async printPurchase(purchase: Purchase, items: PurchaseItem[], branchId?: string) {
        try {
            // 1. Config de la sucursal
            let config = await ConfigService.getConfig(branchId || purchase.branchId);
            if (!config) config = await ConfigService.getConfig() || {} as AppConfig;

            // 2. Hidratar items desde subcolección si no vienen incluidos
            let hydratedItems: PurchaseItem[] = items;
            if ((!hydratedItems || hydratedItems.length === 0) && purchase.id) {
                try {
                    const snap = await getDocs(query(collection(db, `compras/${purchase.id}/items`)));
                    hydratedItems = snap.docs.map(d => ({ id: d.id, ...d.data() })) as PurchaseItem[];
                } catch (subErr) {
                    console.warn('[PrintService] No se pudo hidratar items de compra:', subErr);
                }
            }

            // 3. Sanitizar
            const sanitizedItems: PurchaseItem[] = hydratedItems.map(item => ({
                ...item,
                productName: item.productName || 'Producto desconocido',
                quantity: item.quantity || 0,
                cost: item.cost || 0,
                subtotal: item.subtotal ?? (item.cost || 0) * (item.quantity || 0),
            }));

            // 4. Dynamic import + render PDF
            const { pdf } = await import('@react-pdf/renderer');
            const PurchasePDF = (await import('@/components/compras/PurchasePDF')).default;

            const blob = await pdf(
                <PurchasePDF
                    purchase={purchase}
                    items={sanitizedItems}
                    config={config || undefined}
                />
            ).toBlob();

            // 5. Abrir en nueva pestaña
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (error) {
            console.error('[PrintService] Error generating Purchase PDF:', error);
            throw new Error('Error al generar la orden de compra PDF.');
        }
    },

    /**
     * Genera el PDF del arqueo/cierre de una sesión de caja.
     * @param session Objeto CashierSession
     * @param branchId ID de sucursal para config (opcional)
     */
    async printSessionReport(session: CashierSession, branchId?: string) {
        try {
            // 1. Config de la sucursal
            let config = await ConfigService.getConfig(branchId || session.branchId);
            if (!config) config = await ConfigService.getConfig() || {} as AppConfig;

            // 2. Dynamic import + render PDF
            const { pdf } = await import('@react-pdf/renderer');
            const SessionClosePDF = (await import('@/components/caja/SessionClosePDF')).default;

            const blob = await pdf(
                <SessionClosePDF
                    session={session}
                    config={config || undefined}
                />
            ).toBlob();

            // 3. Abrir en nueva pestaña
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (error) {
            console.error('[PrintService] Error generating Session Report PDF:', error);
            throw new Error('Error al generar el informe de cierre de caja PDF.');
        }
    },
};
