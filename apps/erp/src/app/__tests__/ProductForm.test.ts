import { describe, it, expect } from 'vitest'

describe('ProductForm sanitization', () => {
    /**
     * This tests the sanitization logic extracted from ProductForm.handleSubmit.
     * It ensures numeric fields are properly converted from string to number.
     */
    function sanitizeFormData(formData: Record<string, unknown>): Record<string, unknown> {
        return {
            ...formData,
            stock: Number(formData.stock) || 0,
            minStock: Number(formData.minStock) || 0,
            precio: Number(formData.precio) || 0,
            costo: Number(formData.costo) || 0,
        }
    }

    it('converts string numbers to actual numbers', () => {
        const result = sanitizeFormData({
            nombre: 'Test',
            stock: '50',
            minStock: '5',
            precio: '100',
            costo: '30',
        })
        expect(result.stock).toBe(50)
        expect(result.minStock).toBe(5)
        expect(result.precio).toBe(100)
        expect(result.costo).toBe(30)
    })

    it('handles empty strings as 0', () => {
        const result = sanitizeFormData({
            stock: '',
            minStock: '',
            precio: '',
            costo: '',
        })
        expect(result.stock).toBe(0)
        expect(result.minStock).toBe(0)
        expect(result.precio).toBe(0)
        expect(result.costo).toBe(0)
    })

    it('handles undefined values as 0', () => {
        const result = sanitizeFormData({})
        expect(result.stock).toBe(0)
        expect(result.minStock).toBe(0)
        expect(result.precio).toBe(0)
        expect(result.costo).toBe(0)
    })

    it('preserves non-numeric fields', () => {
        const result = sanitizeFormData({
            nombre: 'PASTILLA DE FRENO',
            codigo: 'REN-033',
            stock: '10',
        })
        expect(result.nombre).toBe('PASTILLA DE FRENO')
        expect(result.codigo).toBe('REN-033')
    })

    it('handles decimal values', () => {
        const result = sanitizeFormData({
            precio: '99.99',
            costo: '49.50',
        })
        expect(result.precio).toBe(99.99)
        expect(result.costo).toBe(49.5)
    })

    it('handles invalid numeric strings as NaN → 0', () => {
        const result = sanitizeFormData({
            stock: 'abc',
            precio: '---',
        })
        // Number('abc') is NaN, NaN || 0 = 0
        expect(result.stock).toBe(0)
        expect(result.precio).toBe(0)
    })
})
