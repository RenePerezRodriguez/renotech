import { describe, it, expect } from 'vitest'
import { generateSearchTags } from '@/logic/search'
import { MasterProduct } from '@/types'

describe('generateSearchTags', () => {
    it('extracts words from nombre', () => {
        const tags = generateSearchTags({ nombre: 'PASTILLA DE FRENO' })
        expect(tags).toContain('pastilla')
        expect(tags).toContain('freno')
    })

    it('includes full code as a tag', () => {
        const tags = generateSearchTags({ codigo: 'REN-033' })
        expect(tags).toContain('ren-033')
        expect(tags).toContain('ren')
        expect(tags).toContain('033')
    })

    it('extracts codigoOE and codigoFabrica', () => {
        const tags = generateSearchTags({
            codigoOE: 'OE-12345',
            codigoFabrica: 'FAB-678',
        })
        expect(tags).toContain('oe-12345')
        expect(tags).toContain('fab-678')
    })

    it('removes duplicates', () => {
        const tags = generateSearchTags({
            nombre: 'ACEITE ACEITE',
            codigo: 'ACEITE',
        })
        const occurrences = tags.filter(t => t === 'aceite').length
        expect(occurrences).toBe(1)
    })

    it('filters out single-character words', () => {
        const tags = generateSearchTags({ nombre: 'A B CD' })
        expect(tags).not.toContain('a')
        expect(tags).not.toContain('b')
        expect(tags).toContain('cd')
    })

    it('handles empty input', () => {
        const tags = generateSearchTags({})
        expect(tags).toEqual([])
    })

    it('splits on hyphens and slashes', () => {
        const tags = generateSearchTags({ codigo: 'REN-033/B' })
        expect(tags).toContain('ren')
        expect(tags).toContain('033')
        expect(tags).toContain('ren-033/b')
    })
})
