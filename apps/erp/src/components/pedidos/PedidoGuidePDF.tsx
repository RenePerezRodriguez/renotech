import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { Pedido, PedidoItem, AppConfig } from '@/types';
import { formatDateTime, formatDate } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';
import PdfBrandHeader from '@/components/common/pdf/PdfBrandHeader';

const STATUS_LABEL: Record<string, string> = {
    borrador: 'Borrador',
    vigente: 'Vigente',
    despachado: 'Despachado',
    cancelado: 'Cancelado',
};

const styles = StyleSheet.create({
    page: {
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        padding: 0,
        paddingBottom: 50,
        fontFamily: 'Helvetica',
    },
    body: {
        paddingHorizontal: 36,
        paddingTop: 18,
        paddingBottom: 30,
        flexGrow: 1,
    },
    routeBox: {
        flexDirection: 'row',
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 4,
        padding: 12,
        marginBottom: 12,
    },
    routeCol: { flex: 1 },
    routeArrow: {
        width: 28,
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        color: '#94a3b8',
        textAlign: 'center',
    },
    routeLabel: {
        fontSize: 7,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        marginBottom: 3,
    },
    routeName: { fontSize: 11, fontWeight: 'bold', color: '#0f172a' },
    infoGrid: { flexDirection: 'row', marginBottom: 14, gap: 10 },
    infoCol: {
        flex: 1,
        backgroundColor: '#fdfdfd',
        borderWidth: 1,
        borderColor: '#f1f5f9',
        borderRadius: 4,
        padding: 8,
    },
    infoRow: { flexDirection: 'row', marginBottom: 3 },
    infoLabel: {
        fontSize: 7,
        color: '#64748b',
        width: 70,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    infoValue: { fontSize: 8, color: '#1e293b', flex: 1 },
    sectionHeader: {
        backgroundColor: '#f8fafc',
        borderLeftWidth: 3,
        borderLeftColor: '#0369a1',
        paddingHorizontal: 6,
        paddingVertical: 4,
        marginBottom: 6,
        marginTop: 4,
    },
    sectionText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#0c4a6e',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 5,
        paddingHorizontal: 4,
    },
    th: {
        fontSize: 7,
        color: '#FFFFFF',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        paddingVertical: 5,
        paddingHorizontal: 4,
    },
    tableRowAlt: { backgroundColor: '#fafafa' },
    td: { fontSize: 8, color: '#1e293b' },
    tdMuted: { fontSize: 8, color: '#64748b' },
    colCode: { width: '14%' },
    colDesc: { width: '50%' },
    colQty: { width: '14%', textAlign: 'center', paddingHorizontal: 6 },
    colNotas: { width: '22%', paddingLeft: 8 },
    totalsRow: {
        flexDirection: 'row',
        marginTop: 8,
        paddingTop: 8,
        paddingHorizontal: 4,
        borderTopWidth: 1,
        borderTopColor: '#cbd5e1',
    },
    totalsLabel: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#0f172a',
        textAlign: 'right',
        textTransform: 'uppercase',
        letterSpacing: 1,
        paddingRight: 6,
    },
    totalsValue: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#0f172a',
        textAlign: 'right',
    },
    notesBox: {
        marginTop: 12,
        padding: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 4,
        backgroundColor: '#fdfdfd',
    },
    notesTitle: {
        fontSize: 7,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 3,
    },
    notesText: { fontSize: 8, color: '#334155', lineHeight: 1.4 },
    footerArea: { marginTop: 'auto', paddingTop: 24 },
    signatures: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 28,
    },
    sigBox: {
        width: '45%',
        borderTopWidth: 1,
        borderTopColor: '#94a3b8',
        paddingTop: 4,
        alignItems: 'center',
    },
    sigLabel: {
        fontSize: 7,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    sigName: { fontSize: 8, color: '#1e293b', marginTop: 1 },
    pageFooter: {
        position: 'absolute',
        bottom: 12,
        left: 36,
        right: 36,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
    },
    pageFooterText: { fontSize: 6, color: '#94a3b8' },
});

interface Props {
    pedido: Pedido;
    items: PedidoItem[];
    config?: AppConfig;
}

