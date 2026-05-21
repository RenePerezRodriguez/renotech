'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ChatBackend, ChatFeedback, ChatConversation, ChatFavorite, ChatAlias, ChatSystemAlert } from '@/types/chat';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import {
  createConversation, updateConversationMeta,
  loadConversations, deleteConversation as fsDeleteConversation,
  saveMessage, loadMessages, updateMessageField,
  saveFavorite, loadFavorites, deleteFavorite,
  saveAlias, loadAliases, deleteAlias, resolveAlias,
} from '@/lib/chat/history';

interface ChatContextType {
  // UI state
  isOpen: boolean;
  isCompact: boolean;
  isFullscreen: boolean;
  isLoading: boolean;
  isLoadingHistory: boolean;
  backend: ChatBackend;
  pendingTourId: string | null;

  // Messages (active conversation)
  messages: ChatMessage[];

  // Conversations
  conversations: ChatConversation[];
  activeConvId: string | null;

  // Saved queries & aliases
  favorites: ChatFavorite[];
  aliases: ChatAlias[];

  // Proactive alerts
  alerts: ChatSystemAlert[];
  dismissAlert: (alertId: string) => void;

  // UI actions
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  toggleCompact: () => void;
  toggleFullscreen: () => void;
  clearPendingTour: () => void;
  openWithContext: (contextMessage: string) => void;

  // Message actions
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  retryMessage: (userContent: string) => Promise<void>;
  submitFeedback: (messageId: string, vote: ChatFeedback) => Promise<void>;
  pinMessage: (messageId: string) => void;
  removeMessage: (messageId: string) => void;

  // Conversation actions
  newConversation: () => void;
  switchConversation: (convId: string) => Promise<void>;
  deleteConversation: (convId: string) => Promise<void>;
  renameConversation: (convId: string, title: string) => Promise<void>;

  // Favorites
  addFavorite: (label: string, message: string) => Promise<void>;
  removeFavorite: (favoriteId: string) => Promise<void>;

  // Aliases
  addAlias: (trigger: string, message: string) => Promise<void>;
  removeAlias: (aliasId: string) => Promise<void>;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Hola, soy el asistente de **Renotech**. Puedo consultar datos en tiempo real, guiarte por el sistema paso a paso, y responder cualquier duda sobre los módulos.\n\n¿En qué te ayudo?',
  timestamp: Date.now(),
};

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function makeTitleFromMessage(content: string): string {
  return content.trim().slice(0, 40) + (content.length > 40 ? '…' : '');
}

// Deduplication guard
const lastSent = { content: '', at: 0 };

const ChatContext = createContext<ChatContextType>({} as ChatContextType);

