/**
 * Parses natural language date expressions (Spanish) into concrete date ranges.
 * Bolivia timezone: UTC-4 (no DST).
 */

export interface DateRange {
  startDate: string; // YYYY-MM-DD in Bolivia time
  endDate: string;   // YYYY-MM-DD in Bolivia time
  label: string;     // Human-readable label
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Current date string YYYY-MM-DD in Bolivia (UTC-4). */
export function todayBO(): string {
  const d = new Date(Date.now() - 4 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

/** Offset a YYYY-MM-DD string by N days. */
function shiftDay(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD of the first day of a month. */
function monthStart(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-01`;
}

/** YYYY-MM-DD of the last day of a month. */
function monthEnd(year: number, month0: number): string {
  const d = new Date(Date.UTC(year, month0 + 1, 0));
  return d.toISOString().slice(0, 10);
}

/** Monday of the current ISO week (Bolivia). */
function currentMonday(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Scans a full message for date/period expressions and returns
 * the first match as a concrete DateRange.
 *
 * Supports: hoy, ayer, esta semana, la semana pasada, este mes,
 * el mes pasado, últimos N días, últimos N meses, month name (current or with year).
 */
export function parseDateExpression(message: string): DateRange | null {
  const lower = message.toLowerCase();
  const today = todayBO();
  const d = new Date(`${today}T12:00:00Z`);
  const year = d.getUTCFullYear();
  const month0 = d.getUTCMonth();

  // ── Exact day references ──────────────────────────────────────────────────
  if (/\bhoy\b/.test(lower)) {
    return { startDate: today, endDate: today, label: 'Hoy' };
  }
  if (/\bayer\b/.test(lower)) {
    const y = shiftDay(today, -1);
    return { startDate: y, endDate: y, label: 'Ayer' };
  }

  // ── Week references ───────────────────────────────────────────────────────
  if (/\besta\s+semana\b/.test(lower)) {
    return { startDate: currentMonday(today), endDate: today, label: 'Esta semana' };
  }
  if (/\b(?:la\s+)?semana\s+pasada\b/.test(lower)) {
    const prevMon = shiftDay(currentMonday(today), -7);
    const prevSun = shiftDay(prevMon, 6);
    return { startDate: prevMon, endDate: prevSun, label: 'Semana pasada' };
  }

  // ── Month references ──────────────────────────────────────────────────────
  if (/\beste\s+mes\b/.test(lower)) {
    return { startDate: monthStart(year, month0), endDate: today, label: 'Este mes' };
  }
  if (/\b(?:el\s+)?mes\s+pasado\b/.test(lower)) {
    const prevM0 = month0 === 0 ? 11 : month0 - 1;
    const prevY = month0 === 0 ? year - 1 : year;
    return { startDate: monthStart(prevY, prevM0), endDate: monthEnd(prevY, prevM0), label: 'Mes pasado' };
  }

  // ── "últimos N días" ──────────────────────────────────────────────────────
  const lastDaysM = lower.match(/[uú]ltimos?\s+(\d+)\s+d[ií]as?/);
  if (lastDaysM) {
    const n = parseInt(lastDaysM[1]);
    return { startDate: shiftDay(today, -(n - 1)), endDate: today, label: `Últimos ${n} días` };
  }

  // ── "últimos N meses" ─────────────────────────────────────────────────────
  const lastMonthsM = lower.match(/[uú]ltimos?\s+(\d+)\s+mes(?:es)?/);
  if (lastMonthsM) {
    const n = parseInt(lastMonthsM[1]);
    const startM0 = ((month0 - n) % 12 + 12) % 12;
    const startY = year - Math.ceil((n - month0) / 12);
    return { startDate: monthStart(startY, startM0), endDate: today, label: `Últimos ${n} meses` };
  }

  // ── Named month (e.g., "en enero", "de mayo", "en marzo 2024") ────────────
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const re = new RegExp(`\\b${MONTH_NAMES[i]}\\s*(\\d{4})?\\b`);
    const m = lower.match(re);
    if (m) {
      const y = m[1] ? parseInt(m[1]) : year;
      const mStart = monthStart(y, i);
      const mEnd = monthEnd(y, i);
      const actualEnd = mEnd > today ? today : mEnd;
      if (mStart <= today) {
        const label = `${MONTH_NAMES[i].charAt(0).toUpperCase() + MONTH_NAMES[i].slice(1)}${m[1] ? ' ' + y : ''}`;
        return { startDate: mStart, endDate: actualEnd, label };
      }
    }
  }

  return null;
}

/** Format a DateRange as start/end Date objects using Bolivia offset. */
export function rangeToDateObjects(range: DateRange): { start: Date; end: Date } {
  return {
    start: new Date(`${range.startDate}T00:00:00-04:00`),
    end: new Date(`${range.endDate}T23:59:59-04:00`),
  };
}
