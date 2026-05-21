/**
 * SessionClosePDF — Informe de Cierre de Caja PDF.
 * Estilo premium (header #0f172a + acento amarillo/dorado) adaptado
 * para mostrar el resumen, el balance financiero de caja y el desglose de efectivo.
 */
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { CashierSession, AppConfig } from '@/types';
import { ensureDate } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';

const STATUS_LABELS: Record<string, string> = {
    OPEN: 'ABIERTA',
    CLOSED: 'CERRADA',
    FORCE_CLOSED: 'CIERRE FORZADO',
    BLOCKED: 'BLOQUEADA POR DISCREPANCIA',
};

const SEVERITY_LABELS: Record<string, string> = {
    NONE: 'SIN DIFERENCIA',
    TOLERATED: 'TOLERADA',
    MEDIUM: 'DIFERENCIA MEDIA',
    HIGH: 'DIFERENCIA ALTA',
    CRITICAL: 'CRÍTICA',
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
        opacity: 0.03,
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
    headerMainTitle: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
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
        letterSpacing: 1,
    },
    // ─── Body ─────────────────────────────────────────────
    body: { paddingHorizontal: 30, paddingTop: 18, paddingBottom: 40 },
    // Info grid (cajero + detalles)
    infoGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
    cajeroCol: { width: '45%' },
    labelHeader: {
        fontSize: 7,
        fontWeight: 'bold',
        color: '#64748b',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    cajeroName: { fontSize: 13, fontWeight: 'bold', color: '#0f172a', marginBottom: 3 },
    cajeroDetail: { fontSize: 8, color: '#4b5563', marginBottom: 2 },
    // Details box
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
    detailsHeaderTitle: { fontSize: 8, fontWeight: 'bold', color: '#0f172a' },
    detailsDivider: { height: 1, backgroundColor: '#eab308', marginHorizontal: 10 },
    detailsBody: { padding: 8 },
    detailRow: { flexDirection: 'row', marginBottom: 4 },
    detailLabel: { fontSize: 7.5, fontWeight: 'bold', color: '#4b5563', width: 90 },
    detailValue: { fontSize: 7.5, color: '#0f172a', flex: 1 },
    // Section headers
    sectionTitle: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#0f172a',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginTop: 15,
        marginBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#cbd5e1',
        paddingBottom: 2,
    },
    // ─── Tables ───────────────────────────────────────────
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        paddingVertical: 6,
        paddingHorizontal: 10,
    },
    th: { fontSize: 7.5, fontWeight: 'bold', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5 },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
        paddingVertical: 6,
        paddingHorizontal: 10,
    },
    tableRowEven: { backgroundColor: '#f9fafb' },
    td: { fontSize: 8, color: '#374151' },
    // Column widths for close sheet comparison
    colMethod: { width: '30%' },
    colExpected: { width: '22%', textAlign: 'right' },
    colDeclared: { width: '22%', textAlign: 'right' },
    colDiff: { width: '26%', textAlign: 'right' },
    
    // Column widths for cash denominations breakdown
    colDenom: { width: '30%' },
    colDenomQty: { width: '35%', textAlign: 'center' },
    colDenomSub: { width: '35%', textAlign: 'right' },
    
    // ─── Footer section ───────────────────────────────────
    footerSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 15,
    },
    notesBox: {
        width: '55%',
        backgroundColor: '#fffbeb',
        borderRadius: 8,
        padding: 8,
        borderWidth: 1,
        borderColor: '#fde68a',
    },
    notesTitle: { fontSize: 8, fontWeight: 'bold', color: '#92400e', marginBottom: 3 },
    notesText: { fontSize: 7.5, color: '#78350f', lineHeight: 1.4 },
    alertBox: {
        width: '55%',
        backgroundColor: '#fef2f2',
        borderRadius: 8,
        padding: 8,
        borderWidth: 1,
        borderColor: '#fecaca',
    },
    alertTitle: { fontSize: 8, fontWeight: 'bold', color: '#991b1b', marginBottom: 3 },
    alertText: { fontSize: 7.5, color: '#7f1d1d', lineHeight: 1.4 },
    // Summary card on right
    summaryCard: {
        width: '40%',
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 8,
        alignItems: 'stretch',
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 3,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    summaryLabel: { fontSize: 8, color: '#475569' },
    summaryValue: { fontSize: 8, fontWeight: 'bold', color: '#0f172a' },
    grandSummaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 5,
        marginTop: 4,
    },
    grandSummaryLabel: { fontSize: 10, fontWeight: 'bold', color: '#0f172a' },
    grandSummaryValue: { fontSize: 11, fontWeight: 'bold', color: '#0f172a' },
    // ─── Signatures ───────────────────────────────────────
    signatures: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 35,
        paddingHorizontal: 10,
    },
    sigBox: {
        width: '45%',
        borderTopWidth: 1,
        borderTopColor: '#94a3b8',
        paddingTop: 5,
        alignItems: 'center',
    },
    sigLabel: { fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
    sigName: { fontSize: 7.5, color: '#1e293b', marginTop: 1, fontWeight: 'bold' },
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
    session: CashierSession;
    config?: AppConfig;
}

