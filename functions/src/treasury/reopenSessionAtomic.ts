/**
 * reopenSessionAtomic — reapertura server-side de una sesión cerrada.
 * Solo GERENTE. Atómica:
 *   1. Lee la sesión target.
 *   2. Verifica que el cajero NO tenga otra sesión OPEN (race-safe vs `openSessionAtomic`).
 *   3. Revierte el asiento de AJUSTE de cierre (si existe) para que `accounts.currentBalance`
 *      vuelva al estado pre-cierre (sino, al cerrar de nuevo se aplicaría doble ajuste).
 *   4. Actualiza status=OPEN + auditoría.
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireGerente, round2, logAdmin } from './_helpers';
import { SessionStatus } from './types';

interface ReopenInput {
    sessionId: string;
    reason: string;
    acknowledgeBlocked?: boolean;
}

export const reopenSessionAtomic = onCall<ReopenInput>({ region: 'us-central1' }, async (req) => {
    const auth = requireGerente(req);
    const { sessionId, reason, acknowledgeBlocked } = req.data || ({} as ReopenInput);

    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId obligatorio');
    if (!reason || reason.trim().length < 10) {
        throw new HttpsError('invalid-argument', 'Razón debe tener al menos 10 caracteres');
    }

    const db = admin.firestore();
    const sessionRef = db.collection('cashier_sessions').doc(sessionId);

    // Pre-lectura (fuera de tx) del asiento de ajuste de cierre, si existe. Lo necesitamos para
    // revertirlo. Es seguro porque (a) la sesión está CLOSED/BLOCKED/FORCE_CLOSED → no se crean
    // nuevos AJUSTE_CIERRE concurrentes, y (b) si dejamos de encontrar el doc dentro de la tx,
    // simplemente no aplicamos reverso (idempotente).
    const closeAdjSnap = await db.collection('journal_entries')
        .where('referenceType', '==', 'SESSION_CLOSE_ADJUSTMENT')
        .where('referenceId', '==', sessionId)
        .get();

    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(sessionRef);
        if (!snap.exists) throw new HttpsError('not-found', 'Sesión no encontrada');
        const session = snap.data() as { cashierId: string; status: SessionStatus; branchId: string; cashDrawerId: string };

        if (session.status === 'OPEN') {
            throw new HttpsError('failed-precondition', 'La sesión ya está abierta');
        }
        if (session.status === 'BLOCKED' && !acknowledgeBlocked) {
            throw new HttpsError('failed-precondition',
                'La sesión está BLOQUEADA por discrepancia crítica. Confirma la revisión para reabrirla.');
        }

        // Verificación atómica: el cajero NO debe tener otra sesión OPEN.
        const openSnap = await tx.get(
            db.collection('cashier_sessions')
                .where('cashierId', '==', session.cashierId)
                .where('status', '==', 'OPEN')
        );
        if (!openSnap.empty) {
            throw new HttpsError('failed-precondition',
                'El cajero ya tiene otra sesión abierta. Ciérrala antes de reabrir esta.');
        }

        // Revertir asientos de ajuste de cierre (si los hay) para no dejar el saldo "doble-ajustado"
        // cuando se vuelva a cerrar. El reverso crea un asiento espejo + ajusta currentBalance.
        let totalReversed = 0;
        if (!closeAdjSnap.empty) {
            const accRef = db.collection('accounts').doc(session.cashDrawerId);
            const accSnapTx = await tx.get(accRef);
            if (!accSnapTx.exists) {
                throw new HttpsError('not-found', 'Cuenta cajón no encontrada para revertir ajuste');
            }
            const accData = accSnapTx.data() as { currentBalance?: number };
            let runningBal = round2(accData.currentBalance || 0);

            for (const adjDoc of closeAdjSnap.docs) {
                const adj = adjDoc.data() as { amount: number; direction: 'DEBIT' | 'CREDIT'; reversedByEntryId?: string };
                if (adj.reversedByEntryId) continue; // ya revertido
                const reverseDir = adj.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT';
                const sign = reverseDir === 'DEBIT' ? 1 : -1;
                runningBal = round2(runningBal + sign * adj.amount);

                const reverseRef = db.collection('journal_entries').doc();
                tx.set(reverseRef, {
                    accountId: session.cashDrawerId,
                    amount: adj.amount,
                    paymentMethod: 'EFECTIVO',
                    category: reverseDir === 'DEBIT' ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
                    direction: reverseDir,
                    description: `Reverso de ajuste de cierre por reapertura de sesión ${sessionId}`,
                    referenceType: 'SESSION_CLOSE_ADJUSTMENT_REVERSAL',
                    referenceId: sessionId,
                    sessionId: sessionId,
                    branchId: session.branchId,
                    userId: auth.uid,
                    userName: auth.name || 'gerente',
                    date: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    reconciliationStatus: 'NOT_APPLICABLE',
                    reversesEntryId: adjDoc.id,
                });
                tx.update(adjDoc.ref, { reversedByEntryId: reverseRef.id });
                totalReversed += sign * adj.amount;
            }

            tx.update(accRef, {
                currentBalance: runningBal,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        tx.update(sessionRef, {
            status: 'OPEN' as SessionStatus,
            closedAt: null,
            // Conservamos closingDeclared/Expected/Difference para auditoría histórica;
            // el siguiente cierre los sobreescribirá.
            reopenedAt: admin.firestore.FieldValue.serverTimestamp(),
            reopenedBy: auth.uid,
            reopenedByName: auth.name,
            reopenedByRole: auth.role,
            reopenReason: reason.trim(),
            reopenAdjustmentReversed: totalReversed,
        });

        return { branchId: session.branchId, totalReversed };
    });

    const reverseNote = Math.abs(result.totalReversed) >= 0.01
        ? ` · ajuste de cierre revertido Bs. ${result.totalReversed.toFixed(2)}`
        : '';
    await logAdmin(auth.uid, auth.name, 'REOPEN_SESSION', sessionId, result.branchId, `${reason.trim()}${reverseNote}`);

    return { success: true, adjustmentReversed: result.totalReversed };
});
