import React from 'react';
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer';

const styles = StyleSheet.create({
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
        fontSize: 9,
        color: '#eab308',
        fontWeight: 'bold',
        letterSpacing: 2,
        marginTop: -2,
    },
    headerRight: {
        alignItems: 'flex-end',
    },
    headerMainTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    headerId: {
        fontSize: 11,
        color: '#FFFFFF',
        marginTop: 2,
        fontWeight: 'bold',
    },
    headerSubId: {
        fontSize: 8,
        color: '#cbd5e1',
        marginTop: 2,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    statusPill: {
        marginTop: 6,
        fontSize: 7,
        fontWeight: 'bold',
        color: '#0f172a',
        backgroundColor: '#eab308',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 3,
        textTransform: 'uppercase',
        letterSpacing: 1.2,
    },
});

interface Props {
    /** Texto principal del lado derecho del header (ej: "GUÍA DE ENVÍO") */
    title: string;
    /** Identificador grande (ej: "PED-0001") */
    documentId?: string;
    /** Subtítulo bajo el ID (ej: descripción corta) */
    subtitle?: string;
    /** Estado a mostrar como "pill" amarilla (ej: "VIGENTE") */
    statusLabel?: string;
    /** Subtítulo bajo "RENOTECH" (default: "REPUESTOS Y ACCESORIOS") */
    subBrand?: string;
    /** Ruta al logo (default: /logo.png) */
    logoSrc?: string;
}

const PdfBrandHeader: React.FC<Props> = ({
    title,
    documentId,
    subtitle,
    statusLabel,
    subBrand = 'REPUESTOS Y ACCESORIOS',
    logoSrc = '/logo.png',
}) => (
    <View style={styles.headerContainer}>
        <View style={styles.headerLeft}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={logoSrc} style={styles.headerLogo} />
            <View style={styles.logoTextContainer}>
                <Text style={styles.logoTitle}>RENOTECH</Text>
                <Text style={styles.logoSubtitle}>{subBrand}</Text>
            </View>
        </View>
        <View style={styles.headerRight}>
            <Text style={styles.headerMainTitle}>{title}</Text>
            {documentId ? <Text style={styles.headerId}>{documentId}</Text> : null}
            {subtitle ? <Text style={styles.headerSubId}>{subtitle}</Text> : null}
            {statusLabel ? <Text style={styles.statusPill}>{statusLabel}</Text> : null}
        </View>
    </View>
);

export default PdfBrandHeader;
