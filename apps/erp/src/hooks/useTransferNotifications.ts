import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export interface TransferNotifications {
    total: number;
    envios: number;
    pedidos: number;
    cancelaciones: number;
}

/**
 * Hook de notificaciones logísticas hacia la sucursal actual.
 * Retorna desglose por categoría para poder mostrar tooltips y banners contextuales.
 */
export function useTransferNotifications(branchId: string | undefined): TransferNotifications {
    const [pedidosCount, setPedidosCount] = useState(0);
    const [enviosCount, setEnviosCount] = useState(0);
    const [cancellationsFromCount, setCancellationsFromCount] = useState(0);
    const [cancellationsToCount, setCancellationsToCount] = useState(0);

    useEffect(() => {
        if (!branchId) {
            setPedidosCount(0);
            setEnviosCount(0);
            setCancellationsFromCount(0);
            setCancellationsToCount(0);
            return;
        }

        let mounted = true;

        const qPedidos = query(
            collection(db, 'pedidos'),
            where('toBranchId', '==', branchId),
            where('status', '==', 'vigente')
        );
        const unsubPed = onSnapshot(qPedidos, snap => {
            if (!mounted) return;
            const count = snap.docs.filter(d => !d.data().envioId).length;
            setPedidosCount(count);
        }, err => console.error('useTransferNotifications/pedidos:', err));

        const qEnvios = query(
            collection(db, 'envios'),
            where('toBranchId', '==', branchId),
            where('status', '==', 'en_transito')
        );
        const unsubEnv = onSnapshot(qEnvios, snap => {
            if (!mounted) return;
            setEnviosCount(snap.size);
        }, err => console.error('useTransferNotifications/envios:', err));

        const qCancelFrom = query(
            collection(db, 'envios'),
            where('fromBranchId', '==', branchId),
            where('cancellationPending', '==', true),
        );
        const unsubCancelFrom = onSnapshot(qCancelFrom, snap => {
            if (!mounted) return;
            setCancellationsFromCount(snap.size);
        }, err => console.error('useTransferNotifications/cancelFrom:', err));

        const qCancelTo = query(
            collection(db, 'envios'),
            where('toBranchId', '==', branchId),
            where('cancellationPending', '==', true),
        );
        const unsubCancelTo = onSnapshot(qCancelTo, snap => {
            if (!mounted) return;
            setCancellationsToCount(snap.size);
        }, err => console.error('useTransferNotifications/cancelTo:', err));

        return () => {
            mounted = false;
            unsubPed();
            unsubEnv();
            unsubCancelFrom();
            unsubCancelTo();
        };
    }, [branchId]);

    const cancelaciones = cancellationsFromCount + cancellationsToCount;
    return {
        total: pedidosCount + enviosCount + cancelaciones,
        envios: enviosCount,
        pedidos: pedidosCount,
        cancelaciones,
    };
}
