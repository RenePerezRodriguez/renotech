/**
 * Modelo Caja + Tesorería v2 — clase mundial
 * 
 * Conceptos:
 *  - `Account`: toda cuenta donde "vive" dinero (cajón físico, banco, wallet).
 *  - `CashierSession`: sesión de un cajero sobre un cajón en un día.
 *  - `JournalEntry`: asiento contable simplificado. Reemplaza movimientos_caja.
 *  - `BankReconciliationBatch`: lote de conciliación bancaria.
 *  - `TreasuryConfig`: configuración global de tesorería.
 */
import type { Timestamp, FieldValue } from 'firebase/firestore';

// ============================================================================
// ACCOUNT — Cuentas donde vive el dinero
// ============================================================================

export type AccountType = 'CASH_DRAWER' | 'BANK' | 'WALLET';

export interface Account {
    id?: string;
    name: string;                       // "Caja Sucursal Centro", "BCP Cuenta Corriente", "Tigo Money Sucursal Norte"
    type: AccountType;
    branchId: string | null;            // null = cuenta global (legacy). Requerido para CASH_DRAWER.
    branchIds?: string[];               // Arreglo de sucursales a las que pertenece esta cuenta (usado para BANK / WALLET)
    currency: 'BOB';                    // futura proofing
    currentBalance: number;             // calculado server-side al cierre de cada operación
    openingBalance: number;             // saldo inicial al crear la cuenta
    isActive: boolean;
    // Para BANK/WALLET
    bankName?: string;                  // BCP, BISA, MERCANTIL, TIGO_MONEY
    accountNumber?: string;             // últimos 4 dígitos por seguridad
    accountHolder?: string;             // titular (para BANK)
    accountTypeLabel?: string;          // 'Cta Corriente', 'Cta Ahorro' (para BANK)
    qrImageUrl?: string;                // URL de imagen QR (para WALLET o BANK con QR)
    // Métodos de pago que esta cuenta puede recibir (afecta selectores)
    acceptsPaymentMethods?: PaymentMethod[];  // ['QR', 'TRANSFERENCIA'] para BANK; ['EFECTIVO'] para CASH_DRAWER
    cashDrawerPurpose?: 'POS' | 'VAULT';    // uso del cajón físico: POS = sesión de caja, VAULT = caja fuerte / bóveda
    notes?: string;
    createdAt?: Date | Timestamp | FieldValue;
    createdBy?: string;
    updatedAt?: Date | Timestamp | FieldValue;
}

export type PaymentMethod = 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';

// ============================================================================
// CASHIER SESSION — sesión de cajero (reemplaza CashShift)
// ============================================================================

export type SessionStatus = 'OPEN' | 'CLOSED' | 'FORCE_CLOSED' | 'BLOCKED';

export interface CashDenominations {
    /** Llave = denominación en BOB (200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1) */
    [denomination: string]: number;
}

export interface CashierSession {
    id?: string;
    cashDrawerId: string;               // FK Account (type=CASH_DRAWER)
    branchId: string;                   // denormalizado para queries

    cashierId: string;                  // user.uid del cajero
    cashierName: string;
    cashierRole?: string;

    status: SessionStatus;

    // ===== APERTURA =====
    openedAt: Date | Timestamp | FieldValue;
    openingDenominations: CashDenominations;
    openingTotal: number;               // suma de denominaciones * valor
    openingPreviousBalance?: number;    // saldo del cajón antes de abrir esta sesión
    openingDifference?: number;         // openingTotal - openingPreviousBalance (sobrante>0 / faltante<0)
    openingAdjustmentReason?: string;   // obligatorio si |openingDifference| > tolerancia
    openingNotes?: string;

    // ===== CIERRE =====
    closedAt?: Date | Timestamp | FieldValue;
    closingDenominations?: CashDenominations;
    closingDeclared?: {
        EFECTIVO: number;               // suma denominaciones cierre
        QR: number;                     // declarado por cajero
        TRANSFERENCIA: number;
    };
    closingExpected?: {                 // calculado por el sistema
        EFECTIVO: number;
        QR: number;
        TRANSFERENCIA: number;
    };
    closingDifference?: {
        EFECTIVO: number;               // declared - expected
        QR: number;
        TRANSFERENCIA: number;
        total: number;
    };
    closingNotes?: string;
    discrepancySeverity?: 'NONE' | 'TOLERATED' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    confirmedDiscrepancy?: boolean;     // cajero confirmó que la diferencia es real
    closedByUid?: string;
    closedByName?: string;
    closedByRole?: string;
    closedByAt?: Date | Timestamp | FieldValue;

