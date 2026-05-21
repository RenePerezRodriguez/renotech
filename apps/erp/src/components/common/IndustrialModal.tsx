'use client';

import React, { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';

export type IndustrialTheme = 'stealth' | 'cobalt' | 'matrix' | 'carbon' | 'titanium';

interface IndustrialModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle: string;
    icon: ReactNode;
    theme?: IndustrialTheme;
    // Icon overrides (optional if theme is provided)
    iconBg?: string;
    iconColor?: string;
    children: ReactNode;
    footer?: ReactNode;
    maxWidth?: string;
    className?: string;
    noPadding?: boolean;
    headerContent?: ReactNode;
}

/**
 * IndustrialModal - Suite Pro v4.0 Base Component
 * 
 * Enforces the "Technical Commander" aesthetic:
 * - Solid black ceiling (h-24)
 * - precision rounded corners (28px) 
 * - Standard technical typography
 * - Boundary-cut floating icon unit
 */
export default function IndustrialModal({
    isOpen,
    onClose,
    title,
    subtitle,
    icon,
    theme = 'stealth',
    iconBg,
    iconColor,
    children,
    footer,
    maxWidth = 'max-w-xl',
    className,
    noPadding = false,
    headerContent
}: IndustrialModalProps) {
    // Theme Definitions
    const themes = {
        stealth: {
            bg: 'bg-white dark:bg-background',
            header: 'bg-slate-900 dark:bg-background',
            accent: 'text-yellow-500',
            accentHex: '#eab308',
            accentSoft: 'rgba(234, 179, 8, 0.1)',
            border: 'border-slate-200 dark:border-white/10',
            iconBg: 'bg-yellow-500',
            iconColor: 'text-slate-950',
            backdrop: 'bg-slate-900/60 dark:bg-black/80'
        },
        cobalt: {
            bg: 'bg-slate-50 dark:bg-background',
            header: 'bg-[#0f172a] dark:bg-background',
            accent: 'text-cyan-400',
            accentHex: '#22d3ee',
            accentSoft: 'rgba(34, 211, 238, 0.1)',
            border: 'border-cyan-100 dark:border-cyan-500/20',
            iconBg: 'bg-cyan-500',
            iconColor: 'text-white',
            backdrop: 'bg-slate-900/40 dark:bg-black/60'
        },
        matrix: {
            bg: 'bg-slate-950 dark:bg-background',
            header: 'bg-[#050505] dark:bg-background',
            accent: 'text-emerald-500',
            accentHex: '#10b981',
            accentSoft: 'rgba(16, 185, 129, 0.1)',
            border: 'border-emerald-500/10 dark:border-emerald-500/20',
            iconBg: 'bg-emerald-600',
            iconColor: 'text-black',
            backdrop: 'bg-black/80'
        },
        carbon: {
            bg: 'bg-zinc-50 dark:bg-background',
            header: 'bg-zinc-900 dark:bg-background',
            accent: 'text-orange-500',
            accentHex: '#f97316',
            accentSoft: 'rgba(249, 115, 22, 0.1)',
            border: 'border-zinc-200 dark:border-orange-500/10',
            iconBg: 'bg-orange-600',
            iconColor: 'text-white',
            backdrop: 'bg-zinc-950/70 dark:bg-black/70'
        },
        titanium: {
            bg: 'bg-white dark:bg-slate-100',
            header: 'bg-slate-900 dark:bg-background',
            accent: 'text-slate-900',
            accentHex: '#0f172a',
            accentSoft: 'rgba(15, 23, 42, 0.1)',
            border: 'border-slate-300',
            iconBg: 'bg-slate-900',
            iconColor: 'text-white',
            backdrop: 'bg-slate-900/40'
        }
    };

    const t = themes[theme];
    const finalIconBg = iconBg || t.iconBg;
    const finalIconColor = iconColor || t.iconColor;

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    onClose();
                }
            };
            
            window.addEventListener('keydown', handleKeyDown);
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
                document.body.style.overflow = 'unset';
            };
        }
    }, [isOpen, onClose]);

    if (!mounted || !isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-4">
            {/* Backdrop with technical blur */}
            <div 
                className={clsx("absolute inset-0 backdrop-blur-md animate-in fade-in duration-300", t.backdrop)} 
                onClick={onClose}
            />

            {/* Modal Container */}
            <div 
                style={{
                    // @ts-expect-error: CSS custom properties are not natively supported in React.CSSProperties
                    '--industrial-accent': t.accentHex,
                    '--industrial-accent-soft': t.accentSoft,
                }}
                className={clsx(
                "relative w-full min-w-0 rounded-[20px] sm:rounded-[28px] shadow-[0_32px_128px_-32px_rgba(0,0,0,0.5)] flex flex-col max-h-[min(95dvh,95vh)] border animate-in zoom-in-95 duration-300 overflow-hidden transition-colors duration-500",
                t.bg,
                t.border,
                maxWidth,
                className
            )} onClick={(e) => e.stopPropagation()}>
                
                {/* Industrial Header (The Technical Ceiling) */}
                <div className={clsx("relative h-20 sm:h-24 shrink-0 transition-colors duration-500", t.header)}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute right-3 top-3 sm:right-6 sm:top-6 w-9 h-9 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all backdrop-blur-md active:scale-90 z-20 border border-white/10"
                    >
                        <X size={14} strokeWidth={3} />
                    </button>
                    
                    {/* Boundary Cut Floating Box */}
                    <div className="absolute -bottom-6 sm:-bottom-7 left-4 sm:left-8 flex items-center gap-3 sm:gap-4 z-10 pr-14 sm:pr-0 min-w-0 max-w-full">
                        <div className={clsx(
                            "w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl shadow-2xl flex items-center justify-center border-2 sm:border-4 transition-all duration-500 shrink-0",
                            theme === 'titanium' ? 'border-slate-200' : 'dark:border-background',
                            finalIconBg,
                            finalIconColor
                        )}>
                            {icon}
                        </div>
                        <div className="-translate-y-8 sm:-translate-y-10 min-w-0 flex-1">
                            <h3 className={clsx(
                                "text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] mb-1 wrap-break-word", 
                                theme === 'titanium' ? 'text-slate-500' : 'text-white/50'
                            )}>
                                {subtitle}
                            </h3>
                            <h2 className={clsx(
                                "text-base sm:text-lg font-black uppercase tracking-tight leading-tight wrap-break-word sm:truncate max-w-[min(100%,calc(100vw-5rem))] sm:max-w-[400px]",
                                theme === 'titanium' ? 'text-slate-900' : 'text-white'
                            )}>
                                {title}
                            </h2>
                        </div>
                    </div>

                    {/* Custom Header Content (e.g. Theme Switcher) */}
                    {headerContent && (
                        <div className="absolute right-14 top-3 sm:right-20 sm:top-6 z-20 max-w-[40%] sm:max-w-none">
                            {headerContent}
                        </div>
                    )}
                </div>

                {/* Modal Body - High Density Padding */}
                <div className={clsx(
                    "flex-1 overflow-y-auto custom-scrollbar min-h-0",
                    noPadding ? "p-0" : "p-4 pt-10 sm:p-8 sm:pt-12"
                )}>
                    {children}
                </div>

                {/* Modal Footer (Optional Audit-Style Footer) */}
                {footer && (
                    <div className={clsx("shrink-0 p-4 sm:p-6 border-t bg-slate-50/50 transition-colors duration-500", t.border, theme === 'titanium' ? 'bg-slate-200/50' : 'dark:bg-black/20')}>
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
