/**
 * API ROUTE: /api/stats-assistant  (v3 — Full Firestore Access)
 *
 * Fase 1: DeepSeek decide qué herramientas usar.
 * Fase 2: Se ejecutan en Firestore y DeepSeek genera la respuesta con datos reales.
 *
 * Colecciones cubiertas (13 tools):
 *   ventas, compras, compras/items, productos, movimientos,
 *   clientes, cuentas_proveedores, gastos_operativos,
 *   sesiones_caja, envios, cotizaciones, catalogo_maestro,
 *   + query_coleccion genérico (catch-all)
 */

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

// ── Auth ──────────────────────────────────────────────────────────────────────

async function verifyToken(req: NextRequest): Promise<string | null> {
    const h = req.headers.get('authorization') || '';
    if (!h.startsWith('Bearer ')) return null;
    try { return (await adminAuth.verifyIdToken(h.slice(7))).uid; }
    catch { return null; }
}

// ── Rate limit ────────────────────────────────────────────────────────────────

const _rl = new Map<string, number[]>();
function checkRateLimit(uid: string): boolean {
    const now = Date.now();
    const hits = (_rl.get(uid) || []).filter(t => now - t < 60_000);
    if (hits.length >= 20) return false;
    _rl.set(uid, [...hits, now]);
    return true;
}

// ── DeepSeek ──────────────────────────────────────────────────────────────────

const DS_KEY   = process.env.DEEPSEEK_API_KEY || '';
const DS_MODEL = 'deepseek-v4-flash';
const DS_URL   = 'https://api.deepseek.com/v1/chat/completions';

async function callDS(
    messages: { role: string; content: string }[],
    tools?: object[],
    opts: { maxTokens?: number; jsonMode?: boolean } = {}
): Promise<{ text: string | null; toolCalls: { name: string; args: Record<string, any> }[] }> {
    const body: Record<string, any> = {
        model: DS_MODEL, messages,
        temperature: 0.3,
        max_tokens: opts.maxTokens ?? 2000,
    };
    if (tools?.length) { body.tools = tools; body.tool_choice = 'auto'; }
    if (opts.jsonMode)  { body.response_format = { type: 'json_object' }; }

    const res = await fetch(DS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DS_KEY}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);

    const data  = await res.json();
    const msg   = data.choices?.[0]?.message;
    const calls: { name: string; args: Record<string, any> }[] = [];
    for (const tc of msg?.tool_calls || []) {
        let args: Record<string, any> = {};
        try { args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments || {}; } catch { /**/ }
        calls.push({ name: tc.function.name, args });
    }
    // Limpiar posibles code fences de markdown
    let text = msg?.content || null;
    if (text) text = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    return { text, toolCalls: calls };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDate(v: any): Date {
    if (!v) return new Date();
    if (v instanceof Timestamp) return v.toDate();
    if (v?.toDate) return v.toDate();
    return new Date(v);
}
const daysAgo  = (n: number) => new Date(Date.now() - n * 86_400_000);
const round2   = (n: number) => Math.round(n * 100) / 100;
const pct      = (num: number, den: number) => den > 0 ? +((num / den) * 100).toFixed(1) : 0;
const margen   = (ing: number, cos: number)  => pct(ing - cos, ing);
const tsFrom   = (d: Date) => Timestamp.fromDate(d);

// ── Tool Definitions ──────────────────────────────────────────────────────────

