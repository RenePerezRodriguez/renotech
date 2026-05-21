'use client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Truck, Search, ArrowDownToLine, ArrowUpFromLine,
    Loader2, Package, Send, PackageCheck, AlertTriangle, ChevronRight, Calendar, Ban, Zap, Wallet, Clock, Users, WifiOff,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { EnvioService } from '@/services/EnvioService';
import { Envio, EnvioStatus } from '@/types';
import ModuleHeader from '@/components/common/ModuleHeader';
import EmptyState from '@/components/common/EmptyState';
import PendingBanner from '@/components/common/PendingBanner';
import { useTransferNotifications } from '@/hooks/useTransferNotifications';
import { formatDate } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';
import { Timestamp } from 'firebase/firestore';

type Direction = 'SALIENTES' | 'ENTRANTES';
type StatusFilter = 'TODOS' | EnvioStatus;

const STATUS_LABEL: Record<EnvioStatus, string> = {
    preparacion: 'En preparación',
    en_transito: 'En tránsito',
    recibido: 'Recibido',
    cancelado_devolucion: 'Cancelado (devolución)',
    cancelado_perdida: 'Cancelado (pérdida)',
};

const STATUS_STYLE: Record<EnvioStatus, string> = {
    preparacion: 'bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300 border-slate-200 dark:border-white/10',
    en_transito: 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 border-amber-200 dark:border-amber-500/20',
    recibido: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20',
    cancelado_devolucion: 'bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300 border-rose-200 dark:border-rose-500/20',
    cancelado_perdida: 'bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300 border-rose-200 dark:border-rose-500/20',
};

const STATUS_ICON: Record<EnvioStatus, typeof Package> = {
    preparacion: Package,
    en_transito: Send,
    recibido: PackageCheck,
    cancelado_devolucion: Ban,
    cancelado_perdida: Ban,
};

