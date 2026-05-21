'use client';

import { useEffect, useState } from 'react';
import { InventoryService } from '@/services/InventoryService';
import { useBranch } from '@/contexts/BranchContext';
import { Product } from '@/types';
import { Package, Filter, Info, RefreshCw } from 'lucide-react';

interface AbcDistributionCardProps {
    products: Product[];
}

export default function AbcDistributionCard({ products }: AbcDistributionCardProps) {
    const { currentBranch, isConsolidatedView } = useBranch();
    const [recalculating, setRecalculating] = useState(false);

    // Recalcular ABC al montar (background, no bloquea)
    useEffect(() => {
        if (!currentBranch?.id) return;
        setRecalculating(true);
        InventoryService.recalculateABC(currentBranch.id)
            .catch(() => {})
            .finally(() => setRecalculating(false));
    }, [currentBranch?.id]);

    // 1. Calculate distribution
    const total = products.length || 1;
    const aItems = products.filter(p => p.abcClassLocal === 'A').length;
    const bItems = products.filter(p => p.abcClassLocal === 'B').length;
    const cItems = products.filter(p => p.abcClassLocal === 'C').length;

    const stats = [
        { 
            label: 'CLASE A (CRÍTICO)', 
            count: aItems, 
            percentage: ((aItems / total) * 100).toFixed(0), 
            color: 'bg-yellow-500',
            textColor: 'text-yellow-600',
            desc: '20% de items que generan el 80% del valor/movimiento.' 
        },
        { 
            label: 'CLASE B (CONTROL)', 
            count: bItems, 
            percentage: ((bItems / total) * 100).toFixed(0), 
            color: 'bg-slate-400',
            textColor: 'text-slate-500',
            desc: '30% de items con rotación media.' 
        },
        { 
            label: 'CLASE C (RESERVA)', 
            count: cItems, 
            percentage: ((cItems / total) * 100).toFixed(0), 
            color: 'bg-slate-200 dark:bg-white/10',
            textColor: 'text-slate-300',
            desc: '50% de items con rotación lenta o stock de seguridad.' 
        },
    ];

    return (
        <div className="bg-white dark:bg-[#111827] rounded-3xl border border-slate-200 dark:border-white/10 p-5 shadow-xl flex flex-col h-full">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Filter size={14} className="text-yellow-500" />
                        Distribución ABC
                    </h2>
                    <p className="text-lg font-black text-slate-900 dark:text-white mt-1 uppercase tracking-tighter">Salud de Rotación</p>
                </div>
                <div className="tooltip" data-tip="El análisis de Pareto (ABC) ayuda a priorizar el conteo físico y la reposición.">
                    <Info size={16} className="text-slate-300 cursor-help" />
                </div>
            </div>

            <div className="flex-1 flex flex-col justify-center space-y-6">
                {/* Visual Bar Plan */}
                <div className="h-4 w-full bg-slate-100 dark:bg-white/5 rounded-full flex overflow-hidden">
                    {stats.map((s, i) => (
                        <div 
                            key={i} 
                            style={{ width: `${s.percentage}%` }} 
                            className={`${s.color} transition-all duration-1000 border-r border-white/20 last:border-0`} 
                        />
                    ))}
                </div>

                {/* Legends */}
                <div className="grid grid-cols-1 gap-4">
                    {stats.map((s, i) => (
                        <div key={i} className="flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${s.color}`} />
                                <div>
                                    <p className={`text-[10px] font-black ${s.textColor} uppercase tracking-widest`}>{s.label}</p>
                                    <p className="text-[9px] text-slate-400 font-bold max-w-45 group-hover:text-slate-500 transition-colors">{s.desc}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-black text-slate-900 dark:text-white">{s.percentage}%</p>
                                <p className="text-[9px] text-slate-400 font-bold uppercase">{s.count} ITEMS</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Package size={14} className="text-slate-300" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Total Items Auditados:</span>
                </div>
                <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase">{products.length}</span>
            </div>
        </div>
    );
}
