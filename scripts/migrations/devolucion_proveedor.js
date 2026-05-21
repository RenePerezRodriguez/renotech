/**
 * ============================================================
 *  SCRIPT DE DEVOLUCIÓN A PROVEEDOR — RENOTECH
 *  devolucion_proveedor.js
 * ============================================================
 *
 *  Procesa "DEVOLUCION DE PRODUCTOS 02_04.xlsx" y ejecuta:
 *
 *    Paso A — Envío Sucre 01 → Casa Matriz (HQ)
 *      · Crea envío ENVD-NNNN status='recibido'
 *      · Kardex TRASP_SALIDA en Sucre, TRASP_ENTRADA en HQ
 *
 *    Paso B — Devolución al proveedor desde HQ
 *      · Kardex GARANTIA_SALIDA en HQ
 *      · Crea documento en colección devoluciones_proveedor
 *
 *  NO toca cuentas_proveedores ni gastos_operativos.
 *
 *  EJECUCIÓN
 *    node scripts/migrations/devolucion_proveedor.js
 *    node scripts/migrations/devolucion_proveedor.js --dry-run
 * ============================================================
 */

'use strict';

const admin   = require('firebase-admin');
const ExcelJS = require('exceljs');
const pathMod = require('path');
const fs      = require('fs');

const EXCEL_PATH = 'C:/Users/Rene_/Downloads/PARA SCRIPT SEGUNDA VERSION/DEVOLUCION DE PRODUCTOS 02_04.xlsx';
const FECHA_DEVOLUCION = '2026-04-02';
const PROVEEDOR_NOMBRE = 'IMPORTADORA RT';
const SUCRE_BRANCH_NAME = 'Sucre';
const MIGRATION_USER_ID   = '6WTLnYziG5csLPE9DHPAc7qgX6A2';
const MIGRATION_USER_NAME = 'Stefany Garro';

const DRY_RUN = process.argv.includes('--dry-run');

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  const envPath = pathMod.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    const match = raw.match(/FIREBASE_SERVICE_ACCOUNT_KEY\s*=\s*'([\s\S]*?)'\s*(\n|$)/) ||
                  raw.match(/FIREBASE_SERVICE_ACCOUNT_KEY\s*=\s*"([\s\S]*?)"\s*(\n|$)/) ||
                  raw.match(/FIREBASE_SERVICE_ACCOUNT_KEY\s*=\s*(\{[\s\S]*?\})\s*(\n|$)/);
    if (match) return JSON.parse(match[1]);
  }
  const keyPath = pathMod.resolve(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(keyPath)) return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  throw new Error('No se encontró credencial Firebase.');
}
admin.initializeApp({ credential: admin.credential.cert(loadServiceAccount()) });
const db = admin.firestore();

const COL = {
  MASTER: 'catalogo_maestro', PRODUCTOS: 'productos', MOV: 'movimientos',
  BRANCHES: 'branches', AUDIT: 'admin_audit_log', ENVIOS: 'envios',
  EMPRESAS: 'empresas', CUENTAS: 'cuentas_proveedores',
  DEVOLUCIONES: 'devoluciones_proveedor',
};
const COUNTERS_DOC = 'counters/sequences';

function fmtEnvio(n) { return 'ENVD-' + String(n).padStart(4, '0'); }

async function reservarEnvioSeq() {
  const ref = db.doc(COUNTERS_DOC);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = (snap.exists ? (snap.data().envioDirectoSeq || 0) : 0) + 1;
    tx.set(ref, { envioDirectoSeq: next }, { merge: true });
    return next;
  });
}

function parseNum(val) {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const p = parseFloat(String(val).replace(/[^\d.-]/g, ''));
  return isNaN(p) ? 0 : p;
}

function tsFromDate(dateStr) {
  return admin.firestore.Timestamp.fromDate(new Date(dateStr + 'T12:00:00-04:00'));
}

async function commitBatches(writes) {
  if (DRY_RUN) { console.log('  [DRY-RUN] ' + writes.length + ' ops omitidas'); return; }
  for (let i = 0; i < writes.length; i += 400) {
    const chunk = writes.slice(i, i + 400);
    const batch = db.batch();
    for (const { op, ref, data } of chunk) {
      if (op === 'set') batch.set(ref, data);
      if (op === 'update') batch.update(ref, data);
    }
    await batch.commit();
  }
}

