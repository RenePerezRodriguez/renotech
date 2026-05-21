import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { Product } from '@/types';

const styles = StyleSheet.create({
    page: {
        padding: 5,
        backgroundColor: '#FFFFFF',
        flexDirection: 'column',
    },
    container: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
    },
    header: {
        fontSize: 7,
        fontWeight: 'bold',
        color: '#64748b',
        letterSpacing: 2,
        marginBottom: 3,
        textAlign: 'center',
        textTransform: 'uppercase',
    },
    visualSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 4,
    },
    thumbnail: {
        width: 45,
        height: 45,
        borderRadius: 4,
        objectFit: 'cover',
    },
    qrCode: {
        width: 45,
        height: 45,
    },
    name: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#0f172a',
        textAlign: 'center',
        textTransform: 'uppercase',
        marginBottom: 2,
        maxWidth: '100%',
    },
    code: {
        fontSize: 7,
        color: '#64748b',
        fontFamily: 'Helvetica',
        marginBottom: 4,
        textAlign: 'center',
    },
    priceTag: {
        backgroundColor: '#0f172a',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    priceText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold',
        textAlign: 'center',
    }
});

interface ProductQRLabelProps {
    product: Product;
    qrCodeUrl: string;
}

const ProductQRLabelPDF: React.FC<ProductQRLabelProps> = ({ product, qrCodeUrl }) => {
    return (
        <Document>
            <Page size={[170, 113]} style={styles.page}>
                <View style={styles.container}>
                    <Text style={styles.header}>RENOTECH</Text>
                    
                    <View style={styles.visualSection}>
                        {product.imagenUrl && (
                            /* eslint-disable-next-line jsx-a11y/alt-text */
                            <Image src={product.imagenUrl} style={styles.thumbnail} />
                        )}
                        {/* eslint-disable-next-line jsx-a11y/alt-text */}
                        <Image src={qrCodeUrl} style={styles.qrCode} />
                    </View>

                    <Text style={styles.name}>{product.nombre}</Text>
                    <Text style={styles.code}>{product.codigo}</Text>
                    
                    <View style={styles.priceTag}>
                        <Text style={styles.priceText}>Bs. {product.precioSinFactura?.toFixed(2)}</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
};

export default ProductQRLabelPDF;
