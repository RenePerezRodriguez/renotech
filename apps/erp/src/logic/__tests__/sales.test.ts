import { describe, it, expect } from 'vitest'
import { SalesLogic } from '@/logic/sales'
import { CartItem, Product } from '@/types'

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
    id: 'prod-1',
    masterId: 'master-1',
    branchId: 'branch-1',
    codigo: 'REN-001',
    nombre: 'Test Product',
    marca: 'Test Brand',
    categoria: 'Test Cat',
    stock: 10,
    minStock: 2,
    costo: 50,
    precio: 100,
    ...overrides,
})

const makeItem = (overrides: Partial<CartItem> = {}): CartItem => ({
    product: makeProduct(),
    quantity: 1,
    ...overrides,
})

describe('SalesLogic.mapCartToSaleItems', () => {
    it('maps cart items to sale items with correct prices', () => {
        const items = [
            makeItem({ quantity: 2, fixedPrice: 50 }),
            makeItem({ quantity: 1, fixedPrice: 100 }),
        ]
        const result = SalesLogic.mapCartToSaleItems(items)
        expect(result).toHaveLength(2)
        expect(result[0].quantity).toBe(2)
        expect(result[0].unitPrice).toBe(50)
        expect(result[0].subtotal).toBe(100)
        expect(result[1].quantity).toBe(1)
        expect(result[1].unitPrice).toBe(100)
        expect(result[1].subtotal).toBe(100)
    })

    it('includes product codes and names', () => {
        const product = makeProduct({ codigo: 'REN-042', nombre: 'PASTILLA DE FRENO', codigoFabrica: 'FB-123' })
        const items = [makeItem({ product })]
        const result = SalesLogic.mapCartToSaleItems(items)
        expect(result[0].productCode).toBe('REN-042')
        expect(result[0].productName).toBe('PASTILLA DE FRENO')
        expect(result[0].productCodigoFabrica).toBe('FB-123')
    })

    it('handles missing product fields gracefully', () => {
        const product = makeProduct({ codigo: undefined as unknown as string, nombre: undefined as unknown as string })
        const items = [makeItem({ product })]
        const result = SalesLogic.mapCartToSaleItems(items)
        expect(result[0].productCode).toBe('S/N')
        expect(result[0].productName).toBe('Producto sin nombre')
    })

    it('includes discount info when present', () => {
        const item = makeItem({
            discount: { type: 'PERCENTAGE', value: 10, originalPrice: 100, appliedByEmail: 'test@test.com' }
        })
        const result = SalesLogic.mapCartToSaleItems([item])
        expect(result[0].discountType).toBe('PERCENTAGE')
        expect(result[0].discountValue).toBe(10)
        expect(result[0].originalPrice).toBe(100)
    })

    it('handles empty cart', () => {
        const result = SalesLogic.mapCartToSaleItems([])
        expect(result).toHaveLength(0)
    })
})

describe('SalesLogic.validateStockAvailability', () => {
    it('passes when stock is sufficient', () => {
        const product = makeProduct({ stock: 10 })
        const items = [makeItem({ product, quantity: 5 })]
        expect(SalesLogic.validateStockAvailability(items)).toEqual({ success: true })
    })

    it('fails when stock is insufficient', () => {
        const product = makeProduct({ stock: 3, nombre: 'Test' })
        const items = [makeItem({ product, quantity: 5 })]
        const result = SalesLogic.validateStockAvailability(items)
        expect(result.success).toBe(false)
        expect(result.error).toContain('Stock insuficiente')
        expect(result.error).toContain('Test')
    })

    it('handles zero stock product', () => {
        const product = makeProduct({ stock: 0 })
        const items = [makeItem({ product, quantity: 1 })]
        expect(SalesLogic.validateStockAvailability(items).success).toBe(false)
    })
})
