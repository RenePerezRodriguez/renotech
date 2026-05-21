/**
 * ============================================================
 *  SCRIPT DE CARGA MULTIPLE — RENOTECH
 *  carga_multiple.js
 * ============================================================
 *
 *  ¿QUÉ HACE?
 *  Procesa los 11 Excels de "PARA SCRIPT RENOTECH" en orden
 *  según GUIA COMPRAS SCRIPT.xlsx. Por cada compra:
 *
 *    Paso A — Carga el Excel a Casa Matriz (HQ)
 *      · Crea/actualiza productos en catalogo_maestro y productos
 *      · INCREMENTA stock en HQ (no sobrescribe; cada Excel es una compra)
 *      · Sobrescribe costo con el del Excel actual (último gana)
 *      · Registra movimientos kardex tipo ENTRADA con la FECHA COMPRA
 *      · Crea documento `compras` con paymentMethod, supplierId, etc.
 *      · Si CREDITO: suma al saldo de cuentas_proveedores
 *      · Si CONTADO: crea `gastos_operativos` (registro histórico, sin asiento)
 *
 *    Paso B — Traspasa el stock de la compra a Sucursal Sucre 01
 *      · Crea documento `envios` ENVD-NNNN status='recibido' (módulo /envios)
 *      · Kardex TRASP_SALIDA en HQ y TRASP_ENTRADA en Sucre
 *      · Crea/incrementa stock local en Sucre
 *
 *  Reglas de negocio (confirmadas con el usuario):
 *    - Costo repetido entre Excels → sobrescribir con el último
 *    - CREDITO → cuentas_proveedores | CONTADO → gastos_operativos desde caja HQ
 *    - 1 documento `compras` por cada Excel
 *    - No limpiar datos previos (asume base vacía)
 *
 *  REQUISITOS
 *    node >= 18
 *    npm install firebase-admin exceljs   (ya están en package.json)
 *
 *  EJECUCIÓN
 *    node scripts/migrations/carga_multiple.js
 *    node scripts/migrations/carga_multiple.js --dry-run    (no escribe en Firestore)
 *    node scripts/migrations/carga_multiple.js --only=1,3   (solo compras 1 y 3 de la guía)
 *
 * ============================================================
 */

'use strict';

const admin   = require('firebase-admin');
const ExcelJS = require('exceljs');
const path    = require('path');
const fs      = require('fs');

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CONFIGURACIÓN                                                       ║
// ╚══════════════════════════════════════════════════════════════════════╝

const SOURCE_DIR = 'C:/Users/Rene_/Downloads/PARA SCRIPT RENOTECH/PARA SCRIPT RENOTECH';
const GUIA_FILE  = 'GUIA COMPRAS SCRIPT.xlsx';

const SUCRE_BRANCH_NAME = 'Sucre';

const MIGRATION_USER_ID   = '6WTLnYziG5csLPE9DHPAc7qgX6A2';
const MIGRATION_USER_NAME = 'Stefany Garro';

// CLI flags
const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const ONLY_ARG = ARGS.find(a => a.startsWith('--only='));
const ONLY_NUMBERS = ONLY_ARG ? ONLY_ARG.split('=')[1].split(',').map(n => parseInt(n.trim(), 10)).filter(Boolean) : null;

// Mapeo PROVEEDOR (en guía) → nombre canónico
const PROVEEDOR_ALIASES = {
  'IMPORTADORA RT': 'IMPORTADORA RT',
  'MIOCAR':         'MIOCAR',
  'AIDISA':         'AIDISA',
  'SIN NOMBRE':     'PROVEEDOR SIN NOMBRE',
};

// ─── CARGAR SERVICE ACCOUNT ─────────────────────────────────
function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  }
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    const match = raw.match(/FIREBASE_SERVICE_ACCOUNT_KEY\s*=\s*'([\s\S]*?)'\s*(\n|$)/) ||
                  raw.match(/FIREBASE_SERVICE_ACCOUNT_KEY\s*=\s*"([\s\S]*?)"\s*(\n|$)/) ||
                  raw.match(/FIREBASE_SERVICE_ACCOUNT_KEY\s*=\s*(\{[\s\S]*?\})\s*(\n|$)/);
    if (match) return JSON.parse(match[1]);
  }
  const keyPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(keyPath)) {
    return JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  }
  throw new Error('No se encontró credencial Firebase (FIREBASE_SERVICE_ACCOUNT_KEY en .env.local o serviceAccountKey.json).');
}

const serviceAccount = loadServiceAccount();
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ─── COLECCIONES ──────────────────────────────────────────────
const COL_MASTER       = 'catalogo_maestro';
const COL_PRODUCTOS    = 'productos';
const COL_MOV          = 'movimientos';
const COL_BRANCHES     = 'branches';
const COL_AUDIT        = 'admin_audit_log';
const COL_CATEGORIAS   = 'categorias';
const COL_MARCAS       = 'marcas';
const COL_ORIGENES     = 'origenes';
const COL_COMPRAS      = 'compras';
const COL_EMPRESAS     = 'empresas';
const COL_CUENTAS      = 'cuentas_proveedores';
const COL_GASTOS       = 'gastos_operativos';
const COL_ENVIOS       = 'envios';
const COUNTERS_DOC     = 'counters/sequences';

function fmtEnvioDirecto(n) { return `ENVD-${String(n).padStart(4, '0')}`; }

// Reserva atómica del siguiente correlativo envioDirectoSeq.
async function reservarEnvioDirectoSeq() {
  const ref = db.doc(COUNTERS_DOC);
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data().envioDirectoSeq || 0) : 0;
    const next = current + 1;
    tx.set(ref, { envioDirectoSeq: next }, { merge: true });
    return next;
  });
}

// ════════════════════════════════════════════════════════════
// HELPERS (portados/copiados de cargar_y_transferir.js — no se modifica el original)
// ════════════════════════════════════════════════════════════

