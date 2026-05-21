'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    ClipboardList, Plus, Search, ArrowDownToLine, ArrowUpFromLine,
    Loader2, FileText, Send, PackageCheck, XCircle, AlertTriangle,
    CalendarClock, ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { PedidoService } from '@/services/PedidoService';
import { Pedido, PedidoStatus } from '@/types';
import ModuleHeader from '@/components/common/ModuleHeader';
import EmptyState from '@/components/common/EmptyState';
import PendingBanner from '@/components/common/PendingBanner';
import { useTransferNotifications } from '@/hooks/useTransferNotifications';
import { formatDate } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';
import { Timestamp } from 'firebase/firestore';

type Direction = 'EMITIDOS' | 'ENTRANTES';
type StatusFilter = 'TODOS' | PedidoStatus;

const STATUS_LABEL: Record<PedidoStatus, string> = {
    borrador: 'Borrador',
    vigente: 'Vigente',
    despachado: 'Despachado',
    cancelado: 'Cancelado',
};

const STATUS_STYLE: Record<PedidoStatus, string> = {
    borrador: 'bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300 border-slate-200 dark:border-white/10',
    vigente: 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 border-amber-200 dark:border-amber-500/20',
    despachado: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20',
    cancelado: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 border-rose-200 dark:border-rose-500/20',
};

const STATUS_ICON: Record<PedidoStatus, typeof FileText> = {
    borrador: FileText,
    vigente: Send,
    despachado: PackageCheck,
    cancelado: XCircle,
};

