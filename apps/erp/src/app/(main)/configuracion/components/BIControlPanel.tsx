'use client';

import { useState } from 'react';
import { InventoryService } from '@/services/InventoryService';
import { AnalyticsService } from '@/services/AnalyticsService';
import { BarChart3, PieChart, RefreshCw, CheckCircle2, Loader2, Database, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatTime } from '@/utils/dateHelpers';

export default function BIControlPanel() {
    const { user, branchId, role } = useAuth();
    const [loadingABC, setLoadingABC] = useState(false);
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(null);

    const isGerente = role === 'GERENTE';

    const handleABCUpdate = async () => {
        if (!branchId) return;
        setLoadingABC(true);
        try {
            await InventoryService.recalculateABC(branchId);
            setLastSync(formatTime(new Date()));
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Error al recalcular ABC";
            toast.error(msg);
        } finally {
            setLoadingABC(false);
        }
    };

    const handleDailySummary = async () => {
        if (!branchId) return;
        setLoadingAnalytics(true);
        try {
            await AnalyticsService.generateDailySummary(branchId, user?.uid || '');
            setLastSync(formatTime(new Date()));
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Error al generar analítica";
            toast.error(msg);
        } finally {
            setLoadingAnalytics(false);
        }
    };

    if (!isGerente) return null;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 border border-indigo-500/20">
                    <TrendingUp size={20} />
                </div>
                <div>
                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">Motor de Inteligencia de Negocios (BI)</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Control maestro de analítica y rotación</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ABC Machine */}
                <div className="p-6 bg-white dark:bg-[#111827] rounded-3xl border border-slate-200 dark:border-white/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
                        <PieChart size={120} />
                    </div>
                    
                    <div className="relative z-10 flex flex-col h-full">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="px-2 py-0.5 rounded-xl bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-widest border border-emerald-500/20">Optimización de Stock</span>
                        </div>
                        
                        <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Motor de Clasificación ABC</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold leading-relaxed mb-6 uppercase">
                            Analiza el volumen de transacciones de los últimos 3 meses para reclasificar productos en categorías A (Alta rotación), B (Media) y C (Baja).
                        </p>

                        <button
                            onClick={handleABCUpdate}
                            disabled={loadingABC}
                            className="mt-auto h-12 flex items-center justify-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                        >
                            {loadingABC ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                            Recalcular Estrategia ABC
                        </button>
                    </div>
                </div>

                {/* Analytics BI */}
                <div className="p-6 bg-white dark:bg-[#111827] rounded-3xl border border-slate-200 dark:border-white/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
                        <BarChart3 size={120} />
                    </div>

                    <div className="relative z-10 flex flex-col h-full">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="px-2 py-0.5 rounded-xl bg-indigo-500/10 text-indigo-500 text-[8px] font-black uppercase tracking-widest border border-indigo-500/20">Cierre Financiero</span>
                        </div>

                        <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Consolidación de Cierre Diario</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold leading-relaxed mb-6 uppercase">
                            Genera el reporte atómico de ingresos, costos históricos y margen neto de la jornada. Indispensable para auditorías de gerencia.
                        </p>

                        <button
                            onClick={handleDailySummary}
                            disabled={loadingAnalytics}
                            className="mt-auto h-12 flex items-center justify-center gap-2 bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-[1.02] shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
                        >
                            {loadingAnalytics ? <Loader2 className="animate-spin" size={16} /> : <Database size={16} />}
                            Disparar Cierre de Analítica
                        </button>
                    </div>
                </div>
            </div>

            {lastSync && (
                <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl flex items-center justify-between border border-slate-200 dark:border-white/10 animate-in fade-in duration-500">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="text-emerald-500" size={16} />
                        <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Sincronización de motor completada</span>
                    </div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase font-mono tracking-widest">T: {lastSync}</span>
                </div>
            )}
        </div>
    );
}
