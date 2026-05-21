import { Timestamp, FieldValue } from 'firebase/firestore';

/**
 * Normaliza cualquier entrada de tiempo (Date, Timestamp, FieldValue, string) a un objeto Date nativo.
 */
export const ensureDate = (t: Date | Timestamp | FieldValue | string | null | undefined): Date => {
    if (!t) return new Date();
    if (t instanceof Date) return t;
    if (t && typeof t === 'object' && 'toDate' in t && typeof t.toDate === 'function') {
        return (t as Timestamp).toDate();
    }
    if (t && typeof t === 'object' && 'seconds' in t) {
        return new Date(t.seconds * 1000);
    }
    if (typeof t === 'string') {
        return new Date(t);
    }
    return new Date();
};

// ============================================================================
// FORMATO UNIFICADO — Bolivia (es-BO, America/La_Paz, UTC-4 fijo, sin DST)
// ============================================================================

const BO_LOCALE = 'es-BO';
const BO_TZ = 'America/La_Paz';

type DateInput = Date | Timestamp | FieldValue | string | null | undefined;

/** Fecha corta: 15/01/2026 */
export const formatDate = (t: DateInput): string => {
    const d = ensureDate(t);
    return d.toLocaleDateString(BO_LOCALE, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: BO_TZ,
    });
};

/** Hora corta 24h: 14:30 */
export const formatTime = (t: DateInput): string => {
    const d = ensureDate(t);
    return d.toLocaleTimeString(BO_LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: BO_TZ,
    });
};

/** Fecha + hora: 15/01/2026 14:30 */
export const formatDateTime = (t: DateInput): string => `${formatDate(t)} ${formatTime(t)}`;

/** Fecha larga: 15 de enero de 2026 */
export const formatDateLong = (t: DateInput): string => {
    const d = ensureDate(t);
    return d.toLocaleDateString(BO_LOCALE, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: BO_TZ,
    });
};
