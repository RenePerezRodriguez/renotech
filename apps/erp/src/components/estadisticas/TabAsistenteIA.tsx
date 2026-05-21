'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Sparkles, Loader2, RefreshCw, Download, BarChart3, Table, TrendingUp, List } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { auth } from '@/lib/firebase';
import ChatDataRenderer from '@/components/chat/ChatDataRenderer';
import type { ChatDataPayload } from '@/types/chat';
import clsx from 'clsx';

interface Props {
    branchId: string | undefined;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    data?: ChatDataPayload;
    ts: Date;
    loading?: boolean;
}

const QUICK_CHIPS = [
    { icon: TrendingUp,  label: 'Ventas esta semana',         q: 'Cuanto vendi esta semana y cual fue el margen de utilidad?' },
    { icon: BarChart3,   label: 'Top 5 productos del mes',    q: 'Dame el top 5 de productos mas vendidos del mes en una tabla' },
    { icon: Table,       label: 'Ventas por mes (historico)', q: 'Muestrame el ingreso mensual historico completo en un grafico de barras' },
    { icon: List,        label: 'Clientes frecuentes',        q: 'Lista los 5 clientes con mayor gasto total y cuantas compras hicieron' },
    { icon: TrendingUp,  label: 'Margen ultimos 90 dias',     q: 'Cual es el margen de utilidad de los ultimos 90 dias comparado con los 90 anteriores?' },
    { icon: BarChart3,   label: 'Stock critico',              q: 'Cuantos productos estan sin stock o con stock bajo y cuales son los mas urgentes?' },
    { icon: Table,       label: 'Compras por proveedor',      q: 'Muestra en una tabla cuanto hemos comprado a cada proveedor en total' },
    { icon: BarChart3,   label: 'Rotacion de inventario',     q: 'Como esta la rotacion de inventario? cuantas compras estan en verde, amarillo y rojo?' },
];

function formatTime(d: Date) {
    return d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
}