export const useChat = () => useContext(ChatContext);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [backend, setBackend] = useState<ChatBackend>('starting');
  const [pendingTourId, setPendingTourId] = useState<string | null>(null);

  // ── Chat state ────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<ChatFavorite[]>([]);
  const [aliases, setAliases] = useState<ChatAlias[]>([]);
  const [alerts, setAlerts] = useState<ChatSystemAlert[]>([]);

  const { user, userName, role } = useAuth();
  const { currentBranch } = useBranch();

  // ── Ref to track active convId inside async callbacks ────────────────────
  const activeConvIdRef = useRef<string | null>(null);
  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);

  // ── UI actions ────────────────────────────────────────────────────────────
  const openChat = useCallback(() => setIsOpen(true), []);
  const closeChat = useCallback(() => { setIsOpen(false); setIsFullscreen(false); }, []);
  const toggleChat = useCallback(() => setIsOpen((v) => !v), []);
  const toggleCompact = useCallback(() => setIsCompact((v) => !v), []);
  const toggleFullscreen = useCallback(() => setIsFullscreen((v) => !v), []);
  const clearPendingTour = useCallback(() => setPendingTourId(null), []);

  // Open chat and auto-send a context message after a short delay
  const pendingContextRef = useRef<string | null>(null);
  const openWithContext = useCallback((contextMessage: string) => {
    pendingContextRef.current = contextMessage;
    setIsOpen(true);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  // ── Fire pending context message after chat opens ────────────────────────
  useEffect(() => {
    if (!isOpen || !pendingContextRef.current) return;
    const msg = pendingContextRef.current;
    pendingContextRef.current = null;
    const timer = setTimeout(() => sendMessage(msg), 400);
    return () => clearTimeout(timer);
  // sendMessage intentionally excluded — stable ref via useCallback deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Backend ping + alert fetch (GET /api/chat) ───────────────────────────
  const hasPinged = useRef(false);
  useEffect(() => {
    if (!isOpen || hasPinged.current || !user) return;
    hasPinged.current = true;
    (async () => {
      try {
        const token = await user.getIdToken();
        const url = new URL('/api/chat', window.location.origin);
        if (currentBranch?.id) url.searchParams.set('branchId', currentBranch.id);
        if (role) url.searchParams.set('role', role);
        const res = await fetch(url.toString(), {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.backend) setBackend(data.backend as ChatBackend);
          if (Array.isArray(data.alerts)) setAlerts(data.alerts);
        } else {
          setBackend('offline');
        }
      } catch {
        setBackend('offline');
      }
    })();
  }, [isOpen, user, currentBranch, role]);

  // ── Load history on first open ────────────────────────────────────────────
  const hasLoadedHistory = useRef(false);
  useEffect(() => {
    if (!isOpen || hasLoadedHistory.current || !user) return;
    hasLoadedHistory.current = true;

    (async () => {
      setIsLoadingHistory(true);
      try {
        const [convList, favList, aliasList] = await Promise.all([
          loadConversations(user.uid),
          loadFavorites(user.uid),
          loadAliases(user.uid),
        ]);
        setConversations(convList);
        setFavorites(favList);
        setAliases(aliasList);

        // Load messages of most recent conversation
        if (convList.length > 0) {
          const latest = convList[0];
          setActiveConvId(latest.id);
          activeConvIdRef.current = latest.id;
          const msgs = await loadMessages(user.uid, latest.id);
          setMessages([WELCOME_MESSAGE, ...msgs]);
        }
      } catch {
        // Non-critical — fallback to in-memory mode
      } finally {
        setIsLoadingHistory(false);
      }
    })();
  }, [isOpen, user]);

  // ── Core send logic ───────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (rawContent: string) => {
      if (!rawContent.trim() || isLoading) return;

      // Resolve alias
      const content = resolveAlias(aliases, rawContent);

      // Deduplication
      const now = Date.now();
      if (content === lastSent.content && now - lastSent.at < 3000) return;
      lastSent.content = content;
      lastSent.at = now;

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      const streamingId = generateId();
      setMessages((prev) => [
        ...prev,
        { id: streamingId, role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true },
      ]);

      // Ensure a Firestore conversation exists
      let convId = activeConvIdRef.current;
      if (!convId && user) {
        try {
          convId = await createConversation(
            user.uid,
            makeTitleFromMessage(content),
            currentBranch?.id ?? null,
          );
          const newConv: ChatConversation = {
            id: convId,
            title: makeTitleFromMessage(content),
            preview: content.slice(0, 80),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messageCount: 0,
            branchId: currentBranch?.id ?? null,
          };
          setConversations((prev) => [newConv, ...prev]);
          setActiveConvId(convId);
          activeConvIdRef.current = convId;
        } catch { /* offline — continue without persistence */ }
      }

      // Save user message to Firestore
      if (convId && user) {
        saveMessage(user.uid, convId, userMsg).catch(() => {});
      }

      try {
        const token = await user?.getIdToken();
        if (!token) throw new Error('No autenticado');

        const history = messages
          .filter((m) => m.role !== 'system' && m.id !== 'welcome')
          .slice(-10)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: content,
            history,
            branchId: currentBranch?.id ?? null,
            userName: userName ?? user?.email ?? null,
            role: role ?? null,
          }),
        });

        if (!res.ok || !res.body) throw new Error(`Error ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let firstChunk = true;
        let finalContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;

            let event: Record<string, unknown>;
            try { event = JSON.parse(raw); } catch { continue; }

            if (event.type === 'backend') {
              setBackend(event.backend as ChatBackend);
            } else if (event.type === 'tool_start') {
              // Mostrar indicador de consulta mientras las herramientas ejecutan
              setIsLoading(false);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId
                    ? { ...m, content: '⏳ Consultando datos en tiempo real...' }
                    : m
                )
              );
            } else if (event.type === 'tool_done') {
              // Limpiar el placeholder — los chunks de fase 2 lo reemplazarán
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId ? { ...m, content: '' } : m
                )
              );
              finalContent = '';
            } else if (event.type === 'chunk') {
              if (firstChunk) { setIsLoading(false); firstChunk = false; }
              finalContent += event.content as string;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId
                    ? { ...m, content: m.content.startsWith('⏳') ? (event.content as string) : m.content + (event.content as string) }
                    : m
                )
              );
            } else if (event.type === 'tour') {
              setPendingTourId(event.tourId as string);
            } else if (event.type === 'actions') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId
                    ? { ...m, actions: event.actions as { label: string; route: string }[] }
                    : m
                )
              );
            } else if (event.type === 'done') {
              setMessages((prev) =>
                prev.map((m) => (m.id === streamingId ? { ...m, isStreaming: false } : m))
              );
            } else if (event.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId
                    ? { ...m, content: 'Error al procesar tu consulta.', isStreaming: false, error: String(event.message) }
                    : m
                )
              );
            }
          }
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === streamingId ? { ...m, isStreaming: false } : m))
        );

        // Save assistant message + update conversation meta
        if (convId && user && finalContent) {
          const assistantMsg: ChatMessage = {
            id: streamingId,
            role: 'assistant',
            content: finalContent,
            timestamp: Date.now(),
          };
          const userCount = messages.filter(m => m.role === 'user').length + 1;
          const newCount = userCount + 1;
          await Promise.all([
            saveMessage(user.uid, convId, assistantMsg),
            updateConversationMeta(user.uid, convId, content.slice(0, 80), newCount),
          ]).catch(() => {});

          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? { ...c, preview: content.slice(0, 80), messageCount: newCount, updatedAt: Date.now() }
                : c
            )
          );
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingId
              ? {
                  ...m,
                  content: 'Lo siento, ocurrió un error al procesar tu consulta.',
                  isStreaming: false,
                  error: err instanceof Error ? err.message : 'Error desconocido',
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, user, currentBranch, userName, role, aliases]
  );

  // ── Retry ─────────────────────────────────────────────────────────────────
  const retryMessage = useCallback(
    async (userContent: string) => {
      setMessages((prev) => prev.filter((m) => m.role !== 'assistant' || !m.error));
      await sendMessage(userContent);
    },
    [sendMessage]
  );

  // ── Clear / new conversation ──────────────────────────────────────────────
  const clearMessages = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setActiveConvId(null);
    activeConvIdRef.current = null;
  }, []);

  const newConversation = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setActiveConvId(null);
    activeConvIdRef.current = null;
  }, []);

  // ── Switch conversation ───────────────────────────────────────────────────
  const switchConversation = useCallback(
    async (convId: string) => {
      if (!user || convId === activeConvId) return;
      setIsLoadingHistory(true);
      setActiveConvId(convId);
      activeConvIdRef.current = convId;
      try {
        const msgs = await loadMessages(user.uid, convId);
        setMessages([WELCOME_MESSAGE, ...msgs]);
      } catch {
        setMessages([WELCOME_MESSAGE]);
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [user, activeConvId]
  );

  // ── Delete conversation ───────────────────────────────────────────────────
  const deleteConversation = useCallback(
    async (convId: string) => {
      if (!user) return;
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) {
        setMessages([WELCOME_MESSAGE]);
        setActiveConvId(null);
        activeConvIdRef.current = null;
      }
      await fsDeleteConversation(user.uid, convId).catch(() => {});
    },
    [user, activeConvId]
  );

  // ── Rename conversation ───────────────────────────────────────────────────
  const renameConversation = useCallback(
    async (convId: string, title: string) => {
      if (!user) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title } : c))
      );
      const { renameConversation: fsRename } = await import('@/lib/chat/history');
      await fsRename(user.uid, convId, title).catch(() => {});
    },
    [user]
  );

  // ── Feedback ──────────────────────────────────────────────────────────────
  const submitFeedback = useCallback(
    async (messageId: string, vote: ChatFeedback) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback: vote } : m))
      );
      const convId = activeConvIdRef.current;
      try {
        await Promise.all([
          addDoc(collection(db, 'chat_feedback'), {
            messageId,
            vote,
            uid: user?.uid ?? null,
            role: role ?? null,
            branchId: currentBranch?.id ?? null,
            timestamp: serverTimestamp(),
          }),
          ...(convId && user
            ? [updateMessageField(user.uid, convId, messageId, { feedback: vote })]
            : []),
        ]);
      } catch { /* non-critical */ }
    },
    [user, role, currentBranch]
  );

  // ── Pin message ───────────────────────────────────────────────────────────
  const pinMessage = useCallback(
    (messageId: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const next = !m.pinned;
          const convId = activeConvIdRef.current;
          if (convId && user) {
            updateMessageField(user.uid, convId, messageId, { pinned: next }).catch(() => {});
          }
          return { ...m, pinned: next };
        })
      );
    },
    [user]
  );

  // ── Remove message ────────────────────────────────────────────────────────
  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  // ── Favorites ─────────────────────────────────────────────────────────────
  const addFavorite = useCallback(
    async (label: string, message: string) => {
      if (!user) return;
      const fav = await saveFavorite(user.uid, label, message);
      setFavorites((prev) => [fav, ...prev]);
    },
    [user]
  );

  const removeFavorite = useCallback(
    async (favoriteId: string) => {
      if (!user) return;
      setFavorites((prev) => prev.filter((f) => f.id !== favoriteId));
      await deleteFavorite(user.uid, favoriteId).catch(() => {});
    },
    [user]
  );

  // ── Alerts ────────────────────────────────────────────────────────────────
  const dismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  // ── Aliases ───────────────────────────────────────────────────────────────
  const addAlias = useCallback(
    async (trigger: string, message: string) => {
      if (!user) return;
      const alias = await saveAlias(user.uid, trigger, message);
      setAliases((prev) => [alias, ...prev]);
    },
    [user]
  );

  const removeAlias = useCallback(
    async (aliasId: string) => {
      if (!user) return;
      setAliases((prev) => prev.filter((a) => a.id !== aliasId));
      await deleteAlias(user.uid, aliasId).catch(() => {});
    },
    [user]
  );

  return (
    <ChatContext.Provider
      value={{
        isOpen, isCompact, isFullscreen,
        isLoading, isLoadingHistory, backend, pendingTourId,
        messages, conversations, activeConvId,
        favorites, aliases, alerts,
        openChat, closeChat, toggleChat, toggleCompact, toggleFullscreen,
        clearPendingTour, openWithContext,
        sendMessage, clearMessages, retryMessage, submitFeedback,
        pinMessage, removeMessage,
        newConversation, switchConversation, deleteConversation, renameConversation,
        addFavorite, removeFavorite,
        addAlias, removeAlias,
        dismissAlert,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