    // ===== FORCE-CLOSE / BLOCK =====
    forceClosedBy?: string;             // user.uid GERENTE
    forceClosedByName?: string;
    forceClosedByRole?: string;
    forceCloseReason?: string;
    blockedReason?: string;             // si discrepancia CRÍTICA bloquea sesión

    // ===== REAPERTURA =====
    reopenedAt?: Date | Timestamp | FieldValue;
    reopenedBy?: string;
    reopenedByName?: string;
    reopenedByRole?: string;
    reopenReason?: string;
    reopenAdjustmentReversed?: number;  // monto neto del ajuste de cierre revertido al reabrir

    blockedAcknowledgedAt?: Date | Timestamp | FieldValue;
    blockedAcknowledgedBy?: string;
    blockedAcknowledgedByName?: string;
    blockedAcknowledgedByRole?: string;
    blockedAcknowledgeReason?: string;

    // ===== ALERTAS =====
    longSessionAlertSentAt?: Date | Timestamp | FieldValue;
}

// ============================================================================
// JOURNAL ENTRY — asiento contable (reemplaza CashMovement)
// ============================================================================

export type JournalDirection = 'DEBIT' | 'CREDIT';
// DEBIT  = entra dinero a la cuenta (incrementa balance)
// CREDIT = sale dinero de la cuenta (decrementa balance)

export type JournalCategory =
    // INGRESOS (DEBIT a cuenta)
    | 'VENTA'
    | 'COBRO_CUOTA'
    | 'ABONO_CLIENTE'
    | 'INYECCION_CAPITAL'
    | 'TRASLADO_INGRESO'
    | 'AJUSTE_POSITIVO'
    | 'DEVOLUCION_COMPRA'              // proveedor nos devuelve dinero
    // EGRESOS (CREDIT a cuenta)
    | 'COMPRA_STOCK'
    | 'GASTO_OPERATIVO'
    | 'PAGO_PROVEEDOR'
    | 'PAGO_PLANILLA'
    | 'RETIRO_UTILIDADES'
    | 'DEPOSITO_BANCO'                 // dinero sale de cajón a banco
    | 'TRASLADO_EGRESO'
    | 'AJUSTE_NEGATIVO'
    | 'DEVOLUCION_VENTA';              // devolvemos a cliente

export type ReferenceType =
    | 'SALE'
    | 'PURCHASE'
    | 'EXPENSE'
    | 'INSTALLMENT_PAYMENT'
    | 'SUPPLIER_PAYMENT'
    | 'CASH_TRANSFER'
    | 'BANK_DEPOSIT'
    | 'CAPITAL_INJECTION'
    | 'PROFIT_WITHDRAWAL'
    | 'PAYROLL'
    | 'MANUAL_ADJUSTMENT'
    | 'SESSION_OPEN_ADJUSTMENT'
    | 'SESSION_CLOSE_ADJUSTMENT'
    | 'SESSION_CLOSE_ADJUSTMENT_REVERSAL'
    | 'NONE';

export type ReconciliationStatus = 'NOT_APPLICABLE' | 'PENDING' | 'RECONCILED' | 'DISPUTED';

export interface JournalEntry {
    id?: string;

    accountId: string;                  // FK Account
    direction: JournalDirection;
    amount: number;                     // > 0 siempre
    paymentMethod: PaymentMethod;

    category: JournalCategory;
    description: string;                // motivo legible

    // Trazabilidad
    referenceType: ReferenceType;
    referenceId: string | null;         // id de la venta/compra/gasto/etc.
    relatedEntryId?: string;            // entrada gemela en TRANSFER (origen↔destino)

    // Sesión de cajero (obligatorio si la cuenta es CASH_DRAWER)
    sessionId: string | null;

