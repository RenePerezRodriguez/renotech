/**
 * PurchasePDF — Orden de Compra en PDF.
 * Mismo estilo premium (header #0f172a + acento amarillo) que ReceiptPDF,
 * adaptado para los campos de Purchase / PurchaseItem.
 */
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { Purchase, PurchaseItem, AppConfig } from '@/types';
import { numberToSpanishWords } from '@/utils/numberToSpanishWords';
import { ensureDate } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';

const PAYMENT_LABELS: Record<string, string> = {
    EFECTIVO: 'Efectivo (descontó caja)',
    TRANSFERENCIA: 'Transferencia bancaria',
    QR: 'Pago QR',
    CREDITO: 'Crédito a proveedor',
};

const styles = StyleSheet.create({
    page: {
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        padding: 0,
        paddingBottom: 60,
        fontFamily: 'Helvetica',
    },
    watermark: {
        position: 'absolute',
        top: 280,
        left: 130,
        width: 300,
        height: 300,
        opacity: 0.04,
        transform: 'rotate(-45deg)',
        zIndex: -1,
    },
    // ─── Header ───────────────────────────────────────────
    header: {
        backgroundColor: '#0f172a',
        paddingHorizontal: 30,
        paddingVertical: 15,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 3,
        borderBottomColor: '#eab308',
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    headerLogo: { width: 50, height: 50, objectFit: 'contain' },
    logoTextContainer: { flexDirection: 'column' },
    logoTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 1 },
    logoSubtitle: { fontSize: 9, color: '#eab308', fontWeight: 'bold', letterSpacing: 2, marginTop: -2 },
    headerRight: { alignItems: 'flex-end' },
    headerMainTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
    headerId: { fontSize: 12, color: '#eab308', marginTop: 3, fontWeight: 'bold', letterSpacing: 1 },
    headerSub: { fontSize: 8, color: '#cbd5e1', marginTop: 2, letterSpacing: 0.5 },
    statusPill: {
        marginTop: 5,
        fontSize: 7,
        fontWeight: 'bold',
        color: '#0f172a',
        backgroundColor: '#eab308',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 3,
        letterSpacing: 1.2,
    },
    // ─── Body ─────────────────────────────────────────────
    body: { paddingHorizontal: 30, paddingTop: 18, paddingBottom: 40 },
    // Info grid (proveedor + detalles)
    infoGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
    supplierCol: { width: '45%' },
    supplierLabel: {
        fontSize: 7,
        fontWeight: 'bold',
        color: '#64748b',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    supplierName: { fontSize: 14, fontWeight: 'bold', color: '#0f172a', marginBottom: 3 },
    supplierDetail: { fontSize: 9, color: '#4b5563', marginBottom: 2 },
    // Details box (right side)
    detailsBox: {
        width: '50%',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
    },
    detailsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#f9fafb',
    },
    detailsHeaderTitle: { fontSize: 9, fontWeight: 'bold', color: '#0f172a' },
    detailsHeaderDate: { fontSize: 7, color: '#4b5563' },
    detailsDivider: { height: 1, backgroundColor: '#eab308', marginHorizontal: 10 },
    detailsBody: { padding: 10 },
    detailRow: { flexDirection: 'row', marginBottom: 4 },
    detailLabel: { fontSize: 8, fontWeight: 'bold', color: '#4b5563', width: 80 },
    detailValue: { fontSize: 8, color: '#0f172a', flex: 1 },
    // ─── Table ────────────────────────────────────────────
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 8,
        paddingHorizontal: 10,
        marginTop: 4,
    },
    th: { fontSize: 8, fontWeight: 'bold', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5 },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
        paddingVertical: 8,
        paddingHorizontal: 10,
    },
    tableRowEven: { backgroundColor: '#f9fafb' },
    td: { fontSize: 8, color: '#374151' },
    colIdx:     { width: '5%' },
    colCode:    { width: '13%' },
    colDesc:    { width: '42%' },
    colQty:     { width: '10%', textAlign: 'center' },
    colUnit:    { width: '15%', textAlign: 'right' },
    colSubtotal:{ width: '15%', textAlign: 'right' },
    // ─── Footer section ───────────────────────────────────
    footerSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
    },
    notesBox: {
        width: '55%',
        backgroundColor: '#fffbeb',
        borderRadius: 8,
        padding: 10,
        borderWidth: 1,
        borderColor: '#fde68a',
    },
    notesTitle: { fontSize: 9, fontWeight: 'bold', color: '#92400e', marginBottom: 4 },
    notesText: { fontSize: 8, color: '#78350f', lineHeight: 1.5 },
    paymentBox: {
        width: '55%',
        backgroundColor: '#f0fdf4',
        borderRadius: 8,
        padding: 10,
        borderWidth: 1,
        borderColor: '#bbf7d0',
    },
    paymentTitle: { fontSize: 9, fontWeight: 'bold', color: '#166534', marginBottom: 4 },
    paymentDetail: { fontSize: 8, color: '#166534', marginBottom: 2 },
    totalsBox: { width: '40%', alignItems: 'flex-end' },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    totalLabel: { fontSize: 10, color: '#6b7280' },
    totalValue: { fontSize: 10, fontWeight: 'bold', color: '#0f172a' },
    grandTotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingVertical: 8,
        marginTop: 5,
        borderBottomWidth: 2,
        borderBottomColor: '#0f172a',
    },
    grandTotalLabel: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
    grandTotalValue: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
    // ─── Signatures ───────────────────────────────────────
    signatures: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 32,
        paddingHorizontal: 10,
    },
    sigBox: {
        width: '40%',
        borderTopWidth: 1,
        borderTopColor: '#94a3b8',
        paddingTop: 5,
        alignItems: 'center',
    },
    sigLabel: { fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
    sigName: { fontSize: 8, color: '#1e293b', marginTop: 1 },
    // ─── Page footer ──────────────────────────────────────
    pageFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingVertical: 8,
        paddingHorizontal: 30,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    footerText: { fontSize: 7, color: '#9ca3af' },
});