export default function PedidosListPage() {
    const router = useRouter();
    const { currentBranch, loading: branchLoading } = useBranch();
    const { user, loading: authLoading } = useAuth();

    const [direction, setDirection] = useState<Direction>('EMITIDOS');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODOS');
    const [search, setSearch] = useState('');
    const [pedidos, setPedidos] = useState<Pedido[]>([]);
    const [loading, setLoading] = useState(true);

    const branchId = currentBranch?.id || '';
    const transfers = useTransferNotifications(branchId);

    const load = useCallback(async () => {
        if (!branchId) return;
        setLoading(true);
        try {
            const status = statusFilter === 'TODOS' ? undefined : statusFilter;
            const list = await PedidoService.list(branchId, direction, status);
            setPedidos(list);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudieron cargar los pedidos');
        } finally {
            setLoading(false);
        }
    }, [branchId, direction, statusFilter]);

    useEffect(() => {
        if (branchLoading || authLoading || !user) return;
        load();
    }, [load, branchLoading, authLoading, user]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return pedidos;
        return pedidos.filter(p =>
            (p.codigo || '').toLowerCase().includes(q) ||
            (p.fromBranchName || '').toLowerCase().includes(q) ||
            (p.toBranchName || '').toLowerCase().includes(q) ||
            (p.notas || '').toLowerCase().includes(q)
        );
    }, [pedidos, search]);

    const counts = useMemo(() => {
        const c: Record<PedidoStatus, number> = { borrador: 0, vigente: 0, despachado: 0, cancelado: 0 };
        pedidos.forEach(p => { c[p.status] = (c[p.status] || 0) + 1; });
        return c;
    }, [pedidos]);

    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6 min-w-0 w-full max-w-full">
            <ModuleHeader
                title="Pedidos"
                subtitle={direction === 'EMITIDOS'
                    ? `Pedidos creados desde ${currentBranch?.name || 'mi sucursal'}`
                    : `Pedidos que llegan a ${currentBranch?.name || 'mi sucursal'}`}
                icon={ClipboardList}
                actions={[
                    {
                        label: 'Nuevo pedido',
                        icon: Plus,
                        variant: 'primary',
                        onClick: () => router.push('/pedidos/nuevo'),
                        dataTourId: 'pedidos-new-btn',
                    },
                ]}
            />

            <PendingBanner chips={[
                {
                    count: transfers.pedidos,
                    label: 'sin despachar',
                    icon: Send,
                    color: 'amber',
                    onClick: () => { setDirection('ENTRANTES'); setStatusFilter('vigente'); },
                },
                {
                    count: transfers.cancelaciones,
                    label: 'cancelaciones',
                    icon: AlertTriangle,
                    color: 'rose',
                    onClick: () => setDirection('ENTRANTES'),
                },
            ]} />

            {/* Tabs Emitidos / Entrantes */}
            <div data-tour="pedidos-tabs" className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 max-w-md">
                <button
                    onClick={() => setDirection('EMITIDOS')}
                    className={clsx(
                        'flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all',
                        direction === 'EMITIDOS'
                            ? 'bg-white dark:bg-background text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    )}
                >
                    <ArrowUpFromLine size={16} />
                    Emitidos
                </button>
                <button
                    onClick={() => setDirection('ENTRANTES')}
                    className={clsx(
                        'flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all',
                        direction === 'ENTRANTES'
                            ? 'bg-white dark:bg-background text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    )}
                >
                    <ArrowDownToLine size={16} />
                    Entrantes
                </button>
            </div>

            {/* Filtros: status chips + búsqueda */}
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                    {(['TODOS', 'borrador', 'vigente', 'despachado', 'cancelado'] as StatusFilter[]).map(s => {
                        const isActive = statusFilter === s;
                        const count = s === 'TODOS' ? pedidos.length : counts[s as PedidoStatus];
                        return (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={clsx(
                                    'flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border transition-all active:scale-95',
                                    isActive
                                        ? 'bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black border-slate-900 dark:border-[#FFD700] shadow-sm'
                                        : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-slate-400'
                                )}
                            >
                                {s === 'TODOS' ? 'Todos' : STATUS_LABEL[s as PedidoStatus]}
                                <span className={clsx(
                                    'px-1.5 py-0.5 rounded-xl text-[10px] font-black',
                                    isActive ? 'bg-white/20 dark:bg-black/20' : 'bg-slate-100 dark:bg-white/10'
                                )}>{count}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="relative w-full lg:w-72">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar código, sucursal, notas..."
                        className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-[#FFD700]"
                    />
                </div>
            </div>

            {/* Lista */}
            <div data-tour="pedidos-list" className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-slate-500 dark:text-slate-400">
                        <Loader2 size={24} className="animate-spin mr-2" />
                        Cargando pedidos...
                    </div>
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={ClipboardList}
                        title={search ? 'Sin resultados' : 'No hay pedidos'}
                        description={search
                            ? 'Ajusta tu búsqueda o filtros.'
                            : direction === 'EMITIDOS'
                                ? 'Crea tu primer pedido a otra sucursal.'
                                : 'Aún no llegan pedidos a esta sucursal.'}
                    />
                ) : (
                    <ul className="divide-y divide-slate-200 dark:divide-gray-800">
                        {filtered.map(p => {
                            const Icon = STATUS_ICON[p.status];
                            const fecha = (p.createdAt as Timestamp)?.toDate?.() || new Date();
                            const requerida = (p.fechaRequerida as Timestamp)?.toDate?.();
                            const cancelPending = !!p.cancellationRequestedAt && p.status !== 'cancelado';
                            return (
                                <li key={p.id}>
                                    <button
                                        onClick={() => router.push(`/pedidos/${p.codigo}`)}
                                        className="w-full px-4 sm:px-6 py-4 flex items-center gap-4 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                    >
                                        <div className={clsx(
                                            'w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center border shrink-0',
                                            STATUS_STYLE[p.status]
                                        )}>
                                            <Icon size={20} />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-black text-slate-900 dark:text-white text-sm sm:text-base tracking-tight">
                                                    {p.codigo}
                                                </span>
                                                <span className={clsx(
                                                    'px-2 py-0.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border',
                                                    STATUS_STYLE[p.status]
                                                )}>
                                                    {STATUS_LABEL[p.status]}
                                                </span>
                                                {cancelPending && (
                                                    <span className="px-2 py-0.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 border-amber-200 dark:border-amber-500/20 inline-flex items-center gap-1">
                                                        <AlertTriangle size={10} />
                                                        Cancelación pendiente
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
                                                <span className="font-semibold">{p.fromBranchName}</span>
                                                <span className="mx-1.5">→</span>
                                                <span className="font-semibold">{p.toBranchName}</span>
                                                <span className="mx-2">•</span>
                                                {p.itemCount || 0} ítems · {p.totalUnits || 0} u.
                                            </div>
                                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500">
                                                <span>Creado: {formatDate(fecha)}</span>
                                                {requerida && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <CalendarClock size={11} />
                                                        Requerido: {formatDate(requerida)}
                                                    </span>
                                                )}
                                                {p.createdByName && <span>Por: {formatUserName(p.createdByName)}</span>}
                                            </div>
                                        </div>

                                        <ChevronRight size={18} className="text-slate-300 dark:text-slate-600 shrink-0" />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
