'use client';

import { MessageCircle, X, Sparkles } from 'lucide-react';
import { useChat } from '@/contexts/ChatContext';

/**
 * Botón flotante que abre/cierra el chat. Visible solo cuando el usuario está autenticado.
 */
export default function ChatFloatingButton() {
  const { isOpen, toggleChat } = useChat();

  return (
    <button
      onClick={toggleChat}
      title={isOpen ? 'Cerrar chat' : 'Abrir asistente virtual'}
      className={`
        md:hidden
        fixed bottom-6 right-6 z-9998
        flex items-center justify-center
        w-14 h-14 rounded-2xl
        shadow-lg shadow-slate-900/20 dark:shadow-black/40
        transition-all duration-300 ease-in-out
        hover:scale-105 active:scale-95
        ${isOpen
          ? 'bg-slate-800 dark:bg-slate-700 text-white rotate-90'
          : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
        }
      `}
    >
      {isOpen ? <X size={22} strokeWidth={2} /> : <Sparkles size={22} strokeWidth={2} />}
    </button>
  );
}
