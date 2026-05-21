import { describe, it, expect } from 'vitest'
import { getBranchTipo, isMatriz, isPuntoVenta } from '@/lib/branch'

describe('getBranchTipo', () => {
    it('returns VENTA for null/undefined', () => {
        expect(getBranchTipo(null)).toBe('VENTA')
        expect(getBranchTipo(undefined)).toBe('VENTA')
    })

    it('returns explicit tipo when set', () => {
        expect(getBranchTipo({ tipo: 'MATRIZ', isHQ: false })).toBe('MATRIZ')
        expect(getBranchTipo({ tipo: 'VENTA', isHQ: true })).toBe('VENTA')
    })

    it('infers MATRIZ from isHQ when tipo is not set', () => {
        expect(getBranchTipo({ isHQ: true })).toBe('MATRIZ')
    })

    it('infers VENTA from isHQ=false when tipo is not set', () => {
        expect(getBranchTipo({ isHQ: false })).toBe('VENTA')
    })
})

describe('isMatriz', () => {
    it('returns true for MATRIZ', () => {
        expect(isMatriz({ tipo: 'MATRIZ' })).toBe(true)
        expect(isMatriz({ isHQ: true })).toBe(true)
    })

    it('returns false for VENTA', () => {
        expect(isMatriz({ tipo: 'VENTA' })).toBe(false)
        expect(isMatriz({ isHQ: false })).toBe(false)
    })
})

describe('isPuntoVenta', () => {
    it('returns true for VENTA', () => {
        expect(isPuntoVenta({ tipo: 'VENTA' })).toBe(true)
        expect(isPuntoVenta({ isHQ: false })).toBe(true)
    })

    it('returns false for MATRIZ', () => {
        expect(isPuntoVenta({ tipo: 'MATRIZ' })).toBe(false)
        expect(isPuntoVenta({ isHQ: true })).toBe(false)
    })
})
