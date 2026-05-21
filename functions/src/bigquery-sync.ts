/**
 * Firestore → BigQuery sync functions
 *
 * Every write to key collections is streamed into BigQuery for analytics.
 * The raw tables are append-only; deduplicated views (v_ventas, etc.) expose
 * current state for SQL queries from the AI assistant.
 *
 * Tables:  ventas_raw, ventas_items_raw, catalogo_raw, clientes_raw
 * Views:   v_ventas, v_ventas_items (future), v_catalogo, v_clientes
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { BigQuery } from '@google-cloud/bigquery';

const DATASET = 'renotech_data';
const PROJECT = 'renotech-cloud-app';

const bq = new BigQuery({ projectId: PROJECT });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toTs(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'object' && 'toDate' in (val as object)) {
    return (val as admin.firestore.Timestamp).toDate().toISOString();
  }
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return new Date(val).toISOString();
  return null;
}

function toFloat(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

function toInt(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

async function insertRows(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    await bq.dataset(DATASET).table(table).insert(rows, { skipInvalidRows: true });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'PartialFailureError') {
      const pfe = err as { errors?: { errors: { message: string }[]; row: unknown }[] };
      console.error(`[BQ:${table}] PartialFailureError:`, JSON.stringify(pfe.errors?.slice(0, 3)));
    } else {
      console.error(`[BQ:${table}] insert error:`, err);
    }
  }
}

// ─── ventas sync ─────────────────────────────────────────────────────────────

export const onVentaWrite = functions
  .region('us-central1')
  .firestore.document('ventas/{ventaId}')
  .onWrite(async (change, context) => {
    const ventaId = context.params.ventaId;
    const syncTs = new Date().toISOString();

    if (!change.after.exists) {
      // Document deleted
      await insertRows('ventas_raw', [{
        id: ventaId,
        branch_id: null,
        total: null,
        item_count: null,
        payment_method: null,
        credit_status: null,
        client_id: null,
        client_name: null,
        credit_balance: null,
        status: null,
        operation: 'DELETE',
        sync_ts: syncTs,
        created_at: null,
        updated_at: null,
      }]);
      return;
    }

    const d = change.after.data()!;
    const operation = change.before.exists ? 'UPDATE' : 'CREATE';
    const createdAt = toTs(d.createdAt);

    await insertRows('ventas_raw', [{
      id: ventaId,
      branch_id: d.branchId ?? null,
      total: toFloat(d.total),
      item_count: toInt(d.itemCount),
      payment_method: d.paymentMethod ?? null,
      credit_status: d.creditStatus ?? null,
      client_id: d.clientId ?? null,
      client_name: d.clientName ?? d.clientNombre ?? null,
      credit_balance: toFloat(d.creditBalance),
      status: d.status ?? null,
      operation,
      sync_ts: syncTs,
      created_at: createdAt,
      updated_at: toTs(d.updatedAt),
    }]);

    // Sync line items only on CREATE (items don't change after sale is created)
    if (operation === 'CREATE' && Array.isArray(d.items) && d.items.length > 0) {
      const itemRows = d.items.map((item: Record<string, unknown>) => ({
        venta_id: ventaId,
        branch_id: d.branchId ?? null,
        product_id: item.productId ?? item.id ?? null,
        product_name: item.productName ?? item.nombre ?? null,
        quantity: toFloat(item.quantity),
        unit_price: toFloat(item.unitPrice ?? item.precio),
        subtotal: toFloat(item.subtotal),
        sync_ts: syncTs,
        created_at: createdAt,
      }));
      await insertRows('ventas_items_raw', itemRows);
    }
  });

// ─── catalogo_maestro sync ───────────────────────────────────────────────────

export const onCatalogoWrite = functions
  .region('us-central1')
  .firestore.document('catalogo_maestro/{productId}')
  .onWrite(async (change, context) => {
    const productId = context.params.productId;
    const syncTs = new Date().toISOString();

    if (!change.after.exists) {
      await insertRows('catalogo_raw', [{
        id: productId, nombre: null, codigo: null, categoria: null,
        precio: null, costo: null, is_active: null,
        operation: 'DELETE', sync_ts: syncTs, created_at: null,
      }]);
      return;
    }

    const d = change.after.data()!;
    const operation = change.before.exists ? 'UPDATE' : 'CREATE';
    await insertRows('catalogo_raw', [{
      id: productId,
      nombre: d.nombre ?? null,
      codigo: d.codigo ?? null,
      categoria: d.categoria ?? d.category ?? null,
      precio: toFloat(d.precio ?? d.price),
      costo: toFloat(d.costo ?? d.cost),
      is_active: d.isActive ?? d.is_active ?? null,
      operation,
      sync_ts: syncTs,
      created_at: toTs(d.createdAt),
    }]);
  });

// ─── clientes sync ───────────────────────────────────────────────────────────

export const onClienteWrite = functions
  .region('us-central1')
  .firestore.document('clientes/{clienteId}')
  .onWrite(async (change, context) => {
    const clienteId = context.params.clienteId;
    const syncTs = new Date().toISOString();

    if (!change.after.exists) {
      await insertRows('clientes_raw', [{
        id: clienteId, nombre: null, ci: null, telefono: null, email: null,
        is_active: null, operation: 'DELETE', sync_ts: syncTs, created_at: null,
      }]);
      return;
    }

    const d = change.after.data()!;
    const operation = change.before.exists ? 'UPDATE' : 'CREATE';
    await insertRows('clientes_raw', [{
      id: clienteId,
      nombre: d.nombre ?? d.name ?? null,
      ci: d.ci ?? d.nit ?? null,
      telefono: d.telefono ?? d.phone ?? null,
      email: d.email ?? null,
      is_active: d.isActive ?? d.is_active ?? null,
      operation,
      sync_ts: syncTs,
      created_at: toTs(d.createdAt),
    }]);
  });

// ─── Initial data load (callable — run once manually) ────────────────────────

/**
 * Callable function to bulk-load existing Firestore data into BigQuery.
 * Call this once after deploying to backfill historical data.
 * Only GERENTE role can call this.
 *
 * Usage from Firebase console or via callable SDK:
 *   const fn = httpsCallable(functions, 'bqInitialLoad');
 *   await fn({ collections: ['ventas', 'catalogo_maestro', 'clientes'] });
 */
