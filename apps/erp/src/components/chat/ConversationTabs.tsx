'use client';

import { useState, useRef } from 'react';
import { Plus, X, MessageSquare, Check, Pencil } from 'lucide-react';
import type { ChatConversation } from '@/types/chat';

interface Props {
  conversations: ChatConversation[];
  activeConvId: string | null;
  onSwitch: (convId: string) => void;
  onNew: () => void;
  onDelete: (convId: string) => void;
  onRename: (convId: string, title: string) => void;
}

export default function ConversationTabs({
  conversations,
  activeConvId,
  onSwitch,
  onNew,
  onDelete,
  onRename,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = conversations.slice(0, 6);

  const startEdit = (conv: ChatConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditValue(conv.title);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const commitEdit = (convId: string) => {
    if (editValue.trim()) onRename(convId, editValue.trim());
    setEditingId(null);
  };

  return (
    <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto scrollbar-none">
      {/* New conversation */}
      <button
        onClick={onNew}
        title="Nueva conversación"
        aria-label="Nueva conversación"
        className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors border
          ${activeConvId === null
            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
            : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
      >
        <Plus size={10} strokeWidth={2.5} />
        Nueva
      </button>

      {visible.map((conv) => (
        <div
          key={conv.id}
          className={`shrink-0 flex items-center gap-1 rounded-lg border transition-colors cursor-pointer group
            ${conv.id === activeConvId
              ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'
              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
        >
          {editingId === conv.id ? (
            <div className="flex items-center gap-1 px-2 py-1">
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitEdit(conv.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit(conv.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="w-28 text-[10px] bg-transparent border-b border-indigo-400 outline-none text-slate-800 dark:text-slate-200"
              />
              <button
                onClick={() => commitEdit(conv.id)}
                className="text-indigo-500 hover:text-indigo-700"
              >
                <Check size={10} />
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => onSwitch(conv.id)}
                className="flex items-center gap-1.5 pl-2.5 py-1.5 max-w-[120px]"
                title={conv.title}
              >
                <MessageSquare
                  size={10}
                  className={conv.id === activeConvId
                    ? 'text-indigo-500'
                    : 'text-slate-400 dark:text-slate-500'}
                />
                <span className={`text-[10px] font-medium truncate ${
                  conv.id === activeConvId
                    ? 'text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400'
                }`}>
                  {conv.title}
                </span>
              </button>
              <div className="flex items-center pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => startEdit(conv, e)}
                  title="Renombrar"
                  className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <Pencil size={9} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                  title="Eliminar conversación"
                  className="p-0.5 rounded text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X size={9} />
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {conversations.length > 6 && (
        <span className="shrink-0 text-[9px] text-slate-400 ml-1">
          +{conversations.length - 6} más
        </span>
      )}
    </div>
  );
}