async function leerExcelDevolucion() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const sheet = wb.worksheets[0];
  const headers = [];
  sheet.getRow(2).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.value == null ? '' : cell.value).trim().toUpperCase();
  });
  const items = [];
  for (let r = 3; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (!row || !row.hasValues) continue;
    const rd = {};
    headers.forEach((h, col) => {
      if (!h) return;
      let v = row.getCell(col).value;
      if (v == null) { rd[h] = ''; return; }
      if (typeof v === 'object') {
        if ('text' in v) v = v.text;
        else if ('result' in v) v = v.result;
        else if ('richText' in v) v = v.richText.map(rt => rt.text).join('');
        else v = String(v);
      }
      rd[h] = v;
    });
    const codigoFabrica = String(rd['CODIGO FABRICA'] || '').trim().toUpperCase();
    const codigoOE      = String(rd['CODIGO OE'] || '').trim().toUpperCase();
    const descripcion   = String(rd['DESCRIPCION'] || '').trim();
    const marca         = String(rd['MARCA'] || '').trim().toUpperCase();
    const costo         = parseNum(rd['COSTO']);
    const cantidad      = parseNum(rd['CANTIDAD']);
    if (!descripcion && !codigoFabrica && !codigoOE) continue;
    if (cantidad <= 0) continue;
    items.push({ codigoFabrica, codigoOE, descripcion, marca, costo, cantidad });
  }
  return items;
}

async function obtenerSucursales() {
  const snap = await db.collection(COL.BRANCHES).get();
  let hq = null, sucre = null;
  for (const d of snap.docs) {
    const data = d.data();
    if (data.isHQ === true) hq = { id: d.id, ...data };
    if (data.name === SUCRE_BRANCH_NAME) sucre = { id: d.id, ...data };
  }
  if (!hq) throw new Error('No se encontró sucursal HQ');
  if (!sucre) throw new Error('No se encontró sucursal Sucre 01');
  return { hq, sucre };
}

async function buscarEmpresaYCuenta() {
  const snap = await db.collection(COL.EMPRESAS).where('nombre', '==', PROVEEDOR_NOMBRE).limit(1).get();
  if (snap.empty) return { empresaId: null, empresaNombre: PROVEEDOR_NOMBRE, cuentaId: null };
  const empresaId = snap.docs[0].id;
  const empresaNombre = snap.docs[0].data().nombre;
  // Buscar cuenta default del proveedor
  const cuentaSnap = await db.collection(COL.CUENTAS).where('empresaId', '==', empresaId).limit(5).get();
  const defaultDoc = cuentaSnap.docs.find(function(d) { return d.data().isDefault; }) || cuentaSnap.docs[0];
  const cuentaId = defaultDoc ? defaultDoc.id : null;
  return { empresaId, empresaNombre, cuentaId };
}

