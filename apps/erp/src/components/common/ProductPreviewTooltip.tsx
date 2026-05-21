'use client';

import Image from 'next/image';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Product } from '@/types';

export interface BranchStockInfo {
    branchName: string;
    initials: string;
    stock: number;
}

interface ProductPreviewTooltipProps {
    anchor: HTMLElement | null;
    product: Product | null;
    /** Optional: when provided, shows stock by branch at the bottom */
    branchStocks?: BranchStockInfo[];
    /** Width in px (default 256) */
    width?: number;
}

/**
 * Tooltip flotante con detalles del producto al hacer hover.
 * Auto-posiciona alrededor del anchor según el espacio disponible.
 */
export default function ProductPreviewTooltip({
    anchor,
    product,
    branchStocks,
    width = 256,
}: ProductPreviewTooltipProps) {
    // Hooks SIEMPRE al principio — antes de cualquier return condicional.
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState({ left: 0, top: 0, width: width, ready: false });

    useLayoutEffect(() => {
        if (!anchor || !product || !tooltipRef.current) return;

        const rawRect = anchor.getBoundingClientRect();
        // Para anchors muy anchos (filas en vista lista) acortamos virtualmente el rect
        // a la izquierda para que el tooltip aparezca cerca del producto, no al borde derecho.
        const VIRTUAL_MAX_WIDTH = 360;
        const rect = rawRect.width > VIRTUAL_MAX_WIDTH
            ? { left: rawRect.left, right: rawRect.left + VIRTUAL_MAX_WIDTH, top: rawRect.top, bottom: rawRect.bottom, height: rawRect.height }
            : rawRect;
        const margin = 10;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const tooltipEl = tooltipRef.current;
        const tooltipH = tooltipEl.offsetHeight || 260;
        const tooltipW = Math.min(width, vw - margin * 2);

        const spaceRight = vw - rect.right - margin;
        const spaceLeft = rect.left - margin;
        const spaceBelow = vh - rect.bottom - margin;
        const spaceAbove = rect.top - margin;

        let left = rect.left;
        let top = rect.top;

        if (spaceRight >= tooltipW) {
            left = rect.right + margin;
            top = rect.top + rect.height / 2 - tooltipH / 2;
        } else if (spaceLeft >= tooltipW) {
            left = rect.left - tooltipW - margin;
            top = rect.top + rect.height / 2 - tooltipH / 2;
        } else if (spaceBelow >= tooltipH + margin) {
            left = Math.min(rect.left, vw - tooltipW - margin);
            top = rect.bottom + margin;
        } else if (spaceAbove >= tooltipH + margin) {
            left = Math.min(rect.left, vw - tooltipW - margin);
            top = rect.top - tooltipH - margin;
        } else {
            // Ningún lado tiene espacio suficiente → centrar en viewport
            left = Math.max(margin, (vw - tooltipW) / 2);
            top = Math.max(margin, (vh - tooltipH) / 2);
        }

        left = Math.max(margin, Math.min(left, vw - tooltipW - margin));
        top = Math.max(margin, Math.min(top, vh - tooltipH - margin));

        setPosition({ left, top, width: tooltipW, ready: true });
    }, [anchor, product, width]);

    if (!anchor || !product || typeof document === 'undefined') return null;

    const node = (
        <div
            ref={tooltipRef}
            className="fixed z-9999 bg-white dark:bg-[#111827] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 p-3 animate-in fade-in zoom-in-95 duration-150 pointer-events-none overflow-hidden"
            style={{
                left: position.left,
                top: position.top,
                width: position.width,
                maxHeight: `calc(100vh - 20px)`,
                visibility: position.ready ? 'visible' : 'hidden',
            }}
        >
            <div className="flex items-center gap-2 mb-2">
                {product.imagenUrl && (
                    <div className="w-10 h-10 relative shrink-0 rounded-xl overflow-hidden bg-slate-50 dark:bg-white/5">
                        <Image src={product.imagenUrl} alt="" fill className="object-contain p-0.5" sizes="40px" />
                    </div>
                )}
                <div className="min-w-0">
                    {product.marca && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{product.marca}</p>}
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">{product.nombre}</p>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                {product.codigo && (
                    <div className="flex justify-between gap-1"><span className="text-slate-400 shrink-0">Código:</span><span className="font-bold text-slate-700 dark:text-slate-300 truncate text-right">{product.codigo}</span></div>
                )}
                {product.codigoFabrica && (
                    <div className="flex justify-between gap-1"><span className="text-slate-400 shrink-0">Fábrica:</span><span className="font-bold text-blue-500 truncate text-right">{product.codigoFabrica as string}</span></div>
                )}
                {product.codigoOE && (
                    <div className="col-span-2 flex justify-between gap-2"><span className="text-slate-400 shrink-0">OEM:</span><span className="font-bold text-slate-700 dark:text-slate-300 break-all text-right">{product.codigoOE as string}</span></div>
                )}
                <div className="flex justify-between gap-1"><span className="text-slate-400 shrink-0">C/Factura:</span><span className="font-bold text-slate-800 dark:text-white">Bs. {(product.precioConFactura ?? 0).toFixed(2)}</span></div>
                <div className="flex justify-between gap-1"><span className="text-slate-400 shrink-0">S/Factura:</span><span className="font-bold text-emerald-600 dark:text-emerald-400">Bs. {(product.precioSinFactura ?? 0).toFixed(2)}</span></div>
                <div className="flex justify-between gap-1"><span className="text-slate-400 shrink-0">Stock local:</span><span className={clsx("font-bold", (product.stock ?? 0) === 0 ? "text-amber-500" : "text-green-600")}>{product.stock ?? 0}</span></div>
                {product.categoria && (
                    <div className="flex justify-between gap-1"><span className="text-slate-400 shrink-0">Categoría:</span><span className="font-bold text-slate-700 dark:text-slate-300 truncate text-right">{product.categoria}</span></div>
                )}
                {product.origen && (
                    <div className="flex justify-between gap-1"><span className="text-slate-400 shrink-0">Origen:</span><span className="font-bold text-slate-700 dark:text-slate-300 truncate text-right">{product.origen}</span></div>
                )}
                {product.ubicacionFisica && (
                    <div className="col-span-2 flex justify-between gap-2"><span className="text-slate-400 shrink-0">Ubicación:</span><span className="font-bold text-slate-700 dark:text-slate-300 truncate text-right">{product.ubicacionFisica}</span></div>
                )}
            </div>
            {branchStocks && branchStocks.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/10">
                    <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-1">Otras sucursales</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {branchStocks.map(s => (
                            <span key={s.branchName} title={s.branchName} className={clsx("text-[9px] font-black uppercase tracking-widest", s.stock > 0 ? "text-blue-600 dark:text-blue-400" : "text-slate-300 dark:text-slate-700")}>
                                {s.initials}: {s.stock}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    return createPortal(node, document.body);
}