const PedidoGuidePDF: React.FC<Props> = ({ pedido, items, config }) => {
    const fechaCreacion = (pedido.createdAt as { toDate?: () => Date })?.toDate?.();
    const fechaRequerida = (pedido.fechaRequerida as { toDate?: () => Date })?.toDate?.();
    const fechaValidacion = (pedido.validatedAt as { toDate?: () => Date })?.toDate?.();
    const totalUnits = items.reduce((s, i) => s + (i.quantity || 0), 0);

    return (
        <Document>
            <Page size="LETTER" style={styles.page}>
                <PdfBrandHeader
                    title="SOLICITUD DE PEDIDO"
                    documentId={pedido.codigo}
                    subtitle="Inter-sucursal"
                    statusLabel={STATUS_LABEL[pedido.status] || pedido.status}
                />

                <View style={styles.body}>
                <View style={styles.routeBox}>
                    <View style={styles.routeCol}>
                        <Text style={styles.routeLabel}>Solicita</Text>
                        <Text style={styles.routeName}>{pedido.fromBranchName}</Text>
                    </View>
                    <Text style={styles.routeArrow}>→</Text>
                    <View style={styles.routeCol}>
                        <Text style={styles.routeLabel}>Despacha</Text>
                        <Text style={styles.routeName}>{pedido.toBranchName}</Text>
                    </View>
                </View>

                <View style={styles.infoGrid}>
                    <View style={styles.infoCol}>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Creado:</Text>
                            <Text style={styles.infoValue}>{fechaCreacion ? formatDateTime(fechaCreacion) : '—'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Por:</Text>
                            <Text style={styles.infoValue}>{formatUserName(pedido.createdByName || '').toUpperCase()}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Requerido:</Text>
                            <Text style={styles.infoValue}>{fechaRequerida ? formatDate(fechaRequerida) : '—'}</Text>
                        </View>
                    </View>
                    <View style={styles.infoCol}>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Validado:</Text>
                            <Text style={styles.infoValue}>{fechaValidacion ? formatDateTime(fechaValidacion) : '—'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Por:</Text>
                            <Text style={styles.infoValue}>{pedido.validatedByName ? formatUserName(pedido.validatedByName).toUpperCase() : '—'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Ítems:</Text>
                            <Text style={styles.infoValue}>{items.length}  ·  {totalUnits} unid.</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Envío:</Text>
                            <Text style={styles.infoValue}>{pedido.envioId || '—'}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionText}>Detalle de ítems solicitados</Text>
                </View>
                <View style={styles.tableHeader}>
                    <Text style={[styles.th, styles.colCode]}>Código</Text>
                    <Text style={[styles.th, styles.colDesc]}>Descripción</Text>
                    <Text style={[styles.th, styles.colQty]}>Cantidad</Text>
                    <Text style={[styles.th, styles.colNotas]}>Notas</Text>
                </View>
                {items.map((it, idx) => (
                    <View key={it.id || idx} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                        <Text style={[styles.td, styles.colCode]}>{it.productCode || '—'}</Text>
                        <Text style={[styles.td, styles.colDesc]}>{it.productName}</Text>
                        <Text style={[styles.td, styles.colQty]}>{it.quantity}</Text>
                        <Text style={[styles.tdMuted, styles.colNotas]}>{it.notas || ''}</Text>
                    </View>
                ))}

                <View style={styles.totalsRow}>
                    <Text style={[styles.totalsLabel, styles.colCode]}> </Text>
                    <Text style={[styles.totalsLabel, styles.colDesc]}>Totales</Text>
                    <Text style={[styles.totalsValue, styles.colQty]}>{totalUnits}</Text>
                    <Text style={[styles.colNotas]}> </Text>
                </View>

                {pedido.notas ? (
                    <View style={styles.notesBox}>
                        <Text style={styles.notesTitle}>Notas del pedido</Text>
                        <Text style={styles.notesText}>{pedido.notas}</Text>
                    </View>
                ) : null}

                <View style={styles.footerArea}>
                    <View style={styles.signatures}>
                        <View style={styles.sigBox}>
                            <Text style={styles.sigLabel}>Solicita</Text>
                            <Text style={styles.sigName}>{formatUserName(pedido.createdByName || '').toUpperCase()}</Text>
                        </View>
                        <View style={styles.sigBox}>
                            <Text style={styles.sigLabel}>Valida / Despacha</Text>
                            <Text style={styles.sigName}>{pedido.validatedByName ? formatUserName(pedido.validatedByName).toUpperCase() : ''}</Text>
                        </View>
                    </View>
                </View>
                </View>

                <View style={styles.pageFooter} fixed>
                    <Text style={styles.pageFooterText}>
                        {(config?.branchName || 'RENOTECH').toUpperCase()}  ·  Documento de carácter interno y logístico  ·  Impreso {formatDateTime(new Date())}
                    </Text>
                    <Text style={styles.pageFooterText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
};

export default PedidoGuidePDF;
