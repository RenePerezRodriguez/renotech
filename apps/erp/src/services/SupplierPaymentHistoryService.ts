import { db } from '@/lib/firebase';
import {
    collection,
    query,
    where,
    limit,
    getDocs,
    getDoc,
    doc,
    Timestamp,
    onSnapshot,
} from 'firebase/firestore';

/**
 * Evento unificado del historial financiero de un proveedor.
 * Combina movimientos de caja (EFECTIVO), audit logs (QR/Transfer) y compras a crédito.
 */
export interface SupplierHistoryEvent {
    id: string;
    /** Tipo de evento */
    kind: 'PAGO_EFECTIVO' | 'PAGO_TRANSFER' | 'PAGO_QR' | 'COMPRA_CREDITO' | 'COMPRA_EFECTIVO' | 'COMPRA_TRANSFER' | 'COMPRA_QR' | 'DEVOLUCION';
    /** Cuenta (cuentas_proveedores) */
    accountId: string;
    /** Empresa (puede no estar si solo viene de movimiento_caja) */
    empresaId?: string;
    /** Monto BOB. Positivo siempre; el signo lo da el `kind` */
    amount: number;
    /** Fecha del evento (para sort desc) */
    date: Date;
    /** Descripción humana */
    label: string;
    /** Referencia/transacción opcional */
    reference?: string;
    /** Usuario que ejecutó */
    userLabel?: string;
    /** Sucursal donde ocurrió */
    branchId?: string;
}

const JOURNAL_COL = 'journal_entries';
const LOG_COL = 'admin_logs';
const PURCHASE_COL = 'compras';

function tsToDate(v: unknown): Date {
    if (v instanceof Timestamp) return v.toDate();
    if (v instanceof Date) return v;
    return new Date();
}

