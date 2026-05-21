import { describe, it, expect } from 'vitest'
import { normalizeText } from '@/utils/normalize'
import { formatUserName } from '@/utils/formatUserName'
import { numberToSpanishWords } from '@/utils/numberToSpanishWords'

describe('normalizeText', () => {
    it('lowercases and removes accents', () => {
        expect(normalizeText('Batería')).toBe('bateria')
        expect(normalizeText('PASTILLA DE FRENO')).toBe('pastilla de freno')
        expect(normalizeText('Camión')).toBe('camion')
    })

    it('handles null/undefined/empty', () => {
        expect(normalizeText(null)).toBe('')
        expect(normalizeText(undefined)).toBe('')
        expect(normalizeText('')).toBe('')
    })

    it('removes diacritics from special characters', () => {
        expect(normalizeText('Código OE')).toBe('codigo oe')
        expect(normalizeText('Número')).toBe('numero')
    })
})

describe('formatUserName', () => {
    it('formats "First Last" as "F. Last"', () => {
        expect(formatUserName('Stefany Garro')).toBe('S. Garro')
    })

    it('formats multi-word names using first initial and last word', () => {
        expect(formatUserName('Juan Carlos Pérez López')).toBe('J. López')
    })

    it('returns single name as-is', () => {
        expect(formatUserName('Maria')).toBe('Maria')
    })

    it('returns — for null/undefined/empty', () => {
        expect(formatUserName(null)).toBe('—')
        expect(formatUserName(undefined)).toBe('—')
        expect(formatUserName('')).toBe('—')
    })

    it('handles email addresses', () => {
        expect(formatUserName('user@email.com')).toBe('user')
    })

    it('truncates long UID-like strings', () => {
        const uid = 'abcdefghijklmnopqrstuvwxyz123456'
        const result = formatUserName(uid)
        expect(result).toContain('…')
        expect(result.length).toBeLessThan(uid.length)
    })
})

describe('numberToSpanishWords', () => {
    it('returns CERO for 0', () => {
        expect(numberToSpanishWords(0)).toContain('CERO')
    })

    it('converts integer amounts', () => {
        const result = numberToSpanishWords(580)
        expect(result).toContain('QUINIENTOS')
        expect(result).toContain('OCHENTA')
        expect(result).toContain('00/100')
        expect(result).toContain('BOLIVIANOS')
    })

    it('converts amounts with cents', () => {
        const result = numberToSpanishWords(150.50)
        expect(result).toContain('50/100')
        expect(result).toContain('BOLIVIANOS')
    })

    it('handles thousands', () => {
        const result = numberToSpanishWords(1250)
        expect(result).toContain('MIL')
        expect(result).toContain('DOSCIENTOS CINCUENTA')
    })

    it('handles millions', () => {
        const result = numberToSpanishWords(1500000)
        expect(result).toContain('MILLON')
    })
})
