import { describe, it, expect } from 'vitest'
import { cn, startOfDay, endOfDay, midday } from '@/lib/utils'

describe('cn', () => {
    it('merges class names', () => {
        expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('handles conditional classes', () => {
        expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
    })

    it('resolves tailwind conflicts via twMerge', () => {
        expect(cn('px-4', 'px-2')).toBe('px-2')
    })

    it('handles empty input', () => {
        expect(cn()).toBe('')
    })
})

describe('startOfDay', () => {
    it('creates date at 00:00:00-04:00', () => {
        const result = startOfDay('2026-01-15')
        expect(result.toISOString()).toBe('2026-01-15T04:00:00.000Z')
    })
})

describe('endOfDay', () => {
    it('creates date at 23:59:59-04:00', () => {
        const result = endOfDay('2026-01-15')
        expect(result.toISOString()).toBe('2026-01-16T03:59:59.000Z')
    })
})

describe('midday', () => {
    it('creates date at 12:00:00-04:00', () => {
        const result = midday('2026-01-15')
        expect(result.toISOString()).toBe('2026-01-15T16:00:00.000Z')
    })
})
