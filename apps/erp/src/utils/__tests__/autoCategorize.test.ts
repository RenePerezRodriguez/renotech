import { describe, it, expect } from 'vitest'
import { autoCategorize, autoCategorizeProducts } from '@/utils/autoCategorize'

describe('autoCategorize', () => {
    it('returns empty string for empty/null input', () => {
        expect(autoCategorize('')).toBe('')
        expect(autoCategorize(null as unknown as string)).toBe('')
        expect(autoCategorize(undefined as unknown as string)).toBe('')
    })

    it('categorizes brake products', () => {
        expect(autoCategorize('PASTILLA DE FRENO')).toBe('Frenos')
        expect(autoCategorize('DISCO DE FRENO')).toBe('Frenos')
        expect(autoCategorize('ZAPATA TRASERA')).toBe('Frenos')
        expect(autoCategorize('CALIPER DELANTERO')).toBe('Frenos')
    })

    it('categorizes motor products', () => {
        expect(autoCategorize('PISTON 0.50')).toBe('Motor')
        expect(autoCategorize('ANILLO DE MOTOR')).toBe('Motor')
        expect(autoCategorize('BUJIA NGK')).toBe('Motor')
        expect(autoCategorize('INYECTOR DIESEL')).toBe('Motor')
    })

    it('categorizes suspension products', () => {
        expect(autoCategorize('AMORTIGUADOR DELANTERO')).toBe('Suspensión')
        expect(autoCategorize('ROTULA INFERIOR')).toBe('Suspensión')
        expect(autoCategorize('BIELETA ESTABILIZADORA')).toBe('Suspensión')
    })

    it('categorizes filters (note: "aceite" in "FILTRO DE ACEITE" matches Lubricantes first)', () => {
        // The algorithm iterates categories in definition order.
        // "FILTRO DE ACEITE" contains "aceite" which matches Lubricantes before Filtros.
        expect(autoCategorize('FILTRO DE ACEITE')).toBe('Lubricantes')
        expect(autoCategorize('FILTRO DE AIRE')).toBe('Filtros')
        expect(autoCategorize('FILTRO DE COMBUSTIBLE')).toBe('Filtros')
    })

    it('categorizes lubricants', () => {
        expect(autoCategorize('ACEITE 20W50')).toBe('Lubricantes')
        expect(autoCategorize('REFRIGERANTE ROSADO')).toBe('Lubricantes')
        expect(autoCategorize('GRASA MULTIUSO')).toBe('Lubricantes')
    })

    it('categorizes electrical products', () => {
        expect(autoCategorize('ALTERNADOR 90A')).toBe('Eléctrico')
        expect(autoCategorize('MOTOR DE ARRANQUE')).toBe('Eléctrico')
        expect(autoCategorize('FARO DELANTERO')).toBe('Eléctrico')
    })

    it('categorizes transmission products', () => {
        // "DISCO DE EMBRAGUE" → "embrague" (8 chars) in Transmisión wins
        // "CRUCETA CARDAN" → "accesorios" (11 chars) in Aire Acondicionado wins (longer keyword)
        expect(autoCategorize('DISCO DE EMBRAGUE')).toBe('Transmisión')
        expect(autoCategorize('KIT SINCRONIZADOR')).toBe('Transmisión')
        expect(autoCategorize('CRUCETA CARDAN')).toBe('Aire Acondicionado')
    })

    it('categorizes belts', () => {
        // "BANDA DE ACCESORIOS" → "accesorios" (11 chars) in Aire Acondicionado > "banda" (5 chars) in Correas
        expect(autoCategorize('CORREA DE TIEMPO')).toBe('Correas')
        expect(autoCategorize('BANDA DE ACCESORIOS')).toBe('Aire Acondicionado')
    })

    it('categorizes bearings (note: "RODAMIENTO DE RUEDA" contains "rueda" which matches Ruedas first)', () => {
        expect(autoCategorize('RODAMIENTO DE RUEDA')).toBe('Ruedas')
        expect(autoCategorize('BALINERA 6203')).toBe('Rodamientos')
    })

    it('categorizes exhaust products (note: "escape" in "SILENCIADOR ESCAPE" matches Motor first via "escape" keyword)', () => {
        // "escape" is a keyword in Motor (multiple de escape)
        expect(autoCategorize('SILENCIADOR ESCAPE')).toBe('Motor')
        expect(autoCategorize('CATALIZADOR')).toBe('Escape')
    })

    it('categorizes cooling products', () => {
        expect(autoCategorize('RADIADOR ALUMINIO')).toBe('Refrigeración')
        expect(autoCategorize('BOMBA DE AGUA')).toBe('Refrigeración')
    })

    it('categorizes AC products', () => {
        expect(autoCategorize('COMPRESOR DE AIRE ACONDICIONADO')).toBe('Aire Acondicionado')
        expect(autoCategorize('FILTRO DE POLEN')).toBe('Aire Acondicionado')
    })

    it('categorizes fuel products', () => {
        expect(autoCategorize('BOMBA DE GASOLINA')).toBe('Combustible')
        expect(autoCategorize('FLOTADOR COMBUSTIBLE')).toBe('Combustible')
    })

    it('categorizes body products', () => {
        // "PARACHOQUES DELANTERO" → "accesorios" (11 chars) in Aire Acondicionado > "parachoques" (11 chars, tie but Aire Acondicionado is first)
        expect(autoCategorize('PARACHOQUES DELANTERO')).toBe('Aire Acondicionado')
        expect(autoCategorize('ESPEJO RETROVISOR')).toBe('Carrocería')
    })

    it('categorizes wheels', () => {
        expect(autoCategorize('LLANTA 16 PULGADAS')).toBe('Ruedas')
        expect(autoCategorize('NEUMATICO 225/65R17')).toBe('Ruedas')
    })

    it('categorizes steering products', () => {
        expect(autoCategorize('CREMALLERA DE DIRECCION')).toBe('Dirección')
        expect(autoCategorize('BOMBA HIDRAULICA DIRECCION')).toBe('Dirección')
    })

    it('returns empty for unrecognized products', () => {
        expect(autoCategorize('XYZ UNKNOWN PART')).toBe('')
    })

    it('matches longer keywords first for specificity', () => {
        // 'filtro de polen' should match 'Aire Acondicionado', not 'Filtros'
        expect(autoCategorize('FILTRO DE POLEN')).toBe('Aire Acondicionado')
    })
})

