/**
 * forceCloseSessionAtomic — gerente cierra forzadamente una sesión OPEN ajena.
 * Auto-cuadra los totales (diff = 0) y registra razón obligatoria.
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireGerente, round2, logAdmin } from './_helpers';
import { SessionStatus } from './types';

interface ForceCloseInput {
    sessionId: string;
    reason: string;
}

export const forceCloseSessionAtomic = onCall<ForceCloseInput>({ region: 'us-central1' }, async (req) => {
    const auth = requireGerente(req);
    const { sessionId, reason } = req.data || ({} as ForceCloseInput);

    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId obligatorio');
    if (!reason || reason.trim().length < 10) throw new HttpsError('invalid-argument', 'Razón debe tener al menos 10 caracteres');

    const db = admin.firestore();
    const sessionRef = db.collection('cashier_sessions').doc(sessionId);

    const branchId = await db.runTransaction(async (tx) => {
        const snap = await tx.get(sessionRef);
        if (!snap.exists) throw new HttpsError('not-found', 'Sesión no encontrada');
        const session = snap.data() as { status: SessionStatus; openingTotal: number; branchId: string; openedAt: admin.firestore.Timestamp | Date };
        if (session.status !== 'OPEN') throw new HttpsError('failed-precondition', 'Solo sesiones abiertas pueden cerrarse forzadamente');

        // EFECTIVO: entries con sessionId == X (dentro de tx para atomicidad).
        const entriesSnap = await tx.get(
            db.collection('journal_entries').where('sessionId', '==', sessionId)
        );
        let efectivoNeto = 0;
        entriesSnap.docs.forEach(d => {
            const e = d.data() as { paymentMethod: string; direction: string; amount: number };
            const sign = e.direction === 'DEBIT' ? 1 : -1;
            if (e.paymentMethod === 'EFECTIVO') efectivoNeto += sign * e.amount;
        });

        // QR/TRANSFERENCIA: viven en BANK/WALLET (sessionId null). Filtrar por branchId + ventana.
        const openedAt = (session.openedAt as admin.firestore.Timestamp)?.toDate?.()
            ?? (session.openedAt instanceof Date ? session.openedAt : new Date(session.openedAt as unknown as string));
        const closedAt = new Date();
        const digitalSnap = await tx.get(
            db.collection('journal_entries')
                .where('branchId', '==', session.branchId)
                .where('paymentMethod', 'in', ['QR', 'TRANSFERENCIA'])
        );
        let qrNeto = 0, transferNeto = 0;
        digitalSnap.docs.forEach(d => {
            const e = d.data() as { paymentMethod: string; direction: string; amount: number; date: admin.firestore.Timestamp | Date; sessionId?: string | null };
            if (e.sessionId && e.sessionId !== sessionId) return;
            const entryDate = (e.date as admin.firestore.Timestamp)?.toDate?.()
                ?? (e.date instanceof Date ? e.date : new Date(e.date as unknown as string));
            if (!entryDate || Number.isNaN(entryDate.getTime())) return;
            if (!e.sessionId && (entryDate < openedAt || entryDate > closedAt)) return;
            const sign = e.direction === 'DEBIT' ? 1 : -1;
            if (e.paymentMethod === 'QR') qrNeto += sign * e.amount;
            else if (e.paymentMethod === 'TRANSFERENCIA') transferNeto += sign * e.amount;
        });

        const expected = {
            EFECTIVO: round2((session.openingTotal || 0) + efectivoNeto),
            QR: round2(qrNeto),
            TRANSFERENCIA: round2(transferNeto),
        };

        tx.update(sessionRef, {
            status: 'FORCE_CLOSED' as SessionStatus,
            closedAt: admin.firestore.FieldValue.serverTimestamp(),
            closingDeclared: expected,
            closingExpected: expected,
            closingDifference: { EFECTIVO: 0, QR: 0, TRANSFERENCIA: 0, total: 0 },
            discrepancySeverity: 'NONE',
            forceClosedBy: auth.uid,
            forceClosedByName: auth.name,
            forceClosedByRole: auth.role,
            forceCloseReason: reason.trim(),
        });

        return session.branchId;
    });

    await logAdmin(auth.uid, auth.name, 'FORCE_CLOSE_SESSION', sessionId, branchId, `Razón: ${reason.trim()}`);
    return { success: true };
});
