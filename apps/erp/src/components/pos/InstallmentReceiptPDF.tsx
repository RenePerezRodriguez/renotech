import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { Installment } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { formatUserName } from '@/utils/formatUserName';

function ensureDate(val: Date | Timestamp | { seconds: number } | undefined): Date {
    if (!val) return new Date();
    if (val instanceof Date) return val;
    if (val instanceof Timestamp) return val.toDate();
    if ('seconds' in val) return new Date(val.seconds * 1000);
    return new Date();
}

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
    headerContainer: {
        backgroundColor: '#0f172a',
        paddingHorizontal: 30,
        paddingVertical: 15,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 3,
        borderBottomColor: '#7c3aed',
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
        color: '#a78bfa',
        fontWeight: 'bold',
        letterSpacing: 2,
        marginTop: -2,
    },
    headerRight: {
        alignItems: 'flex-end',
    },
    headerMainTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    headerId: {
        fontSize: 12,
        color: '#c4b5fd',
        marginTop: 2,
    },
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
        backgroundColor: '#7c3aed',
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
    sectionTitle: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#6b21a8',
        letterSpacing: 2,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 5,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    infoLabel: {
        fontSize: 9,
        color: '#6b7280',
        fontWeight: 'bold',
    },
    infoValue: {
        fontSize: 9,
        color: '#0f172a',
        fontWeight: 'bold',
    },
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

export interface InstallmentReceiptProps {
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
    config?: {
        branchName?: string;
        address?: string;
        phone?: string;
        email?: string;
        city?: string;
        nit?: string;
        bankName?: string;
        accountNumber?: string;
        accountType?: string;
        accountHolder?: string;
        qrImageUrl?: string;
    };
}