const TOOL_DEFS = [
    {
        type: 'function', function: {
            name: 'query_ventas',
            description: 'Consulta ventas a clientes. Agrupa por día/mes/producto/cliente/sucursal. Incluye ingresos, márgenes, tickets promedio.',
            parameters: { type: 'object', properties: {
                diasAtras: { type: 'number', description: 'Días hacia atrás. 0 o ausente = todo histórico.' },
                groupBy:   { type: 'string', enum: ['dia', 'mes', 'producto', 'cliente', 'sucursal'] },
                orderBy:   { type: 'string', enum: ['ingreso_desc', 'ventas_desc', 'margen_desc', 'fecha_asc', 'fecha_desc'] },
                limit:     { type: 'number', description: 'Max grupos (default 25).' },
            }, required: ['groupBy'] },
        },
    },
    {
        type: 'function', function: {
            name: 'query_compras',
            description: 'Consulta compras a proveedores. Agrupa por proveedor o mes. Inversión total, número de órdenes.',
            parameters: { type: 'object', properties: {
                diasAtras:       { type: 'number' },
                groupBy:         { type: 'string', enum: ['proveedor', 'mes'] },
                orderBy:         { type: 'string', enum: ['inversion_desc', 'compras_desc', 'fecha_asc'] },
                limit:           { type: 'number' },
                proveedorFilter: { type: 'string', description: 'Filtrar por nombre de proveedor.' },
            }, required: ['groupBy'] },
        },
    },
    {
        type: 'function', function: {
            name: 'query_compras_productos',
            description: 'Desglosa compras a proveedores por producto individual (accede a subcol. items). Cuántas unidades y cuánto se invirtió por producto.',
            parameters: { type: 'object', properties: {
                diasAtras:       { type: 'number' },
                limit:           { type: 'number' },
                orderBy:         { type: 'string', enum: ['inversion_desc', 'unidades_desc', 'nombre_asc'] },
                proveedorFilter: { type: 'string' },
            }, required: [] },
        },
    },
    {
        type: 'function', function: {
            name: 'query_stock',
            description: 'Inventario actual: stock, costo, precio, estado. Filtra por sucursal, nivel de stock, o búsqueda de producto.',
            parameters: { type: 'object', properties: {
                sucursalId: { type: 'string' },
                filter:     { type: 'string', enum: ['todos', 'sin_stock', 'stock_bajo', 'ok'] },
                busqueda:   { type: 'string' },
                orderBy:    { type: 'string', enum: ['stock_asc', 'stock_desc', 'costo_desc', 'nombre_asc'] },
                limit:      { type: 'number' },
            }, required: ['filter'] },
        },
    },
    {
        type: 'function', function: {
            name: 'query_movimientos',
            description: 'Kardex: movimientos de inventario (ENTRADA/SALIDA/AJUSTE). Análisis de rotación por producto o sucursal.',
            parameters: { type: 'object', properties: {
                sucursalId: { type: 'string' },
                tipo:       { type: 'string', enum: ['todos', 'ENTRADA', 'SALIDA', 'AJUSTE'] },
                diasAtras:  { type: 'number', description: 'Default 90.' },
                groupBy:    { type: 'string', enum: ['producto', 'tipo', 'sucursal', 'mes'] },
                limit:      { type: 'number' },
            }, required: ['tipo'] },
        },
    },
    {
        type: 'function', function: {
            name: 'query_clientes',
            description: 'Consulta clientes registrados: nombre, saldo deudor, NIT/CI, estado activo. Útil para análisis de cartera y deudores.',
            parameters: { type: 'object', properties: {
                filter:  { type: 'string', enum: ['todos', 'con_saldo', 'sin_saldo', 'activos', 'inactivos'] },
                orderBy: { type: 'string', enum: ['saldo_desc', 'nombre_asc', 'nombre_desc'] },
                limit:   { type: 'number', description: 'Default 30.' },
                busqueda:{ type: 'string', description: 'Buscar por nombre o NIT.' },
            }, required: ['filter'] },
        },
    },
    {
        type: 'function', function: {
            name: 'query_proveedores',
            description: 'Consulta proveedores/empresas y sus cuentas: saldo deudor (lo que debemos), historial de pagos.',
            parameters: { type: 'object', properties: {
                filter:  { type: 'string', enum: ['todos', 'con_deuda', 'sin_deuda'] },
                orderBy: { type: 'string', enum: ['saldo_desc', 'nombre_asc'] },
                limit:   { type: 'number' },
            }, required: ['filter'] },
        },
    },
    {
        type: 'function', function: {
            name: 'query_gastos',
            description: 'Consulta gastos operativos: alquiler, sueldos, servicios, otros. Agrupa por categoría o mes.',
            parameters: { type: 'object', properties: {
                diasAtras: { type: 'number', description: '0 o ausente = todo histórico.' },
                groupBy:   { type: 'string', enum: ['categoria', 'mes', 'sucursal'] },
                orderBy:   { type: 'string', enum: ['monto_desc', 'fecha_desc', 'fecha_asc'] },
                limit:     { type: 'number' },
            }, required: ['groupBy'] },
        },
    },
    {
        type: 'function', function: {
            name: 'query_caja',
            description: 'Consulta sesiones de caja: apertura, cierre, saldo inicial/final, diferencias de arqueo. Útil para análisis de tesorería.',
            parameters: { type: 'object', properties: {
                diasAtras:  { type: 'number', description: 'Default 30.' },
                sucursalId: { type: 'string' },
                groupBy:    { type: 'string', enum: ['dia', 'mes', 'sucursal', 'usuario'] },
                limit:      { type: 'number' },
            }, required: ['groupBy'] },
        },
    },
    {
        type: 'function', function: {
            name: 'query_envios',
            description: 'Consulta envíos/transferencias entre sucursales: estado, productos enviados, sucursal origen/destino.',
            parameters: { type: 'object', properties: {
                diasAtras:    { type: 'number' },
                status:       { type: 'string', enum: ['todos', 'PENDIENTE', 'EN_CAMINO', 'RECIBIDO', 'CANCELADO'] },
                groupBy:      { type: 'string', enum: ['estado', 'mes', 'origen', 'destino'] },
                limit:        { type: 'number' },
            }, required: ['status'] },
        },
    },
    {
        type: 'function', function: {
            name: 'query_cotizaciones',
            description: 'Consulta cotizaciones emitidas: estado, totales, tasa de conversión a venta.',
            parameters: { type: 'object', properties: {
                diasAtras: { type: 'number' },
                status:    { type: 'string', enum: ['todos', 'PENDIENTE', 'APROBADA', 'RECHAZADA', 'CONVERTIDA'] },
                groupBy:   { type: 'string', enum: ['estado', 'mes', 'cliente'] },
                limit:     { type: 'number' },
            }, required: ['status'] },
        },
    },
    {
        type: 'function', function: {
            name: 'query_catalogo',
            description: 'Consulta el catálogo maestro de productos: nombres, códigos, marcas, categorías, precios base.',
            parameters: { type: 'object', properties: {
                busqueda:  { type: 'string', description: 'Buscar por nombre, código, marca, categoría.' },
                marca:     { type: 'string' },
                categoria: { type: 'string' },
                orderBy:   { type: 'string', enum: ['nombre_asc', 'precio_desc', 'costo_desc'] },
                limit:     { type: 'number', description: 'Default 30.' },
            }, required: [] },
        },
    },
    {
        type: 'function', function: {
            name: 'query_coleccion',
            description: 'Herramienta genérica para consultar CUALQUIER colección de Firestore que no tenga una herramienta específica. Colecciones disponibles: branches, sucursales, usuarios, categorias, marcas, origenes, transportistas, cuentas_proveedores, empresas, admin_audit_log.',
            parameters: { type: 'object', properties: {
                coleccion: { type: 'string', description: 'Nombre exacto de la colección Firestore.' },
                filtros:   {
                    type: 'array',
                    description: 'Filtros opcionales.',
                    items: { type: 'object', properties: {
                        campo: { type: 'string' }, operador: { type: 'string', enum: ['==', '!=', '>', '>=', '<', '<=', 'in'] }, valor: {}
                    }, required: ['campo', 'operador', 'valor'] },
                },
                orderBy:   { type: 'string', description: 'Campo por el que ordenar.' },
                direction: { type: 'string', enum: ['asc', 'desc'] },
                limit:     { type: 'number', description: 'Max documentos (default 30, max 200).' },
            }, required: ['coleccion'] },
        },
    },
];

