import { describe, it, expect } from 'vitest'
import { ALL_ROUTES } from '@/services/RoleService'

describe('ALL_ROUTES', () => {
    it('is a non-empty array', () => {
        expect(Array.isArray(ALL_ROUTES)).toBe(true)
        expect(ALL_ROUTES.length).toBeGreaterThan(0)
    })

    it('contains expected core routes', () => {
        expect(ALL_ROUTES).toContain('/inicio')
        expect(ALL_ROUTES).toContain('/punto-de-venta')
        expect(ALL_ROUTES).toContain('/inventario')
    })

    it('all routes start with /', () => {
        for (const route of ALL_ROUTES) {
            expect(route).toMatch(/^\//)
        }
    })

    it('has no duplicate routes', () => {
        const unique = new Set(ALL_ROUTES)
        expect(unique.size).toBe(ALL_ROUTES.length)
    })

    it('all routes are strings', () => {
        for (const route of ALL_ROUTES) {
            expect(typeof route).toBe('string')
        }
    })
})
