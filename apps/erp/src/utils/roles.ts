/**
 * Role utilities — canonical helpers to check role identity.
 * Includes backward compatibility for the legacy 'CAJERO' ID.
 */

/** Canonical system role IDs */
export const SYSTEM_ROLES = {
    GERENTE: 'GERENTE',
    ENCARGADO_VENTAS: 'ENCARGADO_VENTAS',
    ALMACENERO: 'ALMACENERO',
} as const;

/** Legacy aliases that should resolve to current role IDs */
const LEGACY_ALIASES: Record<string, string> = {
    CAJERO: SYSTEM_ROLES.ENCARGADO_VENTAS,
};

/** Resolve a role ID to its canonical form (handles legacy aliases) */
export function resolveRoleId(roleId: string | null | undefined): string | null {
    if (!roleId) return null;
    return LEGACY_ALIASES[roleId] || roleId;
}

/** Check if a role (possibly legacy) matches a specific canonical role */
export function isRole(userRole: string | null | undefined, targetRole: string): boolean {
    const resolved = resolveRoleId(userRole);
    return resolved === targetRole;
}

/** Check if the user is internal staff (any system role) */
export function isStaff(userRole: string | null | undefined): boolean {
    const resolved = resolveRoleId(userRole);
    return resolved === SYSTEM_ROLES.GERENTE
        || resolved === SYSTEM_ROLES.ENCARGADO_VENTAS
        || resolved === SYSTEM_ROLES.ALMACENERO;
}

/** Check if the user is an Encargado de Ventas (or legacy CAJERO) */
export function isEncargadoVentas(userRole: string | null | undefined): boolean {
    return isRole(userRole, SYSTEM_ROLES.ENCARGADO_VENTAS);
}
