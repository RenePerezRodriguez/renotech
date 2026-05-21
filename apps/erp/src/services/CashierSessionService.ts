/**
 * CashierSessionService — sesión de cajero (reemplaza CashService.openShift/closeShift).
 * Modelo Caja + Tesorería v2.
 *
 * Reglas:
 *  - 1 sesión OPEN por sucursal. Si ya hay una sesión abierta en la sucursal, no se puede abrir otra.
 *  - El cajón físico se asigna a la sesión de la sucursal.
 *  - Apertura: declara denominaciones. Total inicial = Σ(denom × cantidad).
 *  - Cierre: declara denominaciones de cierre + totales QR/TRANSFER. Sistema calcula esperados.
 *  - Discrepancia: según TreasuryConfig (tolerance/medium/high). CRÍTICA bloquea sesión.
 */
import { db, app } from '@/lib/firebase';
import {
    collection, doc, getDoc, getDocs, query, where, orderBy, limit as fbLimit
} from 'firebase/firestore';
import { ensureDate } from '@/utils/dateHelpers';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type {
    CashierSession, CashDenominations, SessionStatus, JournalEntry
} from '@/types/treasury';
import { logAdminAction } from '@/lib/audit';

const COLLECTION = 'cashier_sessions';

export const CashierSessionService = {
    /** Sesión OPEN del cajero actual (si existe) */
    async getCurrentSession(cashierId: string): Promise<CashierSession | null> {
        const q = query(
            collection(db, COLLECTION),
            where('cashierId', '==', cashierId),
            where('status', '==', 'OPEN')
        );
        const snap = await getDocs(q);
        if (snap.empty) return null;
        if (snap.docs.length > 1) {
            console.error(`[CashierSession] CORRUPCIÓN: ${snap.docs.length} sesiones OPEN para cajero ${cashierId}`);
        }
        const d = snap.docs[0];
        return this._mapDoc(d.id, d.data());
    },

    /** Sesiones abiertas (todas, o por sucursal) */
    async getOpenSessions(branchId?: string): Promise<CashierSession[]> {
        const constraints = [where('status', '==', 'OPEN')];
        if (branchId) constraints.push(where('branchId', '==', branchId));
        const q = query(collection(db, COLLECTION), ...constraints);
        const snap = await getDocs(q);
        return snap.docs.map(d => this._mapDoc(d.id, d.data()));
    },

    /**
     * Sesión abierta por sucursal.
     * Debe haber solo una sesión OPEN por sucursal; si hay varias, se devuelve la más reciente.
     */
    async getCurrentBranchSession(branchId: string): Promise<CashierSession | null> {
        const q = query(
            collection(db, COLLECTION),
            where('branchId', '==', branchId),
            where('status', '==', 'OPEN'),
            orderBy('openedAt', 'desc'),
            fbLimit(1)
        );
        const snap = await getDocs(q);
        if (snap.empty) return null;
        return this._mapDoc(snap.docs[0].id, snap.docs[0].data());
    },

    /**
     * Sesión utilizable para operar (modelo "caja por sucursal compartida"):
     *   1) Sesión propia del cajero, si está OPEN en esta sucursal.
     *   2) Sino, la sesión OPEN de la sucursal abierta por cualquier otro usuario.
     * Permite que múltiples vendedores usen la misma caja física durante el día.
     * El registro de autoría real queda en `JournalEntry.userId/userName` por cada movimiento.
     */
    async getOperableSession(cashierId: string | undefined, branchId: string | undefined): Promise<CashierSession | null> {
        if (!branchId) return null;
        if (cashierId) {
            const own = await this.getCurrentSession(cashierId);
            if (own && own.branchId === branchId) return own;
        }
        return this.getCurrentBranchSession(branchId);
    },

    /** Historial de sesiones cerradas para un cajero (su propio historial) */
    async getMyHistory(cashierId: string, max = 30): Promise<CashierSession[]> {
        const q = query(
            collection(db, COLLECTION),
            where('cashierId', '==', cashierId),
            where('status', 'in', ['CLOSED', 'FORCE_CLOSED']),
            orderBy('closedAt', 'desc'),
            fbLimit(max)
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => this._mapDoc(d.id, d.data()));
    },

    /** Historial completo (gerente) — por sucursal o todas */
    async getHistory(filters: { branchId?: string; cashierId?: string; from?: Date; to?: Date; limit?: number }): Promise<CashierSession[]> {
        const constraints: import('firebase/firestore').QueryConstraint[] = [
            where('status', 'in', ['CLOSED', 'FORCE_CLOSED', 'BLOCKED']),
        ];
        if (filters.branchId) constraints.push(where('branchId', '==', filters.branchId));
        if (filters.cashierId) constraints.push(where('cashierId', '==', filters.cashierId));
        constraints.push(orderBy('closedAt', 'desc'));
        if (filters.limit) constraints.push(fbLimit(filters.limit));

        const q = query(collection(db, COLLECTION), ...constraints);
        const snap = await getDocs(q);
        let sessions = snap.docs.map(d => this._mapDoc(d.id, d.data()));
        if (filters.from) sessions = sessions.filter(s => s.closedAt && (s.closedAt as Date) >= filters.from!);
        if (filters.to) {
            const end = new Date(filters.to);
            end.setHours(23, 59, 59, 999);
            sessions = sessions.filter(s => s.closedAt && (s.closedAt as Date) <= end);
        }
        return sessions;
    },

    /**
     * Abre una nueva sesi\u00f3n. Delegado a Cloud Function `openSessionAtomic`
     * que valida en una transacci\u00f3n server-side que NO existe otra sesi\u00f3n OPEN
     * para el cajero (race-safe). Falla si la cuenta no es CASH_DRAWER activo.
     */
    async openSession(input: {
        cashDrawerId: string;
        cashierId: string;
        cashierName: string;
        cashierRole?: string;
        openingDenominations: CashDenominations;
        openingNotes?: string;
        openingAdjustmentReason?: string;
    }): Promise<string> {
        try {
            const fn = httpsCallable<unknown, { success: boolean; sessionId: string }>(
                getFunctions(app, 'us-central1'),
                'openSessionAtomic'
            );
            const res = await fn({
                cashDrawerId: input.cashDrawerId,
                cashierName: input.cashierName,
                cashierRole: input.cashierRole,
                openingDenominations: input.openingDenominations,
                openingNotes: input.openingNotes,
                openingAdjustmentReason: input.openingAdjustmentReason,
            });
            return res.data.sessionId;
        } catch (e) {
            const err = e as { message?: string };
            throw new Error(err.message || 'Error abriendo sesi\u00f3n');
        }
    },

    /**
     * Calcula los totales esperados (sistema) para una sesión, sumando los journal_entries
     * cuya sessionId coincide.
     */
    async computeExpected(sessionId: string): Promise<{ EFECTIVO: number; QR: number; TRANSFERENCIA: number }> {
        const session = await this.getById(sessionId);
        if (!session) throw new Error('Sesión no encontrada');

        // EFECTIVO: asientos del cajón asociados a esta sesión (sessionId == X).
        const cashEntriesQ = query(
            collection(db, 'journal_entries'),
            where('sessionId', '==', sessionId),
            where('paymentMethod', '==', 'EFECTIVO'),
            where('branchId', '==', session.branchId)
        );
        const cashSnap = await getDocs(cashEntriesQ);

        let efectivoNeto = 0;
        cashSnap.docs.forEach(d => {
            const e = d.data() as JournalEntry;
            // Las parejas reverso-original tienen direcciones opuestas y se cancelan
            // naturalmente al sumar. No hace falta filtrarlas explícitamente.
            efectivoNeto += e.direction === 'DEBIT' ? e.amount : -e.amount;
        });
        const expectedEfectivo = (session.openingTotal || 0) + efectivoNeto;

        // QR/TRANSFER: aterrizan en cuentas BANK/WALLET (sessionId = null), por eso
        // se filtran por sucursal + ventana temporal del turno (igual que MyCashSessionView).
        const openedAt = ensureDate(session.openedAt);
        const closedAt = session.closedAt ? ensureDate(session.closedAt) : new Date();

        const digitalQ = query(
            collection(db, 'journal_entries'),
            where('branchId', '==', session.branchId),
            where('paymentMethod', 'in', ['QR', 'TRANSFERENCIA'])
        );
        const digSnap = await getDocs(digitalQ);
        let qrNeto = 0, transferNeto = 0;
        digSnap.docs.forEach(d => {
            const e = d.data() as JournalEntry;
            // Si el entry tiene sessionId, debe ser el de esta sesión (evita doble conteo entre solapamientos)
            if (e.sessionId && e.sessionId !== sessionId) return;
            const entryDate = (e.date as { toDate?: () => Date })?.toDate?.()
                ?? ensureDate(e.date);
            if (!entryDate || Number.isNaN(entryDate.getTime())) return;
            // Para entries sin sessionId (legacy), filtrar por ventana
            if (!e.sessionId && (entryDate < openedAt || entryDate > closedAt)) return;
            const sign = e.direction === 'DEBIT' ? 1 : -1;
            if (e.paymentMethod === 'QR') qrNeto += sign * e.amount;
            else if (e.paymentMethod === 'TRANSFERENCIA') transferNeto += sign * e.amount;
        });

        return { EFECTIVO: expectedEfectivo, QR: qrNeto, TRANSFERENCIA: transferNeto };
    },

    /**
     * Cierra la sesión.
     * - Calcula totales esperados.
     * - Compara contra declarados.
     * - Determina severidad de discrepancia según TreasuryConfig.
     * - Si CRÍTICA: bloquea (status BLOCKED) hasta que gerente revise. NO se cierra.
     * - Si MEDIA o más: requiere `confirmedDiscrepancy=true` para proceder.
     */
    async closeSession(input: {
        sessionId: string;
        cashierId: string;
        cashierName: string;
        closingDenominations: CashDenominations;
        declaredQR: number;
        declaredTransferencia: number;
        closingNotes?: string;
        confirmedDiscrepancy?: boolean;
    }): Promise<{
        status: SessionStatus;
        difference: { EFECTIVO: number; QR: number; TRANSFERENCIA: number; total: number };
        severity: 'NONE' | 'TOLERATED' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    }> {
        // Cierre at\u00f3mico server-side: la CF valida due\u00f1o + recalcula esperados + clasifica severidad.
        try {
            const fn = httpsCallable<unknown, {
                success: boolean;
                status: SessionStatus;
                severity: 'NONE' | 'TOLERATED' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
                difference: { EFECTIVO: number; QR: number; TRANSFERENCIA: number; total: number };
            }>(getFunctions(app, 'us-central1'), 'closeSessionAtomic');
            const res = await fn({
                sessionId: input.sessionId,
                closingDenominations: input.closingDenominations,
                declaredQR: input.declaredQR,
                declaredTransferencia: input.declaredTransferencia,
                closingNotes: input.closingNotes,
                confirmedDiscrepancy: input.confirmedDiscrepancy,
            });
            return { status: res.data.status, difference: res.data.difference, severity: res.data.severity };
        } catch (e) {
            // Propagar el c\u00f3digo CONFIRM_DISCREPANCY tal como lo espera el caller.
            const err = e as { code?: string; message?: string; details?: unknown };
            const msg = (err.message || '').replace(/^.*?CONFIRM_DISCREPANCY.*$/i, 'CONFIRM_DISCREPANCY');
            if (msg === 'CONFIRM_DISCREPANCY' || /CONFIRM_DISCREPANCY/i.test(err.message || '')) {
                throw new Error('CONFIRM_DISCREPANCY');
            }
            throw new Error(err.message || 'Error cerrando sesi\u00f3n');
        }
    },

    /** Gerente: force-close de sesión olvidada (auto-cuadra). Server-side atómico. */
    async forceClose(sessionId: string, gerente: { uid: string; name: string }, reason: string): Promise<void> {
        if (!reason || reason.trim().length < 10) throw new Error('Razón del force-close debe tener al menos 10 caracteres');
        try {
            const fn = httpsCallable<{ sessionId: string; reason: string }, { success: boolean }>(
                getFunctions(app, 'us-central1'),
                'forceCloseSessionAtomic'
            );
            await fn({ sessionId, reason: reason.trim() });
        } catch (e) {
            const err = e as { message?: string };
            throw new Error(err.message || 'Error en force-close');
        }
        // Mantenemos el log local para trazabilidad cliente (la CF también loguea server-side).
        await logAdminAction(gerente.uid, gerente.name, 'FORCE_CLOSE_SESSION', sessionId, '',
            `Force-close: ${reason.trim()}`);
    },

    /**
     * Gerente: reabrir sesi\u00f3n cerrada (para correcci\u00f3n).
     * - No reabre sesiones OPEN.
     * - Sesiones BLOCKED requieren `acknowledgeBlocked=true` (revisi\u00f3n expl\u00edcita).
     */
    async reopenSession(
        sessionId: string,
        gerente: { uid: string; name: string },
        reason: string,
        opts: { acknowledgeBlocked?: boolean } = {}
    ): Promise<void> {
        if (!reason || reason.trim().length < 10) throw new Error('Razón de reapertura debe tener al menos 10 caracteres');
        try {
            const fn = httpsCallable<unknown, { success: boolean }>(
                getFunctions(app, 'us-central1'),
                'reopenSessionAtomic'
            );
            await fn({
                sessionId,
                reason: reason.trim(),
                acknowledgeBlocked: !!opts.acknowledgeBlocked,
            });
            // logAdmin lo hace la propia CF; aqu\u00ed no duplicamos.
            void gerente; // par\u00e1metro mantenido por compatibilidad con call-sites
        } catch (e) {
            const err = e as { message?: string };
            throw new Error(err.message || 'Error reabriendo sesi\u00f3n');
        }
    },

    /**
     * Aceptar una sesi\u00f3n BLOCKED y dejarla CLOSED definitivamente.
     * Asienta autom\u00e1ticamente el AJUSTE EFECTIVO si hubo diferencia.
     * Solo gerente. Razón obligatoria (>=10 caracteres).
     */
    async acknowledgeBlockedSession(sessionId: string, reason: string): Promise<void> {
        if (!reason || reason.trim().length < 10) throw new Error('Razón debe tener al menos 10 caracteres');
        try {
            const fn = httpsCallable<unknown, { success: boolean }>(
                getFunctions(app, 'us-central1'),
                'acknowledgeBlockedSessionAtomic'
            );
            await fn({ sessionId, reason: reason.trim() });
        } catch (e) {
            const err = e as { message?: string };
            throw new Error(err.message || 'Error aceptando sesi\u00f3n bloqueada');
        }
    },

    async getById(sessionId: string): Promise<CashierSession | null> {
        const snap = await getDoc(doc(db, COLLECTION, sessionId));
        if (!snap.exists()) return null;
        return this._mapDoc(snap.id, snap.data());
    },

    /** @internal */
    _mapDoc(id: string, data: import('firebase/firestore').DocumentData): CashierSession {
        return {
            id,
            ...data,
            openedAt: data.openedAt?.toDate?.() || data.openedAt,
            closedAt: data.closedAt?.toDate?.() || data.closedAt,
            closedByAt: data.closedByAt?.toDate?.() || data.closedByAt,
            reopenedAt: data.reopenedAt?.toDate?.() || data.reopenedAt,
            blockedAcknowledgedAt: data.blockedAcknowledgedAt?.toDate?.() || data.blockedAcknowledgedAt,
            longSessionAlertSentAt: data.longSessionAlertSentAt?.toDate?.() || data.longSessionAlertSentAt,
        } as CashierSession;
    },
};
