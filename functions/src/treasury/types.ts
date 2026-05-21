/**
 * Tipos espejo de src/types/treasury.ts para uso en Cloud Functions.
 * Mantener sincronizados manualmente. No importan @/ porque Functions corre en Node aislado.
 */

export type AccountType = 'CASH_DRAWER' | 'BANK' | 'WALLET';
export type PaymentMethod = 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
export type JournalDirection = 'DEBIT' | 'CREDIT';
export type SessionStatus = 'OPEN' | 'CLOSED' | 'FORCE_CLOSED' | 'BLOCKED';
export type ReconciliationStatus = 'NOT_APPLICABLE' | 'PENDING' | 'RECONCILED' | 'DISPUTED';

export type JournalCategory =
    // INGRESO
    | 'VENTA' | 'COBRO_CUOTA' | 'ABONO_CLIENTE' | 'INYECCION_CAPITAL'
    | 'TRASLADO_INGRESO' | 'AJUSTE_POSITIVO' | 'DEVOLUCION_COMPRA'
    // EGRESO
    | 'COMPRA_STOCK' | 'GASTO_OPERATIVO' | 'PAGO_PROVEEDOR' | 'PAGO_PLANILLA'
    | 'RETIRO_UTILIDADES' | 'DEPOSITO_BANCO' | 'TRASLADO_EGRESO'
    | 'AJUSTE_NEGATIVO' | 'DEVOLUCION_VENTA';

export type ReferenceType =
    | 'SALE' | 'PURCHASE' | 'EXPENSE' | 'INSTALLMENT_PAYMENT' | 'SUPPLIER_PAYMENT'
    | 'CASH_TRANSFER' | 'BANK_DEPOSIT' | 'CAPITAL_INJECTION' | 'PROFIT_WITHDRAWAL'
    | 'PAYROLL' | 'MANUAL_ADJUSTMENT' | 'NONE';

export const INGRESO_CATEGORIES: JournalCategory[] = [
    'VENTA', 'COBRO_CUOTA', 'ABONO_CLIENTE', 'INYECCION_CAPITAL',
    'TRASLADO_INGRESO', 'AJUSTE_POSITIVO', 'DEVOLUCION_COMPRA',
];

export function categoryDirection(c: JournalCategory): JournalDirection {
    return INGRESO_CATEGORIES.includes(c) ? 'DEBIT' : 'CREDIT';
}

export const BOB_DENOMINATIONS = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1] as const;

export function calculateDenominationsTotal(denoms: Record<string, number>): number {
    let total = 0;
    for (const [k, qty] of Object.entries(denoms)) {
        const v = parseFloat(k);
        if (!isNaN(v) && qty > 0) total += v * qty;
    }
    return Math.round(total * 100) / 100;
}
