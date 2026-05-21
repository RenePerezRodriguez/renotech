/**
 * Server-side alert fetching for the proactive notification system.
 * Runs only on the server (imported by route.ts).
 * All queries are cached 5 min per user+branch to avoid excessive Firestore reads.
 */

import { adminDb } from '@/lib/firebase-admin';
import { todayBO } from './dateParser';
import type { ChatSystemAlert } from '@/types/chat';

// ─── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, { data: ChatSystemAlert[]; at: number }>();
const TTL = 5 * 60_000;

// ─── Individual checks ────────────────────────────────────────────────────────

async function checkZeroStock(branchId: string, alerts: ChatSystemAlert[]) {
  const snap = await adminDb
    .collection('productos')
    .where('branchId', '==', branchId)
    .where('isActive', '==', true)
    .where('stock', '==', 0)
    .count()
    .get();

  const n = snap.data().count;
  if (n > 0) {
    alerts.push({
      id: 'zero_stock',
      type: 'zero_stock',
      severity: 'critical',
      title: `${n} producto${n > 1 ? 's' : ''} agotado${n > 1 ? 's' : ''}`,
      message: `Hay ${n} producto${n > 1 ? 's' : ''} con stock en cero en tu sucursal. Revisa el inventario.`,
      count: n,
      action: { label: 'Ver inventario', route: '/inventario' },
    });
  }
}

async function checkLowStock(branchId: string, alerts: ChatSystemAlert[]) {
  // Sample first 80 active products and filter client-side
  // (Firestore can't compare two fields in a single query)
  const snap = await adminDb
    .collection('productos')
    .where('branchId', '==', branchId)
    .where('isActive', '==', true)
    .limit(80)
    .get();

  let lowCount = 0;
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.stock > 0 && d.stock <= (d.minStock ?? 5)) lowCount++;
  });

  if (lowCount > 0) {
    alerts.push({
      id: 'low_stock',
      type: 'low_stock',
      severity: 'warning',
      title: `${lowCount} producto${lowCount > 1 ? 's' : ''} con stock bajo`,
      message: `${lowCount} producto${lowCount > 1 ? 's' : ''} están por debajo del mínimo. Considera reabastecerte pronto.`,
      count: lowCount,
      action: { label: 'Ver stock bajo', route: '/inventario' },
    });
  }
}

async function checkDelayedShipments(branchId: string, alerts: ChatSystemAlert[]) {
  const fourHoursAgo = new Date(Date.now() - 4 * 3_600_000);

  const [inSnap, outSnap] = await Promise.all([
    adminDb
      .collection('envios')
      .where('toBranchId', '==', branchId)
      .where('status', 'in', ['en_transito', 'preparacion'])
      .where('createdAt', '<', fourHoursAgo)
      .count()
      .get(),
    adminDb
      .collection('envios')
      .where('fromBranchId', '==', branchId)
      .where('status', '==', 'preparacion')
      .where('createdAt', '<', fourHoursAgo)
      .count()
      .get(),
  ]);

  const n = inSnap.data().count + outSnap.data().count;
  if (n > 0) {
    alerts.push({
      id: 'delayed_shipment',
      type: 'delayed_shipment',
      severity: 'warning',
      title: `${n} envío${n > 1 ? 's' : ''} demorado${n > 1 ? 's' : ''}`,
      message: `${n} envío${n > 1 ? 's' : ''} lleva${n === 1 ? '' : 'n'} más de 4 horas sin actualización.`,
      count: n,
      action: { label: 'Ver envíos', route: '/envios' },
    });
  }
}

async function checkCashSession(branchId: string, alerts: ChatSystemAlert[]) {
  const snap = await adminDb
    .collection('sesiones_caja')
    .where('branchId', '==', branchId)
    .where('status', '==', 'OPEN')
    .limit(1)
    .get();

  if (snap.empty) {
    alerts.push({
      id: 'no_cash_session',
      type: 'no_cash_session',
      severity: 'warning',
      title: 'Caja no abierta',
      message: 'No hay sesión de caja activa. Abre caja para registrar ventas correctamente.',
      action: { label: 'Abrir caja', route: '/caja' },
    });
  }
}

async function checkMorningSummary(branchId: string, alerts: ChatSystemAlert[]) {
  const today = todayBO();
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const yStr = d.toISOString().slice(0, 10);

  const snap = await adminDb
    .collection('ventas')
    .where('branchId', '==', branchId)
    .where('createdAt', '>=', new Date(`${yStr}T00:00:00-04:00`))
    .where('createdAt', '<=', new Date(`${yStr}T23:59:59-04:00`))
    .get();

  let total = 0;
  snap.forEach((doc) => { total += doc.data().total || 0; });

  if (snap.size > 0) {
    alerts.push({
      id: 'morning_summary',
      type: 'morning_summary',
      severity: 'info',
      title: 'Resumen de ayer',
      message: `Ayer: ${snap.size} venta${snap.size > 1 ? 's' : ''} — Bs. ${total.toFixed(2)}.`,
      count: snap.size,
      action: { label: 'Ver ventas', route: '/ventas' },
    });
  }
}

async function checkPendingCredits(branchId: string, alerts: ChatSystemAlert[]) {
  const snap = await adminDb
    .collection('ventas')
    .where('branchId', '==', branchId)
    .where('paymentMethod', '==', 'CREDITO')
    .where('creditStatus', 'in', ['PENDIENTE', 'PARCIAL'])
    .count()
    .get();

  const n = snap.data().count;
  if (n > 0) {
    alerts.push({
      id: 'pending_credits',
      type: 'pending_credits',
      severity: 'info',
      title: `${n} crédito${n > 1 ? 's' : ''} pendiente${n > 1 ? 's' : ''}`,
      message: `${n} venta${n > 1 ? 's' : ''} a crédito sin cobrar en tu sucursal.`,
      count: n,
      action: { label: 'Ver créditos', route: '/clientes' },
    });
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchAlerts(
  uid: string,
  role: string | null,
  branchId: string | null,
): Promise<ChatSystemAlert[]> {
  const key = `${uid}:${branchId}:${role}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL) return cached.data;

  const alerts: ChatSystemAlert[] = [];
  if (!branchId) return alerts;

  // Bolivia current hour
  const hourBO = new Date(Date.now() - 4 * 3_600_000).getUTCHours();
  const isBusinessHours = hourBO >= 7 && hourBO < 22;
  const isMorning = hourBO >= 7 && hourBO < 13;
  const canSeeCreditAlerts = role === 'GERENTE' || role === 'ENCARGADO';

  try {
    const checks: Promise<void>[] = [
      checkZeroStock(branchId, alerts),
      checkLowStock(branchId, alerts),
      checkDelayedShipments(branchId, alerts),
    ];

    if (isBusinessHours) checks.push(checkCashSession(branchId, alerts));
    if (isMorning) checks.push(checkMorningSummary(branchId, alerts));
    if (canSeeCreditAlerts) checks.push(checkPendingCredits(branchId, alerts));

    await Promise.allSettled(checks);
  } catch { /* non-critical */ }

  // Sort: critical first, then warning, then info
  const order = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  cache.set(key, { data: alerts, at: Date.now() });
  return alerts;
}
