import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { Envio, EnvioItem, AppConfig } from '@/types';
import { formatDateTime } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';
import PdfBrandHeader from '@/components/common/pdf/PdfBrandHeader';

const STATUS_LABEL: Record<string, string> = {
    preparacion: 'En preparación',
    en_transito: 'En tránsito',
    recibido: 'Recibido',
    cancelado_devolucion: 'Cancelado (devolución)',
    cancelado_perdida: 'Cancelado (pérdida)',
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
    // Route
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
    routeName: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    // Info grid
    infoGrid: {
        flexDirection: 'row',
        marginBottom: 14,
        gap: 10,
    },
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
    // Section header
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
    // Table
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
    tableRowAlt: {
        backgroundColor: '#fafafa',
    },
    td: { fontSize: 8, color: '#1e293b' },
    tdMuted: { fontSize: 8, color: '#64748b' },
    colCode: { width: '14%' },
    colDesc: { width: '46%' },
    colDescNoRec: { width: '56%' },
    colQty: { width: '10%', textAlign: 'right' },
    colExtra: { width: '10%', textAlign: 'center' },
    extraTag: {
        fontSize: 6,
        color: '#92400e',
        backgroundColor: '#fef3c7',
        paddingHorizontal: 3,
        paddingVertical: 1,
        borderRadius: 2,
        textAlign: 'center',
    },
    diffNeg: { color: '#dc2626', fontWeight: 'bold' },
    diffPos: { color: '#059669', fontWeight: 'bold' },
    // Totals
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
    // Notes
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
    // Discrepancy banner
    discBanner: {
        marginTop: 12,
        padding: 8,
        borderWidth: 1,
        borderRadius: 4,
    },
    discTitle: {
        fontSize: 8,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 3,
    },
    discText: { fontSize: 8, lineHeight: 1.4 },
    // Footer / signatures
    footerArea: {
        marginTop: 'auto',
        paddingTop: 24,
    },
    signatures: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 28,
    },
    sigBox: {
        width: '30%',
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
    sigName: {
        fontSize: 8,
        color: '#1e293b',
        marginTop: 1,
    },
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
        fontSize: 6,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },
    pageFooterText: { fontSize: 6, color: '#94a3b8' },
});

interface Props {
    envio: Envio;
    items: EnvioItem[];
    config?: AppConfig;
}

