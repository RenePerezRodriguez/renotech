'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import {
  Send, Trash2, Loader2, Sparkles, Wifi, WifiOff, Cpu,
  Minimize2, Maximize2, ChevronDown, Search, X, Pin,
  Star, StarOff, Hash, Zap, BarChart2, MoreHorizontal,
} from 'lucide-react';
import { useChat } from '@/contexts/ChatContext';
import { useTour } from '@/hooks/useTour';
import { useBranch } from '@/contexts/BranchContext';
import ChatMessageBubble from './ChatMessageBubble';
import ConversationTabs from './ConversationTabs';
import AlertsPanel from './AlertsPanel';
import AnalyticsPanel from './AnalyticsPanel';
import type { ChatBackend } from '@/types/chat';
import { getSuggestions } from '@/lib/chat/suggestions';
import { useAuth } from '@/contexts/AuthContext';

// ─── Contextual welcome chips by module ───────────────────────────────────────

const MODULE_WELCOME_CHIPS: Record<string, { icon: string; label: string; message: string }[]> = {
  '/punto-de-venta': [
    { icon: '🛒', label: 'Registrar una venta', message: '¿Cómo registro una venta?' },
    { icon: '📦', label: 'Stock disponible', message: '¿Qué productos tienen stock bajo?' },
    { icon: '💰', label: 'Ventas de hoy', message: '¿Cuánto se ha vendido hoy?' },
    { icon: '🎯', label: 'Aplicar descuento', message: '¿Cómo aplico un descuento en el POS?' },
  ],
  '/inventario': [
    { icon: '📦', label: 'Consultar stock', message: '¿Cómo consulto el stock de un producto?' },
    { icon: '⚠️', label: 'Stock bajo', message: '¿Qué productos tienen stock bajo?' },
    { icon: '➕', label: 'Registrar producto', message: '¿Cómo registro un producto nuevo?' },
    { icon: '📊', label: 'Ver Kardex', message: '¿Cómo veo el historial de movimientos?' },
  ],
  '/ventas': [
    { icon: '📈', label: 'Ventas de hoy', message: '¿Cuánto se ha vendido hoy?' },
    { icon: '📅', label: 'Ventas esta semana', message: '¿Cuánto se vendió esta semana?' },
    { icon: '🏆', label: 'Más vendidos', message: '¿Cuáles son los productos más vendidos?' },
    { icon: '📋', label: 'Ver historial', message: '¿Cómo veo el historial de ventas?' },
  ],
  '/caja': [
    { icon: '🔓', label: 'Abrir sesión de caja', message: '¿Cómo abro una sesión de caja?' },
    { icon: '🔒', label: 'Cerrar y hacer arqueo', message: '¿Cómo cierro la sesión y hago el arqueo?' },
    { icon: '💵', label: 'Saldo actual', message: '¿Cuál es el saldo actual de la caja?' },
    { icon: '📊', label: 'Movimientos del turno', message: '¿Cuáles son los movimientos de esta sesión?' },
  ],
  '/envios': [
    { icon: '🚚', label: 'Crear un envío', message: '¿Cómo creo un envío a otra sucursal?' },
    { icon: '📋', label: 'Envíos pendientes', message: '¿Cuántos envíos están pendientes?' },
    { icon: '✅', label: 'Recibir un envío', message: '¿Cómo registro la recepción de un envío?' },
    { icon: '🔍', label: 'Estado de un envío', message: '¿Cómo veo el estado de un envío?' },
  ],
  '/compras': [
    { icon: '🛍️', label: 'Registrar compra', message: '¿Cómo registro una compra a un proveedor?' },
    { icon: '📦', label: 'Actualizar stock', message: '¿Cómo actualizo el stock al recibir mercancía?' },
    { icon: '📊', label: 'Gastos del mes', message: '¿Cuánto se ha gastado en compras este mes?' },
    { icon: '🏪', label: 'Historial proveedor', message: '¿Cómo veo las compras a un proveedor?' },
  ],
  '/clientes': [
    { icon: '👤', label: 'Registrar cliente', message: '¿Cómo registro un nuevo cliente?' },
    { icon: '💳', label: 'Clientes con crédito', message: '¿Qué clientes tienen crédito pendiente?' },
    { icon: '📊', label: 'Deudas pendientes', message: '¿Cuánto deben los clientes en total?' },
    { icon: '🔍', label: 'Buscar cliente', message: '¿Cómo busco un cliente en el sistema?' },
  ],
  '/gerencia': [
    { icon: '📊', label: 'Resumen ejecutivo', message: 'Dame un resumen del rendimiento por sucursal de esta semana.' },
    { icon: '💰', label: 'Balance del mes', message: '¿Cuál es el balance de ventas de este mes?' },
    { icon: '🏆', label: 'Mejor sucursal', message: '¿Cuál sucursal vendió más esta semana?' },
    { icon: '⚠️', label: 'Alertas pendientes', message: '¿Qué alertas de auditoría tengo pendientes?' },
  ],
  '/cotizaciones': [
    { icon: '📄', label: 'Crear cotización', message: '¿Cómo creo una cotización para un cliente?' },
    { icon: '💰', label: 'Cotizaciones activas', message: '¿Cuántas cotizaciones están pendientes?' },
    { icon: '✅', label: 'Convertir a venta', message: '¿Cómo convierto una cotización en venta?' },
    { icon: '📋', label: 'Ver historial', message: '¿Cómo veo el historial de cotizaciones?' },
  ],
};

