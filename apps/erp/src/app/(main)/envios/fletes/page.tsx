'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Truck, Search, Loader2, Calendar, Wallet, ArrowLeft, Eye, RotateCcw,
    Clock, AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { collection, query, where, orderBy, getDocs, limit as fbLimit, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { ExpenseService } from '@/services/ExpenseService';
import type { OperationalExpense, Envio } from '@/types';
import ModuleHeader from '@/components/common/ModuleHeader';
import EmptyState from '@/components/common/EmptyState';
import { formatDate } from '@/utils/dateHelpers';

const METHOD_STYLE: Record<string, string> = {
    EFECTIVO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20',
    QR: 'bg-violet-100 text-violet-800 dark:bg-violet-500/10 dark:text-violet-300 border-violet-200 dark:border-violet-500/20',
    TRANSFERENCIA: 'bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-300 border-blue-200 dark:border-blue-500/20',
};

const METHOD_LABEL: Record<string, string> = {
    EFECTIVO: 'Efectivo',
    QR: 'QR',
    TRANSFERENCIA: 'Transferencia',
};

type Tab = 'PAGADOS' | 'POR_PAGAR';

interface PorPagarItem {
    id: string;
    codigo: string;
    fecha: Date;
    transportMethod: string;
    transportCost: number;
    fromBranchName: string;
    toBranchName: string;
    clientName?: string;
}

export default function FletesListPage() {
    const router = useRouter();
    const { currentBranch, loading: branchLoading } = useBranch();
    const { user, loading: authLoading } = useAuth();

    const [tab, setTab] = useState<Tab>('PAGADOS');
    const [pagados, setPagados] = useState<OperationalExpense[]>([]);
    const [porPagar, setPorPagar] = useState<PorPagarItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [methodFilter, setMethodFilter] = useState<'TODOS' | 'EFECTIVO' | 'QR' | 'TRANSFERENCIA'>('TODOS');

    const branchId = currentBranch?.id || '';

    const load = useCallback(async () => {
        if (!branchId) return;
        setLoading(true);
        try {
            // ── Pagados: gastos TRANSPORTE ya registrados ──
            const all = await ExpenseService.getByBranch(branchId, undefined, undefined, 500);
            setPagados(all.filter(e => e.category === 'TRANSPORTE'));

            // ── Por Pagar: envíos con transportPaymentType=POR_PAGAR donde esta sucursal
            //    es la que debe pagar (transportPaymentTarget == branchId) ──
            const envQ = query(
                collection(db, 'envios'),
                where('transportPaymentType', '==', 'POR_PAGAR'),
                where('transportPaymentTarget', '==', branchId),
                orderBy('createdAt', 'desc'),
                fbLimit(100),
            );
            const envSnap = await getDocs(envQ);
            const pend: PorPagarItem[] = [];
            envSnap.forEach(d => {
                const e = d.data() as Envio;
                const ts = e.createdAt as Timestamp | undefined;
                pend.push({
                    id: e.id || d.id,
                    codigo: e.codigo,
                    fecha: ts?.toDate() || new Date(),
                    transportMethod: e.transportMethod || 'No especificado',
                    transportCost: e.transportCost || 0,
                    fromBranchName: e.fromBranchName,
                    toBranchName: e.toBranchName || '',
                    clientName: e.clientName,
                });
            });
            setPorPagar(pend);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudieron cargar los fletes');
        } finally {
            setLoading(false);
        }
    }, [branchId]);

    useEffect(() => {
        if (branchLoading || authLoading || !user) return;
        load();
    }, [load, branchLoading, authLoading, user]);

    // ── Filtros PAGADOS ──
    const filteredPagados = useMemo(() => {
        const q = search.trim().toLowerCase();
        return pagados.filter(it => {
            if (methodFilter !== 'TODOS' && it.paymentMethod !== methodFilter) return false;
            if (!q) return true;
            return (
                (it.description || '').toLowerCase().includes(q) ||
                (it.supplierName || '').toLowerCase().includes(q) ||
                (it.bankRef || '').toLowerCase().includes(q)
            );
        });
    }, [pagados, search, methodFilter]);

    const totals = useMemo(() => {
        const t = { count: filteredPagados.length, total: 0, EFECTIVO: 0, QR: 0, TRANSFERENCIA: 0 };
        filteredPagados.forEach(it => {
            t.total += it.amount || 0;
            const m = it.paymentMethod || '';
            if (m === 'EFECTIVO' || m === 'QR' || m === 'TRANSFERENCIA') {
                t[m] += it.amount || 0;
            }
        });
        return t;
    }, [filteredPagados]);

    // ── Filtros POR PAGAR ──
    const filteredPorPagar = useMemo(() => {
        const q = search.trim().toLowerCase();
        return porPagar.filter(it => {
            if (!q) return true;
            return (
                it.codigo.toLowerCase().includes(q) ||
                it.transportMethod.toLowerCase().includes(q) ||
                it.fromBranchName.toLowerCase().includes(q)
            );
        });
    }, [porPagar, search]);

    const totalPorPagar = useMemo(() => {
        return filteredPorPagar.reduce((s, it) => s + it.transportCost, 0);
    }, [filteredPorPagar]);

    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6 min-w-0 w-full max-w-full">
            <ModuleHeader
                title="Fletes"
                subtitle={currentBranch?.name || 'mi sucursal'}
                icon={Truck}
                onBack={() => router.push('/envios')}
                actions={[
                    {
                        label: 'Recargar',
                        icon: RotateCcw,
                        onClick: () => load(),
                        variant: 'secondary',
                    },
                ]}
            />

            {/* Tabs */}
            <div className="flex p-1.5 bg-slate-100 dark:bg-[#111827] rounded-2xl w-fit border border-slate-200 dark:border-white/10">
                <button
                    onClick={() => setTab('PAGADOS')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${tab === 'PAGADOS' ? 'bg-green-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                ><Wallet size={12} /> Pagados</button>
                <button
                    onClick={() => setTab('POR_PAGAR')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${tab === 'POR_PAGAR' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                ><Clock size={12} /> Por Pagar</button>
            </div>

            {/* ── TAB: PAGADOS ── */}
            {tab === 'PAGADOS' && (
                <>
                    {/* Resumen */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <SummaryCard label="Total" value={`Bs. ${totals.total.toFixed(2)}`} sub={`${totals.count} fletes`} />
                        <SummaryCard label="Efectivo" value={`Bs. ${totals.EFECTIVO.toFixed(2)}`} accent="emerald" />
                        <SummaryCard label="QR" value={`Bs. ${totals.QR.toFixed(2)}`} accent="violet" />
                        <SummaryCard label="Transferencia" value={`Bs. ${totals.TRANSFERENCIA.toFixed(2)}`} accent="blue" />
                    </div>

                    {/* Filtros */}
                    <div className="flex flex-wrap gap-3 items-center">
                        <div className="relative flex-1 min-w-50">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar por envío, transportista o referencia..."
                                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background focus:outline-none focus:ring-2 focus:ring-slate-400"
                            />
                        </div>
                        <select
                            value={methodFilter}
                            onChange={e => setMethodFilter(e.target.value as typeof methodFilter)}
                            className="px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background focus:outline-none focus:ring-2 focus:ring-slate-400"
                        >
                            <option value="TODOS">Todos los métodos</option>
                            <option value="EFECTIVO">Efectivo</option>
                            <option value="QR">QR</option>
                            <option value="TRANSFERENCIA">Transferencia</option>
                        </select>
                    </div>

                    {/* Lista PAGADOS */}
                    {loading ? (
                        <div className="flex items-center justify-center h-48 text-slate-500 dark:text-slate-400">
                            <Loader2 size={20} className="animate-spin mr-2" /> Cargando fletes...
                        </div>
                    ) : filteredPagados.length === 0 ? (
                        <EmptyState
                            icon={Truck}
                            title="Sin fletes registrados"
                            description="Cuando registres un envío con flete pagado, aparecerá aquí."
                        />
                    ) : (
                        <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-white/5 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    <tr>
                                        <th className="text-left px-4 py-3 font-bold">Fecha</th>
                                        <th className="text-left px-4 py-3 font-bold">Envío / Descripción</th>
                                        <th className="text-left px-4 py-3 font-bold">Transportista</th>
                                        <th className="text-left px-4 py-3 font-bold">Pago</th>
                                        <th className="text-right px-4 py-3 font-bold">Monto</th>
                                        <th className="px-4 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                                    {filteredPagados.map(it => {
                                        const date = it.date instanceof Date ? it.date : null;
                                        const envioMatch = (it.description || '').match(/ENV-?\d+|ENVD-?\d+/i);
                                        const envioCodigo = envioMatch ? envioMatch[0] : null;
                                        return (
                                            <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                                    <div className="inline-flex items-center gap-1.5 text-xs">
                                                        <Calendar size={12} className="text-slate-400" />
                                                        {date ? formatDate(date) : '—'}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-900 dark:text-white">
                                                    <div className="font-semibold">{it.description || '—'}</div>
                                                    {it.bankRef && (
                                                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Ref: {it.bankRef}</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{it.supplierName || '—'}</td>
                                                <td className="px-4 py-3">
                                                    <span className={clsx(
                                                        'inline-flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-bold border',
                                                        METHOD_STYLE[it.paymentMethod || ''] || 'bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300 border-slate-200 dark:border-white/10'
                                                    )}>
                                                        <Wallet size={10} />
                                                        {METHOD_LABEL[it.paymentMethod || ''] || it.paymentMethod || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                                                    Bs. {(it.amount || 0).toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {envioCodigo && (
                                                        <button
                                                            onClick={() => router.push(`/envios/${envioCodigo}`)}
                                                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                                                        ><Eye size={12} /> Ver envío</button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* ── TAB: POR PAGAR ── */}
            {tab === 'POR_PAGAR' && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <SummaryCard label="Total por pagar" value={`Bs. ${totalPorPagar.toFixed(2)}`} sub={`${filteredPorPagar.length} pendientes`} accent="amber" />
                    </div>

                    <div className="flex gap-3 items-center">
                        <div className="relative flex-1 min-w-50">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar por código de envío, transportista o sucursal..."
                                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background focus:outline-none focus:ring-2 focus:ring-slate-400"
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center h-48 text-slate-500 dark:text-slate-400">
                            <Loader2 size={20} className="animate-spin mr-2" /> Cargando fletes por pagar...
                        </div>
                    ) : filteredPorPagar.length === 0 ? (
                        <EmptyState
                            icon={Clock}
                            title="Sin fletes por pagar"
                            description="No hay envíos con flete pendiente de pago a cargo de esta sucursal."
                        />
                    ) : (
                        <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-white/5 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    <tr>
                                        <th className="text-left px-4 py-3 font-bold">Fecha</th>
                                        <th className="text-left px-4 py-3 font-bold">Envío</th>
                                        <th className="text-left px-4 py-3 font-bold">Origen</th>
                                        <th className="text-left px-4 py-3 font-bold">Transporte</th>
                                        <th className="text-right px-4 py-3 font-bold">Monto</th>
                                        <th className="px-4 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                                    {filteredPorPagar.map(it => (
                                        <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                                <div className="inline-flex items-center gap-1.5 text-xs">
                                                    <Calendar size={12} className="text-slate-400" />
                                                    {formatDate(it.fecha)}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="font-bold text-slate-900 dark:text-white">{it.codigo}</span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-xs">
                                                {it.fromBranchName} → {it.clientName || it.toBranchName}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20">
                                                    <AlertCircle size={10} />
                                                    {it.transportMethod}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                                                Bs. {it.transportCost.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => router.push(`/envios/${it.codigo}`)}
                                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                                                ><Eye size={12} /> Ver envío</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'emerald' | 'violet' | 'blue' | 'amber' }) {
    const accentClass = accent === 'emerald'
        ? 'border-emerald-200 dark:border-emerald-500/20'
        : accent === 'violet'
            ? 'border-violet-200 dark:border-violet-500/20'
            : accent === 'blue'
                ? 'border-blue-200 dark:border-blue-500/20'
                : accent === 'amber'
                    ? 'border-amber-200 dark:border-amber-500/20'
                    : 'border-slate-200 dark:border-white/10';
    return (
        <div className={clsx('bg-white dark:bg-background border rounded-2xl p-4', accentClass)}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{value}</div>
            {sub && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{sub}</div>}
        </div>
    );
}