const CATEGORY_KEYWORDS = {
  'Motor': ['piston','pistón','anillo','biela','cigüeñal','arbol de leva','válvula','valvula','junta','empaque','culata','bloque','retenes','reten','retén','sello','bomba de aceite','tapa de punterias','balancin','varilla','tensor','cadena de tiempo','kit de motor','multiple','escape','admision','turbo','turbocompresor','intercooler','volante de motor','damper','polea cigüeñal','bobina de encendido','bobina','bujia','bujía','distribuidor','rotor','carburador','inyector','riel de inyectores','sensor map','sensor maf','sensor tps','sensor ckp','sensor cmp'],
  'Lubricantes': ['aceite','lubricante','grasa','aditivo','liquido','líquido','refrigerante','anticongelante','coolant','atf'],
  'Suspensión': ['amortiguador','muelle','espiral','resorte','buje','bujes','rotula','rótula','barra estabilizadora','terminal','brazo de suspension','horquilla','soporte de motor','tope','goma de suspension','fuelle','guardapolvo','cremallera direccion','suspension','suspensión','meseta','tijera','bieleta','silent block','silentblock','cauchos'],
  'Dirección': ['direccion','dirección','columna de direccion','bomba de direccion','caja de direccion','cremallera de direccion','volante','timon','manguera de direccion'],
  'Frenos': ['pastilla','pastillas','freno','disco de freno','disco freno','tambor','zapata','caliper','mordaza','pinza de freno','cilindro de freno','cilindro maestro','bomba de freno','manguera de freno','liquido de freno','sensor abs','abs','servofreno','booster','pedal de freno','campana','regulador de freno','freno de mano','kit de freno'],
  'Eléctrico': ['alternador','motor de arranque','arranque','marcha','batería','bateria','bornes','fusible','caja de fusibles','relay','relé','foco','bombillo','led','faro','farol','luz','lámpara','lampara','direccional','stop','neblinero','sensor','sensores','modulo','módulo','computadora','ecu','pcm','tablero','cluster','velocimetro','switch','interruptor','regulador de voltaje','regulador','cable','cables','arnés','arnes','conector','socket','electroventilador','claxon','bocina','radio','pantalla','estereo','parlante','camara','cámara','motor electrico','motor de ventana','elevador','motor limpiaparabrisas','limpiaparabrisas','pluma','plumas','escobilla'],
  'Refrigeración': ['radiador','termostato','bomba de agua','manguera de agua','manguera radiador','deposito','depósito','tanque de agua','reservorio','ventilador','aspas','fan clutch','enfriador','tapa de radiador','sensor de temperatura','bulbo','termocontacto','valvula termostatica'],
  'Aire Acondicionado': ['aire acondicionado','a/c','ac','climatizador','compresor de aire','compresor ac','compresor a/c','condensador ac','condensador aire','evaporador','filtro de polen','filtro cabina','filtro de cabina','blower','soplador','calefaccion','calefacción','calentador','valvula expansion','manguera ac','presostato'],
  'Transmisión': ['caja de cambios','transmision','transmisión','caja automatica','caja manual','embrague','clutch','disco de clutch','plato de presion','prensa','collarin','collarín','sincronizador','sincro','eje','flecha','semieje','palier','diferencial','corona','piñón','pinon','satelite','cardan','cardán','cruceta','homocinética','homocinetica','tripoide','tripode','tulipan','tulipán','palanca de cambios','convertidor','torque converter'],
  'Carrocería': ['parachoques','defensa','bumper','paragolpes','guardafango','guardabarro','fender','tapabarros','capó','capo','cofre','bonete','puerta','compuerta','porton','portón','espejo','retrovisor','mirror','vidrio','cristal','parabrisas','parabrisa','windshield','luneta','manija','chapa','cerradura','seguro','bisagra','gozne','moldura','emblema','logo','spoiler','aleron','alerón','tapa','cajuela','maletero','baul','baúl','carroceria','carrocería','body','estribo','rejilla','parrilla','grill','mascara','máscara'],
  'Filtros': ['filtro de aceite','filtro aceite','oil filter','filtro de aire','filtro aire','air filter','filtro de combustible','filtro combustible','fuel filter','filtro de gasolina','filtro hidraulico','filtro hidráulico','filtro','elemento filtrante','cartucho filtro'],
  'Combustible': ['bomba de gasolina','bomba combustible','fuel pump','tanque de gasolina','flotador','aforador','manguera combustible','linea de combustible','regulador de presion','tapa de gasolina','tapon gasolina'],
  'Ruedas': ['llanta','rin','aro','rueda','neumatico','neumático','caucho','tapa de rin','tapacubo','copa','tuerca de rueda','birlo','tornillo rueda','esparrago','espárrago','valvula de llanta','balanceador','contrapeso','plomo'],
  'Correas': ['correa','banda','faja','belt','correa de tiempo','timing belt','correa de accesorios','serpentine','correa de alternador','correa de aire','polea','tensor','tensioner','rodillo tensor','kit de tiempo','kit distribucion','kit distribución'],
  'Rodamientos': ['rodamiento','balinera','balero','cojinete','bearing','rodamiento de rueda','wheel bearing','kit de rodamiento','pista','race','jaula'],
  'Escape': ['escape','mofle','silenciador','muffler','catalizador','convertidor catalitico','convertidor catalítico','resonador','tubo de escape','multiple de escape','empaque escape','junta escape','donut','abrazadera escape','colgador escape','soporte escape','sensor de oxigeno','sensor oxígeno','sonda lambda','o2 sensor'],
  'Accesorios': ['accesorio','accesorios','adaptador','soporte','base','bracket','montura','abrazadera','grampa','perno','tornillo','tuerca','arandela','hardware','manguera','codo','conector','union','unión','tee','protector','cobertor','cubierta','funda','cover','kit','juego','set','herramienta','tool','llave','extractor']
};

