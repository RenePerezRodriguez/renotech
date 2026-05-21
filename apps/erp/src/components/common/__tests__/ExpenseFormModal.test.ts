import { describe, it, expect } from 'vitest'
import { midday } from '@/lib/utils'

describe('ExpenseFormModal date logic', () => {
    /**
     * Tests the retroactive date logic from ExpenseFormModal.
     * If the selected date is today → use new Date() (server time).
     * If the selected date is not today → use midday(formDate) for consistent timezone.
     */
    function resolveExpenseDate(formDate: string, isToday: boolean): Date {
        return isToday ? new Date() : midday(formDate)
    }

    it('uses midday() for non-today dates', () => {
        const result = resolveExpenseDate('2026-01-15', false)
        expect(result.toISOString()).toBe('2026-01-15T16:00:00.000Z')
    })

    it('uses new Date() for today', () => {
        const before = Date.now()
        const result = resolveExpenseDate('2026-01-15', true)
        const after = Date.now()
        expect(result.getTime()).toBeGreaterThanOrEqual(before - 1000)
        expect(result.getTime()).toBeLessThanOrEqual(after + 1000)
    })

    it('midday handles month boundaries correctly', () => {
        const result = midday('2026-12-31')
        expect(result.toISOString()).toBe('2026-12-31T16:00:00.000Z')
    })

    it('midday handles leap year', () => {
        const result = midday('2028-02-29')
        expect(result.toISOString()).toBe('2028-02-29T16:00:00.000Z')
    })
})
