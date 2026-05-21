'use client';

import { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface InTransitState {
    /** Mapa masterId -> unidades totales en tránsito hacia la sucursal */
    byMaster: Record<string, number>;
    /** Total general de unidades en tránsito */
    total: number;
    loading: boolean;
}

/**
 * Suscripción en tiempo real al stock "en tránsito".
 * - Si `branchId` es un id concreto: suma envíos cuyo `toBranchId == branchId`.
 * - Si `branchId === 'ALL'`: suma TODOS los envíos en tránsito de la organización (vista consolidada).
 * - Si `branchId` es undefined o '': retorna estado vacío.
 *
 * Excluye envíos con `cancellationPending=true` o cuyo status no sea `en_transito`
 * (defensa contra datos inconsistentes).
 */
export function useInTransitStock(branchId: string | undefined): InTransitState {
    const [state, setState] = useState<InTransitState>({ byMaster: {}, total: 0, loading: true });
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;

        if (!branchId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setState({ byMaster: {}, total: 0, loading: false });
            return () => {
                isMountedRef.current = false;
            };
        }

        const qEnvios = branchId === 'ALL'
            ? query(
                collection(db, 'envios'),
                where('status', '==', 'en_transito'),
            )
            : query(
                collection(db, 'envios'),
                where('status', '==', 'en_transito'),
                where('toBranchId', '==', branchId),
            );

        const unsub = onSnapshot(qEnvios, async (snap) => {
            if (!isMountedRef.current) return;
            // Defensa: además del where(status), filtrar cancellationPending y validar status en cliente
            const envios = snap.docs.filter(d => {
                const data = d.data() as { cancellationPending?: boolean; status?: string };
                return !data.cancellationPending && data.status === 'en_transito';
            });
            if (envios.length === 0) {
                if (isMountedRef.current) setState({ byMaster: {}, total: 0, loading: false });
                return;
            }

            try {
                const itemsSnaps = await Promise.all(
                    envios.map(d => getDocs(collection(db, 'envios', d.id, 'items')))
                );
                if (!isMountedRef.current) return;

                const byMaster: Record<string, number> = {};
                let total = 0;
                for (const itemsSnap of itemsSnaps) {
                    itemsSnap.docs.forEach(it => {
                        const data = it.data();
                        const masterId = typeof data?.masterId === 'string' ? data.masterId : '';
                        const qtyEnviada = typeof data?.qtyEnviada === 'number' ? data.qtyEnviada : 0;
                        if (!masterId || qtyEnviada <= 0) return;
                        byMaster[masterId] = (byMaster[masterId] || 0) + qtyEnviada;
                        total += qtyEnviada;
                    });
                }

                if (isMountedRef.current) setState({ byMaster, total, loading: false });
            } catch (err) {
                console.error('[useInTransitStock] items fetch error:', err);
                if (isMountedRef.current) setState({ byMaster: {}, total: 0, loading: false });
            }
        }, (err) => {
            console.error('[useInTransitStock] snapshot error:', err);
            if (isMountedRef.current) setState({ byMaster: {}, total: 0, loading: false });
        });

        return () => {
            isMountedRef.current = false;
            unsub();
        };
    }, [branchId]);

    return state;
}