export const SupplierPaymentHistoryService = {
    /**
     * Devuelve el historial unificado para una cuenta específica.
     * Combina pagos en efectivo, pagos no-efectivo y compras a crédito.
     */
    async getForAccount(accountId: string, max = 50): Promise<SupplierHistoryEvent[]> {
        const events: SupplierHistoryEvent[] = [];

        // 1) Pagos en EFECTIVO/QR/TRANSFER → journal_entries con
        //    referenceType=SUPPLIER_PAYMENT y referenceId=accountId.
        //    El paymentMethod del documento determina el kind.
        //    Trackeamos firmas (monto+fecha aprox) para deduplicar contra admin_logs (paso 2).
        const cashSignatures = new Set<string>();
        try {
            const qCash = query(
                collection(db, JOURNAL_COL),
                where('referenceType', '==', 'SUPPLIER_PAYMENT'),
                where('referenceId', '==', accountId),
                limit(max)
            );
            const snap = await getDocs(qCash);
            snap.forEach((d) => {
                const data = d.data();
                const pm = (data.paymentMethod as string) || 'EFECTIVO';
                const kind: SupplierHistoryEvent['kind'] = pm === 'QR' ? 'PAGO_QR'
                    : pm === 'TRANSFERENCIA' ? 'PAGO_TRANSFER'
                    : 'PAGO_EFECTIVO';
                const date = tsToDate(data.date || data.createdAt);
                const amount = Number(data.amount || 0);
                cashSignatures.add(`${pm}|${amount.toFixed(2)}|${Math.floor(date.getTime() / 60000)}`);
                events.push({
                    id: d.id,
                    kind,
                    accountId,
                    amount,
                    date,
                    label: data.description || (kind === 'PAGO_EFECTIVO' ? 'Pago en efectivo' : `Pago ${pm}`),
                    branchId: data.branchId,
                    userLabel: data.userName || data.userId,
                });
            });
        } catch (e) {
            console.warn('[History] journal query falló:', e);
        }

        // 2) Pagos QR/TRANSFERENCIA en admin_logs (legacy/auditoría) — deduplicamos por firma
        //    contra los journal_entries del paso 1 para no contar dos veces.
        try {
            const qLog = query(
                collection(db, LOG_COL),
                where('action', '==', 'PAYMENT_SUPPLIER_NONCASH'),
                where('targetUid', '==', accountId),
                limit(max)
            );
            const snap = await getDocs(qLog);
            snap.forEach((d) => {
                const data = d.data();
                const details: string = data.details || '';
                const isTransfer = details.startsWith('TRANSFERENCIA');
                const pm = isTransfer ? 'TRANSFERENCIA' : 'QR';
                const amtMatch = details.match(/Bs\.\s*([\d.,]+)/);
                const amount = amtMatch ? parseFloat(amtMatch[1].replace(',', '')) : 0;
                if (!Number.isFinite(amount) || amount <= 0) {
                    console.warn('[History] Audit log con monto inválido ignorado:', d.id, details);
                    return;
                }
                const date = tsToDate(data.timestamp);
                const sig = `${pm}|${amount.toFixed(2)}|${Math.floor(date.getTime() / 60000)}`;
                if (cashSignatures.has(sig)) return; // duplicado: ya está en journal_entries
                const refMatch = details.match(/Ref:\s*(.+?)$/);
                events.push({
                    id: d.id,
                    kind: isTransfer ? 'PAGO_TRANSFER' : 'PAGO_QR',
                    accountId,
                    amount,
                    date,
                    label: details.split(' · ')[0] || 'Pago no-efectivo',
                    reference: refMatch?.[1]?.trim()?.slice(0, 50) || undefined,
                    branchId: data.branchId,
                    userLabel: data.adminEmail,
                });
            });
        } catch (e) {
            console.warn('[History] audit query falló:', e);
        }

        // 3) Todas las compras al proveedor (crédito y contado)
        // Sin orderBy para evitar requerir índice compuesto; ordenamos client-side abajo.
        try {
            const qPurch = query(
                collection(db, PURCHASE_COL),
                where('supplierId', '==', accountId),
                limit(max)
            );
            const snap = await getDocs(qPurch);
            snap.forEach((d) => {
                const data = d.data();
                const pm: string = (data.paymentMethod || 'EFECTIVO').toUpperCase();
                const kind: SupplierHistoryEvent['kind'] =
                    pm === 'CREDITO'   ? 'COMPRA_CREDITO'  :
                    pm === 'TRANSFER'  ? 'COMPRA_TRANSFER' :
                    pm === 'QR'        ? 'COMPRA_QR'       :
                                        'COMPRA_EFECTIVO';
                events.push({
                    id: d.id,
                    kind,
                    accountId,
                    amount: Number(data.total || 0),
                    date: tsToDate(data.date || data.createdAt),
                    label: `Compra #${d.id.slice(-6).toUpperCase()}`,
                    branchId: data.branchId,
                    userLabel: data.usuarioNombre || data.usuarioEmail,
                });
            });
        } catch (e) {
            console.warn('[History] compras query falló:', e);
        }

        // 4) Devoluciones (GARANTIA_SALIDA) → devoluciones_proveedor con accountId o empresaId
        // Para compatibilidad con script antiguo que no tenía accountId, 
        // buscamos por accountId o empresaId (si es necesario).
        // Sin embargo, getForAccount recibe un accountId, pero no su empresaId fácilmente.
        // Dado que esto es async, primero traemos la cuenta para saber su empresa.
        try {
            const accRef = doc(db, 'cuentas_proveedores', accountId);
            const accDoc = await getDoc(accRef);
            let empresaId = '';
            if (accDoc.exists()) {
                empresaId = accDoc.data().empresaId;
            }
            
            if (empresaId) {
                const qDev = query(
                    collection(db, 'devoluciones_proveedor'),
                    where('empresaId', '==', empresaId),
                    limit(max)
                );
                const snap = await getDocs(qDev);
                snap.forEach((d) => {
                    const data = d.data();
                    // Si la devolución tiene accountId y no es esta, la saltamos.
                    // Si no tiene, la mostramos (compatibilidad legacy).
                    if (data.accountId && data.accountId !== accountId) return;

                    events.push({
                        id: d.id,
                        kind: 'DEVOLUCION',
                        accountId,
                        amount: Number(data.totalValue || 0),
                        date: tsToDate(data.fecha || data.createdAt),
                        label: `Devolución ${data.itemCount} prod.`,
                        branchId: data.branchId,
                        userLabel: data.usuarioNombre || data.usuarioId,
                    });
                });
            }
        } catch (e) {
            console.warn('[History] devoluciones query falló:', e);
        }

        // Ordenar desc por fecha
        events.sort((a, b) => b.date.getTime() - a.date.getTime());
        return events.slice(0, max);
    },

    /**
     * Versión live (snapshot) para mantener el historial sincronizado en el drawer.
     * Solo escucha cambios en journal_entries (los más frecuentes); los otros se
     * refrescan al reabrir.
     */
    subscribeToCashPayments(accountId: string, callback: () => void): () => void {
        const q = query(
            collection(db, JOURNAL_COL),
            where('referenceType', '==', 'SUPPLIER_PAYMENT'),
            where('referenceId', '==', accountId)
        );
        return onSnapshot(q, () => callback());
    },

    /**
     * Devuelve TODOS los pagos a proveedores (efectivo, transfer, QR) en un rango.
     * NO incluye COMPRA_CREDITO (eso no es un pago, es deuda nueva). Usar para
     * el "Libro de Pagos a Proveedores".
     *
     * @param branchId  string → filtra por una sucursal; string[] → filtra por varias (usa 'in', máx 30); undefined → todas.
     * @param max       Límite de eventos.
     */
    async getAllPayments(branchId?: string | string[], max = 200): Promise<SupplierHistoryEvent[]> {
        const events: SupplierHistoryEvent[] = [];

        // Helper para construir el filtro de sucursal (acepta string o string[]).
        const branchConstraint = () => {
            if (!branchId) return [];
            if (Array.isArray(branchId)) {
                const uniq = Array.from(new Set(branchId.filter(Boolean))).slice(0, 30);
                if (uniq.length === 0) return [];
                if (uniq.length === 1) return [where('branchId', '==', uniq[0])];
                return [where('branchId', 'in', uniq)];
            }
            return [where('branchId', '==', branchId)];
        };

        // 1) Pagos a proveedor (EFECTIVO/QR/TRANSFER) desde journal_entries.
        //    Trackeamos firmas para deduplicar contra admin_logs (paso 2).
        const cashSignatures = new Set<string>();
        try {
            const constraints = [
                where('referenceType', '==', 'SUPPLIER_PAYMENT'),
                ...branchConstraint(),
                limit(max),
            ];
            const qCash = query(collection(db, JOURNAL_COL), ...constraints);
            const snap = await getDocs(qCash);
            snap.forEach((d) => {
                const data = d.data();
                const pm = (data.paymentMethod as string) || 'EFECTIVO';
                const kind: SupplierHistoryEvent['kind'] = pm === 'QR' ? 'PAGO_QR'
                    : pm === 'TRANSFERENCIA' ? 'PAGO_TRANSFER'
                    : 'PAGO_EFECTIVO';
                const amount = Number(data.amount || 0);
                const date = tsToDate(data.date || data.createdAt);
                const accId = data.referenceId || '';
                cashSignatures.add(`${accId}|${pm}|${amount.toFixed(2)}|${Math.floor(date.getTime() / 60000)}`);
                events.push({
                    id: d.id,
                    kind,
                    accountId: accId,
                    amount,
                    date,
                    label: data.description || (kind === 'PAGO_EFECTIVO' ? 'Pago en efectivo' : `Pago ${pm}`),
                    branchId: data.branchId,
                    userLabel: data.userName || data.userId,
                });
            });
        } catch (e) {
            console.warn('[Payments] journal query falló:', e);
        }

        // 2) QR/TRANSFERENCIA en admin_logs (sólo los SIN turno: dedup vs paso 1)
        try {
            const constraints = [
                where('action', '==', 'PAYMENT_SUPPLIER_NONCASH'),
                ...branchConstraint(),
                limit(max),
            ];
            const qLog = query(collection(db, LOG_COL), ...constraints);
            const snap = await getDocs(qLog);
            snap.forEach((d) => {
                const data = d.data();
                const details: string = data.details || '';
                const isTransfer = details.startsWith('TRANSFERENCIA');
                const pm = isTransfer ? 'TRANSFERENCIA' : 'QR';
                const amtMatch = details.match(/Bs\.\s*([\d.,]+)/);
                const amount = amtMatch ? parseFloat(amtMatch[1].replace(',', '')) : 0;
                if (!Number.isFinite(amount) || amount <= 0) return;
                const date = tsToDate(data.timestamp);
                const accId = data.targetUid || '';
                const sig = `${accId}|${pm}|${amount.toFixed(2)}|${Math.floor(date.getTime() / 60000)}`;
                if (cashSignatures.has(sig)) return;
                const refMatch = details.match(/Ref:\s*(.+?)$/);
                events.push({
                    id: d.id,
                    kind: isTransfer ? 'PAGO_TRANSFER' : 'PAGO_QR',
                    accountId: accId,
                    amount,
                    date,
                    label: details.split(' · ')[0] || 'Pago no-efectivo',
                    reference: refMatch?.[1]?.trim()?.slice(0, 100) || undefined,
                    branchId: data.branchId,
                    userLabel: data.adminEmail,
                });
            });
        } catch (e) {
            console.warn('[Payments] audit query falló:', e);
        }

        // 3) Compras pagadas al-contado (EFECTIVO/TRANSFERENCIA/QR) → desembolsos directos
        //    El usuario espera ver TODA salida hacia un proveedor, no solo pagos de deuda.
        try {
            const constraints = [
                where('paymentMethod', 'in', ['EFECTIVO', 'TRANSFERENCIA', 'QR']),
                ...branchConstraint(),
                limit(max),
            ];
            const qPurch = query(collection(db, PURCHASE_COL), ...constraints);
            const snap = await getDocs(qPurch);
            snap.forEach((d) => {
                const data = d.data();
                const amount = Number(data.total || 0);
                if (!Number.isFinite(amount) || amount <= 0) return;
                const method = data.paymentMethod as 'EFECTIVO' | 'TRANSFERENCIA' | 'QR';
                const kindMap = {
                    EFECTIVO: 'COMPRA_EFECTIVO' as const,
                    TRANSFERENCIA: 'COMPRA_TRANSFER' as const,
                    QR: 'COMPRA_QR' as const,
                };
                events.push({
                    id: d.id,
                    kind: kindMap[method],
                    accountId: data.supplierId || '',
                    amount,
                    date: tsToDate(data.date || data.createdAt),
                    label: `Compra ${method} · ${data.supplierName || 's/n'}`,
                    reference: data.paymentReference || `#${d.id.slice(-6).toUpperCase()}`,
                    branchId: data.branchId,
                    userLabel: data.usuarioNombre || data.usuarioEmail,
                });
            });
        } catch (e) {
            console.warn('[Payments] compras al-contado query falló:', e);
        }

        events.sort((a, b) => b.date.getTime() - a.date.getTime());
        return events.slice(0, max);
    },
};

