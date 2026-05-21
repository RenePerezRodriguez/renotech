'use client';

import React from 'react';
import { LucideIcon, ArrowLeft } from 'lucide-react';
import { clsx } from 'clsx';

export interface Action {
    label: string;
    subtitle?: string;
    onClick: () => void;
    icon?: LucideIcon;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    disabled?: boolean;
    dataTourId?: string;
}

export interface ModuleHeaderProps {
    title: string;
    subtitle: string;
    icon: LucideIcon;
    actions?: Action[];
    className?: string;
    onBack?: () => void;
    badge?: string;
    variant?: 'default' | 'solid' | 'integrated';
}

export default function ModuleHeader({
    title,
    subtitle,
    icon: Icon,
    actions = [],
    className,
    onBack,
    badge,
    variant = 'solid'
}: ModuleHeaderProps) {
    return (
        <div className={clsx(
            "flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 min-w-0 transition-all animate-in fade-in slide-in-from-top-2 duration-500",
            variant === 'solid'
                ? "bg-slate-900 dark:bg-[#111827] p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 shadow-2xl"
                : variant === 'integrated'
                    ? "bg-white dark:bg-background px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 dark:border-white/10 shrink-0"
                    : "border-b border-slate-200 dark:border-white/10 pb-4 sm:pb-6",
            className
        )}>
            <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0 flex-1">
                {onBack && (
                    <button
                        onClick={onBack}
                        className={clsx(
                            "p-2.5 rounded-xl border transition-all active:scale-95 shadow-sm",
                            variant === 'solid'
                                ? "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                : variant === 'integrated'
                                    ? "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                    : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        )}
                        title="Volver"
                    >
                        <ArrowLeft size={18} strokeWidth={3} />
                    </button>
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
                        <Icon size={20} strokeWidth={3} className="text-yellow-500 shrink-0" />
                        <h1 className={clsx(
                            "text-lg sm:text-xl font-black uppercase tracking-widest wrap-break-word min-w-0",
                            variant === 'solid' ? "text-white" : "text-slate-900 dark:text-white"
                        )}>{title}</h1>
                        {badge && (
                            <span className={clsx(
                                "text-[9px] px-2.5 py-1 rounded-xl border font-black tracking-widest uppercase",
                                variant === 'solid'
                                    ? "bg-white/10 border-white/10 text-white/80"
                                    : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10"
                            )}>
                                {badge}
                            </span>
                        )}
                    </div>
                    <p className={clsx(
                        "text-[10px] font-bold tracking-tight wrap-break-word",
                        variant === 'solid' ? "text-white/60" : "text-slate-500 dark:text-slate-400"
                    )}>{subtitle}</p>
                </div>
            </div>

            <div className="flex flex-col min-[420px]:flex-row min-[420px]:flex-wrap w-full md:w-auto gap-2 md:gap-2.5 md:justify-end shrink-0">
                {actions.map((action, idx) => (
                    <button
                        key={idx}
                        onClick={action.onClick}
                        disabled={action.disabled}
                        {...(action.dataTourId ? { 'data-tour': action.dataTourId } : {})}
                        className={clsx(
                            "flex items-center justify-center gap-2 min-h-10 px-4 py-2.5 sm:py-0 sm:h-10 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 w-full min-[420px]:w-auto",
                            (action.variant === 'primary' || !action.variant)
                                ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/10 hover:bg-yellow-400"
                                : action.variant === 'secondary'
                                    ? clsx(
                                        "border transition-all",
                                        variant === 'solid'
                                            ? "bg-white/5 border-white/10 text-white hover:bg-white/10 shadow-lg shadow-black/10"
                                            : "bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10"
                                    )
                                    : action.variant === 'danger'
                                        ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20 hover:bg-rose-600"
                                        : clsx(
                                            "bg-transparent transition-colors",
                                            variant === 'solid' ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                                        )
                        )}
                    >
                        {action.icon && <action.icon size={14} strokeWidth={3} className="shrink-0" />}
                        {action.subtitle ? (
                            <span className="flex flex-col items-start leading-none gap-0.5">
                                <span>{action.label}</span>
                                <span className="text-[7px] font-bold normal-case tracking-normal opacity-60">{action.subtitle}</span>
                            </span>
                        ) : action.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