const EnvioGuidePDF: React.FC<Props> = ({ envio, items, config }) => {
    const fechaCreacion = (envio.createdAt as { toDate?: () => Date })?.toDate?.();
    const fechaDespacho = (envio.despachadoAt as { toDate?: () => Date })?.toDate?.();
    const fechaRecepcion = (envio.recibidoAt as { toDate?: () => Date })?.toDate?.();

    const totalPed = items.reduce((s, i) => s + (i.qtyPedida || 0), 0);
    const totalEnv = items.reduce((s, i) => s + (i.qtyEnviada || 0), 0);
    const totalRec = items.reduce((s, i) => s + (i.qtyRecibida || 0), 0);
    const showRec = envio.status === 'recibido' || items.some(i => i.qtyRecibida != null);

    return (
        <Document>
            <Page size="LETTER" style={styles.page}>
                {/* Header */}
                <PdfBrandHeader
                    title="GUÍA DE ENVÍO"
                    documentId={envio.codigo}
                    subtitle="Inter-sucursal"
                    statusLabel={STATUS_LABEL[envio.status] || envio.status}
                />

                <View style={styles.body}>
                {/* Route */}
                <View style={styles.routeBox}>
                    <View style={styles.routeCol}>
                        <Text style={styles.routeLabel}>Origen (despacha)</Text>
                        <Text style={styles.routeName}>{envio.fromBranchName}</Text>
                    </View>
                    <Text style={styles.routeArrow}>→</Text>
                    <View style={styles.routeCol}>
                        <Text style={styles.routeLabel}>Destino (recibe)</Text>
                        <Text style={styles.routeName}>{envio.toBranchName}</Text>
                    </View>
                </View>

                {/* Info grid */}
                <View style={styles.infoGrid}>
                    <View style={styles.infoCol}>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Pedido:</Text>
                            <Text style={styles.infoValue}>{envio.pedidoId || (envio.isDirect ? 'Envío directo' : '—')}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Creado:</Text>
                            <Text style={styles.infoValue}>{fechaCreacion ? formatDateTime(fechaCreacion) : '—'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Por:</Text>
                            <Text style={styles.infoValue}>{formatUserName(envio.createdByName || '').toUpperCase()}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Despacho:</Text>
                            <Text style={styles.infoValue}>{fechaDespacho ? formatDateTime(fechaDespacho) : '—'}{envio.despachadoByName ? `  ·  ${formatUserName(envio.despachadoByName).toUpperCase()}` : ''}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Recepción:</Text>
                            <Text style={styles.infoValue}>{fechaRecepcion ? formatDateTime(fechaRecepcion) : '—'}{envio.recibidoByName ? `  ·  ${formatUserName(envio.recibidoByName).toUpperCase()}` : ''}</Text>
                        </View>
                    </View>
                    <View style={styles.infoCol}>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Transporte:</Text>
                            <Text style={styles.infoValue}>{envio.transportMethod || '—'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Pago flete:</Text>
                            <Text style={styles.infoValue}>{envio.transportPaymentType || '—'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Costo:</Text>
                            <Text style={styles.infoValue}>{envio.transportCost != null ? `Bs. ${envio.transportCost.toFixed(2)}` : '—'}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Ítems:</Text>
                            <Text style={styles.infoValue}>{items.length}  ·  {totalEnv} unid.</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Discrepancia:</Text>
                            <Text style={styles.infoValue}>
                                {envio.hasDiscrepancy
                                    ? envio.discrepancyStatus === 'approved' ? 'Aprobada' :
                                      envio.discrepancyStatus === 'rejected' ? 'Rechazada' : 'Pendiente'
                                    : 'No'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Items */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionText}>Detalle de ítems</Text>
                </View>
                <View style={styles.tableHeader}>
                    <Text style={[styles.th, styles.colCode]}>Código</Text>
                    <Text style={[styles.th, showRec ? styles.colDesc : styles.colDescNoRec]}>Descripción</Text>
                    <Text style={[styles.th, styles.colQty]}>Pedida</Text>
                    <Text style={[styles.th, styles.colQty]}>Enviada</Text>
                    {showRec && <Text style={[styles.th, styles.colQty]}>Recibida</Text>}
                    <Text style={[styles.th, styles.colExtra]}>Tipo</Text>
                </View>
                {items.map((it, idx) => {
                    const diff = (it.qtyRecibida ?? it.qtyEnviada) - it.qtyEnviada;
                    return (
                        <View key={it.id || idx} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                            <Text style={[styles.td, styles.colCode]}>{it.productCode || '—'}</Text>
                            <Text style={[styles.td, showRec ? styles.colDesc : styles.colDescNoRec]}>{it.productName}</Text>
                            <Text style={[styles.tdMuted, styles.colQty]}>{it.esExtra ? '—' : it.qtyPedida}</Text>
                            <Text style={[styles.td, styles.colQty]}>{it.qtyEnviada}</Text>
                            {showRec && (
                                <Text style={[styles.td, styles.colQty, diff !== 0 ? (diff > 0 ? styles.diffPos : styles.diffNeg) : {}]}>
                                    {it.qtyRecibida ?? '—'}
                                </Text>
                            )}
                            <Text style={[styles.colExtra]}>
                                {it.esExtra ? <Text style={styles.extraTag}>EXTRA</Text> : <Text style={styles.tdMuted}>Pedido</Text>}
                            </Text>
                        </View>
                    );
                })}

                {/* Totals */}
                <View style={styles.totalsRow}>
                    <Text style={[styles.totalsLabel, styles.colCode]}> </Text>
                    <Text style={[styles.totalsLabel, showRec ? styles.colDesc : styles.colDescNoRec]}>Totales</Text>
                    <Text style={[styles.totalsValue, styles.colQty]}>{totalPed}</Text>
                    <Text style={[styles.totalsValue, styles.colQty]}>{totalEnv}</Text>
                    {showRec && <Text style={[styles.totalsValue, styles.colQty]}>{totalRec}</Text>}
                    <Text style={[styles.colExtra]}> </Text>
                </View>

                {/* Notas */}
                {envio.notas ? (
                    <View style={styles.notesBox}>
                        <Text style={styles.notesTitle}>Notas del envío</Text>
                        <Text style={styles.notesText}>{envio.notas}</Text>
                    </View>
                ) : null}

                {/* Discrepancia */}
                {envio.hasDiscrepancy && (
                    <View style={[
                        styles.discBanner,
                        envio.discrepancyStatus === 'approved'
                            ? { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' }
                            : envio.discrepancyStatus === 'rejected'
                            ? { borderColor: '#e2e8f0', backgroundColor: '#f8fafc' }
                            : { borderColor: '#fecaca', backgroundColor: '#fef2f2' }
                    ]}>
                        <Text style={[
                            styles.discTitle,
                            envio.discrepancyStatus === 'approved' ? { color: '#065f46' }
                            : envio.discrepancyStatus === 'rejected' ? { color: '#475569' }
                            : { color: '#991b1b' }
                        ]}>
                            Discrepancia {envio.discrepancyStatus === 'approved' ? 'aprobada' : envio.discrepancyStatus === 'rejected' ? 'rechazada' : 'pendiente'}
                        </Text>
                        <Text style={[styles.discText, { color: '#334155' }]}>
                            Enviadas: {totalEnv}  ·  Recibidas: {totalRec}
                            {envio.discrepancyResolvedByName ? `  ·  Resuelto por ${formatUserName(envio.discrepancyResolvedByName).toUpperCase()}` : ''}
                        </Text>
                        {envio.discrepancyResolutionNote ? (
                            <Text style={[styles.discText, { color: '#475569', marginTop: 3, fontStyle: 'italic' }]}>
                                “{envio.discrepancyResolutionNote}”
                            </Text>
                        ) : null}
                    </View>
                )}

                {/* Firmas */}
                <View style={styles.footerArea}>
                    <View style={styles.signatures}>
                        <View style={styles.sigBox}>
                            <Text style={styles.sigLabel}>Despacha</Text>
                            <Text style={styles.sigName}>{envio.despachadoByName ? formatUserName(envio.despachadoByName).toUpperCase() : ''}</Text>
                        </View>
                        <View style={styles.sigBox}>
                            <Text style={styles.sigLabel}>Transporta</Text>
                            <Text style={styles.sigName}> </Text>
                        </View>
                        <View style={styles.sigBox}>
                            <Text style={styles.sigLabel}>Recibe</Text>
                            <Text style={styles.sigName}>{envio.recibidoByName ? formatUserName(envio.recibidoByName).toUpperCase() : ''}</Text>
                        </View>
                    </View>
                </View>
                </View>

                {/* Page footer */}
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

export default EnvioGuidePDF;
