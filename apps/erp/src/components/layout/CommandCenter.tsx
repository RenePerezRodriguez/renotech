'use client';

import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { Building2, ChevronDown, Check, Globe, ShieldAlert, ShieldCheck, UserCog } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { logAdminAction } from '@/lib/audit';
import { RoleService } from '@/services/RoleService';
import { Role } from '@/types';

type Tab = 'branch' | 'role';

export default function CommandCenter() {
    const {
        currentBranch,
        branches,
        canSwitchBranch,
        isConsolidatedView,
        setBranch,
        setConsolidatedView,
        loading
    } = useBranch();

    const { realRole, role, isSimulating, simulateRole, user } = useAuth();

    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('branch');
    const [dynamicRoles, setDynamicRoles] = useState<Role[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const isGerente = realRole === 'GERENTE';
    const hasBranchSwitch = canSwitchBranch && !loading && branches.length > 1;

    // Fetch roles for simulation
    useEffect(() => {
        if (!isGerente) return;
        RoleService.getAll()
            .then(all => setDynamicRoles(all.filter(r => r.id !== 'GERENTE')))
            .catch(err => console.error('Error fetching roles:', err));
    }, [isGerente]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Listen for close events from other menus
    useEffect(() => {
        const handleCloseMenus = () => setIsOpen(false);
        window.addEventListener('closeLayoutMenus', handleCloseMenus);
        return () => window.removeEventListener('closeLayoutMenus', handleCloseMenus);
    }, []);

    const toggle = () => {
        if (!isOpen) {
            window.dispatchEvent(new CustomEvent('closeLayoutMenus'));
        }
        setIsOpen(!isOpen);
    };

    const currentRoleName = dynamicRoles.find(r => r.id === role)?.name || role;

    // If not HQ and not GERENTE, show static badge
    if (!hasBranchSwitch && !isGerente) {
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
            {/* Trigger Button */}
            <button
                type="button"
                onClick={toggle}
                className={clsx(
                    "flex items-center gap-2 sm:gap-3 px-2.5 sm:px-4 py-2 rounded-xl border transition-all active:scale-95 outline-none shadow-sm group min-w-0 max-w-full",
                    isOpen
                        ? "bg-white dark:bg-[#111827] border-yellow-500 shadow-md shadow-yellow-500/10"
                        : isSimulating
                            ? "bg-yellow-50 dark:bg-yellow-500/10 border-yellow-400 dark:border-yellow-500/50 shadow-sm shadow-yellow-500/10"
                            : "bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:border-yellow-500/50"
                )}
            >
                {/* Branch Icon */}
                <div className={clsx(
                    "p-1.5 rounded-xl transition-all group-hover:scale-110 shadow-sm",
                    isConsolidatedView ? "bg-slate-900 dark:bg-blue-600 text-white" : "bg-yellow-500 text-black"
                )}>
                    {isConsolidatedView ? <Globe size={16} strokeWidth={2.5} /> : <Building2 size={16} strokeWidth={2.5} />}
                </div>

                {/* Branch Name */}
                <div className="hidden lg:flex flex-col items-start min-w-0">
                    <span className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-tight wrap-break-word">
                        {isConsolidatedView ? 'Vista Global' : (currentBranch?.name || 'Sucursal')}
                    </span>
                </div>

                {/* Simulation indicator */}
                {isSimulating && (
                    <>
                        <div className="w-px h-5 bg-yellow-300 dark:bg-yellow-500/40" />
                        <div className="flex items-center gap-1">
                            <ShieldAlert size={13} className="text-yellow-600 dark:text-yellow-400" />
                            <span className="hidden xl:inline text-[9px] font-black uppercase tracking-wider text-yellow-600 dark:text-yellow-400 wrap-break-word">
                                {currentRoleName}
                            </span>
                        </div>
                    </>
                )}

                <ChevronDown
                    size={12}
                    strokeWidth={3}
                    className={clsx("transition-transform text-slate-400 duration-500 shrink-0", isOpen && "rotate-180")}
                />
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] sm:w-72 bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl z-500 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200">
                    {/* Tabs — only show if both sections are available */}
                    {hasBranchSwitch && isGerente && (
                        <div className="flex gap-1 p-1.5 bg-slate-50 dark:bg-white/5/60 border-b border-slate-100 dark:border-white/10">
                            <button
                                onClick={() => setActiveTab('branch')}
                                className={clsx(
                                    "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                    activeTab === 'branch'
                                        ? "bg-white dark:bg-white/5 text-yellow-600 dark:text-yellow-400 shadow-sm"
                                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-gray-700/50"
                                )}
                            >
                                <Building2 size={12} />
                                Sucursales
                            </button>
                            <button
                                onClick={() => setActiveTab('role')}
                                className={clsx(
                                    "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all relative",
                                    activeTab === 'role'
                                        ? "bg-white dark:bg-white/5 text-yellow-600 dark:text-yellow-400 shadow-sm"
                                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-gray-700/50"
                                )}
                            >
                                <UserCog size={12} />
                                Simular Rol
                                {isSimulating && (
                                    <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                                )}
                            </button>
                        </div>
                    )}

                    {/* Branch Tab Content */}
                    {(activeTab === 'branch' || !isGerente) && hasBranchSwitch && (
                        <div className="p-2 max-h-[min(22rem,60vh)] overflow-y-auto custom-scrollbar">
                            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                                Consolidado
                            </div>
                            <button
                                onClick={() => { setConsolidatedView(true); setIsOpen(false); }}
                                className={clsx(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                                    isConsolidatedView
                                        ? "bg-slate-900 text-white dark:bg-blue-600 shadow-lg shadow-black/5"
                                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                                )}
                            >
                                <Globe size={18} strokeWidth={2} className={clsx(isConsolidatedView ? "text-white" : "text-blue-500")} />
                                <span className="text-xs font-bold uppercase tracking-wide flex-1">Vista Global</span>
                                {isConsolidatedView && <Check size={16} strokeWidth={3} />}
                            </button>

                            <div className="h-px bg-slate-100 dark:bg-white/5 my-2 mx-2" />

                            {/* HQ Branch — always first */}
                            {branches.filter(b => b.isHQ).map((branch) => (
                                <button
                                    key={branch.id}
                                    onClick={() => { setBranch(branch.id!); setIsOpen(false); }}
                                    className={clsx(
                                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all mb-1",
                                        !isConsolidatedView && currentBranch?.id === branch.id
                                            ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/10"
                                            : "text-slate-700 dark:text-yellow-100 bg-yellow-50 dark:bg-yellow-500/10 hover:bg-yellow-100 dark:hover:bg-yellow-500/20 border border-yellow-200 dark:border-yellow-500/20"
                                    )}
                                >
                                    <Building2 size={18} strokeWidth={2.5} className={clsx(!isConsolidatedView && currentBranch?.id === branch.id ? "text-black" : "text-yellow-600 dark:text-yellow-400")} />
                                    <span className="text-xs font-black uppercase tracking-tight wrap-break-word flex-1">{branch.name}</span>
                                    {!isConsolidatedView && currentBranch?.id === branch.id && <Check size={16} strokeWidth={3} />}
                                </button>
                            ))}

                            <div className="h-px bg-slate-100 dark:bg-white/5 my-2 mx-2" />

                            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                                Sucursales
                            </div>
                            <div className="space-y-0.5 px-1 pb-1">
                                {branches.filter(b => !b.isHQ).map((branch) => (
                                    <button
                                        key={branch.id}
                                        onClick={() => { setBranch(branch.id!); setIsOpen(false); }}
                                        className={clsx(
                                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                                            !isConsolidatedView && currentBranch?.id === branch.id
                                                ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/10"
                                                : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                                        )}
                                    >
                                        <Building2 size={18} strokeWidth={2} className={clsx(!isConsolidatedView && currentBranch?.id === branch.id ? "text-black" : "text-slate-400")} />
                                        <span className="text-xs font-bold uppercase tracking-tight wrap-break-word flex-1">{branch.name}</span>
                                        {!isConsolidatedView && currentBranch?.id === branch.id && <Check size={16} strokeWidth={3} />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Role Simulation Tab Content */}
                    {activeTab === 'role' && isGerente && (
                        <div className="p-2 max-h-[min(22rem,60vh)] overflow-y-auto custom-scrollbar">
                            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                                Simular Rol
                            </div>
                            <button
                                onClick={() => {
                                    simulateRole(null);
                                    logAdminAction(user?.uid || '?', user?.email || '?', 'STOP_ROLE_SIMULATION', 'self', 'HQ', 'Detuvo simulación de rol');
                                    setIsOpen(false);
                                }}
                                className={clsx(
                                    "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors",
                                    !isSimulating
                                        ? "bg-yellow-100 dark:bg-[#FFD700]/10 text-yellow-700 dark:text-[#FFD700]"
                                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <ShieldCheck size={14} />
                                    <span className="text-xs font-bold uppercase tracking-wider">Mi Rol Real</span>
                                </div>
                                {!isSimulating && <Check size={14} />}
                            </button>

                            <div className="h-px bg-slate-100 dark:bg-white/5 mx-2 my-1" />

                            {dynamicRoles.map(r => (
                                <button
                                    key={r.id}
                                    onClick={() => {
                                        simulateRole(r.id!);
                                        logAdminAction(user?.uid || '?', user?.email || '?', 'START_ROLE_SIMULATION', r.id!, 'HQ', `Simulando rol: ${r.name}`);
                                        setIsOpen(false);
                                    }}
                                    className={clsx(
                                        "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors",
                                        role === r.id
                                            ? "bg-yellow-100 dark:bg-[#FFD700]/10 text-yellow-700 dark:text-[#FFD700]"
                                            : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                        <span className="text-xs font-bold">{r.name}</span>
                                    </div>
                                    {role === r.id && <Check size={14} />}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* For GERENTE without branch switching — show role sim directly */}
                    {!hasBranchSwitch && isGerente && (
                        <div className="p-2 max-h-[min(22rem,60vh)] overflow-y-auto custom-scrollbar">
                            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                                Simular Rol
                            </div>
                            <button
                                onClick={() => {
                                    simulateRole(null);
                                    logAdminAction(user?.uid || '?', user?.email || '?', 'STOP_ROLE_SIMULATION', 'self', 'HQ', 'Detuvo simulación de rol');
                                    setIsOpen(false);
                                }}
                                className={clsx(
                                    "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors",
                                    !isSimulating
                                        ? "bg-yellow-100 dark:bg-[#FFD700]/10 text-yellow-700 dark:text-[#FFD700]"
                                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <ShieldCheck size={14} />
                                    <span className="text-xs font-bold uppercase tracking-wider">Mi Rol Real</span>
                                </div>
                                {!isSimulating && <Check size={14} />}
                            </button>

                            <div className="h-px bg-slate-100 dark:bg-white/5 mx-2 my-1" />

                            {dynamicRoles.map(r => (
                                <button
                                    key={r.id}
                                    onClick={() => {
                                        simulateRole(r.id!);
                                        logAdminAction(user?.uid || '?', user?.email || '?', 'START_ROLE_SIMULATION', r.id!, 'HQ', `Simulando rol: ${r.name}`);
                                        setIsOpen(false);
                                    }}
                                    className={clsx(
                                        "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors",
                                        role === r.id
                                            ? "bg-yellow-100 dark:bg-[#FFD700]/10 text-yellow-700 dark:text-[#FFD700]"
                                            : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                        <span className="text-xs font-bold">{r.name}</span>
                                    </div>
                                    {role === r.id && <Check size={14} />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
