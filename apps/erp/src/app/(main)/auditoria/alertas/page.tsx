'use client';

import { useState, useEffect, useCallback } from 'react';
import { AuditAlertService } from '@/services/AuditAlertService';
import { AuditAlert, Branch } from '@/types';
import { BranchService } from '@/services/BranchService';
import { 
    AlertTriangle, 
    Bell, 
    CheckCircle2, 
    Filter, 
    ShieldAlert, 
    Clock, 
    MapPin, 
    User,
    RefreshCw
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { formatDateTime } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';

export default function AuditAlertsPage() {
    const [alerts, setAlerts] = useState<AuditAlert[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterBranch, setFilterBranch] = useState<string>('ALL');
    const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
    const [onlyUnread, setOnlyUnread] = useState(true);

    const loadAlerts = useCallback(async () => {
        setLoading(true);
        try {
            const data = await AuditAlertService.getAlerts(filterBranch, onlyUnread);
            const filtered = data.filter(a => filterSeverity === 'ALL' || a.severity === filterSeverity);
            setAlerts(filtered);
        } catch {
            toast.error("Error al cargar alertas");
        } finally {
            setLoading(false);
        }
    }, [filterBranch, onlyUnread, filterSeverity]);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const branchesList = await BranchService.getAll();
                setBranches(branchesList);
                await loadAlerts();
            } catch {
                console.error("Error loading initial data");
            }
        };
        loadInitialData();
    }, [loadAlerts]);

    const handleMarkAsRead = async (id: string) => {
        try {
            await AuditAlertService.markAsRead(id);
            setAlerts(prev => prev.filter(a => a.id !== id));
            toast.success("Alerta marcada como leída");
        } catch {
            toast.error("Error al actualizar alerta");
        }
    };

    const getSeverityStyles = (severity: string) => {
        switch (severity) {
            case 'CRITICAL': return 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-rose-500/5';
            case 'HIGH': return 'bg-orange-500/10 text-orange-500 border-orange-500/20 shadow-orange-500/5';
            case 'MEDIUM': return 'bg-yellow-500/10 text-yellow-600 dark:text-[#FFD700] border-yellow-500/20';
            default: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
        }
    };

    return (
        <div className="min-w-0 w-full max-w-7xl mx-auto p-3 sm:p-6 md:p-10 space-y-4 sm:space-y-6 lg:space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 min-w-0">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black rounded-2xl shadow-xl shadow-black/10">
                            <Bell size={24} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                            Centro de Auditoría
                        </h1>
                    </div>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.3em] ml-1">
                        Control y Resolución de Alertas Industriales
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button 
                        onClick={loadAlerts}
                        className="p-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl text-slate-500 hover:text-blue-500 transition-all active:rotate-180 duration-500"
                    >
                        <RefreshCw size={20} />
                    </button>
                    <div className="px-5 py-3 bg-slate-900 dark:bg-white/5 rounded-2xl border border-white/10 flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Sistema Blindado</span>
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white dark:bg-[#111827] p-4 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
                <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <MapPin size={16} />
                    </span>
                    <select 
                        value={filterBranch}
                        onChange={(e) => setFilterBranch(e.target.value)}
                        className="w-full bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-xl pl-11 pr-4 py-3 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none focus:ring-2 ring-blue-500/20 transition-all appearance-none uppercase"
                    >
                        <option value="ALL">Todas las Sucursales</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>

                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <Filter size={16} />
                    </span>
                    <select 
                        value={filterSeverity}
                        onChange={(e) => setFilterSeverity(e.target.value)}
                        className="w-full bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-xl pl-11 pr-4 py-3 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none focus:ring-2 ring-blue-500/20 transition-all appearance-none uppercase"
                    >
                        <option value="ALL">Cualquier Severidad</option>
                        <option value="CRITICAL">Crítica</option>
                        <option value="HIGH">Alta</option>
                        <option value="MEDIUM">Media</option>
                        <option value="LOW">Baja</option>
                    </select>
                </div>

                <div className="flex items-center justify-center gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                    <button 
                        onClick={() => setOnlyUnread(true)}
                        className={clsx(
                            "flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            onlyUnread ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
                        )}
                    >
                        Pendientes
                    </button>
                    <button 
                        onClick={() => setOnlyUnread(false)}
                        className={clsx(
                            "flex-1 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            !onlyUnread ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
                        )}
                    >
                        Historial
                    </button>
                </div>

                <div className="flex items-center justify-between px-6 py-3 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                    <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Total Detectadas</span>
                    <span className="text-xl font-black text-blue-600 dark:text-blue-400 tabular-nums">{alerts.length}</span>
                </div>
            </div>

            {/* Content List */}
            <div className="space-y-4 min-h-100">
                {loading ? (
                    <div className="h-64 flex flex-col items-center justify-center gap-4 text-slate-300">
                        <RefreshCw size={48} className="animate-spin opacity-20" />
                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">Cargando Data Audit...</p>
                    </div>
                ) : alerts.length === 0 ? (
                    <div className="h-96 flex flex-col items-center justify-center gap-4 bg-white/50 dark:bg-white/5 rounded-3xl border border-dashed border-slate-200 dark:border-white/10">
                        <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-2">
                            <CheckCircle2 size={40} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tight">Todo bajo control</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest font-medium">No hay alertas pendientes para los filtros seleccionados.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {alerts.map((alert) => (
                            <div 
                                key={alert.id}
                                className={clsx(
                                    "group relative p-6 bg-white dark:bg-[#111827] border-2 rounded-3xl transition-all hover:scale-[1.01] hover:shadow-2xl active:scale-95 duration-500",
                                    alert.isRead 
                                        ? "border-slate-100 dark:border-white/10 opacity-80" 
                                        : "border-slate-200 dark:border-white/10 shadow-lg shadow-black/5"
                                )}
                            >
                                <div className="flex items-start justify-between gap-4 mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className={clsx(
                                            "w-12 h-12 rounded-2xl flex items-center justify-center border-2 shadow-inner",
                                            getSeverityStyles(alert.severity)
                                        )}>
                                            <AlertTriangle size={24} />
                                        </div>
                                        <div>
                                            <span className={clsx(
                                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-[0.2em] mb-1.5 inline-block border",
                                                getSeverityStyles(alert.severity)
                                            )}>
                                                {alert.severity}
                                            </span>
                                            <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight uppercase tracking-tight">
                                                {alert.message}
                                            </h4>
                                        </div>
                                    </div>
                                    {!alert.isRead && (
                                        <button 
                                            onClick={() => handleMarkAsRead(alert.id)}
                                            className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all shadow-lg shadow-emerald-500/10"
                                            title="Resolver / Marcar como leído"
                                        >
                                            <CheckCircle2 size={18} />
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 pt-6 border-t border-slate-100 dark:border-white/10">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-400">
                                            <MapPin size={12} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Sucursal</span>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase wrap-break-word">
                                                {branches.find(b => b.id === alert.branchId)?.name || alert.branchId}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-400">
                                            <Clock size={12} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Fecha/Hora</span>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 tabular-nums uppercase">
                                                {alert.createdAt ? formatDateTime(alert.createdAt as Date) : 'N/D'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-400">
                                            <User size={12} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Responsable</span>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase wrap-break-word">
                                                {formatUserName(alert.userName || alert.userId)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-400">
                                            <ShieldAlert size={12} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tipo</span>
                                            <span className="text-[10px] font-bold text-blue-500 uppercase wrap-break-word">
                                                {alert.type}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {alert.metadata && (() => {
                                    const LABELS: Record<string, string> = {
                                        productCode:   'Código producto',
                                        discountType:  'Tipo descuento',
                                        discountValue: 'Descuento aplicado',
                                        originalPrice: 'Precio original',
                                        finalPrice:    'Precio final',
                                        stock:         'Stock actual',
                                        minStock:      'Stock mínimo',
                                        amount:        'Monto',
                                        category:      'Categoría',
                                    };
                                    const HIDDEN = new Set(['productId', 'requiresApproval', 'expenseId', 'discrepancyReason']);
                                    const entries = Object.entries(alert.metadata).filter(([k]) => !HIDDEN.has(k));
                                    if (entries.length === 0) return null;
                                    return (
                                        <div className="mt-5 p-4 bg-slate-50 dark:bg-black/20 rounded-2xl border border-slate-100 dark:border-white/10 space-y-1.5">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Detalle del evento:</span>
                                            {entries.map(([key, value]) => (
                                                <div key={key} className="flex justify-between items-center text-[10px] font-bold">
                                                    <span className="text-slate-500 uppercase">{LABELS[key] ?? key}:</span>
                                                    <span className="text-slate-900 dark:text-white tabular-nums">
                                                        {typeof value === 'number' ? `Bs. ${value.toFixed(2)}` : String(value)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="pt-10 flex items-center justify-center gap-4 opacity-30 grayscale hover:grayscale-0 transition-all duration-1000">
                <div className="h-px flex-1 bg-slate-300 dark:bg-white/10" />
                <div className="flex items-center gap-3">
                    <ShieldAlert size={20} className="text-slate-400" />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.5em]">Centro de Alertas y Auditoría</span>
                </div>
                <div className="h-px flex-1 bg-slate-300 dark:bg-white/10" />
            </div>
        </div>
    );
}
