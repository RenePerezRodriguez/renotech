/**
 * Formatea un nombre completo al formato "I. Apellido"
 * Ejemplos:
 *   "Stefany Garro"           -> "S. Garro"
 *   "Juan Carlos Pérez López" -> "J. López"
 *   "Maria"                   -> "Maria"
 *   "user@email.com"          -> "user@email.com" (no parece nombre, se devuelve igual sin @)
 *   ""  / null / undefined    -> "—"
 *
 * Reglas:
 *  - Toma la inicial del PRIMER nombre.
 *  - Toma el ÚLTIMO apellido (la última palabra del nombre completo).
 *  - Si solo hay una palabra, devuelve esa palabra tal cual.
 *  - Si el valor parece un email, devuelve la parte antes del "@" (sin formatear).
 */
export function formatUserName(fullName?: string | null): string {
    if (!fullName) return '—';

    const trimmed = String(fullName).trim();
    if (!trimmed) return '—';

    // Si parece un email, devolver el local-part sin formatear (no es un nombre real)
    if (trimmed.includes('@')) {
        return trimmed.split('@')[0];
    }

    // Si parece un UID (solo caracteres alfanuméricos largos sin espacios), devolver tal cual recortado
    if (!trimmed.includes(' ') && trimmed.length > 15) {
        return trimmed.slice(0, 8) + '…';
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0];

    const firstInitial = parts[0].charAt(0).toUpperCase();
    const lastName = parts[parts.length - 1];
    return `${firstInitial}. ${lastName}`;
}
