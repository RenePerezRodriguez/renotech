'use client';

import { useEffect, useState, useCallback } from 'react';
import { CashierSessionService } from '@/services/CashierSessionService';
import { AccountService } from '@/services/AccountService';
import { CashierSession } from '@/types/treasury';
import { useAuth } from '@/contexts/AuthContext';
import { Lock, Unlock } from 'lucide-react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useBranch } from '@/contexts/BranchContext';

export default function CashWidget() {
    const { user } = useAuth();
    const router = useRouter();
    const [currentShift, setCurrentShift] = useState<CashierSession | null>(null);
    const [amount, setAmount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const { isConsolidatedView, loading: branchLoading, currentBranch } = useBranch();

    const checkCashStatus = useCallback(async () => {
        try {
            if (!user?.uid || !currentBranch?.id) return;
            const validSession = await CashierSessionService.getOperableSession(user.uid, currentBranch.id);
            setCurrentShift(validSession);
            if (validSession) {
                const acc = await AccountService.getById(validSession.cashDrawerId);
                setAmount(acc?.currentBalance ?? 0);
            } else {
                setAmount(0);
            }
        } catch (error) {
            console.error('Error checking cash status:', error);
            setAmount(0);
        } finally {
            setIsLoading(false);
        }
    }, [user?.uid, currentBranch?.id]);

    useEffect(() => {
        if (!user || branchLoading || isConsolidatedView) {
            setCurrentShift(null);
            setAmount(0);
            setIsLoading(false);
            return;
        }
        checkCashStatus();
        const interval = setInterval(checkCashStatus, 60000);
        const handleRefresh = () => checkCashStatus();
        window.addEventListener('cash-shift-changed', handleRefresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener('cash-shift-changed', handleRefresh);
        };
    }, [user, isConsolidatedView, branchLoading, checkCashStatus]);

    const handleClick = () => {
        if (currentShift) {
            router.push('/caja');
        } else {
            // Sin sesión: navegar y disparar autoabrir del modal
            router.push('/caja?abrir=1');
        }
    };

    if (isLoading || isConsolidatedView) return null;

    return (
        <button
            onClick={handleClick}
            className={clsx(
                'hidden sm:inline-flex items-center gap-2 h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors cursor-pointer whitespace-nowrap',
                currentShift
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500 hover:text-white dark:text-emerald-400 dark:border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 border-rose-500/30 hover:bg-rose-500 hover:text-white dark:text-rose-400 dark:border-rose-500/20'
            )}
            title={currentShift ? `Caja Abierta: Bs. ${amount.toFixed(2)}` : 'Caja Cerrada — Clic para abrir'}
        >
            {currentShift ? <Unlock size={14} strokeWidth={2.5} /> : <Lock size={14} strokeWidth={2.5} />}
            <span className="hidden lg:inline">{currentShift ? `Caja · Bs. ${amount.toFixed(0)}` : 'Caja cerrada'}</span>
            <span className="lg:hidden">{currentShift ? `Bs. ${amount.toFixed(0)}` : 'Cerrada'}</span>
        </button>
    );
}
