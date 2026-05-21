/**
 * Server-only: audit log for the chat system.
 * Saves every chat interaction to Firestore `chat_audit` collection.
 * Used for analytics (top questions, intent distribution, tool usage, success rate).
 */

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { todayBO } from './dateParser';
import type { AnalyticsData } from '@/types/chat';

export type { AnalyticsData };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditRecord {
  uid: string;
  role: string | null;
  branchId: string | null;
  message: string;
  intent: string;
  backend: string;
  tools: string[];
  success: boolean;
  durationMs: number;
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveAuditRecord(record: AuditRecord): Promise<void> {
  await adminDb.collection('chat_audit').add({
    uid: record.uid,
    role: record.role ?? null,
    branchId: record.branchId ?? null,
    message: record.message.slice(0, 200),
    intent: record.intent,
    backend: record.backend,
    tools: record.tools,
    success: record.success,
    durationMs: record.durationMs,
    date: todayBO(),
    timestamp: FieldValue.serverTimestamp(),
  });
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function fetchAnalytics(
  role: string | null,
  branchId: string | null,
  days = 30,
): Promise<AnalyticsData> {
  const today = todayBO();
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  const startDate = d.toISOString().slice(0, 10);

  let q = adminDb
    .collection('chat_audit')
    .where('date', '>=', startDate)
    .orderBy('date', 'asc')
    .limit(2000);

  // ENCARGADO only sees their branch
  if (role !== 'GERENTE' && branchId) {
    q = adminDb
      .collection('chat_audit')
      .where('branchId', '==', branchId)
      .where('date', '>=', startDate)
      .orderBy('date', 'asc')
      .limit(2000);
  }

  const snap = await q.get();

  const dailyMap = new Map<string, number>();
  const intentMap = new Map<string, number>();
  const toolMap = new Map<string, number>();
  const msgMap = new Map<string, number>();
  let successCount = 0;

  snap.forEach((doc) => {
    const data = doc.data();
    dailyMap.set(data.date, (dailyMap.get(data.date) ?? 0) + 1);
    if (data.intent) intentMap.set(data.intent, (intentMap.get(data.intent) ?? 0) + 1);
    if (Array.isArray(data.tools)) {
      data.tools.forEach((t: string) => toolMap.set(t, (toolMap.get(t) ?? 0) + 1));
    }
    const msg = String(data.message ?? '').slice(0, 80).trim();
    if (msg.length > 10) msgMap.set(msg, (msgMap.get(msg) ?? 0) + 1);
    if (data.success) successCount++;
  });

  const total = snap.size;

  // Fill missing days with 0
  const allDates: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(`${today}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - i);
    const dStr = dt.toISOString().slice(0, 10);
    allDates.push({ date: dStr, count: dailyMap.get(dStr) ?? 0 });
  }

  // Intent labels
  const intentLabels: Record<string, string> = {
    data: 'Datos',
    help: 'Ayuda',
    general: 'General',
    report: 'Reporte',
  };

  return {
    totalMessages: total,
    successRate: total > 0 ? Math.round((successCount / total) * 100) : 100,
    dailyCounts: allDates,
    intentDistribution: Array.from(intentMap.entries())
      .map(([k, v]) => ({ name: intentLabels[k] ?? k, value: v }))
      .sort((a, b) => b.value - a.value),
    toolUsage: Array.from(toolMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count })),
    topQuestions: Array.from(msgMap.entries())
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count })),
  };
}