// ── Tool Handlers ─────────────────────────────────────────────────────────────

async function toolQueryVentas(a: Record<string, any>): Promise<string> {
    const { diasAtras, groupBy = 'mes', orderBy = 'ingreso_desc', limit = 25 } = a;
    const lim = Math.min(Number(limit) || 25, 100);
    let q: any = adminDb.collection('ventas').orderBy('fecha', 'desc');
    if (diasAtras && Number(diasAtras) > 0) q = adminDb.collection('ventas').where('fecha', '>=', tsFrom(daysAgo(Number(diasAtras)))).orderBy('fecha', 'desc');
    const snap = await q.limit(5000).get();
    if (snap.empty) return JSON.stringify({ totalRegistros: 0, mensaje: 'No hay ventas.', datos: [] });

    const map = new Map<string, { i: number; v: number; c: number; u: number }>();
    let tv = 0, ti = 0;
    for (const doc of snap.docs) {
        const v = doc.data();
        if (v.status === 'VOIDED') continue;
        const fecha = toDate(v.fecha);
        const ing = v.total || 0; tv++; ti += ing;
        const cos = (v.items || []).reduce((s: number, it: any) => it.isVoided ? s : s + (it.quantity || 0) * (it.costAtSale || 0), 0);
        if (groupBy === 'producto') {
            for (const it of v.items || []) {
                if (it.isVoided) continue;
                const k = it.productName || it.productCode || 'Sin nombre';
                const e = map.get(k) || { i: 0, v: 0, c: 0, u: 0 };
                e.u += it.quantity || 0; e.i += it.subtotal || 0; e.c += (it.quantity || 0) * (it.costAtSale || 0); e.v++;
                map.set(k, e);
            }
        } else {
            const key = groupBy === 'dia' ? fecha.toISOString().slice(0, 10)
                : groupBy === 'mes'      ? fecha.toISOString().slice(0, 7)
                : groupBy === 'sucursal' ? (v.branchId || 'N/A')
                : (v.cliente?.nombre || v.cliente?.razonSocial || 'Particular').trim();
            const e = map.get(key) || { i: 0, v: 0, c: 0, u: 0 };
            e.i += ing; e.v++; e.c += cos; map.set(key, e);
        }
    }
    let datos = Array.from(map.entries()).map(([grupo, e]) => ({
        grupo, ventas: groupBy === 'producto' ? e.u : e.v,
        ingreso: round2(e.i), costo: round2(e.c), margen: margen(e.i, e.c),
    }));
    if (orderBy === 'ventas_desc')     datos.sort((a, b) => b.ventas  - a.ventas);
    else if (orderBy === 'margen_desc') datos.sort((a, b) => b.margen  - a.margen);
    else if (orderBy === 'fecha_asc')   datos.sort((a, b) => a.grupo.localeCompare(b.grupo));
    else if (orderBy === 'fecha_desc')  datos.sort((a, b) => b.grupo.localeCompare(a.grupo));
    else datos.sort((a, b) => b.ingreso - a.ingreso);
    return JSON.stringify({ totalRegistros: tv, totalIngreso: round2(ti), agrupacion: groupBy, datos: datos.slice(0, lim) });
}

