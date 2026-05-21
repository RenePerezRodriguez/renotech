/**
 * Tipos para el sistema de Chat Inteligente Renotech — Fase 2+
 */

export type ChatBackend = 'deepseek' | 'offline' | 'starting';
export type ChatFeedback = 'up' | 'down';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  data?: ChatDataPayload;
  error?: string;
  isStreaming?: boolean;
  feedback?: ChatFeedback;
  pinned?: boolean;
  /** tourId to launch after this message renders */
  tourId?: string;
  /** Quick-action buttons shown below the bubble */
  actions?: { label: string; route: string }[];
}

export interface ChatDataPayload {
  type: 'table' | 'metric' | 'list' | 'report' | 'chart';
  title?: string;
  /** table */
  headers?: string[];
  rows?: (string | number)[][];
  /** metric */
  value?: string | number;
  /** list */
  items?: string[];
  /** chart */
  chartType?: 'bar' | 'line' | 'pie';
  chartData?: { name: string; value: number; [key: string]: string | number }[];
  chartKeys?: string[]; // data keys to plot (for multi-series)
}

export interface ChatRequest {
  message:  string;
  convId?:  string | null;                                           // preferido: carga historia desde Firestore
  history?: { role: 'user' | 'assistant'; content: string }[];      // fallback: historia del cliente
  branchId?: string | null;
  userName?: string | null;
  role?:     string | null;
}

export interface ChatResponse {
  reply: string;
  data?: ChatDataPayload;
  sources?: { title: string; snippet: string }[];
  backend: ChatBackend;
}

export interface DocChunk {
  id: string;
  title: string;
  content: string;
  section: string;
  keywords: string[];
}

/** SSE event types from /api/chat */
export type ChatSSEEvent =
  | { type: 'backend';    backend: ChatBackend }
  | { type: 'chunk';      content: string }
  | { type: 'tour';       tourId: string }
  | { type: 'actions';    actions: { label: string; route: string }[] }
  | { type: 'tool_start'; tools: string[] }   // herramientas en ejecución
  | { type: 'tool_done' }                     // herramientas completadas
  | { type: 'done' }
  | { type: 'error';      message: string };

export interface ChatSystemAlert {
  id: string;
  type: 'zero_stock' | 'low_stock' | 'delayed_shipment' | 'no_cash_session' | 'morning_summary' | 'pending_credits';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  count?: number;
  action?: { label: string; route: string };
}

export interface ChatConversation {
  id: string;
  title: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  branchId?: string | null;
}

export interface ChatFavorite {
  id: string;
  label: string;
  message: string;
  createdAt: number;
}

export interface ChatAlias {
  id: string;
  /** Short trigger word/phrase the user types */
  trigger: string;
  /** Full message it expands to */
  message: string;
  createdAt: number;
}

export interface AnalyticsData {
  totalMessages: number;
  successRate: number;
  dailyCounts: { date: string; count: number }[];
  intentDistribution: { name: string; value: number }[];
  toolUsage: { name: string; count: number }[];
  topQuestions: { message: string; count: number }[];
}
