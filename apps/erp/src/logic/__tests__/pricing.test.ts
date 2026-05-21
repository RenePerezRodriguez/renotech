import { describe, it, expect } from 'vitest'
import { PricingLogic } from '@/logic/pricing'
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

describe('PricingLogic.calculateItemUnitPrice', () => {
    it('uses fixedPrice when set', () => {
        const item = makeItem({ fixedPrice: 75 })
        expect(PricingLogic.calculateItemUnitPrice(item)).toBe(75)
    })

    it('uses precioConFactura in CON_FACTURA mode', () => {
        const product = makeProduct({ precioConFactura: 120, precio: 100 })
        const item = makeItem({ product, priceMode: 'CON_FACTURA' })
        expect(PricingLogic.calculateItemUnitPrice(item)).toBe(120)
    })

    it('uses precioSinFactura in SIN_FACTURA mode', () => {
        const product = makeProduct({ precioSinFactura: 80, precio: 100 })
        const item = makeItem({ product, priceMode: 'SIN_FACTURA' })
        expect(PricingLogic.calculateItemUnitPrice(item)).toBe(80)
    })

    it('falls back to precio when mode-specific price is missing', () => {
        const product = makeProduct({ precio: 100 })
        const item = makeItem({ product, priceMode: 'CON_FACTURA' })
        expect(PricingLogic.calculateItemUnitPrice(item)).toBe(100)
    })

    it('returns 0 when no price data exists', () => {
        const product = makeProduct({ precio: 0, precioConFactura: undefined, precioSinFactura: undefined })
        const item = makeItem({ product })
        expect(PricingLogic.calculateItemUnitPrice(item)).toBe(0)
    })
})

describe('PricingLogic.calculateTotals', () => {
    it('sums subtotal correctly', () => {
        const items = [
            makeItem({ quantity: 2, fixedPrice: 50 }),
            makeItem({ quantity: 1, fixedPrice: 100 }),
        ]
        const result = PricingLogic.calculateTotals(items)
        expect(result.subtotal).toBe(200)
        expect(result.total).toBe(200)
        expect(result.itemCount).toBe(3)
    })

    it('handles empty cart', () => {
        const result = PricingLogic.calculateTotals([])
        expect(result.subtotal).toBe(0)
        expect(result.total).toBe(0)
        expect(result.itemCount).toBe(0)
    })
})

describe('PricingLogic.formatCurrency', () => {
    it('formats Bs correctly', () => {
        expect(PricingLogic.formatCurrency(100)).toBe('Bs. 100.00')
        expect(PricingLogic.formatCurrency(99.5)).toBe('Bs. 99.50')
    })
})

describe('PricingLogic.convertToUSD', () => {
    it('converts using exchange rate', () => {
        expect(PricingLogic.convertToUSD(700, 7)).toBe(100)
    })

    it('returns 0 for invalid rate', () => {
        expect(PricingLogic.convertToUSD(100, 0)).toBe(0)
        expect(PricingLogic.convertToUSD(100, -1)).toBe(0)
    })
})

describe('PricingLogic.formatUSD', () => {
    it('formats USD correctly', () => {
        expect(PricingLogic.formatUSD(100)).toBe('$ 100.00 USD')
    })
})
