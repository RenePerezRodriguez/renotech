/**
 * Permisos canónicos del sistema (server-side mirror).
 *
 * IMPORTANTE: este archivo debe permanecer en sync con
 * `src/lib/permissions.ts` del cliente. Como Cloud Functions y la app cliente
 * usan tsconfigs separados, no podemos importar directamente; mantenemos
 * un mirror estricto. Si añades un permiso, hazlo en AMBOS lados.
 */

export const PERMISSIONS = {
    WILDCARD: '*',
    AUDIT_RESOLVE: 'audit:resolve',
    APPROVALS_APPROVE: 'approvals:approve',
    ENTITIES_DELETE: 'entities:delete',
    EXPENSES_VOID: 'expenses:void',
    DISCREPANCIES_RESOLVE: 'discrepancies:resolve',
    CANCELLATIONS_APPROVE: 'cancellations:approve',
    CASHIER_FORCE: 'cashier:force',
    PRICES_EDIT: 'prices:edit',
} as const;

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
    GERENTE: [PERMISSIONS.WILDCARD],
    ALMACENERO: [],
    ENCARGADO_VENTAS: [],
};

export function resolvePermissionsForRole(
    roleId: string,
    rolePermissions?: string[] | null,
): string[] {
    const fromDefaults = DEFAULT_ROLE_PERMISSIONS[roleId];
    if (fromDefaults) return [...fromDefaults];
    return Array.isArray(rolePermissions) ? [...rolePermissions] : [];
}

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
