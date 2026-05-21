'use client';

import { clsx } from 'clsx';
import React from 'react';

interface KpiCardProps {
    label: string;
    value: number | string;
    color?: 'gray' | 'green' | 'red' | 'gold' | 'blue' | 'slate' | 'amber' | 'purple';
    icon?: React.ElementType;
    secondaryLabel?: string;
    secondaryValue?: number | string;
    highlight?: boolean;
    prefix?: string;
    progress?: number;
    children?: React.ReactNode;
    delay?: number; // entrance animation delay in ms
}

export default function KpiCard({
    label,
    value,
    color = 'gray',
    icon: Icon,
    secondaryLabel,
    secondaryValue,
    highlight,
    prefix,
    progress,
    children,
    delay
}: KpiCardProps) {
    const isGold = color === 'gold';
    const isSlate = color === 'slate';
    const isBlue = color === 'blue';
    const isAmber = color === 'amber';
    const isGreen = color === 'green';
    const isRed = color === 'red';
    const isPurple = color === 'purple';

    return (
        <div
            className={clsx(
                "p-4 sm:p-5 rounded-2xl border transition-all duration-500 group relative overflow-hidden min-w-0",
                isGold
                    ? "bg-slate-900 border-white/5 shadow-xl shadow-black/20 hover:border-yellow-500/30"
                    : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 shadow-sm hover:shadow-md",
                highlight && "ring-1 ring-yellow-500/20"
            )}
            style={delay !== undefined ? {
                animation: `card-enter 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}ms backwards`
            } : undefined}
        >
            {highlight && (
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-yellow-500/5 blur-3xl rounded-full" />
            )}
            
            <div className="flex items-center justify-between mb-4">
                <div className={clsx(
                    "flex items-center gap-2",
                    isGold ? "text-white/30 group-hover:text-yellow-500/50" : "text-slate-400 dark:text-slate-500"
                )}>
                    {Icon && <Icon size={14} strokeWidth={2.5} />}
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">{label}</span>
                </div>
            </div>

            <div className="flex flex-col gap-1 relative z-10">
                <div className={clsx(
                    "text-2xl font-black tabular-nums tracking-tighter",
                    isGold ? "text-white dark:text-[#FFD700]" : 
                    isBlue ? "text-blue-600 dark:text-blue-400" :
                    isAmber ? "text-amber-600 dark:text-amber-500" :
                    isGreen ? "text-emerald-600 dark:text-emerald-500" :
                    isRed ? "text-rose-600 dark:text-rose-500" :
                    isPurple ? "text-purple-600 dark:text-purple-400" :
                    isSlate ? "text-slate-600 dark:text-slate-400" :
                    "text-slate-900 dark:text-white"
                )}>
                    {prefix && <span className="text-xs mr-1 opacity-40 uppercase font-semibold">{prefix}</span>}
                    {typeof value === 'number' ? value.toLocaleString(undefined, { minimumFractionDigits: value % 1 === 0 ? 0 : 2 }) : value}
                </div>

                {progress !== undefined && (
                    <div className="mt-4 w-full h-1 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                        <div 
                            className={clsx(
                                "h-full transition-all duration-1000",
                                isGold ? "bg-yellow-500" :
                                isBlue ? "bg-blue-500" :
                                isGreen ? "bg-emerald-500" :
                                isRed ? "bg-rose-500" :
                                isPurple ? "bg-purple-500" :
                                isAmber ? "bg-amber-500" :
                                isSlate ? "bg-slate-500" :
                                "bg-slate-500"
                            )}
                            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                        />
                    </div>
                )}
                
                {secondaryLabel && secondaryValue !== undefined && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10 flex justify-between items-center">
                        <span className={clsx(
                            "text-[8px] font-black uppercase tracking-widest",
                            isGold ? "text-white/40" : "text-slate-400"
                        )}>{secondaryLabel}</span>
                        <span className={clsx(
                            "text-[10px] font-black tabular-nums",
                            isGold ? "text-white/80" : "text-slate-600 dark:text-slate-400"
                        )}>
                            {typeof secondaryValue === 'number' ? secondaryValue.toLocaleString() : secondaryValue}
                        </span>
                    </div>
                )}
                {children && (
                    <div className="mt-4 relative z-20">
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
}
