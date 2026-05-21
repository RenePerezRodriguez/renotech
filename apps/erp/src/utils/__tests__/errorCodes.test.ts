import { describe, it, expect } from 'vitest'
import { ErrorCodes, throwStandardError, type ErrorCodeKey } from '@/utils/errorCodes'

describe('ErrorCodes', () => {
    it('has all expected error categories', () => {
        expect(ErrorCodes.AUTH_BRANCH_ACCESS).toContain('E-AUTH-001')
        expect(ErrorCodes.INV_INSUFFICIENT_STOCK).toContain('E-INV-001')
        expect(ErrorCodes.POS_CASH_SHIFT_CLOSED).toContain('E-POS-001')
        expect(ErrorCodes.TRSF_ALREADY_PROCESSED).toContain('E-TRSF-001')
        expect(ErrorCodes.PURCH_NOT_FOUND).toContain('E-PURCH-001')
        expect(ErrorCodes.SYS_TRANSACTION_FAILED).toContain('E-SYS-001')
    })

    it('has unique codes', () => {
        const codes = Object.values(ErrorCodes).map(m => m.split(':')[0])
        const unique = new Set(codes)
        expect(unique.size).toBe(codes.length)
    })
})

describe('throwStandardError', () => {
    it('throws Error with the correct message', () => {
        expect(() => throwStandardError('INV_INSUFFICIENT_STOCK')).toThrow(
            'E-INV-001: Stock insuficiente para completar la transacción.'
        )
    })

    it('appends extra details when provided', () => {
        expect(() => throwStandardError('POS_CASH_SHIFT_CLOSED', 'Sucursal Central')).toThrow(
            'E-POS-001: Se requiere un turno de caja abierto para esta operación. (Sucursal Central)'
        )
    })

    it('throws for all defined error keys', () => {
        const keys = Object.keys(ErrorCodes) as ErrorCodeKey[]
        for (const key of keys) {
            expect(() => throwStandardError(key)).toThrow()
        }
    })

    it('throws a never-returning function', () => {
        // TypeScript: throwStandardError returns `never`
        const fn = (): string => {
            throwStandardError('SYS_NETWORK_ERROR')
        }
        expect(fn).toThrow()
    })
})