async function toolQueryCompras(a: Record<string, any>): Promise<string> {
    const { diasAtras, groupBy = 'proveedor', orderBy = 'inversion_desc', limit = 25, proveedorFilter } = a;
    const lim = Math.min(Number(limit) || 25, 100);
    let q: any = adminDb.collection('compras').orderBy('date', 'desc');
    if (diasAtras && Number(diasAtras) > 0) q = adminDb.collection('compras').where('date', '>=', tsFrom(daysAgo(Number(diasAtras)))).orderBy('date', 'desc');
    const snap = await q.limit(2000).get();
    if (snap.empty) return JSON.stringify({ totalRegistros: 0, mensaje: 'No hay compras.', datos: [] });

    const map = new Map<string, { inv: number; n: number; items: number }>();
    let ti = 0;
    for (const doc of snap.docs) {
        const c = doc.data();
        const prov = c.supplierName || c.empresaNombre || 'Sin proveedor';
        if (proveedorFilter && !prov.toLowerCase().includes(proveedorFilter.toLowerCase())) continue;
        const total = c.total || 0; ti += total;
        const key = groupBy === 'mes' ? toDate(c.date || c.fecha).toISOString().slice(0, 7) : prov;
        const e = map.get(key) || { inv: 0, n: 0, items: 0 };
        e.inv += total; e.n++; e.items += c.itemCount || 0; map.set(key, e);
    }
    let datos = Array.from(map.entries()).map(([grupo, e]) => ({ grupo, compras: e.n, items: e.items, inversion: round2(e.inv) }));
    if (orderBy === 'compras_desc') datos.sort((a, b) => b.compras   - a.compras);
    else if (orderBy === 'fecha_asc') datos.sort((a, b) => a.grupo.localeCompare(b.grupo));
    else datos.sort((a, b) => b.inversion - a.inversion);
    return JSON.stringify({ totalRegistros: snap.size, totalInversion: round2(ti), agrupacion: groupBy, datos: datos.slice(0, lim) });
}

async function toolQueryComprasProductos(a: Record<string, any>): Promise<string> {
    const { diasAtras, limit = 30, orderBy = 'inversion_desc', proveedorFilter } = a;
    const lim = Math.min(Number(limit) || 30, 100);
    let q: any = adminDb.collection('compras').orderBy('date', 'desc');
    if (diasAtras && Number(diasAtras) > 0) q = adminDb.collection('compras').where('date', '>=', tsFrom(daysAgo(Number(diasAtras)))).orderBy('date', 'desc');
    const comprasSnap = await q.limit(500).get();
    if (comprasSnap.empty) return JSON.stringify({ mensaje: 'No hay compras.', datos: [] });

    const prodMap = new Map<string, { nombre: string; codigo: string; u: number; inv: number; provs: Set<string> }>();
    await Promise.all(comprasSnap.docs.map(async (cd: any) => {
        const c = cd.data();
        const prov = c.supplierName || c.empresaNombre || 'Sin proveedor';
        if (proveedorFilter && !prov.toLowerCase().includes(proveedorFilter.toLowerCase())) return;
        const itemsSnap = await cd.ref.collection('items').get();
        for (const id of itemsSnap.docs) {
            const it = id.data();
            const key = it.productId || it.productCode || it.productName || 'desconocido';
            const qty = it.quantity || 0;
            const total = it.subtotal || round2(qty * (it.cost || it.unitCost || 0));
            const e = prodMap.get(key) || { nombre: it.productName || 'Sin nombre', codigo: it.productCode || '', u: 0, inv: 0, provs: new Set() };
            e.u += qty; e.inv += total; e.provs.add(prov); prodMap.set(key, e);
        }
    }));
    let datos = Array.from(prodMap.values()).map(p => ({ nombre: p.nombre, codigo: p.codigo, unidades: p.u, inversion: round2(p.inv), proveedores: [...p.provs].join(', ') }));
    if (orderBy === 'unidades_desc') datos.sort((a, b) => b.unidades  - a.unidades);
    else if (orderBy === 'nombre_asc')   datos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    else datos.sort((a, b) => b.inversion - a.inversion);
    return JSON.stringify({ totalComprasAnalizadas: comprasSnap.size, datos: datos.slice(0, lim) });
}

async function toolQueryStock(a: Record<string, any>): Promise<string> {
    const { sucursalId, filter = 'todos', busqueda, orderBy = 'stock_asc', limit = 30 } = a;
    const lim = Math.min(Number(limit) || 30, 100);
    let q: any = adminDb.collection('productos').where('isActive', '==', true);
    if (sucursalId) q = q.where('branchId', '==', sucursalId);
    const snap = await q.limit(5000).get();
    if (snap.empty) return JSON.stringify({ totalProductos: 0, datos: [] });

    let rows = snap.docs.map((d: any) => {
        const p = d.data();
        return { nombre: p.nombre || 'Sin nombre', codigo: p.codigoFabrica || p.codigoOE || '', marca: p.marca || '', stock: p.stock || 0, minStock: p.minStock || 0, costo: p.costo || 0, sucursal: p.branchId || '' };
    });
    if (filter === 'sin_stock')  rows = rows.filter((r: any) => r.stock <= 0);
    if (filter === 'stock_bajo') rows = rows.filter((r: any) => r.stock > 0 && r.stock <= r.minStock);
    if (filter === 'ok')         rows = rows.filter((r: any) => r.stock > r.minStock);
    if (busqueda) { const q2 = busqueda.toLowerCase(); rows = rows.filter((r: any) => r.nombre.toLowerCase().includes(q2) || r.codigo.toLowerCase().includes(q2) || r.marca.toLowerCase().includes(q2)); }
    if (orderBy === 'stock_desc')  rows.sort((a: any, b: any) => b.stock - a.stock);
    else if (orderBy === 'costo_desc')  rows.sort((a: any, b: any) => b.costo - a.costo);
    else if (orderBy === 'nombre_asc')  rows.sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
    else rows.sort((a: any, b: any) => a.stock - b.stock);
    return JSON.stringify({ totalProductos: snap.size, totalConFiltro: rows.length, filtro: filter, datos: rows.slice(0, lim) });
}