async function resolverProductos(items) {
  const maestroSnap = await db.collection(COL.MASTER).get();
  const byFab = new Map(), byOE = new Map();
  for (const d of maestroSnap.docs) {
    const data = d.data();
    const m = { id: d.id, ...data };
    if (data.codigoFabrica) byFab.set(String(data.codigoFabrica).toUpperCase(), m);
    if (data.codigoOE) byOE.set(String(data.codigoOE).toUpperCase(), m);
  }
  const resolved = [];
  for (const item of items) {
    let master = null;
    // Try full composite code first, then individual parts
    master = byFab.get(item.codigoFabrica);
    if (!master) {
      const fabParts = item.codigoFabrica.split('/').map(s => s.trim()).filter(Boolean);
      for (const part of fabParts) { master = byFab.get(part); if (master) break; }
    }
    if (!master) {
      master = byOE.get(item.codigoOE);
      if (!master) {
        const oeParts = item.codigoOE.split('/').map(s => s.trim()).filter(Boolean);
        for (const part of oeParts) { master = byOE.get(part); if (master) break; }
      }
    }
    if (!master) {
      console.warn('  ⚠️  No encontrado en maestro: ' + item.codigoFabrica + ' / ' + item.codigoOE + ' — ' + item.descripcion);
      continue;
    }
    resolved.push({ ...item, masterId: master.id, codigo: master.codigo || '', nombre: master.nombre || item.descripcion });
  }
  return resolved;
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  RENOTECH — DEVOLUCIÓN A PROVEEDOR                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('   ⚠️  MODO DRY-RUN: no se escribirá en Firestore');
  console.log('   Proveedor: ' + PROVEEDOR_NOMBRE);
  console.log('   Fecha:     ' + FECHA_DEVOLUCION);

  console.log('\n📄  Leyendo Excel de devolución...');
  const items = await leerExcelDevolucion();
  console.log('    ' + items.length + ' productos leídos');
  for (const it of items) {
    console.log('      ' + it.codigoFabrica.padEnd(20) + ' x' + it.cantidad + '  Bs.' + it.costo + '  ' + it.descripcion.slice(0, 50));
  }

  const { hq, sucre } = await obtenerSucursales();
  console.log('\n🏢  Casa Matriz: ' + hq.name + ' (' + hq.id + ')');
  console.log('🏪  Sucre: ' + sucre.name + ' (' + sucre.id + ')');

  const empresa = await buscarEmpresaYCuenta();
  console.log('🏷️  Empresa: ' + empresa.empresaNombre + ' (id=' + (empresa.empresaId ? empresa.empresaId.slice(-6) : 'N/A') + ', cuenta=' + (empresa.cuentaId ? empresa.cuentaId.slice(-6) : 'N/A') + ')');

  console.log('\n🔍  Buscando productos en catálogo maestro...');
  const resolved = await resolverProductos(items);
  console.log('    ' + resolved.length + '/' + items.length + ' productos encontrados');
  if (resolved.length === 0) { console.log('\n❌  No se encontraron productos. Abortando.'); process.exit(1); }

  const fechaTs = tsFromDate(FECHA_DEVOLUCION);
  const totalUnits = resolved.reduce((s, p) => s + p.cantidad, 0);
  const totalValue = resolved.reduce((s, p) => s + (p.costo * p.cantidad), 0);

  // ── PASO A: Envío Sucre → HQ ─────────────────────────────
  console.log('\n── PASO A: Envío Sucre 01 → Casa Matriz ──────────────');

  const sucreStockSnap = await db.collection(COL.PRODUCTOS).where('branchId', '==', sucre.id).get();
  const sucreStock = new Map();
  for (const d of sucreStockSnap.docs) {
    const data = d.data();
    if (data.masterId) sucreStock.set(data.masterId, { id: d.id, ...data });
  }

  const hqStockSnap = await db.collection(COL.PRODUCTOS).where('branchId', '==', hq.id).get();
  const hqStock = new Map();
  for (const d of hqStockSnap.docs) {
    const data = d.data();
    if (data.masterId) hqStock.set(data.masterId, { id: d.id, ...data });
  }

  const envioNum = DRY_RUN ? 0 : await reservarEnvioSeq();
  const envioCodigo = fmtEnvio(envioNum);
  const envioRef = db.collection(COL.ENVIOS).doc(envioCodigo);
  const envioNotas = 'Devolución a proveedor ' + PROVEEDOR_NOMBRE + ' — retorno de stock Sucre→Casa Matriz';

  if (!DRY_RUN) {
    await envioRef.set({
      numero: envioNum, codigo: envioCodigo, isDirect: true, status: 'recibido',
      fromBranchId: sucre.id, fromBranchName: sucre.name,
      toBranchId: hq.id, toBranchName: hq.name,
      notas: envioNotas, itemCount: resolved.length,
      totalUnitsEnviadas: totalUnits, totalUnitsRecibidas: totalUnits,
      transportId: null, transportMethod: null, transportPaymentType: null,
      transportCost: 0, transportPaymentMethod: null, transportBankRef: null,
      createdBy: MIGRATION_USER_ID, createdByName: MIGRATION_USER_NAME,
      createdAt: fechaTs, updatedAt: fechaTs,
      despachadoBy: MIGRATION_USER_ID, despachadoByName: MIGRATION_USER_NAME, despachadoAt: fechaTs,
      recibidoBy: MIGRATION_USER_ID, recibidoByName: MIGRATION_USER_NAME, recibidoAt: fechaTs,
      editedInTransit: false, hasDiscrepancy: false,
    });
  }
  console.log('    📦 Envío ' + envioCodigo + ' creado (Sucre→Casa Matriz)');

  const writes = [];
  for (const p of resolved) {
    const sucreDoc = sucreStock.get(p.masterId);
    const sucreProdId = sucreDoc ? sucreDoc.id : (sucre.id + '_' + p.masterId);
    const sucrePrev = sucreDoc ? (sucreDoc.stock || 0) : 0;
    const sucreNew = Math.max(0, sucrePrev - p.cantidad);

    const hqDoc = hqStock.get(p.masterId);
    const hqProdId = hqDoc ? hqDoc.id : (hq.id + '_' + p.masterId);
    const hqPrev = hqDoc ? (hqDoc.stock || 0) : 0;
    const hqNew = hqPrev + p.cantidad;

    // Envío item
    writes.push({ op: 'set', ref: db.collection(COL.ENVIOS + '/' + envioCodigo + '/items').doc(), data: {
      productId: sucreProdId, masterId: p.masterId, productName: p.nombre,
      productCode: p.codigo, qtyPedida: 0, qtyEnviada: p.cantidad, qtyRecibida: p.cantidad,
      costo: p.costo, esExtra: false,
    }});

    // TRASP_SALIDA Sucre
    if (sucreDoc) {
      writes.push({ op: 'update', ref: db.collection(COL.PRODUCTOS).doc(sucreDoc.id), data: {
        stock: sucreNew, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }});
    }
    writes.push({ op: 'set', ref: db.collection(COL.MOV).doc(), data: {
      productId: sucreProdId, masterId: p.masterId, type: 'TRASP_SALIDA',
      quantity: -p.cantidad, currentStock: sucreNew, previousStock: sucrePrev,
      reason: envioNotas + ' — ' + envioCodigo, referenceId: envioCodigo,
      date: fechaTs, userId: MIGRATION_USER_ID, userName: MIGRATION_USER_NAME,
      branchId: sucre.id, unitCost: p.costo, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }});

    // TRASP_ENTRADA HQ
    if (hqDoc) {
      writes.push({ op: 'update', ref: db.collection(COL.PRODUCTOS).doc(hqDoc.id), data: {
        stock: hqNew, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }});
    } else {
      writes.push({ op: 'set', ref: db.collection(COL.PRODUCTOS).doc(hqProdId), data: {
        masterId: p.masterId, branchId: hq.id, stock: hqNew, minStock: 5, isActive: true,
        costo: p.costo, codigo: p.codigo, nombre: p.nombre, marca: p.marca || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }});
    }
    writes.push({ op: 'set', ref: db.collection(COL.MOV).doc(), data: {
      productId: hqProdId, masterId: p.masterId, type: 'TRASP_ENTRADA',
      quantity: p.cantidad, currentStock: hqNew, previousStock: hqPrev,
      reason: envioNotas + ' — ' + envioCodigo, referenceId: envioCodigo,
      date: fechaTs, userId: MIGRATION_USER_ID, userName: MIGRATION_USER_NAME,
      branchId: hq.id, unitCost: p.costo, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }});

    if (sucreDoc) sucreStock.set(p.masterId, { ...sucreDoc, stock: sucreNew });
    hqStock.set(p.masterId, { id: hqProdId, stock: hqNew, ...(hqDoc || {}) });
  }
  await commitBatches(writes);
  console.log('    ✅ ' + resolved.length + ' productos transferidos Sucre→Casa Matriz (' + totalUnits + ' unidades)');

  // ── PASO B: GARANTIA_SALIDA en Casa Matriz ────────────────
  console.log('\n── PASO B: Devolución al proveedor (GARANTIA_SALIDA) ──');

  const devolucionRef = db.collection(COL.DEVOLUCIONES).doc();
  const devolucionId = devolucionRef.id;
  const devShortId = devolucionId.slice(-6).toUpperCase();
  const devItems = [];
  const writes2 = [];

  for (const p of resolved) {
    const hqDoc = hqStock.get(p.masterId);
    const hqProdId = hqDoc ? hqDoc.id : (hq.id + '_' + p.masterId);
    const hqPrev = hqDoc ? (hqDoc.stock || 0) : p.cantidad;
    const hqNew = Math.max(0, hqPrev - p.cantidad);

    if (hqDoc) {
      writes2.push({ op: 'update', ref: db.collection(COL.PRODUCTOS).doc(hqDoc.id), data: {
        stock: hqNew, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }});
    }

    writes2.push({ op: 'set', ref: db.collection(COL.MOV).doc(), data: {
      productId: hqProdId, masterId: p.masterId, type: 'GARANTIA_SALIDA',
      quantity: -p.cantidad, currentStock: hqNew, previousStock: hqPrev,
      unitCost: p.costo, totalValue: p.costo * p.cantidad,
      reason: 'Devolución a ' + PROVEEDOR_NOMBRE + ' #' + devShortId,
      referenceId: devolucionId, referenceType: 'DEVOLUCION',
      date: fechaTs, userId: MIGRATION_USER_ID, userName: MIGRATION_USER_NAME,
      branchId: hq.id, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }});

    devItems.push({
      masterId: p.masterId, productCode: p.codigo, productName: p.nombre,
      codigoFabrica: p.codigoFabrica, codigoOE: p.codigoOE, marca: p.marca,
      quantity: p.cantidad, cost: p.costo, total: p.costo * p.cantidad,
    });

    if (hqDoc) hqStock.set(p.masterId, { ...hqDoc, stock: hqNew });
  }
  await commitBatches(writes2);
  console.log('    ✅ GARANTIA_SALIDA registrada para ' + resolved.length + ' productos');

  // ── PASO C: Ajustar saldo en cuentas_proveedores ──────────
  console.log('\n── PASO C: Ajuste saldo proveedor (devolución) ────────');
  if (empresa.cuentaId) {
    if (!DRY_RUN) {
      // Decrementar saldo de la cuenta (el proveedor debe devolver ese monto)
      await db.collection(COL.CUENTAS).doc(empresa.cuentaId).update({
        saldo: admin.firestore.FieldValue.increment(-totalValue),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Decrementar saldoTotal de la empresa
      if (empresa.empresaId) {
        await db.collection(COL.EMPRESAS).doc(empresa.empresaId).update({
          saldoTotal: admin.firestore.FieldValue.increment(-totalValue),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
    console.log('    ✅ Saldo ajustado: -Bs. ' + totalValue.toFixed(2) + ' en cuenta ' + empresa.cuentaId.slice(-6));
  } else {
    console.log('    ⚠️  No se encontró cuenta del proveedor — saldo NO ajustado');
  }

  // ── Crear documento devoluciones_proveedor ─────────────────
  const devDoc = {
    proveedorNombre: PROVEEDOR_NOMBRE,
    empresaId: empresa.empresaId,
    fecha: fechaTs,
    items: devItems,
    itemCount: devItems.length,
    totalUnits: totalUnits,
    totalValue: Math.round(totalValue * 100) / 100,
    motivo: 'Devolución de productos al proveedor',
    branchId: hq.id,
    envioRetornoCodigo: envioCodigo,
    status: 'PROCESADO',
    usuarioId: MIGRATION_USER_ID,
    usuarioNombre: MIGRATION_USER_NAME,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!DRY_RUN) await devolucionRef.set(devDoc);
  console.log('\n📋  Documento devoluciones_proveedor creado: ' + devShortId);

  if (!DRY_RUN) {
    await db.collection(COL.AUDIT).add({
      action: 'MIGRATION_DEVOLUCION_PROVEEDOR',
      entityId: devolucionId, entityType: 'DEVOLUCION',
      performedBy: MIGRATION_USER_ID, performedByName: MIGRATION_USER_NAME,
      branchId: hq.id,
      details: 'Devolución a ' + PROVEEDOR_NOMBRE + ': ' + devItems.length + ' productos, ' + totalUnits + ' unidades, Bs. ' + totalValue.toFixed(2),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // ── RESUMEN ───────────────────────────────────────────────
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    RESUMEN DEVOLUCIÓN                     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('  Proveedor:  ' + PROVEEDOR_NOMBRE);
  console.log('  Fecha:      ' + FECHA_DEVOLUCION);
  console.log('  Productos:  ' + devItems.length);
  console.log('  Unidades:   ' + totalUnits);
  console.log('  Valor:      Bs. ' + totalValue.toFixed(2));
  console.log('  Envío ret:  ' + envioCodigo + ' (Sucre→Casa Matriz)');
  console.log('  Doc ID:     ' + devShortId);
  console.log('');
  console.table(devItems.map(function(d) { return {
    codigo: d.productCode, producto: d.productName.slice(0, 40),
    cantidad: d.quantity, costo: d.cost, total: d.total,
  }; }));
  if (DRY_RUN) console.log('\n⚠️  DRY-RUN: ningún dato fue escrito.');
  process.exit(0);
}

main().catch(function(err) {
  console.error('\n❌  ERROR:', err.message || err);
  console.error(err.stack);
  process.exit(1);
});
