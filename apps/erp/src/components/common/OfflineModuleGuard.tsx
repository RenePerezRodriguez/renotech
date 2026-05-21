'use client';
import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useRouter } from 'next/navigation';

interface Props {
    children: React.ReactNode;
    moduleName: string;
}

export function OfflineModuleGuard({ children, moduleName }: Props) {
    const { isOnline } = useNetworkStatus();
    const router = useRouter();

    if (isOnline) return <>{children}</>;

    return (
        <div className="flex-1 flex flex-col items-center justify-center h-full gap-5 text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                <WifiOff size={28} className="text-slate-300 dark:text-slate-600" />
            </div>
            <div>
                <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                    {moduleName} requiere conexión
                </p>
                <p className="text-[11px] text-slate-400 mt-1.5 max-w-xs">
                    Este módulo necesita internet para funcionar correctamente.<br />
                    Tus datos están seguros y seguirán disponibles al reconectarte.
                </p>
            </div>
            <button
                onClick={() => router.push('/punto-de-venta')}
                className="px-4 py-2.5 rounded-xl bg-yellow-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-yellow-400 transition-colors"
            >
                Ir al POS
            </button>
        </div>
    );
}