async function toolQueryMovimientos(a: Record<string, any>): Promise<string> {
    const { sucursalId, tipo = 'todos', diasAtras = 90, groupBy = 'producto', limit = 30 } = a;
    const lim = Math.min(Number(limit) || 30, 100); const dias = Number(diasAtras) || 90;
    const from = tsFrom(daysAgo(dias));
    let q: any = adminDb.collection('movimientos').where('date', '>=', from).orderBy('date', 'desc');
    if (sucursalId) q = adminDb.collection('movimientos').where('branchId', '==', sucursalId).where('date', '>=', from).orderBy('date', 'desc');
    const snap = await q.limit(5000).get();
    if (snap.empty) return JSON.stringify({ totalMovimientos: 0, mensaje: 'Sin movimientos en ese período.', datos: [] });

    const map = new Map<string, { ent: number; sal: number; aj: number }>();
    for (const doc of snap.docs) {
        const m = doc.data();
        if (tipo !== 'todos' && m.type !== tipo) continue;
        const key = groupBy === 'tipo' ? (m.type || 'OTROS')
            : groupBy === 'sucursal' ? (m.branchId || 'N/A')
            : groupBy === 'mes'      ? toDate(m.date).toISOString().slice(0, 7)
            : (m.productName || m.masterId || m.productId || 'Sin nombre');
        const qty = Math.abs(m.quantity || 0);
        const e = map.get(key) || { ent: 0, sal: 0, aj: 0 };
        if (['ENTRADA','TRASP_ENTRADA','CARGA_INICIAL','REPOSICION'].includes(m.type)) e.ent += qty;
        else if (['SALIDA','TRASP_SALIDA'].includes(m.type)) e.sal += qty;
        else e.aj += qty;
        map.set(key, e);
    }
    const datos = Array.from(map.entries()).map(([grupo, e]) => ({ grupo, entradas: e.ent, salidas: e.sal, ajustes: e.aj, rotacion: pct(e.sal, e.ent) }))
        .sort((a, b) => (b.entradas + b.salidas) - (a.entradas + a.salidas)).slice(0, lim);
    return JSON.stringify({ totalMovimientos: snap.size, diasAnalizados: dias, agrupacion: groupBy, datos });
}

async function toolQueryClientes(a: Record<string, any>): Promise<string> {
    const { filter = 'todos', orderBy = 'saldo_desc', limit = 30, busqueda } = a;
    const lim = Math.min(Number(limit) || 30, 100);
    let q: any = adminDb.collection('clientes');
    if (filter === 'activos'  || filter === 'con_saldo' || filter === 'sin_saldo') q = q.where('isActive', '==', true);
    if (filter === 'inactivos') q = q.where('isActive', '==', false);
    const snap = await q.limit(2000).get();
    if (snap.empty) return JSON.stringify({ total: 0, datos: [] });

    let rows = snap.docs.map((d: any) => {
        const c = d.data();
        return { nombre: c.nombre || c.razonSocial || 'Sin nombre', nit: c.nit || c.ci || '', saldo: c.saldo || 0, credito: c.creditoDisponible || c.limiteCredito || 0, activo: c.isActive !== false };
    });
    if (filter === 'con_saldo') rows = rows.filter((r: any) => r.saldo > 0);
    if (filter === 'sin_saldo') rows = rows.filter((r: any) => r.saldo <= 0);
    if (busqueda) { const b = busqueda.toLowerCase(); rows = rows.filter((r: any) => r.nombre.toLowerCase().includes(b) || r.nit.toLowerCase().includes(b)); }
    if (orderBy === 'nombre_asc')  rows.sort((a: any, b: any) =>  a.nombre.localeCompare(b.nombre));
    else if (orderBy === 'nombre_desc') rows.sort((a: any, b: any) => b.nombre.localeCompare(a.nombre));
    else rows.sort((a: any, b: any) => b.saldo - a.saldo);
    const totalSaldo = rows.reduce((s: number, r: any) => s + r.saldo, 0);
    return JSON.stringify({ total: snap.size, totalSaldo: round2(totalSaldo), filtro: filter, datos: rows.slice(0, lim).map((r: any) => ({ ...r, saldo: round2(r.saldo), credito: round2(r.credito) })) });
}

async function toolQueryProveedores(a: Record<string, any>): Promise<string> {
    const { filter = 'todos', orderBy = 'saldo_desc', limit = 30 } = a;
    const lim = Math.min(Number(limit) || 30, 100);
    const snap = await adminDb.collection('cuentas_proveedores').limit(500).get();
    if (snap.empty) return JSON.stringify({ total: 0, datos: [] });

    let rows = snap.docs.map((d: any) => {
        const c = d.data();
        return { nombre: c.empresaNombre || c.razonSocial || c.alias || 'Sin nombre', saldo: c.saldo || 0, limiteCredito: c.limiteCredito || 0, activo: c.isActive !== false };
    });
    if (filter === 'con_deuda') rows = rows.filter((r: any) => r.saldo > 0);
    if (filter === 'sin_deuda') rows = rows.filter((r: any) => r.saldo <= 0);
    if (orderBy === 'nombre_asc') rows.sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
    else rows.sort((a: any, b: any) => b.saldo - a.saldo);
    const totalDeuda = rows.reduce((s: number, r: any) => s + r.saldo, 0);
    return JSON.stringify({ total: snap.size, totalDeuda: round2(totalDeuda), datos: rows.slice(0, lim).map((r: any) => ({ ...r, saldo: round2(r.saldo) })) });
}

