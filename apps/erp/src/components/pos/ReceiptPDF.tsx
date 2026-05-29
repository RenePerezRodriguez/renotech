import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { Sale, Quotation } from '@/types';
import { Account } from '@/types/treasury';
import { numberToSpanishWords } from '@/utils/numberToSpanishWords';
import { ensureDate } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';

// Define styles
const styles = StyleSheet.create({
    page: {
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        padding: 0,
        paddingBottom: 70,
        fontFamily: 'Helvetica',
    },
    watermark: {
        position: 'absolute',
        top: 300,
        left: 150,
        width: 300,
        height: 300,
        opacity: 0.05,
        transform: 'rotate(-45deg)',
        zIndex: -1,
    },
    // Premium Header
    headerContainer: {
        backgroundColor: '#0f172a',
        paddingHorizontal: 30,
        paddingVertical: 15,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 3,
        borderBottomColor: '#eab308',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
    },
    headerLogo: {
        width: 50,
        height: 50,
        objectFit: 'contain',
    },
    logoTextContainer: {
        flexDirection: 'column',
    },
    logoTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
        letterSpacing: 1,
    },
    logoSubtitle: {
        fontSize: 10,
        color: '#eab308',
        fontWeight: 'bold',
        letterSpacing: 2,
        marginTop: -2,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
    },
    headerTitles: {
        alignItems: 'flex-end',
    },
    headerMainTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    headerId: {
        fontSize: 12,
        color: '#FFFFFF',
        marginTop: 2,
    },
    headerQrBox: {
        backgroundColor: '#FFFFFF',
        padding: 4,
        borderRadius: 4,
        alignItems: 'center',
    },
    qrLink: {
        fontSize: 5,
        color: '#64748b',
        marginTop: 2,
        fontFamily: 'Helvetica-Bold',
    },
    // Body
    body: {
        paddingHorizontal: 30,
        paddingTop: 20,
        paddingBottom: 60,
    },
    infoGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    companyInfo: {
        width: '45%',
    },
    companyName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0f172a',
        marginBottom: 4,
    },
    companyDetail: {
        fontSize: 9,
        color: '#4b5563',
        marginBottom: 2,
    },
    // Client Box
    clientBox: {
        width: '50%',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        padding: 0,
        overflow: 'hidden',
    },
    clientBoxHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#f9fafb',
    },
    clientBoxTitle: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    clientBoxDate: {
        fontSize: 7,
        color: '#4b5563',
    },
    clientBoxDivider: {
        height: 1,
        backgroundColor: '#eab308',
        marginHorizontal: 10,
    },
    clientBoxBody: {
        padding: 10,
    },
    clientRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    clientLabel: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#4b5563',
        width: 60,
    },
    clientValue: {
        fontSize: 8,
        color: '#0f172a',
        flex: 1,
    },
    // Table
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
        paddingHorizontal: 10,
    },
    th: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
        paddingVertical: 8,
        paddingHorizontal: 10,
    },
    tableRowEven: {
        backgroundColor: '#f9fafb',
    },
    td: {
        fontSize: 8,
        color: '#374151',
    },
    tdVoided: {
        textDecoration: 'line-through',
        color: '#9ca3af',
    },
    voidLabel: {
        fontSize: 6,
        color: '#ef4444',
        fontWeight: 'bold',
        marginTop: 1,
    },
    // Columns
    colCode: { width: '12%' },
    colBrand: { width: '15%' },
    colQty: { width: '7%', textAlign: 'center' },
    colUnd: { width: '7%', textAlign: 'center' },
    colDesc: { width: '34%' },
    colUnit: { width: '12%', textAlign: 'right' },
    colTotal: { width: '13%', textAlign: 'right' },
    // Footer Section
    footerSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
    },
    bankBox: {
        width: '55%',
        backgroundColor: '#eff6ff',
        borderRadius: 8,
        padding: 10,
        borderWidth: 1,
        borderColor: '#dbeafe',
    },
    bankTitle: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#1e40af',
        marginBottom: 4,
    },
    bankDetail: {
        fontSize: 8,
        color: '#1e40af',
        marginBottom: 2,
    },
    bankNote: {
        fontSize: 7,
        color: '#60a5fa',
        marginTop: 4,
        fontStyle: 'italic',
    },
    bankQrContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 5,
    },
    bankQrImage: {
        width: 60,
        height: 60,
        borderRadius: 4,
    },
    totalsBox: {
        width: '40%',
        alignItems: 'flex-end',
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    totalLabel: {
        fontSize: 10,
        color: '#6b7280',
    },
    totalValue: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    grandTotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingVertical: 8,
        marginTop: 5,
        borderBottomWidth: 2,
        borderBottomColor: '#0f172a',
    },
    grandTotalLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    grandTotalValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    // Policies
    pageFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
    },
    footerText: {
        fontSize: 7,
        color: '#9ca3af',
        textAlign: 'center',
    },
});

