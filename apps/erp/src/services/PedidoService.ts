'use client';

import { db } from '@/lib/firebase';
import {
    collection,
    query,
    orderBy,
    where,
    getDocs,
    getDoc,
    doc,
    Timestamp,
    runTransaction,
    serverTimestamp,
    writeBatch,
    onSnapshot,
    deleteField,
} from 'firebase/firestore';
import { Pedido, PedidoItem, PedidoStatus } from '@/types';
import { logAdminAction } from '@/lib/audit';
import { throwStandardError } from '@/utils/errorCodes';
import { CounterService } from '@/services/CounterService';

const COLLECTION = 'pedidos';
const ITEMS_SUB = 'items';

interface CreatePedidoInput {
    fromBranchId: string;
    fromBranchName: string;
    toBranchId: string;
    toBranchName: string;
    fechaRequerida: Date;
    items: PedidoItem[];
    notas?: string;
    createdBy: string;
    createdByName: string;
    userBranchId: string;
}

interface UpdateBorradorInput {
    pedidoId: string;
    items: PedidoItem[];
    fechaRequerida?: Date;
    notas?: string;
    editedBy: string;
    editedByName: string;
    userBranchId: string;
    /** clientLastEditedAt: timestamp (millis) leído por el cliente al abrir el editor.
     *  Si ha cambiado en el server, se rechaza por lock optimista. */
    clientLastEditedAt?: number | null;
}

/**
 * PedidoService — Gestión de pedidos inter-sucursales.
 *
 * Estados: borrador → vigente → despachado / cancelado
 *
 * - Solo la sucursal emisora (fromBranchId) puede editar el borrador.
 * - La sucursal receptora (toBranchId) puede VER en todos los estados pero
 *   NO actuar hasta que esté en 'vigente'.
 * - Stock NO se afecta aquí; el descuento ocurre en EnvioService al despachar.
 */