const DEFAULT_WELCOME_CHIPS = [
  { icon: '💰', label: 'Ventas de hoy', message: '¿Cuánto se ha vendido hoy?' },
  { icon: '📦', label: 'Stock disponible', message: '¿Qué productos tienen stock bajo?' },
  { icon: '🧾', label: 'Estado de la caja', message: '¿Cuál es el estado de la caja?' },
  { icon: '🗺️', label: 'Guías disponibles', message: '¿Qué guías interactivas tienes disponibles?' },
];

const MODULE_LABELS: Record<string, string> = {
  '/punto-de-venta': 'Punto de Venta',
  '/inventario': 'Inventario',
  '/ventas': 'Ventas',
  '/caja': 'Caja',
  '/envios': 'Envíos',
  '/compras': 'Compras',
  '/clientes': 'Clientes',
  '/gerencia': 'Gerencia',
  '/cotizaciones': 'Cotizaciones',
};

// ─── Backend badge ────────────────────────────────────────────────────────────

const BACKEND_CONFIG: Record<ChatBackend, { label: string; icon: typeof Sparkles; color: string; bg: string }> = {
  deepseek: {
    label: 'DeepSeek Flash',
    icon: Cpu,
    color: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800',
  },
  offline: {
    label: 'Offline',
    icon: WifiOff,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800',
  },
  starting: {
    label: 'Conectando…',
    icon: Wifi,
    color: 'text-slate-500 dark:text-slate-400',
    bg: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
  },
};

