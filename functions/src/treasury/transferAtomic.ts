/**
 * transferAtomic — traslado entre dos cuentas.
 * Crea dos asientos espejo (CREDIT origen + DEBIT destino) atómicamente
 * y actualiza saldos de ambas cuentas en una sola transacción.
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAuth, round2, logAdmin } from './_helpers';
import { JournalCategory, ReferenceType, AccountType } from './types';

interface TransferInput {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    description: string;
    sessionId?: string | null;        // legacy/compat: aplica a ambos lados CASH_DRAWER
    fromSessionId?: string | null;    // sesi\u00f3n OPEN del caj\u00f3n origen (si aplica)
    toSessionId?: string | null;      // sesi\u00f3n OPEN del caj\u00f3n destino (si aplica)
    referenceType?: ReferenceType;
    referenceId?: string;
    bankRef?: string;
}

export const transferAtomic = onCall<TransferInput>({ region: 'us-central1' }, async (req) => {
    const auth = requireAuth(req);
    const { fromAccountId, toAccountId, amount, description } = req.data || ({} as TransferInput);

    if (!fromAccountId || !toAccountId) throw new HttpsError('invalid-argument', 'Cuentas obligatorias');
    if (fromAccountId === toAccountId) throw new HttpsError('invalid-argument', 'Origen y destino no pueden ser iguales');
    if (!amount || amount <= 0) throw new HttpsError('invalid-argument', 'Monto debe ser positivo');
    if (!description || description.trim().length < 3) throw new HttpsError('invalid-argument', 'Descripción mínima 3 caracteres');

    const amt = round2(amount);
    const db = admin.firestore();

    const result = await db.runTransaction(async (tx) => {
        const fromRef = db.collection('accounts').doc(fromAccountId);
        const toRef = db.collection('accounts').doc(toAccountId);
        const [fromSnap, toSnap] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);

        if (!fromSnap.exists) throw new HttpsError('not-found', `Cuenta origen no encontrada`);
        if (!toSnap.exists) throw new HttpsError('not-found', `Cuenta destino no encontrada`);

        const from = fromSnap.data() as { type: AccountType; name: string; isActive: boolean; currentBalance: number; branchId?: string; cashDrawerPurpose?: 'POS' | 'VAULT' };
        const to = toSnap.data() as { type: AccountType; name: string; isActive: boolean; currentBalance: number; branchId?: string; cashDrawerPurpose?: 'POS' | 'VAULT' };

        const inferDrawerPurpose = (name?: string): 'POS' | 'VAULT' => {
            if (!name) return 'POS';
            const lower = name.toLowerCase();
            return lower.includes('boveda') || lower.includes('vault') ? 'VAULT' : 'POS';
        };

        const fromPurpose = from.cashDrawerPurpose ?? inferDrawerPurpose(from.name);
        const toPurpose = to.cashDrawerPurpose ?? inferDrawerPurpose(to.name);

        if (!from.isActive) throw new HttpsError('failed-precondition', `Cuenta origen ${from.name} inactiva`);
        if (!to.isActive) throw new HttpsError('failed-precondition', `Cuenta destino ${to.name} inactiva`);

        // Aislamiento por sucursal: el caller debe pertenecer a la branch de las cuentas
        // tocadas (excepto GERENTE, que opera globalmente, y excepto bóvedas/cuentas
        // sin branchId que son globales por diseño).
        if (auth.role !== 'GERENTE') {
            const fromIsGlobal = !from.branchId || (from.type === 'CASH_DRAWER' && fromPurpose === 'VAULT');
            const toIsGlobal = !to.branchId || (to.type === 'CASH_DRAWER' && toPurpose === 'VAULT');
            if (!fromIsGlobal && from.branchId !== auth.branchId) {
                throw new HttpsError('permission-denied', `No tienes acceso a ${from.name} (otra sucursal)`);
            }
            if (!toIsGlobal && to.branchId !== auth.branchId) {
                throw new HttpsError('permission-denied', `No tienes acceso a ${to.name} (otra sucursal)`);
            }
        }

        const fromBalance = round2((from.currentBalance || 0) - amt);
        if (from.type === 'CASH_DRAWER' && fromBalance < 0) {
            throw new HttpsError('failed-precondition', `Saldo insuficiente en ${from.name}: Bs. ${(from.currentBalance || 0).toFixed(2)}`);
        }

        // Resoluci\u00f3n y validaci\u00f3n de sesiones para cajones.
        // Si origen/destino es CASH_DRAWER y el cliente NO env\u00eda sessionId, lo resolvemos
        // server-side (admin SDK bypassa rules \u2192 soporta cross-branch).
        // Sigue siendo obligatorio que exista sesi\u00f3n OPEN del cajero para ese cajón.
        const legacySessionId = req.data.sessionId || null;
        let fromSessionId: string | null = req.data.fromSessionId ?? legacySessionId ?? null;
        let toSessionId: string | null = req.data.toSessionId ?? legacySessionId ?? null;

        const resolveCashDrawerSession = async (accountId: string, accountName: string): Promise<string> => {
            const openSnap = await tx.get(
                db.collection('cashier_sessions')
                    .where('cashDrawerId', '==', accountId)
                    .where('status', '==', 'OPEN')
            );
            if (openSnap.empty) {
                throw new HttpsError('failed-precondition',
                    `El caj\u00f3n ${accountName} no tiene sesi\u00f3n OPEN. Abre una sesi\u00f3n antes de transferir.`);
            }
            if (openSnap.size > 1) {
                throw new HttpsError('failed-precondition',
                    `El caj\u00f3n ${accountName} tiene m\u00faltiples sesiones OPEN. Cierra alguna antes.`);
            }
            return openSnap.docs[0].id;
        };

        if (from.type === 'CASH_DRAWER') {
            const requiresSession = fromPurpose !== 'VAULT';
            if (!requiresSession) {
                fromSessionId = null;
            } else if (!fromSessionId) {
                fromSessionId = await resolveCashDrawerSession(fromAccountId, from.name);
            } else {
                const sSnap = await tx.get(db.collection('cashier_sessions').doc(fromSessionId));
                if (!sSnap.exists) throw new HttpsError('not-found', 'Sesi\u00f3n origen no encontrada');
                const s = sSnap.data() as { status: string; cashDrawerId: string };
                if (s.status !== 'OPEN') throw new HttpsError('failed-precondition', 'Sesi\u00f3n origen no est\u00e1 abierta');
                if (s.cashDrawerId !== fromAccountId) throw new HttpsError('failed-precondition',
                    'La sesi\u00f3n origen no pertenece al caj\u00f3n indicado');
            }
        } else {
            fromSessionId = null;
        }

        if (to.type === 'CASH_DRAWER') {
            const requiresSession = toPurpose !== 'VAULT';
            if (!requiresSession) {
                toSessionId = null;
            } else if (!toSessionId) {
                toSessionId = await resolveCashDrawerSession(toAccountId, to.name);
            } else {
                const sSnap = await tx.get(db.collection('cashier_sessions').doc(toSessionId));
                if (!sSnap.exists) throw new HttpsError('not-found', 'Sesi\u00f3n destino no encontrada');
                const s = sSnap.data() as { status: string; cashDrawerId: string };
                if (s.status !== 'OPEN') throw new HttpsError('failed-precondition', 'Sesi\u00f3n destino no est\u00e1 abierta');
                if (s.cashDrawerId !== toAccountId) throw new HttpsError('failed-precondition',
                    'La sesi\u00f3n destino no pertenece al caj\u00f3n indicado');
            }
        } else {
            toSessionId = null;
        }

        // Determinar paymentMethod: cajón→EFECTIVO, sino TRANSFERENCIA por defecto
        const fromMethod = from.type === 'CASH_DRAWER' ? 'EFECTIVO' : 'TRANSFERENCIA';
        const toMethod = to.type === 'CASH_DRAWER' ? 'EFECTIVO' : 'TRANSFERENCIA';

        const now = admin.firestore.FieldValue.serverTimestamp();

        // Pre-asignar IDs para crossref
        const egresoRef = db.collection('journal_entries').doc();
        const ingresoRef = db.collection('journal_entries').doc();

        const baseRef: ReferenceType = req.data.referenceType || 'CASH_TRANSFER';
        const baseRefId = req.data.referenceId || egresoRef.id;

        tx.set(egresoRef, {
            accountId: fromAccountId,
            direction: 'CREDIT',
            amount: amt,
            paymentMethod: fromMethod,
            category: 'TRASLADO_EGRESO' as JournalCategory,
            description: `→ ${to.name}: ${description.trim()}`,
            referenceType: baseRef,
            referenceId: baseRefId,
            sessionId: fromSessionId,
            branchId: from.branchId || '',
            userId: auth.uid,
            userName: auth.name,
            date: now,
            reconciliationStatus: fromMethod === 'EFECTIVO' ? 'NOT_APPLICABLE' : 'PENDING',
            bankRef: req.data.bankRef || null,
            relatedEntryId: ingresoRef.id,
        });

        tx.set(ingresoRef, {
            accountId: toAccountId,
            direction: 'DEBIT',
            amount: amt,
            paymentMethod: toMethod,
            category: 'TRASLADO_INGRESO' as JournalCategory,
            description: `← ${from.name}: ${description.trim()}`,
            referenceType: baseRef,
            referenceId: baseRefId,
            sessionId: toSessionId,
            branchId: to.branchId || '',
            userId: auth.uid,
            userName: auth.name,
            date: now,
            reconciliationStatus: toMethod === 'EFECTIVO' ? 'NOT_APPLICABLE' : 'PENDING',
            bankRef: req.data.bankRef || null,
            relatedEntryId: egresoRef.id,
        });

        tx.update(fromRef, {
            currentBalance: admin.firestore.FieldValue.increment(-amt),
            updatedAt: now,
        });
        tx.update(toRef, {
            currentBalance: admin.firestore.FieldValue.increment(amt),
            updatedAt: now,
        });

        return { egresoId: egresoRef.id, ingresoId: ingresoRef.id, fromName: from.name, toName: to.name };
    });

    await logAdmin(auth.uid, auth.name, 'TRANSFER_ATOMIC', result.egresoId,
        auth.branchId, `Bs. ${amt.toFixed(2)} · ${result.fromName} → ${result.toName}`);

    return { success: true, ...result };
});
