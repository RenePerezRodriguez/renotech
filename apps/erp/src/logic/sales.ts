import { CartItem, SaleItem } from '@/types';
import { PricingLogic } from './pricing';

/**
 * Lógica Industrial de Transformación de Ventas
 * Centraliza la orquestación de datos del POS al dominio de persistencia.
 */
export const SalesLogic = {
    /**
     * Mapea un carrito de compras a ítems de venta con precios calculados.
     */
    mapCartToSaleItems(cart: CartItem[]): Omit<SaleItem, 'id' | 'isVoided'>[] {
        return cart.map((item: CartItem) => {
            const unitPrice = PricingLogic.calculateItemUnitPrice(item);
            
            const saleItem: Omit<SaleItem, 'id' | 'isVoided'> = {
                productId: item.product.id!,
                productCode: (item.product.codigo as string) || 'S/N',
                productName: (item.product.nombre as string) || 'Producto sin nombre',
                productCodigoFabrica: (item.product.codigoFabrica as string) || '',
                productCodigoOE: (item.product.codigoOE as string) || '',
                productMarca: (item.product.marca as string) || '',
                quantity: item.quantity,
                unitPrice: Number(unitPrice.toFixed(2)),
                subtotal: Number((unitPrice * item.quantity).toFixed(2)),
            };

            if (item.discount) {
                saleItem.discountType = item.discount.type;
                saleItem.discountValue = item.discount.value;
                saleItem.originalPrice = item.discount.originalPrice;
                saleItem.discountAppliedBy = item.discount.appliedByEmail;
            }

            return saleItem;
        });
    },

    /**
     * Valida si el stock disponible es suficiente para la venta.
     */
    validateStockAvailability(cart: CartItem[]): { success: boolean; error?: string } {
        for (const item of cart) {
            const currentStock = item.product.stock || 0;
            if (currentStock < item.quantity) {
                return { 
                    success: false, 
                    error: `Stock insuficiente para ${item.product.nombre}. Disponible: ${currentStock}` 
                };
            }
        }
        return { success: true };
    }
};
