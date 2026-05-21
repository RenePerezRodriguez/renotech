import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/** Timezone offset for Bolivia (UTC-4). Change this to adapt to other regions. */
const TZ_OFFSET = '-04:00'

/** Convierte una fecha YYYY-MM-DD a Date al inicio del día en la zona local. */
export function startOfDay(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00${TZ_OFFSET}`)
}

/** Convierte una fecha YYYY-MM-DD a Date al final del día en la zona local. */
export function endOfDay(dateStr: string): Date {
    return new Date(`${dateStr}T23:59:59${TZ_OFFSET}`)
}

/** Convierte una fecha YYYY-MM-DD a Date al mediodía en la zona local. */
export function midday(dateStr: string): Date {
    return new Date(`${dateStr}T12:00:00${TZ_OFFSET}`)
}

/**
 * Devuelve la fecha actual en formato YYYY-MM-DD según la zona horaria local
 * configurada (Bolivia UTC-4 por defecto). Evita el bug clásico de usar
 * `new Date().toISOString().split('T')[0]`, que devuelve la fecha en UTC y, en
 * horario nocturno local, adelanta el día (ej. 23:20 local Bolivia → UTC ya es
 * el día siguiente). Esto es crítico para inputs `<input type="date">` y para
 * la detección de "hoy vs retroactivo".
 */
export function localDateStr(date: Date = new Date()): string {
    // Aplicamos manualmente el offset Bolivia para obtener la fecha local.
    const offsetHours = parseInt(TZ_OFFSET.slice(0, 3), 10) // -04
    const local = new Date(date.getTime() + offsetHours * 60 * 60 * 1000)
    return local.toISOString().split('T')[0]
}
