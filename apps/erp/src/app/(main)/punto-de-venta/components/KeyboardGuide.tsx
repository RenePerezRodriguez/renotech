'use client';

import { useState, useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import clsx from 'clsx';

const SHORTCUTS = [
    { key: 'F3', action: 'Buscar producto', area: 'Productos' },
    { key: 'F9', action: 'Cobrar venta', area: 'Carrito' },
    { key: 'Esc', action: 'Vaciar / Cerrar modales', area: 'General' },
    { key: '3*', action: 'Agregar 3 unidades (ej: 3*código)', area: 'Productos' },
];

export default function KeyboardGuide() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'F1') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    return (
        <>
            {/* Guide modal — trigger via F1 */}
            {isOpen && (
                <div className="fixed inset-0 z-9999 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-slate-900/60" onClick={() => setIsOpen(false)} />
                    <div className="relative bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 dark:bg-black border-b border-white/10">
                            <div className="flex items-center gap-2">
                                <Keyboard size={16} className="text-yellow-500" />
                                <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Atajos de Teclado</h3>
                            </div>
                            <button onClick={() => setIsOpen(false)} className="text-white/40 hover:text-white transition-colors">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Shortcuts list */}
                        <div className="p-4 space-y-2">
                            {SHORTCUTS.map(s => (
                                <div key={s.key} className="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5">
                                    <div className="flex items-center gap-3">
                                        <kbd className={clsx(
                                            "inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] border shadow-sm",
                                            "bg-white dark:bg-slate-800 border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                                        )}>
                                            {s.key}
                                        </kbd>
                                        <span className="text-xs font-bold text-slate-900 dark:text-white">{s.action}</span>
                                    </div>
                                    <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{s.area}</span>
                                </div>
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-3 border-t border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/2">
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] text-center">
                                Presiona F1 para abrir/cerrar esta guía
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
