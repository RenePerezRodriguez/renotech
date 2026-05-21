/**
 * closeSessionAtomic — cierre de sesión de cajero atómico server-side.
 * - Verifica que el caller sea un usuario de la misma sucursal (o gerente).
 * - Calcula totales esperados sumando journal_entries con sessionId.
 * - Compara con declarados (denominaciones + totales QR/TRANSFER).
 * - Determina severidad de discrepancia según TreasuryConfig.
 * - CRÍTICA → status='BLOCKED' (no cierra). MEDIUM/HIGH → requiere confirmedDiscrepancy.
 * - Cierra atómicamente.
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAuth, round2, logAdmin } from './_helpers';
import { calculateDenominationsTotal, SessionStatus } from './types';

interface CloseSessionInput {
    sessionId: string;
    closingDenominations: Record<string, number>;
    declaredQR: number;
    declaredTransferencia: number;
    closingNotes?: string;
    confirmedDiscrepancy?: boolean;
}

interface TreasuryConfigData {
    discrepancyTolerance: number;
    discrepancyMedium: number;
    discrepancyHigh: number;
}

const DEFAULT_CFG: TreasuryConfigData = {
    discrepancyTolerance: 1,
    discrepancyMedium: 20,
    discrepancyHigh: 100,
};

export const closeSessionAtomic = onCall<CloseSessionInput>({ region: 'us-central1' }, async (req) => {
    const auth = requireAuth(req);
    const { sessionId, closingDenominations, declaredQR, declaredTransferencia, closingNotes, confirmedDiscrepancy } = req.data || ({} as CloseSessionInput);

    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId obligatorio');
    if (!closingDenominations || typeof closingDenominations !== 'object') {
        throw new HttpsError('invalid-argument', 'closingDenominations obligatorio');
    }
    // BUG-04: valores negativos son válidos si hubo más egresos que ingresos por ese método
    if (typeof declaredQR !== 'number') throw new HttpsError('invalid-argument', 'declaredQR inválido');
    if (typeof declaredTransferencia !== 'number') {
        throw new HttpsError('invalid-argument', 'declaredTransferencia inválido');
    }

    const db = admin.firestore();
    const sessionRef = db.collection('cashier_sessions').doc(sessionId);

    // Lectura previa de config (no es crítica para atomicidad, sólo para clasificar severidad)
    const cfgSnap = await db.doc('treasury_config/global').get();
    const cfg: TreasuryConfigData = cfgSnap.exists ? { ...DEFAULT_CFG, ...cfgSnap.data() } as TreasuryConfigData : DEFAULT_CFG;

    const declaredEfectivo = calculateDenominationsTotal(closingDenominations);

    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(sessionRef);
        if (!snap.exists) throw new HttpsError('not-found', 'Sesión no encontrada');
        const session = snap.data() as {
            cashierId: string; status: SessionStatus; openingTotal: number; cashDrawerId: string; branchId: string;
            openedAt: admin.firestore.Timestamp | Date;
        };
        if (session.status !== 'OPEN') throw new HttpsError('failed-precondition', 'La sesión no está abierta');
        if (auth.role !== 'GERENTE' && auth.branchId !== session.branchId) {
            throw new HttpsError('permission-denied', 'Solo un usuario de la misma sucursal puede cerrar esta sesión');
        }

        // EFECTIVO: leer journal_entries DENTRO de la tx (sessionId == X) para evitar race.
        // Admin SDK permite queries en transacciones.
        const entriesSnap = await tx.get(
            db.collection('journal_entries').where('sessionId', '==', sessionId)
        );
        let efectivoNeto = 0;
        entriesSnap.docs.forEach(d => {
            const e = d.data() as { paymentMethod: string; direction: string; amount: number };
            const sign = e.direction === 'DEBIT' ? 1 : -1;
            if (e.paymentMethod === 'EFECTIVO') efectivoNeto += sign * e.amount;
        });

        // QR/TRANSFERENCIA: aterrizan en cuentas BANK/WALLET. Pueden tener sessionId
        // (nuevos entries con sesión activa) o sessionId=null (legacy). Para evitar doble
        // conteo entre sesiones solapadas en la misma sucursal:
        //   - si el entry tiene sessionId, debe coincidir con el de la sesión que cierra
        //   - si el entry tiene sessionId=null, se asocia por ventana temporal + branchId
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
            // Si el entry tiene sessionId asociado, debe ser el de esta sesión
            if (e.sessionId && e.sessionId !== sessionId) return;
            const entryDate = (e.date as admin.firestore.Timestamp)?.toDate?.()
                ?? (e.date instanceof Date ? e.date : new Date(e.date as unknown as string));
            if (!entryDate || Number.isNaN(entryDate.getTime())) return;
            // Si no tiene sessionId, filtrar por ventana
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
        const difference = {
            EFECTIVO: round2(declaredEfectivo - expected.EFECTIVO),
            QR: round2(declaredQR - expected.QR),
            TRANSFERENCIA: round2(declaredTransferencia - expected.TRANSFERENCIA),
            total: 0,
        };
        difference.total = round2(difference.EFECTIVO + difference.QR + difference.TRANSFERENCIA);

        const maxAbs = Math.max(Math.abs(difference.EFECTIVO), Math.abs(difference.QR), Math.abs(difference.TRANSFERENCIA));
        let severity: 'NONE' | 'TOLERATED' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'NONE';
        if (maxAbs < 0.01) severity = 'NONE';
        else if (maxAbs <= cfg.discrepancyTolerance) severity = 'TOLERATED';
        else if (maxAbs <= cfg.discrepancyMedium) severity = 'MEDIUM';
        else if (maxAbs <= cfg.discrepancyHigh) severity = 'HIGH';
        else severity = 'CRITICAL';

        if ((severity === 'MEDIUM' || severity === 'HIGH') && !confirmedDiscrepancy) {
            // El cliente debe re-llamar con confirmedDiscrepancy=true.
            throw new HttpsError('failed-precondition', 'CONFIRM_DISCREPANCY');
        }

        const finalStatus: SessionStatus = severity === 'CRITICAL' ? 'BLOCKED' : 'CLOSED';

        tx.update(sessionRef, {
            status: finalStatus,
            closedAt: admin.firestore.FieldValue.serverTimestamp(),
            closedByUid: auth.uid,
            closedByName: auth.name || '',
            closedByRole: auth.role,
            closedByAt: admin.firestore.FieldValue.serverTimestamp(),
            closingDenominations,
            closingDeclared: { EFECTIVO: declaredEfectivo, QR: declaredQR, TRANSFERENCIA: declaredTransferencia },
            closingExpected: expected,
            closingDifference: difference,
            closingNotes: closingNotes || '',
            discrepancySeverity: severity,
            confirmedDiscrepancy: !!confirmedDiscrepancy,
            ...(finalStatus === 'BLOCKED' ? {
                blockedReason: `Discrepancia CRÍTICA: efectivo Bs. ${difference.EFECTIVO.toFixed(2)} · QR Bs. ${difference.QR.toFixed(2)} · transfer Bs. ${difference.TRANSFERENCIA.toFixed(2)}`,
            } : {}),
        });

        // Asentar AJUSTE automático SOLO para EFECTIVO (la cuenta CASH_DRAWER refleja el saldo
        // físico). Si el cierre se completa (no BLOCKED) y hay diferencia, creamos un journal entry
        // para que account.currentBalance refleje la realidad declarada. Para QR/TRANSFERENCIA no
        // aplica: el saldo BANK/WALLET se concilia contra el extracto, no contra el conteo.
        if (finalStatus === 'CLOSED' && Math.abs(difference.EFECTIVO) >= 0.01) {
            const adjAmount = Math.abs(difference.EFECTIVO);
            const isPositive = difference.EFECTIVO > 0;
            const accRef = db.collection('accounts').doc(session.cashDrawerId);
            const accSnap = await tx.get(accRef);
            if (accSnap.exists) {
                const accData = accSnap.data() as { currentBalance?: number };
                const currentBal = accData.currentBalance || 0;
                const newBal = round2(isPositive ? currentBal + adjAmount : currentBal - adjAmount);
                if (isPositive || newBal >= -0.01) {
                    const entryRef = db.collection('journal_entries').doc();
                    tx.set(entryRef, {
                        accountId: session.cashDrawerId,
                        amount: adjAmount,
                        paymentMethod: 'EFECTIVO',
                        category: isPositive ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
                        direction: isPositive ? 'DEBIT' : 'CREDIT',
                        description: `Ajuste automático por discrepancia al cierre · sesión ${sessionId}`,
                        referenceType: 'SESSION_CLOSE_ADJUSTMENT',
                        referenceId: sessionId,
                        sessionId: sessionId,
                        branchId: session.branchId,
                        userId: auth.uid,
                        userName: auth.name || 'sistema',
                        date: admin.firestore.FieldValue.serverTimestamp(),
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        reconciliationStatus: 'NOT_APPLICABLE',
                    });
                    tx.update(accRef, {
                        currentBalance: newBal,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
            }
        }

        return { finalStatus, difference, severity, branchId: session.branchId };
    });

    // BUG-03: logAdmin post-transacción no debe propagar el error — la sesión ya fue cerrada
    // en Firestore. Si falla el audit log, loguear en console sin engañar al cajero.
    try {
        await logAdmin(auth.uid, auth.name,
            result.finalStatus === 'BLOCKED' ? 'BLOCK_CASHIER_SESSION' : 'CLOSE_CASHIER_SESSION',
            sessionId, result.branchId,
            `Diff total Bs. ${result.difference.total.toFixed(2)} · severidad ${result.severity}`);
    } catch (logErr) {
        console.error('[closeSessionAtomic] Audit log falló — sesión ya cerrada:', sessionId, logErr);
    }

    return {
        success: true,
        status: result.finalStatus,
        severity: result.severity,
        difference: result.difference,
    };
});
