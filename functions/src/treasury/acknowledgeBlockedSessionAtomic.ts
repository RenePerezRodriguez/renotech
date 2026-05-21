/**
 * acknowledgeBlockedSessionAtomic — gerente acepta una sesión BLOCKED y la deja CLOSED.
 *
 * Caso de uso: la cajera cerró su turno con una discrepancia CRÍTICA → el sistema
 * dejó la sesión en BLOCKED. El gerente investiga, decide aceptar la diferencia
 * (vs reabrir y volver a contar) y deja la sesión cerrada definitivamente.
 *
 * Si hay diferencia EFECTIVO != 0, asienta un AJUSTE para que el saldo del cajón
 * refleje la realidad declarada (mismo comportamiento que un cierre normal con
 * diferencia tolerada).
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireGerente, logAdmin } from './_helpers';
import { SessionStatus } from './types';

interface AckInput {
    sessionId: string;
    reason: string;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

export const acknowledgeBlockedSessionAtomic = onCall<AckInput>({ region: 'us-central1' }, async (req) => {
    const auth = requireGerente(req);
    const { sessionId, reason } = req.data || ({} as AckInput);

    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId obligatorio');
    if (!reason || reason.trim().length < 10) {
        throw new HttpsError('invalid-argument', 'Razón debe tener al menos 10 caracteres');
    }

    const db = admin.firestore();
    const sessionRef = db.collection('cashier_sessions').doc(sessionId);

    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(sessionRef);
        if (!snap.exists) throw new HttpsError('not-found', 'Sesión no encontrada');
        const session = snap.data() as {
            cashierId: string; cashierName?: string; status: SessionStatus; branchId: string;
            cashDrawerId: string;
            closingDifference?: { EFECTIVO?: number; QR?: number; TRANSFERENCIA?: number; total?: number };
        };

        if (session.status !== 'BLOCKED') {
            throw new HttpsError('failed-precondition', 'Solo sesiones BLOQUEADAS pueden ser aceptadas');
        }

        const diffEfectivo = session.closingDifference?.EFECTIVO ?? 0;

        // Asentar AJUSTE para EFECTIVO si hubo diferencia (sin esto, el cajón
        // queda con saldo "fantasma" que no concuerda con el conteo declarado).
        if (Math.abs(diffEfectivo) >= 0.01) {
            const adjAmount = Math.abs(diffEfectivo);
            const direction = diffEfectivo > 0 ? 'DEBIT' : 'CREDIT'; // sobra = DEBIT, falta = CREDIT
            const category = diffEfectivo > 0 ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO';
            const accountRef = db.collection('accounts').doc(session.cashDrawerId);
            const accSnap = await tx.get(accountRef);
            if (accSnap.exists) {
                const currentBalance = (accSnap.data() as { currentBalance?: number }).currentBalance ?? 0;
                const newBalance = direction === 'DEBIT'
                    ? round2(currentBalance + adjAmount)
                    : round2(currentBalance - adjAmount);
                if (newBalance < -0.01) {
                    throw new HttpsError('failed-precondition',
                        `El ajuste dejaría el cajón en saldo negativo (Bs. ${newBalance.toFixed(2)}). Reabre la sesión y revisa los movimientos antes de aceptar.`);
                }
                tx.update(accountRef, { currentBalance: newBalance, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

                const entryRef = db.collection('journal_entries').doc();
                tx.set(entryRef, {
                    accountId: session.cashDrawerId,
                    direction,
                    amount: adjAmount,
                    paymentMethod: 'EFECTIVO',
                    category,
                    description: `Ajuste por aceptación de sesión bloqueada — ${reason.trim()}`,
                    referenceType: 'SESSION_CLOSE_ADJUSTMENT',
                    referenceId: sessionId,
                    sessionId,
                    branchId: session.branchId,
                    userId: auth.uid,
                    userName: auth.name,
                    date: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    reconciliationStatus: 'NOT_APPLICABLE',
                });
            }
        }

        tx.update(sessionRef, {
            status: 'CLOSED' as SessionStatus,
            blockedAcknowledgedAt: admin.firestore.FieldValue.serverTimestamp(),
            blockedAcknowledgedBy: auth.uid,
            blockedAcknowledgedByName: auth.name,
            blockedAcknowledgedByRole: auth.role,
            blockedAcknowledgeReason: reason.trim(),
        });

        return { branchId: session.branchId, cashierName: session.cashierName || '—' };
    });

    await logAdmin(
        auth.uid,
        auth.name,
        'ACKNOWLEDGE_BLOCKED_SESSION',
        sessionId,
        result.branchId,
        `Sesión de ${result.cashierName} aceptada con discrepancia crítica. Motivo: ${reason.trim()}`,
    );

    return { success: true };
});