export default function EnviosListPage() {
    const { isOnline } = useNetworkStatus();
    const router = useRouter();
    const { currentBranch, loading: branchLoading } = useBranch();
    const { user, loading: authLoading } = useAuth();

    const [direction, setDirection] = useState<Direction>('SALIENTES');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODOS');
    const [search, setSearch] = useState('');
    const [envios, setEnvios] = useState<Envio[]>([]);
    const [loading, setLoading] = useState(true);

    const branchId = currentBranch?.id || '';
    const transfers = useTransferNotifications(branchId);

    const load = useCallback(async () => {
        if (!branchId) return;
        setLoading(true);
        try {
            const status = statusFilter === 'TODOS' ? undefined : statusFilter;
            const list = await EnvioService.list(branchId, direction, status);
            setEnvios(list);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudieron cargar los envíos');
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
        if (!q) return envios;
        return envios.filter(e =>
            (e.codigo || '').toLowerCase().includes(q) ||
            (e.pedidoId || '').toLowerCase().includes(q) ||
            (e.fromBranchName || '').toLowerCase().includes(q) ||
            (e.toBranchName || '').toLowerCase().includes(q) ||
            (e.clientName || '').toLowerCase().includes(q) ||
            (e.notas || '').toLowerCase().includes(q)
        );
    }, [envios, search]);

    const counts = useMemo(() => {
        const c: Record<EnvioStatus, number> = { preparacion: 0, en_transito: 0, recibido: 0, cancelado_devolucion: 0, cancelado_perdida: 0 };
        envios.forEach(e => { c[e.status] = (c[e.status] || 0) + 1; });
        return c;
    }, [envios]);

    // Offline: mostrar lista en cache, bloquear solo acciones de escritura

    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6 min-w-0 w-full max-w-full">
            {!isOnline && (
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-[11px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    <WifiOff size={14} />
                    Modo offline — mostrando datos en caché · No es posible crear ni modificar envíos sin conexión
                </div>
            )}
            <ModuleHeader
                title="Envíos"
                subtitle={direction === 'SALIENTES'
                    ? `Despachos que salen de ${currentBranch?.name || 'mi sucursal'}`
                    : `Envíos que llegan a ${currentBranch?.name || 'mi sucursal'}`}
                icon={Truck}
                actions={[
                    {
                        label: 'Envío directo',
                        icon: Zap,
                        onClick: isOnline
                            ? () => router.push('/envios/nuevo')
                            : () => toast.warning('Sin conexión — no se pueden crear envíos offline'),
                        variant: 'primary',
                        dataTourId: 'envios-new-btn',
                        disabled: !isOnline,
                    },
                    {
                        label: 'Fletes',
                        icon: Truck,
                        onClick: () => router.push('/envios/fletes'),
                        variant: 'secondary',
                    },
                ]}
            />

            <PendingBanner chips={[
                {
                    count: transfers.envios,
                    label: 'en tránsito',
                    icon: Truck,
                    color: 'amber',
                    onClick: () => { setDirection('ENTRANTES'); setStatusFilter('en_transito'); },
                },
                {
                    count: transfers.cancelaciones,
                    label: 'cancelaciones',
                    icon: AlertTriangle,
                    color: 'rose',
                    onClick: () => setDirection('ENTRANTES'),
                },
            ]} />

            {/* Tabs Salientes / Entrantes */}
            <div data-tour="envios-tabs" className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 max-w-md">
                <button
                    onClick={() => setDirection('SALIENTES')}
                    className={clsx(
                        'flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all',
                        direction === 'SALIENTES'
                            ? 'bg-white dark:bg-background text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    )}
                >
                    <ArrowUpFromLine size={16} />
                    Salientes
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

            {/* Filtros: chips + búsqueda */}
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                    {(['TODOS', 'preparacion', 'en_transito', 'recibido'] as StatusFilter[]).map(s => {
                        const isActive = statusFilter === s;
                        const count = s === 'TODOS' ? envios.length : counts[s as EnvioStatus];
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
                                {s === 'TODOS' ? 'Todos' : STATUS_LABEL[s as EnvioStatus]}
                                <span className={clsx(
                                    'px-1.5 py-0.5 rounded-xl text-[10px] font-black',
                                    isActive ? 'bg-white/20 dark:bg-black/20' : 'bg-slate-100 dark:bg-white/10'
                                )}>{count}</span>
                            </button>
                        );
                    })}
                </div>

                <div data-tour="envios-search" className="relative w-full lg:w-72">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar código, pedido, sucursal..."
                        className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-[#FFD700]"
                    />
                </div>
            </div>

            <div data-tour="envios-list" className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-slate-500 dark:text-slate-400">
                        <Loader2 size={24} className="animate-spin mr-2" />
                        Cargando envíos...
                    </div>
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={Truck}
                        title={search ? 'Sin resultados' : 'No hay envíos'}
                        description={search
                            ? 'Ajusta tu búsqueda o filtros.'
                            : direction === 'SALIENTES'
                                ? 'Crea un envío desde un pedido vigente entrante.'
                                : 'Aún no llegan envíos a esta sucursal.'}
                    />
                ) : (
                    <ul className="divide-y divide-slate-200 dark:divide-gray-800">
                        {filtered.map(e => {
                            const Icon = STATUS_ICON[e.status];
                            const fecha = (e.createdAt as Timestamp)?.toDate?.() || new Date();
                            return (
                                <li key={e.id}>
                                    <button
                                        onClick={() => router.push(`/envios/${e.codigo}`)}
                                        className="w-full px-4 sm:px-6 py-4 flex items-center gap-4 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                    >
                                        <div className={clsx(
                                            'w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center border shrink-0',
                                            STATUS_STYLE[e.status]
                                        )}>
                                            <Icon size={20} />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-black text-slate-900 dark:text-white text-sm sm:text-base tracking-tight">
                                                    {e.codigo}
                                                </span>
                                                <span className={clsx(
                                                    'px-2 py-0.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border',
                                                    STATUS_STYLE[e.status]
                                                )}>
                                                    {STATUS_LABEL[e.status]}
                                                </span>
                                                {e.hasDiscrepancy && (
                                                    <span className={clsx(
                                                        "px-2 py-0.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border inline-flex items-center gap-1",
                                                        e.discrepancyStatus === 'approved'
                                                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20"
                                                            : e.discrepancyStatus === 'rejected'
                                                            ? "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300 border-slate-200 dark:border-white/10"
                                                            : "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 border-rose-200 dark:border-rose-500/20"
                                                    )}>
                                                        <AlertTriangle size={10} />
                                                        {e.discrepancyStatus === 'approved' ? 'Discrep. aprobada'
                                                            : e.discrepancyStatus === 'rejected' ? 'Discrep. rechazada'
                                                            : 'Discrepancia'}
                                                    </span>
                                                )}
                                                {e.editedInTransit && (
                                                    <span className="px-2 py-0.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border bg-amber-50 text-amber-700 dark:bg-amber-500/5 dark:text-amber-400 border-amber-200 dark:border-amber-500/20">
                                                        Editado en tránsito
                                                    </span>
                                                )}
                                                {e.lastHeaderEditAt && (
                                                    <span className="px-2 py-0.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border bg-blue-50 text-blue-700 dark:bg-blue-500/5 dark:text-blue-400 border-blue-200 dark:border-blue-500/20">
                                                        Cabecera editada
                                                    </span>
                                                )}
                                                {e.transportPaymentType === 'PAGADO' && (e.transportCost || 0) > 0 && (
                                                    <span className="px-2 py-0.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border bg-emerald-50 text-emerald-700 dark:bg-emerald-500/5 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20 inline-flex items-center gap-1">
                                                        <Wallet size={10} />
                                                        Flete Bs. {(e.transportCost || 0).toFixed(0)} {e.transportMethod ? `· ${e.transportMethod}` : ''}
                                                    </span>
                                                )}
                                                {e.transportPaymentType === 'POR_PAGAR' && (e.transportCost || 0) > 0 && (
                                                    <span className="px-2 py-0.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border bg-amber-50 text-amber-700 dark:bg-amber-500/5 dark:text-amber-400 border-amber-200 dark:border-amber-500/20 inline-flex items-center gap-1">
                                                        <Clock size={10} />
                                                        Flete por pagar Bs. {(e.transportCost || 0).toFixed(0)} {e.transportMethod ? `· ${e.transportMethod}` : ''}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
                                                <span className="font-semibold">{e.fromBranchName}</span>
                                                <span className="mx-1.5">→</span>
                                                {e.clientName ? (
                                                    <span className="inline-flex items-center gap-1 font-semibold text-violet-600 dark:text-violet-400">
                                                        <Users size={11} /> {e.clientName}
                                                    </span>
                                                ) : (
                                                    <span className="font-semibold">{e.toBranchName}</span>
                                                )}
                                                <span className="mx-2">•</span>
                                                {e.itemCount || 0} ítems · {e.totalUnitsEnviadas || 0} u.
                                            </div>
                                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500">
                                                <span className="inline-flex items-center gap-1">
                                                    <Calendar size={11} />
                                                    {formatDate(fecha)}
                                                </span>
                                                {e.pedidoId && <span>Pedido: {e.pedidoId}</span>}
                                                {e.createdByName && <span>Por: {formatUserName(e.createdByName)}</span>}
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
