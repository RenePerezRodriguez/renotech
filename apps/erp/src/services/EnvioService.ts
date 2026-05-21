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
    limit,
    updateDoc,
} from 'firebase/firestore';
import { Envio, EnvioItem, EnvioStatus, EnvioCancellationMode, EnvioDiscrepancyItemAction, InventoryMovement, PedidoItem } from '@/types';
import { logAdminAction } from '@/lib/audit';
import { throwStandardError } from '@/utils/errorCodes';
import { CounterService } from '@/services/CounterService';
import { PedidoService } from '@/services/PedidoService';
import { AuditAlertService } from '@/services/AuditAlertService';
import { ExpenseService } from '@/services/ExpenseService';
import { JournalService } from '@/services/JournalService';

const COLLECTION = 'envios';
const ITEMS_SUB = 'items';
const PRODUCTS = 'productos';

interface CreateFromPedidoInput {
    pedidoId: string;
    items: EnvioItem[];           // qtyPedida + qtyEnviada por ítem (puede incluir esExtra)
    notas?: string;
    transportId?: string;
    transportMethod?: string;
    transportPaymentType?: 'POR_PAGAR' | 'PAGADO';
    transportCost?: number;
    transportPaymentMethod?: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
    transportBankRef?: string;
    transportName?: string;       // Razón social del transportista (para gasto)
    createdBy: string;
    createdByName: string;
    userBranchId: string;          // debe ser el toBranchId del pedido (B)
}

interface UpdateItemsInput {
    envioId: string;
    items: EnvioItem[];
    notas?: string;
    editedBy: string;
    editedByName: string;
    userBranchId: string;
}

interface DispatchInput {
    envioId: string;
    userId: string;
    userName: string;
    userBranchId: string;
}

interface ReceiveInput {
    envioId: string;
    /** Mapa productId -> qty real recibida */
    received: Record<string, number>;
    /** Mapa productId -> { reason, note } para discrepancias (opcional por ítem) */
    discrepancies?: Record<string, { reason: 'SOBRANTE' | 'FALTANTE' | 'DAÑADO' | 'OTRO'; note?: string }>;
    userId: string;
    userName: string;
    userBranchId: string;
}

/**
 * EnvioService — Despachos generados a partir de pedidos vigentes.
 *
 * Estados: preparacion → en_transito → recibido
 *
 * - El envío hereda el número del pedido (PED-0012 → ENV-0012).
 * - En 'preparacion' B puede modificar libremente cantidades, agregar extras o quitar ítems.
 * - En 'en_transito' B también puede editar (correcciones urgentes); queda marcado editedInTransit.
 * - Stock se afecta así:
 *      - 'en_transito': -B (descuenta stock origen del envío)
 *      - 'recibido': +A (suma stock destino con qty REAL recibida)
 * - Si qtyRecibida != qtyEnviada en algún ítem, hasDiscrepancy=true y se crea alerta.
 */
