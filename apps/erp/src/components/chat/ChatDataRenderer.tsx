'use client';

import { useState, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import type { ChatDataPayload } from '@/types/chat';

interface Props {
  data: ChatDataPayload;
}

// ─── Palette ──────────────────────────────────────────────────────────────────

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6', '#8b5cf6'];

// ─── Excel export ─────────────────────────────────────────────────────────────

async function exportToExcel(title: string, headers: string[], rows: (string | number)[][]) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title.slice(0, 31));

  ws.addRow(headers).font = { bold: true };
  rows.forEach(row => ws.addRow(row));
  ws.columns.forEach(col => { col.width = 18; });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/\s+/g, '_')}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sortable table ───────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc' | null;

function SortableTable({ title, headers, rows }: { title?: string; headers: string[]; rows: (string | number)[][] }) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const sorted = useCallback(() => {
    if (sortCol === null || sortDir === null) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortCol]; const bv = b[sortCol];
      const an = typeof av === 'number' ? av : parseFloat(String(av).replace(/[^0-9.-]/g, ''));
      const bn = typeof bv === 'number' ? bv : parseFloat(String(bv).replace(/[^0-9.-]/g, ''));
      const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortCol, sortDir]);

  const handleSort = (idx: number) => {
    if (sortCol !== idx) { setSortCol(idx); setSortDir('asc'); return; }
    if (sortDir === 'asc') setSortDir('desc');
    else if (sortDir === 'desc') { setSortCol(null); setSortDir(null); }
    else setSortDir('asc');
  };

  const SortIcon = ({ col }: { col: number }) => {
    if (sortCol !== col) return <ArrowUpDown size={10} className="opacity-30" />;
    if (sortDir === 'asc') return <ArrowUp size={10} className="text-indigo-500" />;
    return <ArrowDown size={10} className="text-indigo-500" />;
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {title && (
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {title}
          </p>
          <button
            onClick={() => exportToExcel(title, headers, rows)}
            title="Exportar a Excel"
            aria-label="Exportar a Excel"
            className="flex items-center gap-1 text-[9px] text-slate-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
          >
            <Download size={11} />
            Excel
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" role="table">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-700">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none"
                  onClick={() => handleSort(i)}
                  scope="col"
                  aria-sort={sortCol === i ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <span className="flex items-center gap-1">
                    {h} <SortIcon col={i} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted().map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-slate-50 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
              >
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-slate-700 dark:text-slate-300 tabular-nums">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Chart renderer ───────────────────────────────────────────────────────────

function ChartBlock({ data }: { data: ChatDataPayload }) {
  const chartData = data.chartData ?? [];
  const keys = data.chartKeys ?? ['value'];

  const tooltipStyle = {
    fontSize: 11,
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  };

  if (data.chartType === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
            {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (data.chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          {keys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Default: bar
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
        {keys.map((k, i) => (
          <Bar key={k} dataKey={k} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export default function ChatDataRenderer({ data }: Props) {

  if (data.type === 'chart') {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
        {data.title && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
            {data.title}
          </p>
        )}
        <ChartBlock data={data} />
      </div>
    );
  }

  if (data.type === 'metric') {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
        {data.title && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
            {data.title}
          </p>
        )}
        <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
          {data.value}
        </p>
      </div>
    );
  }

  if (data.type === 'table' && data.headers && data.rows) {
    return <SortableTable title={data.title} headers={data.headers} rows={data.rows} />;
  }

  if (data.type === 'list' && data.items) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
        {data.title && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
            {data.title}
          </p>
        )}
        <ul className="space-y-1">
          {data.items.map((item, i) => (
            <li key={i} className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2">
              <span className="text-slate-400 mt-0.5 shrink-0">•</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-400 font-mono">
      {JSON.stringify(data, null, 2)}
    </div>
  );
}