const SessionClosePDF: React.FC<Props> = ({ session, config }) => {
    const openedAt = session.openedAt ? ensureDate(session.openedAt) : null;
    const closedAt = session.closedAt ? ensureDate(session.closedAt) : null;

    const formattedOpened = openedAt
        ? openedAt.toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';
    const formattedClosed = closedAt
        ? closedAt.toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

    const documentId = `SES-${session.id?.slice(-6).toUpperCase() || 'N/A'}`;
    const statusLabel = STATUS_LABELS[session.status] || session.status;
    const severityLabel = SEVERITY_LABELS[session.discrepancySeverity || ''] || 'SIN DETECTAR';

    const formatMoney = (n: number) =>
        `Bs. ${n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const expCash = session.closingExpected?.EFECTIVO ?? 0;
    const expQR = session.closingExpected?.QR ?? 0;
    const expTrans = session.closingExpected?.TRANSFERENCIA ?? 0;
    const expTotal = expCash + expQR + expTrans;

    const decCash = session.closingDeclared?.EFECTIVO ?? 0;
    const decQR = session.closingDeclared?.QR ?? 0;
    const decTrans = session.closingDeclared?.TRANSFERENCIA ?? 0;
    const decTotal = decCash + decQR + decTrans;

    const diffCash = session.closingDifference?.EFECTIVO ?? 0;
    const diffQR = session.closingDifference?.QR ?? 0;
    const diffTrans = session.closingDifference?.TRANSFERENCIA ?? 0;
    const diffTotal = session.closingDifference?.total ?? (decTotal - expTotal);

    // Obtener denominaciones ordenadas de mayor a menor
    const denomsList = session.closingDenominations
        ? Object.entries(session.closingDenominations)
            .map(([valStr, qty]) => ({ value: parseFloat(valStr), qty }))
            .sort((a, b) => b.value - a.value)
            .filter(d => d.qty > 0)
        : [];

    return (
        <Document>
            <Page size="LETTER" style={styles.page}>
                <Image src="/logo.png" style={styles.watermark} />

                {/* ── Header ── */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Image src="/logo.png" style={styles.headerLogo} />
                        <View style={styles.logoTextContainer}>
                            <Text style={styles.logoTitle}>RENOTECH</Text>
                            <Text style={styles.logoSubtitle}>REPUESTOS Y ACCESORIOS</Text>
                        </View>
                    </View>
                    <View style={styles.headerRight}>
                        <Text style={styles.headerMainTitle}>INFORME DE CIERRE DE CAJA</Text>
                        <Text style={styles.headerId}>{documentId}</Text>
                        <Text style={styles.headerSub}>Cierre: {formattedClosed}</Text>
                        <Text style={[
                            styles.statusPill,
                            session.status === 'BLOCKED' ? { backgroundColor: '#ef4444', color: '#FFFFFF' } : {},
                            session.status === 'FORCE_CLOSED' ? { backgroundColor: '#f97316', color: '#FFFFFF' } : {}
                        ]}>
                            {statusLabel}
                        </Text>
                    </View>
                </View>

                <View style={styles.body}>
                    {/* ── Info Grid ── */}
                    <View style={styles.infoGrid}>
                        {/* Cajero / Sucursal */}
                        <View style={styles.cajeroCol}>
                            <Text style={styles.labelHeader}>Responsable del Turno</Text>
                            <Text style={styles.cajeroName}>{formatUserName(session.cashierName)}</Text>
                            {config?.branchName && (
                                <Text style={styles.cajeroDetail}>Sucursal: {config.branchName}</Text>
                            )}
                            <Text style={styles.cajeroDetail}>Cajón Físico ID: #{session.cashDrawerId.slice(0, 12).toUpperCase()}</Text>
                            {session.closedByName && (
                                <Text style={styles.cajeroDetail}>Cerrado por: {formatUserName(session.closedByName)} ({session.closedByRole})</Text>
                            )}
                        </View>

                        {/* Tiempos y Parametros */}
                        <View style={styles.detailsBox}>
                            <View style={styles.detailsHeader}>
                                <Text style={styles.detailsHeaderTitle}>DATOS OPERATIVOS</Text>
                            </View>
                            <View style={styles.detailsDivider} />
                            <View style={styles.detailsBody}>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>APERTURA:</Text>
                                    <Text style={styles.detailValue}>{formattedOpened}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>SALDO INICIAL:</Text>
                                    <Text style={styles.detailValue}>{formatMoney(session.openingTotal)}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>CIERRE REGISTRADO:</Text>
                                    <Text style={styles.detailValue}>{formattedClosed}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>DISCREPANCIA:</Text>
                                    <Text style={[
                                        styles.detailValue,
                                        { fontWeight: 'bold' },
                                        session.discrepancySeverity !== 'NONE' && session.discrepancySeverity !== 'TOLERATED'
                                            ? { color: '#dc2626' }
                                            : { color: '#16a34a' }
                                    ]}>
                                        {severityLabel}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* ── Cuadre Financiero ── */}
                    <Text style={styles.sectionTitle}>Cuadre Financiero General</Text>
                    <View style={styles.tableHeader}>
                        <Text style={[styles.th, styles.colMethod]}>Método de Pago</Text>
                        <Text style={[styles.th, styles.colExpected]}>Esperado (Sistema)</Text>
                        <Text style={[styles.th, styles.colDeclared]}>Declarado (Cajero)</Text>
                        <Text style={[styles.th, styles.colDiff]}>Diferencia</Text>
                    </View>

                    {/* Efectivo */}
                    <View style={styles.tableRow}>
                        <Text style={[styles.td, styles.colMethod, { fontWeight: 'bold' }]}>Efectivo (Cajón Físico)</Text>
                        <Text style={[styles.td, styles.colExpected]}>{formatMoney(expCash)}</Text>
                        <Text style={[styles.td, styles.colDeclared]}>{formatMoney(decCash)}</Text>
                        <Text style={[
                            styles.td, styles.colDiff, { fontWeight: 'bold' },
                            diffCash > 0.01 ? { color: '#16a34a' } : diffCash < -0.01 ? { color: '#ef4444' } : {}
                        ]}>
                            {diffCash > 0.01 ? '+' : ''}{formatMoney(diffCash)}
                        </Text>
                    </View>

                    {/* QR */}
                    <View style={[styles.tableRow, styles.tableRowEven]}>
                        <Text style={[styles.td, styles.colMethod, { fontWeight: 'bold' }]}>Código QR (Digital)</Text>
                        <Text style={[styles.td, styles.colExpected]}>{formatMoney(expQR)}</Text>
                        <Text style={[styles.td, styles.colDeclared]}>{formatMoney(decQR)}</Text>
                        <Text style={[
                            styles.td, styles.colDiff, { fontWeight: 'bold' },
                            diffQR > 0.01 ? { color: '#16a34a' } : diffQR < -0.01 ? { color: '#ef4444' } : {}
                        ]}>
                            {diffQR > 0.01 ? '+' : ''}{formatMoney(diffQR)}
                        </Text>
                    </View>

                    {/* Transferencia */}
                    <View style={styles.tableRow}>
                        <Text style={[styles.td, styles.colMethod, { fontWeight: 'bold' }]}>Transferencia Bancaria</Text>
                        <Text style={[styles.td, styles.colExpected]}>{formatMoney(expTrans)}</Text>
                        <Text style={[styles.td, styles.colDeclared]}>{formatMoney(decTrans)}</Text>
                        <Text style={[
                            styles.td, styles.colDiff, { fontWeight: 'bold' },
                            diffTrans > 0.01 ? { color: '#16a34a' } : diffTrans < -0.01 ? { color: '#ef4444' } : {}
                        ]}>
                            {diffTrans > 0.01 ? '+' : ''}{formatMoney(diffTrans)}
                        </Text>
                    </View>

                    {/* Total */}
                    <View style={[styles.tableRow, { backgroundColor: '#f1f5f9', borderBottomWidth: 2, borderBottomColor: '#0f172a' }]}>
                        <Text style={[styles.td, styles.colMethod, { fontWeight: 'bold', color: '#0f172a' }]}>TOTAL NETO DE CIERRE</Text>
                        <Text style={[styles.td, styles.colExpected, { fontWeight: 'bold', color: '#0f172a' }]}>{formatMoney(expTotal)}</Text>
                        <Text style={[styles.td, styles.colDeclared, { fontWeight: 'bold', color: '#0f172a' }]}>{formatMoney(decTotal)}</Text>
                        <Text style={[
                            styles.td, styles.colDiff, { fontWeight: 'bold' },
                            diffTotal > 0.01 ? { color: '#16a34a', fontSize: 9.5 } : diffTotal < -0.01 ? { color: '#ef4444', fontSize: 9.5 } : { color: '#0f172a' }
                        ]}>
                            {diffTotal > 0.01 ? '+' : ''}{formatMoney(diffTotal)}
                        </Text>
                    </View>

                    {/* ── Desglose de Efectivo ── */}
                    {denomsList.length > 0 && (
                        <View style={{ marginTop: 10 }}>
                            <Text style={styles.sectionTitle}>Desglose de Efectivo Declarado</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 15 }}>
                                <View style={{ width: '100%', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
                                    <View style={[styles.tableHeader, { backgroundColor: '#334155' }]}>
                                        <Text style={[styles.th, styles.colDenom]}>Denominación (BOB)</Text>
                                        <Text style={[styles.th, styles.colDenomQty]}>Cantidad Declarada</Text>
                                        <Text style={[styles.th, styles.colDenomSub]}>Subtotal</Text>
                                    </View>
                                    {denomsList.map((item, idx) => {
                                        const denomSubtotal = item.value * item.qty;
                                        return (
                                            <View key={idx} style={[styles.tableRow, idx % 2 === 0 ? styles.tableRowEven : {}]}>
                                                <Text style={[styles.td, styles.colDenom, { fontWeight: 'bold' }]}>
                                                    Bs. {item.value >= 1 ? item.value : item.value.toFixed(2)} {item.value >= 10 ? '(Billete)' : '(Moneda)'}
                                                </Text>
                                                <Text style={[styles.td, styles.colDenomQty]}>{item.qty} u.</Text>
                                                <Text style={[styles.td, styles.colDenomSub]}>{formatMoney(denomSubtotal)}</Text>
                                            </View>
                                        );
                                    })}
                                    <View style={[styles.tableRow, { backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: '#cbd5e1' }]}>
                                        <Text style={[styles.td, styles.colDenom, { fontWeight: 'bold', color: '#334155' }]}>Total en Efectivo</Text>
                                        <Text style={[styles.td, styles.colDenomQty]} />
                                        <Text style={[styles.td, styles.colDenomSub, { fontWeight: 'bold', color: '#334155', fontSize: 9 }]}>
                                            {formatMoney(decCash)}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* ── Footer Section ── */}
                    <View style={styles.footerSection}>
                        {/* Alertas o Notas de Cierre */}
                        {session.status === 'BLOCKED' && session.blockedReason ? (
                            <View style={styles.alertBox}>
                                <Text style={styles.alertTitle}>MOTIVO DE BLOQUEO (SISTEMA)</Text>
                                <Text style={styles.alertText}>{session.blockedReason}</Text>
                                {session.closingNotes && (
                                    <Text style={[styles.alertText, { marginTop: 4, fontStyle: 'italic' }]}>
                                        Notas del cajero: "{session.closingNotes}"
                                    </Text>
                                )}
                            </View>
                        ) : session.closingNotes ? (
                            <View style={styles.notesBox}>
                                <Text style={styles.notesTitle}>NOTAS Y OBSERVACIONES DE CIERRE</Text>
                                <Text style={styles.notesText}>{session.closingNotes}</Text>
                            </View>
                        ) : (
                            <View style={[styles.notesBox, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                                <Text style={[styles.notesTitle, { color: '#475569' }]}>NOTAS OPERATIVAS</Text>
                                <Text style={[styles.notesText, { color: '#475569' }]}>
                                    El presente informe constituye un registro de auditoría del balance de caja del turno correspondiente. 
                                    Los saldos de efectivo declarados fueron cuadradas automáticamente contra el flujo de transacciones del cajón.
                                </Text>
                            </View>
                        )}

                        {/* Resumen Final Tarjeta */}
                        <View style={styles.summaryCard}>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Saldo Inicial:</Text>
                                <Text style={styles.summaryValue}>{formatMoney(session.openingTotal)}</Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Total Declarado:</Text>
                                <Text style={styles.summaryValue}>{formatMoney(decTotal)}</Text>
                            </View>
                            <View style={styles.grandSummaryRow}>
                                <Text style={styles.grandSummaryLabel}>DIFERENCIA:</Text>
                                <Text style={[
                                    styles.grandSummaryValue,
                                    diffTotal > 0.01 ? { color: '#16a34a' } : diffTotal < -0.01 ? { color: '#ef4444' } : { color: '#0f172a' }
                                ]}>
                                    {diffTotal > 0.01 ? '+' : ''}{formatMoney(diffTotal)}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* ── Signatures ── */}
                    <View style={styles.signatures}>
                        <View style={styles.sigBox}>
                            <Text style={styles.sigLabel}>Cajero Responsable</Text>
                            <Text style={styles.sigName}>{formatUserName(session.cashierName).toUpperCase()}</Text>
                        </View>
                        <View style={styles.sigBox}>
                            <Text style={styles.sigLabel}>Verificación / Gerencia</Text>
                            <Text style={styles.sigName}>
                                {session.closedByName
                                    ? formatUserName(session.closedByName).toUpperCase()
                                    : '___________________________'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ── Page Footer ── */}
                <View style={styles.pageFooter} fixed>
                    <Text style={styles.footerText}>
                        {(config?.branchName || 'RENOTECH').toUpperCase()} · Reporte Interno de Arqueo y Cierre de Caja · {formattedClosed}
                    </Text>
                    <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
};

export default SessionClosePDF;