async function toolQueryGastos(a: Record<string, any>): Promise<string> {
    const { diasAtras, groupBy = 'categoria', orderBy = 'monto_desc', limit = 30 } = a;
    const lim = Math.min(Number(limit) || 30, 100);
    let q: any = adminDb.collection('gastos_operativos').orderBy('fecha', 'desc');
    if (diasAtras && Number(diasAtras) > 0) q = adminDb.collection('gastos_operativos').where('fecha', '>=', tsFrom(daysAgo(Number(diasAtras)))).orderBy('fecha', 'desc');
    const snap = await q.limit(2000).get();
    if (snap.empty) return JSON.stringify({ total: 0, totalMonto: 0, mensaje: 'No hay gastos registrados.', datos: [] });

    const map = new Map<string, { monto: number; n: number }>();
    let totalMonto = 0;
    for (const doc of snap.docs) {
        const g = doc.data();
        const monto = g.amount || g.monto || g.total || 0;
        totalMonto += monto;
        const key = groupBy === 'mes'      ? toDate(g.fecha || g.date || g.createdAt).toISOString().slice(0, 7)
                  : groupBy === 'sucursal' ? (g.branchId || 'N/A')
                  : (g.category || g.categoria || 'Sin categoría');
        const e = map.get(key) || { monto: 0, n: 0 };
        e.monto += monto; e.n++; map.set(key, e);
    }
    let datos = Array.from(map.entries()).map(([grupo, e]) => ({ grupo, gastos: e.n, monto: round2(e.monto) }));
    if (orderBy === 'fecha_asc')  datos.sort((a, b) => a.grupo.localeCompare(b.grupo));
    else if (orderBy === 'fecha_desc') datos.sort((a, b) => b.grupo.localeCompare(a.grupo));
    else datos.sort((a, b) => b.monto - a.monto);
    return JSON.stringify({ totalRegistros: snap.size, totalMonto: round2(totalMonto), agrupacion: groupBy, datos: datos.slice(0, lim) });
}

async function toolQueryCaja(a: Record<string, any>): Promise<string> {
    const { diasAtras = 30, sucursalId, groupBy = 'dia', limit = 30 } = a;
    const lim = Math.min(Number(limit) || 30, 100); const dias = Number(diasAtras) || 30;
    const from = tsFrom(daysAgo(dias));
    let q: any = adminDb.collection('sesiones_caja').where('openedAt', '>=', from).orderBy('openedAt', 'desc');
    if (sucursalId) q = adminDb.collection('sesiones_caja').where('branchId', '==', sucursalId).where('openedAt', '>=', from).orderBy('openedAt', 'desc');
    const snap = await q.limit(500).get();
    if (snap.empty) return JSON.stringify({ total: 0, mensaje: 'No hay sesiones de caja.', datos: [] });

    const map = new Map<string, { sesiones: number; ventas: number; diferencia: number; ingresoTotal: number }>();
    for (const doc of snap.docs) {
        const s = doc.data();
        const key = groupBy === 'mes'      ? toDate(s.openedAt).toISOString().slice(0, 7)
                  : groupBy === 'sucursal' ? (s.branchId || 'N/A')
                  : groupBy === 'usuario'  ? (s.userName || s.userId || 'N/A')
                  : toDate(s.openedAt).toISOString().slice(0, 10);
        const e = map.get(key) || { sesiones: 0, ventas: 0, diferencia: 0, ingresoTotal: 0 };
        e.sesiones++;
        e.ventas       += s.totalSales || s.totalVentas || 0;
        e.diferencia   += (s.finalAmount || 0) - (s.expectedAmount || s.totalSales || 0);
        e.ingresoTotal += s.finalAmount || s.totalSales || 0;
        map.set(key, e);
    }
    const datos = Array.from(map.entries()).map(([grupo, e]) => ({ grupo, sesiones: e.sesiones, ventas: round2(e.ventas), diferencia: round2(e.diferencia), ingresoTotal: round2(e.ingresoTotal) }))
        .sort((a, b) => b.grupo.localeCompare(a.grupo)).slice(0, lim);
    return JSON.stringify({ totalSesiones: snap.size, agrupacion: groupBy, datos });
}

