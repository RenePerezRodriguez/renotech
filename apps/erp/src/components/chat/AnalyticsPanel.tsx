'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import { BarChart2, X, Download, RefreshCw, TrendingUp, MessageSquare, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { AnalyticsData } from '@/types/chat';

export default function AnalyticsPanel({ onClose }: { onClose: () => void }) {
  const authCtx = useAuth() as { role?: string | null; branchId?: string | null };
  const role = authCtx.role ?? null;
  const branchId = authCtx.branchId ?? null;

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('Sin sesión activa');
      const token = await user.getIdToken();
      const params = new URLSearchParams({ role: role ?? '', days: String(days) });
      if (branchId) params.set('branchId', branchId);
      const res = await fetch(`/api/chat/analytics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [role, branchId, days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExport = () => {
    if (!data) return;
    const rows: string[][] = [
      ['Fecha', 'Mensajes'],
      ...data.dailyCounts.map((d) => [d.date, String(d.count)]),
      [],
      ['Intención', 'Cantidad'],
      ...data.intentDistribution.map((d) => [d.name, String(d.value)]),
      [],
      ['Herramienta', 'Usos'],
      ...data.toolUsage.map((d) => [d.name, String(d.count)]),
      [],
      ['Pregunta frecuente', 'Veces'],
      ...data.topQuestions.map((d) => [d.message, String(d.count)]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-chat-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sub-header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2">
          <BarChart2 size={14} className="text-indigo-500" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Analytics del Chatbot</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-[9px] font-semibold">
            {([7, 30, 90] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2 py-1 transition-colors ${days === d ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            title="Actualizar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExport}
            disabled={!data}
            title="Exportar CSV"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30"
          >
            <Download size={11} />
          </button>
          <button
            onClick={onClose}
            title="Cerrar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scrollbar-thin">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={16} className="animate-spin text-slate-400 mr-2" />
            <span className="text-xs text-slate-400">Cargando analytics…</span>
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-8">
            <p className="text-xs text-red-500 mb-2">{error}</p>
            <button onClick={fetchData} className="text-[10px] text-indigo-500 underline">
              Reintentar
            </button>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                icon={<MessageSquare size={14} className="text-indigo-400" />}
                value={data.totalMessages}
                label="mensajes"
              />
              <StatCard
                icon={<CheckCircle size={14} className="text-emerald-400" />}
                value={`${data.successRate}%`}
                label="éxito"
              />
              <StatCard
                icon={<TrendingUp size={14} className="text-amber-400" />}
                value={data.totalMessages > 0 ? Math.round(data.totalMessages / days) : 0}
                label="por día"
              />
            </div>

            {/* Daily activity chart */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Actividad diaria — últimos {days} días
              </p>
              <DailyChart data={data.dailyCounts} />
              <div className="flex justify-between mt-1">
                <span className="text-[8px] text-slate-400">{data.dailyCounts[0]?.date?.slice(5)}</span>
                <span className="text-[8px] text-slate-400">{data.dailyCounts[data.dailyCounts.length - 1]?.date?.slice(5)}</span>
              </div>
            </div>

            {/* Intent + Tools */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Intención
                </p>
                {data.intentDistribution.length === 0 ? (
                  <p className="text-[9px] text-slate-400">Sin datos</p>
                ) : (
                  <div className="space-y-2">
                    {data.intentDistribution.map((item) => (
                      <HBar
                        key={item.name}
                        name={item.name}
                        value={item.value}
                        max={data.intentDistribution[0].value}
                        color="indigo"
                      />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Herramientas
                </p>
                {data.toolUsage.length === 0 ? (
                  <p className="text-[9px] text-slate-400">Sin datos</p>
                ) : (
                  <div className="space-y-2">
                    {data.toolUsage.slice(0, 6).map((item) => (
                      <HBar
                        key={item.name}
                        name={item.name}
                        value={item.count}
                        max={data.toolUsage[0].count}
                        color="violet"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Top questions */}
            {data.topQuestions.length > 0 && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Preguntas frecuentes
                </p>
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                  {data.topQuestions.map((q, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <span className="text-[9px] font-bold text-slate-400 w-4 shrink-0 pt-0.5">{i + 1}</span>
                      <span className="text-[10px] text-slate-600 dark:text-slate-400 flex-1 leading-snug">{q.message}</span>
                      <span className="text-[9px] font-bold text-indigo-500 shrink-0">×{q.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.topQuestions.length === 0 && data.totalMessages > 0 && (
              <p className="text-[9px] text-slate-400 text-center pb-2">
                No hay preguntas repetidas aún (mínimo 2 repeticiones).
              </p>
            )}

            {data.totalMessages === 0 && (
              <div className="text-center py-4">
                <p className="text-xs text-slate-400">Sin datos para los últimos {days} días.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Micro-components ──────────────────────────────────────────────────────────

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-lg font-black text-slate-800 dark:text-slate-200 leading-none">{value}</p>
      <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

function DailyChart({ data }: { data: { date: string; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-px h-14 bg-slate-50 dark:bg-slate-800/30 rounded-lg p-1" aria-label="Actividad diaria">
      {data.map((d) => (
        <div
          key={d.date}
          className="flex-1 bg-indigo-400 dark:bg-indigo-500 rounded-t-[1px] transition-all"
          style={{ height: `${Math.max((d.count / maxCount) * 100, d.count > 0 ? 5 : 1)}%` }}
          title={`${d.date}: ${d.count} mensaje${d.count !== 1 ? 's' : ''}`}
        />
      ))}
    </div>
  );
}

function HBar({ name, value, max, color }: { name: string; value: number; max: number; color: 'indigo' | 'violet' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const barClass = color === 'indigo'
    ? 'bg-indigo-400 dark:bg-indigo-500'
    : 'bg-violet-400 dark:bg-violet-500';
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-[9px] text-slate-600 dark:text-slate-400 truncate max-w-[75%] leading-tight">{name}</span>
        <span className="text-[9px] font-bold text-slate-500">{value}</span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barClass} transition-all`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}
