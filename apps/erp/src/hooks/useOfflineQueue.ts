'use client';
import { useEffect, useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Sale, CashMovement } from '@/types';

const QUEUE_KEY       = 'renotech_offline_queue';
const FAILED_KEY      = 'renotech_failed_sync_sales';
const MAX_RETRIES     = 5;

export interface QueuedSale {
    id: string;
    saleData: Omit<Sale, 'id'>;
    branchId: string;
    adminInfo?: { uid: string; email: string };
    cashMovement?: Omit<CashMovement, 'id'>;
    splitCashMovements?: Omit<CashMovement, 'id'>[];
    installments?: number;
    adelanto?: number;
    adelantoMethod?: 'EFECTIVO' | 'QR';
    queuedAt: string;
    retries: number;
}

function getQueue(): QueuedSale[] {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch { return []; }
}

function setQueue(queue: QueuedSale[]): void {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function addToFailed(entry: QueuedSale, reason: string): void {
    try {
        const failed = JSON.parse(localStorage.getItem(FAILED_KEY) || '[]');
        failed.push({ ...entry, failedAt: new Date().toISOString(), failReason: reason });
        localStorage.setItem(FAILED_KEY, JSON.stringify(failed));
    } catch { /* silencioso */ }
}

export function enqueueOfflineSale(
    saleData: Omit<Sale, 'id'>,
    branchId: string,
    adminInfo?: { uid: string; email: string },
    cashMovement?: Omit<CashMovement, 'id'>,
    splitCashMovements?: Omit<CashMovement, 'id'>[],
    installments?: number,
    adelanto?: number,
    adelantoMethod?: 'EFECTIVO' | 'QR',
): void {
    const queue = getQueue();
    queue.push({
        id: crypto.randomUUID(),
        saleData, branchId, adminInfo,
        cashMovement, splitCashMovements,
        installments, adelanto, adelantoMethod,
        queuedAt: new Date().toISOString(),
        retries: 0,
    });
    setQueue(queue);
    // Notificar a otros tabs/componentes
    window.dispatchEvent(new Event('offline-queue-changed'));
}

export function useOfflineQueue() {
    const syncingRef = useRef(false);
    const [pendingCount, setPendingCount] = useState(() => getQueue().length);

    const refreshCount = useCallback(() => setPendingCount(getQueue().length), []);

    const syncQueue = useCallback(async () => {
        if (syncingRef.current || !navigator.onLine) return;
        const queue = getQueue();
        if (queue.length === 0) return;

        syncingRef.current = true;
        const { SaleService } = await import('@/services/SaleService');
        const remaining: QueuedSale[] = [];
        let synced = 0;
        let failed = 0;

        for (const entry of queue) {
            try {
                await SaleService.createSale(
                    entry.saleData,
                    entry.branchId,
                    entry.adminInfo,
                    entry.cashMovement,
                    entry.splitCashMovements as any,
                    entry.installments,
                );
                synced++;
            } catch (err: any) {
                const isStockError = err?.message?.toLowerCase().includes('stock');
                if (entry.retries >= MAX_RETRIES || isStockError) {
                    // Guardar en fallidos en lugar de descartar silenciosamente
                    addToFailed(entry, err?.message || 'Error desconocido');
                    failed++;
                } else {
                    remaining.push({ ...entry, retries: entry.retries + 1 });
                }
            }
        }

        setQueue(remaining);
        setPendingCount(remaining.length);
        syncingRef.current = false;
        window.dispatchEvent(new Event('offline-queue-changed'));

        if (synced > 0) {
            toast.success(`${synced} venta${synced !== 1 ? 's' : ''} sincronizada${synced !== 1 ? 's' : ''}`, {
                description: remaining.length > 0 ? `${remaining.length} pendiente${remaining.length !== 1 ? 's' : ''}` : 'Todo sincronizado',
            });
        }
        if (failed > 0) {
            toast.error(`${failed} venta${failed !== 1 ? 's' : ''} no pudieron sincronizarse`, {
                description: 'Stock insuficiente o error. Ve a Ventas → Pendientes para revisarlas.',
                duration: 8000,
            });
        }
    }, []);

    // Sync al volver online
    useEffect(() => {
        const handler = () => { refreshCount(); syncQueue(); };
        window.addEventListener('online', handler);
        window.addEventListener('offline-queue-changed', refreshCount);
        if (navigator.onLine) syncQueue();
        return () => {
            window.removeEventListener('online', handler);
            window.removeEventListener('offline-queue-changed', refreshCount);
        };
    }, [syncQueue, refreshCount]);

    // Sync periódico cada 60s
    useEffect(() => {
        const interval = setInterval(() => {
            if (navigator.onLine) syncQueue();
        }, 60_000);
        return () => clearInterval(interval);
    }, [syncQueue]);

    return { pendingCount, syncQueue, enqueueOfflineSale };
}

export function getFailedSales() {
    try { return JSON.parse(localStorage.getItem(FAILED_KEY) || '[]'); }
    catch { return []; }
}

export function clearFailedSales() {
    localStorage.removeItem(FAILED_KEY);
}