async function toolQueryEnvios(a: Record<string, any>): Promise<string> {
    const { diasAtras, status = 'todos', groupBy = 'estado', limit = 30 } = a;
    const lim = Math.min(Number(limit) || 30, 100);
    let q: any = adminDb.collection('envios').orderBy('createdAt', 'desc');
    if (diasAtras && Number(diasAtras) > 0) q = adminDb.collection('envios').where('createdAt', '>=', tsFrom(daysAgo(Number(diasAtras)))).orderBy('createdAt', 'desc');
    const snap = await q.limit(1000).get();
    if (snap.empty) return JSON.stringify({ total: 0, mensaje: 'No hay envíos registrados.', datos: [] });

    const map = new Map<string, { n: number; unidades: number }>();
    for (const doc of snap.docs) {
        const e = doc.data();
        if (status !== 'todos' && e.status !== status) continue;
        const key = groupBy === 'mes'     ? toDate(e.createdAt).toISOString().slice(0, 7)
                  : groupBy === 'origen'  ? (e.fromBranchName || e.fromBranchId || 'N/A')
                  : groupBy === 'destino' ? (e.toBranchName   || e.toBranchId   || 'N/A')
                  : (e.status || 'N/A');
        const entry = map.get(key) || { n: 0, unidades: 0 };
        entry.n++; entry.unidades += e.totalUnidades || e.totalUnitsEnviadas || 0; map.set(key, entry);
    }
    const datos = Array.from(map.entries()).map(([grupo, e]) => ({ grupo, envios: e.n, unidades: e.unidades }))
        .sort((a, b) => b.envios - a.envios).slice(0, lim);
    return JSON.stringify({ totalRegistros: snap.size, agrupacion: groupBy, filtroEstado: status, datos });
}

async function toolQueryCotizaciones(a: Record<string, any>): Promise<string> {
    const { diasAtras, status = 'todos', groupBy = 'estado', limit = 30 } = a;
    const lim = Math.min(Number(limit) || 30, 100);
    let q: any = adminDb.collection('cotizaciones').orderBy('createdAt', 'desc');
    if (diasAtras && Number(diasAtras) > 0) q = adminDb.collection('cotizaciones').where('createdAt', '>=', tsFrom(daysAgo(Number(diasAtras)))).orderBy('createdAt', 'desc');
    const snap = await q.limit(2000).get();
    if (snap.empty) return JSON.stringify({ total: 0, mensaje: 'No hay cotizaciones.', datos: [] });

    const map = new Map<string, { n: number; total: number; convertidas: number }>();
    for (const doc of snap.docs) {
        const c = doc.data();
        if (status !== 'todos' && c.status !== status) continue;
        const key = groupBy === 'mes'     ? toDate(c.createdAt).toISOString().slice(0, 7)
                  : groupBy === 'cliente' ? (c.cliente?.nombre || c.cliente?.razonSocial || 'Particular')
                  : (c.status || 'N/A');
        const e = map.get(key) || { n: 0, total: 0, convertidas: 0 };
        e.n++; e.total += c.total || 0;
        if (c.status === 'CONVERTIDA') e.convertidas++;
        map.set(key, e);
    }
    const datos = Array.from(map.entries()).map(([grupo, e]) => ({ grupo, cotizaciones: e.n, total: round2(e.total), convertidas: e.convertidas, tasaConversion: pct(e.convertidas, e.n) }))
        .sort((a, b) => b.total - a.total).slice(0, lim);
    return JSON.stringify({ totalRegistros: snap.size, agrupacion: groupBy, datos });
}

async function toolQueryCatalogo(a: Record<string, any>): Promise<string> {
    const { busqueda, marca, categoria, orderBy = 'nombre_asc', limit = 30 } = a;
    const lim = Math.min(Number(limit) || 30, 100);
    let q: any = adminDb.collection('catalogo_maestro');
    if (marca)     q = q.where('marca',     '==', marca);
    if (categoria) q = q.where('categoria', '==', categoria);
    const snap = await q.limit(5000).get();
    if (snap.empty) return JSON.stringify({ total: 0, datos: [] });

    let rows = snap.docs.map((d: any) => {
        const p = d.data();
        return { nombre: p.nombre || 'Sin nombre', codigoFabrica: p.codigoFabrica || '', codigoOE: p.codigoOE || '', marca: p.marca || '', categoria: p.categoria || '', costo: p.costoBase || 0, precioConFactura: p.precioConFactura || 0, precioSinFactura: p.precioSinFactura || 0 };
    });
    if (busqueda) { const b = busqueda.toLowerCase(); rows = rows.filter((r: any) => r.nombre.toLowerCase().includes(b) || r.codigoFabrica.toLowerCase().includes(b) || r.codigoOE.toLowerCase().includes(b) || r.marca.toLowerCase().includes(b)); }
    if (orderBy === 'precio_desc') rows.sort((a: any, b: any) => b.precioConFactura - a.precioConFactura);
    else if (orderBy === 'costo_desc')  rows.sort((a: any, b: any) => b.costo - a.costo);
    else rows.sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
    return JSON.stringify({ totalEnCatalogo: snap.size, datos: rows.slice(0, lim) });
}

