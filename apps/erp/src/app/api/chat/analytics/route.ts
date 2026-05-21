/**
 * GET /api/chat/analytics
 * Returns chat usage analytics for GERENTE and ENCARGADO roles only.
 */

import { adminAuth } from '@/lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { fetchAnalytics } from '@/lib/chat/audit';

async function verifyToken(req: NextRequest): Promise<{ ok: boolean; uid?: string }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return { ok: false };
  const token = authHeader.substring(7).trim();
  if (!token) return { ok: false };
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { ok: true, uid: decoded.uid };
  } catch {
    return { ok: false };
  }
}

export async function GET(req: NextRequest) {
  const auth = await verifyToken(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = req.nextUrl.searchParams.get('role');
  const branchId = req.nextUrl.searchParams.get('branchId');
  const rawDays = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10);
  const days = isNaN(rawDays) ? 30 : Math.min(Math.max(rawDays, 7), 90);

  if (role !== 'GERENTE' && role !== 'ENCARGADO') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = await fetchAnalytics(role, branchId, days);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[Analytics]', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