export default function TabAsistenteIA({ branchId }: Props) {
    const { role } = useAuth();
    useBranch(); // mantener suscripción al contexto
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [contextLoaded, setContextLoaded] = useState(false);
    const [contextLoading, setContextLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Historial compacto para la API (solo texto, sin data)
    const historyRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

    const scrollToBottom = () => {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    };

    // Marca el asistente como listo (v2 no necesita precargar contexto)
    const warmContext = useCallback(async () => {
        if (contextLoaded || contextLoading) return;
        setContextLoading(true);
        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) return;
            await fetch('/api/stats-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ message: '__warm__' }),
            });
            setContextLoaded(true);
        } catch { /* silencioso */ } finally {
            setContextLoading(false);
        }
    }, [contextLoaded, contextLoading]);

    useEffect(() => { warmContext(); }, [warmContext]);

    useEffect(() => { scrollToBottom(); }, [messages]);

    const sendMessage = useCallback(async (text: string) => {
        const q = text.trim();
        if (!q || loading) return;

        setInput('');
        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: q, ts: new Date() };
        const placeholderMsg: Message = { id: 'loading', role: 'assistant', content: '', ts: new Date(), loading: true };

        setMessages(prev => [...prev, userMsg, placeholderMsg]);
        setLoading(true);
        historyRef.current.push({ role: 'user', content: q });

        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('Sin sesión');

            // Mantener solo los últimos 6 mensajes en el historial para controlar costos
            const recentHistory = historyRef.current.slice(-6);

            const res = await fetch('/api/stats-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ message: q, history: recentHistory.slice(0, -1) }),
            });

            let data: { message: string; data?: ChatDataPayload; error?: string };
            try { data = await res.json(); } catch { data = { message: 'Error al procesar la respuesta.' }; }

            if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

            const assistantMsg: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: data.message,
                data: data.data ?? undefined,
                ts: new Date(),
            };
            setMessages(prev => [...prev.filter(m => m.id !== 'loading'), assistantMsg]);
            historyRef.current.push({ role: 'assistant', content: data.message });
            setContextLoaded(true);
        } catch (err: any) {
            const errMsg: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: `Error: ${err.message || 'No se pudo conectar con el asistente.'}`,
                ts: new Date(),
            };
            setMessages(prev => [...prev.filter(m => m.id !== 'loading'), errMsg]);
        } finally {
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [loading, branchId]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
    };

    const clearChat = () => {
        setMessages([]);
        historyRef.current = [];
        inputRef.current?.focus();
    };

    const exportCSV = (data: ChatDataPayload) => {
        if (data.type !== 'table' || !data.headers || !data.rows) return;
        const csv = '﻿' + [data.headers.join(';'), ...data.rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${(data.title || 'stats').replace(/\s+/g, '_')}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const isEmpty = messages.length === 0;

    return (
        <div data-tour="estadisticas-asistente" className="flex flex-col h-[75vh] min-h-[500px] bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                        <Sparkles size={16} className="text-yellow-500" />
                    </div>
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-900 dark:text-white">Asistente IA</p>
                        <div className="flex items-center gap-1.5">
                            <div className={clsx('w-1.5 h-1.5 rounded-full', contextLoading ? 'bg-yellow-400 animate-pulse' : contextLoaded ? 'bg-emerald-400' : 'bg-slate-300')} />
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                {contextLoading ? 'Conectando...' : contextLoaded ? 'Listo · Todos los datos' : 'Listo'}
                            </p>
                        </div>
                    </div>
                </div>
                {messages.length > 0 && (
                    <button onClick={clearChat} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
                        <RefreshCw size={11} /> Nueva consulta
                    </button>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

                {/* Empty state */}
                {isEmpty && (
                    <div className="flex flex-col items-center justify-center h-full gap-6 text-center pb-8">
                        <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 flex items-center justify-center">
                            <Sparkles size={28} className="text-yellow-500" />
                        </div>
                        <div>
                            <p className="text-sm font-black text-slate-900 dark:text-white">Consulta tus estadisticas</p>
                            <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                                Pregunta sobre ventas, margen, productos o clientes y te respondo con datos reales de tu negocio.
                            </p>
                        </div>
                        <div data-tour="estadisticas-chips" className="flex flex-wrap gap-2 justify-center max-w-lg">
                            {QUICK_CHIPS.map((chip, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(chip.q)}
                                    disabled={loading}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:border-yellow-400 hover:text-yellow-600 dark:hover:text-yellow-400 transition-all disabled:opacity-40"
                                >
                                    <chip.icon size={10} />
                                    {chip.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Messages list */}
                {messages.map(msg => (
                    <div key={msg.id} className={clsx('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                        {/* Avatar */}
                        <div className={clsx(
                            'w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                            msg.role === 'user'
                                ? 'bg-yellow-500/10'
                                : 'bg-slate-100 dark:bg-white/5'
                        )}>
                            {msg.role === 'user'
                                ? <User size={13} className="text-yellow-500" />
                                : <Bot size={13} className="text-slate-400" />
                            }
                        </div>

                        {/* Bubble */}
                        <div className={clsx('flex-1 min-w-0 space-y-2', msg.role === 'user' ? 'items-end flex flex-col' : '')}>
                            <div className={clsx(
                                'px-4 py-3 rounded-2xl text-[12px] font-medium leading-relaxed max-w-[85%]',
                                msg.role === 'user'
                                    ? 'bg-yellow-500 text-black font-bold rounded-tr-sm'
                                    : 'bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-slate-200 rounded-tl-sm border border-slate-100 dark:border-white/10'
                            )}>
                                {msg.loading
                                    ? <span className="flex items-center gap-2 text-slate-400"><Loader2 size={13} className="animate-spin" /> Analizando datos...</span>
                                    : msg.content
                                }
                            </div>

                            {/* Data visualization */}
                            {msg.data && !msg.loading && (
                                <div className="w-full max-w-[85%]">
                                    <ChatDataRenderer data={msg.data} />
                                    {msg.data.type === 'table' && (
                                        <button
                                            onClick={() => exportCSV(msg.data!)}
                                            className="flex items-center gap-1 mt-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors"
                                        >
                                            <Download size={10} /> Exportar CSV
                                        </button>
                                    )}
                                </div>
                            )}

                            <p className={clsx('text-[9px] text-slate-300 dark:text-slate-600', msg.role === 'user' ? 'text-right' : '')}>
                                {formatTime(msg.ts)}
                            </p>
                        </div>
                    </div>
                ))}

                {/* Quick chips after first response */}
                {!isEmpty && !loading && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                        {QUICK_CHIPS.slice(0, 3).map((chip, i) => (
                            <button
                                key={i}
                                onClick={() => sendMessage(chip.q)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:border-yellow-400 hover:text-yellow-600 dark:hover:text-yellow-400 transition-all"
                            >
                                <chip.icon size={9} />
                                {chip.label}
                            </button>
                        ))}
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div data-tour="estadisticas-input" className="shrink-0 px-4 py-3 border-t border-slate-100 dark:border-white/10">
                <div className="flex items-end gap-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-2.5 focus-within:border-yellow-400 transition-colors">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Pregunta sobre tus ventas, margen, productos, clientes..."
                        rows={1}
                        disabled={loading}
                        className="flex-1 bg-transparent text-[12px] font-medium text-slate-900 dark:text-white placeholder:text-slate-400 outline-none resize-none leading-relaxed disabled:opacity-50"
                        style={{ maxHeight: '120px', overflowY: 'auto' }}
                    />
                    <button
                        onClick={() => sendMessage(input)}
                        disabled={!input.trim() || loading}
                        className="w-8 h-8 rounded-xl bg-yellow-500 flex items-center justify-center text-black hover:bg-yellow-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                </div>
                <p className="text-[9px] text-slate-300 dark:text-slate-600 mt-1.5 text-center">
                    Enter para enviar · Shift+Enter nueva linea · Los datos se actualizan cada 5 min
                </p>
            </div>
        </div>
    );
}