const formatMoney = (amount: number) =>
    `Bs. ${amount.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const InstallmentReceiptPDF: React.FC<InstallmentReceiptProps> = ({
    installment,
    paidAmount,
    paymentMethod,
    clientName,
    clientNit,
    paidCuotas,
    pendingCuotas,
    totalDebtRemaining,
    nextDueDate,
    branchName,
    cashierName,
    notes,
    config,
}) => {
    const now = new Date();
    const receiptId = `COB-${installment.id?.slice(-8).toUpperCase() || 'N/A'}`;
    const dueDate = ensureDate(installment.dueDate);
    const totalCuotas = installment.installmentsTotal;
    const progressPercent = Math.min(100, Math.round((paidCuotas / totalCuotas) * 100));
    const saleTotal = installment.saleTotal || installment.totalAmount;

    const formattedDate = now.toLocaleDateString('es-BO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return (
        <Document>
            <Page size="LETTER" style={styles.page}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src="/logo.png" style={styles.watermark} />

                {/* Header */}
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
                        <Text style={styles.headerMainTitle}>COBRO DE CUOTA</Text>
                        <Text style={styles.headerId}>#{receiptId}</Text>
                    </View>
                </View>

                <View style={styles.body}>
                    {/* Company + Client */}
                    <View style={styles.infoGrid}>
                        <View style={styles.companyInfo}>
                            <Text style={styles.companyName}>{config?.branchName || branchName || 'RENOTECH'}</Text>
                            {config?.address && <Text style={styles.companyDetail}>Dirección: {config.address}</Text>}
                            {config?.city && <Text style={styles.companyDetail}>{config.city}</Text>}
                            {config?.phone && <Text style={styles.companyDetail}>{config.phone}</Text>}
                            {config?.email && <Text style={styles.companyDetail}>{config.email}</Text>}
                        </View>

                        <View style={styles.clientBox}>
                            <View style={styles.clientBoxHeader}>
                                <Text style={styles.clientBoxTitle}>DATOS DEL CLIENTE</Text>
                                <Text style={styles.clientBoxDate}>FECHA COBRO: {formattedDate}</Text>
                            </View>
                            <View style={styles.clientBoxDivider} />
                            <View style={styles.clientBoxBody}>
                                <View style={styles.clientRow}>
                                    <Text style={styles.clientLabel}>CLIENTE:</Text>
                                    <Text style={styles.clientValue}>{clientName.toUpperCase()}</Text>
                                    <Text style={styles.clientLabel}>NIT/CI:</Text>
                                    <Text style={styles.clientValue}>{clientNit || '0'}</Text>
                                </View>
                                <View style={styles.clientRow}>
                                    <Text style={styles.clientLabel}>MÉTODO:</Text>
                                    <Text style={styles.clientValue}>{paymentMethod}</Text>
                                    <Text style={styles.clientLabel}>CUOTA:</Text>
                                    <Text style={styles.clientValue}>{installment.installmentNumber}/{installment.installmentsTotal}</Text>
                                </View>
                                {cashierName && (
                                    <View style={{ marginTop: 8 }}>
                                        <View style={styles.clientRow}>
                                            <Text style={styles.clientLabel}>COBRADO:</Text>
                                            <Text style={styles.clientValue}>{formatUserName(cashierName)}</Text>
                                        </View>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>

                    {/* Sale Reference */}
                    <View style={{ marginBottom: 15 }}>
                        <Text style={styles.sectionTitle}>Referencia de Venta</Text>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Venta:</Text>
                            <Text style={styles.infoValue}>VEN-{installment.saleId?.slice(-8).toUpperCase() || 'N/A'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Total venta:</Text>
                            <Text style={styles.infoValue}>{formatMoney(saleTotal)}</Text>
                        </View>
                        {installment.productsSummary && (
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Productos:</Text>
                                <Text style={[styles.infoValue, { maxWidth: 300 }]}>{installment.productsSummary}</Text>
                            </View>
                        )}
                        {installment.adelanto != null && installment.adelanto > 0 && (
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Adelanto pagado:</Text>
                                <Text style={[styles.infoValue, { color: '#059669' }]}>{formatMoney(installment.adelanto)}</Text>
                            </View>
                        )}
                    </View>

                    {/* Cuota Detail Table */}
                    <View style={{
                        flexDirection: 'row',
                        backgroundColor: '#0f172a',
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                    }}>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#FFFFFF', width: '15%' }}>CUOTA</Text>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#FFFFFF', width: '25%' }}>VENCIMIENTO</Text>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#FFFFFF', width: '20%', textAlign: 'right' }}>MONTO</Text>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#FFFFFF', width: '20%', textAlign: 'right' }}>COBRADO</Text>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#FFFFFF', width: '20%', textAlign: 'right' }}>ESTADO</Text>
                    </View>

                    <View style={{
                        flexDirection: 'row',
                        paddingVertical: 10,
                        paddingHorizontal: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: '#f3f4f6',
                        backgroundColor: '#f5f3ff',
                    }}>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#6b21a8', width: '15%' }}>
                            {installment.installmentNumber}/{installment.installmentsTotal}
                        </Text>
                        <Text style={{ fontSize: 9, color: '#374151', width: '25%' }}>
                            {dueDate.toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </Text>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#374151', width: '20%', textAlign: 'right' }}>
                            {formatMoney(installment.amount)}
                        </Text>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#059669', width: '20%', textAlign: 'right' }}>
                            {formatMoney(paidAmount)}
                        </Text>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: paidAmount >= installment.remainingBalance ? '#059669' : '#d97706', width: '20%', textAlign: 'right' }}>
                            {paidAmount >= installment.remainingBalance ? 'PAGADA' : 'PARCIAL'}
                        </Text>
                    </View>

                    {notes && (
                        <View style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fafafa', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                            <Text style={{ fontSize: 8, color: '#6b7280' }}>Notas: {notes}</Text>
                        </View>
                    )}

                    {/* Bank Info + Totals */}
                    <View style={styles.footerSection}>
                        <View style={styles.bankBox}>
                            <Text style={styles.bankTitle}>INFORMACIÓN BANCARIA</Text>
                            <View style={{ marginTop: 5 }}>
                                {config?.bankName && (
                                    <>
                                        <Text style={styles.bankDetail}>{config.bankName} {config?.accountType ? `- ${config.accountType}` : ''}</Text>
                                        <Text style={[styles.bankDetail, { fontWeight: 'bold', fontSize: 10 }]}>
                                            {config?.accountNumber || ''} {config?.accountHolder ? `- ${config.accountHolder}` : ''}
                                        </Text>
                                    </>
                                )}
                                {config?.qrImageUrl && (
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
                                        <Text style={styles.bankNote}>* Escanee para pagar por QR</Text>
                                        {/* eslint-disable-next-line jsx-a11y/alt-text */}
                                        <Image src={config.qrImageUrl} style={styles.bankQrImage} />
                                    </View>
                                )}
                                <Text style={styles.bankNote}>* Conserve este comprobante como constancia de pago.</Text>
                            </View>
                        </View>

                        <View style={styles.totalsBox}>
                            <View style={styles.totalRow}>
                                <Text style={styles.totalLabel}>MONTO CUOTA:</Text>
                                <Text style={styles.totalValue}>{formatMoney(installment.amount)}</Text>
                            </View>
                            <View style={styles.totalRow}>
                                <Text style={[styles.totalLabel, { color: '#059669' }]}>COBRADO:</Text>
                                <Text style={[styles.totalValue, { color: '#059669' }]}>{formatMoney(paidAmount)}</Text>
                            </View>
                            {paidAmount < installment.remainingBalance && (
                                <View style={styles.totalRow}>
                                    <Text style={[styles.totalLabel, { color: '#d97706' }]}>RESTANTE:</Text>
                                    <Text style={[styles.totalValue, { color: '#d97706' }]}>{formatMoney(installment.remainingBalance - paidAmount)}</Text>
                                </View>
                            )}
                            <View style={styles.grandTotalRow}>
                                <Text style={styles.grandTotalLabel}>TOTAL COBRADO:</Text>
                                <Text style={styles.grandTotalValue}>{formatMoney(paidAmount)}</Text>
                            </View>
                        </View>
                    </View>

                    {/* Progress Bar */}
                    <View style={{ marginTop: 20 }}>
                        <Text style={styles.sectionTitle}>Progreso del Plan de Cuotas</Text>
                        <View style={{
                            height: 10,
                            backgroundColor: '#f3f4f6',
                            borderRadius: 5,
                            overflow: 'hidden',
                            marginTop: 4,
                            marginBottom: 8,
                        }}>
                            <View style={{
                                height: 10,
                                backgroundColor: '#7c3aed',
                                borderRadius: 5,
                                width: `${progressPercent}%`,
                            }} />
                        </View>
                        <Text style={{ fontSize: 9, color: '#6b7280', textAlign: 'center', marginBottom: 10 }}>
                            {paidCuotas} de {totalCuotas} cuotas pagadas ({progressPercent}%)
                        </Text>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <View>
                                <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 2 }}>Deuda total restante</Text>
                                <Text style={{ fontSize: 14, fontWeight: 'bold', color: totalDebtRemaining <= 0 ? '#059669' : '#0f172a' }}>
                                    {totalDebtRemaining <= 0 ? 'LIQUIDADO' : formatMoney(totalDebtRemaining)}
                                </Text>
                            </View>
                            {nextDueDate && pendingCuotas > 0 && (
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ fontSize: 8, color: '#6b7280', marginBottom: 2 }}>Próximo vencimiento</Text>
                                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#0f172a' }}>
                                        {nextDueDate.toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </Text>
                                </View>
                            )}
                            {pendingCuotas === 0 && (
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#059669' }}>DEUDA SALDADA</Text>
                                    <Text style={{ fontSize: 8, color: '#059669' }}>Todas las cuotas pagadas</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

                {/* Fixed Footer */}
                <View style={styles.pageFooter} fixed>
                    <Text style={styles.footerText}>
                        Conserve este comprobante como constancia de pago. Documento sin valor fiscal.
                    </Text>
                </View>
            </Page>
        </Document>
    );
};

export default InstallmentReceiptPDF;
