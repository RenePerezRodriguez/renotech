import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { Installment, InstallmentPaymentHistory } from '@/types';
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
        top: 260,
        left: 150,
        width: 300,
        height: 300,
        opacity: 0.04,
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
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
        paddingHorizontal: 10,
    },
    tableCellHeader: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    tableCell: {
        fontSize: 8,
        color: '#374151',
    },
    historyRow: {
        flexDirection: 'row',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    historyCell: {
        fontSize: 8,
        color: '#374151',
    },
    footerSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
    },
    totalsBox: {
        width: '45%',
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
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
        paddingHorizontal: 30,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
    },
    footerText: {
        fontSize: 8,
        color: '#6b7280',
        textAlign: 'center',
    },
});

interface CreditReceiptProps {
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

const CreditReceiptPDF: React.FC<CreditReceiptProps> = ({ credit, paymentHistory, branchName, config }) => {
    const now = new Date();
    const receiptId = `CRED-${credit.saleId?.slice(-8).toUpperCase()}`;
    const dueDate = credit.nextDueDate ? ensureDate(credit.nextDueDate) : new Date();
    const formattedDate = now.toLocaleDateString('es-BO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const sortedInstallments = [...credit.installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
    const sortedHistory = [...paymentHistory].sort((a, b) => ensureDate(b.date).getTime() - ensureDate(a.date).getTime());

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
                            <Text style={styles.logoSubtitle}>ESTADO DE CUENTA</Text>
                        </View>
                    </View>
                    <View style={styles.headerRight}>
                        <Text style={styles.headerMainTitle}>RECIBO DE DEUDA</Text>
                        <Text style={styles.headerId}>#{receiptId}</Text>
                    </View>
                </View>

                <View style={styles.body}>
                    <View style={styles.infoGrid}>
                        <View style={styles.companyInfo}>
                            <Text style={styles.companyName}>{config?.branchName || branchName || 'RENOTECH'}</Text>
                            {config?.address && <Text style={styles.companyDetail}>Dirección: {config.address}</Text>}
                            {config?.city && <Text style={styles.companyDetail}>{config.city}</Text>}
                            {config?.phone && <Text style={styles.companyDetail}>Teléfono: {config.phone}</Text>}
                            {config?.email && <Text style={styles.companyDetail}>{config.email}</Text>}
                        </View>
                        <View style={styles.clientBox}>
                            <View style={styles.clientBoxHeader}>
                                <Text style={styles.clientBoxTitle}>DATOS DEL CLIENTE</Text>
                                <Text style={styles.clientBoxDate}>FECHA EMISIÓN: {formattedDate}</Text>
                            </View>
                            <View style={styles.clientBoxDivider} />
                            <View style={styles.clientBoxBody}>
                                <View style={styles.clientRow}>
                                    <Text style={styles.clientLabel}>CLIENTE:</Text>
                                    <Text style={styles.clientValue}>{credit.clientName.toUpperCase()}</Text>
                                </View>
                                <View style={styles.clientRow}>
                                    <Text style={styles.clientLabel}>NIT/CI:</Text>
                                    <Text style={styles.clientValue}>{credit.clientNit || 'Sin registro'}</Text>
                                </View>
                                <View style={styles.clientRow}>
                                    <Text style={styles.clientLabel}>VENTA:</Text>
                                    <Text style={styles.clientValue}>VEN-{credit.saleId?.slice(-8).toUpperCase()}</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <View style={{ marginBottom: 15 }}>
                        <Text style={styles.sectionTitle}>Resumen del Crédito</Text>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Total venta:</Text>
                            <Text style={styles.infoValue}>{formatMoney(credit.saleTotal)}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Deuda restante:</Text>
                            <Text style={styles.infoValue}>{formatMoney(credit.totalRemaining)}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Cuotas pagadas:</Text>
                            <Text style={styles.infoValue}>{credit.paidCount}/{credit.totalInstallments}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Cuotas pendientes:</Text>
                            <Text style={styles.infoValue}>{credit.pendingCount}/{credit.totalInstallments}</Text>
                        </View>
                        {credit.adelanto != null && credit.adelanto > 0 && (
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Adelanto:</Text>
                                <Text style={[styles.infoValue, { color: '#059669' }]}>{formatMoney(credit.adelanto)}</Text>
                            </View>
                        )}
                    </View>

                    <View style={{ marginBottom: 12 }}>
                        <Text style={styles.sectionTitle}>Cuotas del Plan</Text>
                        <View style={styles.tableHeader}>
                            <Text style={[styles.tableCellHeader, { width: '15%' }]}>#</Text>
                            <Text style={[styles.tableCellHeader, { width: '30%' }]}>VENCIMIENTO</Text>
                            <Text style={[styles.tableCellHeader, { width: '20%', textAlign: 'right' }]}>MONTO</Text>
                            <Text style={[styles.tableCellHeader, { width: '20%', textAlign: 'right' }]}>RESTANTE</Text>
                            <Text style={[styles.tableCellHeader, { width: '15%', textAlign: 'right' }]}>ESTADO</Text>
                        </View>
                        {sortedInstallments.map(inst => (
                            <View key={inst.id} style={styles.tableRow}>
                                <Text style={[styles.tableCell, { width: '15%' }]}>{inst.installmentNumber}/{inst.installmentsTotal}</Text>
                                <Text style={[styles.tableCell, { width: '30%' }]}>{ensureDate(inst.dueDate).toLocaleDateString('es-BO')}</Text>
                                <Text style={[styles.tableCell, { width: '20%', textAlign: 'right' }]}>{formatMoney(inst.amount)}</Text>
                                <Text style={[styles.tableCell, { width: '20%', textAlign: 'right' }]}>{formatMoney(inst.remainingBalance)}</Text>
                                <Text style={[styles.tableCell, { width: '15%', textAlign: 'right' }]}>{inst.status === 'PAID' ? 'Pagada' : inst.status === 'OVERDUE' ? 'Vencida' : 'Pendiente'}</Text>
                            </View>
                        ))}
                    </View>

                    <View style={{ marginBottom: 12 }}>
                        <Text style={styles.sectionTitle}>Historial de Pagos</Text>
                        {sortedHistory.length === 0 ? (
                            <Text style={{ fontSize: 8, color: '#6b7280' }}>Aún no se han registrado pagos.</Text>
                        ) : (
                            <>
                                <View style={styles.tableHeader}>
                                    <Text style={[styles.tableCellHeader, { width: '18%' }]}>FECHA</Text>
                                    <Text style={[styles.tableCellHeader, { width: '22%' }]}>CUOTA</Text>
                                    <Text style={[styles.tableCellHeader, { width: '18%', textAlign: 'right' }]}>MONTO</Text>
                                    <Text style={[styles.tableCellHeader, { width: '22%' }]}>MÉTODO</Text>
                                    <Text style={[styles.tableCellHeader, { width: '20%', textAlign: 'right' }]}>RECIBIDO</Text>
                                </View>
                                {sortedHistory.map((payment, index) => (
                                    <View key={`${payment.installmentId}-${index}`} style={styles.historyRow}>
                                        <Text style={[styles.historyCell, { width: '18%' }]}>{ensureDate(payment.date).toLocaleDateString('es-BO')}</Text>
                                        <Text style={[styles.historyCell, { width: '22%' }]}>Cuota {payment.installmentNumber}</Text>
                                        <Text style={[styles.historyCell, { width: '18%', textAlign: 'right' }]}>{formatMoney(payment.amount)}</Text>
                                        <Text style={[styles.historyCell, { width: '22%' }]}>{payment.method}</Text>
                                        <Text style={[styles.historyCell, { width: '20%', textAlign: 'right' }]}>{formatUserName(payment.userName)}</Text>
                                    </View>
                                ))}
                            </>
                        )}
                    </View>

                    <View style={styles.footerSection}>
                        <View style={styles.totalsBox}>
                            <View style={styles.totalRow}>
                                <Text style={styles.totalLabel}>Próximo vencimiento</Text>
                                <Text style={styles.totalValue}>{dueDate.toLocaleDateString('es-BO')}</Text>
                            </View>
                            <View style={[styles.totalRow, { marginTop: 4 }]}>
                                <Text style={styles.totalLabel}>Total cuotas</Text>
                                <Text style={styles.totalValue}>{credit.totalInstallments}</Text>
                            </View>
                        </View>
                        <View style={{ width: '45%', alignItems: 'flex-end' }}>
                            <View style={styles.grandTotalRow}>
                                <Text style={styles.grandTotalLabel}>Saldo pendiente</Text>
                                <Text style={styles.grandTotalValue}>{formatMoney(credit.totalRemaining)}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={styles.pageFooter} fixed>
                    <Text style={styles.footerText}>
                        Documento de estado de cuenta actualizado al día. Conserve este reporte para auditoría y seguimiento.
                    </Text>
                </View>
            </Page>
        </Document>
    );
};

export default CreditReceiptPDF;
