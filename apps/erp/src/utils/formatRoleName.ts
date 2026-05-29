/**
 * Convierte un ID de rol (canónico o legacy) en un nombre legible.
 *
 * Ejemplos:
 *   "GERENTE"           -> "Gerente"
 *   "ENCARGADO_VENTAS"  -> "Encargado de Ventas"
 *   "ALMACENERO"        -> "Almacenero"
 *   "CAJERO" (legacy)   -> "Encargado de Ventas"
 *   "ROL_PERSONALIZADO" -> "Rol Personalizado" (fallback)
 *   null / undefined    -> "—"
 *
 * Si en el contexto se cuenta con el `name` del rol cargado desde Firestore
 * (ej. roles personalizados), pasarlo como segundo parámetro tiene prioridad.
 */
const SYSTEM_LABELS: Record<string, string> = {
    GERENTE: 'Gerente',
    ENCARGADO_VENTAS: 'Encargado de Ventas',
    ALMACENERO: 'Almacenero',
    CAJERO: 'Encargado de Ventas',
};

export function formatRoleName(roleId?: string | null, customLabel?: string | null): string {
    if (customLabel && customLabel.trim()) return customLabel.trim();
    if (!roleId) return '—';
    const id = String(roleId).trim();
    if (!id) return '—';
    if (SYSTEM_LABELS[id]) return SYSTEM_LABELS[id];
    return id
        .toLowerCase()
        .split('_')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
