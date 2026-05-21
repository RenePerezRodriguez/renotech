'use client';

import { useBranch } from '@/contexts/BranchContext';
import { Building2, ChevronDown, Check, Globe } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';

export default function BranchSelector() {
    const {
        currentBranch,
        branches,
        canSwitchBranch,
        isConsolidatedView,
        setBranch,
        setConsolidatedView,
        loading
    } = useBranch();

    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Don't show if user can't switch branches or no branches loaded
    if (!canSwitchBranch || loading || branches.length <= 1) {
        if (currentBranch) {
            return (
                <div className="flex items-center gap-2 sm:gap-3 px-3 py-2 sm:px-5 sm:py-2.5 bg-slate-100/50 dark:bg-white/5 rounded-2xl border border-slate-200/50 dark:border-white/10 transition-all min-w-0 max-w-full">
                    <div className="p-1 px-2 rounded-xl bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] shrink-0">
                        Sucursal
                    </div>
                    <span className="text-[11px] sm:text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider wrap-break-word min-w-0">
                        {currentBranch.name}
                    </span>
                </div>
            );
        }
        return null;
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "flex items-center gap-2 sm:gap-3 px-2.5 sm:px-4 py-2 rounded-xl border transition-all active:scale-95 outline-none shadow-sm group min-w-0 max-w-full",
                    isOpen
                        ? "bg-white dark:bg-[#111827] border-yellow-500 shadow-md shadow-yellow-500/10"
                        : "bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:border-yellow-500/50"
                )}
            >
                <div className={clsx(
                    "p-1.5 rounded-xl transition-all group-hover:scale-110 shadow-sm",
                    isConsolidatedView ? "bg-slate-900 dark:bg-blue-600 text-white" : "bg-yellow-500 text-black"
                )}>
                    {isConsolidatedView ? <Globe size={16} strokeWidth={2.5} /> : <Building2 size={16} strokeWidth={2.5} />}
                </div>

                <div className="hidden lg:flex flex-col items-start min-w-25">
                    <span className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-tight wrap-break-word">
                        {isConsolidatedView ? "Todas las Sedes" : (currentBranch?.name || "Sucursal")}
                    </span>
                </div>

                <ChevronDown
                    size={12}
                    strokeWidth={3}
                    className={clsx("transition-transform text-slate-400 duration-500", isOpen && "rotate-180")}
                />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-[min(18rem,calc(100vw-1.5rem))] sm:w-64 bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl z-500 p-2 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 max-h-[min(24rem,70vh)] overflow-y-auto custom-scrollbar">
                    <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Consolidado</div>

                    {/* Consolidated View Option */}
                    <button
                        onClick={() => {
                            setConsolidatedView(true);
                            setIsOpen(false);
                        }}
                        className={clsx(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group/btn relative",
                            isConsolidatedView
                                ? "bg-slate-900 text-white dark:bg-blue-600 shadow-lg shadow-black/5"
                                : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                        )}
                    >
                        <Globe size={18} strokeWidth={2} className={clsx(isConsolidatedView ? "text-white" : "text-blue-500")} />
                        <div className="flex-1">
                            <span className="text-xs font-bold uppercase tracking-wide">Vista Global</span>
                        </div>
                        {isConsolidatedView && <Check size={16} strokeWidth={3} />}
                    </button>

                    <div className="h-px bg-slate-100 dark:bg-white/5 my-2 mx-2" />

                    <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Sucursales</div>

                    <div className="max-h-64 overflow-y-auto space-y-0.5 custom-scrollbar px-1 pb-1">
                        {branches.map((branch) => (
                            <button
                                key={branch.id}
                                onClick={() => {
                                    setBranch(branch.id!);
                                    setIsOpen(false);
                                }}
                                className={clsx(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group/btn",
                                    !isConsolidatedView && currentBranch?.id === branch.id
                                        ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/10"
                                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                                )}
                            >
                                <Building2 size={18} strokeWidth={2} className={clsx(!isConsolidatedView && currentBranch?.id === branch.id ? "text-black" : "text-slate-400")} />
                                <div className="flex-1">
                                    <span className="text-xs font-bold uppercase tracking-tight wrap-break-word block">{branch.name}</span>
                                </div>
                                {!isConsolidatedView && currentBranch?.id === branch.id && (
                                    <Check size={16} strokeWidth={3} />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
