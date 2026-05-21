'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useRef } from 'react';
import { ShieldAlert, UserCog, ChevronDown, Check, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { logAdminAction } from '@/lib/audit';
import { RoleService } from '@/services/RoleService';
import { Role } from '@/types';

export default function RoleSimulationSelector() {
    const { realRole, role, isSimulating, simulateRole, user } = useAuth();
    const [dynamicRoles, setDynamicRoles] = useState<Role[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Fetch roles on mount
    useEffect(() => {
        const fetchRoles = async () => {
            try {
                const allRoles = await RoleService.getAll();
                // We filter out GERENTE because the user already is a Gerente 
                // and "Mi Rol Real" handles returning to the full state.
                setDynamicRoles(allRoles.filter(r => r.id !== 'GERENTE'));
            } catch (error) {
                console.error("Error fetching roles for simulation:", error);
            }
        };
        fetchRoles();
    }, []);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        
        // Listen for custom events to close from other menus
        const handleCloseMenus = () => setIsOpen(false);
        window.addEventListener('closeLayoutMenus', handleCloseMenus);

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('closeLayoutMenus', handleCloseMenus);
        };
    }, []);

    const toggleMenu = () => {
        if (!isOpen) {
            // Close other menus before opening this one
            window.dispatchEvent(new CustomEvent('closeLayoutMenus'));
        }
        setIsOpen(!isOpen);
    };

    if (realRole !== 'GERENTE') return null;

    const currentRoleName = dynamicRoles.find(r => r.id === role)?.name || role;

    return (
        <div className="relative" ref={menuRef}>
            <button
                type="button"
                onClick={toggleMenu}
                className={clsx(
                    "flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 border shrink-0",
                    isSimulating 
                        ? "bg-yellow-500 border-yellow-600 text-black shadow-lg shadow-yellow-500/20" 
                        : "bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-yellow-500/50"
                )}
                title={isSimulating ? "Simulación de rol activa" : "Simular otro rol"}
            >
                {isSimulating ? <ShieldAlert size={14} /> : <UserCog size={14} />}
                <span className="hidden lg:inline uppercase tracking-wider text-[10px]">
                    {isSimulating ? `Ver como: ${currentRoleName}` : "Simular Rol"}
                </span>
                <ChevronDown size={12} className={clsx("transition-transform opacity-50", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute top-full mt-2 right-0 w-[min(16rem,calc(100vw-0.75rem))] sm:w-64 bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 z-100 max-h-[min(24rem,70dvh)] overflow-y-auto">
                    <div className="p-3 border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/5/50">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-2">
                             Simular Rol
                        </span>
                    </div>
                    <div className="p-2 space-y-1">
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
                                    role === r.id ? "bg-yellow-100 dark:bg-[#FFD700]/10 text-yellow-700 dark:text-[#FFD700]" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
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
                </div>
            )}
        </div>
    );
}
