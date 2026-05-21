import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

/**
 * Cuenta totales pendientes para el panel de Gerencia:
 *  - gastos operativos en estado PENDING_APPROVAL
 *  - solicitudes de anulación de venta en estado PENDING
 *  - solicitudes de aprobación de descuento en estado PENDING
 *  - cancelaciones de pedidos pendientes (cancellationPending=true)
 *  - cancelaciones de envíos en tránsito pendientes (cancellationPending=true)
 *  - alertas de discrepancia de transferencia no resueltas
 *
 * Activo solo cuando enabled=true (típicamente solo para GERENTE).
 */
export function usePendingApprovalsCount(enabled: boolean) {
    const [expenses, setExpenses] = useState(0);
    const [voids, setVoids] = useState(0);
    const [discounts, setDiscounts] = useState(0);
    const [pedidoCancels, setPedidoCancels] = useState(0);
    const [envioCancels, setEnvioCancels] = useState(0);
    const [discrepancies, setDiscrepancies] = useState(0);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const qExp = query(
            collection(db, 'gastos_operativos'),
            where('status', '==', 'PENDING_APPROVAL')
        );
        const unsubExp = onSnapshot(
            qExp,
            snap => setExpenses(snap.size),
            err => console.error('usePendingApprovalsCount(expenses):', err)
        );

        const qVoid = query(
            collection(db, 'pending_void_approvals'),
            where('status', '==', 'PENDING')
        );
        const unsubVoid = onSnapshot(
            qVoid,
            snap => setVoids(snap.size),
            err => console.error('usePendingApprovalsCount(voids):', err)
        );

        const qDisc = query(
            collection(db, 'pending_discount_approvals'),
            where('status', '==', 'PENDING')
        );
        const unsubDisc = onSnapshot(
            qDisc,
            snap => setDiscounts(snap.size),
            err => console.error('usePendingApprovalsCount(discounts):', err)
        );

        const qPedidoCancel = query(
            collection(db, 'pedidos'),
            where('cancellationPending', '==', true)
        );
        const unsubPedidoCancel = onSnapshot(
            qPedidoCancel,
            snap => setPedidoCancels(snap.size),
            err => console.error('usePendingApprovalsCount(pedidoCancels):', err)
        );

        const qEnvioCancel = query(
            collection(db, 'envios'),
            where('cancellationPending', '==', true)
        );
        const unsubEnvioCancel = onSnapshot(
            qEnvioCancel,
            snap => setEnvioCancels(snap.size),
            err => console.error('usePendingApprovalsCount(envioCancels):', err)
        );

        const qDiscrep = query(
            collection(db, 'audit_alerts'),
            where('type', '==', 'TRANSFER_DISCREPANCY')
        );
        const unsubDiscrep = onSnapshot(
            qDiscrep,
            snap => {
                const open = snap.docs.filter(d => !(d.data() as { resolved?: boolean }).resolved).length;
                setDiscrepancies(open);
            },
            err => console.error('usePendingApprovalsCount(discrepancies):', err)
        );

        return () => {
            unsubExp();
            unsubVoid();
            unsubDisc();
            unsubPedidoCancel();
            unsubEnvioCancel();
            unsubDiscrep();
        };
    }, [enabled]);

    const totalCancels = enabled ? pedidoCancels + envioCancels : 0;
    const totalDiscrepancies = enabled ? discrepancies : 0;

    return {
        expenses: enabled ? expenses : 0,
        voids: enabled ? voids : 0,
        discounts: enabled ? discounts : 0,
        cancellations: totalCancels,
        discrepancies: totalDiscrepancies,
        total: enabled
            ? expenses + voids + discounts + totalCancels + totalDiscrepancies
            : 0,
    };
}