interface ReceiptProps {
    sale: Sale | Quotation;
    qrCodeUrl?: string; // QR de Factura/Venta
    config?: {
        branchName?: string;
        address?: string;
        phone?: string;
        email?: string;
        city?: string;
        nit?: string;
        website?: string;
        taxRate?: number;
        bankName?: string;
        accountNumber?: string;
        accountType?: string;
        accountHolder?: string;
        qrImageUrl?: string; // QR de Pago (Imagen)
    };
    type?: 'SALE' | 'QUOTATION';
    validationUrl?: string;
    bankAccounts?: Account[];
}

const ReceiptDocument: React.FC<ReceiptProps> = ({ sale, qrCodeUrl, config, type = 'SALE', validationUrl, bankAccounts }) => {
    if (!sale) return null;

    const JSDate = sale.fecha instanceof Date ? sale.fecha : new Date();
    const formattedDate = JSDate.toLocaleDateString('es-BO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const formatSellerName = (name: string) => {
        if (!name) return '';
        return formatUserName(name).toUpperCase();
    };

    const formatMoney = (amount: number) => {
        return `Bs. ${amount.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const totalPayable = sale.total;
    const isQuotation = type === 'QUOTATION';
    // Cuando no es cotización, sale es Sale (incluye metodoPago, adelanto, amountReceived, etc.)
    const saleData = !isQuotation ? (sale as Sale) : null;

    // Calculate validity range for quotations
    const getValidityRange = () => {
        if (!isQuotation) return null;
        const q = sale as Quotation;
        if (!q.validUntil || !q.fecha) return null;
        const fmt = (d: Date) => d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return { from: fmt(ensureDate(q.fecha)), until: fmt(ensureDate(q.validUntil)) };
    };

    const validityRange = getValidityRange();
    const documentTitle = isQuotation ? 'COTIZACIÓN' : 'RECIBO DE VENTA';
    const prefix = isQuotation ? 'COT-' : 'VEN-';
    const documentId = `${prefix}${sale.id?.slice(-8).toUpperCase() || 'N/A'}`;

    return (
        <Document>
            <Page size="LETTER" style={styles.page}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src="/logo.png" style={styles.watermark} />

                <View style={styles.headerContainer}>
                    <View style={styles.headerLeft}>
                        {/* eslint-disable-next-line jsx-a11y/alt-text */}
                        <Image src="/logo.png" style={styles.headerLogo} />
                        <View style={styles.logoTextContainer}>
                            <Text style={styles.logoTitle}>RENOTECH</Text>
                            <Text style={styles.logoSubtitle}>REPUESTOS Y ACCESORIOS</Text>
                        </View>
                    </View>
                    <View style={styles.headerRight}>
                        <View style={styles.headerTitles}>
                            <Text style={styles.headerMainTitle}>{documentTitle}</Text>
                            <Text style={styles.headerId}>#{documentId}</Text>
                        </View>
                        {qrCodeUrl && (
                            <View style={styles.headerQrBox}>
                                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                                <Image src={qrCodeUrl} style={{ width: 40, height: 40 }} />
                                {validationUrl && (
                                    <Text style={styles.qrLink}>{validationUrl.replace('https://', '').replace('http://', '')}</Text>
                                )}
                            </View>
                        )}
                    </View>
                </View>

                <View style={styles.body}>
                    <View style={styles.infoGrid}>
                        <View style={styles.companyInfo}>
                            <Text style={styles.companyName}>{config?.branchName || 'RENOTECH'}</Text>
                            {config?.address && <Text style={styles.companyDetail}>Dirección: {config.address}</Text>}
                            {config?.city && <Text style={styles.companyDetail}>{config.city}</Text>}
                            {config?.phone && <Text style={styles.companyDetail}>{config.phone}</Text>}
                            {config?.email && <Text style={styles.companyDetail}>{config.email}</Text>}
                        </View>

                        <View style={styles.clientBox}>
                            <View style={styles.clientBoxHeader}>
                                <Text style={styles.clientBoxTitle}>DATOS DEL CLIENTE</Text>
                                <Text style={styles.clientBoxDate}>FECHA EMISIÓN: {formattedDate}</Text>
                            </View>
                            <View style={styles.clientBoxDivider} />
                            <View style={styles.clientBoxBody}>
                                <View style={[styles.clientRow]}>
                                    <Text style={styles.clientLabel}>CLIENTE:</Text>
                                    <Text style={styles.clientValue}>{sale.cliente?.razonSocial || 'Sin Nombre'}</Text>
                                </View>
                                <View style={[styles.clientRow]}>
                                    <Text style={styles.clientLabel}>NIT/CI:</Text>
                                    <Text style={styles.clientValue}>{sale.cliente?.nit || '0'}</Text>
                                </View>
                                <View style={styles.clientRow}>
                                    <Text style={styles.clientLabel}>TELÉFONO:</Text>
                                    <Text style={styles.clientValue}>{sale.cliente?.telefono || '---'}</Text>
                                    <Text style={styles.clientLabel}>PAGO:</Text>
                                    <Text style={styles.clientValue}>{(saleData?.metodoPago || 'EFECTIVO').toUpperCase()}</Text>
                                </View>
                                <View style={{ marginTop: 8 }}>
                                    <View style={styles.clientRow}>
                                        <Text style={styles.clientLabel}>VENDEDOR:</Text>
                                        <Text style={styles.clientValue}>{formatSellerName(sale.usuarioNombre ?? '')}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>

                    <View style={styles.tableHeader}>
                        <Text style={[styles.th, styles.colCode]}>CÓDIGO</Text>
                        <Text style={[styles.th, styles.colQty]}>CANT</Text>
                        <Text style={[styles.th, styles.colUnd]}>UND</Text>
                        <Text style={[styles.th, styles.colDesc]}>DESCRIPCIÓN</Text>
                        <Text style={[styles.th, styles.colBrand]}>MARCA</Text>
                        <Text style={[styles.th, styles.colUnit]}>P. UNIT</Text>
                        <Text style={[styles.th, styles.colTotal]}>SUBTOTAL</Text>
                    </View>

                    {sale.items?.map((item, index) => {
                        const isVoided = item.isVoided;
                        return (
                            <View key={index} style={[styles.tableRow, index % 2 === 0 ? styles.tableRowEven : {}]}>
                                <Text style={[styles.td, styles.colCode, isVoided ? styles.tdVoided : {}]}>
                                    {item.productCode || 'S/C'}
                                </Text>
                                <Text style={[styles.td, styles.colQty, isVoided ? styles.tdVoided : {}]}>{item.quantity}</Text>
                                <Text style={[styles.td, styles.colUnd, isVoided ? styles.tdVoided : {}]}>PZA</Text>
                                <View style={styles.colDesc}>
                                    <Text style={[styles.td, isVoided ? styles.tdVoided : {}]}>{item.productName}</Text>
                                    {isVoided && <Text style={styles.voidLabel}>DEVOLUCIÓN / ANULADO</Text>}
                                </View>
                                <Text style={[styles.td, styles.colBrand, isVoided ? styles.tdVoided : {}]}>
                                    {item.productMarca || '---'}
                                </Text>
                                <Text style={[styles.td, styles.colUnit, isVoided ? styles.tdVoided : {}]}>{formatMoney(item.unitPrice)}</Text>
                                <Text style={[styles.td, styles.colTotal, isVoided ? styles.tdVoided : {}]}>{formatMoney(item.subtotal)}</Text>
                            </View>
                        );
                    })}

                    <View style={styles.footerSection}>
                        <View style={styles.bankBox}>
                            <Text style={styles.bankTitle}>INFORMACIÓN BANCARIA</Text>
                            <View style={{ marginTop: 5 }}>
                                {bankAccounts && bankAccounts.length > 0 ? (
                                    bankAccounts.map((acc, idx) => (
                                        <View key={acc.id || idx} style={{ marginBottom: idx < bankAccounts.length - 1 ? 6 : 0 }}>
                                            <Text style={styles.bankDetail}>
                                                {acc.bankName || acc.name}{acc.accountTypeLabel ? ` - ${acc.accountTypeLabel}` : ''}
                                            </Text>
                                            <Text style={[styles.bankDetail, { fontWeight: 'bold', fontSize: 10 }]}>
                                                {acc.accountNumber || ''}{acc.accountHolder ? ` - ${acc.accountHolder}` : ''}
                                            </Text>
                                        </View>
                                    ))
                                ) : config?.bankName ? (
                                    <>
                                        <Text style={styles.bankDetail}>{config.bankName}{config?.accountType ? ` - ${config.accountType}` : ''}</Text>
                                        <Text style={[styles.bankDetail, { fontWeight: 'bold', fontSize: 10 }]}>{config?.accountNumber || ''}{config?.accountHolder ? ` - ${config.accountHolder}` : ''}</Text>
                                    </>
                                ) : null}
                                <Text style={styles.bankNote}>* Gracias por su preferencia. Conserve este documento.</Text>
                            </View>
                        </View>

                        <View style={styles.totalsBox}>
                            {saleData?.metodoPago === 'CUOTAS' && (saleData.adelanto || 0) > 0 && (
                                <>
                                    <View style={styles.totalRow}>
                                        <Text style={{ ...styles.totalLabel, color: '#059669' }}>ADELANTO:</Text>
                                        <Text style={{ ...styles.totalValue, color: '#059669' }}>{formatMoney(saleData.adelanto || 0)}</Text>
                                    </View>
                                    <View style={styles.totalRow}>
                                        <Text style={{ ...styles.totalLabel, color: '#7c3aed' }}>FINANCIADO:</Text>
                                        <Text style={{ ...styles.totalValue, color: '#7c3aed' }}>{formatMoney(totalPayable - (saleData.adelanto || 0))}</Text>
                                    </View>
                                </>
                            )}

                            <View style={styles.grandTotalRow}>
                                <Text style={styles.grandTotalLabel}>TOTAL A PAGAR:</Text>
                                <Text style={styles.grandTotalValue}>{formatMoney(totalPayable)}</Text>
                            </View>

                            {saleData?.metodoPago === 'EFECTIVO' && saleData.amountReceived && (
                                <>
                                    <View style={styles.totalRow}>
                                        <Text style={styles.totalLabel}>RECIBIDO:</Text>
                                        <Text style={styles.totalValue}>{formatMoney(saleData.amountReceived)}</Text>
                                    </View>
                                    <View style={styles.totalRow}>
                                        <Text style={styles.totalLabel}>CAMBIO:</Text>
                                        <Text style={styles.totalValue}>{formatMoney(saleData.change || 0)}</Text>
                                    </View>
                                </>
                            )}
                            <Text style={{ fontSize: 7, color: '#4b5563', marginTop: 10, fontWeight: 'bold' }}>
                                SON: {numberToSpanishWords(totalPayable)}
                            </Text>
                        </View>
                    </View>

                    {/* Installment Plan Section */}
                    {saleData?.metodoPago === 'CUOTAS' && Number(saleData.installments) > 0 && (() => {
                        const numInstallments = Number(saleData.installments);
                        const adelantoAmt = Number(saleData.adelanto || 0);
                        const financed = totalPayable - adelantoAmt;
                        return (
                        <View style={{ marginTop: 20, borderWidth: 1, borderColor: '#7c3aed', borderRadius: 8, overflow: 'hidden' }}>
                            <View style={{ backgroundColor: '#7c3aed', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 1 }}>PLAN DE CUOTAS</Text>
                                <Text style={{ fontSize: 9, color: '#e9d5ff' }}>{numInstallments} cuotas</Text>
                            </View>
                            <View style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f5f3ff' }}>
                                {adelantoAmt > 0 && (
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#e9d5ff', marginBottom: 4 }}>
                                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#059669' }}>ADELANTO (PAGADO)</Text>
                                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#059669' }}>{formatMoney(adelantoAmt)}</Text>
                                    </View>
                                )}
                                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e9d5ff', paddingBottom: 4, marginBottom: 4 }}>
                                    <Text style={{ width: '20%', fontSize: 8, fontWeight: 'bold', color: '#6b21a8' }}>CUOTA</Text>
                                    <Text style={{ width: '45%', fontSize: 8, fontWeight: 'bold', color: '#6b21a8' }}>VENCIMIENTO</Text>
                                    <Text style={{ width: '35%', fontSize: 8, fontWeight: 'bold', color: '#6b21a8', textAlign: 'right' }}>MONTO</Text>
                                </View>
                                {Array.from({ length: numInstallments }, (_, i) => {
                                    const dueDate = new Date(JSDate);
                                    dueDate.setMonth(dueDate.getMonth() + i + 1);
                                    const baseAmt = Number((financed / numInstallments).toFixed(2));
                                    const amt = i === numInstallments - 1
                                        ? Number((financed - baseAmt * (numInstallments - 1)).toFixed(2))
                                        : baseAmt;
                                    return (
                                        <View key={i} style={{ flexDirection: 'row', paddingVertical: 3, borderBottomWidth: i < numInstallments - 1 ? 1 : 0, borderBottomColor: '#ede9fe' }}>
                                            <Text style={{ width: '20%', fontSize: 9, fontWeight: 'bold', color: '#374151' }}>{i + 1}/{numInstallments}</Text>
                                            <Text style={{ width: '45%', fontSize: 9, color: '#4b5563' }}>
                                                {dueDate.toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            </Text>
                                            <Text style={{ width: '35%', fontSize: 9, fontWeight: 'bold', color: '#374151', textAlign: 'right' }}>{formatMoney(amt)}</Text>
                                        </View>
                                    );
                                })}
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 2, borderTopColor: '#7c3aed' }}>
                                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#6b21a8' }}>TOTAL FINANCIADO:</Text>
                                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#6b21a8' }}>{formatMoney(financed)}</Text>
                                </View>
                            </View>
                        </View>
                        );
                    })()}
                </View>

                <View style={styles.pageFooter} fixed>
                    <Text style={styles.footerText}>
                        {isQuotation
                            ? `Documento válido desde ${validityRange?.from ?? '—'} hasta ${validityRange?.until ?? '—'}. Precios sujetos a cambios sin previo aviso. Stock sujeto a venta final.`
                            : "SOLO SE ACEPTAN CAMBIOS Y DEVOLUCIONES EN UN PLAZO DE 24 HORAS. La garantía cubre defectos de fábrica, no cubre mala manipulación o instalación incorrecta."
                        }
                    </Text>
                </View>

                <Text style={{ position: 'absolute', bottom: 10, right: 20, fontSize: 8, color: '#9CA3AF' }} render={({ pageNumber, totalPages }) => (
                    `${pageNumber} / ${totalPages}`
                )} fixed />
            </Page>
        </Document>
    );
};

export default ReceiptDocument;
