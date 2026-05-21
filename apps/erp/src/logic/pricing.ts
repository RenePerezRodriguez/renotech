import { CartItem } from '@/types';

/**
 * Lógica Industrial de Precios y Totales
 * Centraliza la matemática pura del negocio para evitar discrepancias entre el POS y los reportes.
 */
export const PricingLogic = {
    /**
     * Calcula el precio unitario efectivo basado en el modo de facturación y overrides.
     */
    calculateItemUnitPrice(item: CartItem): number {
        // 1. Prioridad Máxima: Precio Fijo (Price Lock)
        if (item.fixedPrice !== undefined) {
            return item.fixedPrice;
        }

        // 2. Selección por modo de facturación (CON_FACTURA / SIN_FACTURA)
        const product = item.product;
        const price = (item.priceMode === 'CON_FACTURA'
            ? (product.precioConFactura ?? product.precioVenta ?? product.precio ?? 0)
            : (product.precioSinFactura ?? product.precioVenta ?? product.precio ?? 0)) as number;

        return Number(price.toFixed(2));
    },

    /**
     * Calcula los totales de un carrito de compras.
     */
    calculateTotals(cart: CartItem[]): { 
        subtotal: number; 
        tax: number; 
        total: number; 
        itemCount: number; 
        discountAmount: number 
    } {
        const subtotal = cart.reduce((acc, item) => {
            const unitPrice = this.calculateItemUnitPrice(item);
            return acc + (unitPrice * item.quantity);
        }, 0);

        const itemCount = cart.reduce((acc, item) => acc + item.quantity, 0);
        const tax = 0; // Implementar lógica de IVA si se requiere en el futuro
        const total = Number(subtotal.toFixed(2));

        return {
            subtotal: Number(subtotal.toFixed(2)),
            tax,
            total,
            itemCount,
            discountAmount: 0
        };
    },

    /**
     * Formatea un monto a moneda local (Bs) con rigor industrial.
     */
    formatCurrency(amount: number): string {
        return `Bs. ${amount.toFixed(2)}`;
    },

    /**
     * Convierte un monto de Bs a USD (Architecture: ui:23)
     */
    convertToUSD(amountBs: number, exchangeRate: number): number {
        if (!exchangeRate || exchangeRate <= 0) return 0;
        return Number((amountBs / exchangeRate).toFixed(2));
    },

    /**
     * Formatea un monto a USD.
     */
    formatUSD(amount: number): string {
        return `$ ${amount.toFixed(2)} USD`;
    }
};