function normalizeText(text) {
  if (!text) return '';
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function normalizeForMatching(text) {
  return normalizeText(text).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function autoCategorize(productName) {
  if (!productName) return '';
  const norm = normalizeForMatching(productName);
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const sorted = [...keywords].sort((a, b) => b.length - a.length);
    for (const kw of sorted) {
      if (norm.includes(normalizeForMatching(kw))) return category;
    }
  }
  return '';
}
function toTitleCase(str) {
  return String(str || '').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

const BRAND_PREFIX_MAP = {
  'BOSCH':'BOS','KAYABA':'KAY','RENAULT':'REN','TOYOTA':'TOY','NISSAN':'NIS','HONDA':'HON','CHEVROLET':'CHE',
  'FORD':'FOR','VOLKSWAGEN':'VW','VW':'VW','HYUNDAI':'HYU','KIA':'KIA','MITSUBISHI':'MIT','SUZUKI':'SUZ',
  'MAZDA':'MAZ','SUBARU':'SUB','ISUZU':'ISU','VOLVO':'VOL','BMW':'BMW','MERCEDES':'MER','MERCEDES-BENZ':'MER',
  'AUDI':'AUD','PEUGEOT':'PEU','CITROEN':'CIT','FIAT':'FIA','JEEP':'JEE','LAND ROVER':'LRO',
  'SACHS':'SAC','MONROE':'MON','NGK':'NGK','DENSO':'DEN','FERODO':'FER','BREMBO':'BRE','GATES':'GAT',
  'DAYCO':'DAY','MAHLE':'MAH','MANN':'MAN','VALEO':'VAL','LUK':'LUK','SKF':'SKF','INA':'INA',
  'CONTINENTAL':'CON','GENERICO':'GEN','GENERICA':'GEN','RENAULT GROUP':'REN','MOTRIO':'MOT',
  'TRW':'TRW','FEBI':'FEB'
};
function getBrandPrefix(brand) {
  if (!brand || !brand.trim()) return 'GEN';
  const clean = brand.trim().toUpperCase();
  if (BRAND_PREFIX_MAP[clean]) return BRAND_PREFIX_MAP[clean];
  for (const [k, v] of Object.entries(BRAND_PREFIX_MAP)) {
    if (clean.startsWith(k) || clean.includes(k)) return v;
  }
  const consonants = clean.replace(/[AEIOU\s\-\.]/g, '');
  if (consonants.length >= 3) return consonants.slice(0, 3);
  return clean.replace(/[\s\-\.]/g, '').slice(0, 3).padEnd(3, 'X');
}
function generateProductCode(brand, sequentialNumber) {
  return `${getBrandPrefix(brand)}-${String(sequentialNumber).padStart(3, '0')}`;
}
function isAutoGeneratedCode(code) {
  return /^[A-Z]{2,4}-\d{3,}$/.test(String(code || ''));
}

function generateSearchTags({ nombre, codigo, codigoOE, codigoFabrica, origen } = {}) {
  const tags = new Set();
  const addTerms = (text) => {
    if (!text) return;
    const norm = normalizeText(text);
    norm.split(/[\s\-\/\.]+/).filter(w => w.length > 1).forEach(w => tags.add(w));
    tags.add(norm);
  };
  addTerms(nombre); addTerms(codigo); addTerms(codigoOE); addTerms(codigoFabrica); addTerms(origen);
  return Array.from(tags);
}

function parseProductName(originalName, existingDesc = '') {
  let baseName = (originalName || '').trim();
  const newDescParts = [];
  // Solo extraer contenido entre parentesis a descripcion
  const parenRegex = /\((.*?)\)/g;
  let match;
  while ((match = parenRegex.exec(baseName)) !== null) {
    if (match[1] && match[1].trim()) {
      let pContent = match[1].trim();
      const upper = pContent.toUpperCase();
      if (upper === 'L')       pContent = 'Izquierdo';
      else if (upper === 'R')  pContent = 'Derecho';
      else if (upper === 'LH') pContent = 'Lado Izquierdo';
      else if (upper === 'RH') pContent = 'Lado Derecho';
      newDescParts.push(pContent);
    }
  }
  baseName = baseName.replace(/\((.*?)\)/g, '').trim().replace(/\s+/g, ' ');
  const finalDesc = newDescParts.filter(Boolean).join(', ').trim();

  let combinedDesc = existingDesc || '';
  if (finalDesc) {
    if (combinedDesc && !combinedDesc.includes(finalDesc)) {
      combinedDesc = combinedDesc.includes('Compatibilidad:')
        ? `${combinedDesc}, ${finalDesc}`.trim()
        : `${combinedDesc}\n\nCompatibilidad: ${finalDesc}`.trim();
    } else if (!combinedDesc) combinedDesc = finalDesc;
  }
  return { baseName, newDesc: combinedDesc };
}

function parseNum(val) {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const parsed = parseFloat(String(val).replace(/[^\d.-]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}
function findVal(rowData, keys) {
  for (const k of keys) {
    if (rowData[k.toUpperCase().trim()] !== undefined) return rowData[k.toUpperCase().trim()];
  }
  return undefined;
}
function tsFromDate(date) {
  // date puede ser Date o 'YYYY-MM-DD'
  const d = date instanceof Date ? date : new Date(`${date}T12:00:00-04:00`);
  return admin.firestore.Timestamp.fromDate(d);
}

// Normaliza una fecha de Excel (que ExcelJS interpreta como UTC 00:00) al
// mediodía local Bolivia preservando el día calendario que el usuario escribió.
function normalizarFechaExcel(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = value.getUTCMonth();
    const d = value.getUTCDate();
    return new Date(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00-04:00`);
  }
  return new Date(`${value}T12:00:00-04:00`);
}
function dateToYMD(d) {
  const dd = new Date(d);
  return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
}

async function commitBatches(writes) {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] ${writes.length} ops omitidas`);
    return;
  }
  const BATCH_SIZE = 400;
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const chunk = writes.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { op, ref, data, mergeFields } of chunk) {
      if (op === 'set')    batch.set(ref, data, mergeFields ? { merge: true } : {});
      if (op === 'update') batch.update(ref, data);
    }
    await batch.commit();
  }
}

// ════════════════════════════════════════════════════════════
// LECTURA DE LA GUÍA
// ════════════════════════════════════════════════════════════

async function leerGuia() {
  const guiaPath = path.join(SOURCE_DIR, GUIA_FILE);
  if (!fs.existsSync(guiaPath)) throw new Error(`Guía no encontrada: ${guiaPath}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(guiaPath);
  const sheet = wb.worksheets[0];

  // Detección de archivos por prefijo ordinal en el nombre (tolera espacios variables)
  const ordinales = {
    1: ['PRIMERA'], 2: ['SEGUNDA'], 3: ['TERCERA'], 4: ['CUARTA'], 5: ['QUINTA'],
    6: ['SEXTA'], 7: ['SEPTIMA', 'SÉPTIMA'], 8: ['OCTAVA'], 9: ['NOVENA'], 10: ['DECIMA', 'DÉCIMA'],
  };
  const archivosEnDir = fs.readdirSync(SOURCE_DIR).filter(f => f.toLowerCase().endsWith('.xlsx') && !f.includes('GUIA'));
  const archivosPorNumero = {};
  for (const [num, prefixes] of Object.entries(ordinales)) {
    const found = archivosEnDir.find(f => {
      const upper = f.toUpperCase();
      return prefixes.some(p => upper.startsWith(p + ' ') || upper.startsWith(p + '\t'));
    });
    if (found) archivosPorNumero[num] = found;
  }

  const compras = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const numero = parseInt(String(row.getCell(1).value || '').trim(), 10);
    if (!numero) continue;
    const proveedorRaw = String(row.getCell(2).value || '').trim().toUpperCase();
    const tipoCompra   = String(row.getCell(3).value || '').trim().toUpperCase(); // CREDITO | CONTADO
    const fechaCompra  = row.getCell(4).value;
    const fechaEnvio   = row.getCell(5).value;
    const archivo      = archivosPorNumero[numero];
    if (!archivo) {
      console.warn(`⚠️  No se encontró archivo para compra #${numero} en el mapa de la guía`);
      continue;
    }
    const archivoPath = path.join(SOURCE_DIR, archivo);
    if (!fs.existsSync(archivoPath)) {
      console.warn(`⚠️  Archivo no existe en disco: ${archivoPath} (compra #${numero}) — se omitirá`);
      continue;
    }

    compras.push({
      numero,
      proveedorRaw,
      proveedorNombre: PROVEEDOR_ALIASES[proveedorRaw] || proveedorRaw,
      tipoCompra: tipoCompra === 'CREDITO' ? 'CREDITO' : 'EFECTIVO', // mapeado a paymentMethod estándar
      tipoCompraOriginal: tipoCompra,
      fechaCompra: normalizarFechaExcel(fechaCompra),
      fechaEnvio:  normalizarFechaExcel(fechaEnvio),
      archivo,
      archivoPath,
    });
  }
  return compras.sort((a, b) => a.numero - b.numero);
}

// ════════════════════════════════════════════════════════════
// LECTURA DE EXCELS DE COMPRA
// ════════════════════════════════════════════════════════════