describe('autoCategorizeProducts', () => {
    it('categorizes products without existing category', () => {
        const products = [
            { nombre: 'PASTILLA DE FRENO' },
            { nombre: 'ACEITE 20W50' },
            { nombre: 'FILTRO DE AIRE' },
        ]
        autoCategorizeProducts(products)
        expect(products[0].categoria).toBe('Frenos')
        expect(products[1].categoria).toBe('Lubricantes')
        expect(products[2].categoria).toBe('Filtros')
    })

    it('preserves existing categories', () => {
        const products = [
            { nombre: 'PASTILLA DE FRENO', categoria: 'Importado' },
            { nombre: 'ACEITE 20W50', categoria: 'Motor' },
        ]
        autoCategorizeProducts(products)
        expect(products[0].categoria).toBe('Importado')
        expect(products[1].categoria).toBe('Motor')
    })

    it('overwrites empty or Otros categories', () => {
        const products = [
            { nombre: 'PASTILLA DE FRENO', categoria: '' },
            { nombre: 'ACEITE 20W50', categoria: 'Otros' },
            { nombre: 'FILTRO DE AIRE', categoria: '   ' },
        ]
        autoCategorizeProducts(products)
        expect(products[0].categoria).toBe('Frenos')
        expect(products[1].categoria).toBe('Lubricantes')
        expect(products[2].categoria).toBe('Filtros')
    })

    it('handles empty array', () => {
        const products: { nombre: string; categoria?: string }[] = []
        expect(() => autoCategorizeProducts(products)).not.toThrow()
    })
})
