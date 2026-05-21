'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ChatMessage } from '@/types/chat';
import { Sparkles, User, AlertTriangle, Copy, Check, ThumbsUp, ThumbsDown, RotateCcw, Pin, Trash2, ExternalLink } from 'lucide-react';
import ChatDataRenderer from './ChatDataRenderer';
import { useChat } from '@/contexts/ChatContext';
import { useRouter } from 'next/navigation';

interface Props {
  message: ChatMessage;
  /** Last user message content — needed for retry */
  lastUserContent?: string;
}

// ─── Inline transforms ────────────────────────────────────────────────────────

function applyInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code class="bg-black/10 dark:bg-white/10 px-1 rounded text-[0.8em] font-mono">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// ─── Block-based markdown renderer ───────────────────────────────────────────

function renderMarkdown(raw: string): string {
  if (!raw) return '';

  const codeParts: string[] = [];
  const text = raw.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, code) => {
    codeParts.push(
      `<pre class="bg-black/10 dark:bg-white/10 rounded-lg p-2 my-1 text-xs overflow-x-auto font-mono"><code>${code.trimEnd()}</code></pre>`
    );
    return `\x02${codeParts.length - 1}\x03`;
  });

  const out: string[] = [];

  for (const rawBlock of text.split(/\n{2,}/)) {
    const block = rawBlock.trim();
    if (!block) continue;

    const codePlaceholder = block.match(/^\x02(\d+)\x03$/);
    if (codePlaceholder) { out.push(codeParts[+codePlaceholder[1]]); continue; }

    if (/^-{3,}$/.test(block)) { out.push('<hr class="border-current opacity-20 my-1">'); continue; }

    const lines = block.split('\n');
    const parts: string[] = [];
    let listBuf: { type: 'ul' | 'ol'; items: string[] } | null = null;
    let textBuf: string[] = [];

    const flushText = () => {
      if (!textBuf.length) return;
      parts.push(`<p>${applyInline(textBuf.join(' '))}</p>`);
      textBuf = [];
    };
    const flushList = () => {
      if (!listBuf) return;
      const tag = listBuf.type;
      const cls = tag === 'ul' ? 'list-disc pl-4 space-y-0.5 my-0.5' : 'list-decimal pl-4 space-y-0.5 my-0.5';
      parts.push(`<${tag} class="${cls}">${listBuf.items.join('')}</${tag}>`);
      listBuf = null;
    };

    for (const line of lines) {
      const h3 = line.match(/^###\s+(.*)/);
      const h2 = line.match(/^##\s+(.*)/);
      const h1 = line.match(/^#\s+(.*)/);
      if (h3) { flushText(); flushList(); parts.push(`<p class="font-bold text-[0.85em] uppercase tracking-wide opacity-70 mt-1">${applyInline(h3[1])}</p>`); continue; }
      if (h2) { flushText(); flushList(); parts.push(`<p class="font-bold">${applyInline(h2[1])}</p>`); continue; }
      if (h1) { flushText(); flushList(); parts.push(`<p class="font-black">${applyInline(h1[1])}</p>`); continue; }

      if (/\x02\d+\x03/.test(line)) {
        flushText(); flushList();
        const m = line.match(/\x02(\d+)\x03/);
        if (m) parts.push(codeParts[+m[1]]);
        continue;
      }

      const ul = line.match(/^[ \t]*[-*•]\s+(.*)/);
      if (ul) {
        flushText();
        if (listBuf?.type === 'ol') flushList();
        if (!listBuf) listBuf = { type: 'ul', items: [] };
        listBuf.items.push(`<li>${applyInline(ul[1].trim())}</li>`);
        continue;
      }

      const ol = line.match(/^[ \t]*\d+[.)]\s+(.*)/);
      if (ol) {
        flushText();
        if (listBuf?.type === 'ul') flushList();
        if (!listBuf) listBuf = { type: 'ol', items: [] };
        listBuf.items.push(`<li>${applyInline(ol[1].trim())}</li>`);
        continue;
      }

      flushList();
      if (line.trim()) textBuf.push(line.trim());
    }

    flushText();
    flushList();
    if (parts.length) out.push(parts.join(''));
  }

  let result = out.join('');
  codeParts.forEach((c, i) => { result = result.split(`\x02${i}\x03`).join(c); });
  return result;
}

// ─── Relative timestamp ───────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return new Date(ts).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatMessageBubble({ message, lastUserContent }: Props) {
  const { submitFeedback, pinMessage, removeMessage, retryMessage, closeChat } = useChat();
  const router = useRouter();
  const isUser = message.role === 'user';
  const isError = !!message.error;

  // Relative timestamp — refreshes every 30s
  const [timeLabel, setTimeLabel] = useState(() => relativeTime(message.timestamp));
  useEffect(() => {
    const id = setInterval(() => setTimeLabel(relativeTime(message.timestamp)), 30_000);
    return () => clearInterval(id);
  }, [message.timestamp]);

  // Copy to clipboard
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [message.content]);

  return (
    <div
      className={`group flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
      role="listitem"
      aria-label={`Mensaje de ${isUser ? 'usuario' : 'asistente'}`}
    >
      {/* Avatar (assistant) */}
      {!isUser && (
        <div
          aria-hidden="true"
          className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${
            isError
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
          }`}
        >
          {isError ? <AlertTriangle size={13} /> : <Sparkles size={13} />}
        </div>
      )}

      <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        {/* Pinned indicator */}
        {message.pinned && (
          <p className="text-[9px] text-amber-500 font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1">
            <Pin size={9} /> Anclado
          </p>
        )}

        {/* Bubble */}
        <div
          className={`
            rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words
            ${isUser
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-br-md'
              : isError
                ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/30 rounded-bl-md'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-md'
            }
          `}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <>
              <span
                className="chat-markdown"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
              />
              {message.isStreaming && (
                <span
                  aria-hidden="true"
                  className="chat-cursor inline-block w-[2px] h-[1.1em] bg-current ml-0.5 align-middle rounded-sm"
                />
              )}
            </>
          )}
        </div>

        {/* Data payload */}
        {message.data && (
          <div className="mt-2">
            <ChatDataRenderer data={message.data} />
          </div>
        )}

        {/* Contextual quick-action buttons */}
        {!isUser && message.actions && message.actions.length > 0 && !message.isStreaming && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.actions.map((action) => (
              <button
                key={action.route}
                onClick={() => { closeChat(); router.push(action.route); }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
              >
                {action.label}
                <ExternalLink size={9} />
              </button>
            ))}
          </div>
        )}

        {/* Action bar — visible on hover or when feedback is set */}
        {!message.isStreaming && (
          <div
            className={`flex items-center gap-1 mt-1 transition-opacity duration-150
              ${isUser ? 'justify-end' : 'justify-start'}
              ${message.feedback || message.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
            `}
          >
            {/* Timestamp */}
            <span
              className="text-[9px] text-slate-400 mr-1"
              title={new Date(message.timestamp).toLocaleString('es-BO')}
            >
              {timeLabel}
            </span>

            {/* Copy */}
            <button
              onClick={handleCopy}
              title={copied ? 'Copiado' : 'Copiar respuesta'}
              aria-label={copied ? 'Copiado' : 'Copiar respuesta'}
              className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
            </button>

            {/* Pin */}
            <button
              onClick={() => pinMessage(message.id)}
              title={message.pinned ? 'Desanclar' : 'Anclar mensaje'}
              aria-label={message.pinned ? 'Desanclar' : 'Anclar mensaje'}
              className={`p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${
                message.pinned ? 'text-amber-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Pin size={11} />
            </button>

            {/* Feedback (assistant only) */}
            {!isUser && !isError && (
              <>
                <button
                  onClick={() => submitFeedback(message.id, 'up')}
                  title="Buena respuesta"
                  aria-label="Marcar como buena respuesta"
                  aria-pressed={message.feedback === 'up'}
                  className={`p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${
                    message.feedback === 'up' ? 'text-green-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  <ThumbsUp size={11} />
                </button>
                <button
                  onClick={() => submitFeedback(message.id, 'down')}
                  title="Respuesta incorrecta"
                  aria-label="Marcar como respuesta incorrecta"
                  aria-pressed={message.feedback === 'down'}
                  className={`p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${
                    message.feedback === 'down' ? 'text-red-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  <ThumbsDown size={11} />
                </button>
              </>
            )}

            {/* Retry (error only) */}
            {isError && lastUserContent && (
              <button
                onClick={() => retryMessage(lastUserContent)}
                title="Reintentar"
                aria-label="Reintentar consulta"
                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-500 transition-colors"
              >
                <RotateCcw size={11} />
              </button>
            )}

            {/* Remove */}
            {message.id !== 'welcome' && (
              <button
                onClick={() => removeMessage(message.id)}
                title="Eliminar mensaje"
                aria-label="Eliminar mensaje"
                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Avatar (user) */}
      {isUser && (
        <div
          aria-hidden="true"
          className="shrink-0 w-7 h-7 rounded-lg bg-slate-700 dark:bg-slate-600 flex items-center justify-center mt-0.5"
        >
          <User size={13} className="text-white" />
        </div>
      )}
    </div>
  );
}
