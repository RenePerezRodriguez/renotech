/**
 * reverseEntryAtomic — reversa un journal_entry creando uno espejo opuesto.
 * Permisos: gerente siempre. Cajero sólo si la sesión sigue abierta y el entry es suyo.
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAuth, round2, logAdmin } from './_helpers';
import { JournalDirection, JournalCategory, AccountType } from './types';

interface ReverseInput {
    entryId: string;
    reason: string;
}

export const reverseEntryAtomic = onCall<ReverseInput>({ region: 'us-central1' }, async (req) => {
    const auth = requireAuth(req);
    const { entryId, reason } = req.data || ({} as ReverseInput);

    if (!entryId) throw new HttpsError('invalid-argument', 'entryId obligatorio');
    if (!reason || reason.trim().length < 5) throw new HttpsError('invalid-argument', 'Razón debe tener al menos 5 caracteres');

    const db = admin.firestore();
    const entryRef = db.collection('journal_entries').doc(entryId);

    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(entryRef);
        if (!snap.exists) throw new HttpsError('not-found', 'Asiento no encontrado');
        const entry = snap.data() as {
            accountId: string; direction: JournalDirection; amount: number; paymentMethod: string;
            category: JournalCategory; description: string; referenceType: string; referenceId: string;
            sessionId?: string | null; branchId: string; userId: string;
        };

        if ((entry as { reversedByEntryId?: string }).reversedByEntryId) {
            throw new HttpsError('failed-precondition', 'Este asiento ya fue reversado');
        }
        if ((entry as { reversesEntryId?: string }).reversesEntryId) {
            throw new HttpsError('failed-precondition', 'No se puede reversar un asiento que ya es una reversión');
        }

        // Permisos: gerente siempre. Cajero sólo si dueño + sesión abierta + propio entry.
        if (auth.role !== 'GERENTE') {
            if (entry.userId !== auth.uid) throw new HttpsError('permission-denied', 'Solo el gerente puede reversar asientos ajenos');
            if (!entry.sessionId) throw new HttpsError('permission-denied', 'Asiento sin sesión: solo el gerente puede reversarlo');
            const sessSnap = await tx.get(db.collection('cashier_sessions').doc(entry.sessionId));
            if (!sessSnap.exists || (sessSnap.data() as { status: string }).status !== 'OPEN') {
                throw new HttpsError('failed-precondition', 'La sesión ya no está abierta. Pide a un gerente que reverse el asiento.');
            }
        }

        const accountRef = db.collection('accounts').doc(entry.accountId);
        const accSnap = await tx.get(accountRef);
        if (!accSnap.exists) throw new HttpsError('not-found', 'Cuenta no encontrada');
        const acc = accSnap.data() as { type: AccountType; isActive: boolean; currentBalance: number; name: string };
        if (!acc.isActive) throw new HttpsError('failed-precondition', `Cuenta ${acc.name} inactiva`);

        const reverseDirection: JournalDirection = entry.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT';
        const delta = reverseDirection === 'DEBIT' ? entry.amount : -entry.amount;
        const newBalance = round2((acc.currentBalance || 0) + delta);
        if (acc.type === 'CASH_DRAWER' && newBalance < 0) {
            throw new HttpsError('failed-precondition', `Saldo insuficiente para reversar: ${acc.name}`);
        }

        const reverseRef = db.collection('journal_entries').doc();
        const now = admin.firestore.FieldValue.serverTimestamp();

        tx.set(reverseRef, {
            accountId: entry.accountId,
            direction: reverseDirection,
            amount: entry.amount,
            paymentMethod: entry.paymentMethod,
            category: entry.category,
            description: `[REVERSO] ${entry.description} · ${reason.trim()}`,
            referenceType: entry.referenceType,
            referenceId: entry.referenceId,
            sessionId: entry.sessionId || null,
            branchId: entry.branchId,
            userId: auth.uid,
            userName: auth.name,
            date: now,
            reconciliationStatus: entry.paymentMethod === 'EFECTIVO' ? 'NOT_APPLICABLE' : 'PENDING',
            reversesEntryId: entryId,
        });

        tx.update(entryRef, {
            reversedByEntryId: reverseRef.id,
            voidedAt: now,
            voidReason: reason.trim(),
            voidedBy: auth.uid,
            voidedByName: auth.name,
        });

        tx.update(accountRef, {
            currentBalance: admin.firestore.FieldValue.increment(delta),
            updatedAt: now,
        });

        return { reverseId: reverseRef.id, branchId: entry.branchId, amount: entry.amount };
    });

    await logAdmin(auth.uid, auth.name, 'REVERSE_JOURNAL_ENTRY', entryId, result.branchId,
        `Reverso Bs. ${result.amount.toFixed(2)} · ${reason.trim()}`);

    return { success: true, reverseId: result.reverseId };
});