export const EnvioService = {
    // ────────────────────────────────────────────────────────────────────────
    // LECTURA
    // ────────────────────────────────────────────────────────────────────────

    async getById(envioId: string): Promise<Envio | null> {
        const snap = await getDoc(doc(db, COLLECTION, envioId));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() } as Envio;
    },

    async getItems(envioId: string): Promise<EnvioItem[]> {
        const snap = await getDocs(query(collection(db, COLLECTION, envioId, ITEMS_SUB)));
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as EnvioItem));
    },

    async getWithItems(envioId: string): Promise<{ envio: Envio; items: EnvioItem[] } | null> {
        const envio = await this.getById(envioId);
        if (!envio) return null;
        const items = await this.getItems(envioId);
        return { envio, items };
    },

    /** Retorna un mapa productId → stock actual en la sucursal origen para cada ítem */
    async getOriginStocks(items: EnvioItem[], fromBranchId: string): Promise<Record<string, number>> {
        const result: Record<string, number> = {};
        await Promise.all(items.map(async (it) => {
            const docId = `${fromBranchId}_${it.masterId}`;
            const snap = await getDoc(doc(db, PRODUCTS, docId));
            result[it.productId] = snap.exists() ? ((snap.data()?.stock as number) || 0) : 0;
        }));
        return result;
    },

    async list(
        userBranchId: string,
        direction: 'SALIENTES' | 'ENTRANTES' | 'TODOS' = 'TODOS',
        status?: EnvioStatus,
    ): Promise<Envio[]> {
        const col = collection(db, COLLECTION);

        if (direction === 'SALIENTES') {
            const constraints = [where('fromBranchId', '==', userBranchId)];
            if (status) constraints.push(where('status', '==', status));
            const q = query(col, ...constraints, orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() } as Envio));
        }

        if (direction === 'ENTRANTES') {
            const constraints = [where('toBranchId', '==', userBranchId)];
            if (status) constraints.push(where('status', '==', status));
            const q = query(col, ...constraints, orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() } as Envio));
        }

        const [out, inn] = await Promise.all([
            this.list(userBranchId, 'SALIENTES', status),
            this.list(userBranchId, 'ENTRANTES', status),
        ]);
        const map = new Map<string, Envio>();
        [...out, ...inn].forEach(e => { if (e.id) map.set(e.id, e); });
        return Array.from(map.values()).sort((a, b) => {
            const ta = (a.createdAt as Timestamp)?.toMillis?.() ?? 0;
            const tb = (b.createdAt as Timestamp)?.toMillis?.() ?? 0;
            return tb - ta;
        });
    },

    // ────────────────────────────────────────────────────────────────────────
    // CREACIÓN desde un pedido vigente
    // ────────────────────────────────────────────────────────────────────────

    async createFromPedido(input: CreateFromPedidoInput): Promise<{ id: string; codigo: string; numero: number }> {
        const {
            pedidoId, items, notas,
            transportId, transportMethod, transportPaymentType, transportCost,
            transportPaymentMethod, transportBankRef, transportName,
            createdBy, createdByName, userBranchId,
        } = input;

        if (!items || items.length === 0) throwStandardError('TRSF_INVALID_QUANTITY', 'El envío requiere ítems');

        // Pre-validación de flete: si se va a registrar un gasto, asegurar que la cuenta
        // existe Y tiene saldo suficiente (para EFECTIVO/CASH_DRAWER) antes de crear el envío.
        // Evita envíos huérfanos sin asiento contable.
        if ((transportCost || 0) > 0 && transportPaymentMethod) {
            const { accountId } = await JournalService.resolveAccountId({
                branchId: userBranchId,
                paymentMethod: transportPaymentMethod,
                cashierId: transportPaymentMethod === 'EFECTIVO' ? createdBy : undefined,
            });
            const accSnap = await getDoc(doc(db, 'accounts', accountId));
            if (accSnap.exists()) {
                const accData = accSnap.data() as { type?: string; currentBalance?: number; name?: string };
                if (accData.type === 'CASH_DRAWER' && (accData.currentBalance || 0) < (transportCost || 0) - 0.01) {
                    throw new Error(`Saldo insuficiente en ${accData.name || 'la caja'}: Bs. ${(accData.currentBalance || 0).toFixed(2)} < Bs. ${(transportCost || 0).toFixed(2)}. No se puede pagar el flete en EFECTIVO.`);
                }
            }
        }

        const pedido = await PedidoService.getById(pedidoId);
        if (!pedido) throwStandardError('SYS_TRANSACTION_FAILED', 'Pedido no existe');
        if (pedido!.status !== 'vigente') throwStandardError('SYS_TRANSACTION_FAILED', `Pedido debe estar vigente (actual: ${pedido!.status})`);
        if (pedido!.toBranchId !== userBranchId) throwStandardError('AUTH_BRANCH_ACCESS', 'Solo la sucursal receptora del pedido genera el envío');
        if (pedido!.envioId) throwStandardError('SYS_TRANSACTION_FAILED', 'Este pedido ya tiene envío');

        // El envío hereda el número del pedido (PED-0012 → ENV-0012)
        const numero = pedido!.numero;
        const codigo = CounterService.formatEnvio(numero);

        const ref = doc(db, COLLECTION, codigo);
        const exists = await getDoc(ref);
        if (exists.exists()) throwStandardError('SYS_TRANSACTION_FAILED', `Código ${codigo} ya existe`);

        const batch = writeBatch(db);
        batch.set(ref, {
            numero,
            codigo,
            pedidoId,
            status: 'preparacion',
            // En el envío, la sucursal —from— es B (despachadora) y —to— es A (receptora final).
            // Es decir, los roles del pedido se invierten conceptualmente para el flujo de stock.
            fromBranchId: pedido!.toBranchId,
            fromBranchName: pedido!.toBranchName,
            toBranchId: pedido!.fromBranchId,
            toBranchName: pedido!.fromBranchName,
            notas: notas || '',
            itemCount: items.length,
            totalUnitsEnviadas: items.reduce((s, i) => s + (i.qtyEnviada || 0), 0),
            transportId: transportId || null,
            transportMethod: transportMethod || null,
            transportPaymentType: transportPaymentType || null,
            transportCost: transportCost || 0,
            transportPaymentMethod: transportPaymentMethod || null,
            transportBankRef: transportBankRef || null,
            transportPaymentTarget: transportPaymentType === 'POR_PAGAR' ? pedido!.fromBranchId : null,
            createdBy,
            createdByName,
            createdAt: serverTimestamp(),
            editedInTransit: false,
            hasDiscrepancy: false,
        });

        items.forEach(it => {
            const itemRef = doc(collection(db, COLLECTION, codigo, ITEMS_SUB));
            batch.set(itemRef, {
                productId: it.productId,
                masterId: it.masterId,
                productName: it.productName,
                productCode: it.productCode || '',
                qtyPedida: it.qtyPedida || 0,
                qtyEnviada: it.qtyEnviada || 0,
                costo: it.costo || 0,
                esExtra: !!it.esExtra,
            });
        });

        await batch.commit();

        // Marcar el pedido como despachado (no es atómico con la creación del envío,
        // pero ambas operaciones son idempotentes y auditadas)
        await PedidoService._markDespachado(pedidoId, codigo, createdBy, createdByName);

        // Si el flete se pagó al momento, registrar el gasto operativo TRANSPORTE
        if (transportPaymentType === 'PAGADO' && (transportCost || 0) > 0 && transportPaymentMethod) {
            await this._registerFleteExpense({
                envioCodigo: codigo,
                userBranchId,
                amount: transportCost!,
                paymentMethod: transportPaymentMethod,
                bankRef: transportBankRef,
                transportId,
                transportName: transportName || transportMethod || 'Transportista',
                userId: createdBy,
                userName: createdByName,
            });
        }

        // Si el flete es POR_PAGAR, avisar a la sucursal destino
        if (transportPaymentType === 'POR_PAGAR' && (transportCost || 0) > 0) {
            await AuditAlertService.createAlert({
                type: 'FLETE_POR_PAGAR',
                severity: 'LOW',
                branchId: pedido!.fromBranchId,
                userId: createdBy,
                userName: createdByName,
                message: `Flete por pagar — ${codigo} (${pedido!.fromBranchName})`,
                metadata: {
                    envioId: codigo,
                    amount: transportCost || 0,
                    transportMethod: transportMethod || 'No especificado',
                    fromBranch: pedido!.toBranchName,
                    toBranch: pedido!.fromBranchName,
                },
            });
        }

        await logAdminAction(createdBy, createdByName, 'ENVIO_CREATE', codigo, userBranchId, `Envío creado desde ${pedidoId}`);
        return { id: codigo, codigo, numero };
    },

    // ????????????????????????????????????????????????????????????????????????
    // CREACIÓN DIRECTA (sin pedido origen) - ENVD-NNNN
    // útil para: reposiciones, traslados ad-hoc, devoluciones internas, urgencias.
    // Sigue exactamente el mismo flujo: preparacion ? en_transito ? recibido.
    // ????????????????????????????????????????????????????????????????????????

    async createDirect(input: {
        items: EnvioItem[];
        toBranchId?: string;      // Sucursal destino (receptora). Opcional si es envío a cliente.
        toBranchName?: string;    // Nombre sucursal destino. Opcional si es envío a cliente.
        clientId?: string;        // ID del cliente destino (solo si destino es cliente).
        clientName?: string;      // Razón social del cliente destino.
        notas?: string;
        transportId?: string;
        transportMethod?: string;
        transportPaymentType?: 'POR_PAGAR' | 'PAGADO';
        transportCost?: number;
        transportPaymentMethod?: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
        transportBankRef?: string;
        transportName?: string;
        createdBy: string;
        createdByName: string;
        userBranchId: string;     // Sucursal del usuario = sucursal despachadora
        userBranchName: string;
    }): Promise<{ id: string; codigo: string; numero: number }> {
        const {
            items, toBranchId, toBranchName, clientId, clientName, notas,
            transportId, transportMethod, transportPaymentType, transportCost,
            transportPaymentMethod, transportBankRef, transportName,
            createdBy, createdByName, userBranchId, userBranchName,
        } = input;

        if (!items || items.length === 0) throwStandardError('TRSF_INVALID_QUANTITY', 'El envío requiere ítems');
        // Validar destino: sucursal O cliente, pero no ambos sin especificar
        if (!toBranchId && !clientId) {
            throwStandardError('SYS_TRANSACTION_FAILED', 'Selecciona una sucursal o un cliente como destino');
        }
        if (toBranchId && toBranchId === userBranchId) {
            throwStandardError('SYS_TRANSACTION_FAILED', 'Selecciona una sucursal destino distinta a la tuya');
        }
        for (const it of items) {
            if (!it.masterId) throwStandardError('SYS_TRANSACTION_FAILED', `ítem ${it.productName || it.productId} carece de masterId`);
            if (!Number.isFinite(it.qtyEnviada) || (it.qtyEnviada || 0) <= 0) {
                throwStandardError('TRSF_INVALID_QUANTITY', `Cantidad inválida para ${it.productName}`);
            }
        }

        // Pre-validación de flete: si se va a registrar un gasto, asegurar que la cuenta
        // existe Y tiene saldo suficiente (para EFECTIVO/CASH_DRAWER) antes de crear el envío.
        // Evita envíos huérfanos sin asiento contable.
        if ((transportCost || 0) > 0 && transportPaymentMethod) {
            const { accountId } = await JournalService.resolveAccountId({
                branchId: userBranchId,
                paymentMethod: transportPaymentMethod,
                cashierId: transportPaymentMethod === 'EFECTIVO' ? createdBy : undefined,
            });
            const accSnap = await getDoc(doc(db, 'accounts', accountId));
            if (accSnap.exists()) {
                const accData = accSnap.data() as { type?: string; currentBalance?: number; name?: string };
                if (accData.type === 'CASH_DRAWER' && (accData.currentBalance || 0) < (transportCost || 0) - 0.01) {
                    throw new Error(`Saldo insuficiente en ${accData.name || 'la caja'}: Bs. ${(accData.currentBalance || 0).toFixed(2)} < Bs. ${(transportCost || 0).toFixed(2)}. No se puede pagar el flete en EFECTIVO.`);
                }
            }
        }

        // Reservar correlativo atómico
        const numero = await CounterService.next('envioDirectoSeq');
        const codigo = CounterService.formatEnvioDirecto(numero);

        const ref = doc(db, COLLECTION, codigo);
        const exists = await getDoc(ref);
        if (exists.exists()) throwStandardError('SYS_TRANSACTION_FAILED', `Código ${codigo} ya existe`);

        const batch = writeBatch(db);
        batch.set(ref, {
            numero,
            codigo,
            isDirect: true,
            status: 'preparacion',
            // En envío directo el usuario despacha desde su sucursal hacia toBranchId o cliente
            fromBranchId: userBranchId,
            fromBranchName: userBranchName,
            toBranchId: toBranchId || null,
            toBranchName: toBranchName || null,
            clientId: clientId || null,
            clientName: clientName || null,
            notas: notas || '',
            itemCount: items.length,
            totalUnitsEnviadas: items.reduce((s, i) => s + (i.qtyEnviada || 0), 0),
            transportId: transportId || null,
            transportMethod: transportMethod || null,
            transportPaymentType: transportPaymentType || null,
            transportCost: transportCost || 0,
            transportPaymentMethod: transportPaymentMethod || null,
            transportBankRef: transportBankRef || null,
            // Para envíos a sucursal: paga la receptora. Para envíos a cliente: queda a cargo de la sucursal de origen (informativo).
            transportPaymentTarget: transportPaymentType === 'POR_PAGAR' ? (toBranchId || userBranchId) : null,
            createdBy,
            createdByName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            editedInTransit: false,
            hasDiscrepancy: false,
        });

        items.forEach(it => {
            const itemRef = doc(collection(db, COLLECTION, codigo, ITEMS_SUB));
            batch.set(itemRef, {
                productId: it.productId,
                masterId: it.masterId,
                productName: it.productName,
                productCode: it.productCode || '',
                qtyPedida: 0,                            // sin pedido origen
                qtyEnviada: it.qtyEnviada || 0,
                costo: it.costo || 0,
                esExtra: false,
            });
        });

        await batch.commit();

        // Si el flete se pagó al momento, registrar el gasto operativo TRANSPORTE
        if (transportPaymentType === 'PAGADO' && (transportCost || 0) > 0 && transportPaymentMethod) {
            await this._registerFleteExpense({
                envioCodigo: codigo,
                userBranchId,
                amount: transportCost!,
                paymentMethod: transportPaymentMethod,
                bankRef: transportBankRef,
                transportId,
                transportName: transportName || transportMethod || 'Transportista',
                userId: createdBy,
                userName: createdByName,
            });
        }

        // Si el flete es POR_PAGAR, avisar. Sucursal destino si es interno; sucursal origen si es a cliente externo.
        if (transportPaymentType === 'POR_PAGAR' && (transportCost || 0) > 0) {
            const alertBranchId = toBranchId || userBranchId;
            const destLabel = toBranchName || (clientName ? `cliente ${clientName}` : 'destino');
            await AuditAlertService.createAlert({
                type: 'FLETE_POR_PAGAR',
                severity: 'LOW',
                branchId: alertBranchId,
                userId: createdBy,
                userName: createdByName,
                message: `Flete por pagar — ${codigo} (${destLabel})`,
                metadata: {
                    envioId: codigo,
                    amount: transportCost || 0,
                    transportMethod: transportMethod || 'No especificado',
                    fromBranch: userBranchName,
                    toBranch: destLabel,
                },
            });
        }

        const destLabel = clientName || toBranchName || 'cliente';
        await logAdminAction(createdBy, createdByName, 'ENVIO_CREATE_DIRECT', codigo, userBranchId, `Envío directo a ${destLabel} (${items.length} ítems)`);
        return { id: codigo, codigo, numero };
    },

    // ────────────────────────────────────────────────────────────────────────
    // EDICIÓN DE CABECERA (transporte / pago / notas) — solo en `preparacion`
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Edita los campos de cabecera del envío (transporte, costo, tipo y método
     * de pago, referencia bancaria, transportista, notas) cuando aún está en
     * estado `preparacion`. Si cambian datos del flete y ya existía un gasto
     * registrado, se anula y se vuelve a crear según la nueva configuración.
     */
    async updateHeader(input: {
        envioId: string;
        userId: string;
        userName: string;
        userBranchId: string;
        notas?: string;
        transportId?: string | null;
        transportMethod?: string | null;
        transportName?: string | null;
        transportPaymentType?: 'PAGADO' | 'POR_PAGAR' | null;
        transportPaymentMethod?: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA' | null;
        transportBankRef?: string | null;
        transportCost?: number | null;
    }): Promise<void> {
        const {
            envioId, userId, userName, userBranchId,
            notas, transportId, transportMethod, transportName,
            transportPaymentType, transportPaymentMethod, transportBankRef, transportCost,
        } = input;

        const envio = await this.getById(envioId);
        if (!envio) throwStandardError('SYS_TRANSACTION_FAILED', 'Envío no existe');
        if (envio!.status !== 'preparacion') {
            throwStandardError('SYS_TRANSACTION_FAILED', 'Solo se puede editar la cabecera mientras el envío está en preparación');
        }
        if (envio!.fromBranchId !== userBranchId) {
            throwStandardError('AUTH_BRANCH_ACCESS', 'Solo la sucursal despachadora edita el envío');
        }

        // Detectar si los datos relevantes para el gasto cambiaron
        const newCost = transportCost == null ? 0 : transportCost;
        const newType = transportPaymentType ?? null;
        const newMethod = transportPaymentMethod ?? null;
        const newBankRef = transportBankRef ?? null;
        const newTransportId = transportId ?? null;
        const newTransportMethod = transportMethod ?? null;
        const newTransportName = transportName ?? newTransportMethod ?? 'Transportista';

        const oldCost = envio!.transportCost || 0;
        const oldType = envio!.transportPaymentType || null;
        const oldMethod = envio!.transportPaymentMethod || null;
        const oldBankRef = envio!.transportBankRef || null;
        const oldTransportId = envio!.transportId || null;
        const oldTransportMethod = envio!.transportMethod || null;

        const transportRelevantChanged =
            newCost !== oldCost ||
            newType !== oldType ||
            newMethod !== oldMethod ||
            newBankRef !== oldBankRef ||
            newTransportId !== oldTransportId ||
            newTransportMethod !== oldTransportMethod;

        // 1) Si había gasto y cambió cualquier dato relevante (o ya no aplica), anularlo
        let voidedExpense = false;
        if (envio!.transportExpenseId && transportRelevantChanged) {
            try {
                await ExpenseService.void(
                    envio!.transportExpenseId,
                    userId,
                    userName,
                    `Edición de cabecera de envío ${envioId}`,
                    envio!.fromBranchId,
                );
                voidedExpense = true;
            } catch (err) {
                console.error('[EnvioService.updateHeader] No se pudo anular el gasto previo:', err);
                throwStandardError('SYS_TRANSACTION_FAILED', 'No se pudo anular el gasto previo del flete. Intenta más tarde.');
            }
        }

        // 2) Persistir nuevos campos en el envío
        const ref = doc(db, COLLECTION, envioId);
        const updates: Record<string, unknown> = {
            updatedAt: serverTimestamp(),
            lastHeaderEditAt: serverTimestamp(),
            lastHeaderEditBy: userId,
            lastHeaderEditByName: userName,
        };
        if (notas !== undefined) updates.notas = notas || null;
        if (transportId !== undefined) updates.transportId = newTransportId;
        if (transportMethod !== undefined) updates.transportMethod = newTransportMethod;
        if (transportName !== undefined) updates.transportName = newTransportName;
        if (transportPaymentType !== undefined) updates.transportPaymentType = newType;
        if (transportPaymentMethod !== undefined) updates.transportPaymentMethod = newMethod;
        if (transportBankRef !== undefined) updates.transportBankRef = newBankRef;
        if (transportCost !== undefined) updates.transportCost = newCost;
        if (voidedExpense) updates.transportExpenseId = deleteField();

        await updateDoc(ref, updates);

        // 3) Si la nueva configuración requiere registrar gasto (PAGADO + cost + method), crearlo
        if (transportRelevantChanged && newType === 'PAGADO' && newCost > 0 && newMethod) {
            await this._registerFleteExpense({
                envioCodigo: envioId,
                userBranchId: envio!.fromBranchId,
                amount: newCost,
                paymentMethod: newMethod,
                bankRef: newBankRef || undefined,
                transportId: newTransportId || undefined,
                transportName: newTransportName,
                userId,
                userName,
            });
        }

        // 4) Si la nueva configuración es POR_PAGAR + cost > 0, crear alerta informativa
        if (transportRelevantChanged && newType === 'POR_PAGAR' && newCost > 0) {
            const alertBranchId = envio!.transportPaymentTarget || envio!.toBranchId || envio!.fromBranchId;
            const destLabel = envio!.toBranchName || envio!.clientName || 'destino';
            try {
                await AuditAlertService.createAlert({
                    type: 'FLETE_POR_PAGAR',
                    severity: 'LOW',
                    branchId: alertBranchId,
                    userId,
                    userName,
                    message: `Flete por pagar — ${envioId} (${destLabel})`,
                    metadata: {
                        envioId,
                        amount: newCost,
                        transportMethod: newTransportMethod || 'No especificado',
                        fromBranch: envio!.fromBranchName,
                        toBranch: destLabel,
                    },
                });
            } catch (err) {
                console.warn('[EnvioService.updateHeader] No se pudo crear alerta POR_PAGAR:', err);
            }
        }

        await logAdminAction(
            userId,
            userName,
            'ENVIO_EDIT_HEADER',
            envioId,
            envio!.fromBranchId,
            `Cabecera editada${transportRelevantChanged ? ' (transporte actualizado)' : ''}`,
        );
    },

    // ────────────────────────────────────────────────────────────────────────
    // EDICIÓN (cantidades / extras / quitar) — preparacion o en_transito
    // ────────────────────────────────────────────────────────────────────────

    async updateItems(input: UpdateItemsInput): Promise<void> {
        const { envioId, items, notas, editedBy, editedByName, userBranchId } = input;
        if (!items || items.length === 0) throwStandardError('TRSF_INVALID_QUANTITY', 'El envío requiere ítems');

        // Filtrar ítems con qtyEnviada=0 (eliminados implícitamente al editar)
        const cleanItems = items.filter(i => (i.qtyEnviada || 0) > 0);
        if (cleanItems.length === 0) throwStandardError('TRSF_INVALID_QUANTITY', 'Al menos un ítem debe tener cantidad mayor a 0');

        // Validar masterId obligatorio en cada ítem con cantidad: previene envíos no despachables
        for (const it of cleanItems) {
            if (!it.masterId?.trim()) {
                throwStandardError('SYS_TRANSACTION_FAILED', `ítem ${it.productName || it.productId} carece de masterId`);
            }
        }

        const ref = doc(db, COLLECTION, envioId);
        let isInTransit = false;

        // Pre-cargar items existentes (para borrar dentro de la TX principal)
        const existing = await this.getItems(envioId);

        // Si está en tránsito, ajustar stock PRIMERO en TX dedicada.
        // Si falla, abortamos antes de tocar el envio (estado inconsistente evitado).
        const preview = await this.getById(envioId);
        if (!preview) throwStandardError('SYS_TRANSACTION_FAILED', 'Envío no existe');
        if (preview!.status === 'recibido') throwStandardError('SYS_TRANSACTION_FAILED', 'No editable: ya recibido');
        if (preview!.fromBranchId !== userBranchId) throwStandardError('AUTH_BRANCH_ACCESS', 'Solo la sucursal despachadora edita el envío');
        if (preview!.status === 'en_transito') {
            await this._adjustStockOnTransitEdit(envioId, cleanItems, editedBy, editedByName);
        }

        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throwStandardError('SYS_TRANSACTION_FAILED', 'Envío no existe');
            const data = snap.data() as Envio;
            if (data.status === 'recibido') throwStandardError('SYS_TRANSACTION_FAILED', 'No editable: ya recibido');
            if (data.fromBranchId !== userBranchId) throwStandardError('AUTH_BRANCH_ACCESS', 'Solo la sucursal despachadora edita el envío');

            isInTransit = data.status === 'en_transito';

            tx.update(ref, {
                itemCount: cleanItems.length,
                totalUnitsEnviadas: cleanItems.reduce((s, i) => s + (i.qtyEnviada || 0), 0),
                updatedAt: serverTimestamp(),
                ...(notas !== undefined ? { notas } : {}),
                ...(isInTransit
                    ? {
                        editedInTransit: true,
                        lastTransitEditAt: serverTimestamp(),
                        lastTransitEditBy: editedBy,
                        lastTransitEditByName: editedByName,
                    }
                    : {}),
            });

            // Borrar items previos y crear los nuevos en la MISMA TX (atomicidad total)
            for (const it of existing) {
                if (it.id) tx.delete(doc(db, COLLECTION, envioId, ITEMS_SUB, it.id));
            }
            for (const it of cleanItems) {
                const itemRef = doc(collection(db, COLLECTION, envioId, ITEMS_SUB));
                tx.set(itemRef, {
                    productId: it.productId,
                    masterId: it.masterId,
                    productName: it.productName,
                    productCode: it.productCode || '',
                    qtyPedida: it.qtyPedida || 0,
                    qtyEnviada: it.qtyEnviada || 0,
                    costo: it.costo || 0,
                    esExtra: !!it.esExtra,
                });
            }
        });

                await logAdminAction(editedBy, editedByName, isInTransit ? 'ENVIO_EDIT_TRANSIT' : 'ENVIO_EDIT_PREP', envioId, userBranchId, `Envío editado (${cleanItems.length} ítems)`);
    },

    /** Ajusta stock de la sucursal despachadora cuando se editan cantidades en tránsito. */
    async _adjustStockOnTransitEdit(envioId: string, newItems: EnvioItem[], userId: string, userName: string): Promise<void> {
        const oldItems = await this.getItems(envioId);
        const oldMap = new Map(oldItems.map(i => [i.productId, i.qtyEnviada || 0]));

        const envio = await this.getById(envioId);
        if (!envio) return;

        const deltas = newItems
            .map(it => ({ it, delta: (it.qtyEnviada || 0) - (oldMap.get(it.productId) || 0) }))
            .filter(d => d.delta !== 0);
        if (deltas.length === 0) return;

        // UNA SOLA TX para todos los ítems: si cualquiera falla (ej. stock insuficiente),
        // ninguno se aplica. Antes era N transacciones independientes con riesgo de
        // estado parcialmente aplicado.
        await runTransaction(db, async (tx) => {
            const pRefs = deltas.map(d => doc(db, PRODUCTS, d.it.productId));
            const pSnaps = await Promise.all(pRefs.map(r => tx.get(r)));

            for (let i = 0; i < deltas.length; i++) {
                const { it, delta } = deltas[i];
                const pSnap = pSnaps[i];
                const pRef = pRefs[i];
                if (!pSnap.exists()) continue;
                const pData = pSnap.data();
                const currentStock = pData.stock || 0;
                const newStock = currentStock - delta; // delta>0 = enviar más, descontar
                if (newStock < 0) throwStandardError('INV_INSUFFICIENT_STOCK', it.productName);

                tx.update(pRef, { stock: newStock, updatedAt: serverTimestamp() });

                const movRef = doc(collection(db, 'movimientos'));
                tx.set(movRef, {
                    productId: it.productId,
                    masterId: it.masterId,
                    type: delta > 0 ? 'TRASP_SALIDA' : 'TRASP_REVERSAL',
                    quantity: -delta,
                    currentStock: newStock,
                    previousStock: currentStock,
                    reason: `Ajuste en tránsito ${envioId} (${delta > 0 ? '+' : ''}${delta})`,
                    date: serverTimestamp(),
                    userId,
                    userName,
                    branchId: envio.fromBranchId,
                    unitCost: it.costo || pData.costo || 0,
                    createdAt: serverTimestamp(),
                } as InventoryMovement);
            }
        });
    },

    // ────────────────────────────────────────────────────────────────────────
    // DESPACHO: preparacion ' en_transito (descuenta stock B)
    // ────────────────────────────────────────────────────────────────────────

    async dispatch(input: DispatchInput): Promise<void> {
        const { envioId, userId, userName, userBranchId } = input;

        const envio = await this.getById(envioId);
        if (!envio) throwStandardError('SYS_TRANSACTION_FAILED', 'Envío no existe');
        if (envio!.status !== 'preparacion') throwStandardError('SYS_TRANSACTION_FAILED', `Solo se despacha en preparacion (actual: ${envio!.status})`);
        if (envio!.fromBranchId !== userBranchId) throwStandardError('AUTH_BRANCH_ACCESS');

        const items = await this.getItems(envioId);
        if (items.length === 0) throwStandardError('TRSF_INVALID_QUANTITY', 'Envío sin ítems');

        // Validación: cada ítem debe tener masterId para trazabilidad cross-branch
        for (const it of items) {
            if (!it.masterId || it.masterId.trim() === '') {
                throwStandardError('SYS_TRANSACTION_FAILED', `ítem ${it.productName || it.productId} carece de masterId`);
            }
        }

        const ref = doc(db, COLLECTION, envioId);

        await runTransaction(db, async (tx) => {
            // 1) LECTURAS primero
            const snaps = await Promise.all(
                items
                    .filter(i => (i.qtyEnviada || 0) > 0)
                    .map(async i => {
                        const pRef = doc(db, PRODUCTS, i.productId);
                        const pSnap = await tx.get(pRef);
                        return { item: i, ref: pRef, snap: pSnap };
                    })
            );
            const envioSnap = await tx.get(ref);
            if (!envioSnap.exists()) throwStandardError('SYS_TRANSACTION_FAILED');
            if ((envioSnap.data() as Envio).status !== 'preparacion') throwStandardError('SYS_TRANSACTION_FAILED', 'Estado cambió');

            // 2) ESCRITURAS
            for (const { item, ref: pRef, snap } of snaps) {
                if (!snap.exists()) throwStandardError('INV_PRODUCT_NOT_FOUND', item.productId);
                const pData = snap.data();
                const currentStock = pData.stock || 0;
                const qty = item.qtyEnviada || 0;
                const newStock = currentStock - qty;
                if (newStock < 0) throwStandardError('INV_INSUFFICIENT_STOCK', item.productName);

                tx.update(pRef, { stock: newStock, updatedAt: serverTimestamp() });

                const movRef = doc(collection(db, 'movimientos'));
                tx.set(movRef, {
                    productId: item.productId,
                    masterId: item.masterId,
                    type: 'TRASP_SALIDA',
                    quantity: -qty,
                    currentStock: newStock,
                    previousStock: currentStock,
                    reason: `Despacho envío ${envioId}`,
                    date: serverTimestamp(),
                    userId,
                    userName,
                    branchId: envio!.fromBranchId,
                    unitCost: item.costo || pData.costo || 0,
                    createdAt: serverTimestamp(),
                } as InventoryMovement);
            }

            tx.update(ref, {
                status: 'en_transito',
                despachadoBy: userId,
                despachadoByName: userName,
                despachadoAt: serverTimestamp(),
            });

            // Envíos a cliente externo: no hay sucursal receptora que confirme,
            // por lo que se marca como recibido en el mismo acto del despacho.
            // El stock ya fue descontado del origen y no se suma en ningún destino interno.
            if (envio!.clientId) {
                tx.update(ref, {
                    status: 'recibido',
                    recibidoBy: userId,
                    recibidoByName: userName,
                    recibidoAt: serverTimestamp(),
                    autoReceivedReason: 'CLIENTE_EXTERNO',
                });
            }
        });

        await logAdminAction(userId, userName, 'ENVIO_DISPATCH', envioId, userBranchId, `Envío despachado (${items.length} ítems)${envio!.clientId ? ' — auto-recibido (cliente externo)' : ''}`);
    },

    // ────────────────────────────────────────────────────────────────────────
    // RECEPCIÓN: en_transito ' recibido (suma stock A, justifica discrepancias)
    // ────────────────────────────────────────────────────────────────────────

    async receive(input: ReceiveInput): Promise<{ hasDiscrepancy: boolean }> {
        const { envioId, received, discrepancies, userId, userName, userBranchId } = input;

        const envio = await this.getById(envioId);
        if (!envio) throwStandardError('SYS_TRANSACTION_FAILED', 'Envío no existe');
        if (envio!.status !== 'en_transito') throwStandardError('SYS_TRANSACTION_FAILED', `Solo en_transito se recibe (actual: ${envio!.status})`);
        if (envio!.cancellationPending) throwStandardError('SYS_TRANSACTION_FAILED', 'Hay una solicitud de cancelación pendiente. No se puede recibir.');
        if (envio!.toBranchId !== userBranchId) throwStandardError('AUTH_BRANCH_ACCESS', 'Solo la sucursal receptora confirma');

        const items = await this.getItems(envioId);
        if (items.length === 0) throwStandardError('SYS_TRANSACTION_FAILED', 'El envío no tiene ítems');
        const ref = doc(db, COLLECTION, envioId);

        let hasDiscrepancy = false;
        let totalRecibidas = 0;
        const discrepantProductNames: string[] = [];

        // Validar que cada ítem reciba un valor (puede ser 0 = no llegó nada)
        for (const it of items) {
            if (!it.masterId) {
                throwStandardError('SYS_TRANSACTION_FAILED', `ítem ${it.productName || it.productId} carece de masterId`);
            }
            const qtyRec = received[it.productId];
            if (qtyRec == null || !Number.isFinite(qtyRec) || qtyRec < 0) {
                throwStandardError('SYS_TRANSACTION_FAILED', `Falta cantidad recibida para ${it.productName}`);
            }
            if (qtyRec !== (it.qtyEnviada || 0)) {
                hasDiscrepancy = true;
                discrepantProductNames.push(it.productName || it.productId);
                if (!discrepancies?.[it.productId]?.reason) {
                    throwStandardError('SYS_TRANSACTION_FAILED', `Justifica la diferencia en ${it.productName}`);
                }
            }
            totalRecibidas += qtyRec;
        }

        // Determinación de los documentos de destino usando ID determinístico.
        // No necesitamos getDocs externos previos. Todo se resolverá transaccionalmente.
        type ResolvedProduct = {
            item: EnvioItem;
            qtyRec: number;
            destProductRef: ReturnType<typeof doc>;
            masterRef: ReturnType<typeof doc>;
        };
        const resolved: ResolvedProduct[] = [];
        for (const it of items) {
            const qtyRec = received[it.productId] || 0;
            if (qtyRec <= 0) continue;

            const deterministicId = `${envio!.toBranchId}_${it.masterId}`;
            const destProductRef = doc(db, PRODUCTS, deterministicId);

            resolved.push({
                item: it,
                qtyRec,
                destProductRef,
                masterRef: doc(db, 'catalogo_maestro', it.masterId),
            });
        }

        await runTransaction(db, async (tx) => {
            // ?? LECTURAS ??
            const envioSnap = await tx.get(ref);
            if (!envioSnap.exists()) throwStandardError('SYS_TRANSACTION_FAILED');
            const eData = envioSnap.data() as Envio;
            if (eData.status !== 'en_transito') throwStandardError('SYS_TRANSACTION_FAILED', 'Estado cambió');
            if (eData.cancellationPending) throwStandardError('SYS_TRANSACTION_FAILED', 'Solicitud de cancelación pendiente');

            const productSnaps = await Promise.all(
                resolved.map(async r => {
                    const pSnap = await tx.get(r.destProductRef);
                    const masterSnap = !pSnap.exists() ? await tx.get(r.masterRef) : null;
                    return { ...r, snap: pSnap, masterSnap };
                })
            );

            // ?? ESCRITURAS ??
            for (const r of productSnaps) {
                const { item, qtyRec, destProductRef, snap, masterSnap } = r;

                if (!snap.exists()) {
                    // Crear producto en destino con stock = qtyRec, hidratado desde maestro.
                    if (!masterSnap || !masterSnap.exists()) {
                        throwStandardError('SYS_TRANSACTION_FAILED', `Producto ${item.productName} (masterId ${item.masterId}) no existe en catálogo maestro`);
                    }
                    const masterData = masterSnap.data();
                    const newProduct = {
                        masterId: item.masterId,
                        branchId: envio!.toBranchId,
                        stock: qtyRec,
                        minStock: 0,
                        isActive: true,
                        // Denormalizados desde maestro (garantizado existente por validación previa)
                        codigo: masterData.codigo || item.productCode || 'SIN-CODIGO',
                        nombre: masterData.nombre || item.productName || 'Producto sin nombre',
                        marca: masterData.marca || '',
                        categoria: masterData.categoria || '',
                        costo: masterData.costoBase || item.costo || 0,
                        precio: masterData.precioDefault || 0,
                        precioConFactura: masterData.precioConFactura || masterData.precioDefault || 0,
                        precioSinFactura: masterData.precioSinFactura || masterData.precioDefault || 0,
                        codigoFabrica: masterData.codigoFabrica || '',
                        marcaId: masterData.marcaId || '',
                        categoriaId: masterData.categoriaId || '',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    };
                    tx.set(destProductRef, newProduct);

                    const movRef = doc(collection(db, 'movimientos'));
                    tx.set(movRef, {
                        productId: destProductRef.id,
                        masterId: item.masterId,
                        type: 'TRASP_ENTRADA',
                        quantity: qtyRec,
                        currentStock: qtyRec,
                        previousStock: 0,
                        reason: `Recepción envío ${envioId} (producto creado en destino)`,
                        date: serverTimestamp(),
                        userId,
                        userName,
                        branchId: envio!.toBranchId,
                        unitCost: newProduct.costo,
                        createdAt: serverTimestamp(),
                    } as InventoryMovement);
                } else {
                    const pData = snap.data();
                    const currentStock = pData.stock || 0;
                    const newStock = currentStock + qtyRec;

                    tx.update(destProductRef, { stock: newStock, updatedAt: serverTimestamp() });

                    const movRef = doc(collection(db, 'movimientos'));
                    tx.set(movRef, {
                        productId: destProductRef.id,
                        masterId: item.masterId,
                        type: 'TRASP_ENTRADA',
                        quantity: qtyRec,
                        currentStock: newStock,
                        previousStock: currentStock,
                        reason: `Recepción envío ${envioId}`,
                        date: serverTimestamp(),
                        userId,
                        userName,
                        branchId: envio!.toBranchId,
                        // Costo por sucursal del receptor: usar el costo del producto destino,
                        // NO heredar el costo del despachador. Solo fallback si destino no lo tiene.
                        unitCost: pData.costo || item.costo || 0,
                        createdAt: serverTimestamp(),
                    } as InventoryMovement);
                }
            }

            // Actualizar items dentro de la misma TX (subcolecciones permitidas)
            for (const it of items) {
                if (!it.id) {
                    console.warn(`[EnvioService.receive] ítem sin id en envío ${envioId}, no se persiste qtyRecibida`, it);
                    continue;
                }
                const itemRef = doc(db, COLLECTION, envioId, ITEMS_SUB, it.id);
                const patch: Record<string, unknown> = {
                    qtyRecibida: received[it.productId] ?? 0,
                };
                const disc = discrepancies?.[it.productId];
                if (disc) {
                    patch.discrepancyReason = disc.reason;
                    patch.discrepancyNote = disc.note || '';
                }
                tx.update(itemRef, patch);
            }

            tx.update(ref, {
                status: 'recibido',
                recibidoBy: userId,
                recibidoByName: userName,
                recibidoAt: serverTimestamp(),
                totalUnitsRecibidas: totalRecibidas,
                hasDiscrepancy,
                ...(hasDiscrepancy ? { discrepancyStatus: 'pending' } : {}),
            });
        });

        if (hasDiscrepancy) {
            // Crear alerta de auditoría (best-effort, no rompe el flujo)
            try {
                const alertId = await AuditAlertService.createAlert({
                    type: 'TRANSFER_DISCREPANCY',
                    severity: 'MEDIUM',
                    branchId: envio!.toBranchId,
                    userId,
                    userName,
                    message: `Discrepancia en recepción del envío ${envioId}: cantidades despachadas y recibidas no coinciden.`,
                    metadata: {
                        envioId,
                        pedidoId: envio!.pedidoId || null,
                        fromBranchId: envio!.fromBranchId,
                        fromBranchName: envio!.fromBranchName,
                        toBranchId: envio!.toBranchId,
                        toBranchName: envio!.toBranchName,
                        productNames: discrepantProductNames,
                    },
                });
                if (alertId) {
                    try { await updateDoc(ref, { discrepancyAlertId: alertId }); } catch (e) { console.error('[EnvioService.receive] Failed to link discrepancyAlertId', e); }
                }
            } catch (err) {
                console.error('[EnvioService.receive] No se pudo crear alerta de discrepancia:', err);
            }
        }

        await logAdminAction(userId, userName, 'ENVIO_RECEIVE', envioId, userBranchId, `Recibido (discrepancia: ${hasDiscrepancy})`);
        return { hasDiscrepancy };
    },

    // ────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Crea un borrador inicial de items para un envío a partir de los items del pedido.
     * No persiste; útil para precargar la UI de preparación.
     */
    pedidoItemsToEnvioItems(pedidoItems: PedidoItem[]): EnvioItem[] {
        return pedidoItems.map(pi => ({
            productId: pi.productId,
            masterId: pi.masterId,
            productName: pi.productName,
            productCode: pi.productCode,
            qtyPedida: pi.quantity,
            qtyEnviada: pi.quantity,  // sugerencia inicial = lo solicitado
            costo: pi.costo,
            esExtra: false,
        }));
    },

    // ─────────────────────────────────────────────────────────────────────
    // CANCELACIÓN EN TRÁNSITO (requiere aprobación GERENTE HQ)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Origen o destino solicita cancelar un envío en tránsito.
     * mode='devolucion': al aprobarse, el stock vuelve a la sucursal despachadora (B).
     * mode='perdida': el stock NO vuelve (mercadería dada por perdida / ya facturada).
     */
    async requestInTransitCancellation(input: {
        envioId: string;
        mode: EnvioCancellationMode;
        reason: string;
        userId: string;
        userName: string;
        userBranchId: string;
    }): Promise<void> {
        const { envioId, mode, reason, userId, userName, userBranchId } = input;
        if (!reason || reason.trim().length < 5) throwStandardError('SYS_TRANSACTION_FAILED', 'Motivo requerido (mínimo 5 caracteres)');

        const ref = doc(db, COLLECTION, envioId);
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throwStandardError('SYS_TRANSACTION_FAILED', 'Envío no existe');
            const data = snap.data() as Envio;
            if (data.status !== 'en_transito') throwStandardError('SYS_TRANSACTION_FAILED', `Solo se cancela en tránsito (actual: ${data.status})`);
            if (data.fromBranchId !== userBranchId && data.toBranchId !== userBranchId) throwStandardError('AUTH_BRANCH_ACCESS');
            if (data.cancellationPending) throwStandardError('SYS_TRANSACTION_FAILED', 'Ya existe una solicitud pendiente');
            tx.update(ref, {
                cancellationPending: true,
                cancellationMode: mode,
                cancellationReason: reason.trim(),
                cancellationRequestedBy: userId,
                cancellationRequestedByName: userName,
                cancellationRequestedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        });

        await logAdminAction(userId, userName, 'ENVIO_CANCEL_REQUEST', envioId, userBranchId, `Modo: ${mode} | ${reason.trim()}`);
    },

    /**
     * GERENTE HQ aprueba la cancelación. Si mode='devolucion' devuelve stock a B (TRASP_REVERSAL).
     */
    async approveInTransitCancellation(input: {
        envioId: string;
        approverId: string;
        approverName: string;
        isHQManager: boolean;
    }): Promise<void> {
        const { envioId, approverId, approverName, isHQManager } = input;
        if (!isHQManager) throwStandardError('AUTH_ROLE_INSUFFICIENT', 'Solo GERENTE HQ');

        const envio = await this.getById(envioId);
        if (!envio) throwStandardError('SYS_TRANSACTION_FAILED');
        if (!envio!.cancellationPending) throwStandardError('SYS_TRANSACTION_FAILED', 'No hay solicitud pendiente');
        if (envio!.status !== 'en_transito') throwStandardError('SYS_TRANSACTION_FAILED', 'Estado cambió');

        const mode = envio!.cancellationMode!;
        const items = await this.getItems(envioId);
        const ref = doc(db, COLLECTION, envioId);

        type ResolvedReversal = {
            item: EnvioItem;
            qty: number;
            originRef: ReturnType<typeof doc>;
            masterRef: ReturnType<typeof doc>;
        };
        const resolvedRev: ResolvedReversal[] = [];
        if (mode === 'devolucion') {
            for (const it of items) {
                const qty = it.qtyEnviada || 0;
                if (qty <= 0) continue;
                if (!it.masterId) {
                    throwStandardError('SYS_TRANSACTION_FAILED', `ítem ${it.productName || it.productId} carece de masterId`);
                }

                const deterministicId = `${envio!.fromBranchId}_${it.masterId}`;
                const originRef = doc(db, PRODUCTS, deterministicId);

                resolvedRev.push({
                    item: it,
                    qty,
                    originRef,
                    masterRef: doc(db, 'catalogo_maestro', it.masterId),
                });
            }
        }

        await runTransaction(db, async (tx) => {
            // 1) LECTURAS
            const productSnaps = mode === 'devolucion'
                ? await Promise.all(
                    resolvedRev.map(async r => {
                        const pSnap = await tx.get(r.originRef);
                        const masterSnap = !pSnap.exists() ? await tx.get(r.masterRef) : null;
                        return { ...r, snap: pSnap, masterSnap };
                    })
                )
                : [];
            const envioSnap = await tx.get(ref);
            if (!envioSnap.exists()) throwStandardError('SYS_TRANSACTION_FAILED');
            const eData = envioSnap.data() as Envio;
            if (!eData.cancellationPending || eData.status !== 'en_transito') throwStandardError('SYS_TRANSACTION_FAILED', 'Estado cambió');

            // 2) ESCRITURAS (devolución: revierte stock al despachador B)
            if (mode === 'devolucion') {
                for (const r of productSnaps) {
                    const { item, qty, originRef, snap, masterSnap } = r;

                    if (!snap.exists()) {
                        const masterData = masterSnap?.exists() ? masterSnap.data() : null;
                        if (!masterData) {
                            throwStandardError('SYS_TRANSACTION_FAILED', `Producto ${item.productName} (masterId ${item.masterId}) no existe en catálogo maestro`);
                        }
                        const newProduct = {
                            masterId: item.masterId,
                            branchId: envio!.fromBranchId,
                            stock: qty,
                            minStock: 0,
                            isActive: true,
                            codigo: masterData?.codigo || item.productCode || 'SIN-CODIGO',
                            nombre: masterData?.nombre || item.productName || 'Producto sin nombre',
                            marca: masterData?.marca || '',
                            categoria: masterData?.categoria || '',
                            costo: masterData?.costoBase || item.costo || 0,
                            precio: masterData?.precioDefault || 0,
                            precioConFactura: masterData?.precioConFactura || masterData?.precioDefault || 0,
                            precioSinFactura: masterData?.precioSinFactura || masterData?.precioDefault || 0,
                            codigoFabrica: masterData?.codigoFabrica || '',
                            marcaId: masterData?.marcaId || '',
                            categoriaId: masterData?.categoriaId || '',
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        };
                        tx.set(originRef, newProduct);
                        const movRef = doc(collection(db, 'movimientos'));
                        tx.set(movRef, {
                            productId: originRef.id,
                            masterId: item.masterId,
                            type: 'TRASP_REVERSAL',
                            quantity: qty,
                            currentStock: qty,
                            previousStock: 0,
                            reason: `Cancelación envío ${envioId} (devolución, producto recreado en origen)`,
                            date: serverTimestamp(),
                            userId: approverId,
                            userName: approverName,
                            branchId: envio!.fromBranchId,
                            unitCost: newProduct.costo,
                            createdAt: serverTimestamp(),
                        } as InventoryMovement);
                    } else {
                        const pData = snap.data();
                        const currentStock = pData.stock || 0;
                        const newStock = currentStock + qty;
                        tx.update(originRef, { stock: newStock, updatedAt: serverTimestamp() });
                        const movRef = doc(collection(db, 'movimientos'));
                        tx.set(movRef, {
                            productId: originRef.id,
                            masterId: item.masterId,
                            type: 'TRASP_REVERSAL',
                            quantity: qty,
                            currentStock: newStock,
                            previousStock: currentStock,
                            reason: `Cancelación envío ${envioId} (devolución)`,
                            date: serverTimestamp(),
                            userId: approverId,
                            userName: approverName,
                            branchId: envio!.fromBranchId,
                            unitCost: pData.costo || item.costo || 0,
                            createdAt: serverTimestamp(),
                        } as InventoryMovement);
                    }
                }
            }

            tx.update(ref, {
                status: mode === 'devolucion' ? 'cancelado_devolucion' : 'cancelado_perdida',
                cancellationPending: false,
                cancellationMode: mode,
                cancelledBy: approverId,
                cancelledByName: approverName,
                cancelledAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        });

        // Alerta de auditoría (best-effort)
        try {
            await AuditAlertService.createAlert({
                type: 'ENVIO_CANCEL_APPROVED',
                severity: mode === 'perdida' ? 'HIGH' : 'MEDIUM',
                branchId: envio!.fromBranchId,
                userId: approverId,
                userName: approverName,
                message: `Cancelación de envío ${envioId} APROBADA (${mode === 'devolucion' ? 'devolución con reversa de stock' : 'pérdida sin reversa'}).`,
                metadata: { envioId, pedidoId: envio!.pedidoId || null, mode, fromBranchId: envio!.fromBranchId, toBranchId: envio!.toBranchId },
            });
        } catch (e) { console.error('[EnvioService.cancelApprove] Failed to create audit alert', e); }

        await logAdminAction(approverId, approverName, 'ENVIO_CANCEL_APPROVE', envioId, envio!.fromBranchId, `Modo: ${mode}`);
    },

    /**
     * GERENTE HQ rechaza la solicitud. El envío vuelve a 'en_transito' normal.
     */
    async rejectInTransitCancellation(input: {
        envioId: string;
        approverId: string;
        approverName: string;
        isHQManager: boolean;
        reason: string;
    }): Promise<void> {
        const { envioId, approverId, approverName, isHQManager, reason } = input;
        if (!isHQManager) throwStandardError('AUTH_ROLE_INSUFFICIENT', 'Solo GERENTE HQ');
        if (!reason || reason.trim().length < 5) throwStandardError('SYS_TRANSACTION_FAILED', 'Motivo de rechazo requerido');

        const ref = doc(db, COLLECTION, envioId);
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) throwStandardError('SYS_TRANSACTION_FAILED');
            const data = snap.data() as Envio;
            if (!data.cancellationPending) throwStandardError('SYS_TRANSACTION_FAILED', 'No hay solicitud pendiente');
            tx.update(ref, {
                cancellationPending: false,
                cancellationRequestedBy: deleteField(),
                cancellationRequestedByName: deleteField(),
                cancellationRequestedAt: deleteField(),
                cancellationMode: deleteField(),
                cancellationRejectedBy: approverId,
                cancellationRejectedByName: approverName,
                cancellationRejectedAt: serverTimestamp(),
                cancellationRejectionReason: reason.trim(),
                updatedAt: serverTimestamp(),
            });
        });

        // Alerta de auditoría (best-effort)
        const e = await this.getById(envioId).catch(() => null);
        try {
            await AuditAlertService.createAlert({
                type: 'ENVIO_CANCEL_REJECTED',
                severity: 'LOW',
                branchId: e?.fromBranchId || '',
                userId: approverId,
                userName: approverName,
                message: `Cancelación de envío ${envioId} RECHAZADA. Motivo: ${reason.trim()}`,
                metadata: { envioId, pedidoId: e?.pedidoId || null, fromBranchId: e?.fromBranchId, toBranchId: e?.toBranchId },
            });
        } catch (e) { console.error('[EnvioService.cancelReject] Failed to create audit alert', e); }

        await logAdminAction(approverId, approverName, 'ENVIO_CANCEL_REJECT', envioId, e?.fromBranchId || 'HQ', reason.trim());
    },

    /**
     * Suscripción en tiempo real a la cola de envíos con cancelación pendiente.
     */
    subscribePendingCancellations(callback: (envios: Envio[]) => void) {
        const q = query(
            collection(db, COLLECTION),
            where('cancellationPending', '==', true),
            orderBy('cancellationRequestedAt', 'desc'),
        );
        return onSnapshot(q, snap => {
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Envio)));
        });
    },

    // ????????????????????????????????????????????????????????????????????????
    // RESOLUCIÓN DE DISCREPANCIAS (gerencia)
    // ????????????????????????????????????????????????????????????????????????
    /**
     * Aprueba o rechaza una discrepancia de recepción.
     *  - decision='rejected': solo registra (sin tocar stock).
     *  - decision='approved' + perItemActions: ajusta stock origen por ítem según la acción elegida.
     *      DESCONTAR_ORIGEN: stock origen -= (qtyRec - qtyEnv)  (solo si qtyRec > qtyEnv)
     *      DEVOLVER_ORIGEN:  stock origen += (qtyEnv - qtyRec)  (solo si qtyEnv > qtyRec)
     *      MERMA_ORIGEN:     no toca stock, registra movimiento MERMA por el delta faltante
     *      NO_AJUSTAR:       no hace nada
     * Cierra la AuditAlert y marca discrepancyStatus en el envío.
     */
    async resolveDiscrepancy(input: {
        envioId: string;
        decision: 'approved' | 'rejected';
        note: string;
        perItemActions?: Record<string, EnvioDiscrepancyItemAction>;
        gerenteId: string;
        gerenteName: string;
    }): Promise<void> {
        const { envioId, decision, note, perItemActions, gerenteId, gerenteName } = input;
        const cleanNote = (note || '').trim();
        if (cleanNote.length < 5) throwStandardError('SYS_TRANSACTION_FAILED', 'Nota de resolución requerida (mínimo 5 caracteres)');

        const envio = await this.getById(envioId);
        if (!envio) throwStandardError('SYS_TRANSACTION_FAILED', 'Envío no existe');
        if (!envio!.hasDiscrepancy) throwStandardError('SYS_TRANSACTION_FAILED', 'El envío no tiene discrepancia registrada');
        if (envio!.discrepancyStatus && envio!.discrepancyStatus !== 'pending') {
            throwStandardError('SYS_TRANSACTION_FAILED', `Discrepancia ya ${envio!.discrepancyStatus === 'approved' ? 'aprobada' : 'rechazada'}`);
        }

        const items = await this.getItems(envioId);
        const ref = doc(db, COLLECTION, envioId);

        // Si APROBADO con acciones de stock: pre-resolver refs de productos en sucursal ORIGEN
        type ResolvedAction = {
            item: EnvioItem;
            action: EnvioDiscrepancyItemAction;
            delta: number;            // positivo
            originProductRef: ReturnType<typeof doc> | null;
        };
        const actionPlan: ResolvedAction[] = [];

        if (decision === 'approved' && perItemActions) {
            for (const it of items) {
                const action = perItemActions[it.productId];
                if (!action || action === 'NO_AJUSTAR') continue;
                const qtyEnv = it.qtyEnviada || 0;
                const qtyRec = it.qtyRecibida ?? 0;
                let delta = 0;
                if (action === 'DESCONTAR_ORIGEN') {
                    delta = qtyRec - qtyEnv;
                    if (delta <= 0) continue; // no aplica si no hay sobrante
                } else if (action === 'DEVOLVER_ORIGEN' || action === 'MERMA_ORIGEN') {
                    delta = qtyEnv - qtyRec;
                    if (delta <= 0) continue; // no aplica si no hay faltante
                }
                if (delta === 0) continue;

                // Determinar docId de origen usando ID determinístico
                const deterministicId = `${envio!.fromBranchId}_${it.masterId}`;
                const originRef = doc(db, PRODUCTS, deterministicId);

                actionPlan.push({ item: it, action, delta, originProductRef: originRef });
            }
        }

        await runTransaction(db, async (tx) => {
            const envioSnap = await tx.get(ref);
            if (!envioSnap.exists()) throwStandardError('SYS_TRANSACTION_FAILED');
            const eData = envioSnap.data() as Envio;
            if (eData.discrepancyStatus && eData.discrepancyStatus !== 'pending') {
                throwStandardError('SYS_TRANSACTION_FAILED', 'Estado de discrepancia cambió');
            }

            // Lecturas de stock origen
            const productSnaps = await Promise.all(
                actionPlan.map(async p => ({
                    ...p,
                    snap: p.originProductRef ? await tx.get(p.originProductRef) : null,
                }))
            );

            // Escrituras de ajuste
            for (const p of productSnaps) {
                const { item, action, delta, originProductRef, snap } = p;

                // Si la acción requiere ajustar stock real y no existe el producto, lanzar error transaccional
                const mustExist = action === 'DESCONTAR_ORIGEN' || action === 'DEVOLVER_ORIGEN';
                if (mustExist && (!snap || !snap.exists())) {
                    throwStandardError('SYS_TRANSACTION_FAILED', `Producto ${item.productName} no existe en sucursal origen para ajustar stock`);
                }

                if (action === 'MERMA_ORIGEN') {
                    // Solo movimiento, no cambia stock (ya descontado en despacho)
                    const currentStock = snap?.exists() ? (snap.data()?.stock as number) || 0 : 0;
                    const movRef = doc(collection(db, 'movimientos'));
                    tx.set(movRef, {
                        productId: originProductRef?.id || item.productId,
                        masterId: item.masterId,
                        type: 'AJUSTE',
                        quantity: -delta,
                        currentStock: (snap?.data()?.stock as number) ?? 0,
                        previousStock: (snap?.data()?.stock as number) ?? 0,
                        reason: `Merma por discrepancia envío ${envioId} (delta ${delta})`,
                        referenceId: envioId,
                        date: serverTimestamp(),
                        userId: gerenteId,
                        userName: gerenteName,
                        branchId: envio!.fromBranchId,
                        unitCost: item.costo || 0,
                        createdAt: serverTimestamp(),
                    } as InventoryMovement);
                    continue;
                }

                if (!originProductRef || !snap || !snap.exists()) {
                    throwStandardError('SYS_TRANSACTION_FAILED', `Producto origen no encontrado para ${item.productName}`);
                    return;
                }
                const pData = snap.data();
                const currentStock = (pData?.stock as number) || 0;
                const signedDelta = action === 'DESCONTAR_ORIGEN' ? -delta : +delta; // DEVOLVER suma
                const newStock = currentStock + signedDelta;
                // Permitir stock negativo en resolución de discrepancias (caso real: destino reporta más de lo enviado)
                // El gerente ya fue advertido en la UI antes de aprobar
                if (newStock < 0) {
                    console.warn(`[resolveDiscrepancy] Stock de origen quedará negativo (${newStock}) para ${item.productName} en envío ${envioId}`);
                }

                tx.update(originProductRef, { stock: newStock, updatedAt: serverTimestamp() });

                const movRef = doc(collection(db, 'movimientos'));
                tx.set(movRef, {
                    productId: originProductRef.id,
                    masterId: item.masterId,
                    type: 'AJUSTE',
                    quantity: signedDelta,
                    currentStock: newStock,
                    previousStock: currentStock,
                    reason: action === 'DESCONTAR_ORIGEN'
                        ? `Ajuste por sobrante en recepción envío ${envioId}`
                        : `Devolución a origen por faltante en recepción envío ${envioId}`,
                    referenceId: envioId,
                    date: serverTimestamp(),
                    userId: gerenteId,
                    userName: gerenteName,
                    branchId: envio!.fromBranchId,
                    unitCost: (pData?.costo as number) || item.costo || 0,
                    createdAt: serverTimestamp(),
                } as InventoryMovement);
            }

            const itemActionsMap: Record<string, EnvioDiscrepancyItemAction> = {};
            if (decision === 'approved' && perItemActions) {
                for (const [pid, act] of Object.entries(perItemActions)) {
                    if (act) itemActionsMap[pid] = act;
                }
            }

            tx.update(ref, {
                discrepancyStatus: decision,
                discrepancyResolvedBy: gerenteId,
                discrepancyResolvedByName: gerenteName,
                discrepancyResolvedAt: serverTimestamp(),
                discrepancyResolutionNote: cleanNote,
                ...(decision === 'approved' ? { discrepancyItemActions: itemActionsMap } : {}),
            });
        });

        // Cerrar la AuditAlert asociada (best-effort)
        if (envio!.discrepancyAlertId) {
            try {
                await AuditAlertService.resolveAlert(
                    envio!.discrepancyAlertId,
                    gerenteId,
                    gerenteName,
                    `${decision === 'approved' ? 'APROBADA' : 'RECHAZADA'}: ${cleanNote}`,
                );
            } catch (err) {
                console.error('[EnvioService.resolveDiscrepancy] No se pudo cerrar la alerta:', err);
            }
        }

        // Crear alerta de auditoría documental sobre la resolución
        try {
            const alertBranchId = envio!.toBranchId || envio!.fromBranchId;
            await AuditAlertService.createAlert({
                type: 'TRANSFER_DISCREPANCY_RESOLVED',
                severity: 'LOW',
                branchId: alertBranchId,
                userId: gerenteId,
                userName: gerenteName,
                message: `Discrepancia del envío ${envioId} ${decision === 'approved' ? 'APROBADA' : 'RECHAZADA'}: ${cleanNote}`,
                metadata: {
                    envioId,
                    pedidoId: envio!.pedidoId || null,
                    decision,
                    fromBranchId: envio!.fromBranchId,
                    toBranchId: envio!.toBranchId,
                    itemActions: decision === 'approved' ? (perItemActions || {}) : {},
                },
            });
        } catch { /* best-effort */ }

        await logAdminAction(
            gerenteId,
            gerenteName,
            decision === 'approved' ? 'ENVIO_DISCREPANCY_APPROVE' : 'ENVIO_DISCREPANCY_REJECT',
            envioId,
            envio!.fromBranchId,
            cleanNote,
        );
    },

    // ────────────────────────────────────────────────────────────────────────
    // FLETES — registro de gasto operativo TRANSPORTE
    // ────────────────────────────────────────────────────────────────────────
    /**
     * Registra el flete pagado como un gasto operativo (categoría TRANSPORTE),
     * que a su vez asienta el EGRESO en tesorería en la cuenta correspondiente
     * (caja efectivo / QR / transferencia). Si falla, el envío queda creado pero
     * sin gasto y se registra una alerta para reintento manual.
     */
    async _registerFleteExpense(input: {
        envioCodigo: string;
        userBranchId: string;
        amount: number;
        paymentMethod: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
        bankRef?: string;
        transportId?: string;
        transportName: string;
        userId: string;
        userName: string;
    }): Promise<void> {
        const {
            envioCodigo, userBranchId, amount, paymentMethod, bankRef,
            transportId, transportName, userId, userName,
        } = input;

        try {
            const expenseId = await ExpenseService.create({
                branchId: userBranchId,
                date: new Date(),
                amount,
                category: 'TRANSPORTE',
                description: `Flete envío ${envioCodigo}`,
                supplierName: transportName,
                paymentMethod,
                bankRef: paymentMethod !== 'EFECTIVO' ? bankRef : undefined,
                counterpartyId: transportId,
                counterpartyType: 'TRANSPORT',
                userId,
                userName,
            }, userBranchId);

            await updateDoc(doc(db, COLLECTION, envioCodigo), { transportExpenseId: expenseId });
        } catch (err) {
            console.error('[EnvioService._registerFleteExpense] Falló registro de gasto:', err);
            try {
                await AuditAlertService.createAlert({
                    type: 'EXPENSE_LARGE',
                    severity: 'HIGH',
                    branchId: userBranchId,
                    userId,
                    userName,
                    message: `Flete de Bs. ${amount.toFixed(2)} para ${envioCodigo} (${transportName}) no se pudo registrar como gasto. Reintentar manualmente desde Gastos Operativos.`,
                    metadata: { envioCodigo, amount, paymentMethod, transportName },
                });
            } catch { /* best-effort */ }
            throw err instanceof Error ? err : new Error(String(err));
        }
    },

    /**
     * Reintenta el registro del gasto de flete para un envío que quedó huérfano
     * (creado con flete pagado pero sin transportExpenseId, típicamente porque
     * la cuenta default no existía al momento de crearlo).
     */
    async retryFleteExpense(envioCodigo: string, userId: string, userName: string): Promise<void> {
        const envio = await this.getById(envioCodigo);
        if (!envio) throw new Error('Envío no encontrado');
        if (envio.transportExpenseId) throw new Error('Este envío ya tiene gasto registrado');
        if (!envio.transportCost || envio.transportCost <= 0) throw new Error('El envío no tiene costo de flete');
        if (!envio.transportPaymentMethod) throw new Error('El envío no tiene método de pago de flete');

        // transportName: prioriza el nombre del transportista guardado en /transportes,
        // sino usa transportMethod como fallback.
        let transportName = envio.transportMethod || 'Transportista';
        if (envio.transportId) {
            try {
                const tSnap = await getDoc(doc(db, 'transportes', envio.transportId));
                if (tSnap.exists()) {
                    const tData = tSnap.data() as { razonSocial?: string };
                    if (tData.razonSocial) transportName = tData.razonSocial;
                }
            } catch { /* best-effort */ }
        }

        await this._registerFleteExpense({
            envioCodigo,
            userBranchId: envio.fromBranchId,
            amount: envio.transportCost,
            paymentMethod: envio.transportPaymentMethod,
            bankRef: envio.transportBankRef,
            transportId: envio.transportId,
            transportName,
            userId,
            userName,
        });

        await logAdminAction(userId, userName, 'ENVIO_FLETE_RETRY', envioCodigo, envio.fromBranchId, `Flete reintentado: Bs. ${envio.transportCost.toFixed(2)} (${envio.transportPaymentMethod})`);
    },
};

/**
 * Dado un item del envío, devuelve el productId que corresponde a la sucursal destino.
 * En la arquitectura actual, los productos se identifican por (masterId + branchId)
 * pero el doc es uno solo por sucursal. La estrategia aquí es:
 *   - Si en /productos hay un doc con id = productId, asumimos que productId ya es global.
 *   - Si necesitas mapear —productId de B— ' —productId de A—, aquí va esa lógica.
 *
 * Por ahora retornamos el mismo productId; ajusta si tu modelo requiere mapeo.
 */
function _destProductIdFor(item: EnvioItem, _toBranchId: string): string {
    return item.productId;
}