async function leerExcelCompra(excelPath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);
  const sheet = wb.worksheets[0];

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.value == null ? '' : cell.value).trim();
  });

  const productos = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (!row || !row.hasValues) continue;
    const obj = {};
    headers.forEach((h, col) => {
      if (!h) return;
      const v = row.getCell(col).value;
      if (v == null) { obj[h] = ''; return; }
      if (typeof v === 'object') {
        if ('text' in v) obj[h] = v.text;
        else if ('result' in v) obj[h] = v.result;
        else if ('richText' in v) obj[h] = v.richText.map(rt => rt.text).join('');
        else obj[h] = String(v);
      } else obj[h] = v;
    });

    const rd = {};
    for (const k of Object.keys(obj)) rd[k.toUpperCase().trim()] = obj[k];

    const rawId      = String(findVal(rd, ['ID','CÓDIGO INTERNO','ID RENOTECH','CODIGO_INTERNO']) || '').trim().toUpperCase();
    const rawFabrica = String(findVal(rd, ['CODIGO FABRICA','COD. FABRICA','REFERENCIA','FABRICA','SERIAL','CÓDIGO FÁBRICA','CODIGO','CÓDIGO']) || '').trim().toUpperCase();
    const codigoOE   = String(findVal(rd, ['CODIGO OE','OE','NUMERO ORIGINAL','REF. ORIGINAL','CÓDIGO OE']) || '').trim().toUpperCase();
    const rawNombre  = String(findVal(rd, ['DESCRIPCION','PRODUCTO','NOMBRE','TITULAR','DESCRIPCIÓN']) || '').trim();
    const marca      = String(findVal(rd, ['MARCA','FABRICANTE','LABORATORIO']) || '').trim().toUpperCase();
    const { baseName: nombre, newDesc: descripcion } = parseProductName(rawNombre);
    const origen     = String(findVal(rd, ['ORIGEN','PROCEDENCIA']) || '').trim().toUpperCase();
    const ubicacion  = String(findVal(rd, ['UBICACION','UBICACIÓN','ESTANTE','POSICION','UBIC']) || '').trim();
    const explicitCategory = String(findVal(rd, ['CATEGORIA','CATEGORÍA']) || '').trim();
    const autoCategory = autoCategorize(nombre);
    const categoria  = toTitleCase(explicitCategory || autoCategory || 'General');

    if (!nombre && !rawId && !rawFabrica && !codigoOE) continue;

    const stock            = parseNum(findVal(rd, ['STOCK','CANTIDAD','EXISTENCIA','SALDO']));
    const costo            = parseNum(findVal(rd, ['COSTO','COSTO UNITARIO','PRECIO COMPRA','P. COMPRA','COMPRA','COSTO_UNITARIO']));
    const precioConFactura = parseNum(findVal(rd, ['PRECIO C/F','PRECIO','PRECIO CON FACTURA','PRECIO_CON_FACTURA','PRECIO VENTA','PRECIO UNITARIO']));
    const precioSinFactura = parseNum(findVal(rd, ['PRECIO S/F','PRECIO SIN FACTURA','PRECIO_SIN_FACTURA']));
    const minStock         = parseNum(findVal(rd, ['MIN STOCK','STOCK MINIMO','MINIMO','ALERTA STOCK'])) || 5;

    productos.push({
      rawId, codigoFabrica: rawFabrica, codigoOE, nombre, marca, origen, categoria,
      ubicacion, descripcion, stock, costo, precioConFactura, precioSinFactura, minStock,
    });
  }
  return productos;
}

// ════════════════════════════════════════════════════════════
// SUCURSALES
// ════════════════════════════════════════════════════════════

async function obtenerSucursales() {
  const snap = await db.collection(COL_BRANCHES).get();
  let hqBranch = null, sucreBranch = null;
  for (const docSnap of snap.docs) {
    const d = docSnap.data();
    if (d.isHQ === true) hqBranch = { id: docSnap.id, ...d };
    if (d.name === SUCRE_BRANCH_NAME) sucreBranch = { id: docSnap.id, ...d };
  }
  if (!hqBranch) throw new Error('No se encontró sucursal con isHQ=true.');
  if (!sucreBranch) throw new Error(`No se encontró sucursal "${SUCRE_BRANCH_NAME}".`);
  return { hqBranch, sucreBranch };
}

// ════════════════════════════════════════════════════════════
// EMPRESA + CUENTA PROVEEDOR
// ════════════════════════════════════════════════════════════

