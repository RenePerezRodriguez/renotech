/**
 * API ROUTE: /api/chat
 *
 * GET  → ping + alertas proactivas
 * POST → SSE streaming con DeepSeek V4 Flash
 *
 * Arquitectura rediseñada:
 *   - Sin clasificador de intención (regex eliminados)
 *   - Prompt unificado — el modelo decide si usar herramientas o no
 *   - RAG semántico (Vertex AI embeddings)
 *   - Historia cargada server-side desde Firestore (via convId)
 *   - Ejecución paralela de herramientas
 *   - Fallback offline limpio (sin 400 líneas de regex)
 */

import { adminAuth, adminDb }          from '@/lib/firebase-admin';
import { NextRequest, NextResponse }   from 'next/server';
import { searchDocs, buildRagContext, warmupRag } from '@/lib/chat/rag';
import { buildSystemPrompt }           from '@/lib/chat/orchestrator';
import { TOOL_DEFINITIONS, executeToolCall, resolveBranchName } from '@/lib/chat/tools';
import { fetchAlerts }                 from '@/lib/chat/alerts';
import { saveAuditRecord }             from '@/lib/chat/audit';
import { todayBO }                     from '@/lib/chat/dateParser';
import type { ToolCall }               from '@/lib/chat/tools';
import type { ChatRequest, ChatBackend } from '@/types/chat';

// Pre-calentar el índice RAG en el primer import del módulo
warmupRag();

// ─── Auth ────────────────────────────────────────────────────────────────────

async function verifyToken(req: NextRequest): Promise<{ ok: boolean; uid?: string; reason?: string }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, reason: 'missing_token' };
  const token = authHeader.substring(7).trim();
  if (!token) return { ok: false, reason: 'missing_token' };
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { ok: true, uid: decoded.uid };
  } catch {
    return { ok: false, reason: 'invalid_token' };
  }
}

// ─── Historia server-side ─────────────────────────────────────────────────────

interface HistoryMessage { role: 'user' | 'assistant'; content: string }

async function loadHistoryFromFirestore(uid: string, convId: string, maxMessages = 12): Promise<HistoryMessage[]> {
  try {
    const snap = await adminDb
      .collection('user_chat').doc(uid)
      .collection('conversations').doc(convId)
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .get();

    const all = snap.docs.map(d => ({
      role:    d.data().role as 'user' | 'assistant',
      content: d.data().content as string ?? '',
    }));

    // Si hay más de maxMessages, resumir los más viejos
    if (all.length <= maxMessages) return all;
    return all.slice(-maxMessages);
  } catch (err) {
    console.error('[Chat] Error cargando historia:', err);
    return [];
  }
}

/**
 * Si la conversación es larga, genera un resumen de los mensajes más viejos.
 * Usa una llamada barata a DeepSeek (max_tokens=200).
 */
