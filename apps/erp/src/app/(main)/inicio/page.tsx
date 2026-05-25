'use client';

import { useEffect, useState } from 'react';
import { SaleService } from '@/services/SaleService';
import { CashierSessionService } from '@/services/CashierSessionService';
import { AccountService } from '@/services/AccountService';
import { Sale } from '@/types';
import { CashierSession } from '@/types/treasury';
import { useProductStore } from '@/store/productStore';
import { ensureDate, formatTime } from '@/utils/dateHelpers';
import {
    DollarSign,
    ShoppingBag,
    Package,
    AlertTriangle,
    TrendingUp,
    Unlock,
    Lock,
    LayoutDashboard
} from 'lucide-react';
import Link from 'next/link';

import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { logAdminAction } from '@/lib/audit';

import SalesChart from '@/components/dashboard/SalesChart';
import UpcomingReminders from '@/components/dashboard/UpcomingReminders';
import AbcDistributionCard from '@/components/dashboard/AbcDistributionCard';
import FinancialOverview from '@/components/dashboard/FinancialOverview';

import ModuleHeader from '@/components/common/ModuleHeader';
import KpiCard from '@/components/common/KpiCard';

interface ChartData {
    name: string;
    total: number;
}

export default function DashboardPage() {
    const { user, canAccess } = useAuth();
    const [recentSales, setRecentSales] = useState<Sale[]>([]);
    const [todaySalesTotal, setTodaySalesTotal] = useState(0);
    const [todaySalesCount, setTodaySalesCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [currentShift, setCurrentShift] = useState<CashierSession | null>(null);
    const [cashBalance, setCashBalance] = useState(0);
    const [chartData, setChartData] = useState<ChartData[]>([]);
    const [topProducts, setTopProducts] = useState<{ id: string, name: string, qty: number, total: number }[]>([]);

    const { currentBranch, isConsolidatedView, loading: branchLoading } = useBranch();
    const products = useProductStore(s => s.products);
    const productsLoading = useProductStore(s => s.loading);
    const [globalCashTotal, setGlobalCashTotal] = useState(0);

    useEffect(() => {
        if (!user || branchLoading) return;

        const fetchDashboardData = async () => {
            try {
                const branchFilter = isConsolidatedView ? undefined : currentBranch?.id;

                const startOfDay = new Date();
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date();
                endOfDay.setHours(23, 59, 59, 999);
                const startOfWeek = new Date();
                startOfWeek.setDate(startOfWeek.getDate() - 6);
                startOfWeek.setHours(0, 0, 0, 0);

                const cashPromise: Promise<CashierSession[] | CashierSession | null> = isConsolidatedView
                    ? CashierSessionService.getOpenSessions()
                    : user?.uid
                        ? CashierSessionService.getOperableSession(user.uid, currentBranch?.id)
                        : Promise.resolve(null);

                const [todaySales, recent, weeklySales, cashResult] = await Promise.all([
                    SaleService.getSalesByDateRange(startOfDay, endOfDay, branchFilter),
                    SaleService.getRecentSales(5, branchFilter),
                    SaleService.getSalesByDateRange(startOfWeek, new Date(), branchFilter),
                    cashPromise,
                ]);

                const totalAmount = todaySales.reduce((acc, sale) => acc + (sale.total || 0), 0);
                setTodaySalesTotal(totalAmount);
                setTodaySalesCount(todaySales.length);
                setRecentSales(recent);

                const productStats: Record<string, { id: string, name: string, qty: number, total: number }> = {};
                weeklySales.forEach(sale => {
                    if (sale.items) {
                        sale.items.forEach(item => {
                            if (!productStats[item.productId]) {
                                productStats[item.productId] = { id: item.productId, name: item.productName, qty: 0, total: 0 };
                            }
                            productStats[item.productId].qty += item.quantity;
                            productStats[item.productId].total += (item.subtotal ?? 0);
                        });
                    }
                });
                setTopProducts(Object.values(productStats).sort((a, b) => b.qty - a.qty).slice(0, 5));

                const data: ChartData[] = [];
                for (let i = 6; i >= 0; i--) {
                    const day = new Date();
                    day.setDate(day.getDate() - i);
                    const dayLabel = day.toLocaleDateString('es-BO', { weekday: 'short' });
                    const dayTotal = weeklySales.filter(s => {
                        const sDate = ensureDate(s.fecha);
                        return sDate.getDate() === day.getDate() &&
                               sDate.getMonth() === day.getMonth() &&
                               sDate.getFullYear() === day.getFullYear();
                    }).reduce((acc, s) => acc + (s.total ?? 0), 0);
                    data.push({ name: dayLabel, total: dayTotal });
                }
                setChartData(data);

                if (isConsolidatedView) {
                    const allSessions = cashResult as CashierSession[];
                    const balances = await Promise.all(
                        allSessions.map(s => AccountService.getById(s.cashDrawerId))
                    );
                    setGlobalCashTotal(balances.reduce((sum, acc) => sum + (acc?.currentBalance ?? 0), 0));
                    setCurrentShift(allSessions.length > 0 ? allSessions[0] : null);
                } else {
                    const validSession = cashResult as CashierSession | null;
                    setCurrentShift(validSession);
                    if (validSession) {
                        const acc = await AccountService.getById(validSession.cashDrawerId);
                        setCashBalance(acc?.currentBalance ?? 0);
                    } else {
                        setCashBalance(0);
                    }
                }

                if (user && currentBranch?.id) {
                    logAdminAction(
                        user.uid,
                        user.email || '?',
                        'VIEW_DASHBOARD',
                        isConsolidatedView ? 'CONSOLIDATED' : currentBranch.id,
                        currentBranch.id,
                        isConsolidatedView ? 'Vista Global Consolidada' : `Vista de Sucursal: ${currentBranch.name}`
                    ).catch(() => {});
                }
            } catch (error) {
                console.error("Dashboard error:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
        const handleCashRefresh = () => fetchDashboardData();
        window.addEventListener('cash-shift-changed', handleCashRefresh);
        return () => window.removeEventListener('cash-shift-changed', handleCashRefresh);
    }, [user, currentBranch?.id, currentBranch?.name, isConsolidatedView, branchLoading]);

    const lowStockProducts = products.filter(p => p.stock <= (p.minStock || 5));
    const totalProducts = products.length;

    if (isLoading || productsLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    return (
        <div className="flex-1 min-w-0 w-full max-w-full flex flex-col space-y-4 sm:space-y-6 lg:space-y-8 pb-6 sm:pb-10 animate-in fade-in duration-500">
            {/* Header Section */}
            <div data-tour="inicio-header">

            <ModuleHeader
                title="Dashboard"
                icon={LayoutDashboard}
                subtitle={`Reporte de operaciones y métricas de rendimiento sucursal ${currentBranch?.name || 'CENTRAL'}.`}
                badge={isConsolidatedView ? "VISTA GLOBAL" : undefined}
                actions={canAccess('/caja') ? [
                    {
                        label: currentShift
                            ? `Bóveda: Bs. ${ (isConsolidatedView ? globalCashTotal : cashBalance).toLocaleString() }`
                            : "Requiere Apertura",
                        icon: currentShift ? Unlock : Lock,
                        onClick: () => window.location.href = '/caja',
                        variant: currentShift ? 'secondary' : 'danger'
                    }
                ] : []}
            />

            {/* Quick actions strip */}
            <div className="mt-4 rounded-3xl border border-slate-200/60 dark:border-white/10 bg-white dark:bg-background shadow-sm p-3 sm:p-4">
                <div className="flex flex-wrap gap-3 sm:gap-4">
                    {canAccess('/punto-de-venta') && (
                        <Link href="/punto-de-venta" style={{ animation: 'page-enter 0.4s cubic-bezier(0.22,1,0.36,1) 0ms backwards' }} className="flex flex-1 min-w-[min(100%,10rem)] sm:flex-none items-center justify-center gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-yellow-500 hover:bg-yellow-600 text-black rounded-xl font-bold text-sm shadow-lg shadow-yellow-500/10 transition-all active:scale-95 group">
                            <ShoppingBag size={20} strokeWidth={2.5} className="group-hover:scale-110 transition-transform" />
                            Nueva Venta
                        </Link>
                    )}
                    {[
                        { href: '/caja', icon: DollarSign, label: 'Bóveda' },
                        { href: '/inventario', icon: Package, label: 'Inventario' },
                        { href: '/compras', icon: TrendingUp, label: 'Compras' }
                    ].filter(action => canAccess(action.href)).map((action, i) => (
                        <Link key={action.href} href={action.href} style={{ animation: `page-enter 0.4s cubic-bezier(0.22,1,0.36,1) ${(i + 1) * 80}ms backwards` }} className="flex flex-1 min-w-[min(100%,10rem)] sm:flex-none items-center justify-center gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-white dark:bg-background border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm hover:border-yellow-500 transition-all active:scale-95 group shadow-sm">
                            <div className="w-8 h-8 rounded-xl bg-slate-50 dark:bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-yellow-500 transition-colors">
                                <action.icon size={18} />
                            </div>
                            {action.label}
                        </Link>
                    ))}
                </div>
            </div>
            </div>

            {/* Stats Overview */}
            <div data-tour="inicio-kpis" className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KpiCard
                    label="Ingresos del Día"
                    value={`Bs. ${(todaySalesTotal ?? 0).toLocaleString()}`}
                    icon={DollarSign}
                    secondaryLabel="Operaciones"
                    secondaryValue={todaySalesCount}
                    color="gold"
                    delay={150}
                />
                <KpiCard
                    label="Stock Activo"
                    value={totalProducts}
                    icon={Package}
                    secondaryLabel="Items en Catálogo"
                    secondaryValue={totalProducts}
                    color="blue"
                    delay={250}
                />
                <KpiCard
                    label="Alertas de Inventario"
                    value={lowStockProducts.length.toString()}
                    icon={AlertTriangle}
                    color="red"
                    secondaryLabel="Bajo Mínimo"
                    secondaryValue={lowStockProducts.length}
                    delay={350}
                />
            </div>

            {/* Posición financiera: Bóveda / Por Pagar / A Favor */}
            <div data-tour="inicio-financial">
                <FinancialOverview
                    cashBalance={isConsolidatedView ? globalCashTotal : (currentShift ? cashBalance : null)}
                    isConsolidatedView={isConsolidatedView || !!currentBranch?.isHQ}
                    currentBranchId={isConsolidatedView || currentBranch?.isHQ ? undefined : currentBranch?.id}
                />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart Section */}
                <div data-tour="inicio-chart" className="lg:col-span-2 bg-white dark:bg-background rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-white/10 p-4 sm:p-8 shadow-xl flex flex-col min-w-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-8 min-w-0">
                        <div>
                            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <TrendingUp size={14} className="text-yellow-500" />
                                Tendencia Operativa
                            </h2>
                            <p className="text-lg font-black text-slate-900 dark:text-white mt-1 uppercase tracking-tighter">Últimos 7 Días</p>
                        </div>
                    </div>
                    <div className="h-87.5">
                        <SalesChart data={chartData} />
                    </div>
                </div>

                {/* Performance & Activity */}
                <div className="flex flex-col gap-6">
                    {/* ABC Analytics Widget (Phase Omega Architecture) */}
                    <AbcDistributionCard products={products} />

                    {/* CRM Reminders Widget (Phase 7 Architecture) */}
                    <UpcomingReminders branchId={isConsolidatedView ? 'ALL' : (currentBranch?.id || 'ALL')} />

                    {/* Activity List */}
                    <div data-tour="inicio-activity" className="bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 shadow-xl overflow-hidden flex flex-col h-full">
                        <div className="p-6 border-b border-slate-100 dark:border-white/10 flex justify-between items-center bg-slate-50 dark:bg-black/40">
                            <h2 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Actividad Reciente</h2>
                            <Link href="/ventas" className="text-[9px] font-black text-yellow-600 dark:text-[#FFD700] uppercase tracking-widest hover:underline">Ver Todo</Link>
                        </div>
                        <div className="flex-1 overflow-auto p-4 space-y-2 custom-scrollbar">
                            {recentSales.map(sale => (
                                <div key={sale.id} className="flex items-center justify-between gap-2 p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all border border-transparent hover:border-slate-100 dark:hover:border-white/5 shadow-sm hover:shadow-md min-w-0">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-[11px] font-black text-slate-500 uppercase shrink-0">
                                            {sale.cliente?.razonSocial.charAt(0)}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-black text-slate-900 dark:text-slate-200 wrap-break-word uppercase tracking-tight">{sale.cliente?.razonSocial}</p>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{formatTime(sale.fecha)}</p>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-black text-slate-900 dark:text-white tabular-nums tracking-tighter shrink-0">
                                        Bs. {(sale.total ?? 0).toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
 
                    {/* Top Products */}
                    <div data-tour="inicio-top-products" className="bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 p-8 shadow-xl">
                        <h2 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Top Productos</h2>
                        {topProducts.length === 0 ? (
                            <p className="text-[10px] text-slate-400 font-bold">Sin ventas en los últimos 7 días</p>
                        ) : (
                            <div className="space-y-5">
                                {topProducts.map((p, i) => (
                                    <div key={p.id} className="flex items-center gap-4 group/item">
                                        <span className="text-[10px] font-black text-slate-300 w-4 group-hover/item:text-yellow-500 transition-colors">0{i + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 wrap-break-word uppercase tracking-tight">{p.name}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{p.qty} VENDIDOS</span>
                                            </div>
                                        </div>
                                        <p className="text-[11px] font-black text-slate-900 dark:text-white tabular-nums tracking-tighter">Bs. {(p.total ?? 0).toLocaleString()}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}


