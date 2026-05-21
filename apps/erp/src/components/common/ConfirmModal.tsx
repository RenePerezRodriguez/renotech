'use client';

import { AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import IndustrialModal from '@/components/common/IndustrialModal';
import clsx from 'clsx';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    isLoading?: boolean;
}

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirmar Operación',
    cancelText = 'Abortar',
    variant = 'danger',
    isLoading = false
}: ConfirmModalProps) {
    
    const variantConfig = {
        danger: {
            theme: 'carbon' as const,
            icon: <AlertOctagon size={24} />,
            iconBg: 'bg-rose-500',
            accent: 'text-rose-500',
            button: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/20'
        },
        warning: {
            theme: 'stealth' as const,
            icon: <AlertTriangle size={24} />,
            iconBg: 'bg-yellow-500',
            accent: 'text-yellow-500',
            button: 'bg-yellow-500 hover:bg-yellow-400 text-slate-950 shadow-yellow-500/20'
        },
        info: {
            theme: 'cobalt' as const,
            icon: <Info size={24} />,
            iconBg: 'bg-cyan-500',
            accent: 'text-cyan-400',
            button: 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-500/20'
        }
    };

    const config = variantConfig[variant];

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            subtitle="Confirmación de Seguridad"
            icon={config.icon}
            theme={config.theme}
            maxWidth="max-w-md"
        >
            <div className="flex flex-col items-center text-center space-y-6 pt-2">
                <div className={clsx(
                    "w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl relative",
                    variant === 'danger' ? "bg-rose-500/10 text-rose-500 border border-rose-500/20" : 
                    variant === 'warning' ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" :
                    "bg-cyan-500/10 text-cyan-500 border border-cyan-500/20"
                )}>
                    <div className="absolute inset-0 rounded-3xl animate-pulse opacity-20 bg-current"></div>
                    {config.icon}
                </div>

                <div className="space-y-3 px-4">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest leading-tight">
                        {message}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest opacity-60 italic">
                        Esta acción requiere autorización y no puede revertirse
                    </p>
                </div>

                <div className="flex gap-3 w-full pt-4">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-black uppercase text-[10px] tracking-widest border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-all active:scale-95 disabled:opacity-30"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={clsx(
                            "flex-[1.5] h-12 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-30 shadow-xl border border-white/10",
                            config.button
                        )}
                    >
                        {isLoading ? (
                            <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                            confirmText
                        )}
                    </button>
                </div>
            </div>
        </IndustrialModal>
    );
}

