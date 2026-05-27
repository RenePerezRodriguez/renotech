'use client';

import { useState, useEffect } from 'react';
import { Bell, Shield, Check, X, ExternalLink, Receipt, RotateCcw, Percent, ChevronRight, CheckCircle2, AlertOctagon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { AuditAlertService } from '@/services/AuditAlertService';
import { AuditAlert } from '@/types';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import clsx from 'clsx';
import Link from 'next/link';
import { formatUserName } from '@/utils/formatUserName';

type PendingItem = {
    id: string;
    kind: 'expense' | 'void' | 'discount';
    title: string;
    subtitle: string;
    amount?: number;
    requestedBy: string;
    when: Date;
};

const KIND_META: Record<PendingItem['kind'], { label: string; icon: typeof Receipt; color: string; tab: string }> = {
    expense: { label: 'Gasto', icon: Receipt, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30', tab: 'approvals' },
    void: { label: 'Devolución', icon: RotateCcw, color: 'text-rose-600 bg-rose-100 dark:bg-rose-900/30', tab: 'voidApprovals' },
    discount: { label: 'Descuento', icon: Percent, color: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30', tab: 'discountApprovals' },
};

function tsToDate(v: unknown): Date {
    if (v instanceof Date) return v;
    if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
        return (v as { toDate: () => Date }).toDate();
    }
    return new Date();
}

export default function AuditNotifications() {
    const { role } = useAuth();
    const { canSwitchBranch, currentBranch } = useBranch();
    const [alerts, setAlerts] = useState<AuditAlert[]>([]);
    const [pending, setPending] = useState<PendingItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    const isManager = role === 'GERENTE';

    // Audit alerts (subscripción ya existente)
    useEffect(() => {
        if (!isManager) return;
        const unsub = AuditAlertService.subscribeToUnreadAlerts('ALL', setAlerts);
        return () => unsub();
    }, [isManager]);

    // Aprobaciones pendientes (solo gerente) — escucha las 3 colecciones y unifica
    useEffect(() => {
        if (!isManager) {
            return;
        }
        // Filtro por sucursal: si el gerente NO puede cambiar de sucursal (es decir, gerente local),
        // sólo ve las aprobaciones de SU sucursal. Gerente con acceso global ve todas.
        const branchScope = canSwitchBranch ? null : (currentBranch?.id || null);

        const items = new Map<string, PendingItem>();
        const refresh = () => setPending(
            Array.from(items.values()).sort((a, b) => b.when.getTime() - a.when.getTime())
        );

        const expConstraints = [
            where('status', '==', 'PENDING_APPROVAL'),
            ...(branchScope ? [where('branchId', '==', branchScope)] : []),
            orderBy('createdAt', 'desc'),
            limit(20),
        ];
        const qExp = query(collection(db, 'gastos_operativos'), ...expConstraints);
        const unsubExp = onSnapshot(qExp, snap => {
            Array.from(items.keys()).filter(k => k.startsWith('e:')).forEach(k => items.delete(k));
            snap.docs.forEach(d => {
                const r = d.data();
                items.set('e:' + d.id, {
                    id: d.id,
                    kind: 'expense',
                    title: `Gasto ${r.category || ''}`.trim(),
                    subtitle: r.description || 'Sin descripción',
                    amount: Number(r.amount) || 0,
                    requestedBy: r.userName || 'Cajero',
                    when: tsToDate(r.createdAt),
                });
            });
            refresh();
        }, err => console.error('pending expenses:', err));

        const voidConstraints = [
            where('status', '==', 'PENDING'),
            ...(branchScope ? [where('branchId', '==', branchScope)] : []),
            orderBy('requestedAt', 'desc'),
            limit(20),
        ];
        const qVoid = query(collection(db, 'pending_void_approvals'), ...voidConstraints);
        const unsubVoid = onSnapshot(qVoid, snap => {
            Array.from(items.keys()).filter(k => k.startsWith('v:')).forEach(k => items.delete(k));
            snap.docs.forEach(d => {
                const r = d.data();
                items.set('v:' + d.id, {
                    id: d.id,
                    kind: 'void',
                    title: r.itemId ? 'Devolución de ítem' : 'Anulación de venta',
                    subtitle: r.reason || r.saleShortId || 'Sin motivo',
                    amount: Number(r.refundAmount) || undefined,
                    requestedBy: r.requesterName || 'Cajero',
                    when: tsToDate(r.requestedAt),
                });
            });
            refresh();
        }, err => console.error('pending voids:', err));

        const discConstraints = [
            where('status', '==', 'PENDING'),
            ...(branchScope ? [where('branchId', '==', branchScope)] : []),
            orderBy('requestedAt', 'desc'),
            limit(20),
        ];
        const qDisc = query(collection(db, 'pending_discount_approvals'), ...discConstraints);
        const unsubDisc = onSnapshot(qDisc, snap => {
            Array.from(items.keys()).filter(k => k.startsWith('d:')).forEach(k => items.delete(k));
            snap.docs.forEach(d => {
                const r = d.data();
                items.set('d:' + d.id, {
                    id: d.id,
                    kind: 'discount',
                    title: `${(r.effectiveDiscountPct || 0).toFixed(0)}% en ${r.productName || 'producto'}`,
                    subtitle: `Bs. ${Number(r.originalPrice || 0).toFixed(2)} → Bs. ${Number(r.finalPrice || 0).toFixed(2)}`,
                    requestedBy: r.cashierName || 'Cajero',
                    when: tsToDate(r.requestedAt),
                });
            });
            refresh();
        }, err => console.error('pending discounts:', err));

        return () => { unsubExp(); unsubVoid(); unsubDisc(); };
    }, [isManager, canSwitchBranch, currentBranch?.id]);

    const markAsRead = async (id: string) => { await AuditAlertService.markAsRead(id); };

    /**
     * Resuelve dónde llevar al usuario según el tipo de alerta.
     * Cada tipo conocido tiene un destino útil; el resto cae a /auditoria/alertas.
     */
    const getAlertLink = (alert: AuditAlert): string => {
        const md = alert.metadata || {};
        switch (alert.type) {
            case 'FLETE_POR_PAGAR':
                return '/envios/fletes?tab=POR_PAGAR';
            case 'TRANSFER_DISCREPANCY':
            case 'TRANSFER_DISCREPANCY_RESOLVED':
            case 'ENVIO_CANCEL_APPROVED':
            case 'ENVIO_CANCEL_REJECTED':
                return md.envioId ? `/envios/${md.envioId}` : '/envios';
            case 'CASH_DISCREPANCY':
            case 'SHIFT_OPEN_TOO_LONG':
                return '/caja';
            case 'EXPENSE_DUPLICATE':
            case 'EXPENSE_LARGE':
                return '/caja?tab=EXPENSES';
            case 'DISCOUNT_OVERRIDE':
                return md.saleId ? `/ventas?ref=${md.saleId}` : '/auditoria/alertas';
            case 'INVENTORY_THRESHOLD':
                return md.productId ? `/inventario/editar/${md.productId}` : '/inventario';
            case 'SECURITY':
            default:
                return '/auditoria/alertas';
        }
    };

    const formatTime = (date: Date) => {
        try {
            return new Intl.DateTimeFormat('es-BO', {
                hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
                timeZone: 'America/La_Paz'
            }).format(date);
        } catch { return date.toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' }); }
    };

    if (!isManager) return null;

    const totalBadge = pending.length + alerts.length;

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "w-9 h-9 inline-flex items-center justify-center rounded-xl border transition-colors relative",
                    isOpen
                        ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
                        : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-white/10 dark:hover:bg-white/10"
                )}
                title="Notificaciones"
            >
                <Bell size={16} strokeWidth={2.5} />
                {totalBadge > 0 && (
                    <span className={clsx(
                        "absolute top-1.5 right-1.5 min-w-4 h-4 px-1 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white dark:border-[#0f1523]",
                        pending.length > 0 ? "bg-orange-500 animate-pulse" : "bg-red-500"
                    )}>
                        {totalBadge > 99 ? '99+' : totalBadge}
                    </span>
                )}
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-0.75rem))] max-h-[min(34rem,85dvh)] flex flex-col bg-white dark:bg-[#111827] rounded-2xl sm:rounded-3xl border border-slate-100 dark:border-white/10 shadow-2xl z-50 overflow-hidden ring-1 ring-black/5">
                        {/* Header */}
                        <div className="px-4 py-3 border-b dark:border-white/10 bg-slate-50/50 dark:bg-white/5/50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Bell size={16} className="text-blue-600 dark:text-[#FFD700]" />
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Notificaciones</h3>
                            </div>
                            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto">
                            {/* SECCIÓN 1: APROBACIONES PENDIENTES (solo gerente) */}
                            {isManager && pending.length > 0 && (
                                <div>
                                    <div className="px-4 py-2 bg-orange-50 dark:bg-orange-900/10 border-b border-orange-100 dark:border-orange-900/30">
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">
                                            Esperan tu decisión · {pending.length}
                                        </p>
                                    </div>
                                    <div className="divide-y dark:divide-gray-800">
                                        {pending.slice(0, 8).map(p => {
                                            const meta = KIND_META[p.kind];
                                            const Icon = meta.icon;
                                            return (
                                                <Link
                                                    key={`${p.kind}:${p.id}`}
                                                    href={`/gerencia?tab=${meta.tab}`}
                                                    onClick={() => setIsOpen(false)}
                                                    className="block p-4 hover:bg-orange-50/40 dark:hover:bg-orange-900/10 transition-colors group"
                                                >
                                                    <div className="flex gap-3">
                                                        <div className={clsx("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm", meta.color)}>
                                                            <Icon size={18} />
                                                        </div>
                                                        <div className="flex-1 min-w-0 space-y-0.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[8px] font-black uppercase tracking-widest text-orange-600 dark:text-orange-400">{meta.label}</span>
                                                                {p.amount !== undefined && (
                                                                    <span className="text-[10px] font-black text-slate-900 dark:text-white tabular-nums">Bs. {p.amount.toFixed(2)}</span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate">{p.title}</p>
                                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight truncate">{p.subtitle}</p>
                                                            <div className="flex items-center justify-between pt-1">
                                                                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                                                    {formatUserName(p.requestedBy)} · {formatTime(p.when)}
                                                                </span>
                                                                <ChevronRight size={14} className="text-orange-500 opacity-0 group-hover:opacity-100 transition" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                    {pending.length > 8 && (
                                        <Link
                                            href="/gerencia"
                                            onClick={() => setIsOpen(false)}
                                            className="block px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                                        >
                                            Ver {pending.length - 8} más en Gerencia →
                                        </Link>
                                    )}
                                </div>
                            )}

                            {/* SECCIÓN 2: ALERTAS DE AUDITORÍA */}
                            {alerts.length > 0 && (
                                <div>
                                    <div className="px-4 py-2 bg-slate-50 dark:bg-white/5/40 border-b border-slate-100 dark:border-white/10">
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                                            Alertas de auditoría · {alerts.length}
                                        </p>
                                    </div>
                                    <div className="divide-y dark:divide-gray-800">
                                        {alerts.map(alert => {
                                            const isResolved = alert.type === 'TRANSFER_DISCREPANCY_RESOLVED';
                                            const isDiscrep = alert.type === 'TRANSFER_DISCREPANCY';
                                            const decision = (alert.metadata?.decision as string) || '';
                                            const isApproved = decision === 'approved';
                                            const iconBox = isResolved
                                                ? (isApproved
                                                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                                                    : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300')
                                                : isDiscrep
                                                    ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
                                                    : alert.severity === 'CRITICAL' || alert.severity === 'HIGH'
                                                        ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
                                                        : alert.severity === 'MEDIUM'
                                                            ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
                                                            : 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400';
                                            const IconCmp = isResolved ? CheckCircle2 : isDiscrep ? AlertOctagon : Shield;
                                            const link = getAlertLink(alert);
                                            const linkLabel = link.startsWith('/envios') ? 'Ver envío'
                                                : link.startsWith('/caja') ? 'Ir a Caja'
                                                : link.startsWith('/ventas') ? 'Ver venta'
                                                : link.startsWith('/inventario') ? 'Ver producto'
                                                : 'Ver detalle';
                                            return (
                                                <div key={alert.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5/50 transition-colors group">
                                                    <div className="flex gap-3">
                                                        <div className={clsx(
                                                            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                                                            iconBox,
                                                        )}>
                                                            <IconCmp size={16} strokeWidth={2.25} />
                                                        </div>
                                                        <div className="flex-1 min-w-0 space-y-1">
                                                            <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">{alert.message}</p>
                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                                                {alert.userName && (
                                                                    <span>Por <span className="text-slate-700 dark:text-slate-200">{formatUserName(alert.userName)}</span></span>
                                                                )}
                                                                <span aria-hidden="true">·</span>
                                                                <span>{formatTime(alert.createdAt as Date)}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-2 pt-1">
                                                                <Link
                                                                    href={link}
                                                                    onClick={() => setIsOpen(false)}
                                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-[9px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition"
                                                                >
                                                                    <ExternalLink size={10} /> {linkLabel}
                                                                </Link>
                                                                <button
                                                                    onClick={() => markAsRead(alert.id)}
                                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition"
                                                                    title="Marcar como leída"
                                                                >
                                                                    <Check size={11} /> Visto
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* VACÍO */}
                            {pending.length === 0 && alerts.length === 0 && (
                                <div className="p-10 text-center space-y-3">
                                    <div className="w-12 h-12 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
                                        <Bell size={24} />
                                    </div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Todo al día</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-3 bg-slate-50 dark:bg-white/5/30 border-t dark:border-white/10 flex gap-2">
                            {isManager && (
                                <Link
                                    href="/gerencia"
                                    onClick={() => setIsOpen(false)}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-2 bg-orange-500 text-white text-[9px] font-black uppercase tracking-[0.12em] rounded-xl hover:bg-orange-600 active:scale-95 transition-all shadow-lg whitespace-nowrap"
                                >
                                    Gerencia
                                    <ExternalLink size={11} />
                                </Link>
                            )}
                            <Link
                                href="/auditoria"
                                onClick={() => setIsOpen(false)}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-2 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black text-[9px] font-black uppercase tracking-[0.12em] rounded-xl hover:scale-[1.02] active:scale-95 transition-all shadow-lg whitespace-nowrap"
                            >
                                Auditoría
                                <ExternalLink size={11} />
                            </Link>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