export const PedidoService = {
    // ────────────────────────────────────────────────────────────────────────
    // LECTURA
    // ────────────────────────────────────────────────────────────────────────

    async getById(pedidoId: string): Promise<Pedido | null> {
        const snap = await getDoc(doc(db, COLLECTION, pedidoId));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() } as Pedido;
    },

    async getItems(pedidoId: string): Promise<PedidoItem[]> {
        const q = query(collection(db, COLLECTION, pedidoId, ITEMS_SUB));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as PedidoItem));
    },

    async getWithItems(pedidoId: string): Promise<{ pedido: Pedido; items: PedidoItem[] } | null> {
        const pedido = await this.getById(pedidoId);
        if (!pedido) return null;
        const items = await this.getItems(pedidoId);
        return { pedido, items };
    },

    /**
     * Lista pedidos. Por defecto trae los relacionados a la sucursal del usuario
     * (emitidos o entrantes). Si direction se especifica filtra.
     */
    async list(
        userBranchId: string,
        direction: 'EMITIDOS' | 'ENTRANTES' | 'TODOS' = 'TODOS',
        status?: PedidoStatus,
    ): Promise<Pedido[]> {
        const col = collection(db, COLLECTION);

        if (direction === 'EMITIDOS') {
            const constraints = [where('fromBranchId', '==', userBranchId)];
            if (status) constraints.push(where('status', '==', status));
            const q = query(col, ...constraints, orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() } as Pedido));
        }

        if (direction === 'ENTRANTES') {
            const constraints = [where('toBranchId', '==', userBranchId)];
            if (status) constraints.push(where('status', '==', status));
            const q = query(col, ...constraints, orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() } as Pedido));
        }

        // TODOS = unión de ambas direcciones
        const [emit, entr] = await Promise.all([
            this.list(userBranchId, 'EMITIDOS', status),
            this.list(userBranchId, 'ENTRANTES', status),
        ]);
        const map = new Map<string, Pedido>();
        [...emit, ...entr].forEach(p => { if (p.id) map.set(p.id, p); });
        return Array.from(map.values()).sort((a, b) => {
            const ta = (a.createdAt as Timestamp)?.toMillis?.() ?? 0;
            const tb = (b.createdAt as Timestamp)?.toMillis?.() ?? 0;
            return tb - ta;
        });
    },
    /**
     * Suscripción en tiempo real a la cola de pedidos con cancelación pendiente.
     * Solo gerencia HQ debería invocarlo (las reglas de Firestore lo permiten a auth).
     */
    subscribePendingCancellations(callback: (pedidos: Pedido[]) => void) {
        const q = query(
            collection(db, COLLECTION),
            where('cancellationPending', '==', true),
            orderBy('cancellationRequestedAt', 'desc'),
        );
        return onSnapshot(q, snap => {
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Pedido)));
        });
    },
    // ────────────────────────────────────────────────────────────────────────
    // CREACIÓN (estado inicial: borrador)
    // ────────────────────────────────────────────────────────────────────────

    async create(input: CreatePedidoInput): Promise<{ id: string; codigo: string; numero: number }> {
        const {
            fromBranchId, fromBranchName,
            toBranchId, toBranchName,
            fechaRequerida, items, notas,
            createdBy, createdByName,
            userBranchId,
        } = input;

        if (!fromBranchId || !toBranchId) throwStandardError('SYS_TRANSACTION_FAILED', 'Sucursales incompletas');
        if (fromBranchId === toBranchId) throwStandardError('SYS_TRANSACTION_FAILED', 'Origen y destino iguales');
        if (!items || items.length === 0) throwStandardError('TRSF_INVALID_QUANTITY', 'Se requiere al menos un ítem');
        if (fromBranchId !== userBranchId) throwStandardError('AUTH_BRANCH_ACCESS', 'Solo la sucursal emisora puede crear el pedido');

        // Reservar correlativo (transacción aparte para no anidar lecturas/escrituras complejas)
        const numero = await CounterService.next('pedidoSeq');
        const codigo = CounterService.formatPedido(numero);

        const ref = doc(db, COLLECTION, codigo);

        // Verificar colisión (paranoia: si alguien borró el contador o lo manipuló)
        const exists = await getDoc(ref);
        if (exists.exists()) throwStandardError('SYS_TRANSACTION_FAILED', `Código ${codigo} ya existe`);

        const batch = writeBatch(db);
        batch.set(ref, {
            numero,
            codigo,
            status: 'borrador',
            fromBranchId, fromBranchName,
            toBranchId, toBranchName,
            fechaRequerida: Timestamp.fromDate(fechaRequerida),
            notas: notas || '',
            itemCount: items.length,
            totalUnits: items.reduce((sum, i) => sum + (i.quantity || 0), 0),
            createdBy, createdByName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastEditedBy: createdBy,
            lastEditedByName: createdByName,
            lastEditedAt: serverTimestamp(),
        });

        items.forEach(item => {
            const itemRef = doc(collection(db, COLLECTION, codigo, ITEMS_SUB));
            batch.set(itemRef, {
                productId: item.productId,
                masterId: item.masterId,
                productName: item.productName,
                productCode: item.productCode || '',
                quantity: item.quantity,
                costo: item.costo || 0,
                notas: item.notas || '',
            });
        });

        await batch.commit();
        await logAdminAction(createdBy, createdByName, 'PEDIDO_CREATE', codigo, fromBranchId, `Pedido creado: ${items.length} ítems → ${toBranchName}`);
        return { id: codigo, codigo, numero };
    },

    // ────────────────────────────────────────────────────────────────────────
    // EDICIÓN DE BORRADOR (lock optimista)
    // ────────────────────────────────────────────────────────────────────────

    async updateBorrador(input: UpdateBorradorInput): Promise<void> {
        const { pedidoId, items, fechaRequerida, notas, editedBy, editedByName, userBranchId, clientLastEditedAt } = input;

        if (!items || items.length === 0) throwStandardError('TRSF_INVALID_QUANTITY', 'Se requiere al menos un ítem');

        const ref = doc(db, COLLECTION, pedidoId);

        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throwStandardError('SYS_TRANSACTION_FAILED', 'Pedido no existe');
            const data = snap.data() as Pedido;

            if (data.status !== 'borrador') throwStandardError('SYS_TRANSACTION_FAILED', `No editable: estado ${data.status}`);
            if (data.fromBranchId !== userBranchId) throwStandardError('AUTH_BRANCH_ACCESS', 'Solo la sucursal emisora edita el borrador');

            // Lock optimista: si el cliente leyó una versión anterior, abortar
            if (clientLastEditedAt != null) {
                const serverEditedAt = (data.lastEditedAt as Timestamp | undefined)?.toMillis?.() ?? 0;
                if (serverEditedAt > clientLastEditedAt) {
                    throwStandardError('SYS_TRANSACTION_FAILED', `LOCK_CONFLICT:${data.lastEditedByName || 'otro usuario'}`);
                }
            }

            tx.update(ref, {
                itemCount: items.length,
                totalUnits: items.reduce((s, i) => s + (i.quantity || 0), 0),
                ...(fechaRequerida ? { fechaRequerida: Timestamp.fromDate(fechaRequerida) } : {}),
                ...(notas !== undefined ? { notas } : {}),
                updatedAt: serverTimestamp(),
                lastEditedBy: editedBy,
                lastEditedByName: editedByName,
                lastEditedAt: serverTimestamp(),
            });
        });

        // Reescribir items en batch separado (los items son sub-colección, fuera de la TX)
        const existing = await this.getItems(pedidoId);
        const batch = writeBatch(db);
        existing.forEach(it => {
            if (it.id) batch.delete(doc(db, COLLECTION, pedidoId, ITEMS_SUB, it.id));
        });
        items.forEach(item => {
            const itemRef = doc(collection(db, COLLECTION, pedidoId, ITEMS_SUB));
            batch.set(itemRef, {
                productId: item.productId,
                masterId: item.masterId,
                productName: item.productName,
                productCode: item.productCode || '',
                quantity: item.quantity,
                costo: item.costo || 0,
                notas: item.notas || '',
            });
        });
        await batch.commit();

        await logAdminAction(editedBy, editedByName, 'PEDIDO_EDIT_BORRADOR', pedidoId, userBranchId, `Borrador editado: ${items.length} ítems`);
    },

    // ────────────────────────────────────────────────────────────────────────
    // VALIDACIÓN: borrador → vigente
    // ────────────────────────────────────────────────────────────────────────

    async validate(pedidoId: string, userId: string, userName: string, userBranchId: string): Promise<void> {
        const ref = doc(db, COLLECTION, pedidoId);
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throwStandardError('SYS_TRANSACTION_FAILED', 'Pedido no existe');
            const data = snap.data() as Pedido;
            if (data.status !== 'borrador') throwStandardError('SYS_TRANSACTION_FAILED', `Solo borradores se validan (actual: ${data.status})`);
            if (data.fromBranchId !== userBranchId) throwStandardError('AUTH_BRANCH_ACCESS');

            tx.update(ref, {
                status: 'vigente',
                validatedBy: userId,
                validatedByName: userName,
                validatedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        });
        await logAdminAction(userId, userName, 'PEDIDO_VALIDATE', pedidoId, userBranchId, `Pedido validado`);
    },

    // ────────────────────────────────────────────────────────────────────────
    // DESVALIDACIÓN: vigente → borrador (solo GERENTE, solo si B no actuó)
    // ────────────────────────────────────────────────────────────────────────

    async devalidate(pedidoId: string, userId: string, userName: string, userBranchId: string, isGerente: boolean): Promise<void> {
        if (!isGerente) throwStandardError('AUTH_ROLE_INSUFFICIENT', 'Solo GERENTE puede desvalidar');
        const ref = doc(db, COLLECTION, pedidoId);
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throwStandardError('SYS_TRANSACTION_FAILED', 'Pedido no existe');
            const data = snap.data() as Pedido;
            if (data.status !== 'vigente') throwStandardError('SYS_TRANSACTION_FAILED', `Solo vigentes se desvalidan (actual: ${data.status})`);
            if (data.fromBranchId !== userBranchId) throwStandardError('AUTH_BRANCH_ACCESS');
            if (data.envioId) throwStandardError('SYS_TRANSACTION_FAILED', 'No se puede desvalidar: ya tiene envío generado');

            tx.update(ref, {
                status: 'borrador',
                devalidatedBy: userId,
                devalidatedByName: userName,
                devalidatedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastEditedBy: userId,
                lastEditedByName: userName,
                lastEditedAt: serverTimestamp(),
            });
        });
        await logAdminAction(userId, userName, 'PEDIDO_DEVALIDATE', pedidoId, userBranchId, `Pedido devuelto a borrador`);
    },

    // ────────────────────────────────────────────────────────────────────────
    // CANCELACIÓN: solicitud + aprobación (GERENTE HQ)
    // ────────────────────────────────────────────────────────────────────────

    /** Marca el pedido como pendiente de cancelación. No cambia status hasta aprobación. */
    async requestCancellation(pedidoId: string, userId: string, userName: string, userBranchId: string, reason: string): Promise<void> {
        if (!reason || !reason.trim()) throwStandardError('SYS_TRANSACTION_FAILED', 'Razón requerida');
        const ref = doc(db, COLLECTION, pedidoId);
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throwStandardError('SYS_TRANSACTION_FAILED', 'Pedido no existe');
            const data = snap.data() as Pedido;
            if (data.status === 'cancelado' || data.status === 'despachado') {
                throwStandardError('SYS_TRANSACTION_FAILED', `No cancelable en estado ${data.status}`);
            }
            if (data.fromBranchId !== userBranchId && data.toBranchId !== userBranchId) {
                throwStandardError('AUTH_BRANCH_ACCESS');
            }

            tx.update(ref, {
                cancellationPending: true,
                cancellationRequestedBy: userId,
                cancellationRequestedByName: userName,
                cancellationRequestedAt: serverTimestamp(),
                cancellationReason: reason.trim(),
                updatedAt: serverTimestamp(),
            });
        });
        await logAdminAction(userId, userName, 'PEDIDO_CANCEL_REQUEST', pedidoId, userBranchId, `Solicitud de cancelación: ${reason}`);
    },

    /** Aprobación final por GERENTE HQ. Cambia status a 'cancelado'. */
    async approveCancellation(pedidoId: string, userId: string, userName: string, isHQManager: boolean): Promise<void> {
        if (!isHQManager) throwStandardError('AUTH_ROLE_INSUFFICIENT', 'Solo GERENTE HQ aprueba cancelaciones');
        const ref = doc(db, COLLECTION, pedidoId);
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throwStandardError('SYS_TRANSACTION_FAILED', 'Pedido no existe');
            const data = snap.data() as Pedido;
            if (!data.cancellationRequestedAt) throwStandardError('SYS_TRANSACTION_FAILED', 'No hay solicitud de cancelación');
            if (data.status === 'cancelado') throwStandardError('SYS_TRANSACTION_FAILED', 'Ya está cancelado');
            if (data.status === 'despachado') throwStandardError('SYS_TRANSACTION_FAILED', 'No cancelable: ya despachado');

            tx.update(ref, {
                status: 'cancelado',
                cancellationPending: false,
                cancelledBy: userId,
                cancelledByName: userName,
                cancelledAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        });
        await logAdminAction(userId, userName, 'PEDIDO_CANCEL_APPROVE', pedidoId, 'HQ', `Cancelación aprobada`);
    },

    /** Rechaza la solicitud de cancelación; el pedido vuelve a su flujo normal. */
    async rejectCancellation(pedidoId: string, userId: string, userName: string, isHQManager: boolean, reason?: string): Promise<void> {
        if (!isHQManager) throwStandardError('AUTH_ROLE_INSUFFICIENT');
        const ref = doc(db, COLLECTION, pedidoId);
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throwStandardError('SYS_TRANSACTION_FAILED');
            const data = snap.data() as Pedido;
            if (!data.cancellationRequestedAt) throwStandardError('SYS_TRANSACTION_FAILED', 'No hay solicitud');

            tx.update(ref, {
                cancellationPending: false,
                cancellationRequestedBy: deleteField(),
                cancellationRequestedByName: deleteField(),
                cancellationRequestedAt: deleteField(),
                cancellationRejectedBy: userId,
                cancellationRejectedByName: userName,
                cancellationRejectedAt: serverTimestamp(),
                cancellationRejectionReason: reason ? reason.trim() : '',
                cancellationReason: reason ? `[RECHAZADA] ${reason}` : '[RECHAZADA]',
                updatedAt: serverTimestamp(),
            });
        });
        await logAdminAction(userId, userName, 'PEDIDO_CANCEL_REJECT', pedidoId, 'HQ', `Cancelación rechazada${reason ? `: ${reason}` : ''}`);
    },

    // ────────────────────────────────────────────────────────────────────────
    // INTERNO: marcar como despachado (lo invoca EnvioService al crear el envío)
    // ────────────────────────────────────────────────────────────────────────

    /** Uso exclusivo de EnvioService. No exponer en UI. */
    async _markDespachado(pedidoId: string, envioId: string, userId: string, userName: string): Promise<void> {
        const ref = doc(db, COLLECTION, pedidoId);
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throwStandardError('SYS_TRANSACTION_FAILED', 'Pedido no existe');
            const data = snap.data() as Pedido;
            if (data.status !== 'vigente') throwStandardError('SYS_TRANSACTION_FAILED', `Solo vigentes se despachan (actual: ${data.status})`);

            tx.update(ref, {
                status: 'despachado',
                envioId,
                despachadoAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        });
        await logAdminAction(userId, userName, 'PEDIDO_DISPATCH', pedidoId, 'SYSTEM', `Marcado despachado por envío ${envioId}`);
    },
};
