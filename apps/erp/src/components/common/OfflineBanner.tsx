'use client';
import { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import clsx from 'clsx';

const SALES_KEY    = 'renotech_offline_queue';
const EXPENSES_KEY = 'renotech_offline_expenses';

function getTotalPending(): number {
    try {
        const sales    = JSON.parse(localStorage.getItem(SALES_KEY)    || '[]');
        const expenses = JSON.parse(localStorage.getItem(EXPENSES_KEY) || '[]');
        return (Array.isArray(sales) ? sales.length : 0) + (Array.isArray(expenses) ? expenses.length : 0);
    } catch { return 0; }
}

export function OfflineBanner() {
    const { isOnline } = useNetworkStatus();
    const [prevOnline, setPrevOnline]     = useState(isOnline);
    const [showRestored, setShowRestored] = useState(false);
    const [pending, setPending]           = useState(0);

    // Escuchar cambios en ambas colas via eventos (no polling)
    useEffect(() => {
        const refresh = () => setPending(getTotalPending());
        refresh();
        window.addEventListener('offline-queue-changed',         refresh);
        window.addEventListener('offline-expense-queue-changed', refresh);
        return () => {
            window.removeEventListener('offline-queue-changed',         refresh);
            window.removeEventListener('offline-expense-queue-changed', refresh);
        };
    }, []);

    // Mostrar banner "restaurada" brevemente al reconectarse
    useEffect(() => {
        if (!prevOnline && isOnline) {
            setShowRestored(true);
            const t = setTimeout(() => setShowRestored(false), 4000);
            setPrevOnline(true);
            return () => clearTimeout(t);
        }
        if (!isOnline) setPrevOnline(false);
    }, [isOnline, prevOnline]);

    if (isOnline && !showRestored) return null;

    return (
        <div className={clsx(
            'fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all duration-300',
            showRestored && isOnline
                ? 'bg-emerald-500 text-white'
                : 'bg-amber-500 text-black'
        )}>
            {showRestored && isOnline ? (
                <>
                    <Wifi size={13} />
                    Conexión restaurada · Sincronizando pendientes...
                    <RefreshCw size={11} className="animate-spin" />
                </>
            ) : (
                <>
                    <WifiOff size={13} />
                    Sin conexión
                    {pending > 0 && <span className="ml-1">— {pending} {pending !== 1 ? 'registros' : 'registro'} en cola</span>}
                    <span className="ml-2 opacity-60 font-normal normal-case tracking-normal">El POS sigue funcionando</span>
                </>
            )}
        </div>
    );
}
