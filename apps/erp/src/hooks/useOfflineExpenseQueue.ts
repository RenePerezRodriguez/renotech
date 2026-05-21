'use client';
import { useEffect, useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

const QUEUE_KEY  = 'renotech_offline_expenses';
const FAILED_KEY = 'renotech_failed_sync_expenses';
const MAX_RETRIES = 3;

export type ExpenseCategoryCode = 'ALQUILER' | 'SERVICIOS' | 'TRANSPORTE' | 'ALIMENTACION' | 'LIMPIEZA' | 'MARKETING' | 'MANTENIMIENTO' | 'SUELDOS' | 'IMPUESTOS' | 'OTROS';

export interface QueuedExpense {
    id: string;
    amount: number;
    category: ExpenseCategoryCode;
    description: string;
    paymentMethod: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
    userId: string;
    userName: string;
    branchId: string;
    date: string; // ISO string
    bankRef?: string;
    queuedAt: string;
    retries: number;
}

function getQueue(): QueuedExpense[] {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch { return []; }
}

function saveQueue(q: QueuedExpense[]) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function enqueueOfflineExpense(data: Omit<QueuedExpense, 'id' | 'queuedAt' | 'retries'>) {
    const queue = getQueue();
    queue.push({
        ...data,
        id: crypto.randomUUID(),
        queuedAt: new Date().toISOString(),
        retries: 0,
    });
    saveQueue(queue);
    window.dispatchEvent(new Event('offline-expense-queue-changed'));
}

export function getOfflineExpenseQueue(): QueuedExpense[] {
    return getQueue();
}

export function useOfflineExpenseQueue() {
    const syncingRef = useRef(false);
    const [pendingCount, setPendingCount] = useState(() => getQueue().length);

    const refreshCount = useCallback(() => setPendingCount(getQueue().length), []);

    const syncQueue = useCallback(async () => {
        if (syncingRef.current || !navigator.onLine) return;
        const queue = getQueue();
        if (queue.length === 0) return;

        syncingRef.current = true;
        const { ExpenseService } = await import('@/services/ExpenseService');
        const remaining: QueuedExpense[] = [];
        let synced = 0;
        let failed = 0;

        for (const entry of queue) {
            try {
                await ExpenseService.create(
                    {
                        branchId: entry.branchId,
                        amount: entry.amount,
                        category: entry.category,
                        description: entry.description,
                        paymentMethod: entry.paymentMethod,
                        userId: entry.userId,
                        userName: entry.userName,
                        date: new Date(entry.date),
                        bankRef: entry.bankRef,
                    },
                    entry.branchId,
                );
                synced++;
            } catch (err: unknown) {
                if (entry.retries >= MAX_RETRIES) {
                    try {
                        const failed_list = JSON.parse(localStorage.getItem(FAILED_KEY) || '[]');
                        failed_list.push({ ...entry, failedAt: new Date().toISOString(), failReason: String(err) });
                        localStorage.setItem(FAILED_KEY, JSON.stringify(failed_list));
                    } catch { /* silencioso */ }
                    failed++;
                } else {
                    remaining.push({ ...entry, retries: entry.retries + 1 });
                }
            }
        }

        saveQueue(remaining);
        setPendingCount(remaining.length);
        syncingRef.current = false;
        window.dispatchEvent(new Event('offline-expense-queue-changed'));

        if (synced > 0) {
            toast.success(`${synced} gasto${synced !== 1 ? 's' : ''} sincronizado${synced !== 1 ? 's' : ''}`, {
                description: 'Los gastos offline ya están registrados en caja',
            });
        }
        if (failed > 0) {
            toast.error(`${failed} gasto${failed !== 1 ? 's' : ''} no pudieron sincronizarse`, {
                description: 'Revisa manualmente en Caja',
                duration: 8000,
            });
        }
    }, []);

    useEffect(() => {
        const handler = () => { refreshCount(); syncQueue(); };
        window.addEventListener('online', handler);
        window.addEventListener('offline-expense-queue-changed', refreshCount);
        if (navigator.onLine) syncQueue();
        return () => {
            window.removeEventListener('online', handler);
            window.removeEventListener('offline-expense-queue-changed', refreshCount);
        };
    }, [syncQueue, refreshCount]);

    useEffect(() => {
        const interval = setInterval(() => { if (navigator.onLine) syncQueue(); }, 60_000);
        return () => clearInterval(interval);
    }, [syncQueue]);

    return { pendingCount, syncQueue, enqueueOfflineExpense };
}
