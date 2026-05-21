import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { Pedido, AppConfig } from '@/types';
import { formatDate, formatDateTime } from '@/utils/dateHelpers';
import { ExportPedidoItem, PedidoExportFilters } from '@/services/PedidoExportService';
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
    pageTicket: {
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        padding: 8,
        fontFamily: 'Helvetica',
    },
    body: {
        paddingHorizontal: 28,
        paddingTop: 14,
        paddingBottom: 24,
        flexGrow: 1,
    },
    metaBox: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
        paddingBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    routeText: { fontSize: 9, color: '#0f172a', fontWeight: 'bold' },
    routeSub: { fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
    rightMeta: { fontSize: 8, color: '#475569', textAlign: 'right' },
    obsBox: {
        marginTop: 6,
        padding: 6,
        backgroundColor: '#fef3c7',
        borderLeftWidth: 3,
        borderLeftColor: '#f59e0b',
    },
    obsText: { fontSize: 9, color: '#78350f' },
    table: { borderWidth: 1, borderColor: '#cbd5e1' },
    headRow: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 4,
        paddingHorizontal: 4,
    },
    th: { fontSize: 8, color: '#FFFFFF', fontWeight: 'bold', textTransform: 'uppercase' },
    row: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
        paddingVertical: 4,
        paddingHorizontal: 4,
        minHeight: 38,
    },
    rowAlt: { backgroundColor: '#f8fafc' },
    cntCell: {
        width: 50,
        alignItems: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
        borderRightColor: '#e2e8f0',
        paddingRight: 2,
    },
    cntText: { fontSize: 22, fontWeight: 'bold', color: '#0f172a' },
    cntLabel: { fontSize: 6, color: '#64748b', textTransform: 'uppercase' },
    productCell: { flex: 1, paddingHorizontal: 4 },
    histCell: {
        width: 160,
        borderLeftWidth: 1,
        borderLeftColor: '#e2e8f0',
        paddingLeft: 4,
    },
    productLine1: { fontSize: 9, fontWeight: 'bold', color: '#0f172a' },
    productLine2: { fontSize: 7, color: '#475569', marginTop: 1 },
    productLine3: { fontSize: 7, color: '#0c4a6e', marginTop: 2, fontWeight: 'bold' },
    productNotes: { fontSize: 7, color: '#92400e', marginTop: 1, fontStyle: 'italic' },
    histTitle: { fontSize: 6, color: '#64748b', textTransform: 'uppercase', marginBottom: 1 },
    histRow: { fontSize: 7, color: '#1e293b', marginBottom: 1 },
    histEmpty: { fontSize: 7, color: '#94a3b8', fontStyle: 'italic' },
    footerLine: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingTop: 4,
        borderTopWidth: 1,
        borderTopColor: '#cbd5e1',
    },
    footerText: { fontSize: 7, color: '#64748b' },
    pageFooter: {
        position: 'absolute',
        bottom: 12,
        left: 28,
        right: 28,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    pageFooterText: { fontSize: 6, color: '#94a3b8' },

    // ===== Ticket 80mm =====
    ticketHeader: {
        alignItems: 'center',
        marginBottom: 6,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomStyle: 'dashed',
        borderBottomColor: '#000',
    },
    ticketBrand: { fontSize: 11, fontWeight: 'bold', color: '#000' },
    ticketTitle: { fontSize: 9, fontWeight: 'bold', color: '#000', marginTop: 2 },
    ticketCode: { fontSize: 10, fontWeight: 'bold', color: '#000', marginTop: 1 },
    ticketMeta: { fontSize: 7, color: '#000', textAlign: 'center', marginTop: 1 },
    ticketSep: {
        borderBottomWidth: 1,
        borderBottomStyle: 'dashed',
        borderBottomColor: '#000',
        marginVertical: 4,
    },
    ticketRouteLine: { fontSize: 8, color: '#000', marginBottom: 1 },
    ticketObs: { fontSize: 7, color: '#000', marginVertical: 3, fontStyle: 'italic' },
    ticketItem: { marginBottom: 5 },
    ticketItemHead: { flexDirection: 'row', justifyContent: 'space-between' },
    ticketQty: { fontSize: 11, fontWeight: 'bold', color: '#000' },
    ticketCode2: { fontSize: 8, fontWeight: 'bold', color: '#000', flex: 1, marginLeft: 4 },
    ticketName: { fontSize: 8, color: '#000' },
    ticketSmall: { fontSize: 7, color: '#000' },
    ticketTotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
        paddingTop: 3,
        borderTopWidth: 1,
        borderTopStyle: 'dashed',
        borderTopColor: '#000',
    },
    ticketTotalText: { fontSize: 8, fontWeight: 'bold', color: '#000' },
    ticketFooter: { fontSize: 6, color: '#000', textAlign: 'center', marginTop: 6 },
});

