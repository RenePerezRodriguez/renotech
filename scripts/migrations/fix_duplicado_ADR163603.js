/**
 * ============================================================
 *  FUSIÓN DE DUPLICADO: BLP-003 → BLP-001 (ADR163603)
 *  fix_duplicado_ADR163603.js
 * ============================================================
 *
 *  --dry-run   Solo muestra lo que haría. No escribe nada.
 *  (sin flag)  Ejecuta la migración real.
 *
 *  EJECUCIÓN
 *    node scripts/migrations/fix_duplicado_ADR163603.js --dry-run
 *    node scripts/migrations/fix_duplicado_ADR163603.js
 *
 * ============================================================
 */

'use strict';

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

const DRY_RUN = process.argv.includes('--dry-run');

// ── Credenciales ────────────────────────────────────────────────────────────
function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  }
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), 'apps/erp/.env.local'),
    path.resolve(__dirname, '../../apps/erp/.env.local'),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const raw = fs.readFileSync(envPath, 'utf8');
    const match = raw.match(/FIREBASE_SERVICE_ACCOUNT_KEY\s*=\s*'([\s\S]*?)'\s*(\n|$)/) ||
                  raw.match(/FIREBASE_SERVICE_ACCOUNT_KEY\s*=\s*"([\s\S]*?)"\s*(\n|$)/) ||
                  raw.match(/FIREBASE_SERVICE_ACCOUNT_KEY\s*=\s*(\{[\s\S]*?\})\s*(\n|$)/);
    if (match) return JSON.parse(match[1]);
  }
  const keyPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(keyPath)) return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  throw new Error('No se encontró credencial Firebase.');
}

const serviceAccount = loadServiceAccount();
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Utilidades ───────────────────────────────────────────────────────────────
function fmt(val) {
  if (val === null || val === undefined) return '(vacío)';
  if (val && val._seconds !== undefined) {
    return new Date(val._seconds * 1000).toISOString().slice(0, 10);
  }
  return String(val);
}

