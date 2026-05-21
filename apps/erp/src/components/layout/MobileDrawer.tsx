'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { menuGroups } from '@/config/menu';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

interface MobileDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
    const pathname = usePathname();
    const { role, allowedRoutes } = useAuth();

    // Close on route change
    useEffect(() => {
        onClose();
    }, [pathname, onClose]);

    // Filter menu items based on dynamic role permissions
    const filteredMenuGroups = menuGroups.map(group => ({
        ...group,
        items: group.items.filter(item => {
            if (role === 'GERENTE') return true;
            return allowedRoutes.includes(item.href);
        })
    })).filter(group => group.items.length > 0);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] md:hidden">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="absolute top-0 bottom-0 left-0 w-[min(280px,calc(100vw-2.5rem))] max-w-full bg-white dark:bg-background shadow-2xl animate-in slide-in-from-left duration-300 flex flex-col">
                {/* Header */}
                <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-white/10 shrink-0">
                    <span className="text-xl font-bold tracking-tight flex items-center gap-1">
                        <span className="text-slate-900 dark:text-white">RENO</span>
                        <span className="text-[#DAA520] dark:text-[#FFD700]">TECH</span>
                    </span>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-6">
                    {filteredMenuGroups.map((group) => (
                        <div key={group.title}>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#DAA520] mb-3 px-2">
                                {group.title}
                            </h3>
                            <div className="space-y-1">
                                {group.items.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = pathname === item.href;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={clsx(
                                                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95",
                                                isActive
                                                    ? "bg-slate-900 text-white dark:bg-[#FFD700] dark:text-black shadow-lg shadow-gray-900/20 dark:shadow-[#FFD700]/20"
                                                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
                                            )}
                                        >
                                            <Icon size={18} className={isActive ? "text-current" : "text-slate-400 group-hover:text-slate-600"} />
                                            {item.name}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>
            </div>
        </div>
    );
}
