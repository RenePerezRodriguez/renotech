'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Sale } from '@/types';
import { toast } from 'sonner';

interface Props {
    branchId: string | undefined;
}

interface ClientRow {
    clientId:    string;
    razonSocial: string;
    nit:         string;
    tipo:        string;
    totalSpent:  number;
    saleCount:   number;
    avgTicket:   number;
    maxTicket:   number;
}

const QUICK_PRESETS = [
    { label: 'Mes',       days: 30  },
    { label: 'Trimestre', days: 90  },
    { label: 'Semestre',  days: 180 },
    { label: '1 año',     days: 365 },
];

const TOP_N_OPTIONS = [
    { label: 'Top 10',  value: 10  },
    { label: 'Top 20',  value: 20  },
    { label: 'Top 50',  value: 50  },
    { label: 'Top 100', value: 100 },
    { label: 'Todos',   value: 0   },
];

const INPUT_CLS = 'px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[11px] font-bold text-slate-700 dark:text-slate-200';
const LABEL_CLS = 'text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1';

export default function TabTopClientes({ branchId }: Props) {
    const [desde, setDesde] = useState(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10);
    });
    const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));

    // Filtros adicionales
    const [tipoFilter, setTipoFilter] = useState<'ALL' | 'PARTICULAR' | 'EMPRESA'>('ALL');
    const [minSpent,   setMinSpent]   = useState('');
    const [maxSpent,   setMaxSpent]   = useState('');
    const [minSales,   setMinSales]   = useState('');
    const [topN,       setTopN]       = useState(0);

    const [rows,    setRows]    = useState<ClientRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search,  setSearch]  = useState('');
    const [orderBy, setOrderBy] = useState<'total_desc' | 'total_asc' | 'count_desc' | 'ticket_desc' | 'max_desc'>('total_desc');
    const [page,    setPage]    = useState(1);
    const [perPage, setPerPage] = useState(25);

    const applyPreset = (days: number) => {
        const end   = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);
        setDesde(start.toISOString().slice(0, 10));
        setHasta(end.toISOString().slice(0, 10));
        setPage(1);
    };

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const startTs = Timestamp.fromDate(new Date(desde + 'T00:00:00-04:00'));
                const endTs   = Timestamp.fromDate(new Date(hasta + 'T23:59:59-04:00'));
                const constraints: any[] = [
                    where('status', '==', 'COMPLETED'),
                    where('fecha', '>=', startTs),
                    where('fecha', '<=', endTs),
                ];
                if (branchId) constraints.unshift(where('branchId', '==', branchId));
                const snap = await getDocs(query(collection(db, 'ventas'), ...constraints));

                const map = new Map<string, ClientRow>();
                for (const docSnap of snap.docs) {
                    const sale = docSnap.data() as Sale;
                    if (sale.status !== 'COMPLETED' || !sale.cliente?.id) continue;
                    const netoVenta = (sale.items || [])
                        .filter(it => !it.isVoided)
                        .reduce((s, it) => s + (it.subtotal || 0), 0);

                    const r = map.get(sale.cliente.id) || {
                        clientId:    sale.cliente.id,
                        razonSocial: sale.cliente.razonSocial || '-',
                        nit:         (sale.cliente as any).nit || (sale.cliente as any).documentNumber || '-',
                        tipo:        (sale.cliente as any).tipo || '',
                        totalSpent:  0,
                        saleCount:   0,
                        avgTicket:   0,
                        maxTicket:   0,
                    };
                    r.totalSpent += netoVenta;
                    r.saleCount  += 1;
                    if (netoVenta > r.maxTicket) r.maxTicket = netoVenta;
                    map.set(sale.cliente.id, r);
                }
                const result = Array.from(map.values()).map(r => ({
                    ...r,
                    avgTicket: r.saleCount > 0 ? r.totalSpent / r.saleCount : 0,
                }));
                setRows(result);
                setPage(1);
            } catch (e: any) {
                toast.error('Error: ' + (e.message || ''));
            } finally {
                setLoading(false);
            }
        })();
    }, [branchId, desde, hasta]);

    const filtered = useMemo(() => {
        let list = rows.filter(r => {
            if (search &&
                !r.razonSocial.toLowerCase().includes(search.toLowerCase()) &&
                !r.nit.toLowerCase().includes(search.toLowerCase())) return false;
            if (tipoFilter !== 'ALL' && r.tipo !== tipoFilter) return false;
            if (minSpent !== '' && r.totalSpent < Number(minSpent)) return false;
            if (maxSpent !== '' && r.totalSpent > Number(maxSpent)) return false;
            if (minSales !== '' && r.saleCount  < Number(minSales)) return false;
            return true;
        });
        list = [...list].sort((a, b) => {
            switch (orderBy) {
                case 'total_asc':  return a.totalSpent - b.totalSpent;
                case 'count_desc': return b.saleCount  - a.saleCount;
                case 'ticket_desc': return b.avgTicket - a.avgTicket;
                case 'max_desc':   return b.maxTicket  - a.maxTicket;
                case 'total_desc':
                default:           return b.totalSpent - a.totalSpent;
            }
        });
        if (topN > 0) list = list.slice(0, topN);
        return list;
    }, [rows, search, orderBy, tipoFilter, minSpent, maxSpent, minSales, topN]);

    const totalPages = perPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / perPage));
    const pageRows   = perPage === 0 ? filtered : filtered.slice((page - 1) * perPage, page * perPage);

    // KPIs de resumen
    const kpis = useMemo(() => ({
        totalClientes:  filtered.length,
        totalIngreso:   filtered.reduce((s, r) => s + r.totalSpent, 0),
        avgGasto:       filtered.length > 0 ? filtered.reduce((s, r) => s + r.totalSpent, 0) / filtered.length : 0,
        totalVentas:    filtered.reduce((s, r) => s + r.saleCount,  0),
    }), [filtered]);

    const handleExport = () => {
        if (!filtered.length) return toast.error('Nada que exportar');
        const headers = ['#', 'Cliente', 'NIT/CI', 'Tipo', 'Ventas', 'Total', 'Ticket prom.', 'Mayor compra'];
        const csv = '﻿' + [headers.join(';'), ...filtered.map((r, i) => [
            i + 1,
            r.razonSocial.replace(/;/g, ','),
            r.nit, r.tipo || '-',
            r.saleCount,
            r.totalSpent.toFixed(2),
            r.avgTicket.toFixed(2),
            r.maxTicket.toFixed(2),
        ].join(';'))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `top_clientes_${desde}_${hasta}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success('Exportado');
    };

    const hasActiveFilters = tipoFilter !== 'ALL' || minSpent !== '' || maxSpent !== '' || minSales !== '' || topN !== 0;

    return (
        <div className="space-y-5 animate-in fade-in duration-300">

            {/* Quick presets */}
            <div className="flex flex-wrap items-center gap-2">
                <span className={LABEL_CLS} style={{ margin: 0 }}>Período rápido:</span>
                {QUICK_PRESETS.map(p => (
                    <button key={p.label} onClick={() => applyPreset(p.days)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[9px] font-black text-slate-500 hover:text-yellow-600 hover:border-yellow-400 dark:hover:text-yellow-400 uppercase tracking-widest transition-all">
                        {p.label}
                    </button>
                ))}
            </div>

            {/* Filtros de fecha */}
            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <label className={LABEL_CLS}>Desde</label>
                    <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1); }} className={INPUT_CLS} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Hasta</label>
                    <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1); }} className={INPUT_CLS} />
                </div>
                <button onClick={handleExport}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[10px] font-black text-slate-500 hover:text-slate-900 dark:hover:text-white uppercase tracking-widest transition-colors">
                    <Download size={12} /> Exportar
                </button>
            </div>

            {/* Filtros adicionales */}
            <div className="flex flex-wrap items-end gap-3 p-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-2xl">
                <div>
                    <label className={LABEL_CLS}>Tipo de cliente</label>
                    <select value={tipoFilter} onChange={e => { setTipoFilter(e.target.value as any); setPage(1); }} className={INPUT_CLS}>
                        <option value="ALL">Todos</option>
                        <option value="PARTICULAR">Particular</option>
                        <option value="EMPRESA">Empresa</option>
                    </select>
                </div>
                <div>
                    <label className={LABEL_CLS}>Gasto mín (Bs.)</label>
                    <input type="number" min="0" placeholder="0" value={minSpent}
                        onChange={e => { setMinSpent(e.target.value); setPage(1); }}
                        className={`w-24 ${INPUT_CLS}`} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Gasto máx (Bs.)</label>
                    <input type="number" min="0" placeholder="Sin límite" value={maxSpent}
                        onChange={e => { setMaxSpent(e.target.value); setPage(1); }}
                        className={`w-24 ${INPUT_CLS}`} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Ventas mínimas</label>
                    <input type="number" min="0" placeholder="0" value={minSales}
                        onChange={e => { setMinSales(e.target.value); setPage(1); }}
                        className={`w-20 ${INPUT_CLS}`} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Mostrar</label>
                    <select value={topN} onChange={e => { setTopN(Number(e.target.value)); setPage(1); }} className={INPUT_CLS}>
                        {TOP_N_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
                {hasActiveFilters && (
                    <button onClick={() => { setTipoFilter('ALL'); setMinSpent(''); setMaxSpent(''); setMinSales(''); setTopN(0); setPage(1); }}
                        className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest transition-colors hover:bg-rose-100">
                        Limpiar filtros
                    </button>
                )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Clientes activos',  value: kpis.totalClientes },
                    { label: 'Ingreso total',      value: `Bs. ${kpis.totalIngreso.toLocaleString('es-BO', { minimumFractionDigits: 2 })}` },
                    { label: 'Gasto promedio',     value: `Bs. ${kpis.avgGasto.toLocaleString('es-BO', { minimumFractionDigits: 2 })}` },
                    { label: 'Total transacciones', value: kpis.totalVentas },
                ].map((kpi, i) => (
                    <div key={i} className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{kpi.label}</div>
                        <div className="text-lg font-black text-slate-900 dark:text-white mt-1 tabular-nums">{kpi.value}</div>
                    </div>
                ))}
            </div>

            {/* Controles de tabla */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[10px] font-bold">
                        <option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="0">Todos</option>
                    </select>
                    <select value={orderBy} onChange={e => { setOrderBy(e.target.value as any); setPage(1); }}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[10px] font-bold">
                        <option value="total_desc">Mayor consumo</option>
                        <option value="total_asc">Menor consumo</option>
                        <option value="count_desc">Más ventas</option>
                        <option value="ticket_desc">Mayor ticket promedio</option>
                        <option value="max_desc">Mayor compra única</option>
                    </select>
                    <input type="search" placeholder="Buscar cliente..." value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[10px] font-bold w-48" />
                    <span className="text-[10px] text-slate-400 font-bold">
                        {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-black text-slate-500">
                    <button onClick={() => setPage(1)} disabled={page <= 1} className="px-2 py-1 rounded-lg border disabled:opacity-30">&laquo;</button>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-2 py-1 rounded-lg border disabled:opacity-30">&lsaquo;</button>
                    <span className="px-3">{page} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-2 py-1 rounded-lg border disabled:opacity-30">&rsaquo;</button>
                    <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="px-2 py-1 rounded-lg border disabled:opacity-30">&raquo;</button>
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
                                <th className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest w-12">#</th>
                                <th className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                                <th className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">NIT/CI</th>
                                <th className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ventas</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ticket prom.</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Mayor compra</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {pageRows.map((c, i) => {
                                const globalIdx = (page - 1) * (perPage || filtered.length) + i + 1;
                                return (
                                    <tr key={c.clientId} className="hover:bg-slate-50 dark:hover:bg-white/5">
                                        <td className="px-4 py-3">
                                            {globalIdx <= 3 ? (
                                                <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-[9px] font-black text-white ${
                                                    globalIdx === 1 ? 'bg-yellow-500' : globalIdx === 2 ? 'bg-slate-400' : 'bg-amber-700'
                                                }`}>{globalIdx}</span>
                                            ) : (
                                                <span className="text-[10px] font-mono text-slate-400 pl-2">{globalIdx}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-800 dark:text-white">{c.razonSocial}</td>
                                        <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{c.nit}</td>
                                        <td className="px-4 py-3">
                                            {c.tipo ? (
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                                    c.tipo === 'EMPRESA'
                                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                                                        : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                                                }`}>{c.tipo}</span>
                                            ) : (
                                                <span className="text-slate-300 dark:text-slate-600 text-[9px]">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{c.saleCount}</td>
                                        <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900 dark:text-white">Bs. {c.totalSpent.toLocaleString('es-BO', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">Bs. {c.avgTicket.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">Bs. {c.maxTicket.toFixed(2)}</td>
                                    </tr>
                                );
                            })}
                            {pageRows.length === 0 && (
                                <tr><td colSpan={8} className="text-center py-12 text-slate-400 font-bold text-xs">Sin datos para los filtros seleccionados</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