interface Props {
    purchase: Purchase;
    items: PurchaseItem[];
    config?: AppConfig;
}

const PurchasePDF: React.FC<Props> = ({ purchase, items, config }) => {
    const purchaseDate = ensureDate(purchase.date);
    const formattedDate = purchaseDate.toLocaleDateString('es-BO', {
        year: 'numeric', month: 'long', day: 'numeric',
    });
    const formattedTime = purchaseDate.toLocaleTimeString('es-BO', {
        hour: '2-digit', minute: '2-digit',
    });

    const documentId = `COM-${purchase.id?.slice(-6).toUpperCase() || 'N/A'}`;
    const statusLabel = purchase.status === 'RECEIVED' ? 'RECIBIDA' : 'PENDIENTE';
    const paymentLabel = PAYMENT_LABELS[purchase.paymentMethod || ''] || (purchase.paymentMethod || 'Sin método');

    const total = purchase.total || 0;
    const totalItems = items.reduce((s, i) => s + (i.quantity || 0), 0);

    const formatMoney = (n: number) =>
        `Bs. ${n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <Document>
            <Page size="LETTER" style={styles.page}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src="/logo.png" style={styles.watermark} />

                {/* ── Header ── */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        {/* eslint-disable-next-line jsx-a11y/alt-text */}
                        <Image src="/logo.png" style={styles.headerLogo} />
                        <View style={styles.logoTextContainer}>
                            <Text style={styles.logoTitle}>RENOTECH</Text>
                            <Text style={styles.logoSubtitle}>REPUESTOS Y ACCESORIOS</Text>
                        </View>
                    </View>
                    <View style={styles.headerRight}>
                        <Text style={styles.headerMainTitle}>ORDEN DE COMPRA</Text>
                        <Text style={styles.headerId}>{documentId}</Text>
                        <Text style={styles.headerSub}>{formattedDate} — {formattedTime}</Text>
                        <Text style={styles.statusPill}>{statusLabel}</Text>
                    </View>
                </View>

                <View style={styles.body}>
                    {/* ── Info Grid ── */}
                    <View style={styles.infoGrid}>
                        {/* Proveedor */}
                        <View style={styles.supplierCol}>
                            <Text style={styles.supplierLabel}>Proveedor</Text>
                            <Text style={styles.supplierName}>{purchase.supplierName}</Text>
                            {config?.branchName && (
                                <Text style={styles.supplierDetail}>Sucursal: {config.branchName}</Text>
                            )}
                            {config?.address && (
                                <Text style={styles.supplierDetail}>Dir: {config.address}</Text>
                            )}
                            {config?.phone && (
                                <Text style={styles.supplierDetail}>Tel: {config.phone}</Text>
                            )}
                        </View>

                        {/* Detalles */}
                        <View style={styles.detailsBox}>
                            <View style={styles.detailsHeader}>
                                <Text style={styles.detailsHeaderTitle}>DETALLES DE LA COMPRA</Text>
                                <Text style={styles.detailsHeaderDate}>{formattedDate}</Text>
                            </View>
                            <View style={styles.detailsDivider} />
                            <View style={styles.detailsBody}>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>RESPONSABLE:</Text>
                                    <Text style={styles.detailValue}>
                                        {purchase.usuarioNombre
                                            ? formatUserName(purchase.usuarioNombre).toUpperCase()
                                            : 'SISTEMA'}
                                    </Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>PAGO:</Text>
                                    <Text style={styles.detailValue}>{paymentLabel.toUpperCase()}</Text>
                                </View>
                                {purchase.paymentReference && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>REFERENCIA:</Text>
                                        <Text style={styles.detailValue}>{purchase.paymentReference}</Text>
                                    </View>
                                )}
                                {purchase.dueDate && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>VENCE:</Text>
                                        <Text style={[styles.detailValue, { color: '#dc2626' }]}>
                                            {ensureDate(purchase.dueDate as Date).toLocaleDateString('es-BO')}
                                        </Text>
                                    </View>
                                )}
                                <View style={[styles.detailRow, { marginTop: 6 }]}>
                                    <Text style={styles.detailLabel}>ÍTEMS:</Text>
                                    <Text style={styles.detailValue}>{items.length} productos · {totalItems} unid.</Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* ── Products Table ── */}
                    <View style={styles.tableHeader}>
                        <Text style={[styles.th, styles.colIdx]}>#</Text>
                        <Text style={[styles.th, styles.colCode]}>CÓDIGO</Text>
                        <Text style={[styles.th, styles.colDesc]}>DESCRIPCIÓN</Text>
                        <Text style={[styles.th, styles.colQty]}>CANT.</Text>
                        <Text style={[styles.th, styles.colUnit]}>COSTO UNIT.</Text>
                        <Text style={[styles.th, styles.colSubtotal]}>SUBTOTAL</Text>
                    </View>

                    {items.map((item, idx) => {
                        const subtotal = item.subtotal ?? (item.cost || 0) * (item.quantity || 0);
                        return (
                            <View key={item.id || idx} style={[styles.tableRow, idx % 2 === 0 ? styles.tableRowEven : {}]}>
                                <Text style={[styles.td, styles.colIdx]}>{idx + 1}</Text>
                                <Text style={[styles.td, styles.colCode]}>{item.productCode || 'S/C'}</Text>
                                <Text style={[styles.td, styles.colDesc]}>{item.productName}</Text>
                                <Text style={[styles.td, styles.colQty]}>{item.quantity}</Text>
                                <Text style={[styles.td, styles.colUnit]}>{formatMoney(item.cost || 0)}</Text>
                                <Text style={[styles.td, styles.colSubtotal]}>{formatMoney(subtotal)}</Text>
                            </View>
                        );
                    })}

                    {/* ── Footer Section ── */}
                    <View style={styles.footerSection}>
                        {/* Notas o caja de pago */}
                        {purchase.notes ? (
                            <View style={styles.notesBox}>
                                <Text style={styles.notesTitle}>NOTAS DE LA COMPRA</Text>
                                <Text style={styles.notesText}>{purchase.notes}</Text>
                            </View>
                        ) : (
                            <View style={styles.paymentBox}>
                                <Text style={styles.paymentTitle}>MÉTODO DE PAGO</Text>
                                <Text style={styles.paymentDetail}>{paymentLabel}</Text>
                                {purchase.paymentReference && (
                                    <Text style={styles.paymentDetail}>Ref: {purchase.paymentReference}</Text>
                                )}
                                <Text style={[styles.paymentDetail, { marginTop: 4, fontSize: 7, color: '#166534', fontStyle: 'italic' }]}>
                                    * Documento de compra interno. Conservar para auditoría.
                                </Text>
                            </View>
                        )}

                        {/* Totales */}
                        <View style={styles.totalsBox}>
                            <View style={styles.totalRow}>
                                <Text style={styles.totalLabel}>PRODUCTOS:</Text>
                                <Text style={styles.totalValue}>{items.length}</Text>
                            </View>
                            <View style={styles.totalRow}>
                                <Text style={styles.totalLabel}>UNIDADES:</Text>
                                <Text style={styles.totalValue}>{totalItems}</Text>
                            </View>
                            <View style={styles.grandTotalRow}>
                                <Text style={styles.grandTotalLabel}>TOTAL:</Text>
                                <Text style={styles.grandTotalValue}>{formatMoney(total)}</Text>
                            </View>
                            <Text style={{ fontSize: 7, color: '#4b5563', marginTop: 8, fontWeight: 'bold' }}>
                                SON: {numberToSpanishWords(total)}
                            </Text>
                        </View>
                    </View>

                    {/* ── Firmas ── */}
                    <View style={styles.signatures}>
                        <View style={styles.sigBox}>
                            <Text style={styles.sigLabel}>Responsable de compra</Text>
                            <Text style={styles.sigName}>
                                {purchase.usuarioNombre
                                    ? formatUserName(purchase.usuarioNombre).toUpperCase()
                                    : '___________________________'}
                            </Text>
                        </View>
                        <View style={styles.sigBox}>
                            <Text style={styles.sigLabel}>Recibido / Gerencia</Text>
                            <Text style={styles.sigName}>___________________________</Text>
                        </View>
                    </View>
                </View>

                {/* ── Page Footer ── */}
                <View style={styles.pageFooter} fixed>
                    <Text style={styles.footerText}>
                        {(config?.branchName || 'RENOTECH').toUpperCase()} · Documento interno de compras · {formattedDate}
                    </Text>
                    <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
};

export default PurchasePDF;