async function summarizeOldMessages(messages: HistoryMessage[]): Promise<string> {
  if (!DEEPSEEK_API_KEY) return '';
  try {
    const text = messages.map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`).join('\n');
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: 'Resume brevemente esta conversación en 2-3 oraciones, capturando el contexto y temas tratados. Responde solo con el resumen, sin preámbulo.' },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  } catch {
    return '';
  }
}

// ─── DeepSeek ────────────────────────────────────────────────────────────────

const DEEPSEEK_API_KEY  = process.env.DEEPSEEK_API_KEY ?? '';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL    = 'deepseek-v4-flash';

interface RawLlmResult { text: string | null; toolCalls: ToolCall[] | null }

async function callDeepSeek(
  systemPrompt: string,
  userMessage:  string,
  history:      HistoryMessage[],
  withTools:    boolean,
): Promise<RawLlmResult> {
  const openaiTools = TOOL_DEFINITIONS.map(t => ({ type: 'function' as const, function: t.function }));
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user' as const, content: userMessage },
  ];

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model:        DEEPSEEK_MODEL,
      messages,
      tools:        openaiTools,
      tool_choice:  'auto',
      temperature:  0.3,
      max_tokens:   withTools ? 512 : 1024,
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);

  const data   = await res.json();
  const choice = data.choices?.[0]?.message;

  const toolCalls: ToolCall[] = (choice?.tool_calls ?? []).map((tc: { function: { name: string; arguments: string | Record<string, unknown> } }) => {
    let args: Record<string, unknown> = {};
    try { args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function.arguments ?? {}); } catch { /* */ }
    return { name: tc.function.name, arguments: args };
  });

  return { text: choice?.content ?? null, toolCalls: toolCalls.length > 0 ? toolCalls : null };
}

/** Stream real desde DeepSeek hacia el SSE controller. */
async function streamDeepSeek(
  messages: { role: string; content: string }[],
  ctrl:     ReadableStreamDefaultController,
): Promise<void> {
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, messages, stream: true, temperature: 0.3, max_tokens: 1024 }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) throw new Error(`DeepSeek streaming ${res.status}`);
  if (!res.body) throw new Error('No response body');

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const parsed  = JSON.parse(payload);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) sendEvent(ctrl, { type: 'chunk', content });
        } catch { /* skip malformed */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Fallback offline ─────────────────────────────────────────────────────────

function offlineResponse(): string {
  return 'En este momento no puedo conectarme al servidor de IA. Navega al módulo que necesites desde el menú lateral, o inténtalo de nuevo en unos minutos.';
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────

const sseEncoder = new TextEncoder();

function sendEvent(ctrl: ReadableStreamDefaultController, data: object) {
  ctrl.enqueue(sseEncoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

/** Simula typing emitiendo tokens palabra a palabra (18ms/token). */
async function fakeStream(text: string, ctrl: ReadableStreamDefaultController) {
  const sleep  = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  const tokens = text.match(/\S+\s*/g) ?? [text];
  for (const token of tokens) {
    sendEvent(ctrl, { type: 'chunk', content: token });
    await sleep(18);
  }
}

// ─── Tour marker ──────────────────────────────────────────────────────────────

const TOUR_RE = /\[TOUR:([a-z0-9-]+)\]/gi;

function extractTour(text: string): { clean: string; tourId: string | null } {
  let tourId: string | null = null;
  const clean = text.replace(TOUR_RE, (_, id) => { tourId = id; return ''; }).trim();
  return { clean, tourId };
}

// ─── Quick actions (tool → ruta) ─────────────────────────────────────────────

const TOOL_ROUTES: Record<string, { label: string; route: string }> = {
  get_product_stock:       { label: '📦 Ver inventario', route: '/inventario' },
  get_low_stock_products:  { label: '📦 Ver inventario', route: '/inventario' },
  get_daily_sales_summary: { label: '💰 Ver ventas',     route: '/ventas' },
  get_weekly_sales:        { label: '💰 Ver ventas',     route: '/ventas' },
  get_cash_status:         { label: '🧾 Ver caja',       route: '/caja' },
  get_pending_transfers:   { label: '🚚 Ver envíos',     route: '/envios' },
  get_client_credits:      { label: '👥 Ver créditos',   route: '/creditos' },
  compare_branches_sales:  { label: '📊 Ver gerencia',   route: '/gerencia' },
};

function quickActionsFor(toolNames: string[]): { label: string; route: string }[] {
  const seen = new Set<string>();
  return toolNames.flatMap(n => TOOL_ROUTES[n] ? [TOOL_ROUTES[n]] : [])
    .filter(({ route }) => seen.has(route) ? false : (seen.add(route), true));
}

// ─── Cache en memoria (5 min, solo respuestas de texto) ──────────────────────

const _cache = new Map<string, { text: string; ts: number }>();
const CACHE_TTL = 5 * 60_000;

function getCached(key: string): string | null {
  const e = _cache.get(key);
  if (!e || Date.now() - e.ts > CACHE_TTL) return null;
  return e.text;
}
function setCache(key: string, text: string) {
  _cache.set(key, { text, ts: Date.now() });
  if (_cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of _cache) if (now - v.ts > CACHE_TTL) _cache.delete(k);
  }
}

// ─── Rate limiting (in-memory, resetea al reiniciar) ─────────────────────────

const _rateMin  = new Map<string, { count: number; resetAt: number }>();
const _rateDay  = new Map<string, { date: string; count: number }>();
const RATE_PER_MIN = 20;
const DAILY_LIMITS: Record<string, number> = { GERENTE: Infinity, ENCARGADO: 100, VENDEDOR: 50 };

function checkRateMin(uid: string): boolean {
  const now = Date.now();
  const e   = _rateMin.get(uid);
  if (!e || now > e.resetAt) { _rateMin.set(uid, { count: 1, resetAt: now + 60_000 }); return true; }
  if (e.count >= RATE_PER_MIN) return false;
  e.count++; return true;
}
function checkRateDay(uid: string, role: string | null): boolean {
  const today = todayBO();
  const limit = (role ? DAILY_LIMITS[role] : undefined) ?? 30;
  if (!isFinite(limit)) return true;
  const e = _rateDay.get(uid);
  if (!e || e.date !== today) { _rateDay.set(uid, { date: today, count: 1 }); return true; }
  if (e.count >= limit) return false;
  e.count++; return true;
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await verifyToken(req);
  if (!auth.ok) return NextResponse.json({ backend: 'offline', alerts: [] });

  const backend  = DEEPSEEK_API_KEY ? 'deepseek' : 'offline';
  const branchId = req.nextUrl.searchParams.get('branchId');
  const role     = req.nextUrl.searchParams.get('role');
  let alerts: import('@/types/chat').ChatSystemAlert[] = [];
  try { alerts = await fetchAlerts(auth.uid!, role, branchId); } catch { /* non-critical */ }

  return NextResponse.json({ backend, alerts });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Auth
  const auth = await verifyToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: 401 });

  // 2. Rate limit
  if (!checkRateMin(auth.uid!))  return NextResponse.json({ error: 'rate_limit_exceeded' },  { status: 429 });

  // 3. Parse body
  let body: ChatRequest;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { message, convId, history: clientHistory = [], userName = null, branchId = null, role = null } = body;
  if (!message?.trim()) return NextResponse.json({ error: 'message is required' }, { status: 400 });
  if (!checkRateDay(auth.uid!, role)) return NextResponse.json({ error: 'daily_limit_exceeded' }, { status: 429 });

  const startMs = Date.now();

  // 4. Context building en paralelo
  const [ragChunks, branchName, rawHistory] = await Promise.all([
    searchDocs(message, 5).catch(() => []),
    branchId ? resolveBranchName(branchId).catch(() => null) : Promise.resolve(null),
    convId
      ? loadHistoryFromFirestore(auth.uid!, convId, 24)
      : Promise.resolve(clientHistory as HistoryMessage[]),
  ]);

  // 5. Windowing + auto-resumen para conversaciones largas
  const WINDOW = 12;
  let recentHistory = rawHistory;
  let conversationSummary: string | null = null;

  if (rawHistory.length > WINDOW) {
    const older = rawHistory.slice(0, -WINDOW);
    recentHistory = rawHistory.slice(-WINDOW);
    conversationSummary = await summarizeOldMessages(older);
  }

  // 6. System prompt unificado
  const ragContext   = buildRagContext(ragChunks);
  const systemPrompt = buildSystemPrompt({ userName, role, branchName, ragContext, conversationSummary });

  // 7. SSE stream
  const stream = new ReadableStream({
    async start(ctrl) {
      let _backend: ChatBackend = 'offline';
      let _tools:   string[]    = [];
      let _success              = false;

      try {
        if (!DEEPSEEK_API_KEY) {
          sendEvent(ctrl, { type: 'backend', backend: 'offline' });
          sendEvent(ctrl, { type: 'chunk', content: offlineResponse() });
          sendEvent(ctrl, { type: 'done' });
          ctrl.close();
          return;
        }

        // Cache check (solo respuestas sin herramientas)
        const cacheKey = `${auth.uid!}:${message.trim().toLowerCase()}`;
        const cached   = getCached(cacheKey);
        if (cached) {
          sendEvent(ctrl, { type: 'backend', backend: 'deepseek' });
          await fakeStream(cached, ctrl);
          sendEvent(ctrl, { type: 'done' });
          ctrl.close();
          return;
        }

        sendEvent(ctrl, { type: 'backend', backend: 'deepseek' });
        _backend = 'deepseek';

        // Phase 1: detectar tool calls
        const phase1 = await callDeepSeek(systemPrompt, message, recentHistory, true);

        if (!phase1.toolCalls?.length) {
          // Sin herramientas — stream directo
          const rawText = phase1.text ?? offlineResponse();
          const { clean, tourId } = extractTour(rawText);

          await fakeStream(clean, ctrl);
          setCache(cacheKey, clean);
          if (tourId) sendEvent(ctrl, { type: 'tour', tourId });

        } else {
          // Con herramientas — ejecutar en paralelo
          _tools = phase1.toolCalls.map(t => t.name);
          sendEvent(ctrl, { type: 'tool_start', tools: _tools });

          const quickActions = quickActionsFor(_tools);
          if (quickActions.length) sendEvent(ctrl, { type: 'actions', actions: quickActions });

          const toolCtx  = { branchId, uid: auth.uid! };
          const settled  = await Promise.allSettled(phase1.toolCalls.map(call => executeToolCall(call, toolCtx)));
          const toolResults = settled.map((r, i) => ({
            name:   phase1.toolCalls![i].name,
            result: r.status === 'fulfilled' ? r.value : `❌ Error: ${(r.reason as Error).message}`,
          }));

          sendEvent(ctrl, { type: 'tool_done' });

          // Phase 2: respuesta final con resultados inyectados
          const toolSummary = toolResults.map(tr => `[${tr.name}]:\n${tr.result}`).join('\n\n');
          const phase2System = `${systemPrompt}\n\n─── DATOS CONSULTADOS ───\n\n${toolSummary}\n\n─── FIN DATOS ───\n\nResponde al usuario usando los datos anteriores. Sé directo y claro.`;

          try {
            await streamDeepSeek([
              { role: 'system', content: phase2System },
              ...recentHistory,
              { role: 'user', content: message },
            ], ctrl);
          } catch {
            // Fallback: mostrar resultados directamente
            for (const tr of toolResults) {
              sendEvent(ctrl, { type: 'chunk', content: tr.result + '\n\n' });
            }
          }
        }

        _success = true;
        sendEvent(ctrl, { type: 'done' });

      } catch (err) {
        console.error('[Chat SSE]', err);
        sendEvent(ctrl, { type: 'chunk', content: offlineResponse() });
        sendEvent(ctrl, { type: 'backend', backend: 'offline' });
        sendEvent(ctrl, { type: 'done' });
      } finally {
        ctrl.close();
        saveAuditRecord({
          uid:       auth.uid!,
          role,
          branchId,
          message,
          intent:    _tools.length ? 'data' : 'help',
          backend:   _backend,
          tools:     _tools,
          success:   _success,
          durationMs: Date.now() - startMs,
        }).catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':    'text/event-stream; charset=utf-8',
      'Cache-Control':   'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