interface Props {
    pedido: Pedido;
    items: ExportPedidoItem[];
    filters: PedidoExportFilters;
    config?: AppConfig;
}

const formatMoney = (n?: number) => {
    if (n === undefined || n === null || isNaN(n)) return '—';
    return n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const PedidoExportPDF: React.FC<Props> = ({ pedido, items, filters, config }) => {
    const fechaCreacion = (pedido.createdAt as { toDate?: () => Date })?.toDate?.();
    const totalUnits = items.reduce((s, i) => s + (i.quantity || 0), 0);
    const showHistory = filters.showHistory;
    const showCosts = filters.showCosts;

    const pageSize: 'A4' | 'LETTER' | [number, number] =
        filters.paperSize === 'A4' ? 'A4'
        : filters.paperSize === 'TICKET80' ? [226, 800] // 80mm
        : 'LETTER';

    const isTicket = filters.paperSize === 'TICKET80';

    if (isTicket) {
        return (
            <Document>
                <Page size={pageSize} style={styles.pageTicket}>
                    <View style={styles.ticketHeader}>
                        {filters.showLogo && config?.companyName && (
                            <Text style={styles.ticketBrand}>{config.companyName}</Text>
                        )}
                        <Text style={styles.ticketTitle}>PEDIDO INTER-SUCURSAL</Text>
                        <Text style={styles.ticketCode}>{pedido.codigo}</Text>
                        <Text style={styles.ticketMeta}>
                            {fechaCreacion ? formatDateTime(fechaCreacion) : ''}
                        </Text>
                        <Text style={styles.ticketMeta}>
                            Estado: {(STATUS_LABEL[pedido.status] || pedido.status).toUpperCase()}
                        </Text>
                    </View>

                    <Text style={styles.ticketRouteLine}>
                        <Text style={{ fontWeight: 'bold' }}>Solicita: </Text>{pedido.fromBranchName}
                    </Text>
                    <Text style={styles.ticketRouteLine}>
                        <Text style={{ fontWeight: 'bold' }}>Despacha: </Text>{pedido.toBranchName}
                    </Text>

                    {filters.includeNotes && pedido.notas && (
                        <Text style={styles.ticketObs}>OBS: {pedido.notas}</Text>
                    )}

                    <View style={styles.ticketSep} />

                    {items.map((it, idx) => (
                        <View key={it.id || idx} style={styles.ticketItem} wrap={false}>
                            <View style={styles.ticketItemHead}>
                                <Text style={styles.ticketQty}>{it.quantity}x</Text>
                                <Text style={styles.ticketCode2}>
                                    {it.productCode || '—'}
                                    {it.productMarca ? ` — ${it.productMarca}` : ''}
                                </Text>
                            </View>
                            <Text style={styles.ticketName}>
                                {it.productName}
                                {it.productCategoria ? ` · ${it.productCategoria}` : ''}
                            </Text>
                            {showCosts && (
                                <Text style={styles.ticketSmall}>
                                    Costo: Bs {formatMoney(it.productCosto)}
                                    {'  '}S/F: Bs {formatMoney(it.productPrecioSinFactura)}
                                </Text>
                            )}
                            {showCosts && (
                                <Text style={styles.ticketSmall}>
                                    C/F: Bs {formatMoney(it.productPrecioConFactura)}
                                </Text>
                            )}
                            {filters.includeNotes && it.notas && (
                                <Text style={styles.ticketSmall}>Nota: {it.notas}</Text>
                            )}
                            {showHistory && it.history.length > 0 && (
                                <>
                                    <Text style={[styles.ticketSmall, { marginTop: 2, fontWeight: 'bold' }]}>
                                        Últimas compras:
                                    </Text>
                                    {it.history.slice(0, filters.historyCount).map((h, i) => (
                                        <Text key={i} style={styles.ticketSmall}>
                                            {formatDate(h.date)} · Bs {formatMoney(h.cost)}
                                        </Text>
                                    ))}
                                </>
                            )}
                        </View>
                    ))}

                    <View style={styles.ticketTotalRow}>
                        <Text style={styles.ticketTotalText}>Ítems: {items.length}</Text>
                        <Text style={styles.ticketTotalText}>Unid: {totalUnits}</Text>
                    </View>

                    <Text style={styles.ticketFooter}>
                        Generado {formatDateTime(new Date())}
                    </Text>
                </Page>
            </Document>
        );
    }

    return (
        <Document>
            <Page size={pageSize} style={styles.page}>
                <PdfBrandHeader
                    title="PEDIDO INTER-SUCURSAL"
                    documentId={pedido.codigo}
                    subtitle={pedido.fromBranchName}
                    statusLabel={STATUS_LABEL[pedido.status] || pedido.status}
                />
                <View style={styles.body}>
                {/* Meta: ruta + fecha */}
                <View style={styles.metaBox}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.routeSub}>Solicita</Text>
                        <Text style={styles.routeText}>{pedido.fromBranchName}</Text>
                        <Text style={[styles.routeSub, { marginTop: 4 }]}>Despacha</Text>
                        <Text style={styles.routeText}>{pedido.toBranchName}</Text>
                    </View>
                    <View>
                        <Text style={styles.rightMeta}>
                            {fechaCreacion ? formatDateTime(fechaCreacion) : ''}
                        </Text>
                        <Text style={styles.rightMeta}>
                            {items.length} ítems · {totalUnits} unid.
                        </Text>
                        {filters.showLogo && config?.companyName && (
                            <Text style={[styles.rightMeta, { fontWeight: 'bold', marginTop: 2 }]}>
                                {config.companyName}
                            </Text>
                        )}
                    </View>
                </View>
                {filters.includeNotes && pedido.notas && (
                    <View style={styles.obsBox}>
                        <Text style={styles.obsText}>OBS: {pedido.notas}</Text>
                    </View>
                )}

                {/* Tabla */}
                <View style={styles.table}>
                    <View style={styles.headRow}>
                        <Text style={[styles.th, { width: 50, textAlign: 'center' }]}>CNT</Text>
                        <Text style={[styles.th, { flex: 1, paddingHorizontal: 4 }]}>PRODUCTO</Text>
                        {showHistory && (
                            <Text style={[styles.th, { width: 160, paddingLeft: 4 }]}>HISTORIAL</Text>
                        )}
                    </View>
                    {items.map((it, idx) => (
                        <View key={it.id || idx} style={[styles.row, idx % 2 === 1 ? styles.rowAlt : {}]} wrap={false}>
                            <View style={styles.cntCell}>
                                <Text style={styles.cntText}>{it.quantity}</Text>
                                <Text style={styles.cntLabel}>UNID</Text>
                            </View>
                            <View style={styles.productCell}>
                                <Text style={styles.productLine1}>
                                    {it.productCode || '—'}{it.productMarca ? ` — ${it.productMarca}` : ''}
                                </Text>
                                <Text style={styles.productLine2}>
                                    {it.productName}
                                    {it.productCategoria ? ` · ${it.productCategoria}` : ''}
                                </Text>
                                {showCosts && (
                                    <Text style={styles.productLine3}>
                                        Costo: Bs {formatMoney(it.productCosto)}
                                        {' · '}S/F: Bs {formatMoney(it.productPrecioSinFactura)}
                                        {' · '}C/F: Bs {formatMoney(it.productPrecioConFactura)}
                                    </Text>
                                )}
                                {it.productDescripcion && (
                                    <Text style={styles.productLine2}>{it.productDescripcion}</Text>
                                )}
                                {filters.includeNotes && it.notas && (
                                    <Text style={styles.productNotes}>Nota: {it.notas}</Text>
                                )}
                            </View>
                            {showHistory && (
                                <View style={styles.histCell}>
                                    <Text style={styles.histTitle}>Últimas compras (HQ)</Text>
                                    {it.history.length === 0 && (
                                        <Text style={styles.histEmpty}>Sin registros</Text>
                                    )}
                                    {it.history.slice(0, filters.historyCount).map((h, i) => (
                                        <Text key={i} style={styles.histRow}>
                                            {formatDate(h.date)} · Bs {formatMoney(h.cost)}
                                            {'\n'}
                                            {h.supplierName.length > 32 ? h.supplierName.slice(0, 32) + '…' : h.supplierName}
                                        </Text>
                                    ))}
                                </View>
                            )}
                        </View>
                    ))}
                </View>

                <View style={styles.footerLine}>
                    <Text style={styles.footerText}>Total ítems: {items.length}</Text>
                    <Text style={styles.footerText}>Total unidades: {totalUnits}</Text>
                </View>
                </View>

                <View style={styles.pageFooter} fixed>
                    <Text style={styles.pageFooterText}>
                        {pedido.codigo} · Generado {formatDateTime(new Date())}
                    </Text>
                    <Text style={styles.pageFooterText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
};

export default PedidoExportPDF;