function log(msg)  { console.log(msg); }
function ok(msg)   { console.log(`  ✅  ${msg}`); }
function dry(msg)  { console.log(`  🔵  [DRY] ${msg}`); }
function step(n, title) {
  console.log(`\n╔══ FASE ${n}: ${title} ${'═'.repeat(Math.max(0, 50 - title.length))}╗`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log('\n╔══════════════════════════════════════════════════════════════╗');
  if (DRY_RUN) {
    log('║  SIMULACIÓN (--dry-run) — no se escribe nada              ║');
  } else {
    log('║  MIGRACIÓN REAL — BLP-003 → BLP-001 (ADR163603)           ║');
  }
  log('╚══════════════════════════════════════════════════════════════╝\n');

  // ══════════════════════════════════════════════════════════════
  //  FASE 1 — Verificar maestros
  // ══════════════════════════════════════════════════════════════
  step(1, 'VERIFICAR MAESTROS');

  const snapBlp1 = await db.collection('catalogo_maestro').where('codigo', '==', 'BLP-001').get();
  const snapBlp3 = await db.collection('catalogo_maestro').where('codigo', '==', 'BLP-003').get();

  if (snapBlp1.empty) { console.error('❌  No se encontró BLP-001'); process.exit(1); }
  if (snapBlp3.empty) { console.error('❌  No se encontró BLP-003'); process.exit(1); }

  const blp1Doc = snapBlp1.docs[0];
  const blp3Doc = snapBlp3.docs[0];
  const blp1 = { id: blp1Doc.id, ...blp1Doc.data() };
  const blp3 = { id: blp3Doc.id, ...blp3Doc.data() };

  log(`  BLP-001 (canónico):  ID=${blp1.id}  nombre="${blp1.nombre}"`);
  log(`  BLP-003 (duplicado): ID=${blp3.id}  nombre="${blp3.nombre}"`);

  // ══════════════════════════════════════════════════════════════
  //  FASE 2 — Fusionar productos (stock por sucursal)
  // ══════════════════════════════════════════════════════════════
  step(2, 'FUSIONAR STOCK EN productos');

  const prodSnap = await db.collection('productos').get();
  const blp1Prods = [], blp3Prods = [];
  for (const d of prodSnap.docs) {
    const data = d.data();
    if (data.masterId === blp1.id) blp1Prods.push({ id: d.id, ref: d.ref, ...data });
    if (data.masterId === blp3.id) blp3Prods.push({ id: d.id, ref: d.ref, ...data });
  }

  log(`  BLP-001 tiene ${blp1Prods.length} doc(s) de stock.`);
  log(`  BLP-003 tiene ${blp3Prods.length} doc(s) de stock.`);

  const stockOps = [];   // { type: 'update'|'create'|'delete', ref, data?, reason }
  const ajusteMovs = []; // movimientos de tipo AJUSTE a crear

  for (const dup of blp3Prods) {
    const canonId = `${dup.branchId}_${blp1.id}`;
    const canonical = blp1Prods.find(p => p.branchId === dup.branchId);

    if (canonical) {
      // Ya existe el doc canónico → sumar stock
      const newStock = (canonical.stock ?? 0) + (dup.stock ?? 0);
      log(`  Sucursal ${dup.branchId}: stock ${canonical.stock} + ${dup.stock} = ${newStock}`);
      stockOps.push({
        type: 'update',
        ref: canonical.ref,
        data: { stock: newStock },
        reason: `Suma stock BLP-003 (${dup.stock}) → BLP-001`,
      });
      if ((dup.stock ?? 0) > 0) {
        ajusteMovs.push({
          masterId: blp1.id,
          branchId: dup.branchId,
          productId: canonical.id,
          type: 'AJUSTE',
          quantity: dup.stock,
          currentStock: newStock,
          reason: `Fusión duplicado BLP-003 → BLP-001 (ADR163603). Stock transferido.`,
          date: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } else {
      // No existe el doc canónico → crear con el ID correcto
      const newData = { ...dup, masterId: blp1.id };
      delete newData.id;
      delete newData.ref;
      log(`  Sucursal ${dup.branchId}: creando doc canónico ${canonId} (stock=${dup.stock})`);
      stockOps.push({
        type: 'create',
        id: canonId,
        data: newData,
        reason: `Crear doc canónico para sucursal ${dup.branchId}`,
      });
    }

    stockOps.push({
      type: 'delete',
      ref: dup.ref,
      reason: `Eliminar doc BLP-003 sucursal ${dup.branchId} (id=${dup.id})`,
    });
  }

  for (const op of stockOps) {
    if (DRY_RUN) {
      dry(`${op.type.toUpperCase()} productos: ${op.reason}`);
    } else {
      if (op.type === 'update') {
        await op.ref.update(op.data);
        ok(op.reason);
      } else if (op.type === 'create') {
        await db.collection('productos').doc(op.id).set(op.data);
        ok(op.reason);
      } else if (op.type === 'delete') {
        await op.ref.delete();
        ok(op.reason);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  FASE 3 — Migrar movimientos (kardex)
  // ══════════════════════════════════════════════════════════════
  step(3, 'MIGRAR MOVIMIENTOS (kardex)');

  const mov3Snap = await db.collection('movimientos').where('masterId', '==', blp3.id).get();
  log(`  Encontrados ${mov3Snap.size} movimiento(s) de BLP-003.`);

  for (const d of mov3Snap.docs) {
    const data = d.data();
    const update = { masterId: blp1.id };
    // Actualizar productId si referencia el doc de BLP-003
    if (data.productId && data.productId.includes(blp3.id)) {
      update.productId = data.productId.replace(blp3.id, blp1.id);
    }
    const desc = `mov ${d.id} (${data.type} qty=${data.quantity} ${fmt(data.date)})`;
    if (DRY_RUN) {
      dry(`UPDATE movimientos/${d.id}: masterId → BLP-001 ${update.productId ? '+ productId' : ''}`);
    } else {
      await d.ref.update(update);
      ok(`Actualizado ${desc}`);
    }
  }

  // Crear movimientos AJUSTE (solo si hay stock real a fusionar)
  if (ajusteMovs.length > 0) {
    log(`\n  Creando ${ajusteMovs.length} movimiento(s) AJUSTE por fusión de stock...`);
    for (const mov of ajusteMovs) {
      if (DRY_RUN) {
        dry(`CREATE movimientos: AJUSTE +${mov.quantity} en sucursal ${mov.branchId} → stock ${mov.currentStock}`);
      } else {
        await db.collection('movimientos').add(mov);
        ok(`Creado AJUSTE +${mov.quantity} en sucursal ${mov.branchId}`);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  FASE 4 — Migrar compras/*/items
  // ══════════════════════════════════════════════════════════════
  step(4, 'MIGRAR compras/*/items');

  const comprasSnap = await db.collection('compras').get();
  let comprasCount = 0;

  for (const cDoc of comprasSnap.docs) {
    const itemsSnap = await cDoc.ref.collection('items')
      .where('masterId', '==', blp3.id).get();
    for (const iDoc of itemsSnap.docs) {
      const iData = iDoc.data();
      const update = { masterId: blp1.id };
      if (iData.productId && iData.productId.includes(blp3.id)) {
        update.productId = iData.productId.replace(blp3.id, blp1.id);
      }
      if (iData.productCode === blp3.codigo) {
        update.productCode = blp1.codigo;
      }
      const desc = `compras/${cDoc.id}/items/${iDoc.id} (${iData.productCode} qty=${iData.quantity})`;
      if (DRY_RUN) {
        dry(`UPDATE ${desc} → masterId BLP-001`);
      } else {
        await iDoc.ref.update(update);
        ok(`Actualizado ${desc}`);
      }
      comprasCount++;
    }
  }

  log(`  Total items de compras actualizados: ${comprasCount}`);

  // ══════════════════════════════════════════════════════════════
  //  FASE 5 — Migrar envios/*/items
  // ══════════════════════════════════════════════════════════════
  step(5, 'MIGRAR envios/*/items');

  const enviosSnap = await db.collection('envios').get();
  let enviosCount = 0;

  for (const eDoc of enviosSnap.docs) {
    const itemsSnap = await eDoc.ref.collection('items')
      .where('masterId', '==', blp3.id).get();
    for (const iDoc of itemsSnap.docs) {
      const iData = iDoc.data();
      const update = { masterId: blp1.id };
      if (iData.productId && iData.productId.includes(blp3.id)) {
        update.productId = iData.productId.replace(blp3.id, blp1.id);
      }
      if (iData.productCode === blp3.codigo) {
        update.productCode = blp1.codigo;
      }
      const desc = `envios/${eDoc.id}/items/${iDoc.id} (${iData.productCode})`;
      if (DRY_RUN) {
        dry(`UPDATE ${desc} → masterId BLP-001`);
      } else {
        await iDoc.ref.update(update);
        ok(`Actualizado ${desc}`);
      }
      enviosCount++;
    }
  }

  log(`  Total items de envíos actualizados: ${enviosCount}`);

  // ══════════════════════════════════════════════════════════════
  //  FASE 6 — Actualizar unique_codes
  // ══════════════════════════════════════════════════════════════
  step(6, 'ACTUALIZAR unique_codes');

  const uc3Snap = await db.collection('unique_codes').where('masterId', '==', blp3.id).get();
  log(`  Encontrados ${uc3Snap.size} entrada(s) en unique_codes para BLP-003.`);

  for (const d of uc3Snap.docs) {
    if (DRY_RUN) {
      dry(`UPDATE unique_codes/${d.id}: masterId → BLP-001`);
    } else {
      await d.ref.update({ masterId: blp1.id });
      ok(`Actualizado unique_codes/${d.id}`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  FASE 7 — Eliminar maestro duplicado
  // ══════════════════════════════════════════════════════════════
  step(7, 'ELIMINAR MAESTRO BLP-003');

  if (DRY_RUN) {
    dry(`DELETE catalogo_maestro/${blp3.id} (BLP-003 "${blp3.nombre}")`);
  } else {
    await db.collection('catalogo_maestro').doc(blp3.id).delete();
    ok(`Eliminado catalogo_maestro/${blp3.id} (BLP-003)`);
  }

  // ══════════════════════════════════════════════════════════════
  //  RESUMEN FINAL
  // ══════════════════════════════════════════════════════════════
  const totalStock = blp1Prods.reduce((s, p) => s + (p.stock ?? 0), 0)
                   + blp3Prods.reduce((s, p) => s + (p.stock ?? 0), 0);

  log('\n╔══════════════════════════════════════════════════════════════╗');
  if (DRY_RUN) {
    log('║  SIMULACIÓN COMPLETADA — no se escribió nada               ║');
  } else {
    log('║  MIGRACIÓN COMPLETADA ✅                                    ║');
  }
  log('╚══════════════════════════════════════════════════════════════╝');
  log(`  Productos migrados:  ${blp3Prods.length} doc(s)`);
  log(`  Movimientos migrados: ${mov3Snap.size} + ${ajusteMovs.length} AJUSTE(s)`);
  log(`  Items compras:        ${comprasCount}`);
  log(`  Items envíos:         ${enviosCount}`);
  log(`  unique_codes:         ${uc3Snap.size}`);
  log(`  Stock total final:    ${totalStock} unidades (ADR163603)`);
  if (!DRY_RUN) {
    log('\n  ✅  BLP-003 eliminado. Todo apunta a BLP-001.');
    log('  ✅  Verifica en /inventario y /kardex que el stock = ' + totalStock + ' u.');
  }
  log('');

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌  ERROR:', err.message || err);
  console.error(err.stack);
  process.exit(1);
});
