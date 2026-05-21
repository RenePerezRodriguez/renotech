'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Download, Loader2, Eye, X } from 'lucide-react';
import { RotationService, RotacionCompra, RotacionItem } from '@/services/RotationService';
import { toast } from 'sonner';

interface Props {
    branchId: string | undefined;
}

const SEMA_LABELS: Record<string, { text: string; cls: string }> = {
    verde:    { text: 'Alta',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
    amarillo: { text: 'Media', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
    rojo:     { text: 'Baja',  cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' },
};

type SemaforoFilter = 'ALL' | 'verde' | 'amarillo' | 'rojo';

const QUICK_PRESETS = [
    { label: '1 mes',   days: 30  },
    { label: '3 meses', days: 90  },
    { label: '6 meses', days: 180 },
    { label: '1 año',   days: 365 },
];

const INPUT_CLS = 'px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[11px] font-bold text-slate-700 dark:text-slate-200';
const LABEL_CLS = 'text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1';

export default function TabRotacionInventario({ branchId }: Props) {
    const today = new Date().toISOString().slice(0, 10);

    const [desde, setDesde] = useState(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10);
    });
    const [hasta,      setHasta]      = useState(today);
    const [fechaCorte, setFechaCorte] = useState(today);

    // Filtros locales
    const [semaforoFilter,  setSemaforoFilter]  = useState<SemaforoFilter>('ALL');
    const [proveedorFilter, setProveedorFilter] = useState('ALL');
    const [rotMin,  setRotMin]  = useState('');
    const [rotMax,  setRotMax]  = useState('');
    const [diasMin, setDiasMin] = useState('');
    const [diasMax, setDiasMax] = useState('');

    // Tabla
    const [page,    setPage]    = useState(1);
    const [perPage, setPerPage] = useState(25);
    const [orderBy, setOrderBy] = useState('rotacion_asc');

    // Data
    const [allCompras, setAllCompras] = useState<RotacionCompra[]>([]);
    const [loading,    setLoading]    = useState(false);

    // Modal
    const [detalleOpen,       setDetalleOpen]       = useState(false);
    const [detalleCompraLabel, setDetalleCompraLabel] = useState('');
    const [detalleItems,       setDetalleItems]       = useState<RotacionItem[]>([]);
    const [detalleLoading,     setDetalleLoading]     = useState(false);

    const applyPreset = (days: number) => {
        const end   = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);
        setDesde(start.toISOString().slice(0, 10));
        setHasta(end.toISOString().slice(0, 10));
        setPage(1);
    };

    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const r = await RotationService.report(
                branchId,
                new Date(desde      + 'T00:00:00-04:00'),
                new Date(hasta      + 'T23:59:59-04:00'),
                new Date(fechaCorte + 'T23:59:59-04:00'),
                1, 0, 'rotacion_asc',   // perPage=0 = todos; sort client-side
            );
            setAllCompras(r.compras);
            setPage(1);
        } catch (e: any) {
            toast.error('Error: ' + (e.message || ''));
        } finally {
            setLoading(false);
        }
    }, [branchId, desde, hasta, fechaCorte]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    const proveedoresUnicos = useMemo(() =>
        Array.from(new Set(allCompras.map(c => c.proveedor))).sort(),
    [allCompras]);

    const filteredCompras = useMemo(() => {
        let list = allCompras.filter(c => {
            if (semaforoFilter  !== 'ALL'  && c.semaforo  !== semaforoFilter)  return false;
            if (proveedorFilter !== 'ALL'  && c.proveedor !== proveedorFilter)  return false;
            if (rotMin  !== '' && c.rotacion         < Number(rotMin))  return false;
            if (rotMax  !== '' && c.rotacion         > Number(rotMax))  return false;
            if (diasMin !== '' && c.diasTranscurridos < Number(diasMin)) return false;
            if (diasMax !== '' && c.diasTranscurridos > Number(diasMax)) return false;
            return true;
        });
        list = [...list].sort((a, b) => {
            switch (orderBy) {
                case 'rotacion_desc':  return b.rotacion      - a.rotacion;
                case 'fecha_asc':      return a.fecha.localeCompare(b.fecha);
                case 'fecha_desc':     return b.fecha.localeCompare(a.fecha);
                case 'costo_desc':     return b.costoTotal    - a.costoTotal;
                case 'utilidad_desc':  return b.utilidad      - a.utilidad;
                case 'dias_desc':      return b.diasTranscurridos - a.diasTranscurridos;
                case 'dias_asc':       return a.diasTranscurridos - b.diasTranscurridos;
                case 'rotacion_asc':
                default:               return a.rotacion      - b.rotacion;
            }
        });
        return list;
    }, [allCompras, semaforoFilter, proveedorFilter, rotMin, rotMax, diasMin, diasMax, orderBy]);

    const resumen = useMemo(() => {
        const inversionTotal   = filteredCompras.reduce((s, c) => s + c.costoTotal, 0);
        const utilidadRealizada = filteredCompras.reduce((s, c) => s + c.utilidad,   0);
        const comprasEstancadas = filteredCompras.filter(c => c.rotacion < 30).length;
        const rotacionPromedio  = inversionTotal > 0
            ? filteredCompras.reduce((s, c) => s + c.rotacion * c.costoTotal, 0) / inversionTotal
            : 0;
        return {
            comprasAnalizadas:  filteredCompras.length,
            inversionTotal:     Math.round(inversionTotal   * 100) / 100,
            rotacionPromedio:   Math.round(rotacionPromedio * 100) / 100,
            utilidadRealizada:  Math.round(utilidadRealizada * 100) / 100,
            comprasEstancadas,
        };
    }, [filteredCompras]);

    const totalPages = perPage === 0 ? 1 : Math.max(1, Math.ceil(filteredCompras.length / perPage));
    const pageCompras = perPage === 0
        ? filteredCompras
        : filteredCompras.slice((page - 1) * perPage, page * perPage);

    const openDetalle = async (c: RotacionCompra) => {
        setDetalleCompraLabel(`${c.fecha} — ${c.proveedor}`);
        setDetalleOpen(true);
        setDetalleItems([]);
        setDetalleLoading(true);
        try {
            const { items } = await RotationService.detalle(c.compraId, new Date(fechaCorte + 'T23:59:59-04:00'));
            setDetalleItems(items);
        } catch (e: any) {
            toast.error('Error al cargar detalle: ' + (e.message || ''));
        } finally {
            setDetalleLoading(false);
        }
    };

    const handleExport = () => {
        if (!filteredCompras.length) return toast.error('Nada que exportar');
        const headers = ['Compra ID', 'Fecha', 'Sucursal', 'Proveedor', 'Items', 'Unid. compradas', 'Unid. vendidas', '% Rotación', 'Semáforo', 'Costo total', 'Costo vendido', 'Utilidad', 'Días'];
        const csv = '﻿' + [headers.join(';'), ...filteredCompras.map(r => [
            r.compraId, r.fecha, r.sucursal, r.proveedor, r.items,
            r.unidadesCompradas, r.unidadesVendidas, r.rotacion,
            SEMA_LABELS[r.semaforo]?.text || r.semaforo,
            r.costoTotal.toFixed(2), r.costoVendido.toFixed(2), r.utilidad.toFixed(2), r.diasTranscurridos,
        ].join(';'))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `rotacion_${desde}_${hasta}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success('Exportado');
    };

    const hasActiveFilters = semaforoFilter !== 'ALL' || proveedorFilter !== 'ALL' || rotMin !== '' || rotMax !== '' || diasMin !== '' || diasMax !== '';

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

            {/* Filtros — fechas */}
            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <label className={LABEL_CLS}>Desde (compra)</label>
                    <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1); }} className={INPUT_CLS} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Hasta (compra)</label>
                    <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1); }} className={INPUT_CLS} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Corte ventas</label>
                    <input type="date" value={fechaCorte} onChange={e => { setFechaCorte(e.target.value); setPage(1); }} className={INPUT_CLS} />
                </div>
                <button onClick={handleExport}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[10px] font-black text-slate-500 hover:text-slate-900 dark:hover:text-white uppercase tracking-widest transition-colors">
                    <Download size={12} /> Exportar
                </button>
            </div>

            {/* Filtros — semáforo, proveedor, rangos */}
            <div className="flex flex-wrap items-end gap-3 p-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-2xl">
                <div>
                    <label className={LABEL_CLS}>Semáforo</label>
                    <select value={semaforoFilter} onChange={e => { setSemaforoFilter(e.target.value as SemaforoFilter); setPage(1); }} className={INPUT_CLS}>
                        <option value="ALL">Todos</option>
                        <option value="verde">Alta (≥70%)</option>
                        <option value="amarillo">Media (30-69%)</option>
                        <option value="rojo">Baja (&lt;30%)</option>
                    </select>
                </div>
                <div>
                    <label className={LABEL_CLS}>Proveedor</label>
                    <select value={proveedorFilter} onChange={e => { setProveedorFilter(e.target.value); setPage(1); }} className={INPUT_CLS}>
                        <option value="ALL">Todos los proveedores</option>
                        {proveedoresUnicos.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div>
                    <label className={LABEL_CLS}>Rotación mín %</label>
                    <input type="number" min="0" max="100" placeholder="0" value={rotMin}
                        onChange={e => { setRotMin(e.target.value); setPage(1); }}
                        className={`w-20 ${INPUT_CLS}`} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Rotación máx %</label>
                    <input type="number" min="0" max="100" placeholder="100" value={rotMax}
                        onChange={e => { setRotMax(e.target.value); setPage(1); }}
                        className={`w-20 ${INPUT_CLS}`} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Días mín</label>
                    <input type="number" min="0" placeholder="0" value={diasMin}
                        onChange={e => { setDiasMin(e.target.value); setPage(1); }}
                        className={`w-20 ${INPUT_CLS}`} />
                </div>
                <div>
                    <label className={LABEL_CLS}>Días máx</label>
                    <input type="number" min="0" placeholder="∞" value={diasMax}
                        onChange={e => { setDiasMax(e.target.value); setPage(1); }}
                        className={`w-20 ${INPUT_CLS}`} />
                </div>
                {hasActiveFilters && (
                    <button onClick={() => { setSemaforoFilter('ALL'); setProveedorFilter('ALL'); setRotMin(''); setRotMax(''); setDiasMin(''); setDiasMax(''); setPage(1); }}
                        className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest transition-colors hover:bg-rose-100">
                        Limpiar filtros
                    </button>
                )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                    { label: 'Compras analizadas', value: resumen.comprasAnalizadas },
                    { label: 'Inversión total',    value: `Bs. ${resumen.inversionTotal.toLocaleString('es-BO', { minimumFractionDigits: 2 })}` },
                    { label: 'Rotación promedio',  value: `${resumen.rotacionPromedio}%` },
                    { label: 'Utilidad realizada', value: `Bs. ${resumen.utilidadRealizada.toLocaleString('es-BO', { minimumFractionDigits: 2 })}` },
                    { label: 'Estancadas (<30%)',  value: resumen.comprasEstancadas },
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
                    <select value={orderBy} onChange={e => { setOrderBy(e.target.value); setPage(1); }}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f1a] text-[10px] font-bold">
                        <option value="rotacion_asc">Menor rotación</option>
                        <option value="rotacion_desc">Mayor rotación</option>
                        <option value="fecha_asc">Fecha ↑</option>
                        <option value="fecha_desc">Fecha ↓</option>
                        <option value="costo_desc">Mayor costo</option>
                        <option value="utilidad_desc">Mayor utilidad</option>
                        <option value="dias_desc">Más antiguas</option>
                        <option value="dias_asc">Más recientes</option>
                    </select>
                    <span className="text-[10px] text-slate-400 font-bold">
                        {filteredCompras.length} compra{filteredCompras.length !== 1 ? 's' : ''}
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
                                <th className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">#</th>
                                <th className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                                <th className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Proveedor</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Compradas</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Vendidas</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">% Rotación</th>
                                <th className="text-center px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Semáforo</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Utilidad</th>
                                <th className="text-right px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Días</th>
                                <th className="text-center px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {pageCompras.map((c, i) => {
                                const globalIdx = (page - 1) * (perPage || filteredCompras.length) + i + 1;
                                return (
                                    <tr key={c.compraId} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                        <td className="px-4 py-3 font-mono text-[10px] text-slate-400">{globalIdx}</td>
                                        <td className="px-4 py-3 font-bold text-slate-800 dark:text-white whitespace-nowrap">{c.fecha}</td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.proveedor}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{c.unidadesCompradas}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{c.unidadesVendidas}</td>
                                        <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900 dark:text-white">{c.rotacion}%</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${SEMA_LABELS[c.semaforo]?.cls || ''}`}>
                                                {SEMA_LABELS[c.semaforo]?.text}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">Bs. {c.utilidad.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">{c.diasTranscurridos}d</td>
                                        <td className="px-4 py-3 text-center">
                                            <button onClick={() => openDetalle(c)}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/5 text-[9px] font-black text-slate-500 hover:text-slate-900 dark:hover:text-white uppercase tracking-widest transition-colors">
                                                <Eye size={11} /> Ítems
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {pageCompras.length === 0 && !loading && (
                                <tr><td colSpan={10} className="text-center py-12 text-slate-400 font-bold text-xs">Sin compras para los filtros seleccionados</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modal detalle */}
            {detalleOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setDetalleOpen(false)}>
                    <div className="bg-white dark:bg-[#111827] rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto m-4" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-white dark:bg-[#111827] border-b border-slate-200 dark:border-white/10 px-6 py-4 flex items-center justify-between rounded-t-3xl">
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Detalle {detalleCompraLabel}</h3>
                            <button onClick={() => setDetalleOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6">
                            {detalleLoading ? (
                                <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
                            ) : (
                                <table className="w-full text-[11px]">
                                    <thead className="bg-slate-50 dark:bg-black/40">
                                        <tr>
                                            <th className="text-left px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Código</th>
                                            <th className="text-left px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Descripción</th>
                                            <th className="text-left px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Marca</th>
                                            <th className="text-right px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Comprado</th>
                                            <th className="text-right px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Vendido</th>
                                            <th className="text-right px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">%</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                        {detalleItems.map(it => (
                                            <tr key={it.productId} className="hover:bg-slate-50 dark:hover:bg-white/5">
                                                <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{it.codigo}</td>
                                                <td className="px-3 py-2 text-slate-800 dark:text-white truncate max-w-50">{it.descripcion}</td>
                                                <td className="px-3 py-2 text-slate-500">{it.marca}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{it.cantidad}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{it.vendidos}</td>
                                                <td className="px-3 py-2 text-right tabular-nums font-bold">{it.rotacion}%</td>
                                            </tr>
                                        ))}
                                        {detalleItems.length === 0 && (
                                            <tr><td colSpan={6} className="text-center py-8 text-slate-400 font-bold text-xs">Sin detalle</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