export const bqInitialLoad = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.role !== 'GERENTE') {
      throw new functions.https.HttpsError('permission-denied', 'Solo GERENTE puede ejecutar la carga inicial.');
    }

    const collections: string[] = data.collections ?? ['ventas', 'catalogo_maestro', 'clientes'];
    const results: Record<string, number> = {};

    for (const col of collections) {
      try {
        const snap = await admin.firestore().collection(col).get();
        const syncTs = new Date().toISOString();
        let rows: Record<string, unknown>[] = [];
        let itemRows: Record<string, unknown>[] = [];

        snap.docs.forEach((doc) => {
          const d = doc.data();
          if (col === 'ventas') {
            const createdAt = toTs(d.createdAt);
            rows.push({
              id: doc.id,
              branch_id: d.branchId ?? null,
              total: toFloat(d.total),
              item_count: toInt(d.itemCount),
              payment_method: d.paymentMethod ?? null,
              credit_status: d.creditStatus ?? null,
              client_id: d.clientId ?? null,
              client_name: d.clientName ?? d.clientNombre ?? null,
              credit_balance: toFloat(d.creditBalance),
              status: d.status ?? null,
              operation: 'IMPORT',
              sync_ts: syncTs,
              created_at: createdAt,
              updated_at: toTs(d.updatedAt),
            });
            if (Array.isArray(d.items)) {
              d.items.forEach((item: Record<string, unknown>) => {
                itemRows.push({
                  venta_id: doc.id,
                  branch_id: d.branchId ?? null,
                  product_id: item.productId ?? item.id ?? null,
                  product_name: item.productName ?? item.nombre ?? null,
                  quantity: toFloat(item.quantity),
                  unit_price: toFloat(item.unitPrice ?? item.precio),
                  subtotal: toFloat(item.subtotal),
                  sync_ts: syncTs,
                  created_at: createdAt,
                });
              });
            }
          } else if (col === 'catalogo_maestro') {
            rows.push({
              id: doc.id,
              nombre: d.nombre ?? null,
              codigo: d.codigo ?? null,
              categoria: d.categoria ?? d.category ?? null,
              precio: toFloat(d.precio ?? d.price),
              costo: toFloat(d.costo ?? d.cost),
              is_active: d.isActive ?? null,
              operation: 'IMPORT',
              sync_ts: syncTs,
              created_at: toTs(d.createdAt),
            });
          } else if (col === 'clientes') {
            rows.push({
              id: doc.id,
              nombre: d.nombre ?? d.name ?? null,
              ci: d.ci ?? d.nit ?? null,
              telefono: d.telefono ?? d.phone ?? null,
              email: d.email ?? null,
              is_active: d.isActive ?? null,
              operation: 'IMPORT',
              sync_ts: syncTs,
              created_at: toTs(d.createdAt),
            });
          }
        });

        const tableMap: Record<string, string> = {
          ventas: 'ventas_raw',
          catalogo_maestro: 'catalogo_raw',
          clientes: 'clientes_raw',
        };

        const targetTable = tableMap[col];
        if (targetTable && rows.length > 0) {
          // BigQuery streaming insert limit: 10MB per request, 50k rows per request
          const BATCH = 500;
          for (let i = 0; i < rows.length; i += BATCH) {
            await insertRows(targetTable, rows.slice(i, i + BATCH));
          }
        }

        if (itemRows.length > 0) {
          const BATCH = 500;
          for (let i = 0; i < itemRows.length; i += BATCH) {
            await insertRows('ventas_items_raw', itemRows.slice(i, i + BATCH));
          }
        }

        results[col] = rows.length;
        console.log(`[bqInitialLoad] ${col}: ${rows.length} docs loaded`);
      } catch (err) {
        console.error(`[bqInitialLoad] Error loading ${col}:`, err);
        results[col] = -1;
      }
    }

    return { success: true, results };
  });
