'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Home } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center space-y-8">
                {/* Icon */}
                <div className="w-20 h-20 bg-yellow-500/10 dark:bg-[#FFD700]/10 rounded-2xl flex items-center justify-center mx-auto border border-yellow-500/20">
                    <AlertTriangle size={40} className="text-yellow-500 dark:text-[#FFD700]" />
                </div>

                {/* Error Code */}
                <div>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.4em] mb-3">Error de Navegación</p>
                    <h1 className="text-7xl font-black text-slate-900 dark:text-white tracking-tighter font-mono">404</h1>
                </div>

                {/* Message */}
                <div className="space-y-2">
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
                        La ruta solicitada no existe en el sistema.
                    </p>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest">
                        Verifique la dirección o regrese al panel principal
                    </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                    <button
                        onClick={() => window.history.back()}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-[0.2em] hover:bg-slate-50 dark:hover:bg-white/10 transition-all active:scale-[0.98]"
                    >
                        <ArrowLeft size={14} />
                        Volver
                    </button>
                    <Link
                        href="/punto-de-venta"
                        className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-slate-900/20 dark:shadow-[#FFD700]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        <Home size={14} />
                        Ir al Panel
                    </Link>
                </div>
            </div>
        </div>
    );
}
