'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Truck, Send, AlertTriangle, FileText, RotateCcw, Percent, AlertOctagon, Sparkles, HelpCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useChat } from '@/contexts/ChatContext';
import clsx from 'clsx';
import { menuGroups } from '@/config/menu';
import { useTransferNotifications } from '@/hooks/useTransferNotifications';
import { usePendingApprovalsCount } from '@/hooks/usePendingApprovalsCount';

// ─── Tooltip portal ───────────────────────────────────────────────────────────

interface TooltipRow {
    icon: typeof Truck;
    label: string;
    count: number;
    color: string;
}

function SidebarTooltip({ rows, anchorRect }: { rows: TooltipRow[]; anchorRect: DOMRect }) {
    const visible = rows.filter(r => r.count > 0);
    if (visible.length === 0) return null;

    const top = anchorRect.top + anchorRect.height / 2;
    const left = anchorRect.right + 10;

    return createPortal(
        <div
            style={{ position: 'fixed', top, left, transform: 'translateY(-50%)', zIndex: 9999 }}
            className="min-w-44 bg-slate-900 dark:bg-background text-white rounded-2xl shadow-2xl border border-white/10 p-3 animate-in fade-in zoom-in-95 duration-200 pointer-events-none"
        >
            <div className="space-y-2">
                {visible.map((row, i) => {
                    const Icon = row.icon;
                    return (
                        <div key={i} className="flex items-center gap-2.5">
                            <div className={clsx('w-5 h-5 rounded-lg flex items-center justify-center shrink-0', row.color)}>
                                <Icon size={10} strokeWidth={2.5} />
                            </div>
                            <span className="text-[10px] font-bold text-slate-300 flex-1">{row.label}</span>
                            <span className="text-[10px] font-black text-white tabular-nums">{row.count}</span>
                        </div>
                    );
                })}
            </div>
            {/* Arrow pointing left */}
            <div
                className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-slate-900 dark:bg-background border-l border-b border-white/10 rotate-45"
            />
        </div>,
        document.body
    );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
    const pathname = usePathname();
    const { role, allowedRoutes } = useAuth();
    const { isHQ, isConsolidatedView, currentBranch } = useBranch();
    const { isOpen: isChatOpen, toggleChat, openWithContext } = useChat();

    // Contextual help — map route prefix → context message
    const SIDEBAR_CONTEXTS: Record<string, { label: string; message: string }> = {
        '/punto-de-venta': { label: 'Punto de Venta', message: 'Estoy en el Punto de Venta. ¿Cómo busco un producto rápidamente y aplico un descuento?' },
        '/inventario':     { label: 'Inventario',     message: 'Estoy en el módulo de Inventario. ¿Qué puedo hacer aquí y cómo consulto el stock?' },
        '/ventas':         { label: 'Ventas',          message: 'Estoy en el módulo de Ventas. ¿Cómo veo el resumen de ventas de hoy?' },
        '/caja':           { label: 'Caja',            message: 'Estoy en el módulo de Caja. ¿Cómo abro o cierro una sesión de caja?' },
        '/compras':        { label: 'Compras',         message: 'Estoy en el módulo de Compras. ¿Cómo registro una nueva compra a un proveedor?' },
        '/cotizaciones':   { label: 'Cotizaciones',    message: 'Estoy en el módulo de Cotizaciones. ¿Cómo creo una nueva cotización?' },
        '/pedidos':        { label: 'Pedidos',         message: 'Estoy en el módulo de Pedidos. ¿Cómo creo un pedido entre sucursales?' },
        '/envios':         { label: 'Envíos',          message: 'Estoy en el módulo de Envíos. ¿Cómo gestiono envíos pendientes?' },
        '/clientes':       { label: 'Clientes',        message: 'Estoy en el módulo de Clientes. ¿Cómo veo los créditos pendientes?' },
        '/creditos':       { label: 'Créditos',        message: 'Estoy en el módulo de Créditos. ¿Cómo registro un pago de cuota?' },
        '/gerencia':       { label: 'Gerencia',        message: 'Estoy en Gerencia. Dame un resumen del rendimiento de ventas por sucursal.' },
        '/inicio':         { label: 'Dashboard',       message: 'Estoy en el Dashboard. Dame un resumen rápido del estado del sistema hoy.' },
    };
    const sidebarCtx = Object.entries(SIDEBAR_CONTEXTS).find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? null;
    const transfers = useTransferNotifications(currentBranch?.id);
    const approvals = usePendingApprovalsCount(role === 'GERENTE');
    const [isCollapsed, setIsCollapsed] = useState(pathname.startsWith('/inventario'));
    const [lastPath, setLastPath] = useState(pathname);

    // Tooltip state
    const [tooltip, setTooltip] = useState<{ type: 'envios' | 'pedidos' | 'gerencia'; rect: DOMRect } | null>(null);
    const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    if (pathname !== lastPath) {
        setLastPath(pathname);
        setIsCollapsed(pathname.startsWith('/inventario'));
    }

    // Clear tooltip on navigation
    useEffect(() => { setTooltip(null); }, [pathname]);

    const showTooltip = (type: 'envios' | 'pedidos' | 'gerencia', e: React.MouseEvent) => {
        if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltip({ type, rect });
    };

    const hideTooltip = () => {
        tooltipTimeout.current = setTimeout(() => setTooltip(null), 120);
    };

    const filteredMenuGroups = menuGroups.map(group => ({
        ...group,
        items: group.items.filter(item => {
            if (item.hqOnly && !isHQ && !isConsolidatedView) return false;
            if (role === 'GERENTE') return true;
            return allowedRoutes.includes(item.href);
        })
    })).filter(group => group.items.length > 0);

    // Tooltip row definitions
    const enviosNotifCount = transfers.envios + transfers.cancelaciones;

    const enviosRows: TooltipRow[] = [
        { icon: Truck,         label: 'En tránsito',   count: transfers.envios,       color: 'bg-amber-500/20 text-amber-400' },
        { icon: AlertTriangle, label: 'Cancelaciones', count: transfers.cancelaciones, color: 'bg-rose-500/20 text-rose-400'  },
    ];

    const pedidosRows: TooltipRow[] = [
        { icon: Send, label: 'Sin despachar', count: transfers.pedidos, color: 'bg-blue-500/20 text-blue-400' },
    ];

    const gerenciaRows: TooltipRow[] = [
        { icon: FileText,    label: 'Gastos pendientes',   count: approvals.expenses,       color: 'bg-amber-500/20 text-amber-400'   },
        { icon: RotateCcw,   label: 'Devoluciones',        count: approvals.voids,          color: 'bg-blue-500/20 text-blue-400'     },
        { icon: Percent,     label: 'Descuentos',          count: approvals.discounts,      color: 'bg-purple-500/20 text-purple-400' },
        { icon: Truck,       label: 'Cancelaciones',       count: approvals.cancellations,  color: 'bg-rose-500/20 text-rose-400'     },
        { icon: AlertOctagon,label: 'Discrepancias',       count: approvals.discrepancies,  color: 'bg-orange-500/20 text-orange-400' },
    ];

    return (
        <aside
            className={clsx(
                "hidden md:flex flex-col transition-all duration-300 h-screen z-layout-sidebar bg-white dark:bg-background border-r border-slate-200 dark:border-white/5",
                isCollapsed ? "w-14" : "w-52"
            )}
        >
            <div className="flex flex-col h-full overflow-hidden">
                {/* Logo */}
                <div className={clsx(
                    "h-16 flex items-center border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/30",
                    isCollapsed ? "justify-center" : "justify-between px-4"
                )}>
                    {!isCollapsed && (
                        <Link href="/inicio" className="flex items-center group">
                            <h1 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                RENO<span className="text-yellow-500">TECH</span>
                            </h1>
                        </Link>
                    )}
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="rounded-xl p-2 transition-colors hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 dark:text-slate-500"
                        title={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
                    >
                        <Menu size={18} strokeWidth={2.5} />
                    </button>
                </div>

                {/* Nav */}
                <nav className={clsx("flex-1 overflow-y-auto py-6 space-y-8 custom-scrollbar min-h-0", isCollapsed ? "px-0" : "px-3")}>
                    {filteredMenuGroups.map((group) => (
                        <div key={group.title}>
                            {!isCollapsed && (
                                <h3 className="mb-4 px-4 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                                    {group.title}
                                </h3>
                            )}
                            <div className="space-y-1">
                                {group.items.map((item) => {
                                    const isActive = pathname === item.href || (item.href !== '/inicio' && pathname.startsWith(item.href));
                                    const isEnvios = item.href === '/envios';
                                    const isPedidos = item.href === '/pedidos';
                                    const isGerencia = item.href === '/gerencia';
                                    const hasEnviosBadge = isEnvios && enviosNotifCount > 0;
                                    const hasPedidosBadge = isPedidos && transfers.pedidos > 0;
                                    const hasGerenciaBadge = isGerencia && approvals.total > 0;

                                    return (
                                        <div
                                            key={item.href}
                                            className="relative"
                                            onMouseEnter={(e) => {
                                                if (isEnvios && enviosNotifCount > 0) showTooltip('envios', e);
                                                if (isPedidos && transfers.pedidos > 0) showTooltip('pedidos', e);
                                                if (isGerencia && approvals.total > 0) showTooltip('gerencia', e);
                                            }}
                                            onMouseLeave={hideTooltip}
                                        >
                                            <Link
                                                href={item.href}
                                                className={clsx(
                                                    "flex items-center rounded-xl p-3 text-sm font-semibold transition-all duration-200 group relative",
                                                    isActive
                                                        ? "bg-slate-900 text-white dark:bg-[#FFD700] dark:text-black shadow-lg shadow-black/10 dark:shadow-[#FFD700]/10 border border-transparent"
                                                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 active:bg-slate-200 dark:hover:bg-white/5",
                                                    isCollapsed ? "justify-center w-10 h-10 mx-auto p-0 rounded-xl" : "gap-3 p-3"
                                                )}
                                                title={item.name}
                                            >
                                                <item.icon
                                                    size={isCollapsed ? 22 : 18}
                                                    strokeWidth={isActive ? 2.5 : 2}
                                                    className={clsx(
                                                        "transition-colors shrink-0",
                                                        isActive
                                                            ? "text-yellow-500 dark:text-black"
                                                            : (isCollapsed ? "text-slate-500" : "text-slate-400") + " group-hover:text-slate-900 dark:group-hover:text-white"
                                                    )}
                                                />
                                                {!isCollapsed && (
                                                    <span className="wrap-break-word">{item.name}</span>
                                                )}

                                                {/* Badge Envíos */}
                                                {hasEnviosBadge && (
                                                    isCollapsed ? (
                                                        <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-white dark:border-[#020617] shadow-sm z-10">
                                                            {enviosNotifCount > 9 ? '9+' : enviosNotifCount}
                                                        </span>
                                                    ) : (
                                                        <span className="ml-auto min-w-5 h-4.5 px-1.5 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center shadow-sm">
                                                            {enviosNotifCount > 9 ? '9+' : enviosNotifCount}
                                                        </span>
                                                    )
                                                )}

                                                {/* Badge Pedidos */}
                                                {hasPedidosBadge && (
                                                    isCollapsed ? (
                                                        <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 rounded-full bg-blue-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-white dark:border-[#020617] shadow-sm z-10">
                                                            {transfers.pedidos > 9 ? '9+' : transfers.pedidos}
                                                        </span>
                                                    ) : (
                                                        <span className="ml-auto min-w-5 h-4.5 px-1.5 rounded-full bg-blue-500 text-white text-[9px] font-black flex items-center justify-center shadow-sm">
                                                            {transfers.pedidos > 9 ? '9+' : transfers.pedidos}
                                                        </span>
                                                    )
                                                )}

                                                {/* Badge Gerencia */}
                                                {hasGerenciaBadge && (
                                                    isCollapsed ? (
                                                        <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-white dark:border-[#020617] shadow-sm z-10">
                                                            {approvals.total > 9 ? '9+' : approvals.total}
                                                        </span>
                                                    ) : (
                                                        <span className="ml-auto min-w-5 h-4.5 px-1.5 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center shadow-sm">
                                                            {approvals.total > 9 ? '9+' : approvals.total}
                                                        </span>
                                                    )
                                                )}

                                                {isActive && !isCollapsed && (
                                                    <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-yellow-500 dark:bg-black opacity-40" />
                                                )}
                                            </Link>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>
                {/* Chat assistant footer button */}
                <div className={clsx(
                    "shrink-0 border-t border-slate-100 dark:border-white/5 p-2",
                    isCollapsed ? "flex justify-center" : "flex items-center gap-1"
                )}>
                    <button
                        onClick={toggleChat}
                        title="Asistente virtual (Ctrl+J)"
                        className={clsx(
                            "flex items-center gap-2.5 rounded-xl transition-all duration-200",
                            isChatOpen
                                ? "bg-slate-900 text-white dark:bg-[#FFD700] dark:text-black shadow-sm"
                                : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5",
                            isCollapsed ? "w-10 h-10 justify-center p-0" : "flex-1 p-3"
                        )}
                    >
                        <Sparkles
                            size={isCollapsed ? 20 : 18}
                            strokeWidth={isChatOpen ? 2.5 : 2}
                            className="shrink-0"
                        />
                        {!isCollapsed && (
                            <span className="text-sm font-semibold">Asistente</span>
                        )}
                    </button>
                    {/* Contextual help "?" — only on supported modules, not collapsed, not open */}
                    {!isCollapsed && sidebarCtx && !isChatOpen && (
                        <button
                            onClick={() => openWithContext(sidebarCtx.message)}
                            title={`Ayuda en ${sidebarCtx.label}`}
                            className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors border border-slate-200 dark:border-slate-700"
                        >
                            <HelpCircle size={14} strokeWidth={1.8} />
                        </button>
                    )}
                </div>
            </div>

            {/* Tooltip portal — fuera del aside para evitar overflow clipping */}
            {tooltip?.type === 'envios' && enviosNotifCount > 0 && (
                <SidebarTooltip rows={enviosRows} anchorRect={tooltip.rect} />
            )}
            {tooltip?.type === 'pedidos' && transfers.pedidos > 0 && (
                <SidebarTooltip rows={pedidosRows} anchorRect={tooltip.rect} />
            )}
            {tooltip?.type === 'gerencia' && approvals.total > 0 && (
                <SidebarTooltip rows={gerenciaRows} anchorRect={tooltip.rect} />
            )}
        </aside>
    );
}
