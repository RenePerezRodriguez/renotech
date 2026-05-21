'use client';

import { db } from '@/lib/firebase';
import { doc, runTransaction, Transaction } from 'firebase/firestore';

/**
 * CounterService — Correlativos secuenciales atómicos.
 *
 * Documento único: counters/sequences
 * Campos: pedidoSeq (number), envioSeq (number)
 *
 * Uso típico:
 *   const n = await CounterService.next('pedidoSeq');
 *   const codigo = `PED-${String(n).padStart(4, '0')}`;
 *
 * Variante in-transaction (cuando ya estás dentro de runTransaction):
 *   const n = await CounterService.nextInTx(tx, 'envioSeq');
 */

const COUNTERS_DOC = 'counters/sequences';

export type SequenceField = 'pedidoSeq' | 'envioSeq' | 'envioDirectoSeq';

export const CounterService = {
    /**
     * Reserva e incrementa el siguiente número del correlativo indicado.
     * Crea el documento si no existe.
     */
    async next(field: SequenceField): Promise<number> {
        const ref = doc(db, COUNTERS_DOC);
        return await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            const current = snap.exists() ? (snap.data()[field] as number | undefined) || 0 : 0;
            const nextVal = current + 1;
            tx.set(ref, { [field]: nextVal }, { merge: true });
            return nextVal;
        });
    },

    /**
     * Versión para usar dentro de un runTransaction existente.
     * IMPORTANTE: debe llamarse antes de cualquier write en la misma transacción
     * (Firestore exige que todas las lecturas precedan a las escrituras).
     */
    async nextInTx(tx: Transaction, field: SequenceField): Promise<number> {
        const ref = doc(db, COUNTERS_DOC);
        const snap = await tx.get(ref);
        const current = snap.exists() ? (snap.data()![field] as number | undefined) || 0 : 0;
        const nextVal = current + 1;
        tx.set(ref, { [field]: nextVal }, { merge: true });
        return nextVal;
    },

    /**
     * Helpers de formato para mantener consistencia visual en UI/PDF.
     */
    formatPedido(n: number): string {
        return `PED-${String(n).padStart(4, '0')}`;
    },

    formatEnvio(n: number): string {
        return `ENV-${String(n).padStart(4, '0')}`;
    },

    formatEnvioDirecto(n: number): string {
        return `ENVD-${String(n).padStart(4, '0')}`;
    },
};
