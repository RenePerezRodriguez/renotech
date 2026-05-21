/**
 * openSessionAtomic — apertura de sesión de cajero atómica server-side.
 * - Valida que no exista otra sesión OPEN en la misma sucursal (race-safe usando runTransaction).
 * - Valida que el cajón sea CASH_DRAWER activo.
 * - Primera sesión (sin sesiones previas): acepta cualquier monto como saldo inicial.
 * - Siguientes sesiones: el efectivo declarado DEBE coincidir EXACTAMENTE con currentBalance.
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAuth, round2, logAdmin } from './_helpers';
import { calculateDenominationsTotal, SessionStatus, AccountType } from './types';

interface OpenSessionInput {
    cashDrawerId: string;
    cashierName: string;
    cashierRole?: string;
    openingDenominations: Record<string, number>;
    openingNotes?: string;
}

export const openSessionAtomic = onCall<OpenSessionInput>({ region: 'us-central1' }, async (req) => {
    const auth = requireAuth(req);
    const { cashDrawerId, cashierName, cashierRole, openingDenominations, openingNotes } = req.data || ({} as OpenSessionInput);

    if (!cashDrawerId) throw new HttpsError('invalid-argument', 'cashDrawerId obligatorio');
    if (!cashierName) throw new HttpsError('invalid-argument', 'cashierName obligatorio');
    if (!openingDenominations || typeof openingDenominations !== 'object') {
        throw new HttpsError('invalid-argument', 'openingDenominations obligatorio');
    }

    const openingTotal = round2(calculateDenominationsTotal(openingDenominations));
    if (openingTotal < 0) throw new HttpsError('invalid-argument', 'openingTotal inválido');

    const db = admin.firestore();
    const accRef = db.collection('accounts').doc(cashDrawerId);

    const result = await db.runTransaction(async (tx) => {
        const accSnap = await tx.get(accRef);
        if (!accSnap.exists) throw new HttpsError('not-found', 'Cajón no encontrado');
        const acc = accSnap.data() as { type: AccountType; isActive: boolean; name: string; branchId?: string; currentBalance?: number };
        if (acc.type !== 'CASH_DRAWER') throw new HttpsError('failed-precondition', 'La cuenta no es un cajón físico');
        if (!acc.isActive) throw new HttpsError('failed-precondition', `Cajón inactivo: ${acc.name}`);
        // BUG-01: branchId vacío causaría que la query busque '' y podría saltarse la validación
        if (!acc.branchId) throw new HttpsError('failed-precondition', 'El cajón no tiene sucursal asignada. Pide al gerente que lo configure en Tesorería → Cuentas.');

        // Verificar que no haya otra sesión OPEN en la misma sucursal.
        const openQ = db.collection('cashier_sessions')
            .where('branchId', '==', acc.branchId)
            .where('status', '==', 'OPEN');
        const openSnap = await tx.get(openQ);
        if (!openSnap.empty) {
            throw new HttpsError('failed-precondition',
                'Ya hay una sesión abierta en esta sucursal. Cierra esa sesión antes de abrir una nueva.');
        }

        // Determinar si es primera sesión: no existen sesiones previas no-canceladas para este cajón.
        const prevSessionsQ = db.collection('cashier_sessions')
            .where('cashDrawerId', '==', cashDrawerId)
            .where('status', 'in', ['OPEN', 'CLOSED', 'FORCE_CLOSED', 'BLOCKED']);
        const prevSessionsSnap = await tx.get(prevSessionsQ);
        const isFirstSession = prevSessionsSnap.empty;

        const previousBalance = round2(acc.currentBalance || 0);

        if (isFirstSession) {
            // Primera sesión: el monto declarado se acepta tal cual como saldo inicial.
            // Se actualiza currentBalance del cajón directamente.
            const sessionRef = db.collection('cashier_sessions').doc();
            tx.set(sessionRef, {
                cashDrawerId,
                branchId: acc.branchId || '',
                cashierId: auth.uid,
                cashierName,
                cashierRole: cashierRole || auth.role || '',
                status: 'OPEN' as SessionStatus,
                openedAt: admin.firestore.FieldValue.serverTimestamp(),
                openingDenominations,
                openingTotal,
                openingPreviousBalance: 0,
                openingDifference: openingTotal,
                isFirstSession: true,
                openingNotes: openingNotes || '',
            });

            tx.update(accRef, {
                currentBalance: openingTotal,
                openingBalance: openingTotal,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return { sessionId: sessionRef.id, branchId: acc.branchId || 'HQ', accName: acc.name, isFirstSession: true };
        }

        // Sesiones posteriores: el efectivo DEBE coincidir EXACTAMENTE con el saldo del cajón.
        if (Math.abs(openingTotal - previousBalance) >= 0.01) {
            throw new HttpsError('failed-precondition',
                `El efectivo declarado (Bs. ${openingTotal.toFixed(2)}) no coincide con el saldo del cajón (Bs. ${previousBalance.toFixed(2)}). ` +
                'El efectivo físico no puede cambiar entre el cierre y la apertura. Verificá el conteo.');
        }

        const sessionRef = db.collection('cashier_sessions').doc();
        tx.set(sessionRef, {
            cashDrawerId,
            branchId: acc.branchId || '',
            cashierId: auth.uid,
            cashierName,
            cashierRole: cashierRole || auth.role || '',
            status: 'OPEN' as SessionStatus,
            openedAt: admin.firestore.FieldValue.serverTimestamp(),
            openingDenominations,
            openingTotal,
            openingPreviousBalance: previousBalance,
            openingDifference: 0,
            isFirstSession: false,
            openingNotes: openingNotes || '',
        });

        return { sessionId: sessionRef.id, branchId: acc.branchId || 'HQ', accName: acc.name, isFirstSession: false };
    });

    const note = result.isFirstSession
        ? ` · primera sesión — saldo inicial Bs. ${openingTotal.toFixed(2)}`
        : '';

    // BUG-03: logAdmin post-transacción no debe propagar el error — la sesión ya fue abierta
    // en Firestore. Si el audit log falla, lo registramos en console pero no engañamos al cajero.
    try {
        await logAdmin(auth.uid, auth.name, 'OPEN_CASHIER_SESSION', result.sessionId,
            result.branchId, `Sesión abierta · cajón ${result.accName} · efectivo inicial Bs. ${openingTotal.toFixed(2)}${note}`);
    } catch (logErr) {
        console.error('[openSessionAtomic] Audit log falló — sesión ya abierta:', result.sessionId, logErr);
    }

    return { success: true, sessionId: result.sessionId, isFirstSession: result.isFirstSession };
});