function BackendBadge({ backend }: { backend: ChatBackend }) {
  const config = BACKEND_CONFIG[backend];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${config.bg} ${config.color}`}
      title={backend === 'deepseek' ? 'IA cloud — DeepSeek V4 Flash' : backend === 'offline' ? 'Sin IA — Respuestas predefinidas' : 'Detectando backend…'}
    >
      <Icon size={10} strokeWidth={2.5} />
      {config.label}
    </span>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

const MAX_CHARS = 500;

export default function ChatPanel() {
  const {
    isOpen, isCompact, isFullscreen,
    messages, isLoading, isLoadingHistory, backend,
    pendingTourId, clearPendingTour,
    conversations, activeConvId, favorites, aliases, alerts,
    closeChat, toggleCompact, toggleFullscreen,
    sendMessage, clearMessages,
    newConversation, switchConversation, deleteConversation, renameConversation,
    addFavorite, removeFavorite,
    addAlias, removeAlias,
    dismissAlert,
  } = useChat();
  const { role, user } = useAuth();
  const { branches } = useBranch();
  const { startTour } = useTour();
  const pathname = usePathname();

  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showAliases, setShowAliases] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [newFavLabel, setNewFavLabel] = useState('');
  const [newAliasT, setNewAliasT] = useState('');
  const [newAliasM, setNewAliasM] = useState('');

  // @mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionAnchor, setMentionAnchor] = useState(0); // index of '@' in input

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const suggestions = getSuggestions(role);

  // Contextual welcome chips
  const pageEntry = Object.entries(MODULE_WELCOME_CHIPS).find(([prefix]) => pathname.startsWith(prefix));
  const pageChips = pageEntry ? pageEntry[1] : DEFAULT_WELCOME_CHIPS;
  const moduleLabel = pageEntry ? (MODULE_LABELS[pageEntry[0]] ?? '') : '';

  // ── Close "more" dropdown on outside click ────────────────────────────────
  useEffect(() => {
    if (!showMore) return;
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setShowMore(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMore]);

  // ── Launch pending tour ────────────────────────────────────────────────────
  useEffect(() => {
    if (!pendingTourId) return;
    const id = pendingTourId;
    clearPendingTour();
    closeChat();
    setTimeout(() => startTour(id), 600);
  }, [pendingTourId, clearPendingTour, startTour, closeChat]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Focus input ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && !isCompact) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen, isCompact]);

  // ── Send handlers ──────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading || input.length > MAX_CHARS) return;
    sendMessage(input);
    setInput('');
    setMentionOpen(false);
  }, [input, isLoading, sendMessage]);

  // @mention: detect trigger and filter branches
  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    const cursorPos = value.length; // approximate; textarea cursor
    const lastAt = value.lastIndexOf('@');
    if (lastAt !== -1 && lastAt >= cursorPos - 30) {
      const fragment = value.slice(lastAt + 1);
      if (!fragment.includes(' ') || fragment.length < 20) {
        setMentionAnchor(lastAt);
        setMentionFilter(fragment.toLowerCase());
        setMentionOpen(true);
        return;
      }
    }
    setMentionOpen(false);
  }, []);

  const handleMentionSelect = useCallback((name: string) => {
    const before = input.slice(0, mentionAnchor);
    const after = input.slice(mentionAnchor + 1 + mentionFilter.length);
    setInput(`${before}${name} ${after}`);
    setMentionOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [input, mentionAnchor, mentionFilter]);

  const mentionResults = mentionOpen
    ? branches.filter((b) => b.name.toLowerCase().includes(mentionFilter)).slice(0, 5)
    : [];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') closeChat();
  };

  // ── Computed ───────────────────────────────────────────────────────────────
  const pinnedMessages = messages.filter((m) => m.pinned);
  const displayedMessages = searchQuery
    ? messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages.filter((m) => m.id !== 'welcome');
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');

  // Alias match for current input
  const aliasMatch = aliases.find((a) => a.trigger === input.toLowerCase().trim());

  // Check if current message is already a favorite
  const isFaved = (msg: string) => favorites.some((f) => f.message === msg);

  // ── Save current input as favorite ────────────────────────────────────────
  const handleSaveFav = async () => {
    if (!input.trim() || !newFavLabel.trim()) return;
    await addFavorite(newFavLabel.trim(), input.trim());
    setNewFavLabel('');
  };

  // ── Add alias ─────────────────────────────────────────────────────────────
  const handleAddAlias = async () => {
    if (!newAliasT.trim() || !newAliasM.trim()) return;
    await addAlias(newAliasT.trim(), newAliasM.trim());
    setNewAliasT('');
    setNewAliasM('');
  };

  if (!isOpen) return null;

  // ── Compact mode ───────────────────────────────────────────────────────────
  if (isCompact) {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.isStreaming);
    return (
      <div
        className="fixed bottom-20 right-4 md:bottom-6 md:left-[13.5rem] md:right-auto z-[9997] w-80 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-200"
        role="complementary"
        aria-label="Asistente Renotech (modo compacto)"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles size={13} className="text-slate-500" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Asistente</span>
            <BackendBadge backend={backend} />
          </div>
          <div className="flex gap-1">
            <button onClick={toggleCompact} title="Expandir" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
              <Maximize2 size={12} />
            </button>
            <button onClick={closeChat} title="Cerrar" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
              <X size={12} />
            </button>
          </div>
        </div>
        {lastAssistant && (
          <div className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
            {lastAssistant.content.replace(/<[^>]+>/g, '').slice(0, 120)}…
          </div>
        )}
        <div className="px-3 pb-2 flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-white"
            placeholder="Pregunta…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center disabled:opacity-30 transition-colors"
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          </button>
        </div>
      </div>
    );
  }

  // ── Full panel ─────────────────────────────────────────────────────────────
  return (
    <div
      className={`
        fixed z-[9997]
        bg-white dark:bg-[#0f172a]
        border border-slate-200 dark:border-slate-800
        shadow-2xl shadow-slate-900/20 dark:shadow-black/50
        flex flex-col overflow-hidden
        animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-300
        ${isFullscreen
          ? 'inset-4 rounded-2xl'
          : 'bottom-20 right-4 md:bottom-6 md:left-[13.5rem] md:right-auto w-[26rem] max-w-[calc(100vw-3rem)] h-[42rem] max-h-[calc(100vh-8rem)] rounded-2xl'
        }
      `}
      role="complementary"
      aria-label="Asistente Renotech"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-white flex items-center justify-center shrink-0">
            <Sparkles size={16} strokeWidth={2} className="text-white dark:text-slate-900" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                Asistente Renotech
              </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              Consultas · Guías · Reportes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {(role === 'GERENTE' || role === 'ENCARGADO') && (
            <button
              onClick={() => { setShowAnalytics(v => !v); setShowFavorites(false); setShowAliases(false); setShowMore(false); }}
              title="Analytics del chatbot"
              aria-label="Analytics"
              className={`p-2 rounded-xl transition-colors ${showAnalytics ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <BarChart2 size={13} strokeWidth={2} />
            </button>
          )}

          {/* Secondary actions dropdown */}
          <div ref={moreMenuRef} className="relative">
            <button
              onClick={() => setShowMore(v => !v)}
              title="Más opciones"
              aria-label="Más opciones"
              className={`p-2 rounded-xl transition-colors ${showMore ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <MoreHorizontal size={13} strokeWidth={2} />
            </button>
            {showMore && (
              <div className="absolute right-0 top-9 z-50 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                <button
                  onClick={() => { setShowFavorites(v => !v); setShowAliases(false); setShowAnalytics(false); setShowMore(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
                >
                  <Star size={12} className="text-amber-500 shrink-0" />
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Favoritos guardados</span>
                </button>
                <button
                  onClick={() => { setShowAliases(v => !v); setShowFavorites(false); setShowAnalytics(false); setShowMore(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
                >
                  <Hash size={12} className="text-violet-500 shrink-0" />
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Alias personales</span>
                </button>
                <button
                  onClick={() => { setShowSearch(v => !v); setShowMore(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
                >
                  <Search size={12} className="text-slate-500 shrink-0" />
                  <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Buscar en chat</span>
                </button>
                <div className="border-t border-slate-100 dark:border-slate-800" />
                <button
                  onClick={() => { clearMessages(); setShowMore(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-left transition-colors"
                >
                  <Trash2 size={12} className="text-red-400 shrink-0" />
                  <span className="text-[11px] font-medium text-red-600 dark:text-red-400">Limpiar conversación</span>
                </button>
              </div>
            )}
          </div>

          <button onClick={toggleCompact} title="Minimizar" aria-label="Minimizar" className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <ChevronDown size={13} strokeWidth={2} />
          </button>
          <button onClick={toggleFullscreen} title={isFullscreen ? 'Restaurar' : 'Pantalla completa'} aria-label={isFullscreen ? 'Restaurar' : 'Pantalla completa'} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            {isFullscreen ? <Minimize2 size={13} strokeWidth={2} /> : <Maximize2 size={13} strokeWidth={2} />}
          </button>
          <button onClick={closeChat} title="Cerrar (Esc)" aria-label="Cerrar chat" className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ml-0.5">
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ── Proactive alerts ── */}
      <AlertsPanel alerts={alerts} onDismiss={dismissAlert} />

      {/* ── Conversation tabs ── */}
      {conversations.length > 0 && (
        <ConversationTabs
          conversations={conversations}
          activeConvId={activeConvId}
          onSwitch={switchConversation}
          onNew={newConversation}
          onDelete={deleteConversation}
          onRename={renameConversation}
        />
      )}

      {/* ── Analytics panel (overlay) ── */}
      {showAnalytics && (
        <AnalyticsPanel onClose={() => setShowAnalytics(false)} />
      )}

      {/* ── Favorites panel ── */}
      {!showAnalytics && showFavorites && (
        <div className="shrink-0 border-b border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 max-h-48 overflow-y-auto">
          <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1 mb-2">
            <Star size={9} /> Consultas favoritas
          </p>
          {favorites.length === 0 ? (
            <p className="text-[10px] text-slate-400 mb-2">Sin favoritos guardados. Escribe un mensaje y guárdalo con el botón ★.</p>
          ) : (
            <div className="space-y-1 mb-3">
              {favorites.map((fav) => (
                <div key={fav.id} className="flex items-center gap-2 group">
                  <button
                    onClick={() => { sendMessage(fav.message); setShowFavorites(false); }}
                    className="flex-1 text-left text-[10px] text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <span className="font-semibold">{fav.label}</span>
                    <span className="text-slate-400 ml-1">— {fav.message.slice(0, 50)}{fav.message.length > 50 ? '…' : ''}</span>
                  </button>
                  <button
                    onClick={() => removeFavorite(fav.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Add favorite from current input */}
          {input.trim() && (
            <div className="flex gap-1.5 mt-2">
              <input
                value={newFavLabel}
                onChange={(e) => setNewFavLabel(e.target.value)}
                placeholder="Nombre del favorito…"
                className="flex-1 text-[10px] px-2 py-1 rounded-md border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <button
                onClick={handleSaveFav}
                disabled={!newFavLabel.trim()}
                className="px-2 py-1 rounded-md bg-amber-500 text-white text-[10px] font-semibold disabled:opacity-40 hover:bg-amber-600 transition-colors"
              >
                Guardar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Aliases panel ── */}
      {!showAnalytics && showAliases && (
        <div className="shrink-0 border-b border-violet-100 dark:border-violet-900/30 bg-violet-50 dark:bg-violet-900/10 px-4 py-3 max-h-52 overflow-y-auto">
          <p className="text-[9px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 flex items-center gap-1 mb-2">
            <Hash size={9} /> Alias personales
          </p>
          <p className="text-[9px] text-slate-400 mb-2">Escribe el alias en el chat y se expandirá automáticamente al enviar.</p>
          {aliases.length === 0 ? (
            <p className="text-[10px] text-slate-400 mb-2">Sin alias. Crea uno abajo.</p>
          ) : (
            <div className="space-y-1 mb-3">
              {aliases.map((a) => (
                <div key={a.id} className="flex items-center gap-2 group">
                  <div className="flex-1">
                    <span className="text-[10px] font-mono font-bold text-violet-700 dark:text-violet-400">{a.trigger}</span>
                    <span className="text-[9px] text-slate-400 ml-1">→</span>
                    <span className="text-[10px] text-slate-600 dark:text-slate-400 ml-1">{a.message.slice(0, 50)}{a.message.length > 50 ? '…' : ''}</span>
                  </div>
                  <button
                    onClick={() => removeAlias(a.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <input
              value={newAliasT}
              onChange={(e) => setNewAliasT(e.target.value)}
              placeholder="Alias (ej: mis productos)"
              className="w-full text-[10px] px-2 py-1 rounded-md border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-400 font-mono"
            />
            <input
              value={newAliasM}
              onChange={(e) => setNewAliasM(e.target.value)}
              placeholder="Se expande a… (ej: ¿Stock de productos de mi categoría?)"
              className="w-full text-[10px] px-2 py-1 rounded-md border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
            <button
              onClick={handleAddAlias}
              disabled={!newAliasT.trim() || !newAliasM.trim()}
              className="w-full py-1 rounded-md bg-violet-500 text-white text-[10px] font-semibold disabled:opacity-40 hover:bg-violet-600 transition-colors"
            >
              Crear alias
            </button>
          </div>
        </div>
      )}

      {/* ── Search bar ── */}
      {!showAnalytics && showSearch && (
        <div className="shrink-0 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en la conversación…"
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-white"
              aria-label="Buscar mensajes"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={11} />
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="text-[9px] text-slate-400 mt-1">
              {displayedMessages.length} resultado{displayedMessages.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* ── Pinned messages strip ── */}
      {!showAnalytics && pinnedMessages.length > 0 && !searchQuery && (
        <div className="shrink-0 border-b border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/10 px-4 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1 mb-1.5">
            <Pin size={9} /> Mensajes anclados
          </p>
          <div className="space-y-1">
            {pinnedMessages.map((m) => (
              <p key={m.id} className="text-[10px] text-slate-600 dark:text-slate-400 line-clamp-1">
                {m.content.replace(/<[^>]+>/g, '').slice(0, 80)}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      {!showAnalytics && <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin"
        role="log"
        aria-live="polite"
        aria-label="Conversación"
      >
        {/* History loading */}
        {isLoadingHistory && (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={16} className="animate-spin text-slate-400 mr-2" />
            <span className="text-xs text-slate-400">Cargando historial…</span>
          </div>
        )}

        {/* Contextual welcome card */}
        {messages.length <= 1 && !searchQuery && !isLoadingHistory && (
          <div className="flex flex-col items-center pt-3 pb-2">
            <div className="w-11 h-11 rounded-2xl bg-slate-900 dark:bg-white flex items-center justify-center mb-3 shadow-md">
              <Sparkles size={20} strokeWidth={2} className="text-white dark:text-slate-900" />
            </div>
            <p className="text-sm font-black text-slate-800 dark:text-slate-200">
              Hola{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center mt-1 leading-snug max-w-[16rem]">
              Puedo consultar datos en tiempo real, guiarte paso a paso y responder cualquier duda del sistema.
            </p>
            <div className="mt-4 w-full">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                {moduleLabel ? `Sugerencias · ${moduleLabel}` : 'Sugerencias rápidas'}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {pageChips.map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(chip.message)}
                    className="text-left px-2.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group"
                  >
                    <span className="text-sm leading-none">{chip.icon}</span>
                    <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 mt-1 leading-tight group-hover:text-slate-900 dark:group-hover:text-white">
                      {chip.label}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => sendMessage('¿Qué más puedes hacer? Dame ejemplos concretos de consultas y acciones disponibles.')}
              className="mt-3 text-[10px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              ¿Qué más puedes hacer? →
            </button>
          </div>
        )}

        {displayedMessages.map((msg, idx) => {
          const prevUserMsg = [...messages.slice(0, idx)].reverse().find((m) => m.role === 'user');
          return (
            <ChatMessageBubble
              key={msg.id}
              message={msg}
              lastUserContent={msg.role === 'assistant' ? (prevUserMsg?.content ?? lastUserMsg?.content) : undefined}
            />
          );
        })}

        {/* 3-dot loading indicator */}
        {isLoading && (
          <div className="flex items-center gap-1.5 py-1" aria-label="El asistente está procesando">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>}

      {/* ── Input area ── */}
      {!showAnalytics && <div className="shrink-0 p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
        {/* @mention branch autocomplete */}
        {mentionOpen && mentionResults.length > 0 && (
          <div className="mb-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden">
            <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 px-3 pt-2 pb-1">Sucursales</p>
            {mentionResults.map((b) => (
              <button
                key={b.id}
                onMouseDown={(e) => { e.preventDefault(); handleMentionSelect(b.name); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
              >
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate">{b.name}</span>
                {b.tipo && <span className="text-[8px] text-slate-400 uppercase tracking-wider shrink-0">{b.tipo}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Alias match suggestion */}
        {aliasMatch && (
          <div className="mb-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
            <Zap size={10} className="text-violet-500 shrink-0" />
            <span className="text-[10px] text-violet-700 dark:text-violet-300 flex-1 truncate">
              Alias → {aliasMatch.message.slice(0, 60)}{aliasMatch.message.length > 60 ? '…' : ''}
            </span>
          </div>
        )}

        {/* Inline autocomplete suggestions while typing */}
        {input.length > 1 && !isLoading && !aliasMatch && (
          <div className="mb-2 flex flex-wrap gap-1">
            {suggestions
              .filter((s) => s.message.toLowerCase().includes(input.toLowerCase()) && s.message !== input)
              .slice(0, 3)
              .map((s, i) => (
                <button
                  key={i}
                  onClick={() => { sendMessage(s.message); setInput(''); }}
                  className="text-[10px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {s.icon} {s.label}
                </button>
              ))}
          </div>
        )}

        {/* Favorites shortcut for current input */}
        {input.trim() && favorites.length > 0 && isFaved(input.trim()) && (
          <div className="mb-2 flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
            <Star size={10} />
            <span>Este mensaje está en tus favoritos.</span>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Save to favorites button */}
          {input.trim() && (
            <button
              onClick={() => setShowFavorites(true)}
              title="Guardar como favorito"
              className="shrink-0 w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-amber-500 hover:border-amber-300 flex items-center justify-center transition-colors"
            >
              {isFaved(input.trim()) ? <Star size={12} className="text-amber-500" /> : <StarOff size={12} />}
            </button>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pregunta lo que necesites…"
            rows={1}
            maxLength={MAX_CHARS}
            aria-label="Escribe tu mensaje"
            className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white focus:border-transparent max-h-32"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || input.length > MAX_CHARS}
            title="Enviar (Enter)"
            aria-label="Enviar mensaje"
            className="shrink-0 w-9 h-9 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
          >
            {isLoading ? (
              <Loader2 size={16} strokeWidth={2.5} className="animate-spin" />
            ) : (
              <Send size={16} strokeWidth={2.5} />
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-1.5 px-1">
          <div className="flex items-center gap-2 min-w-0">
            <BackendBadge backend={backend} />
            <p className="text-[9px] text-slate-400 hidden sm:block truncate">
              Enter enviar · Shift+Enter nueva línea · <kbd className="font-mono bg-slate-200 dark:bg-slate-700 px-0.5 rounded text-[8px]">Ctrl+J</kbd>
            </p>
          </div>
          {input.length > 0 && (
            <p className={`text-[9px] tabular-nums ${input.length > MAX_CHARS * 0.9 ? 'text-red-500' : 'text-slate-400'}`}>
              {input.length}/{MAX_CHARS}
            </p>
          )}
        </div>
      </div>}
    </div>
  );
}
