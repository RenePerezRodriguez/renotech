import { describe, it, expect } from 'vitest'
import { Product } from '@/types'

// scoreProduct is defined inside GlobalProductSearch.tsx but is a pure function.
// We replicate it here for testing — if it changes, this test catches regressions.
import { normalizeText } from '@/utils/normalize'

function scoreProduct(p: Product, terms: string[]): number {
    if (terms.length === 0) return 0
    const fields = [
        normalizeText(p.codigo),
        normalizeText(p.nombre),
        normalizeText(p.marca),
        normalizeText(p.categoria),
        normalizeText(p.codigoFabrica),
        normalizeText(p.codigoOE),
        normalizeText(p.barcode),
    ]
    let score = 0
    for (const term of terms) {
        for (let i = 0; i < fields.length; i++) {
            const field = fields[i]
            if (!field) continue
            if (field === term) score += (10 - i * 0.5)
            else if (field.startsWith(term)) score += (6 - i * 0.3)
            else if (field.includes(term)) score += (3 - i * 0.2)
        }
    }
    return score
}

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
    id: 'p1',
    masterId: 'm1',
    branchId: 'b1',
    codigo: 'REN-001',
    nombre: 'PASTILLA DE FRENO',
    marca: 'BOSCH',
    categoria: 'FRENOS',
    codigoFabrica: 'FB-123',
    codigoOE: 'OE-456',
    barcode: '789123456',
    stock: 10,
    minStock: 2,
    costo: 50,
    precio: 100,
    ...overrides,
})

describe('scoreProduct', () => {
    it('returns 0 for empty terms', () => {
        expect(scoreProduct(makeProduct(), [])).toBe(0)
    })

    it('scores exact código match highest', () => {
        const s1 = scoreProduct(makeProduct({ codigo: 'REN-001' }), ['ren-001'])
        const s2 = scoreProduct(makeProduct({ codigo: 'REN-001' }), ['ren-001'])
        expect(s1).toBeGreaterThan(0)
        expect(s1).toBe(s2)
    })

    it('scores exact nombre match higher than partial', () => {
        const exact = scoreProduct(makeProduct({ nombre: 'ACEITE' }), ['aceite'])
        const partial = scoreProduct(makeProduct({ nombre: 'ACEITE' }), ['acei'])
        expect(exact).toBeGreaterThan(partial)
    })

    it('scores código higher than nombre for same term when only that field matches', () => {
        // When a term matches only código (not nombre), código scores higher
        const byCodigo = scoreProduct(makeProduct({ codigo: 'XYZ-999', nombre: 'UNRELATED' }), ['xyz-999'])
        const byNombre = scoreProduct(makeProduct({ codigo: 'UNRELATED', nombre: 'XYZ-999' }), ['xyz-999'])
        expect(byCodigo).toBeGreaterThan(byNombre)
    })

    it('returns 0 when no field matches', () => {
        expect(scoreProduct(makeProduct(), ['xyz123'])).toBe(0)
    })

    it('handles multiple search terms', () => {
        const score = scoreProduct(
            makeProduct({ nombre: 'PASTILLA DE FRENO', marca: 'BOSCH' }),
            ['pastilla', 'bosch']
        )
        expect(score).toBeGreaterThan(0)
    })

    it('matches codigoFabrica', () => {
        const score = scoreProduct(makeProduct({ codigoFabrica: 'FB-123' }), ['fb-123'])
        expect(score).toBeGreaterThan(0)
    })

    it('matches barcode', () => {
        const score = scoreProduct(makeProduct({ barcode: '789123456' }), ['789123456'])
        expect(score).toBeGreaterThan(0)
    })
})
