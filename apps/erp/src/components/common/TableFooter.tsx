'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

interface TableFooterProps {
    totalItems: number;
    itemsPerPage: number;
    onChangeItemsPerPage: (val: number) => void;
    currentPage: number;
    onChangePage: (val: number | ((prev: number) => number)) => void;
    totalPages: number;
    label?: string;
    className?: string;
}

export default function TableFooter({
    totalItems,
    itemsPerPage,
    onChangeItemsPerPage,
    currentPage,
    onChangePage,
    totalPages,
    label = 'Registros',
    className
}: TableFooterProps) {
    return (
        <div className={clsx(
            "p-3 sm:p-4 border-t border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-black/20 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 min-w-0 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2",
            className
        )}>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3 w-full sm:w-auto min-w-0">
                <div className="px-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl shadow-sm shrink-0">
                    <span className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-[0.1em]">{totalItems} {label}</span>
                </div>
                <span className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] sm:tracking-[0.2em] opacity-40 text-center sm:text-left leading-tight max-sm:w-full max-sm:basis-full">
                    Auditoría en Tiempo Real
                </span>
            </div>

            <div className="flex flex-col gap-3 w-full min-w-0 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                <div className="relative group/sel w-full sm:w-auto shrink-0">
                    <select
                        value={itemsPerPage}
                        onChange={(e) => onChangeItemsPerPage(Number(e.target.value))}
                        className="h-9 w-full sm:w-auto min-w-0 max-w-full bg-white dark:bg-white/5 border-2 border-yellow-500/20 group-hover/sel:border-yellow-500 transition-all rounded-xl pl-4 pr-10 text-[10px] font-black dark:text-white focus:outline-none focus:ring-1 focus:ring-yellow-500 appearance-none cursor-pointer uppercase tracking-widest shadow-sm"
                    >
                        <option value={10} className="bg-white dark:bg-white/5 text-slate-900 dark:text-white">10 Entradas</option>
                        <option value={20} className="bg-white dark:bg-white/5 text-slate-900 dark:text-white">20 Entradas</option>
                        <option value={50} className="bg-white dark:bg-white/5 text-slate-900 dark:text-white">50 Entradas</option>
                        <option value={100} className="bg-white dark:bg-white/5 text-slate-900 dark:text-white">100 Entradas</option>
                        <option value={200} className="bg-white dark:bg-white/5 text-slate-900 dark:text-white">200 Entradas</option>
                        <option value={500} className="bg-white dark:bg-white/5 text-slate-900 dark:text-white">500 Entradas</option>
                    </select>
                    <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-yellow-600 dark:text-[#FFD700] pointer-events-none" />
                </div>

                <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 shrink-0 self-center mx-0 sm:mx-1" />

                <div className="flex items-stretch sm:items-center justify-center gap-2 w-full sm:w-auto min-w-0">
                    <button
                        type="button"
                        onClick={() => onChangePage((p: number) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="h-9 flex-1 sm:flex-none min-w-0 max-sm:px-3 px-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 disabled:opacity-20 hover:bg-slate-50 dark:hover:bg-white/10 transition-all active:scale-90"
                    >
                        Anterior
                    </button>
                    <div className="h-9 px-3 sm:px-5 flex items-center justify-center shrink-0 bg-yellow-500/5 border border-yellow-500/10 rounded-xl">
                        <span className="text-[10px] font-black text-yellow-600 dark:text-[#FFD700] tracking-tighter tabular-nums whitespace-nowrap">
                            {currentPage} <span className="opacity-30 mx-1.5">/</span> {totalPages || 1}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => onChangePage((p: number) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages || totalPages === 0}
                        className="h-9 flex-1 sm:flex-none min-w-0 max-sm:px-3 px-5 bg-slate-900 dark:bg-white/5 text-white dark:text-slate-300 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] disabled:opacity-20 hover:bg-black dark:hover:bg-white/10 transition-all active:scale-90"
                    >
                        Siguiente
                    </button>
                </div>
            </div>
        </div>
    );
}
