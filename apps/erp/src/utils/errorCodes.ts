/**
 * 🚨 Codificación Estándar de Errores Renotech (Industrial Grade)
 * docs/architecture/code_standards.md L99
 */
export const ErrorCodes = {
    // AUTH & PERMISSIONS
    AUTH_BRANCH_ACCESS: 'E-AUTH-001: Sucursal no autorizada para este usuario.',
    AUTH_ROLE_INSUFFICIENT: 'E-AUTH-002: Permisos insuficientes para esta acción.',

    // INVENTORY
    INV_INSUFFICIENT_STOCK: 'E-INV-001: Stock insuficiente para completar la transacción.',
    INV_PRODUCT_NOT_FOUND: 'E-INV-002: Producto no encontrado en la sucursal.',
    INV_INVALID_ADJUSTMENT: 'E-INV-003: Ajuste de inventario no válido.',
    INV_MASTER_NOT_FOUND: 'E-INV-004: Ficha Maestra del producto no encontrada.',

    // POS & SALES
    POS_CASH_SHIFT_CLOSED: 'E-POS-001: Se requiere un turno de caja abierto para esta operación.',
    POS_TOTAL_MISMATCH: 'E-POS-002: Discrepancia detectada entre el total del cliente y el servidor.',
    POS_VOID_ALREADY_PROCESSED: 'E-POS-003: Esta venta o ítem ya ha sido anulado anteriormente.',
    POS_CREDIT_NOT_ALLOWED: 'E-POS-004: El cliente no cuenta con línea de crédito habilitada.',
    SALE_NOT_FOUND: 'E-POS-005: El documento de venta no existe.',
    
    // TRANSFERS & LOGISTICS
    TRSF_ALREADY_PROCESSED: 'E-TRSF-001: Este traspaso ya ha sido aprobado o recibido.',
    TRSF_INVALID_QUANTITY: 'E-TRSF-002: La cantidad a traspasar excede el disponible.',
    TRSF_NOT_FOUND: 'E-TRSF-003: El documento de traspaso no existe.',
    TRSF_EXPIRED: 'E-TRSF-004: Este traspaso expiró. Cancela y crea uno nuevo.',
    
    // PURCHASES & SUPPLIERS
    PURCH_NOT_FOUND: 'E-PURCH-001: La compra solicitada no existe.',
    PURCH_ALREADY_RECEIVED: 'E-PURCH-002: Esta compra ya ha sido ingresada al inventario.',
    PURCH_CASH_INSUFFICIENT: 'E-PURCH-003: Saldo insuficiente en caja para pagar esta compra en efectivo.',
    PURCH_NO_CASH_SHIFT: 'E-PURCH-004: No hay caja abierta para registrar el pago en efectivo.',

    // SYSTEM
    SYS_TRANSACTION_FAILED: 'E-SYS-001: Error en la transacción atómica de base de datos.',
    SYS_NETWORK_ERROR: 'E-SYS-002: Error de conectividad con los servicios de Firebase.',
    SYS_PERMISSION_DENIED: 'E-SYS-003: Acceso denegado por reglas de seguridad.',
    SYS_DOCUMENT_NOT_FOUND: 'E-SYS-004: El documento solicitado no existe.',
} as const;

export type ErrorCodeKey = keyof typeof ErrorCodes;

/**
 * Helper to throw standard errors
 */
export function throwStandardError(key: ErrorCodeKey, extraDetails?: string): never {
    const baseMessage = ErrorCodes[key];
    throw new Error(extraDetails ? `${baseMessage} (${extraDetails})` : baseMessage);
}
