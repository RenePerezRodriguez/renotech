/**
 * Permisos canónicos del sistema (RBAC granular).
 *
 * Los permisos se almacenan en:
 *  - `roles.{id}.permissions: string[]` (definición del rol)
 *  - Custom claim del usuario: `permissions: string[]` (snapshot al asignar rol)
 *  - Reglas Firestore consultan via `hasPerm()` (helper en firestore.rules)
 *
 * Diseño:
 *  - String constants para evitar typos.
 *  - Wildcard `'*'` concede TODOS los permisos (usado por GERENTE).
 *  - La verificación se hace tanto en UI (oculta botones) como en reglas (defensa final).
 *
 * Cómo añadir un permiso nuevo:
 *  1. Agregar la constante aquí.
 *  2. Agregarlo a `ALL_PERMISSIONS` para que la UI de roles lo muestre.
 *  3. Si aplica, mapearlo a un default role en `DEFAULT_ROLE_PERMISSIONS`.
 *  4. Usarlo en `firestore.rules` con `hasPerm('id:accion')`.
 */

export const PERMISSIONS = {
    /** Bypass total: concede cualquier permiso. Reservado para GERENTE. */
    WILDCARD: '*',

    /** Resolver alertas de auditoría (no solo marcar como leído). */
    AUDIT_RESOLVE: 'audit:resolve',

    /** Aprobar/rechazar solicitudes pendientes (anulación de venta, descuento alto). */
    APPROVALS_APPROVE: 'approvals:approve',

    /** Borrar entidades comerciales (clientes, proveedores, transportistas). */
    ENTITIES_DELETE: 'entities:delete',

    /** Anular gastos operativos (status → VOIDED). */
    EXPENSES_VOID: 'expenses:void',

    /** Resolver discrepancias de envíos (campos discrepancy*). */
    DISCREPANCIES_RESOLVE: 'discrepancies:resolve',

    /** Aprobar cancelaciones de envíos / pedidos (campos cancellation*). */
    CANCELLATIONS_APPROVE: 'cancellations:approve',

    /** Forzar cierre/reapertura de sesiones de caja ajenas. */
    CASHIER_FORCE: 'cashier:force',

    /** Editar precios de venta (productos.precio*, precio en catálogo maestro). */
    PRICES_EDIT: 'prices:edit',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/** Lista exhaustiva (sin wildcard) — usada por la UI de roles para render de checkboxes. */
export const ALL_PERMISSIONS: { id: Permission; label: string; description: string }[] = [
    {
        id: PERMISSIONS.AUDIT_RESOLVE,
        label: 'Resolver alertas de auditoría',
        description: 'Cerrar/marcar como resuelta una alerta (con nota). Marcar "visto" siempre está disponible.',
    },
    {
        id: PERMISSIONS.APPROVALS_APPROVE,
        label: 'Aprobar solicitudes pendientes',
        description: 'Anulación de ventas cross-shift y aprobación de descuentos altos.',
    },
    {
        id: PERMISSIONS.ENTITIES_DELETE,
        label: 'Borrar clientes/proveedores/transportistas',
        description: 'Eliminar (no solo desactivar) entidades comerciales.',
    },
    {
        id: PERMISSIONS.EXPENSES_VOID,
        label: 'Anular gastos operativos',
        description: 'Cambiar status de un gasto a VOIDED y revertir su asiento de caja.',
    },
    {
        id: PERMISSIONS.DISCREPANCIES_RESOLVE,
        label: 'Resolver discrepancias de envíos',
        description: 'Aplicar acciones correctivas a items con discrepancia tras recepción.',
    },
    {
        id: PERMISSIONS.CANCELLATIONS_APPROVE,
        label: 'Aprobar cancelaciones de envíos/pedidos',
        description: 'Aprobar o rechazar solicitudes de cancelación pendientes.',
    },
    {
        id: PERMISSIONS.CASHIER_FORCE,
        label: 'Forzar cierre/reapertura de cajas ajenas',
        description: 'Cerrar sesiones de cajero que no son propias (gerencia operativa).',
    },
    {
        id: PERMISSIONS.PRICES_EDIT,
        label: 'Editar precios de venta',
        description: 'Modificar precioConFactura/precioSinFactura en productos.',
    },
];

/**
 * Permisos por rol del sistema (defaults).
 * Roles personalizados parten de `[]` y se editan en la UI.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
    GERENTE: [PERMISSIONS.WILDCARD],
    ALMACENERO: [],
    ENCARGADO_VENTAS: [],
};

/**
 * Calcula los permisos efectivos para un rol dado.
 * Para roles del sistema usa `DEFAULT_ROLE_PERMISSIONS`.
 * Para roles personalizados usa el array `permissions` del doc del rol.
 */
export function resolvePermissionsForRole(
    roleId: string,
    rolePermissions?: string[] | null,
): string[] {
    const fromDefaults = DEFAULT_ROLE_PERMISSIONS[roleId];
    if (fromDefaults) return [...fromDefaults];
    return Array.isArray(rolePermissions) ? [...rolePermissions] : [];
}

/**
 * Verifica si un set de permisos incluye uno específico.
 * Tolera wildcard `'*'`. Útil en componentes/servicios cliente.
 */
export function hasPermission(userPermissions: string[] | null | undefined, required: Permission): boolean {
    if (!userPermissions || userPermissions.length === 0) return false;
    if (userPermissions.includes(PERMISSIONS.WILDCARD)) return true;
    return userPermissions.includes(required);
}

/**
 * Construye el objeto de custom claims de Auth a partir de rol + branch + permisos.
 * Único punto de verdad usado por la API y la Cloud Function.
 */
export function buildCustomClaims(input: {
    role: string;
    branchId: string | null;
    permissions: string[];
}): { role: string; branchId: string | null; permissions: string[] } {
    return {
        role: input.role,
        branchId: input.branchId ?? null,
        permissions: input.permissions,
    };
}
