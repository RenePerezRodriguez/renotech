'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { User, Moon, Sun, LogOut, UserCircle, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';

export default function UserProfileMenu() {
    const { user, userName, role, roleName, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

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

    const handleProfileClick = () => {
        router.push('/perfil');
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={menuRef}>
            {/* Trigger Button */}
            <button
                onClick={toggleMenu}
                className="flex items-center gap-3 p-1 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 hover:border-yellow-500/50 transition-all active:scale-95 group"
            >
                <div className="text-right hidden lg:block pl-3">
                    <p className="text-[11px] font-bold text-slate-900 dark:text-white leading-tight uppercase tracking-tight">
                        {userName || 'Admin'}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                        {roleName || role || 'Usuario'}
                    </p>
                </div>
                
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black transition-all group-hover:shadow-lg group-hover:shadow-yellow-500/10">
                    <User size={14} strokeWidth={2.5} />
                </div>
                
                <div className="pr-1 hidden sm:block">
                    <ChevronDown 
                        size={12} 
                        strokeWidth={3}
                        className={clsx(
                            "text-slate-400 transition-transform duration-500", 
                            isOpen && "rotate-180"
                        )} 
                    />
                </div>
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full mt-2 right-0 w-[min(16rem,calc(100vw-0.75rem))] sm:w-64 max-h-[min(28rem,85dvh)] overflow-y-auto overscroll-contain bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 z-[100]">
                    {/* Header Info */}
                    <div className="p-5 pb-4 bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/10">
                        <div className="flex items-center gap-3 mb-3">
                             <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-[#FFD700] flex items-center justify-center text-white dark:text-black font-bold text-lg">
                                {userName?.charAt(0) || 'A'}
                             </div>
                             <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-900 dark:text-white wrap-break-word uppercase tracking-tight">{userName || 'Administrador'}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest wrap-break-word">{roleName || role || 'Master User'}</p>
                             </div>
                        </div>
                        <div className="px-3 py-1 rounded-xl bg-white dark:bg-white/5 border border-slate-100 dark:border-white/10 inline-block w-full">
                             <p className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 wrap-break-word lowercase">{user?.email}</p>
                        </div>
                    </div>

                    <div className="p-2 space-y-0.5">
                        {/* My Profile */}
                        <button
                            onClick={handleProfileClick}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all group"
                        >
                            <UserCircle size={18} strokeWidth={2} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                            <span className="text-xs font-bold uppercase tracking-wide">Mi Perfil</span>
                        </button>

                        <button
                            onClick={toggleTheme}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                {theme === 'dark' ? <Moon size={18} strokeWidth={2} className="text-yellow-500" /> : <Sun size={18} strokeWidth={2} className="text-slate-400" />}
                                <span className="text-xs font-bold uppercase tracking-wide">Modo {theme === 'dark' ? 'Oscuro' : 'Claro'}</span>
                            </div>
                        </button>

                        <div className="h-px bg-slate-100 dark:bg-white/5 my-1" />

                        <button
                            onClick={() => {
                                setIsOpen(false);
                                logout();
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-all group"
                        >
                            <LogOut size={18} strokeWidth={2} />
                            <span className="text-xs font-bold uppercase tracking-wide">Cerrar Sesión</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}



