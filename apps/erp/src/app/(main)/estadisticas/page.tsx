'use client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineModuleGuard } from '@/components/common/OfflineModuleGuard';

import { useState, useEffect } from 'react';
import {
    BarChart3, Users, RefreshCw, LineChart, Trophy, Sparkles, Building2, ChevronDown,
} from 'lucide-react';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { BranchService } from '@/services/BranchService';
import { Branch } from '@/types';
import ModuleHeader from '@/components/common/ModuleHeader';
import TabRotacionInventario from '@/components/estadisticas/TabRotacionInventario';
import TabVentasPeriodo from '@/components/estadisticas/TabVentasPeriodo';
import TabTopProductos from '@/components/estadisticas/TabTopProductos';
import TabTopClientes from '@/components/estadisticas/TabTopClientes';
import TabAsistenteIA from '@/components/estadisticas/TabAsistenteIA';

type TabName = 'asistente' | 'rotacion' | 'ventas' | 'topprod' | 'topclient';

const TABS: { key: TabName; label: string; icon: any; highlight?: boolean }[] = [
    { key: 'asistente', label: 'Asistente IA',         icon: Sparkles,  highlight: true },
    { key: 'rotacion',  label: 'Rotacion Inventario',  icon: RefreshCw  },
    { key: 'ventas',    label: 'Ventas por Periodo',    icon: LineChart  },
    { key: 'topprod',   label: 'Top Productos',         icon: Trophy     },
    { key: 'topclient', label: 'Top Clientes',          icon: Users      },
];

export default function StatisticsPage() {
    const { isOnline } = useNetworkStatus();
    const { currentBranch, isConsolidatedView } = useBranch();
    const { role } = useAuth();

    const [activeTab, setActiveTab] = useState<TabName>('asistente');
    const [mounted, setMounted] = useState<Set<TabName>>(new Set(['asistente']));

    // Filtro local de sucursal (independiente del selector global)
    const [branches, setBranches] = useState<Branch[]>([]);
    // 'global' = usa la selección global del header | 'all' = consolidado | branchId = sucursal específica
    const [localBranch, setLocalBranch] = useState<'global' | 'all' | string>('global');

    // Sólo GERENTE y ENCARGADO pueden ver todas las sucursales
    const canSeeAllBranches = role === 'GERENTE' || role === 'ENCARGADO';

    useEffect(() => {
        if (!canSeeAllBranches) return;
        BranchService.getActive().then(setBranches).catch(() => {});
    }, [canSeeAllBranches]);

    // branchId efectivo que se pasa a todos los tabs
    const effectiveBranchId: string | undefined =
        localBranch === 'global' ? (isConsolidatedView ? undefined : currentBranch?.id)
        : localBranch === 'all'  ? undefined
        : localBranch;

    const branchLabel =
        localBranch === 'global'  ? (isConsolidatedView ? 'VISTA GLOBAL' : `SUCURSAL: ${currentBranch?.name}`)
        : localBranch === 'all'   ? 'TODAS LAS SUCURSALES'
        : branches.find(b => b.id === localBranch)?.name?.toUpperCase() ?? 'SUCURSAL';

    const activateTab = (key: TabName) => {
        setActiveTab(key);
        setMounted(prev => {
            if (prev.has(key)) return prev;
            const next = new Set(prev);
            next.add(key);
            return next;
        });
    };

    if (!isOnline) return <OfflineModuleGuard moduleName="Estadísticas"><span/></OfflineModuleGuard>;

    return (
        <div className="flex-1 min-w-0 w-full max-w-full p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 lg:space-y-8 bg-slate-50 dark:bg-[#020617] pb-20">
            <ModuleHeader
                title="Inteligencia de Negocio"
                subtitle="Reportes, analisis y asistente IA"
                icon={BarChart3}
                badge={branchLabel}
            />

            {/* Tabs + selector de sucursal en la misma fila */}
            <div data-tour="estadisticas-tabs" className="flex flex-wrap items-center gap-2">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => activateTab(t.key)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            activeTab === t.key
                                ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                                : t.highlight
                                    ? 'bg-white dark:bg-[#111827] border border-yellow-300 dark:border-yellow-500/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-500/10'
                                    : 'bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                        }`}
                    >
                        <t.icon size={14} strokeWidth={2.5} />
                        {t.label}
                    </button>
                ))}

                {/* Selector de sucursal — solo para roles con acceso multi-sucursal */}
                {canSeeAllBranches && branches.length > 0 && (
                    <div data-tour="estadisticas-branch" className="relative ml-auto">
                        <Building2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <select
                            value={localBranch}
                            onChange={e => setLocalBranch(e.target.value)}
                            className="pl-8 pr-7 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827] text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 appearance-none cursor-pointer hover:border-yellow-400 transition-colors focus:outline-none focus:border-yellow-400"
                        >
                            <option value="global">Usar seleccion global</option>
                            <option value="all">Todas las sucursales</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id!}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/*
              Lazy mount + keep alive:
              - Cada tab se monta la primera vez que se activa
              - Se oculta con CSS (no se desmonta) → preserva estado y evita refetch
              - Al cambiar la sucursal los tabs siguen montados; reciben el nuevo branchId
                y sus propios useEffect/useCallback recargan los datos
            */}
            {mounted.has('asistente') && (
                <div className={activeTab === 'asistente' ? '' : 'hidden'}>
                    <TabAsistenteIA branchId={effectiveBranchId} />
                </div>
            )}
            {mounted.has('rotacion') && (
                <div className={activeTab === 'rotacion' ? '' : 'hidden'}>
                    <TabRotacionInventario branchId={effectiveBranchId} />
                </div>
            )}
            {mounted.has('ventas') && (
                <div className={activeTab === 'ventas' ? '' : 'hidden'}>
                    <TabVentasPeriodo branchId={effectiveBranchId} />
                </div>
            )}
            {mounted.has('topprod') && (
                <div className={activeTab === 'topprod' ? '' : 'hidden'}>
                    <TabTopProductos branchId={effectiveBranchId} />
                </div>
            )}
            {mounted.has('topclient') && (
                <div className={activeTab === 'topclient' ? '' : 'hidden'}>
                    <TabTopClientes branchId={effectiveBranchId} />
                </div>
            )}
        </div>
    );
}
