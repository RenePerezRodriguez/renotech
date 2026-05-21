import { describe, it, expect } from 'vitest'
import { parseProductName } from '@/utils/productNameParser'

describe('parseProductName', () => {
    it('extracts parenthetical content as description', () => {
        const result = parseProductName('AMORTIGUADOR (L)')
        expect(result.baseName).toBe('AMORTIGUADOR')
        expect(result.newDesc).toContain('Izquierdo')
    })

    it('translates L/R/LH/RH abbreviations', () => {
        expect(parseProductName('ESPEJO (R)').newDesc).toContain('Derecho')
        expect(parseProductName('ESPEJO (LH)').newDesc).toContain('Lado Izquierdo')
        expect(parseProductName('ESPEJO (RH)').newDesc).toContain('Lado Derecho')
    })

    it('removes parentheses from base name', () => {
        const result = parseProductName('FILTRO DE ACEITE (TOYOTA)')
        expect(result.baseName).toBe('FILTRO DE ACEITE')
        expect(result.newDesc).toContain('TOYOTA')
    })

    it('extracts vehicle compatibility keywords', () => {
        const result = parseProductName('PASTILLA DE FRENO TOYOTA HILUX 2020')
        expect(result.baseName).toBe('PASTILLA DE FRENO')
        expect(result.newDesc).toContain('TOYOTA')
    })

    it('handles empty input', () => {
        const result = parseProductName('')
        expect(result.baseName).toBe('')
        expect(result.newDesc).toBe('')
    })

    it('appends to existing description', () => {
        const result = parseProductName('FILTRO (BOSCH)', 'Repuesto original')
        expect(result.newDesc).toContain('Repuesto original')
        expect(result.newDesc).toContain('BOSCH')
    })

    it('does not duplicate existing description content', () => {
        const result = parseProductName('FILTRO (BOSCH)', 'BOSCH')
        // Should not add "BOSCH" again
        const occurrences = (result.newDesc.match(/BOSCH/g) || []).length
        expect(occurrences).toBe(1)
    })

    it('cleans trailing hyphens and slashes from base name', () => {
        const result = parseProductName('AMORTIGUADOR -/ TOYOTA')
        expect(result.baseName).toBe('AMORTIGUADOR')
    })

    it('handles multiple parentheses', () => {
        const result = parseProductName('KIT EMBRAGUE (L) (SACHS)')
        expect(result.baseName).toBe('KIT EMBRAGUE')
        expect(result.newDesc).toContain('Izquierdo')
        expect(result.newDesc).toContain('SACHS')
    })
})