async function toolQueryColeccion(a: Record<string, any>): Promise<string> {
    const { coleccion, filtros = [], orderBy, direction = 'desc', limit = 30 } = a;
    const lim = Math.min(Number(limit) || 30, 200);
    const BLOCKED = ['users', 'roles', 'chat_audit', 'admin_audit_log'];
    if (BLOCKED.includes(coleccion)) return `Acceso restringido a la colección "${coleccion}".`;

    let q: any = adminDb.collection(coleccion);
    for (const f of (filtros || [])) {
        try { q = q.where(f.campo, f.operador, f.valor); } catch { /* ignorar filtro inválido */ }
    }
    if (orderBy) { try { q = q.orderBy(orderBy, direction); } catch { /**/ } }
    const snap = await q.limit(lim).get();
    if (snap.empty) return JSON.stringify({ coleccion, total: 0, datos: [] });

    const datos = snap.docs.map((d: any) => ({ _id: d.id, ...d.data() }));
    // Serializar Timestamps
    const serialized = JSON.parse(JSON.stringify(datos, (_, v) => {
        if (v instanceof Timestamp) return v.toDate().toISOString();
        if (v?.seconds && v?.nanoseconds) return new Date(v.seconds * 1000).toISOString();
        return v;
    }));
    return JSON.stringify({ coleccion, total: snap.size, datos: serialized });
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

const HANDLERS: Record<string, (a: Record<string, any>) => Promise<string>> = {
    query_ventas:            toolQueryVentas,
    query_compras:           toolQueryCompras,
    query_compras_productos: toolQueryComprasProductos,
    query_stock:             toolQueryStock,
    query_movimientos:       toolQueryMovimientos,
    query_clientes:          toolQueryClientes,
    query_proveedores:       toolQueryProveedores,
    query_gastos:            toolQueryGastos,
    query_caja:              toolQueryCaja,
    query_envios:            toolQueryEnvios,
    query_cotizaciones:      toolQueryCotizaciones,
    query_catalogo:          toolQueryCatalogo,
    query_coleccion:         toolQueryColeccion,
};

// ── System prompts ────────────────────────────────────────────────────────────

const PHASE1_SYS = `Eres un analista de datos para Renotech, tienda boliviana de repuestos automotrices.
Tienes acceso a TODA la base de datos de Firestore mediante herramientas.
IMPORTANTE: "compras" = compras a proveedores. "ventas" = ventas a clientes (puede estar vacía).
Fecha actual: ${new Date().toISOString().slice(0, 10)}.
Usa las herramientas necesarias para responder con datos reales. Puedes llamar varias a la vez.`;

const PHASE2_SYS = `Eres un asistente de estadísticas para Renotech. Responde en español.
Responde SOLO con JSON válido (sin markdown, sin texto fuera del JSON):
{
  "message": "respuesta conversacional clara con datos concretos en Bs. (2-4 oraciones)",
  "data": {
    "type": "table"|"chart"|"metric"|"list",
    "title": "titulo descriptivo",
    // table:  "headers": string[], "rows": (string|number)[][]
    // chart:  "chartType": "bar"|"line"|"pie", "chartData": [{"name":"...","value":N}], "chartKeys": ["value"]
    // metric: "value": string
    // list:   "items": string[]
  }
}
Omite "data" si no hace falta visualización. Nunca inventes cifras. Usa Bs. para montos bolivianos.`;

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const uid = await verifyToken(req);
    if (!uid) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (!checkRateLimit(uid)) return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429 });

    let body: { message: string; history?: any[] };
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }); }

    const { message, history = [] } = body;
    if (message === '__warm__') return NextResponse.json({ ok: true });
    if (!message?.trim()) return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 });
    if (!DS_KEY) return NextResponse.json({ message: 'Sin API key de DeepSeek.', data: null });

    try {
        // Phase 1 — detectar herramientas
        const p1 = await callDS(
            [
                { role: 'system', content: PHASE1_SYS },
                ...history.slice(-6).map((m: any) => ({ role: m.role, content: m.content })),
                { role: 'user', content: message },
            ],
            TOOL_DEFS,
            { maxTokens: 10000 }
        );

        // Ejecutar herramientas en paralelo
        const toolResults: string[] = [];
        if (p1.toolCalls.length > 0) {
            const results = await Promise.all(p1.toolCalls.map(async tc => {
                const h = HANDLERS[tc.name];
                if (!h) return `[${tc.name}]: herramienta no encontrada`;
                try   { return `[${tc.name} args=${JSON.stringify(tc.args)}]:\n${await h(tc.args)}`; }
                catch (e: any) { return `[${tc.name}]: Error — ${e.message}`; }
            }));
            toolResults.push(...results);
        } else if (p1.text) {
            toolResults.push(`[respuesta_directa]:\n${p1.text}`);
        }

        // Phase 2 — generar respuesta final con datos reales
        const dataSec = toolResults.length > 0
            ? `\n\n═══ DATOS OBTENIDOS DE FIRESTORE ═══\n${toolResults.join('\n\n')}\n═══ FIN DATOS ═══`
            : '';

        const p2 = await callDS(
            [
                { role: 'system', content: PHASE2_SYS + dataSec },
                ...history.slice(-6).map((m: any) => ({ role: m.role, content: m.content })),
                { role: 'user', content: message },
            ],
            undefined,
            { maxTokens: 50000, jsonMode: true }
        );

        let parsed: { message?: string; data?: any } = {};
        try {
            parsed = JSON.parse(p2.text || '{}');
        } catch {
            // Intento de recuperación: extraer campos con regex
            const msgMatch = p2.text?.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            parsed = { message: msgMatch?.[1] || p2.text?.slice(0, 500) || 'Sin respuesta.' };
        }

        return NextResponse.json({ message: parsed.message || 'Sin respuesta.', data: parsed.data ?? null });

    } catch (err: any) {
        console.error('[stats-assistant]', err);
        return NextResponse.json({ error: 'Error interno: ' + (err.message || '') }, { status: 500 });
    }
}
