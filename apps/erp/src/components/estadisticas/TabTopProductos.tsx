'use client';

import { useState, useEffect, useMemo } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { Sale } from '@/types';
import { toast } from 'sonner';

interface Props {
    branchId: string | undefined;
}

interface ProductRow {
    productId:   string;
    productName: string;
    productCode: string;
    quantity:    number;
    revenue:     number;
    ventas:      number;
    avgTicket:   number;
}

const QUICK_PRESETS = [
    { label: '7 días',   days: 7   },
    { label: '30 días',  days: 30  },
    { label: '3 meses',  days: 90  },
    { label: '1 año',    days: 365 },
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

export default function TabTopProductos({ branchId }: Props) {
    const [desde, setDesde] = useState(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10);
    });
    const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));

    // Filtros adicionales
    const [minQty,     setMinQty]     = useState('');
    const [minRevenue, setMinRevenue] = useState('');
    const [maxRevenue, setMaxRevenue] = useState('');
    const [minVentas,  setMinVentas]  = useState('');
    const [topN,       setTopN]       = useState(0);

    const [rows,    setRows]    = useState<ProductRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search,  setSearch]  = useState('');
    const [orderBy, setOrderBy] = useState<'qty_desc' | 'qty_asc' | 'rev_desc' | 'rev_asc' | 'ticket_desc' | 'ventas_desc'>('qty_desc');
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

                const map = new Map<string, ProductRow>();
                for (const docSnap of snap.docs) {
                    const sale = docSnap.data() as Sale;
                    if (sale.status !== 'COMPLETED') continue;
                    for (const it of sale.items || []) {
                        if (it.isVoided) continue;
                        const row = map.get(it.productId) || {
                            productId:   it.productId,
                            productName: it.productName || '-',
                            productCode: it.productCode || '-',
                            quantity: 0, revenue: 0, ventas: 0, avgTicket: 0,
                        };
                        row.quantity += it.quantity || 0;
                        row.revenue  += it.subtotal || 0;
                        row.ventas   += 1;
                        map.set(it.productId, row);
                    }
                }
                const result = Array.from(map.values()).map(r => ({
                    ...r,
                    avgTicket: r.ventas > 0 ? r.revenue / r.ventas : 0,
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
            if (search && !r.productName.toLowerCase().includes(search.toLowerCase()) &&
                          !r.productCode.toLowerCase().includes(search.toLowerCase())) return false;
            if (minQty     !== '' && r.quantity < Number(minQty))     return false;
            if (minRevenue !== '' && r.revenue  < Number(minRevenue)) return false;
            if (maxRevenue !== '' && r.revenue  > Number(maxRevenue)) return false;
            if (minVentas  !== '' && r.ventas   < Number(minVentas))  return false;
            return true;
        });
        list = [...list].sort((a, b) => {
            switch (orderBy) {
                case 'qty_asc':    return a.quantity  - b.quantity;
                case 'rev_desc':   return b.revenue   - a.revenue;
                case 'rev_asc':    return a.revenue   - b.revenue;
                case 'ticket_desc': return b.avgTicket - a.avgTicket;
                case 'ventas_desc': return b.ventas    - a.ventas;
                case 'qty_desc':
                default:           return b.quantity  - a.quantity;
            }
        });
        if (topN > 0) list = list.slice(0, topN);
        return list;
    }, [rows, search, orderBy, minQty, minRevenue, maxRevenue, minVentas, topN]);

    const totalPages = perPage === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / perPage));
    const pageRows   = perPage === 0 ? filtered : filtered.slice((page - 1) * perPage, page * perPage);

    // KPIs de resumen
    const kpis = useMemo(() => ({
        totalProductos:  filtered.length,
        totalUnidades:   filtered.reduce((s, r) => s + r.quantity, 0),
        totalIngreso:    filtered.reduce((s, r) => s + r.revenue,  0),
        totalTransacc:   filtered.reduce((s, r) => s + r.ventas,   0),
    }), [filtered]);

    const handleExport = () => {
        if (!filtered.length) return toast.error('Nada que exportar');
        const headers = ['#', 'Código', 'Producto', 'Cantidad', 'Ingreso', 'N° ventas', 'Ticket prom.'];
        const csv = '﻿' + [headers.join(';'), ...filtered.map((r, i) => [
            i + 1, r.productCode, r.productName.replace(/;/g, ','),
            r.quantity, r.revenue.toFixed(2), r.ventas, r.avgTicket.toFixed(2),
        ].join(';'))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `top_productos_${desde}_${hasta}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success('Exportado');
    };

    const hasActiveFilters = minQty !== '' || minRevenue !== '' || maxRevenue !== '' || minVentas !== '' || topN !== 0;

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
                    <label className={LABEL_CLS}>Cant. mínima vendida</label>
                    <input type="number" min="0" placeholder="0" value={minQty}
                        onChange={e => { setMinQty(e.target.value); setPage(1); }}
                        className={`w-24 ${INPUT_CLS}`} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Ingreso mín (Bs.)</label>
                    <input type="number" min="0" placeholder="0" value={minRevenue}
                        onChange={e => { setMinRevenue(e.target.value); setPage(1); }}
                        className={`w-24 ${INPUT_CLS}`} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Ingreso máx (Bs.)</label>
                    <input type="number" min="0" placeholder="Sin límite" value={maxRevenue}
                        onChange={e => { setMaxRevenue(e.target.value); setPage(1); }}
                        className={`w-24 ${INPUT_CLS}`} />
                </div>
                <div>
                    <label className={LABEL_CLS}>N° ventas mín</label>
                    <input type="number" min="0" placeholder="0" value={minVentas}
                        onChange={e => { setMinVentas(e.target.value); setPage(1); }}
                        className={`w-20 ${INPUT_CLS}`} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Mostrar</label>
                    <select value={topN} onChange={e => { setTopN(Number(e.target.value)); setPage(1); }} className={INPUT_CLS}>
                        {TOP_N_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
                {hasActiveFilters && (
                    <button onClick={() => { setMinQty(''); setMinRevenue(''); setMaxRevenue(''); setMinVentas(''); setTopN(0); setPage(1); }}
                        className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest transition-colors hover:bg-rose-100">
                        Limpiar filtros
                    </button>
                )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Productos distintos', value: kpis.totalProductos },
                    { label: 'Unidades vendidas',   value: kpis.totalUnidades },
                    { label: 'Ingreso total',        value: `Bs. ${kpis.totalIngreso.toLocaleString('es-BO', { minimumFractionDigits: 2 })}` },
                    { label: 'Transacciones',        value: kpis.totalTransacc },
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
                        <option value="qty_desc">Más vendidos (cant.)</option>
                        <option value="qty_asc">Menos vendidos (cant.)</option>
                        <option value="rev_desc">Mayor ingreso</option>
                        <option value="rev_asc">Menor ingreso</option>
                        <option value="ticket_desc">Mayor ticket promedio</option>
                        <option value="ventas_desc">Más transacciones</option>
                    </select>
                    <input type="search" placeholder="Buscar producto..." value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[10px] font-bold w-48" />
                    <span className="text-[10px] text-slate-400 font-bold">
                        {filtered.length} producto{filtered.length !== 1 ? 's' : ''}
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
                                <th className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest w-10">#</th>
                                <th className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Código</th>
                                <th className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Producto</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cant.</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ingreso</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ticket prom.</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">N° ventas</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {pageRows.map((r, i) => {
                                const globalIdx = (page - 1) * (perPage || filtered.length) + i + 1;
                                return (
                                    <tr key={r.productId} className="hover:bg-slate-50 dark:hover:bg-white/5">
                                        <td className="px-4 py-3 text-[10px] font-mono text-slate-400">{globalIdx}</td>
                                        <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{r.productCode}</td>
                                        <td className="px-4 py-3 font-bold text-slate-800 dark:text-white">{r.productName}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">{r.quantity}</td>
                                        <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900 dark:text-white">Bs. {r.revenue.toLocaleString('es-BO', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">Bs. {r.avgTicket.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">{r.ventas}</td>
                                    </tr>
                                );
                            })}
                            {pageRows.length === 0 && (
                                <tr><td colSpan={7} className="text-center py-12 text-slate-400 font-bold text-xs">Sin datos para los filtros seleccionados</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
