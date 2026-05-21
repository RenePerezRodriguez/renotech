import { describe, it, expect } from 'vitest'
import { ensureDate, formatDate, formatTime, formatDateTime, formatDateLong } from '@/utils/dateHelpers'
import { Timestamp } from 'firebase/firestore'

describe('ensureDate', () => {
    it('returns current date for null/undefined', () => {
        const now = Date.now()
        const result = ensureDate(null)
        expect(result.getTime()).toBeGreaterThanOrEqual(now - 1000)
        expect(result.getTime()).toBeLessThanOrEqual(now + 1000)
    })

    it('returns same Date instance', () => {
        const d = new Date('2026-01-15T12:00:00Z')
        expect(ensureDate(d)).toBe(d)
    })

    it('converts Firestore Timestamp with toDate()', () => {
        const ts = Timestamp.fromDate(new Date('2026-01-15T12:00:00Z'))
        const result = ensureDate(ts)
        expect(result).toBeInstanceOf(Date)
        expect(result.toISOString()).toBe('2026-01-15T12:00:00.000Z')
    })

    it('converts object with seconds', () => {
        const d = new Date('2026-01-15T12:00:00Z')
        const result = ensureDate({ seconds: d.getTime() / 1000, nanoseconds: 0 })
        expect(result).toBeInstanceOf(Date)
        expect(result.toISOString()).toBe('2026-01-15T12:00:00.000Z')
    })

    it('converts ISO string', () => {
        const result = ensureDate('2026-01-15T12:00:00Z')
        expect(result).toBeInstanceOf(Date)
        expect(result.toISOString()).toBe('2026-01-15T12:00:00.000Z')
    })

    it('returns current date for unknown type', () => {
        const now = Date.now()
        // FieldValue is a sentinel, not a real value — ensureDate falls through to default
        const result = ensureDate({} as unknown as Timestamp)
        expect(result.getTime()).toBeGreaterThanOrEqual(now - 1000)
    })
})

describe('formatDate', () => {
    it('formats date in es-BO dd/mm/yyyy', () => {
        const d = new Date('2026-01-15T12:00:00Z')
        // With America/La_Paz (UTC-4), this is 2026-01-15 08:00 local
        const result = formatDate(d)
        expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    })

    it('handles string input', () => {
        const result = formatDate('2026-01-15')
        expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    })
})

describe('formatTime', () => {
    it('formats time in 24h HH:MM', () => {
        const d = new Date('2026-01-15T14:30:00Z')
        const result = formatTime(d)
        expect(result).toMatch(/^\d{2}:\d{2}$/)
    })
})

describe('formatDateTime', () => {
    it('combines date and time', () => {
        const d = new Date('2026-01-15T14:30:00Z')
        const result = formatDateTime(d)
        expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
    })
})

describe('formatDateLong', () => {
    it('formats long date in Spanish', () => {
        const d = new Date('2026-01-15T12:00:00Z')
        const result = formatDateLong(d)
        expect(result).toContain('2026')
        expect(result.length).toBeGreaterThan(10)
    })
})