    // Identificación
    branchId: string;                   // denormalizado para queries
    userId: string;                     // quien registró
    userName?: string;
    date: Date | Timestamp | FieldValue;
    createdAt?: Date | Timestamp | FieldValue;

    // Conciliación bancaria (solo para QR/TRANSFERENCIA)
    reconciliationStatus: ReconciliationStatus;
    bankRef?: string;                   // referencia bancaria/operación
    reconciledAt?: Date | Timestamp | FieldValue;
    reconciledBy?: string;
    reconciledByName?: string;
    reconciliationBatchId?: string;     // FK BankReconciliationBatch

    // Reversión (para anulaciones)
    reversedByEntryId?: string;
    reversesEntryId?: string;
    voidedAt?: Date | Timestamp | FieldValue;
}

// ============================================================================
// BANK RECONCILIATION
// ============================================================================

export interface BankStatementLine {
    date: Date | string;
    amount: number;
    direction: JournalDirection;
    description: string;
    bankRef: string;
    matched?: boolean;
    matchedJournalEntryId?: string;
}

export interface BankReconciliationBatch {
    id?: string;
    accountId: string;                  // FK Account (type=BANK | WALLET)
    accountName?: string;
    statementPeriodFrom: Date | Timestamp | FieldValue;
    statementPeriodTo: Date | Timestamp | FieldValue;
    statementLines: BankStatementLine[];
    totalLines: number;
    matchedCount: number;
    unmatchedCount: number;
    status: 'DRAFT' | 'PARTIAL' | 'COMPLETE';
    createdAt?: Date | Timestamp | FieldValue;
    createdBy: string;
    createdByName?: string;
    completedAt?: Date | Timestamp | FieldValue;
    notes?: string;
}

// ============================================================================
// TREASURY CONFIG
// ============================================================================

export interface TreasuryConfig {
    id?: 'global';                      // doc id fijo

    // Límites operativos (los CAJEROs requieren aprobación si exceden)
    cashierExpenseLimit: number;        // gastos sin aprobación
    cashierManualEgresoLimit: number;   // egresos manuales sin aprobación

    // Umbrales de discrepancia al cierre (BOB)
    discrepancyTolerance: number;       // ej: 1   — bajo esto, NO genera alerta
    discrepancyMedium: number;          // ej: 20  — entre tolerance y medium = MEDIA
    discrepancyHigh: number;            // ej: 100 — encima = CRÍTICA + bloqueo sesión

    // Sesión / horarios
    sessionAlertHours: number;          // ej: 8   — alerta operativa
    sessionForceCloseHours: number;     // ej: 24  — admin sugiere force-close

    // Reconciliación
    requireBankRefForDigital: boolean;  // true = obliga a poner ref al registrar QR/TRANSFER
    autoReconcileWithinDays: number;    // ej: 7 — alerta si pasaron N días sin conciliar

    // Comprobantes de gasto
    requireExpenseReceipt: boolean;     // true = exige foto de comprobante al registrar gasto

    updatedAt?: Date | Timestamp | FieldValue;
    updatedBy?: string;
}

// ============================================================================
// VALORES DE DENOMINACIÓN BOB
// ============================================================================

export const BOB_DENOMINATIONS = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1] as const;

export function calculateDenominationsTotal(denoms: CashDenominations): number {
    return Object.entries(denoms).reduce((sum, [denom, qty]) => {
        const value = parseFloat(denom);
        return sum + (Number.isFinite(value) && Number.isFinite(qty) ? value * qty : 0);
    }, 0);
}

// ============================================================================
// HELPERS DE CATEGORÍA → DIRECCIÓN
// ============================================================================

const INGRESO_CATEGORIES: JournalCategory[] = [
    'VENTA', 'COBRO_CUOTA', 'ABONO_CLIENTE', 'INYECCION_CAPITAL',
    'TRASLADO_INGRESO', 'AJUSTE_POSITIVO', 'DEVOLUCION_COMPRA'
];

export function categoryDirection(category: JournalCategory): JournalDirection {
    return INGRESO_CATEGORIES.includes(category) ? 'DEBIT' : 'CREDIT';
}

export function isIngreso(category: JournalCategory): boolean {
    return INGRESO_CATEGORIES.includes(category);
}
