'use client';

import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import type { Product } from '@/types';
import type { BranchStockInfo } from './ProductPreviewTooltip';

export interface ProductContextMenuAction {
    label: string;
    icon: LucideIcon;
    onClick: (product: Product) => void;
    /** tailwind text color class for emphasis (default neutral) */
    color?: string;
    /** optional separator before this item */
    divider?: boolean;
}

interface ProductContextMenuProps {
    position: { x: number; y: number; product: Product } | null;
    onClose: () => void;
    actions: ProductContextMenuAction[];
    branchStocks?: BranchStockInfo[];
}

/**
 * Menú contextual reutilizable (click derecho) para productos.
 * Configurable vía array de acciones; opcionalmente muestra stock por sucursal.
 */
export default function ProductContextMenu({ position, onClose, actions, branchStocks }: ProductContextMenuProps) {
    if (!position || typeof document === 'undefined') return null;

    const left = Math.min(Math.max(position.x, 8), window.innerWidth - 220);
    const top = Math.min(Math.max(position.y, 8), window.innerHeight - 300);

    const node = (
        <>
            <div
                className="fixed inset-0 z-9998"
                onClick={onClose}
                onContextMenu={(e) => { e.preventDefault(); onClose(); }}
            />
            <div
                className="fixed z-9999 bg-white dark:bg-[#111827] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 py-1 min-w-52 animate-in fade-in zoom-in-95 duration-150"
                style={{ left, top }}
            >
                <div className="px-3 py-2 border-b border-slate-100 dark:border-white/10">
                    {position.product.codigo && (
                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{position.product.codigo}</p>
                    )}
                    <p className="text-xs font-bold uppercase text-slate-900 dark:text-white wrap-break-word">{position.product.nombre}</p>
                </div>
                {actions.map((action, idx) => {
                    const Icon = action.icon;
                    return (
                        <div key={idx}>
                            {action.divider && <div className="my-1 border-t border-slate-100 dark:border-white/10" />}
                            <button
                                onClick={() => { action.onClick(position.product); onClose(); }}
                                className={clsx(
                                    "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold transition-colors",
                                    action.color || "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                                )}
                            >
                                <Icon size={14} /> {action.label}
                            </button>
                        </div>
                    );
                })}
                {branchStocks && branchStocks.length > 0 && (
                    <div className="px-3 py-2 border-t border-slate-100 dark:border-white/10">
                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-1">Stock en otras sucursales</p>
                        <div className="flex flex-col gap-0.5">
                            {branchStocks.map(s => (
                                <div key={s.branchName} className="flex items-center justify-between">
                                    <span className={clsx("text-[10px] font-bold flex items-center gap-1", s.stock > 0 ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-600")}>
                                        <div className={clsx("w-1.5 h-1.5 rounded-full", s.stock > 0 ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-700")} />
                                        {s.initials} — {s.branchName}
                                    </span>
                                    <span className={clsx("text-[10px] font-black tabular-nums", s.stock > 0 ? "text-slate-900 dark:text-white" : "text-slate-300 dark:text-slate-700")}>{s.stock}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );

    return createPortal(node, document.body);
}
