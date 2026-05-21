'use client';

import React from 'react';
import { Search, ChevronDown, X, LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

interface FilterOption {
    label: string;
    value: string;
}

interface FilterDropdown {
    id: string;
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (val: string) => void;
    icon?: LucideIcon;
}

interface DateRange {
    start: string;
    end: string;
    onStartChange: (val: string) => void;
    onEndChange: (val: string) => void;
}

interface FilterBarProps {
    searchTerm: string;
    onSearchChange: (val: string) => void;
    searchPlaceholder?: string;
    filters?: FilterDropdown[];
    dateRange?: DateRange;
    onClear: () => void;
    isDirty: boolean;
    className?: string;
}

export default function FilterBar({
    searchTerm,
    onSearchChange,
    searchPlaceholder = "Buscar...",
    filters = [],
    dateRange,
    onClear,
    isDirty,
    className
}: FilterBarProps) {
    return (
        <div className={clsx(
            "bg-white dark:bg-[#111827] p-1 rounded-[20px] border border-slate-200 dark:border-white/10 shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-1 group transition-all duration-300 animate-in fade-in slide-in-from-top-1 min-w-0 w-full",
            className
        )}>
            {/* Search Input */}
            <div className="flex-1 w-full relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-yellow-500 transition-colors" size={14} />
                <input
                    type="text"
                    placeholder={searchPlaceholder}
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full h-11 bg-transparent border-none rounded-xl pl-11 pr-4 text-[11px] font-bold dark:text-white placeholder:text-slate-400 focus:ring-0"
                />
            </div>

            {(filters.length > 0 || dateRange) && <div className="h-6 w-px bg-slate-200 dark:bg-white/10 hidden md:block mx-1" />}

            <div className="flex flex-wrap items-center gap-1 w-full md:w-auto p-1 min-w-0">
                {/* Dynamic Filters */}
                {filters.map((filter) => (
                    <div key={filter.id} className="relative group/field">
                        <select
                            value={filter.value}
                            onChange={(e) => filter.onChange(e.target.value)}
                            className="h-9 min-w-0 max-w-full w-full sm:w-auto sm:min-w-27.5 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-xl pl-3 pr-8 text-[9px] font-black uppercase tracking-widest focus:ring-1 focus:ring-yellow-500 appearance-none cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                        >
                            <option value="all" className="bg-white dark:bg-white/5 text-slate-900 dark:text-white">{filter.label}: Todos</option>
                            {filter.options.map((opt, index) => (
                                <option 
                                    key={`${filter.id}-${opt.value}-${index}`} 
                                    value={opt.value}
                                    className="bg-white dark:bg-white/5 text-slate-900 dark:text-white font-bold"
                                >
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover/field:text-yellow-500 transition-colors" />
                    </div>
                ))}

                {/* Date Range */}
                {dateRange && (
                    <div className="flex items-center gap-1 bg-slate-50 dark:bg-black/20 rounded-xl p-1 border border-slate-100 dark:border-white/10 h-9">
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => dateRange.onStartChange(e.target.value)}
                            className="h-full bg-transparent border-none p-0 px-2 text-[9px] font-bold dark:text-slate-300 focus:ring-0 uppercase cursor-pointer"
                            title="Fecha Inicio"
                        />
                        <div className="w-2 h-px bg-slate-300 dark:bg-white/5" />
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => dateRange.onEndChange(e.target.value)}
                            className="h-full bg-transparent border-none p-0 px-2 text-[9px] font-bold dark:text-slate-300 focus:ring-0 uppercase cursor-pointer"
                            title="Fecha Fin"
                        />
                    </div>
                )}

                {/* Clear Button */}
                {isDirty && (
                    <button
                        onClick={onClear}
                        className="w-9 h-9 flex items-center justify-center bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all active:scale-90 animate-in zoom-in-50 duration-300"
                        title="Limpiar Filtros"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}
