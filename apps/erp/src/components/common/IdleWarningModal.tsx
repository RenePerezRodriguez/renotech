'use client';

import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
    remainingSeconds: number;
    onStayActive: () => void;
}

export default function IdleWarningModal({ remainingSeconds, onStayActive }: Props) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const urgency = remainingSeconds <= 60;

    if (!mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" />
            <div className="relative bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center animate-in zoom-in-95 duration-300">

                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 transition-colors duration-500 ${urgency ? 'bg-rose-500/15 border border-rose-500/30' : 'bg-amber-500/10 border border-amber-500/20'}`}>
                    <Clock size={28} className={urgency ? 'text-rose-400' : 'text-amber-400'} />
                </div>

                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.25em] mb-2">
                    Sesión por expirar
                </p>
                <h2 className="text-white font-black text-xl uppercase tracking-tight mb-2">
                    ¿Sigues ahí?
                </h2>
                <p className="text-slate-400 text-sm mb-6">
                    Tu sesión cerrará automáticamente por inactividad en:
                </p>

                <div className={`text-6xl font-black tabular-nums tracking-tighter mb-8 transition-colors duration-500 ${urgency ? 'text-rose-400' : 'text-white'}`}>
                    {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </div>

                <button
                    onClick={onStayActive}
                    className="w-full bg-[#FFD700] hover:bg-yellow-400 text-black font-black uppercase tracking-wider text-sm py-4 rounded-xl transition-all active:scale-95 shadow-lg shadow-yellow-500/20"
                >
                    Seguir activo
                </button>

                <p className="text-slate-700 text-[9px] uppercase tracking-widest mt-5 font-bold">
                    Inactividad detectada · Renotech
                </p>
            </div>
        </div>,
        document.body
    );
}
