'use client';

import { Zap, ChevronRight, LucideIcon } from 'lucide-react';
import clsx from 'clsx';

export interface PendingChip {
    count: number;
    label: string;
    icon: LucideIcon;
    color: 'amber' | 'rose' | 'blue' | 'emerald' | 'purple';
    onClick: () => void;
}

interface PendingBannerProps {
    chips: PendingChip[];
    className?: string;
}

const COLOR_MAP: Record<PendingChip['color'], { chip: string; icon: string; badge: string }> = {
    amber:   { chip: 'bg-amber-50  dark:bg-amber-500/10  text-amber-700  dark:text-amber-300  border-amber-200  dark:border-amber-500/20  hover:bg-amber-100  dark:hover:bg-amber-500/20',   icon: 'text-amber-500',  badge: 'bg-amber-500'  },
    rose:    { chip: 'bg-rose-50   dark:bg-rose-500/10   text-rose-700   dark:text-rose-300   border-rose-200   dark:border-rose-500/20   hover:bg-rose-100   dark:hover:bg-rose-500/20',     icon: 'text-rose-500',   badge: 'bg-rose-500'   },
    blue:    { chip: 'bg-blue-50   dark:bg-blue-500/10   text-blue-700   dark:text-blue-300   border-blue-200   dark:border-blue-500/20   hover:bg-blue-100   dark:hover:bg-blue-500/20',     icon: 'text-blue-500',   badge: 'bg-blue-500'   },
    emerald: { chip: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20', icon: 'text-emerald-500', badge: 'bg-emerald-500' },
    purple:  { chip: 'bg-purple-50 dark:bg-purple-500/10  text-purple-700 dark:text-purple-300  border-purple-200 dark:border-purple-500/20  hover:bg-purple-100 dark:hover:bg-purple-500/20',  icon: 'text-purple-500', badge: 'bg-purple-500'  },
};

export default function PendingBanner({ chips, className }: PendingBannerProps) {
    const visible = chips.filter(c => c.count > 0);
    if (visible.length === 0) return null;

    return (
        <div className={clsx(
            'flex flex-wrap items-center gap-2 px-4 py-3 rounded-2xl',
            'bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/10',
            'animate-in fade-in slide-in-from-top-2 duration-300',
            className
        )}>
            {/* Label izquierdo */}
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 shrink-0">
                <Zap size={12} strokeWidth={2.5} className="text-amber-500" />
                <span className="text-[9px] font-black uppercase tracking-[0.2em]">Pendiente</span>
            </div>

            <div className="w-px h-4 bg-slate-200 dark:bg-white/10 shrink-0" />

            {/* Chips */}
            <div className="flex flex-wrap gap-2">
                {visible.map((chip, i) => {
                    const c = COLOR_MAP[chip.color];
                    const Icon = chip.icon;
                    return (
                        <button
                            key={i}
                            onClick={chip.onClick}
                            className={clsx(
                                'flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all active:scale-95',
                                c.chip
                            )}
                        >
                            <Icon size={11} className={c.icon} strokeWidth={2.5} />
                            <span className={clsx('min-w-4 h-4 px-1 rounded-full text-white text-[9px] font-black flex items-center justify-center', c.badge)}>
                                {chip.count > 99 ? '99+' : chip.count}
                            </span>
                            {chip.label}
                            <ChevronRight size={10} strokeWidth={3} className="opacity-60" />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
