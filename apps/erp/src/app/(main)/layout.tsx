'use client';

import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import MobileDrawer from '@/components/layout/MobileDrawer';
import { useAuth } from '@/contexts/AuthContext';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import IdleWarningModal from '@/components/common/IdleWarningModal';
import ChatFloatingButton from '@/components/chat/ChatFloatingButton';
import ChatPanel from '@/components/chat/ChatPanel';
import { OfflineBanner } from '@/components/common/OfflineBanner';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { useOfflineExpenseQueue } from '@/hooks/useOfflineExpenseQueue';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { ProductCacheProvider } from '@/components/providers/ProductCacheProvider';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ShieldOff } from 'lucide-react';
import clsx from 'clsx';
import PageTransition from '@/components/layout/PageTransition';


export default function MainLayout({ children }: { children: React.ReactNode }) {
    const { user, loading, canAccess, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const { showWarning, remainingSeconds, resetActivity } = useIdleTimeout({
        onLogout: logout,
        enabled: !!user && !loading,
    });

    // Activar sincronización offline en toda la app
    useOfflineQueue();
    useOfflineExpenseQueue();
    const { isOnline } = useNetworkStatus();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/acceso');
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-[#020617]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-white/10 border-t-yellow-500 rounded-full animate-spin" />
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600">Cargando...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return null; // Will redirect
    }

    // Route protection: check if user can access the current route
    const isRouteAllowed = canAccess(pathname);

    // Navigation & Layout Context
    const isOperational = [
        '/punto-de-venta',
        '/cotizaciones/nueva',
        '/compras/nueva',
    ].includes(pathname);

    return (
        <ProductCacheProvider>
        <div className="flex h-screen bg-slate-50 dark:bg-background transition-colors duration-500 overflow-hidden">
            <OfflineBanner />

            {/* Desktop Sidebar - Hidden on mobile */}
            <Sidebar />

            {/* Mobile Drawer */}
            <MobileDrawer
                isOpen={isMobileMenuOpen}
                onClose={() => setIsMobileMenuOpen(false)}
            />

            <div className={clsx("flex-1 flex flex-col min-w-0 relative h-full", !isOnline && "pt-8")}>
                <Header onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />
                <main className={clsx(
                    "flex-1 flex flex-col min-h-0 relative bg-slate-50/50 dark:bg-background",
                    isOperational ? "overflow-hidden" : "overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8"
                )}>
                    {isRouteAllowed ? (
                        <PageTransition pathname={pathname}>{children}</PageTransition>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center p-5 sm:p-6 bg-white dark:bg-background mx-3 my-4 sm:m-8 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm max-w-lg w-full self-center">
                            <ShieldOff size={48} className="text-slate-300 dark:text-slate-700 mb-6" />
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">Acceso Restringido</h2>
                            <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-md text-sm">
                                Tu rol no tiene permisos para acceder a esta sección.
                            </p>
                            <button
                                onClick={() => router.push('/inicio')}
                                className="mt-8 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:opacity-90 active:scale-95"
                            >
                                Volver al Dashboard
                            </button>
                        </div>
                    )}
                </main>
            </div>

            {/* Idle session warning */}
            {showWarning && (
                <IdleWarningModal
                    remainingSeconds={remainingSeconds}
                    onStayActive={resetActivity}
                />
            )}

            {/* Chat inteligente */}
            <ChatFloatingButton />
            <ChatPanel />
        </div>
        </ProductCacheProvider>
    );
}



