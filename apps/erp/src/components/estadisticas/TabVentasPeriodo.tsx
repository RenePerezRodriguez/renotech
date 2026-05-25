'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Download, Loader2, TrendingUp } from 'lucide-react';
import { SalesReportService, PeriodSalesReport } from '@/services/SalesReportService';
import { toast } from 'sonner';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import clsx from 'clsx';

interface Props {
    branchId: string | undefined;
}

type Granularidad = 'dia' | 'semana' | 'mes';

const QUICK_PRESETS = [
    { label: 'Hoy',       dias: 0   },
    { label: 'Semana',    dias: 7   },
    { label: 'Mes',       dias: 30  },
    { label: 'Trimestre', dias: 90  },
    { label: 'Año',       dias: 365 },
];

const INPUT_CLS = 'px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[11px] font-bold text-slate-700 dark:text-slate-200';
const LABEL_CLS = 'text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1';

function margenColor(m: number) {
    if (m >= 30) return 'text-emerald-600 dark:text-emerald-400';
    if (m >= 15) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-rose-600 dark:text-rose-400';
}

export default function TabVentasPeriodo({ branchId }: Props) {
    const [desde, setDesde] = useState(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10);
    });
    const [hasta,  setHasta]  = useState(() => new Date().toISOString().slice(0, 10));
    const [gran,   setGran]   = useState<Granularidad>('dia');
    const [page,   setPage]   = useState(1);
    const [perPage, setPerPage] = useState(25);
    const [orderBy, setOrderBy] = useState('periodo_asc');
    const [search,  setSearch]  = useState('');

    // Filtros locales adicionales
    const [minIngreso,    setMinIngreso]    = useState('');
    const [maxIngreso,    setMaxIngreso]    = useState('');
    const [minVentas,     setMinVentas]     = useState('');
    const [minMargen,     setMinMargen]     = useState('');
    const [soloConVentas, setSoloConVentas] = useState(false);

    const [report,  setReport]  = useState<PeriodSalesReport | null>(null);
    const [loading, setLoading] = useState(false);

    const applyPreset = (dias: number) => {
        const end   = new Date();
        const start = new Date();
        if (dias === 0) {
            setDesde(end.toISOString().slice(0, 10));
        } else {
            start.setDate(start.getDate() - dias);
            setDesde(start.toISOString().slice(0, 10));
        }
        setHasta(end.toISOString().slice(0, 10));
        setPage(1);
    };

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const r = await SalesReportService.report(
                branchId,
                new Date(desde + 'T00:00:00-04:00'),
                new Date(hasta + 'T23:59:59-04:00'),
                gran, 1, 0, orderBy, '',
            );
            setReport(r);
        } catch (e: any) {
            toast.error('Error al cargar reporte: ' + (e.message || ''));
        } finally {
            setLoading(false);
        }
    }, [branchId, desde, hasta, gran, orderBy]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    const periodosFiltrados = useMemo(() => {
        return (report?.periodos || []).filter(p => {
            if (search        && !p.periodo.toLowerCase().includes(search.toLowerCase())) return false;
            if (soloConVentas && p.ventas === 0)                                          return false;
            if (minIngreso !== '' && p.ingresoNeto < Number(minIngreso))                  return false;
            if (maxIngreso !== '' && p.ingresoNeto > Number(maxIngreso))                  return false;
            if (minVentas  !== '' && p.ventas      < Number(minVentas))                   return false;
            if (minMargen  !== '' && p.margenUtilidad < Number(minMargen))                return false;
            return true;
        });
    }, [report, search, soloConVentas, minIngreso, maxIngreso, minVentas, minMargen]);

    const totalPagesLocal = perPage === 0 ? 1 : Math.max(1, Math.ceil(periodosFiltrados.length / perPage));
    const periodosPagina  = perPage === 0
        ? periodosFiltrados
        : periodosFiltrados.slice((page - 1) * perPage, page * perPage);

    const chartData = periodosPagina.filter(p => p.ingresoNeto > 0).map(p => ({
        name:   p.periodo,
        total:  Math.round(p.ingresoNeto * 100) / 100,
        costo:  Math.round(p.totalCosto * 100) / 100,
    }));

    // Resumen dinámico basado en datos filtrados
    const resumenFiltrado = useMemo(() => {
        const ventas       = periodosFiltrados.reduce((s, p) => s + p.ventas,        0);
        const ingresoBruto = periodosFiltrados.reduce((s, p) => s + p.ingresoBruto,  0);
        const devoluciones = periodosFiltrados.reduce((s, p) => s + p.devoluciones,  0);
        const ingresoNeto  = periodosFiltrados.reduce((s, p) => s + p.ingresoNeto,   0);
        const totalCosto   = periodosFiltrados.reduce((s, p) => s + p.totalCosto,    0);
        const ticket       = ventas > 0 ? ingresoNeto / ventas : 0;
        const margen       = ingresoNeto > 0 ? ((ingresoNeto - totalCosto) / ingresoNeto) * 100 : 0;
        return { ventas, ingresoBruto, devoluciones, ingresoNeto, totalCosto, ticketPromedio: ticket, margenUtilidad: margen };
    }, [periodosFiltrados]);

    const handleExport = () => {
        if (!periodosFiltrados.length) return toast.error('Nada que exportar');
        const headers = ['Periodo', 'Ventas', 'Ingreso Bruto', 'Devoluciones', 'Ingreso Neto', 'Costo Total', 'Margen %', 'Ticket Promedio'];
        const csv = '﻿' + [headers.join(';'), ...periodosFiltrados.map(r => [
            r.periodo, r.ventas,
            r.ingresoBruto.toFixed(2), r.devoluciones.toFixed(2),
            r.ingresoNeto.toFixed(2),  r.totalCosto.toFixed(2),
            r.margenUtilidad.toFixed(1) + '%', r.ticketPromedio.toFixed(2),
        ].join(';'))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `ventas_${desde}_${hasta}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success('Reporte exportado');
    };

    const hasActiveFilters = minIngreso !== '' || maxIngreso !== '' || minVentas !== '' || minMargen !== '' || soloConVentas;

    return (
        <div className="space-y-5 animate-in fade-in duration-300">

            {/* Quick presets */}
            <div className="flex flex-wrap items-center gap-2">
                <span className={LABEL_CLS} style={{ margin: 0 }}>Periodo rapido:</span>
                {QUICK_PRESETS.map(p => (
                    <button key={p.label} onClick={() => applyPreset(p.dias)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[9px] font-black text-slate-500 hover:text-yellow-600 hover:border-yellow-400 dark:hover:text-yellow-400 uppercase tracking-widest transition-all">
                        {p.label}
                    </button>
                ))}
            </div>

            {/* Filtros fecha + granularidad */}
            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <label className={LABEL_CLS}>Desde</label>
                    <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1); }} className={INPUT_CLS} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Hasta</label>
                    <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1); }} className={INPUT_CLS} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Agrupar</label>
                    <select value={gran} onChange={e => { setGran(e.target.value as Granularidad); setPage(1); }} className={INPUT_CLS}>
                        <option value="dia">Dia</option>
                        <option value="semana">Semana</option>
                        <option value="mes">Mes</option>
                    </select>
                </div>
                <button onClick={handleExport}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[10px] font-black text-slate-500 hover:text-slate-900 dark:hover:text-white uppercase tracking-widest transition-colors">
                    <Download size={12} /> Exportar
                </button>
            </div>

            {/* Filtros adicionales */}
            <div className="flex flex-wrap items-end gap-3 p-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-2xl">
                <div>
                    <label className={LABEL_CLS}>Ingreso neto min</label>
                    <input type="number" min="0" placeholder="Bs. 0" value={minIngreso}
                        onChange={e => { setMinIngreso(e.target.value); setPage(1); }}
                        className={`w-28 ${INPUT_CLS}`} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Ingreso neto max</label>
                    <input type="number" min="0" placeholder="Sin limite" value={maxIngreso}
                        onChange={e => { setMaxIngreso(e.target.value); setPage(1); }}
                        className={`w-28 ${INPUT_CLS}`} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Ventas minimas</label>
                    <input type="number" min="0" placeholder="0" value={minVentas}
                        onChange={e => { setMinVentas(e.target.value); setPage(1); }}
                        className={`w-20 ${INPUT_CLS}`} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Margen min %</label>
                    <input type="number" min="0" max="100" placeholder="0%" value={minMargen}
                        onChange={e => { setMinMargen(e.target.value); setPage(1); }}
                        className={`w-20 ${INPUT_CLS}`} />
                </div>
                <div className="flex flex-col">
                    <label className={LABEL_CLS}>Solo con ventas</label>
                    <button
                        onClick={() => { setSoloConVentas(v => !v); setPage(1); }}
                        className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                            soloConVentas
                                ? 'bg-yellow-500 border-yellow-500 text-black'
                                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-slate-500'
                        }`}>
                        {soloConVentas ? 'Activo' : 'Inactivo'}
                    </button>
                </div>
                {hasActiveFilters && (
                    <button onClick={() => { setMinIngreso(''); setMaxIngreso(''); setMinVentas(''); setMinMargen(''); setSoloConVentas(false); setPage(1); }}
                        className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest transition-colors hover:bg-rose-100">
                        Limpiar filtros
                    </button>
                )}
            </div>

            {/* KPIs dinámicos */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {[
                    { label: 'Ventas',          value: resumenFiltrado.ventas },
                    { label: 'Ingreso neto',    value: `Bs. ${resumenFiltrado.ingresoNeto.toLocaleString('es-BO', { minimumFractionDigits: 2 })}` },
                    { label: 'Ticket promedio', value: `Bs. ${resumenFiltrado.ticketPromedio.toLocaleString('es-BO', { minimumFractionDigits: 2 })}` },
                    { label: 'Devoluciones',    value: `Bs. ${resumenFiltrado.devoluciones.toLocaleString('es-BO', { minimumFractionDigits: 2 })}` },
                    { label: 'vs periodo ant.', value: report?.resumen.variacion != null ? `${report.resumen.variacion > 0 ? '+' : ''}${report.resumen.variacion.toFixed(1)}%` : '—' },
                    { label: 'Margen utilidad', value: `${resumenFiltrado.margenUtilidad.toFixed(1)}%`, highlight: true, margen: resumenFiltrado.margenUtilidad },
                ].map((kpi, i) => (
                    <div key={i} className={clsx(
                        'bg-white dark:bg-[#111827] border rounded-2xl p-4',
                        kpi.highlight ? 'border-yellow-200 dark:border-yellow-500/20 bg-yellow-50/50 dark:bg-yellow-500/5' : 'border-slate-200 dark:border-white/10'
                    )}>
                        <div className="flex items-center gap-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            {kpi.highlight && <TrendingUp size={9} className="text-yellow-500" />}
                            {kpi.label}
                        </div>
                        <div className={clsx(
                            'text-lg font-black mt-1 tabular-nums',
                            kpi.highlight && kpi.margen !== undefined ? margenColor(kpi.margen) : 'text-slate-900 dark:text-white'
                        )}>
                            {kpi.value}
                        </div>
                    </div>
                ))}
            </div>

            {/* Chart */}
            {chartData.length > 0 && (
                <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-3xl p-6">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">Ingreso neto vs Costo por periodo</p>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#64748b" opacity={0.1} />
                                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 900 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: '#64748b', fontWeight: 900 }} axisLine={false} tickLine={false}
                                    tickFormatter={v => `Bs. ${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700 }}
                                    formatter={(v: any, name?: any) => [`Bs. ${Number(v).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`, name === 'total' ? 'Ingreso neto' : 'Costo'] as [string, string]} />
                                <Bar dataKey="total" name="total" radius={[6, 6, 0, 0]} maxBarSize={32} fill="#eab308" fillOpacity={0.85} />
                                <Bar dataKey="costo" name="costo" radius={[6, 6, 0, 0]} maxBarSize={32} fill="#f43f5e" fillOpacity={0.5} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Controles tabla */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[10px] font-bold">
                        <option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="0">Todos</option>
                    </select>
                    <select value={orderBy} onChange={e => { setOrderBy(e.target.value); setPage(1); }}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[10px] font-bold">
                        <option value="periodo_asc">Cronologico asc</option>
                        <option value="periodo_desc">Cronologico desc</option>
                        <option value="ingreso_neto_desc">Mayor ingreso</option>
                        <option value="ingreso_neto_asc">Menor ingreso</option>
                        <option value="n_ventas_desc">Mas ventas</option>
                        <option value="ticket_promedio_desc">Mayor ticket</option>
                        <option value="margen_desc">Mayor margen</option>
                    </select>
                    <input type="search" placeholder="Buscar periodo..." value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[10px] font-bold w-40" />
                    <span className="text-[10px] text-slate-400 font-bold">
                        {periodosFiltrados.length} periodo{periodosFiltrados.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-black text-slate-500">
                    <button onClick={() => setPage(1)} disabled={page <= 1} className="px-2 py-1 rounded-lg border disabled:opacity-30">&laquo;</button>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-2 py-1 rounded-lg border disabled:opacity-30">&lsaquo;</button>
                    <span className="px-3">{page} / {totalPagesLocal}</span>
                    <button onClick={() => setPage(p => Math.min(totalPagesLocal, p + 1))} disabled={page >= totalPagesLocal} className="px-2 py-1 rounded-lg border disabled:opacity-30">&rsaquo;</button>
                    <button onClick={() => setPage(totalPagesLocal)} disabled={page >= totalPagesLocal} className="px-2 py-1 rounded-lg border disabled:opacity-30">&raquo;</button>
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-2xl overflow-x-auto">
                {loading ? (
                    <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
                ) : (
                    <table className="w-full text-[11px]">
                        <thead className="bg-slate-50 dark:bg-black/40">
                            <tr>
                                <th className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Periodo</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ventas</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ingreso bruto</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Devoluciones</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ingreso neto</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Costo total</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Margen %</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ticket prom.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {periodosPagina.map(p => (
                                <tr key={p.sortKey} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                    <td className="px-4 py-3 font-bold text-slate-800 dark:text-white">{p.periodo}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{p.ventas}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">Bs. {p.ingresoBruto.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-rose-600">Bs. {p.devoluciones.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900 dark:text-white">Bs. {p.ingresoNeto.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">Bs. {p.totalCosto.toFixed(2)}</td>
                                    <td className={clsx('px-4 py-3 text-right tabular-nums font-black', margenColor(p.margenUtilidad))}>
                                        {p.margenUtilidad.toFixed(1)}%
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">Bs. {p.ticketPromedio.toFixed(2)}</td>
                                </tr>
                            ))}
                            {periodosPagina.length === 0 && (
                                <tr><td colSpan={8} className="text-center py-12 text-slate-400 font-bold text-xs">Sin datos para los filtros seleccionados</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