async function obtenerOcrearEmpresaYCuenta(nombre, hqBranchId) {
  // Empresa
  const empSnap = await db.collection(COL_EMPRESAS).where('nombre', '==', nombre).limit(1).get();
  let empresaId, empresaNombre;
  if (!empSnap.empty) {
    empresaId = empSnap.docs[0].id;
    empresaNombre = empSnap.docs[0].data().nombre;
  } else {
    const ref = db.collection(COL_EMPRESAS).doc();
    const data = {
      nombre,
      notas: 'Creada por carga_multiple.js durante migración inicial',
      isActive: true,
      cuentaCount: 0,
      saldoTotal: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!DRY_RUN) await ref.set(data);
    empresaId = ref.id;
    empresaNombre = nombre;
  }

  // Buscar cuenta existente para esta sucursal (HQ)
  const accSnap = await db.collection(COL_CUENTAS)
    .where('empresaId', '==', empresaId).limit(10).get();
  let cuentaId, cuentaData;
  // Preferir cuenta con branchId de HQ; si no hay, tomar isDefault o la primera
  const hqDoc = accSnap.docs.find(d => d.data().branchId === hqBranchId);
  const defaultDoc = hqDoc || accSnap.docs.find(d => d.data().isDefault) || accSnap.docs[0];
  if (defaultDoc) {
    cuentaId = defaultDoc.id;
    cuentaData = defaultDoc.data();
    // Asignar branchId si le falta
    if (!cuentaData.branchId && !DRY_RUN) {
      await db.collection(COL_CUENTAS).doc(cuentaId).update({ branchId: hqBranchId, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  } else {
    const ref = db.collection(COL_CUENTAS).doc();
    const data = {
      empresaId,
      empresaNombre,
      branchId: hqBranchId,
      alias: nombre,
      razonSocial: nombre,
      saldo: 0,
      tipo: 'PROVEEDOR',
      isDefault: true,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!DRY_RUN) {
      await ref.set(data);
      await db.collection(COL_EMPRESAS).doc(empresaId).update({
        cuentaCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    cuentaId = ref.id;
    cuentaData = data;
  }
  return { empresaId, empresaNombre, cuentaId, cuentaSaldoActual: cuentaData.saldo || 0 };
}

// ════════════════════════════════════════════════════════════
// REGISTRAR CATEGORIAS / MARCAS / ORIGENES
// ════════════════════════════════════════════════════════════

async function registrarCatalogos(productos) {
  const catSnap = await db.collection(COL_CATEGORIAS).get();
  const existingCats = new Set(catSnap.docs.map(d => String(d.data().nombre || '').trim().toLowerCase()));

  const marcaSnap = await db.collection(COL_MARCAS).get();
  const existingBrands = new Set(marcaSnap.docs.map(d => String(d.data().nombre || '').trim().toUpperCase()));

  const originSnap = await db.collection(COL_ORIGENES).get();
  const existingOrigins = new Set(originSnap.docs.map(d => String(d.data().nombre || '').trim().toUpperCase()));

  const newCats = new Set(), newBrands = new Set(), newOrigins = new Set();
  for (const p of productos) {
    const cat = (p.categoria || '').trim();
    if (cat && !existingCats.has(cat.toLowerCase())) newCats.add(cat);
    const brand = (p.marca || '').trim().toUpperCase();
    if (brand && !existingBrands.has(brand)) newBrands.add(brand);
    const origen = (p.origen || '').trim().toUpperCase();
    if (origen && !existingOrigins.has(origen)) newOrigins.add(origen);
  }
  if (!newCats.size && !newBrands.size && !newOrigins.size) return;

  const ts = admin.firestore.FieldValue.serverTimestamp();
  const writes = [];
  for (const nombre of newCats)    writes.push({ op: 'set', ref: db.collection(COL_CATEGORIAS).doc(), data: { nombre, createdAt: ts, updatedAt: ts } });
  for (const nombre of newBrands)  writes.push({ op: 'set', ref: db.collection(COL_MARCAS).doc(),     data: { nombre, createdAt: ts, updatedAt: ts } });
  for (const nombre of newOrigins) writes.push({ op: 'set', ref: db.collection(COL_ORIGENES).doc(),   data: { nombre, createdAt: ts, updatedAt: ts } });
  await commitBatches(writes);
  console.log(`    + ${newCats.size} cat. nuevas, ${newBrands.size} marcas nuevas, ${newOrigins.size} orígenes nuevos`);
}

// ════════════════════════════════════════════════════════════
// CARGAR EN HQ + CREAR COMPRA + GASTO/CREDITO
// ════════════════════════════════════════════════════════════

async function cargarCompraEnHQ(productos, hqBranch, compra, cuentaInfo) {
  const fechaTs = tsFromDate(compra.fechaCompra);
  const importBatchId = `migration_multi_${compra.numero}_${Date.now()}`;

  const purchaseRef = db.collection(COL_COMPRAS).doc();
  const purchaseId  = purchaseRef.id;
  const purchaseShortId = purchaseId.slice(-6).toUpperCase();
  const purchaseItems = [];
  let purchaseTotal = 0, purchaseItemCount = 0;

  // Pre-fetch maestro
  const maestroSnap = await db.collection(COL_MASTER).get();
  const fullMap = new Map();
  const maxSeqByPrefix = {};
  for (const docSnap of maestroSnap.docs) {
    const d = docSnap.data();
    const m = { id: docSnap.id, ...d };
    const mKey = String(d.marcaId || '').toUpperCase().trim();
    if (d.codigo)        fullMap.set(String(d.codigo).toUpperCase(), m);
    if (d.codigoFabrica) fullMap.set(`fab:${String(d.codigoFabrica).toUpperCase()}|${mKey}`, m);
    if (d.codigoOE)      fullMap.set(`oe:${String(d.codigoOE).toUpperCase()}|${mKey}`, m);
    if (d.codigo && isAutoGeneratedCode(d.codigo)) {
      const [prefix, num] = String(d.codigo).toUpperCase().split('-');
      const n = parseInt(num, 10);
      if (!Number.isNaN(n) && (maxSeqByPrefix[prefix] || 0) < n) maxSeqByPrefix[prefix] = n;
    }
  }
  const brandCodeCounters = { ...maxSeqByPrefix };

  // Pre-fetch stock HQ
  const stockHQSnap = await db.collection(COL_PRODUCTOS).where('branchId', '==', hqBranch.id).get();
  const stockHQPorMasterId = new Map();
  for (const docSnap of stockHQSnap.docs) {
    const d = docSnap.data();
    if (d.masterId) stockHQPorMasterId.set(d.masterId, { id: docSnap.id, ...d });
  }

  const productosTraspaso = []; // los que tienen item.stock > 0 en este Excel

  const CHUNK = 30;
  for (let i = 0; i < productos.length; i += CHUNK) {
    const chunk = productos.slice(i, i + CHUNK);
    const writes = [];

    for (const item of chunk) {
      // Resolución master — clave compuesta código+marca para evitar colisiones
      const marcaNorm  = (item.marca || '').toUpperCase().trim();
      const matchById  = item.rawId         && fullMap.get(item.rawId);
      const _matchFab  = item.codigoFabrica && fullMap.get(`fab:${item.codigoFabrica}|${marcaNorm}`);
      // Salvaguarda extra: mismo codigoFabrica pero OEs distintos y definidos = producto diferente
      const matchByFab = _matchFab && !(item.codigoOE && _matchFab.codigoOE && item.codigoOE !== _matchFab.codigoOE) ? _matchFab : null;
      const matchByOE  = item.codigoOE      && fullMap.get(`oe:${item.codigoOE}|${marcaNorm}`);
      const existing   = matchById || matchByFab || matchByOE || null;

      let master = null;
      if (existing) {
        master = existing;
        item.codigo = existing.codigo;
      } else if (item.rawId) {
        item.codigo = item.rawId;
      } else {
        const prefix = getBrandPrefix(item.marca);
        if (brandCodeCounters[prefix] === undefined) brandCodeCounters[prefix] = 0;
        brandCodeCounters[prefix]++;
        item.codigo = generateProductCode(item.marca, brandCodeCounters[prefix]);
      }
      const codigoUp = String(item.codigo).toUpperCase();

      if (master) {
        // ACTUALIZAR maestro: sobrescribir costo (último gana) + actualizar precios
        const mRef = db.collection(COL_MASTER).doc(master.id);
        writes.push({ op: 'update', ref: mRef, data: {
          nombre:           item.nombre || master.nombre,
          marcaId:          item.marca || master.marcaId || '',
          categoriaId:      item.categoria || master.categoriaId || '',
          codigoFabrica:    item.codigoFabrica || master.codigoFabrica || '',
          codigoOE:         item.codigoOE || master.codigoOE || '',
          origen:           item.origen || master.origen || '',
          descripcion:      item.descripcion || master.descripcion || '',
          costoBase:        item.costo > 0 ? item.costo : (master.costoBase || 0),
          precioConFactura: item.precioConFactura > 0 ? item.precioConFactura : (master.precioConFactura || 0),
          precioSinFactura: item.precioSinFactura > 0 ? item.precioSinFactura : (master.precioSinFactura || 0),
          precioDefault:    item.precioConFactura > 0 ? item.precioConFactura : (master.precioDefault || 0),
          searchTags:       generateSearchTags(item),
          updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
          importBatchId,
        }});
        const synced = { ...master, nombre: item.nombre || master.nombre, codigo: item.codigo, codigoFabrica: item.codigoFabrica || master.codigoFabrica, codigoOE: item.codigoOE || master.codigoOE };
        fullMap.set(codigoUp, synced);
        if (item.codigoFabrica) fullMap.set(`fab:${item.codigoFabrica}|${marcaNorm}`, synced);
        if (item.codigoOE)      fullMap.set(`oe:${item.codigoOE}|${marcaNorm}`, synced);
      } else {
        // CREAR nuevo maestro
        const mRef = db.collection(COL_MASTER).doc();
        master = { id: mRef.id };
        writes.push({ op: 'set', ref: mRef, data: {
          codigo:           item.codigo,
          nombre:           item.nombre || '',
          marcaId:          item.marca || '',
          categoriaId:      item.categoria || '',
          codigoFabrica:    item.codigoFabrica || '',
          codigoOE:         item.codigoOE || '',
          origen:           item.origen || '',
          descripcion:      item.descripcion || '',
          unidad:           'PZA',
          imagenUrls:       [],
          costoBase:        item.costo || 0,
          precioConFactura: item.precioConFactura || 0,
          precioSinFactura: item.precioSinFactura || 0,
          precioDefault:    item.precioConFactura || 0,
          precioUSD:        0,
          type:             'PRODUCT',
          isActive:         true,
          searchTags:       generateSearchTags(item),
          createdAt:        admin.firestore.FieldValue.serverTimestamp(),
          updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
          importBatchId,
        }});
        const cached = { id: master.id, codigo: item.codigo, nombre: item.nombre, codigoFabrica: item.codigoFabrica, codigoOE: item.codigoOE, marcaId: item.marca };
        fullMap.set(codigoUp, cached);
        if (item.codigoFabrica) fullMap.set(`fab:${item.codigoFabrica}|${marcaNorm}`, cached);
        if (item.codigoOE)      fullMap.set(`oe:${item.codigoOE}|${marcaNorm}`, cached);
      }

      // Stock HQ: INCREMENTAR (no sobrescribir) + sobrescribir costo (último gana)
      const productId = `${hqBranch.id}_${master.id}`;
      const stockExistente = stockHQPorMasterId.get(master.id);
      const previousStock = stockExistente ? (stockExistente.stock || 0) : 0;
      const newStockHQ    = previousStock + item.stock;

      if (stockExistente) {
        const pRef = db.collection(COL_PRODUCTOS).doc(stockExistente.id);
        writes.push({ op: 'update', ref: pRef, data: {
          stock:            newStockHQ,
          costo:            item.costo > 0 ? item.costo : (stockExistente.costo || 0),
          precioOverride:   item.precioConFactura > 0 ? item.precioConFactura : (stockExistente.precioOverride || 0),
          precioConFactura: item.precioConFactura > 0 ? item.precioConFactura : (stockExistente.precioConFactura || 0),
          precioSinFactura: item.precioSinFactura > 0 ? item.precioSinFactura : (stockExistente.precioSinFactura || 0),
          minStock:         item.minStock || stockExistente.minStock || 5,
          ubicacionFisica:  item.ubicacion || stockExistente.ubicacionFisica || '',
          updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
          importBatchId,
        }});
        // actualizar cache
        stockHQPorMasterId.set(master.id, { ...stockExistente, stock: newStockHQ, costo: item.costo > 0 ? item.costo : stockExistente.costo });
      } else {
        const pRef = db.collection(COL_PRODUCTOS).doc(productId);
        writes.push({ op: 'set', ref: pRef, data: {
          masterId:         master.id,
          branchId:         hqBranch.id,
          stock:            newStockHQ,
          minStock:         item.minStock || 5,
          isActive:         true,
          costo:            item.costo || 0,
          precioOverride:   item.precioConFactura || 0,
          precioConFactura: item.precioConFactura || 0,
          precioSinFactura: item.precioSinFactura || 0,
          codigo:           item.codigo,
          nombre:           item.nombre || '',
          marca:            item.marca || '',
          categoria:        item.categoria || '',
          origen:           item.origen || '',
          ubicacionFisica:  item.ubicacion || '',
          createdAt:        admin.firestore.FieldValue.serverTimestamp(),
          importBatchId,
        }});
        stockHQPorMasterId.set(master.id, { id: productId, stock: newStockHQ, costo: item.costo });
      }

      // Kardex ENTRADA con la fecha real de la compra
      if (item.stock > 0) {
        const movRef = db.collection(COL_MOV).doc();
        writes.push({ op: 'set', ref: movRef, data: {
          productId,
          masterId:      master.id,
          type:          'ENTRADA',
          quantity:      item.stock,
          currentStock:  newStockHQ,
          previousStock: previousStock,
          unitCost:      item.costo || 0,
          totalValue:    (item.costo || 0) * item.stock,
          reason:        `Compra ${compra.proveedorNombre} #${purchaseShortId}`,
          referenceId:   purchaseId,
          referenceType: 'PURCHASE',
          date:          fechaTs,
          userId:        MIGRATION_USER_ID,
          userName:      MIGRATION_USER_NAME,
          branchId:      hqBranch.id,
          createdAt:     admin.firestore.FieldValue.serverTimestamp(),
        }});

        const lineTotal = (item.costo || 0) * item.stock;
        purchaseItems.push({
          productId,
          masterId:    master.id,
          productName: item.nombre || '',
          productCode: item.codigo,
          quantity:    item.stock,
          cost:        item.costo || 0,
          total:       lineTotal,
          unit:        'PZA',
        });
        purchaseTotal     += lineTotal;
        purchaseItemCount += item.stock;

        productosTraspaso.push({
          productId,
          masterId:    master.id,
          codigo:      item.codigo,
          nombre:      item.nombre || '',
          codigoFabrica: item.codigoFabrica || '',
          costo:       item.costo || 0,
          stock:       item.stock,        // SOLO la cantidad de ESTA compra se traspasa
          marca:       item.marca || '',
          categoria:   item.categoria || '',
          origen:      item.origen || '',
        });
      }
    }
    await commitBatches(writes);
  }

  // Documento `compras` con paymentMethod correcto
  if (purchaseItems.length > 0) {
    const purchaseDoc = {
      supplierId:     cuentaInfo.cuentaId,         // apunta a cuentas_proveedores
      supplierName:   cuentaInfo.empresaNombre,
      empresaId:      cuentaInfo.empresaId,
      date:           fechaTs,
      createdAt:      admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:      admin.firestore.FieldValue.serverTimestamp(),
      total:          Math.round(purchaseTotal * 100) / 100,
      subtotal:       Math.round(purchaseTotal * 100) / 100,
      itemCount:      purchaseItemCount,
      lineCount:      purchaseItems.length,
      status:         'RECEIVED',
      paymentMethod:  compra.tipoCompra,            // 'CREDITO' | 'EFECTIVO'
      paymentStatus:  compra.tipoCompra === 'CREDITO' ? 'PENDING' : 'PAID',
      currency:       'BOB',
      notes:          `Compra histórica #${compra.numero} (${compra.proveedorNombre}, ${compra.tipoCompraOriginal})`,
      branchId:       hqBranch.id,
      usuarioId:      MIGRATION_USER_ID,
      usuarioNombre:  MIGRATION_USER_NAME,
      importBatchId,
    };
    if (!DRY_RUN) {
      await db.collection(COL_COMPRAS).doc(purchaseId).set(purchaseDoc);
      // Subitems
      const itemsCol = db.collection(COL_COMPRAS).doc(purchaseId).collection('items');
      const SUB = 400;
      for (let i = 0; i < purchaseItems.length; i += SUB) {
        const slice = purchaseItems.slice(i, i + SUB);
        const subBatch = db.batch();
        for (const it of slice) subBatch.set(itemsCol.doc(), it);
        await subBatch.commit();
      }
    }
  }

  return {
    purchaseId,
    purchaseShortId,
    purchaseTotal: Math.round(purchaseTotal * 100) / 100,
    purchaseItemCount,
    purchaseLineCount: purchaseItems.length,
    productosTraspaso,
  };
}

// ════════════════════════════════════════════════════════════
// EFECTOS FINANCIEROS POST-COMPRA
// ════════════════════════════════════════════════════════════

async function aplicarEfectosFinancieros(compra, cuentaInfo, purchaseInfo, hqBranch) {
  const total = purchaseInfo.purchaseTotal;
  if (total <= 0) return;

  if (compra.tipoCompra === 'CREDITO') {
    // Sumar al saldo de la cuenta del proveedor + actualizar empresa
    if (!DRY_RUN) {
      await db.collection(COL_CUENTAS).doc(cuentaInfo.cuentaId).update({
        saldo: admin.firestore.FieldValue.increment(total),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection(COL_EMPRESAS).doc(cuentaInfo.empresaId).update({
        saldoTotal: admin.firestore.FieldValue.increment(total),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    console.log(`    💳  CREDITO: +Bs. ${total.toFixed(2)} al saldo de ${cuentaInfo.empresaNombre}`);
  } else {
    // CONTADO → registrar gasto operativo (sin asiento de caja: histórico pre-sistema)
    if (!DRY_RUN) {
      const gastoRef = db.collection(COL_GASTOS).doc();
      await gastoRef.set({
        branchId:      hqBranch.id,
        date:          tsFromDate(compra.fechaCompra),
        amount:        total,
        category:      'OTROS',
        description:   `Compra #${compra.numero} a ${compra.proveedorNombre} (${purchaseInfo.purchaseLineCount} ítems) — ${purchaseInfo.purchaseShortId}`,
        supplierName:  cuentaInfo.empresaNombre,
        paymentMethod: 'EFECTIVO',
        counterpartyId: cuentaInfo.cuentaId,
        counterpartyType: 'SUPPLIER',
        userId:        MIGRATION_USER_ID,
        userName:      MIGRATION_USER_NAME,
        status:        'ACTIVE',
        notes:         'Carga histórica multi-Excel (sin asiento de caja, fecha pre-sistema)',
        createdAt:     admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    console.log(`    💵  CONTADO: gasto Bs. ${total.toFixed(2)} registrado en gastos_operativos`);
  }
}

// ════════════════════════════════════════════════════════════
// TRASPASO HQ → SUCRE
// ════════════════════════════════════════════════════════════

async function transferirCompraASucursal(productosCompra, hqBranch, sucreBranch, compra, purchaseShortId) {
  if (productosCompra.length === 0) return null;

  const fechaTs = tsFromDate(compra.fechaEnvio);
  const totalUnits = productosCompra.reduce((s, p) => s + p.stock, 0);
  const notas = `Compra #${compra.numero} ${compra.proveedorNombre} (${purchaseShortId})`;

  // Reservar correlativo del envío directo (módulo /envios)
  const envioNumero = DRY_RUN ? 0 : await reservarEnvioDirectoSeq();
  const envioCodigo = fmtEnvioDirecto(envioNumero);
  const envioRef    = db.collection(COL_ENVIOS).doc(envioCodigo);

  // Pre-fetch stock Sucre
  const sucreStockSnap = await db.collection(COL_PRODUCTOS).where('branchId', '==', sucreBranch.id).get();
  const sucreStockPorMasterId = new Map();
  for (const docSnap of sucreStockSnap.docs) {
    const d = docSnap.data();
    if (d.masterId) sucreStockPorMasterId.set(d.masterId, { id: docSnap.id, ...d });
  }

  // Header envío (módulo /envios) — directo, ya recibido
  if (!DRY_RUN) {
    await envioRef.set({
      numero:          envioNumero,
      codigo:          envioCodigo,
      isDirect:        true,
      status:          'recibido',

      fromBranchId:    hqBranch.id,
      fromBranchName:  hqBranch.name,
      toBranchId:      sucreBranch.id,
      toBranchName:    sucreBranch.name,

      notas,
      itemCount:           productosCompra.length,
      totalUnitsEnviadas:  totalUnits,
      totalUnitsRecibidas: totalUnits,

      transportId:            null,
      transportMethod:        null,
      transportPaymentType:   null,
      transportCost:          0,
      transportPaymentMethod: null,
      transportBankRef:       null,

      createdBy:        MIGRATION_USER_ID,
      createdByName:    MIGRATION_USER_NAME,
      createdAt:        fechaTs,
      updatedAt:        fechaTs,
      despachadoBy:     MIGRATION_USER_ID,
      despachadoByName: MIGRATION_USER_NAME,
      despachadoAt:     fechaTs,
      recibidoBy:       MIGRATION_USER_ID,
      recibidoByName:   MIGRATION_USER_NAME,
      recibidoAt:       fechaTs,
      editedInTransit:  false,
      hasDiscrepancy:   false,
    });
  }

  // Pre-fetch HQ stock to compute previousStock for each TRASP_SALIDA
  const hqStockSnap = await db.collection(COL_PRODUCTOS).where('branchId', '==', hqBranch.id).get();
  const hqStockMap = new Map();
  for (const d of hqStockSnap.docs) hqStockMap.set(d.id, { id: d.id, ...d.data() });

  const CHUNK = 30;
  for (let i = 0; i < productosCompra.length; i += CHUNK) {
    const chunk = productosCompra.slice(i, i + CHUNK);
    const writes = [];

    for (const p of chunk) {
      // 1. Item subcollection del envío
      const envioItemRef = db.collection(`${COL_ENVIOS}/${envioCodigo}/items`).doc();
      writes.push({ op: 'set', ref: envioItemRef, data: {
        productId:   p.productId,
        masterId:    p.masterId,
        productName: p.nombre || '',
        productCode: p.codigo || '',
        qtyPedida:   0,
        qtyEnviada:  p.stock,
        qtyRecibida: p.stock,
        costo:       p.costo || 0,
        esExtra:     false,
      }});

      // 2. Stock HQ: decrementar EXACTAMENTE p.stock
      const hqDoc = hqStockMap.get(p.productId);
      const hqPrev = hqDoc ? (hqDoc.stock || 0) : p.stock;
      const hqNew  = Math.max(0, hqPrev - p.stock);
      const hqRef  = db.collection(COL_PRODUCTOS).doc(p.productId);
      writes.push({ op: 'update', ref: hqRef, data: {
        stock:     hqNew,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }});
      if (hqDoc) hqStockMap.set(p.productId, { ...hqDoc, stock: hqNew });

      // 3. Kardex TRASP_SALIDA
      const movSalidaRef = db.collection(COL_MOV).doc();
      writes.push({ op: 'set', ref: movSalidaRef, data: {
        productId:     p.productId,
        masterId:      p.masterId,
        type:          'TRASP_SALIDA',
        quantity:      -p.stock,
        currentStock:  hqNew,
        previousStock: hqPrev,
        reason:        `${notas} — ${envioCodigo}`,
        referenceId:   envioCodigo,
        date:          fechaTs,
        userId:        MIGRATION_USER_ID,
        userName:      MIGRATION_USER_NAME,
        branchId:      hqBranch.id,
        unitCost:      p.costo || 0,
        createdAt:     admin.firestore.FieldValue.serverTimestamp(),
      }});

      // 4. Stock Sucre + TRASP_ENTRADA
      const sucreExistente = sucreStockPorMasterId.get(p.masterId);
      const sucreProductId = `${sucreBranch.id}_${p.masterId}`;
      if (sucreExistente) {
        const stockPrevio = sucreExistente.stock || 0;
        const nuevoStock  = stockPrevio + p.stock;
        const sucreRef    = db.collection(COL_PRODUCTOS).doc(sucreExistente.id);
        writes.push({ op: 'update', ref: sucreRef, data: {
          stock:     nuevoStock,
          costo:     p.costo > 0 ? p.costo : (sucreExistente.costo || 0),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }});

        const movEntradaRef = db.collection(COL_MOV).doc();
        writes.push({ op: 'set', ref: movEntradaRef, data: {
          productId:     sucreExistente.id,
          masterId:      p.masterId,
          type:          'TRASP_ENTRADA',
          quantity:      p.stock,
          currentStock:  nuevoStock,
          previousStock: stockPrevio,
          reason:        `${notas} — ${envioCodigo}`,
          referenceId:   envioCodigo,
          date:          fechaTs,
          userId:        MIGRATION_USER_ID,
          userName:      MIGRATION_USER_NAME,
          branchId:      sucreBranch.id,
          unitCost:      p.costo || 0,
          createdAt:     admin.firestore.FieldValue.serverTimestamp(),
        }});
        sucreStockPorMasterId.set(p.masterId, { ...sucreExistente, stock: nuevoStock });
      } else {
        const sucreRef = db.collection(COL_PRODUCTOS).doc(sucreProductId);
        writes.push({ op: 'set', ref: sucreRef, data: {
          masterId:         p.masterId,
          branchId:         sucreBranch.id,
          stock:            p.stock,
          minStock:         5,
          isActive:         true,
          costo:            p.costo || 0,
          codigo:           p.codigo,
          nombre:           p.nombre || '',
          marca:            p.marca || '',
          categoria:        p.categoria || '',
          origen:           p.origen || '',
          precioOverride:   null,
          ubicacionFisica:  '',
          createdAt:        admin.firestore.FieldValue.serverTimestamp(),
          updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
        }});

        const movEntradaRef = db.collection(COL_MOV).doc();
        writes.push({ op: 'set', ref: movEntradaRef, data: {
          productId:     sucreProductId,
          masterId:      p.masterId,
          type:          'TRASP_ENTRADA',
          quantity:      p.stock,
          currentStock:  p.stock,
          previousStock: 0,
          reason:        `${notas} — ${envioCodigo} (Alta Automática)`,
          referenceId:   envioCodigo,
          date:          fechaTs,
          userId:        MIGRATION_USER_ID,
          userName:      MIGRATION_USER_NAME,
          branchId:      sucreBranch.id,
          unitCost:      p.costo || 0,
          createdAt:     admin.firestore.FieldValue.serverTimestamp(),
        }});
        sucreStockPorMasterId.set(p.masterId, { id: sucreProductId, stock: p.stock, costo: p.costo });
      }
    }
    await commitBatches(writes);
  }

  if (!DRY_RUN) {
    await db.collection(COL_AUDIT).add({
      action:          'MIGRATION_ENVIO_DIRECTO',
      entityId:        envioCodigo,
      entityType:      'ENVIO',
      performedBy:     MIGRATION_USER_ID,
      performedByName: MIGRATION_USER_NAME,
      branchId:        hqBranch.id,
      details:         `${notas}: ${productosCompra.length} productos | ${totalUnits} unidades`,
      timestamp:       admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return { totalUnits, envioCodigo };
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  RENOTECH — CARGA MÚLTIPLE HISTÓRICA (carga_multiple.js) ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  if (DRY_RUN)        console.log('   ⚠️  MODO DRY-RUN: no se escribirá en Firestore');
  if (ONLY_NUMBERS)   console.log('   ⚠️  Filtro --only=' + ONLY_NUMBERS.join(','));

  // 1. Leer guía
  console.log('\n📋  Leyendo guía...');
  let comprasGuia = await leerGuia();
  if (ONLY_NUMBERS) comprasGuia = comprasGuia.filter(c => ONLY_NUMBERS.includes(c.numero));
  console.log(`    ${comprasGuia.length} compras a procesar:`);
  for (const c of comprasGuia) {
    console.log(`      #${c.numero}  ${c.proveedorNombre.padEnd(25)} ${c.tipoCompraOriginal.padEnd(8)} compra=${dateToYMD(c.fechaCompra)} envío=${dateToYMD(c.fechaEnvio)}`);
  }

  // 2. Sucursales
  const { hqBranch, sucreBranch } = await obtenerSucursales();
  console.log(`\n🏢  HQ: ${hqBranch.name} (${hqBranch.id})`);
  console.log(`🏪  Sucre: ${sucreBranch.name} (${sucreBranch.id})`);

  // 3. Cache de empresas/cuentas (una sola creación por proveedor único)
  const cuentasCache = new Map(); // proveedorNombre → cuentaInfo

  // 4. Procesar cada compra en orden
  const resumen = [];
  for (const compra of comprasGuia) {
    console.log(`\n────────────────────────────────────────────────────────────────`);
    console.log(`COMPRA #${compra.numero}  —  ${compra.proveedorNombre}  —  ${compra.tipoCompraOriginal}`);
    console.log(`Archivo: ${compra.archivo}`);
    console.log(`Fecha compra: ${dateToYMD(compra.fechaCompra)}   |   Fecha envío: ${dateToYMD(compra.fechaEnvio)}`);
    console.log(`────────────────────────────────────────────────────────────────`);

    // 4a. Leer Excel
    const productos = await leerExcelCompra(compra.archivoPath);
    console.log(`📄  ${productos.length} productos leídos del Excel`);
    if (productos.length === 0) { console.log('    (vacío, omitiendo)'); continue; }

    // 4b. Empresa + cuenta
    let cuentaInfo = cuentasCache.get(compra.proveedorNombre);
    if (!cuentaInfo) {
      cuentaInfo = await obtenerOcrearEmpresaYCuenta(compra.proveedorNombre, hqBranch.id);
      cuentasCache.set(compra.proveedorNombre, cuentaInfo);
      console.log(`🏷️  Empresa ${cuentaInfo.empresaNombre} (id=${cuentaInfo.empresaId.slice(-6)}) | cuenta=${cuentaInfo.cuentaId.slice(-6)}`);
    }

    // 4c. Catálogos auxiliares
    await registrarCatalogos(productos);

    // 4d. Cargar a HQ + crear `compras`
    const purchaseInfo = await cargarCompraEnHQ(productos, hqBranch, compra, cuentaInfo);
    console.log(`✅  Compra ${purchaseInfo.purchaseShortId} cargada en HQ`);
    console.log(`    ${purchaseInfo.purchaseLineCount} líneas | ${purchaseInfo.purchaseItemCount} unidades | total Bs. ${purchaseInfo.purchaseTotal.toFixed(2)}`);

    // 4e. Efecto financiero (CREDITO o CONTADO)
    await aplicarEfectosFinancieros(compra, cuentaInfo, purchaseInfo, hqBranch);

    // 4f. Traspaso a Sucre
    const trf = await transferirCompraASucursal(purchaseInfo.productosTraspaso, hqBranch, sucreBranch, compra, purchaseInfo.purchaseShortId);
    if (trf) {
      console.log(`�  Envío ${trf.envioCodigo} → ${sucreBranch.name}: ${trf.totalUnits} unidades (status: recibido)`);
    }

    resumen.push({
      compra: compra.numero,
      proveedor: compra.proveedorNombre,
      modo: compra.tipoCompraOriginal,
      total: purchaseInfo.purchaseTotal,
      lineas: purchaseInfo.purchaseLineCount,
      unidades: purchaseInfo.purchaseItemCount,
      envioCodigo: trf?.envioCodigo || null,
    });
  }

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                       RESUMEN FINAL                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.table(resumen);
  const granTotal = resumen.reduce((s, r) => s + r.total, 0);
  const granUnidades = resumen.reduce((s, r) => s + r.unidades, 0);
  console.log(`Total facturado: Bs. ${granTotal.toFixed(2)}  |  ${granUnidades} unidades en ${resumen.length} compras`);
  if (DRY_RUN) console.log('\n⚠️  DRY-RUN: ningún dato fue escrito.');

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌  ERROR:', err.message || err);
  console.error(err.stack);
  process.exit(1);
});
