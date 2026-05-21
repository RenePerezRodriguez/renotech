import { adminDb } from '@/lib/firebase-admin';
import { parseDateExpression, rangeToDateObjects, todayBO } from './dateParser';
import { runBqQuery, formatBqResult } from './bigquery';
import { z } from 'zod';

// ─── Branch name cache (TTL 10 min) ─────────────────────────────────────────

const BRANCH_CACHE_TTL = 10 * 60 * 1000;

interface BranchCacheEntry { name: string; cachedAt: number; }
const branchNameCache = new Map<string, BranchCacheEntry>();

export async function resolveBranchName(branchId: string): Promise<string> {
  const now = Date.now();
  const entry = branchNameCache.get(branchId);
  if (entry && now - entry.cachedAt < BRANCH_CACHE_TTL) return entry.name;

  try {
    const doc = await adminDb.collection('branches').doc(branchId).get();
    if (doc.exists) {
      const name = doc.data()?.name || doc.data()?.nombre || branchId;
      branchNameCache.set(branchId, { name, cachedAt: now });
      return name;
    }
  } catch { /* silencioso */ }

  branchNameCache.set(branchId, { name: branchId, cachedAt: now });
  return branchId;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export type ToolHandler = (args: Record<string, unknown>, context: ToolContext) => Promise<string>;

export interface ToolContext {
  branchId: string | null;
  uid: string;
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_product_stock',
      description: 'Consulta el stock actual de un producto en una sucursal específica o en todas. Usa esta herramienta cuando el usuario pregunte por existencias, disponibilidad o stock de algún producto.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Nombre, código o parte del nombre del producto a buscar.',
          },
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, se busca en la sucursal actual del usuario.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_daily_sales_summary',
      description: 'Obtiene el resumen de ventas de un día o período para una sucursal. Usa esta herramienta cuando el usuario pregunte por ventas del día, de ayer, de una fecha concreta, o de un rango como "esta semana", "el mes pasado", "últimos 30 días".',
      parameters: {
        type: 'object',
        properties: {
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, se usa la sucursal actual del usuario.',
          },
          date: {
            type: 'string',
            description: 'Fecha exacta en formato YYYY-MM-DD. Omitir si se usa dateExpression.',
          },
          dateExpression: {
            type: 'string',
            description: 'Expresión de fecha en lenguaje natural: "hoy", "ayer", "esta semana", "la semana pasada", "este mes", "el mes pasado", "últimos 7 días", "en enero", etc.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cash_status',
      description: 'Obtiene el estado actual de la caja: sesión abierta, saldo, ingresos y egresos del día. Usa esta herramienta cuando el usuario pregunte sobre caja, saldo, arqueo o estado de tesorería.',
      parameters: {
        type: 'object',
        properties: {
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, se usa la sucursal actual del usuario.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pending_transfers',
      description: 'Obtiene los envíos o pedidos pendientes de una sucursal (por recibir o por enviar). Usa esta herramienta cuando el usuario pregunte sobre envíos pendientes, transferencias en tránsito, o pedidos sin recibir.',
      parameters: {
        type: 'object',
        properties: {
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, se usa la sucursal actual del usuario.',
          },
          direction: {
            type: 'string',
            enum: ['incoming', 'outgoing', 'both'],
            description: 'Dirección de los envíos: incoming (por recibir), outgoing (por enviar), both (ambos).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_low_stock_products',
      description: 'Obtiene la lista de productos con stock bajo (por debajo del mínimo) en una sucursal. Usa esta herramienta cuando el usuario pregunte por productos agotados, stock bajo, o qué hace falta comprar.',
      parameters: {
        type: 'object',
        properties: {
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, se usa la sucursal actual del usuario.',
          },
          limit: {
            type: 'string',
            description: 'Número máximo de productos a retornar. Por defecto 10.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_counts',
      description: 'Cuenta cuántos productos hay en total: en el catálogo maestro, activos por sucursal, etc. Usa esta herramienta cuando el usuario pregunte CUÁNTOS productos hay, el total de productos, o cifras generales de inventario SIN especificar un producto concreto.',
      parameters: {
        type: 'object',
        properties: {
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, se cuentan TODOS los productos del sistema.',
          },
          scope: {
            type: 'string',
            enum: ['all', 'catalog', 'branch', 'active', 'inactive'],
            description: 'Alcance del conteo: all (todo), catalog (solo catálogo maestro), branch (solo sucursal), active (solo activos), inactive (solo inactivos).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_branch_list',
      description: 'Obtiene la lista de sucursales disponibles con sus nombres e IDs. Usa esta herramienta cuando el usuario pregunte por sucursales, sedes, o necesite saber qué sucursales existen.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_config',
      description: 'Lee la configuración general del sistema: razón social, NIT, dirección, tipo de cambio USD→BOB y moneda. Úsala cuando el usuario pregunte cuál es el tipo de cambio actual, cuál es el NIT de la empresa, o datos de contacto e identidad del negocio.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_list',
      description: 'Consulta los usuarios registrados en el sistema con su rol, sucursal y estado de acceso. Úsala cuando el usuario pregunte cuántos colaboradores hay, qué roles existen, quién tiene acceso suspendido, cuántos gerentes hay, o quién tiene acceso a todas las sucursales.',
      parameters: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            enum: ['GERENTE', 'ENCARGADO', 'VENDEDOR'],
            description: 'Filtrar por rol específico.',
          },
          status: {
            type: 'string',
            enum: ['active', 'suspended'],
            description: 'Filtrar por estado: active = usuarios activos, suspended = acceso suspendido.',
          },
          branchId: {
            type: 'string',
            description: 'Filtrar por sucursal específica.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_entity_counts',
      description: 'Cuenta clientes, proveedores y transportistas registrados en el sistema. Usa esta herramienta cuando el usuario pregunte cuántos clientes/proveedores hay, o cifras generales de entidades.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['clients', 'suppliers', 'transporters', 'all'],
            description: 'Tipo de entidad a contar: clients, suppliers, transporters, o all para todas.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weekly_sales',
      description: 'Obtiene el resumen de ventas día a día para un período. Usa esta herramienta para ventas de la semana, cómo vamos esta semana, el mes pasado, los últimos N días, tendencia, comparativa de días, o cualquier período con detalle diario.',
      parameters: {
        type: 'object',
        properties: {
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, se usa la sucursal actual del usuario.',
          },
          period: {
            type: 'string',
            description: 'Período en lenguaje natural: "esta semana", "la semana pasada", "este mes", "el mes pasado", "últimos 30 días", "en enero", etc. Si se omite, se usan los últimos 7 días.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_products',
      description: 'Obtiene los productos más vendidos en los últimos 7 días. Usa esta herramienta cuando el usuario pregunte por el producto más vendido, top productos, ranking de ventas, qué se está vendiendo más, o producto estrella.',
      parameters: {
        type: 'object',
        properties: {
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, se usa la sucursal actual del usuario.',
          },
          limit: {
            type: 'string',
            description: 'Número de productos a mostrar. Por defecto 5.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_branches_sales',
      description: 'Compara el rendimiento de ventas entre todas las sucursales para un período. Usa esta herramienta cuando el usuario pregunte cómo están las sucursales, cuál sucursal vende más, comparativa entre tiendas, o rendimiento por sucursal.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            description: 'Período a comparar: "hoy", "esta semana", "este mes", "ayer", "la semana pasada", etc. Por defecto "hoy".',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_client_credits',
      description: 'Consulta clientes con crédito pendiente (deuda activa) en una sucursal. Usa esta herramienta cuando el usuario pregunte por clientes con deuda, créditos pendientes, cuentas por cobrar, o quién debe.',
      parameters: {
        type: 'object',
        properties: {
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, se usa la sucursal actual del usuario.',
          },
          limit: {
            type: 'string',
            description: 'Número máximo de clientes a mostrar. Por defecto 10.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pending_quotations',
      description: 'Consulta cotizaciones (proformas) de una sucursal. Usa esta herramienta cuando el usuario pregunte por cotizaciones pendientes, vencidas, cuántas se convirtieron en venta, tasa de conversión, o el historial de proformas.',
      parameters: {
        type: 'object',
        properties: {
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, se usa la sucursal actual del usuario.',
          },
          status: {
            type: 'string',
            description: 'Filtrar por estado: "PENDING" (en espera), "CONVERTED" (convertida a venta), "CANCELLED" (anulada), "EXPIRED" (vencida). Si no se especifica, devuelve todas.',
          },
          limit: {
            type: 'string',
            description: 'Número máximo de cotizaciones a devolver. Por defecto 15.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_transporters',
      description: 'Lista los transportistas registrados en el sistema con su información de contacto y estadísticas de uso. Usa esta herramienta cuando el usuario pregunte qué transportistas hay, el teléfono o datos de un transportista, o cuántos envíos ha hecho un transportista.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Nombre o tipo de transportista a buscar. Si no se especifica, devuelve todos.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pending_orders',
      description: 'Consulta pedidos internos de reabastecimiento entre sucursales. Usa esta herramienta cuando el usuario pregunte por pedidos pendientes, solicitudes sin despachar, pedidos en borrador, o el estado de pedidos entre sucursales.',
      parameters: {
        type: 'object',
        properties: {
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, usa la sucursal actual.',
          },
          status: {
            type: 'string',
            description: 'Estado del pedido: "borrador", "vigente" (pendiente de despacho), "despachado", "cancelado". Si no se especifica, devuelve borrador y vigente.',
          },
          direction: {
            type: 'string',
            description: '"emitidos" = pedidos que hizo esta sucursal. "entrantes" = pedidos que le llegan. "both" = ambos (por defecto).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_suppliers',
      description: 'Lista las empresas proveedoras registradas, con su saldo pendiente de pago. Usa esta herramienta cuando el usuario pregunte qué proveedores hay, cuánto se le debe a un proveedor, qué proveedores tienen saldo por pagar, o el contacto de un proveedor.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Nombre de la empresa o proveedor a buscar. Si no se especifica, devuelve todos.',
          },
          filter: {
            type: 'string',
            description: '"por_pagar" = solo proveedores con saldo positivo (deuda). "a_favor" = solo proveedores con saldo a favor. Si no se especifica, devuelve todos.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_purchases',
      description: 'Consulta las compras a proveedores registradas en el sistema. Usa esta herramienta cuando el usuario pregunte por compras recientes, últimas entradas de mercadería, compras a un proveedor específico, o el estado de compras pendientes de recepción.',
      parameters: {
        type: 'object',
        properties: {
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, usa la sucursal actual.',
          },
          limit: {
            type: 'number',
            description: 'Número máximo de compras a devolver. Por defecto 10.',
          },
          status: {
            type: 'string',
            description: 'Estado de la compra: "RECEIVED" (recibida/completada) o "PENDING" (pendiente de recepción). Si no se especifica, devuelve todas.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_treasury_accounts',
      description: 'Obtiene los saldos actuales de todas las cuentas de tesorería: cajones de efectivo, cuentas bancarias y billeteras digitales (QR). Usa esta herramienta cuando el usuario pregunte por saldos de cuentas bancarias, cuánto hay en el banco, saldo de la billetera QR, o el estado general de las cuentas del negocio.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Filtrar por tipo de cuenta: "CASH_DRAWER" (cajones/bóvedas), "BANK" (cuentas bancarias), "WALLET" (billeteras QR). Si no se especifica, devuelve todas.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_audit_alerts',
      description: 'Consulta las alertas de auditoría del sistema (anomalías, discrepancias de caja, discrepancias de traspaso, descuentos no autorizados, etc.). Úsala cuando el usuario pregunte por alertas pendientes, discrepancias activas, alertas críticas o cuántas alertas hay sin leer.',
      parameters: {
        type: 'object',
        properties: {
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, consulta todas las sucursales.',
          },
          severity: {
            type: 'string',
            enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
            description: 'Filtrar por severidad de la alerta.',
          },
          type: {
            type: 'string',
            enum: ['CASH_DISCREPANCY', 'SECURITY', 'INVENTORY_THRESHOLD', 'DISCOUNT_OVERRIDE', 'TRANSFER_DISCREPANCY', 'SHIFT_OPEN_TOO_LONG', 'EXPENSE_LARGE', 'EXPENSE_DUPLICATE'],
            description: 'Filtrar por tipo de alerta.',
          },
          onlyUnread: {
            type: 'string',
            enum: ['true', 'false'],
            description: 'Si es "true", retorna solo las alertas no leídas.',
          },
          limit: {
            type: 'string',
            description: 'Número máximo de alertas a retornar. Por defecto 20.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pending_approvals',
      description: 'Consulta las aprobaciones pendientes en el panel de gerencia: gastos operativos, anulaciones de venta, descuentos y solicitudes de cancelación de pedidos/envíos. Úsala cuando el usuario pregunte cuántas aprobaciones hay pendientes, qué gastos esperan autorización, si hay devoluciones sin aprobar, o cuántas solicitudes de cancelación están activas.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['gastos', 'devoluciones', 'descuentos', 'cancelaciones', 'todas'],
            description: 'Categoría de aprobaciones a consultar. Por defecto consulta todas.',
          },
          limit: {
            type: 'string',
            description: 'Número máximo de registros por categoría. Por defecto 10.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_kardex_movements',
      description: 'Obtiene el historial de movimientos de stock de un producto específico. Úsala cuando el usuario pregunte por los movimientos, entradas, salidas o ajustes de un producto concreto, o quiera saber cuándo fue el último movimiento, qué tipo de movimientos tuvo, o cuántas unidades entraron/salieron en un período.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Nombre, código o parte del nombre del producto a buscar.',
          },
          branchId: {
            type: 'string',
            description: 'ID de la sucursal. Si no se especifica, se usa la sucursal actual del usuario.',
          },
          limit: {
            type: 'string',
            description: 'Número máximo de movimientos a retornar. Por defecto 20.',
          },
          type: {
            type: 'string',
            enum: ['ENTRADA', 'SALIDA', 'AJUSTE', 'AJUSTE_MASIVO', 'TRASP_ENTRADA', 'TRASP_SALIDA', 'TRASP_REVERSAL', 'ANULACION', 'GARANTIA_ENTRADA', 'GARANTIA_SALIDA', 'CARGA_INICIAL', 'REPOSICION'],
            description: 'Filtrar por tipo de movimiento específico.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_sql',
      description: `Ejecuta una consulta SQL analítica contra la base de datos histórica (BigQuery).
Úsala para preguntas analíticas o de reportes que requieran agregaciones, comparativas históricas, tendencias, rankings o cruces entre colecciones.

TABLAS DISPONIBLES (usar el dataset: renotech_data):
• v_ventas — ventas (estado actual, deduplicado). Columnas: id, branch_id, total, item_count, payment_method, credit_status, client_id, client_name, credit_balance, status, created_at
• v_ventas_items — líneas de venta. Columnas: venta_id, branch_id, product_id, product_name, quantity, unit_price, subtotal, created_at
• v_catalogo — catálogo de productos. Columnas: id, nombre, codigo, categoria, precio, costo, is_active, created_at
• v_clientes — clientes. Columnas: id, nombre, ci, telefono, email, is_active, created_at

REGLAS DE SQL:
• Solo SELECT. No UPDATE, INSERT, DELETE, DROP.
• Las fechas se manejan en zona horaria de Bolivia (UTC-4). Usar: DATETIME(created_at, 'America/La_Paz')
• Para filtrar por fecha: WHERE DATE(created_at, 'America/La_Paz') BETWEEN '2026-01-01' AND '2026-01-31'
• Para mes actual: WHERE DATE_TRUNC(DATE(created_at, 'America/La_Paz'), MONTH) = DATE_TRUNC(CURRENT_DATE('America/La_Paz'), MONTH)
• Siempre incluir LIMIT. Por defecto 100 si no se especifica.`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Consulta SQL SELECT válida contra BigQuery. Usar nombres completos de tabla (renotech_data.v_ventas) o solo el nombre (v_ventas si el dataset está implícito).',
          },
          description: {
            type: 'string',
            description: 'Descripción en español de qué calcula esta consulta (para mostrar al usuario).',
          },
          maxRows: {
            type: 'number',
            description: 'Número máximo de filas a retornar. Por defecto 100.',
          },
        },
        required: ['query', 'description'],
      },
    },
  },
];

// ─── Tool Handlers ───────────────────────────────────────────────────────────

/** Normaliza texto para búsqueda: minúsculas sin tildes ni caracteres especiales. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Búsqueda fuzzy en catálogo maestro.
 * Tokeniza la query y prueba cada token en searchTags y prefijo de nombre.
 */
async function fuzzySearchCatalog(
  rawQuery: string,
  limit = 6,
): Promise<{ id: string; nombre: string; codigo: string }[]> {
  const q = normalize(rawQuery);
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);

  const found = new Map<string, { id: string; nombre: string; codigo: string; score: number }>();

  for (const token of tokens) {
    // 1) searchTags exact-contains (most reliable)
    const tagSnap = await adminDb
      .collection('catalogo_maestro')
      .where('searchTags', 'array-contains', token)
      .limit(5)
      .get();

    tagSnap.docs.forEach((doc) => {
      const prev = found.get(doc.id);
      const score = (prev?.score ?? 0) + 2;
      found.set(doc.id, {
        id: doc.id,
        nombre: doc.data().nombre ?? 'Sin nombre',
        codigo: doc.data().codigo ?? 'N/A',
        score,
      });
    });

    // 2) prefix on `nombre` (case-insensitive not supported in Firestore, so use stored lower field if available)
    const end = token.slice(0, -1) + String.fromCharCode(token.charCodeAt(token.length - 1) + 1);
    const prefixSnap = await adminDb
      .collection('catalogo_maestro')
      .where('nombre', '>=', token)
      .where('nombre', '<', end)
      .limit(4)
      .get();

    prefixSnap.docs.forEach((doc) => {
      const prev = found.get(doc.id);
      const score = (prev?.score ?? 0) + 1;
      found.set(doc.id, {
        id: doc.id,
        nombre: doc.data().nombre ?? 'Sin nombre',
        codigo: doc.data().codigo ?? 'N/A',
        score,
      });
    });
  }

  // Sort by relevance score desc, then alphabetically
  return Array.from(found.values())
    .sort((a, b) => b.score - a.score || a.nombre.localeCompare(b.nombre))
    .slice(0, limit)
    .map(({ id, nombre, codigo }) => ({ id, nombre, codigo }));
}

/**
 * Busca productos por nombre/código y retorna su stock.
 */
async function handleGetProductStock(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const rawQuery = (args.query as string || '').trim();
  const branchId = (args.branchId as string) || ctx.branchId;
  const branchName = branchId ? await resolveBranchName(branchId) : null;

  if (!rawQuery || rawQuery.length < 2) {
    return '❌ Necesito al menos 2 caracteres para buscar un producto.';
  }

  try {
    const products = await fuzzySearchCatalog(rawQuery);

    if (products.length === 0) {
      return `No encontré productos que coincidan con "${rawQuery}". Prueba con el nombre completo o el código.`;
    }

    const results: string[] = [];
    for (const prod of products) {
      let stockQty = 'N/D';
      let ubicacion = '';

      if (branchId) {
        const stockSnap = await adminDb
          .collection('productos')
          .where('masterId', '==', prod.id)
          .where('branchId', '==', branchId)
          .limit(1)
          .get();

        if (!stockSnap.empty) {
          const data = stockSnap.docs[0].data();
          stockQty = String(data.stock ?? 0);
          ubicacion = data.ubicacionFisica ? ` | ${data.ubicacionFisica}` : '';
        }
      }

      const branchLabel = branchName ?? 'Sucursal activa';
      const stockNum = parseInt(stockQty);
      const stockFlag = isNaN(stockNum) ? '' : stockNum === 0 ? ' 🔴 AGOTADO' : stockNum <= 5 ? ' 🟡 bajo' : '';
      results.push(`• **${prod.nombre}** (${prod.codigo}) — ${branchLabel}: **${stockQty} unidades**${stockFlag}${ubicacion}`);
    }

    return `📦 **Stock de "${rawQuery}"** _(tiempo real)_\n\n${results.join('\n')}`;
  } catch (error) {
    console.error('[Tool:get_product_stock] Error:', error);
    return '❌ Error al consultar el stock. Intenta de nuevo más tarde.';
  }
}

/**
 * Obtiene el resumen de ventas de un día o período.
 * Acepta fecha exacta (date) o expresión en lenguaje natural (dateExpression).
 */
async function handleGetDailySalesSummary(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const branchId = (args.branchId as string) || ctx.branchId;
  const branchName = branchId ? await resolveBranchName(branchId) : null;

  // Resolve date range
  let startDate: Date;
  let endDate: Date;
  let periodLabel: string;

  const dateExpr = args.dateExpression as string | undefined;
  const dateArg = args.date as string | undefined;

  if (dateExpr) {
    const range = parseDateExpression(dateExpr);
    if (range) {
      const obj = rangeToDateObjects(range);
      startDate = obj.start;
      endDate = obj.end;
      periodLabel = range.label;
    } else {
      const today = todayBO();
      startDate = new Date(`${today}T00:00:00-04:00`);
      endDate = new Date(`${today}T23:59:59-04:00`);
      periodLabel = 'Hoy';
    }
  } else {
    const date = dateArg || todayBO();
    startDate = new Date(`${date}T00:00:00-04:00`);
    endDate = new Date(`${date}T23:59:59-04:00`);
    periodLabel = date === todayBO() ? 'Hoy' : date;
  }

  try {
    let q = adminDb
      .collection('ventas')
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate);

    if (branchId) q = q.where('branchId', '==', branchId);

    const snapshot = await q.get();

    if (snapshot.empty) {
      return `No hay ventas registradas en el período "${periodLabel}"${branchName ? ` en ${branchName}` : ''}.`;
    }

    let totalVentas = 0;
    let totalItems = 0;
    let countEfectivo = 0;
    let countQR = 0;
    let countMixto = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      totalVentas += data.total || 0;
      totalItems += data.itemCount || 0;
      if (data.paymentMethod === 'EFECTIVO') countEfectivo++;
      else if (data.paymentMethod === 'QR') countQR++;
      else if (data.paymentMethod === 'MIXTO') countMixto++;
    });

    const moneda = 'Bs';
    return [
      `📊 **Ventas — ${periodLabel}**${branchName ? ` · ${branchName}` : ''} _(tiempo real)_`,
      '',
      `• Total: **${moneda} ${totalVentas.toFixed(2)}**`,
      `• Transacciones: **${snapshot.size}**`,
      `• Ítems vendidos: **${totalItems}**`,
      `• Ticket promedio: **${moneda} ${(totalVentas / snapshot.size).toFixed(2)}**`,
      `• Efectivo: ${countEfectivo} | QR: ${countQR} | Mixto: ${countMixto}`,
    ].join('\n');
  } catch (error) {
    console.error('[Tool:get_daily_sales_summary] Error:', error);
    return '❌ Error al consultar las ventas. Intenta de nuevo más tarde.';
  }
}

/**
 * Obtiene el estado actual de la caja.
 */
async function handleGetCashStatus(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const branchId = (args.branchId as string) || ctx.branchId;
  const branchName = branchId ? await resolveBranchName(branchId) : null;

  if (!branchId) {
    return '⚠️ Necesito saber la sucursal para consultar la caja. ¿En qué sucursal estás?';
  }

  try {
    // Buscar sesión abierta
    const sessionsSnapshot = await adminDb
      .collection('sesiones_caja')
      .where('branchId', '==', branchId)
      .where('status', '==', 'OPEN')
      .limit(1)
      .get();

    if (sessionsSnapshot.empty) {
      return `⚠️ No hay una sesión de caja **abierta** en ${branchName || branchId}. Debes abrir caja primero.`;
    }

    const session = sessionsSnapshot.docs[0].data();
    const sessionId = sessionsSnapshot.docs[0].id;

    // Contar movimientos del día
    const today = new Date().toISOString().slice(0, 10);
    const startOfDay = new Date(`${today}T00:00:00-04:00`);
    const endOfDay = new Date(`${today}T23:59:59-04:00`);

    const movementsSnapshot = await adminDb
      .collection('movimientos_caja')
      .where('sessionId', '==', sessionId)
      .where('createdAt', '>=', startOfDay)
      .where('createdAt', '<=', endOfDay)
      .get();

    let totalIngresos = 0;
    let totalEgresos = 0;

    movementsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.type === 'INGRESO') totalIngresos += data.amount || 0;
      else if (data.type === 'EGRESO') totalEgresos += data.amount || 0;
    });

    const saldoActual = (session.initialBalance || 0) + totalIngresos - totalEgresos;
    const moneda = 'Bs';

    return [
      `💰 **Estado de Caja — ${branchName || branchId}**`,
      '',
      `• Sesión: **${session.status === 'OPEN' ? 'ABIERTA ✅' : 'CERRADA'}**`,
      `• Abierta por: ${session.openedBy || 'N/D'} — ${session.openedAt ? new Date(session.openedAt.toDate()).toLocaleString('es-BO') : 'N/D'}`,
      `• Saldo inicial: **${moneda} ${(session.initialBalance || 0).toFixed(2)}**`,
      `• Ingresos del día: **${moneda} ${totalIngresos.toFixed(2)}** (${movementsSnapshot.docs.filter(d => d.data().type === 'INGRESO').length} movimientos)`,
      `• Egresos del día: **${moneda} ${totalEgresos.toFixed(2)}** (${movementsSnapshot.docs.filter(d => d.data().type === 'EGRESO').length} movimientos)`,
      `• **Saldo actual: ${moneda} ${saldoActual.toFixed(2)}**`,
    ].join('\n');
  } catch (error) {
    console.error('[Tool:get_cash_status] Error:', error);
    return '❌ Error al consultar el estado de caja. Intenta de nuevo más tarde.';
  }
}

/**
 * Obtiene envíos/pedidos pendientes.
 */
async function handleGetPendingTransfers(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const branchId = (args.branchId as string) || ctx.branchId;
  const branchName = branchId ? await resolveBranchName(branchId) : null;
  const direction = (args.direction as string) || 'both';

  if (!branchId) {
    return '⚠️ Necesito saber la sucursal para consultar los envíos pendientes.';
  }

  try {
    const results: string[] = [];

    // Envíos entrantes (hacia esta sucursal)
    if (direction === 'incoming' || direction === 'both') {
      const incomingSnapshot = await adminDb
        .collection('envios')
        .where('toBranchId', '==', branchId)
        .where('status', 'in', ['en_transito', 'preparacion'])
        .limit(10)
        .get();

      if (!incomingSnapshot.empty) {
        results.push('📥 **Por recibir:**');
        incomingSnapshot.forEach((doc) => {
          const d = doc.data();
          results.push(`• Envío #${doc.id.slice(-6)} — De: ${d.fromBranchId} — ${d.status} (${d.createdAt ? new Date(d.createdAt.toDate()).toLocaleDateString('es-BO') : 'N/D'})`);
        });
      }
    }

    // Envíos salientes (desde esta sucursal)
    if (direction === 'outgoing' || direction === 'both') {
      const outgoingSnapshot = await adminDb
        .collection('envios')
        .where('fromBranchId', '==', branchId)
        .where('status', 'in', ['preparacion'])
        .limit(10)
        .get();

      if (!outgoingSnapshot.empty) {
        if (results.length > 0) results.push('');
        results.push('📤 **Por enviar:**');
        outgoingSnapshot.forEach((doc) => {
          const d = doc.data();
          results.push(`• Envío #${doc.id.slice(-6)} — A: ${d.toBranchId} — ${d.status} (${d.createdAt ? new Date(d.createdAt.toDate()).toLocaleDateString('es-BO') : 'N/D'})`);
        });
      }
    }

    if (results.length === 0) {
      return `✅ No hay envíos pendientes para ${branchName || branchId}.`;
    }

    return results.join('\n');
  } catch (error) {
    console.error('[Tool:get_pending_transfers] Error:', error);
    return '❌ Error al consultar los envíos pendientes. Intenta de nuevo más tarde.';
  }
}

/**
 * Obtiene productos con stock bajo.
 */
async function handleGetLowStockProducts(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const branchId = (args.branchId as string) || ctx.branchId;
  const branchName = branchId ? await resolveBranchName(branchId) : null;
  const limit = parseInt(args.limit as string) || 10;

  if (!branchId) {
    return '⚠️ Necesito saber la sucursal para consultar el stock bajo.';
  }

  try {
    // Productos con stock <= minStock en la sucursal
    const snapshot = await adminDb
      .collection('productos')
      .where('branchId', '==', branchId)
      .where('isActive', '==', true)
      .limit(50)
      .get();

    if (snapshot.empty) {
      return `No hay productos registrados en ${branchName || branchId}.`;
    }

    const lowStock: { nombre: string; stock: number; minStock: number }[] = [];

    // Filtrar los que tienen stock bajo (Firestore no permite comparar dos campos en query)
    for (const doc of snapshot.docs) {
      const d = doc.data();
      if (d.stock <= (d.minStock || 5) && d.stock >= 0) {
        // Buscar nombre en catálogo
        const catDoc = await adminDb.collection('catalogo_maestro').doc(d.masterId).get();
        const nombre = catDoc.exists ? (catDoc.data()?.nombre || d.masterId) : d.masterId;
        lowStock.push({
          nombre,
          stock: d.stock,
          minStock: d.minStock || 5,
        });
      }
    }

    if (lowStock.length === 0) {
      return `✅ Todos los productos en ${branchName || branchId} tienen stock adecuado.`;
    }

    // Ordenar por más crítico primero
    lowStock.sort((a, b) => (a.stock / a.minStock) - (b.stock / b.minStock));

    const lines = lowStock.slice(0, limit).map(
      (p) => `• **${p.nombre}** — Stock: ${p.stock} / Mín: ${p.minStock} ${p.stock === 0 ? '🔴 AGOTADO' : '🟡 BAJO'}`
    );

    return [
      `⚠️ **Productos con stock bajo — ${branchName || branchId}**`,
      '',
      ...lines,
      '',
      `_Mostrando ${Math.min(limit, lowStock.length)} de ${lowStock.length} productos._`,
    ].join('\n');
  } catch (error) {
    console.error('[Tool:get_low_stock_products] Error:', error);
    return '❌ Error al consultar el stock bajo. Intenta de nuevo más tarde.';
  }
}

/**
 * Cuenta productos del sistema (catálogo, sucursal, activos, total).
 */
async function handleGetProductCounts(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const branchId = (args.branchId as string) || ctx.branchId;
  const branchName = branchId ? await resolveBranchName(branchId) : null;
  const scope = (args.scope as string) || 'all';

  try {
    // Contar catálogo maestro
    const catalogSnapshot = await adminDb.collection('catalogo_maestro').count().get();
    const totalCatalog = catalogSnapshot.data().count;

    // Contar productos en sucursal(es)
    let branchCount = 0;
    let activeCount = 0;
    let inactiveCount = 0;

    if (branchId) {
      const branchSnapshot = await adminDb
        .collection('productos')
        .where('branchId', '==', branchId)
        .count()
        .get();
      branchCount = branchSnapshot.data().count;

      const activeSnapshot = await adminDb
        .collection('productos')
        .where('branchId', '==', branchId)
        .where('isActive', '==', true)
        .count()
        .get();
      activeCount = activeSnapshot.data().count;

      inactiveCount = branchCount - activeCount;
    } else {
      const allSnapshot = await adminDb.collection('productos').count().get();
      branchCount = allSnapshot.data().count;
      activeCount = branchCount; // aproximado
    }

    if (scope === 'catalog') {
      return `📦 **${totalCatalog}** productos en el catálogo maestro.`;
    }
    if (scope === 'branch' && branchId) {
      return `📦 ${branchName || 'Sucursal ' + branchId}: **${branchCount}** productos registrados (${activeCount} activos, ${inactiveCount} inactivos).`;
    }
    if (scope === 'active' && branchId) {
      return `📦 ${branchName || 'Sucursal ' + branchId}: **${activeCount}** productos activos.`;
    }
    if (scope === 'inactive' && branchId) {
      return `📦 ${branchName || 'Sucursal ' + branchId}: **${inactiveCount}** productos inactivos.`;
    }

    // scope === 'all' (default)
    const lines = [
      `📊 **Resumen de productos**`,
      '',
      `• Catálogo maestro: **${totalCatalog}** productos únicos`,
    ];
    if (branchId) {
      lines.push(`• ${branchName || 'Sucursal ' + branchId}: **${branchCount}** registros (${activeCount} activos, ${inactiveCount} inactivos)`);
    } else {
      lines.push(`• Total en sucursales: **${branchCount}** registros`);
    }
    lines.push('', '💡 Usa el módulo **Inventario** para ver el detalle completo.');

    return lines.join('\n');
  } catch (error) {
    console.error('[Tool:get_product_counts] Error:', error);
    return '❌ Error al contar los productos. Intenta de nuevo más tarde.';
  }
}

/**
 * Lista las sucursales disponibles.
 */
async function handleGetConfig(
  _args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<string> {
  try {
    const snap = await adminDb.collection('config').doc('general_settings').get();

    if (!snap.exists) {
      return 'No se encontró configuración general del sistema.';
    }

    const d = snap.data()!;
    const lines: string[] = ['⚙️ **Configuración del sistema**', ''];

    if (d.companyName || d.branchName) {
      lines.push(`**Razón social:** ${d.companyName || d.branchName}`);
    }
    if (d.nit) lines.push(`**NIT / ID Fiscal:** ${d.nit}`);
    if (d.address) lines.push(`**Dirección:** ${d.address}`);
    if (d.city) lines.push(`**Ciudad:** ${d.city}`);
    if (d.phone) lines.push(`**Teléfono:** ${d.phone}`);
    if (d.email) lines.push(`**Email:** ${d.email}`);
    if (d.website) lines.push(`**Sitio web:** ${d.website}`);

    lines.push('');
    const rateMode = d.exchangeRateMode === 'AUTO' ? 'Automático (BCB)' : 'Manual';
    lines.push(`**Tipo de cambio USD→BOB:** ${d.exchangeRate ?? 9.30} Bs · Modo: ${rateMode}`);
    if (d.currency) lines.push(`**Moneda principal:** ${d.currency}`);

    return lines.join('\n');
  } catch (error) {
    console.error('[Tool:get_config] Error:', error);
    return '❌ Error al leer la configuración. Intenta de nuevo más tarde.';
  }
}

async function handleGetUserList(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<string> {
  const roleFilter = args.role as string | undefined;
  const statusFilter = args.status as string | undefined;
  const branchId = args.branchId as string | undefined;

  try {
    let q: FirebaseFirestore.Query = adminDb.collection('users');
    if (roleFilter) q = q.where('role', '==', roleFilter);
    if (statusFilter === 'suspended') q = q.where('disabled', '==', true);
    if (statusFilter === 'active') q = q.where('disabled', '==', false);
    if (branchId) q = q.where('branchId', '==', branchId);

    const snap = await q.get();

    if (snap.empty) {
      return `No se encontraron usuarios${roleFilter ? ` con rol ${roleFilter}` : ''}${statusFilter ? ` (${statusFilter === 'suspended' ? 'suspendidos' : 'activos'})` : ''}.`;
    }

    // Summary by role
    const byRole: Record<string, number> = {};
    let suspended = 0;
    for (const d of snap.docs) {
      const data = d.data();
      const r = (data.role as string) || 'SIN ROL';
      byRole[r] = (byRole[r] ?? 0) + 1;
      if (data.disabled) suspended++;
    }

    const roleSummary = Object.entries(byRole)
      .map(([r, n]) => `${r}: ${n}`)
      .join(' · ');

    const lines: string[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      const name = (data.displayName as string) || (data.email as string) || d.id;
      const role = (data.role as string) || '?';
      const branch = (data.branchName as string) || (data.branchId as string) || 'Sin sucursal';
      const allAccess = data.canAccessAllBranches ? ' · Acceso total' : '';
      const status = data.disabled ? ' 🔴 Suspendido' : '';
      lines.push(`• **${name}** — ${role} · ${branch}${allAccess}${status}`);
    }

    const header = `👥 **Usuarios del sistema** — ${snap.size} resultado${snap.size !== 1 ? 's' : ''}`;
    const summary = `Por rol: ${roleSummary} · Suspendidos: ${suspended}`;

    return [header, summary, '', ...lines].join('\n');
  } catch (error) {
    console.error('[Tool:get_user_list] Error:', error);
    return '❌ Error al consultar los usuarios. Intenta de nuevo más tarde.';
  }
}

async function handleGetBranchList(
  _args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<string> {
  try {
    const snapshot = await adminDb
      .collection('branches')
      .orderBy('isHQ', 'desc')
      .get();

    if (snapshot.empty) {
      return 'No se encontraron sucursales registradas en el sistema.';
    }

    const lines = ['🏢 **Sucursales registradas:**', ''];
    snapshot.forEach((doc) => {
      const d = doc.data();
      const statusDot = d.status === 'ACTIVE' ? '🟢' : '🔴';
      const hqLabel = d.isHQ ? ' *(Sede Matriz)*' : '';
      const address = d.address ? ` — ${d.address}` : '';
      const phone = d.phone ? ` · Tel: ${d.phone}` : '';
      lines.push(`${statusDot} **${d.name || 'Sin nombre'}**${hqLabel}${address}${phone}`);
    });

    const active = snapshot.docs.filter(d => d.data().status === 'ACTIVE').length;
    const inactive = snapshot.size - active;
    lines.push('', `Total: **${snapshot.size}** sucursales · Activas: ${active} · Inactivas: ${inactive}`);

    return lines.join('\n');
  } catch (error) {
    console.error('[Tool:get_branch_list] Error:', error);
    return '❌ Error al listar las sucursales. Intenta de nuevo más tarde.';
  }
}

/**
 * Cuenta clientes, proveedores y transportistas.
 */
async function handleGetEntityCounts(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<string> {
  const type = (args.type as string) || 'all';

  try {
    const counts: Record<string, number> = {};

    if (type === 'clients' || type === 'all') {
      const clientSnapshot = await adminDb
        .collection('clientes')
        .where('isActive', '==', true)
        .count()
        .get();
      counts['clientes'] = clientSnapshot.data().count;
    }

    if (type === 'suppliers' || type === 'all') {
      const supplierSnapshot = await adminDb
        .collection('empresas')
        .where('isActive', '==', true)
        .count()
        .get();
      counts['proveedores'] = supplierSnapshot.data().count;
    }

    if (type === 'transporters' || type === 'all') {
      const transporterSnapshot = await adminDb
        .collection('transportes')
        .count()
        .get();
      counts['transportistas'] = transporterSnapshot.data().count;
    }

    const lines = ['👥 **Entidades registradas:**', ''];

    if (counts['clientes'] !== undefined) {
      lines.push(`• Clientes activos: **${counts['clientes']}**`);
    }
    if (counts['proveedores'] !== undefined) {
      lines.push(`• Proveedores activos: **${counts['proveedores']}**`);
    }
    if (counts['transportistas'] !== undefined) {
      lines.push(`• Transportistas activos: **${counts['transportistas']}**`);
    }

    if (Object.values(counts).every((c) => c === 0)) {
      lines.push('_No hay entidades registradas aún._');
    }

    return lines.join('\n');
  } catch (error) {
    console.error('[Tool:get_entity_counts] Error:', error);
    return '❌ Error al contar las entidades. Intenta de nuevo más tarde.';
  }
}

/**
 * Resumen de ventas por día para un período (default últimos 7 días).
 * Incluye detección de anomalías por día.
 */
async function handleGetWeeklySales(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const branchId = (args.branchId as string) || ctx.branchId;
  const branchName = branchId ? await resolveBranchName(branchId) : null;
  const periodExpr = args.period as string | undefined;

  // Determine date range
  let startDateStr: string;
  let endDateStr: string;
  let periodLabel: string;

  if (periodExpr) {
    const range = parseDateExpression(periodExpr);
    if (range) {
      startDateStr = range.startDate;
      endDateStr = range.endDate;
      periodLabel = range.label;
    } else {
      startDateStr = todayBO().slice(0, 8) + '01'; // fallback: month start
      endDateStr = todayBO();
      periodLabel = 'Período';
    }
  } else {
    endDateStr = todayBO();
    // default: last 7 days
    const d = new Date(`${endDateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 6);
    startDateStr = d.toISOString().slice(0, 10);
    periodLabel = 'Últimos 7 días';
  }

  try {
    // Enumerate all days in range
    const days: string[] = [];
    const cursor = new Date(`${startDateStr}T12:00:00Z`);
    const endCursor = new Date(`${endDateStr}T12:00:00Z`);
    while (cursor <= endCursor && days.length < 62) {
      days.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const results: { date: string; label: string; total: number; count: number }[] = [];

    for (const date of days) {
      const start = new Date(`${date}T00:00:00-04:00`);
      const end = new Date(`${date}T23:59:59-04:00`);

      let q = adminDb.collection('ventas').where('createdAt', '>=', start).where('createdAt', '<=', end);
      if (branchId) q = q.where('branchId', '==', branchId);

      const snap = await q.get();
      let total = 0;
      snap.forEach((doc) => { total += doc.data().total || 0; });

      const d = new Date(`${date}T12:00:00Z`);
      results.push({
        date,
        label: d.toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', month: 'short' }),
        total,
        count: snap.size,
      });
    }

    const totalPeriod = results.reduce((s, r) => s + r.total, 0);
    const totalCount = results.reduce((s, r) => s + r.count, 0);
    const daysWithSales = results.filter((r) => r.total > 0).length || 1;
    const avgDaily = totalPeriod / daysWithSales;

    // Anomaly flags
    const lines = results.map((r) => {
      let flag = '';
      if (r.total > avgDaily * 2) flag = ' 🚀 excepcional';
      else if (r.total > 0 && r.total < avgDaily * 0.4) flag = ' 🔴 muy bajo';
      return `• ${r.label}: **Bs. ${r.total.toFixed(2)}** (${r.count} ventas)${flag}`;
    });

    return [
      `📈 **Ventas por día — ${periodLabel}**${branchName ? ` · ${branchName}` : ''} _(tiempo real)_`,
      '',
      ...lines,
      '',
      `• **Total: Bs. ${totalPeriod.toFixed(2)}** (${totalCount} ventas en ${days.length} días)`,
      `• **Promedio diario: Bs. ${avgDaily.toFixed(2)}**`,
    ].join('\n');
  } catch (error) {
    console.error('[Tool:get_weekly_sales] Error:', error);
    return '❌ Error al consultar las ventas. Intenta de nuevo.';
  }
}

/**
 * Top productos más vendidos en los últimos 7 días.
 */
async function handleGetTopProducts(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const branchId = (args.branchId as string) || ctx.branchId;
  const branchName = branchId ? await resolveBranchName(branchId) : null;
  const limit = parseInt(args.limit as string) || 5;

  try {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 6);
    startOfWeek.setHours(0, 0, 0, 0);

    let query = adminDb.collection('ventas').where('createdAt', '>=', startOfWeek);
    if (branchId) query = (query as ReturnType<typeof adminDb.collection>).where('branchId', '==', branchId);

    const snapshot = await query.get();

    if (snapshot.empty) {
      return `No hay ventas registradas esta semana${branchName ? ` en ${branchName}` : ''}.`;
    }

    const stats: Record<string, { name: string; qty: number; total: number }> = {};

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!Array.isArray(data.items)) return;
      for (const item of data.items) {
        const id = item.productId || item.id || 'unknown';
        if (!stats[id]) {
          stats[id] = { name: item.productName || item.nombre || id, qty: 0, total: 0 };
        }
        stats[id].qty += item.quantity || 0;
        stats[id].total += item.subtotal || 0;
      }
    });

    const top = Object.values(stats)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);

    if (top.length === 0) {
      return 'No se encontraron detalles de productos en las ventas de esta semana.';
    }

    const lines = [
      `🏆 **Top ${top.length} productos${branchName ? ` — ${branchName}` : ''} (últimos 7 días)**`,
      '',
      ...top.map((p, i) => `${i + 1}. **${p.name}** — ${p.qty} unid. | Bs. ${p.total.toFixed(2)}`),
    ];

    return lines.join('\n');
  } catch (error) {
    console.error('[Tool:get_top_products] Error:', error);
    return '❌ Error al consultar los productos más vendidos. Intenta de nuevo.';
  }
}

/**
 * Compara ventas entre todas las sucursales activas para un período.
 */
async function handleCompareBranchesSales(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<string> {
  const periodExpr = (args.period as string) || 'hoy';

  const range = parseDateExpression(periodExpr) ?? parseDateExpression('hoy')!;
  const { start, end } = rangeToDateObjects(range);

  try {
    // Get all active branches
    const branchesSnap = await adminDb.collection('sucursales').where('isActive', '==', true).get();
    if (branchesSnap.empty) return 'No hay sucursales activas en el sistema.';

    const branchStats: { name: string; total: number; count: number }[] = [];

    for (const branchDoc of branchesSnap.docs) {
      const branchName = branchDoc.data().nombre || branchDoc.id;
      const snap = await adminDb
        .collection('ventas')
        .where('branchId', '==', branchDoc.id)
        .where('createdAt', '>=', start)
        .where('createdAt', '<=', end)
        .get();

      let total = 0;
      snap.forEach((d) => { total += d.data().total || 0; });
      branchStats.push({ name: branchName, total, count: snap.size });
    }

    branchStats.sort((a, b) => b.total - a.total);

    const grandTotal = branchStats.reduce((s, b) => s + b.total, 0);

    if (grandTotal === 0) {
      return `No hay ventas registradas en el período "${range.label}" en ninguna sucursal.`;
    }

    const rows = branchStats.map((b, i) => {
      const pct = grandTotal > 0 ? ((b.total / grandTotal) * 100).toFixed(1) : '0.0';
      const medal = i === 0 ? ' 🥇' : i === 1 ? ' 🥈' : i === 2 ? ' 🥉' : '';
      return `• **${b.name}**${medal} — Bs. ${b.total.toFixed(2)} (${b.count} ventas · ${pct}% del total)`;
    });

    return [
      `🏢 **Comparativa de sucursales — ${range.label}** _(tiempo real)_`,
      '',
      ...rows,
      '',
      `• **Total sistema: Bs. ${grandTotal.toFixed(2)}**`,
    ].join('\n');
  } catch (error) {
    console.error('[Tool:compare_branches_sales] Error:', error);
    return '❌ Error al comparar sucursales. Intenta de nuevo.';
  }
}

/**
 * Consulta clientes con crédito pendiente.
 */
async function handleGetClientCredits(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const branchId = (args.branchId as string) || ctx.branchId;
  const branchName = branchId ? await resolveBranchName(branchId) : null;
  const limit = parseInt(args.limit as string) || 10;

  try {
    let q = adminDb
      .collection('ventas')
      .where('paymentMethod', '==', 'CREDITO')
      .where('creditStatus', 'in', ['PENDIENTE', 'PARCIAL']);

    if (branchId) q = q.where('branchId', '==', branchId);

    const snap = await q.orderBy('total', 'desc').limit(limit).get();

    if (snap.empty) {
      return `✅ No hay créditos pendientes${branchName ? ` en ${branchName}` : ''}.`;
    }

    const clientTotals = new Map<string, { nombre: string; deuda: number; ventas: number }>();
    snap.forEach((doc) => {
      const d = doc.data();
      const cid = d.clientId || 'unknown';
      const prev = clientTotals.get(cid);
      clientTotals.set(cid, {
        nombre: d.clientName || d.clientNombre || cid,
        deuda: (prev?.deuda ?? 0) + (d.creditBalance ?? d.total ?? 0),
        ventas: (prev?.ventas ?? 0) + 1,
      });
    });

    const sorted = Array.from(clientTotals.values()).sort((a, b) => b.deuda - a.deuda);
    const totalDeuda = sorted.reduce((s, c) => s + c.deuda, 0);

    const lines = sorted.map((c) => `• **${c.nombre}** — Bs. ${c.deuda.toFixed(2)} (${c.ventas} venta${c.ventas > 1 ? 's' : ''})`);

    return [
      `💳 **Créditos pendientes${branchName ? ` — ${branchName}` : ''}** _(tiempo real)_`,
      '',
      ...lines,
      '',
      `• **Total por cobrar: Bs. ${totalDeuda.toFixed(2)}** (${sorted.length} clientes)`,
    ].join('\n');
  } catch (error) {
    console.error('[Tool:get_client_credits] Error:', error);
    return '❌ Error al consultar los créditos. Intenta de nuevo.';
  }
}

/**
 * Consulta cotizaciones (proformas) de una sucursal, con filtro opcional por estado.
 */
async function handleGetPendingQuotations(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const branchId = (args.branchId as string) || ctx.branchId;
  const status   = (args.status as string) || null;
  const limit    = Math.min(parseInt(String(args.limit ?? 15)) || 15, 50);
  const branchName = branchId ? await resolveBranchName(branchId) : null;

  try {
    let q: FirebaseFirestore.Query = adminDb.collection('cotizaciones');
    if (branchId) q = q.where('branchId', '==', branchId);
    if (status)   q = q.where('status', '==', status);
    q = q.orderBy('fecha', 'desc').limit(limit);

    const snap = await q.get();

    if (snap.empty) {
      const label = status ? status.toLowerCase() : 'registradas';
      return `No hay cotizaciones ${label}${branchName ? ` en ${branchName}` : ''}.`;
    }

    const now = new Date();
    const counts = { PENDING: 0, CONVERTED: 0, CANCELLED: 0, EXPIRED: 0 };
    const lines: string[] = [];

    snap.forEach((doc) => {
      const d = doc.data();
      const docStatus: string = d.status ?? 'PENDING';
      const validUntil = d.validUntil?.toDate?.() ?? null;
      const isExpired  = docStatus === 'PENDING' && validUntil && validUntil < now;
      const efectiveStatus = isExpired ? 'EXPIRED' : docStatus;

      if (efectiveStatus in counts) counts[efectiveStatus as keyof typeof counts]++;

      if (lines.length < 10) {
        const fecha  = d.fecha?.toDate?.()?.toLocaleDateString('es-BO') ?? '—';
        const client = d.cliente?.razonSocial ?? 'Sin cliente';
        const total  = `Bs. ${(d.total ?? 0).toFixed(2)}`;
        const badge  = efectiveStatus === 'PENDING' ? '⏳' : efectiveStatus === 'CONVERTED' ? '✅' : efectiveStatus === 'EXPIRED' ? '⚠️' : '❌';
        lines.push(`${badge} ${fecha} — **${client}** — ${total}`);
      }
    });

    const header = `📋 **Cotizaciones${branchName ? ` — ${branchName}` : ''}** _(${snap.size} resultados)_`;
    const summary = `Pendientes: ${counts.PENDING} | Convertidas: ${counts.CONVERTED} | Vencidas: ${counts.EXPIRED} | Canceladas: ${counts.CANCELLED}`;

    return [header, '', summary, '', ...lines, snap.size > 10 ? `_...y ${snap.size - 10} más._` : ''].filter(Boolean).join('\n');
  } catch (error) {
    console.error('[Tool:get_pending_quotations] Error:', error);
    return '❌ Error al consultar las cotizaciones. Intenta de nuevo.';
  }
}

/**
 * Lista transportistas registrados con datos de contacto.
 */
async function handleGetTransporters(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<string> {
  const searchQuery = (args.query as string || '').toLowerCase();

  try {
    const snap = await adminDb.collection('transportes').limit(50).get();

    if (snap.empty) return '⚠️ No hay transportistas registrados.';

    let transporters = snap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>));

    if (searchQuery) {
      transporters = transporters.filter(t =>
        String(t['razonSocial'] || '').toLowerCase().includes(searchQuery) ||
        String(t['tipoTransporte'] || '').toLowerCase().includes(searchQuery)
      );
    }

    if (transporters.length === 0) return `⚠️ No se encontraron transportistas con "${args.query}".`;

    const lines = [`🚛 **Transportistas (${transporters.length})**`, ''];
    transporters.forEach(t => {
      const tel  = t['telefono'] ? ` · Tel: ${t['telefono']}` : '';
      const tipo = t['tipoTransporte'] ? ` [${t['tipoTransporte']}]` : '';
      const ubi  = t['ubicacion'] ? ` · ${t['ubicacion']}` : '';
      lines.push(`• **${t['razonSocial']}**${tipo}${tel}${ubi}`);
    });

    return lines.join('\n');
  } catch (error) {
    console.error('[Tool:get_transporters] Error:', error);
    return '❌ Error al consultar los transportistas. Intenta de nuevo.';
  }
}

/**
 * Lista empresas proveedoras con saldo pendiente.
 */
async function handleGetSuppliers(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<string> {
  const searchQuery = (args.query as string || '').toLowerCase();
  const filter = args.filter as string | undefined;

  try {
    const snap = await adminDb
      .collection('empresas')
      .where('isActive', '==', true)
      .orderBy('nombre')
      .limit(50)
      .get();

    if (snap.empty) return '⚠️ No hay empresas proveedoras registradas.';

    const fmt = (n: number) =>
      `Bs ${Math.abs(n).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    let empresas = snap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>));

    if (searchQuery) {
      empresas = empresas.filter(e =>
        String(e['nombre'] || '').toLowerCase().includes(searchQuery)
      );
    }

    if (filter === 'por_pagar') {
      empresas = empresas.filter(e => Number(e['saldoTotal'] || 0) > 0);
    } else if (filter === 'a_favor') {
      empresas = empresas.filter(e => Number(e['saldoTotal'] || 0) < 0);
    }

    if (empresas.length === 0) {
      return searchQuery
        ? `⚠️ No se encontraron proveedores con "${args.query}".`
        : '✅ No hay proveedores con saldo pendiente.';
    }

    const lines = [`🏢 **Proveedores (${empresas.length})**`, ''];
    let totalDeuda = 0;

    empresas.forEach(e => {
      const saldo = Number(e['saldoTotal'] || 0);
      totalDeuda += Math.max(0, saldo);
      const saldoStr = saldo > 0
        ? ` — **Por pagar: ${fmt(saldo)}**`
        : saldo < 0
          ? ` — A favor: ${fmt(saldo)}`
          : ' — Sin deuda';
      const cuentas = e['cuentaCount'] ? ` (${e['cuentaCount']} cuenta${Number(e['cuentaCount']) === 1 ? '' : 's'})` : '';
      lines.push(`• **${e['nombre']}**${cuentas}${saldoStr}`);
    });

    if (!filter || filter === 'por_pagar') {
      lines.push('', `**Total por pagar:** ${fmt(totalDeuda)}`);
    }

    return lines.join('\n');
  } catch (error) {
    console.error('[Tool:get_suppliers] Error:', error);
    return '❌ Error al consultar los proveedores. Intenta de nuevo.';
  }
}

/**
 * Consulta compras a proveedores registradas en Firestore.
 */
async function handleGetRecentPurchases(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const branchId   = (args.branchId as string) || ctx.branchId;
  const branchName = branchId ? await resolveBranchName(branchId) : null;
  const limit      = Math.min(Number(args.limit) || 10, 25);
  const statusArg  = args.status as string | undefined;

  if (!branchId) return '⚠️ Necesito saber la sucursal para consultar las compras.';

  try {
    let q = adminDb
      .collection('compras')
      .where('branchId', '==', branchId)
      .orderBy('date', 'desc')
      .limit(limit) as FirebaseFirestore.Query;

    if (statusArg) q = q.where('status', '==', statusArg);

    const snap = await q.get();

    if (snap.empty) return `⚠️ No hay compras registradas para ${branchName || branchId}.`;

    const fmt = (n: number) =>
      `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const PAYMENT_LABEL: Record<string, string> = {
      EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', QR: 'QR', CREDITO: 'Crédito',
    };
    const STATUS_LABEL: Record<string, string> = {
      RECEIVED: 'Recibida', PENDING: 'Pendiente',
    };

    const lines = [`🛒 **Compras — ${branchName || branchId}** _(${snap.size})_`, ''];
    let totalSum = 0;

    snap.forEach(d => {
      const p = d.data();
      const fecha    = p.date?.toDate?.()?.toLocaleDateString('es-BO') || p.date || 'N/D';
      const proveedor = p.supplierName || 'Sin proveedor';
      const total    = Number(p.totalAmount || 0);
      const pago     = PAYMENT_LABEL[p.paymentMethod] || p.paymentMethod || '—';
      const estado   = STATUS_LABEL[p.status] || p.status || '—';
      const badge    = p.status === 'RECEIVED' ? '✅' : '⏳';
      totalSum += total;
      lines.push(`${badge} ${fecha} — **${proveedor}** — ${fmt(total)} (${pago}) [${estado}]`);
    });

    lines.push('', `**Total en período:** ${fmt(totalSum)}`);
    return lines.join('\n');
  } catch (error) {
    console.error('[Tool:get_recent_purchases] Error:', error);
    return '❌ Error al consultar las compras. Intenta de nuevo.';
  }
}

/**
 * Consulta pedidos internos de reabastecimiento entre sucursales.
 */
async function handleGetPendingOrders(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const branchId  = (args.branchId as string) || ctx.branchId;
  const branchName = branchId ? await resolveBranchName(branchId) : null;
  const direction = (args.direction as string) || 'both';
  const statusArg = args.status as string | undefined;
  const statuses  = statusArg ? [statusArg] : ['borrador', 'vigente'];

  if (!branchId) {
    return '⚠️ Necesito saber la sucursal para consultar los pedidos.';
  }

  try {
    const results: string[] = [];

    const STATUS_LABEL: Record<string, string> = {
      borrador: 'Borrador', vigente: 'Vigente',
      despachado: 'Despachado', cancelado: 'Cancelado',
    };

    const fetch = async (field: string, label: string) => {
      const snap = await adminDb
        .collection('pedidos')
        .where(field, '==', branchId)
        .where('status', 'in', statuses)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      if (snap.empty) return;
      results.push(`${label}`);
      snap.forEach(d => {
        const p = d.data();
        const estado = STATUS_LABEL[p.status] || p.status;
        const fecha  = p.createdAt?.toDate?.()?.toLocaleDateString('es-BO') || 'N/D';
        const desde  = p.fromBranchName || p.fromBranchId || '?';
        const hacia  = p.toBranchName   || p.toBranchId   || '?';
        results.push(`• **${p.codigo || d.id.slice(-6)}** [${estado}] ${desde} → ${hacia} — ${p.itemCount || 0} ítems · ${fecha}`);
      });
    };

    if (direction === 'emitidos' || direction === 'both') {
      await fetch('fromBranchId', `📤 **Emitidos por ${branchName || branchId}:**`);
    }
    if (direction === 'entrantes' || direction === 'both') {
      if (results.length) results.push('');
      await fetch('toBranchId', `📥 **Entrantes a ${branchName || branchId}:**`);
    }

    if (results.length === 0) {
      return `✅ No hay pedidos ${statuses.join('/')} para ${branchName || branchId}.`;
    }

    return results.join('\n');
  } catch (error) {
    console.error('[Tool:get_pending_orders] Error:', error);
    return '❌ Error al consultar los pedidos. Intenta de nuevo.';
  }
}

/**
 * Obtiene saldos actuales de cuentas de tesorería (cajones, bancos, wallets).
 */
async function handleGetTreasuryAccounts(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<string> {
  const typeFilter = args.type as string | undefined;

  try {
    let q = adminDb.collection('accounts').where('isActive', '==', true);
    const snap = await q.get();

    if (snap.empty) return '⚠️ No hay cuentas registradas en Tesorería.';

    const fmt = (n: number) =>
      `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const accounts = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>))
      .filter(a => !typeFilter || a['type'] === typeFilter);

    const byType = {
      CASH_DRAWER: accounts.filter(a => a['type'] === 'CASH_DRAWER'),
      BANK:        accounts.filter(a => a['type'] === 'BANK'),
      WALLET:      accounts.filter(a => a['type'] === 'WALLET'),
    };

    const lines: string[] = [];

    if (byType.CASH_DRAWER.length > 0) {
      lines.push('**Cajones / Bóvedas:**');
      byType.CASH_DRAWER.forEach(a => {
        const purpose = a['cashDrawerPurpose'] === 'VAULT' ? ' (Bóveda)' : ' (POS)';
        lines.push(`- ${a['name']}${purpose}: **${fmt(a['currentBalance'] as number)}**`);
      });
    }

    if (byType.BANK.length > 0) {
      if (lines.length) lines.push('');
      lines.push('**Cuentas bancarias:**');
      byType.BANK.forEach(a => {
        const bank = a['bankName'] ? ` (${a['bankName']})` : '';
        lines.push(`- ${a['name']}${bank}: **${fmt(a['currentBalance'] as number)}**`);
      });
    }

    if (byType.WALLET.length > 0) {
      if (lines.length) lines.push('');
      lines.push('**Billeteras / QR:**');
      byType.WALLET.forEach(a => {
        lines.push(`- ${a['name']}: **${fmt(a['currentBalance'] as number)}**`);
      });
    }

    const total = accounts.reduce((s, a) => s + (Number(a['currentBalance']) || 0), 0);
    lines.push('', `**Total consolidado:** ${fmt(total)}`);

    return `## Cuentas de Tesorería\n\n${lines.join('\n')}`;
  } catch (error) {
    console.error('[Tool:get_treasury_accounts] Error:', error);
    return '❌ Error al consultar las cuentas de Tesorería. Intenta de nuevo.';
  }
}

/**
 * Ejecuta SQL analítico contra BigQuery (renotech_data dataset).
 * Solo SELECT — cualquier otra operación es rechazada.
 */
async function handleRunSql(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<string> {
  const query = (args.query as string || '').trim();
  const description = (args.description as string || '').trim();
  const maxRows = Math.min(parseInt(String(args.maxRows ?? 100)) || 100, 500);

  if (!query) return '❌ La consulta SQL está vacía.';

  try {
    const result = await runBqQuery(query, maxRows);
    const table = formatBqResult(result, description);

    const header = description ? `📊 **${description}**\n\n` : '';
    return `${header}${table}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Tool:run_sql] Error:', msg);

    if (msg.includes('Solo se permiten consultas SELECT')) {
      return '❌ Solo se permiten consultas SELECT en el asistente.';
    }
    if (msg.includes('not found') || msg.includes('Not found')) {
      return '❌ Tabla o columna no encontrada. Verifica que uses las vistas correctas: v_ventas, v_ventas_items, v_catalogo, v_clientes.';
    }
    if (msg.includes('Syntax error')) {
      return `❌ Error de sintaxis en SQL: ${msg.split('Syntax error')[1]?.slice(0, 200) ?? msg.slice(0, 200)}`;
    }
    return `❌ Error al ejecutar la consulta: ${msg.slice(0, 300)}`;
  }
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  CASH_DISCREPANCY: 'Discrepancia de Caja',
  SECURITY: 'Seguridad',
  INVENTORY_THRESHOLD: 'Stock bajo mínimo',
  DISCOUNT_OVERRIDE: 'Descuento no autorizado',
  TRANSFER_DISCREPANCY: 'Discrepancia de Traspaso',
  TRANSFER_DISCREPANCY_RESOLVED: 'Discrepancia Resuelta',
  SHIFT_OPEN_TOO_LONG: 'Turno abierto mucho tiempo',
  EXPENSE_DUPLICATE: 'Gasto duplicado',
  EXPENSE_LARGE: 'Gasto elevado',
  ENVIO_CANCEL_APPROVED: 'Cancelación de Envío Aprobada',
  ENVIO_CANCEL_REJECTED: 'Cancelación de Envío Rechazada',
  FLETE_POR_PAGAR: 'Flete pendiente de pago',
};

const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '⚪',
};

async function handleGetPendingApprovals(
  args: Record<string, unknown>,
  _ctx: ToolContext
): Promise<string> {
  const category = (args.category as string) || 'todas';
  const maxRows = Math.min(parseInt(String(args.limit ?? '10'), 10) || 10, 50);

  try {
    const sections: string[] = [];

    // Gastos pendientes
    if (category === 'todas' || category === 'gastos') {
      const snap = await adminDb.collection('gastos_operativos')
        .where('status', '==', 'PENDING_APPROVAL')
        .orderBy('createdAt', 'desc')
        .limit(maxRows)
        .get();
      if (!snap.empty) {
        const lines = snap.docs.map(d => {
          const doc = d.data();
          const ts = doc.createdAt?.toDate?.() ?? new Date(doc.createdAt ?? 0);
          const dateStr = ts.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', timeZone: 'America/La_Paz' });
          const monto = typeof doc.monto === 'number' ? `Bs ${doc.monto.toFixed(2)}` : '';
          return `• ${dateStr} | ${String(doc.category ?? doc.categoria ?? 'Gasto')} | **${monto}** — ${String(doc.description ?? doc.descripcion ?? '').slice(0, 60)} (${doc.requesterName ?? doc.createdByName ?? '?'})`;
        });
        sections.push(`**Gastos pendientes** (${snap.size})\n${lines.join('\n')}`);
      } else if (category === 'gastos') {
        sections.push('No hay gastos pendientes de aprobación.');
      }
    }

    // Devoluciones (anulaciones de venta)
    if (category === 'todas' || category === 'devoluciones') {
      const snap = await adminDb.collection('pending_void_approvals')
        .where('status', '==', 'PENDING')
        .orderBy('requestedAt', 'desc')
        .limit(maxRows)
        .get();
      if (!snap.empty) {
        const lines = snap.docs.map(d => {
          const doc = d.data();
          const ts = doc.requestedAt?.toDate?.() ?? new Date(doc.requestedAt ?? 0);
          const dateStr = ts.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', timeZone: 'America/La_Paz' });
          const total = typeof doc.total === 'number' ? `Bs ${doc.total.toFixed(2)}` : '';
          return `• ${dateStr} | Venta ${doc.saleCode ?? doc.saleId ?? ''} | **${total}** — ${doc.reason ?? 'Sin motivo'} (${doc.requestedByName ?? '?'})`;
        });
        sections.push(`**Devoluciones pendientes** (${snap.size})\n${lines.join('\n')}`);
      } else if (category === 'devoluciones') {
        sections.push('No hay devoluciones pendientes de aprobación.');
      }
    }

    // Descuentos
    if (category === 'todas' || category === 'descuentos') {
      const snap = await adminDb.collection('pending_discount_approvals')
        .where('status', '==', 'PENDING')
        .orderBy('requestedAt', 'desc')
        .limit(maxRows)
        .get();
      if (!snap.empty) {
        const lines = snap.docs.map(d => {
          const doc = d.data();
          const ts = doc.requestedAt?.toDate?.() ?? new Date(doc.requestedAt ?? 0);
          const dateStr = ts.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', timeZone: 'America/La_Paz' });
          const pct = doc.discountPercent != null ? `${doc.discountPercent}%` : '';
          return `• ${dateStr} | ${pct} descuento | Bs ${doc.saleTotal ?? '?'} — (${doc.requestedByName ?? '?'})`;
        });
        sections.push(`**Descuentos pendientes** (${snap.size})\n${lines.join('\n')}`);
      } else if (category === 'descuentos') {
        sections.push('No hay descuentos pendientes de aprobación.');
      }
    }

    // Cancelaciones de pedidos + envíos
    if (category === 'todas' || category === 'cancelaciones') {
      const [pedidosSnap, enviosSnap] = await Promise.all([
        adminDb.collection('pedidos').where('cancellationPending', '==', true).limit(maxRows).get(),
        adminDb.collection('envios').where('cancellationPending', '==', true).limit(maxRows).get(),
      ]);
      const total = pedidosSnap.size + enviosSnap.size;
      if (total > 0) {
        const lines: string[] = [];
        for (const d of pedidosSnap.docs) {
          const doc = d.data();
          lines.push(`• Pedido ${doc.codigo ?? d.id} — ${doc.cancellationReason ?? 'Sin motivo'} (${doc.fromBranchName ?? '?'} → ${doc.toBranchName ?? '?'})`);
        }
        for (const d of enviosSnap.docs) {
          const doc = d.data();
          lines.push(`• Envío ${doc.codigo ?? d.id} — ${doc.cancellationReason ?? 'Sin motivo'} (${doc.branchName ?? '?'})`);
        }
        sections.push(`**Cancelaciones pendientes** (${total})\n${lines.join('\n')}`);
      } else if (category === 'cancelaciones') {
        sections.push('No hay cancelaciones pendientes.');
      }
    }

    if (sections.length === 0) {
      return '✅ No hay aprobaciones pendientes en ninguna categoría.';
    }

    const header = `📋 **Aprobaciones pendientes** — ${new Date().toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/La_Paz' })}`;
    return [header, '', ...sections].join('\n\n');
  } catch (error) {
    console.error('[Tool:get_pending_approvals] Error:', error);
    return '❌ Error al consultar las aprobaciones pendientes. Intenta de nuevo más tarde.';
  }
}

async function handleGetAuditAlerts(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const branchId = (args.branchId as string) || null;
  const severity = args.severity as string | undefined;
  const type = args.type as string | undefined;
  const onlyUnread = String(args.onlyUnread ?? 'false') === 'true';
  const maxRows = Math.min(parseInt(String(args.limit ?? '20'), 10) || 20, 100);

  try {
    let q = adminDb.collection('auditAlerts').orderBy('createdAt', 'desc');
    if (branchId) q = q.where('branchId', '==', branchId);
    if (severity) q = q.where('severity', '==', severity);
    if (type) q = q.where('type', '==', type);
    if (onlyUnread) q = q.where('isRead', '==', false);
    q = q.limit(maxRows) as typeof q;

    const snap = await q.get();

    if (snap.empty) {
      return `No hay alertas${severity ? ` de severidad ${severity}` : ''}${type ? ` de tipo "${ALERT_TYPE_LABELS[type] ?? type}"` : ''}${onlyUnread ? ' sin leer' : ''}${branchId ? ` en la sucursal ${branchId}` : ''}.`;
    }

    const docs = snap.docs.map(d => d.data());

    // Summary counts
    const bySeverity: Record<string, number> = {};
    let unreadCount = 0;
    for (const d of docs) {
      const sev = d.severity as string ?? 'LOW';
      bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
      if (!d.isRead) unreadCount++;
    }

    const lines: string[] = [];
    for (const d of docs) {
      const ts = d.createdAt?.toDate?.() ?? new Date(d.createdAt ?? 0);
      const dateStr = ts.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/La_Paz' });
      const emoji = SEVERITY_EMOJI[d.severity as string] ?? '⚪';
      const typeLabel = ALERT_TYPE_LABELS[d.type as string] ?? (d.type as string);
      const read = d.isRead ? '' : ' *(sin leer)*';
      const branch = d.branchId ? ` · ${d.branchId}` : '';
      lines.push(`${emoji} ${dateStr} | **${typeLabel}**${branch}${read} — ${String(d.message ?? '').slice(0, 80)}`);
    }

    const severitySummary = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
      .filter(s => bySeverity[s])
      .map(s => `${SEVERITY_EMOJI[s]} ${s}: ${bySeverity[s]}`)
      .join(' · ');

    const header = `🔔 **Alertas de Auditoría** — ${docs.length} resultado${docs.length !== 1 ? 's' : ''}`;
    const summary = `Sin leer: **${unreadCount}** · ${severitySummary}`;

    return [header, summary, '', ...lines].join('\n');
  } catch (error) {
    console.error('[Tool:get_audit_alerts] Error:', error);
    return '❌ Error al consultar las alertas de auditoría. Intenta de nuevo más tarde.';
  }
}

const MOVEMENT_LABELS: Record<string, string> = {
  ENTRADA: 'Entrada Manual', SALIDA: 'Salida Manual', AJUSTE: 'Ajuste de Stock',
  AJUSTE_MASIVO: 'Ajuste Masivo', TRASP_SALIDA: 'Despacho TRF', TRASP_ENTRADA: 'Recepción TRF',
  TRASP_REVERSAL: 'Reversa TRF', ANULACION: 'Anulación Venta',
  GARANTIA_SALIDA: 'Garantía Salida', GARANTIA_ENTRADA: 'Garantía Entrada',
  CARGA_INICIAL: 'Carga Inicial', REPOSICION: 'Reposición',
};

const ENTRY_TYPES_SET = new Set(['ENTRADA', 'TRASP_ENTRADA', 'TRASP_REVERSAL', 'GARANTIA_ENTRADA', 'ANULACION', 'CARGA_INICIAL', 'REPOSICION']);

async function handleGetKardexMovements(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const rawQuery = (args.query as string || '').trim();
  const branchId = (args.branchId as string) || ctx.branchId;
  const maxRows = Math.min(parseInt(String(args.limit ?? '20'), 10) || 20, 100);
  const typeFilter = args.type as string | undefined;

  if (!rawQuery || rawQuery.length < 2) {
    return '❌ Necesito al menos 2 caracteres para buscar un producto.';
  }

  try {
    const products = await fuzzySearchCatalog(rawQuery, 3);
    if (products.length === 0) {
      return `No encontré productos que coincidan con "${rawQuery}".`;
    }

    const prod = products[0];
    const branchName = branchId ? await resolveBranchName(branchId) : null;

    // Build query incrementally (all where() before orderBy/limit)
    let q = adminDb.collection('movimientos').where('productId', '==', prod.id);
    if (branchId) q = q.where('branchId', '==', branchId);
    if (typeFilter) q = q.where('type', '==', typeFilter);
    const snap = await q.orderBy('date', 'desc').limit(maxRows).get();

    if (snap.empty) {
      return `No hay movimientos registrados para **${prod.nombre}**${branchName ? ` en ${branchName}` : ''}${typeFilter ? ` de tipo "${MOVEMENT_LABELS[typeFilter] ?? typeFilter}"` : ''}.`;
    }

    const movs = snap.docs.map(d => d.data());

    let totalEntradas = 0, totalSalidas = 0;
    const lines: string[] = [];
    for (const m of movs) {
      const ts = m.date?.toDate?.() ?? new Date(m.date ?? 0);
      const dateStr = ts.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/La_Paz' });
      const label = MOVEMENT_LABELS[m.type as string] ?? m.type;
      const qty = Math.abs(m.quantity ?? 0);
      const isIn = ENTRY_TYPES_SET.has(m.type as string);
      const dir = isIn ? `+${qty}` : `-${qty}`;
      if (isIn) totalEntradas += qty; else totalSalidas += qty;
      const stock = m.currentStock != null ? ` → stock: ${m.currentStock}` : '';
      const reason = m.reason ? ` (${String(m.reason).slice(0, 40)})` : '';
      lines.push(`• ${dateStr} | ${label} | **${dir}**${stock}${reason}`);
    }

    const header = `📋 **Kardex de "${prod.nombre}"** (${prod.codigo})${branchName ? ` · ${branchName}` : ''}${typeFilter ? ` · ${MOVEMENT_LABELS[typeFilter] ?? typeFilter}` : ''} — últimos ${movs.length} movimientos`;
    const summary = `Entradas: **+${totalEntradas}** · Salidas: **-${totalSalidas}**`;

    return [header, '', summary, '', ...lines].join('\n');
  } catch (error) {
    console.error('[Tool:get_kardex_movements] Error:', error);
    return '❌ Error al consultar los movimientos. Intenta de nuevo más tarde.';
  }
}

// ─── Handler Registry ────────────────────────────────────────────────────────

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  get_product_stock: handleGetProductStock,
  get_daily_sales_summary: handleGetDailySalesSummary,
  get_cash_status: handleGetCashStatus,
  get_pending_transfers: handleGetPendingTransfers,
  get_low_stock_products: handleGetLowStockProducts,
  get_product_counts: handleGetProductCounts,
  get_config: handleGetConfig,
  get_user_list: handleGetUserList,
  get_branch_list: handleGetBranchList,
  get_entity_counts: handleGetEntityCounts,
  get_weekly_sales: handleGetWeeklySales,
  get_top_products: handleGetTopProducts,
  compare_branches_sales: handleCompareBranchesSales,
  get_client_credits: handleGetClientCredits,
  get_pending_quotations: handleGetPendingQuotations,
  get_transporters: handleGetTransporters,
  get_suppliers: handleGetSuppliers,
  get_recent_purchases: handleGetRecentPurchases,
  get_pending_orders: handleGetPendingOrders,
  get_treasury_accounts: handleGetTreasuryAccounts,
  get_pending_approvals: handleGetPendingApprovals,
  get_audit_alerts: handleGetAuditAlerts,
  get_kardex_movements: handleGetKardexMovements,
  run_sql: handleRunSql,
};

// ─── Zod schemas por herramienta ─────────────────────────────────────────────

const TOOL_SCHEMAS: Record<string, z.ZodTypeAny> = {
  get_product_stock: z.object({
    query:    z.string().min(2, 'query debe tener al menos 2 caracteres'),
    branchId: z.string().optional(),
  }),
  get_daily_sales_summary: z.object({
    branchId:       z.string().optional(),
    date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateExpression: z.string().optional(),
  }),
  get_cash_status: z.object({
    branchId: z.string().optional(),
  }),
  get_pending_transfers: z.object({
    branchId:  z.string().optional(),
    direction: z.enum(['incoming', 'outgoing', 'both']).optional(),
  }),
  get_low_stock_products: z.object({
    branchId: z.string().optional(),
    limit:    z.union([z.string(), z.number()]).optional(),
  }),
  get_product_counts: z.object({
    branchId: z.string().optional(),
    scope:    z.enum(['all', 'catalog', 'branch', 'active', 'inactive']).optional(),
  }),
  get_config: z.object({}).optional(),
  get_user_list: z.object({
    role:     z.enum(['GERENTE', 'ENCARGADO', 'VENDEDOR']).optional(),
    status:   z.enum(['active', 'suspended']).optional(),
    branchId: z.string().optional(),
  }),
  get_branch_list: z.object({}).optional(),
  get_entity_counts: z.object({
    type: z.enum(['clients', 'suppliers', 'transporters', 'all']).optional(),
  }),
  get_weekly_sales: z.object({
    branchId: z.string().optional(),
    period:   z.string().optional(),
  }),
  get_top_products: z.object({
    branchId: z.string().optional(),
    limit:    z.union([z.string(), z.number()]).optional(),
  }),
  compare_branches_sales: z.object({
    period: z.string().optional(),
  }),
  get_client_credits: z.object({
    branchId: z.string().optional(),
    limit:    z.union([z.string(), z.number()]).optional(),
  }),
  get_pending_quotations: z.object({
    branchId: z.string().optional(),
    status:   z.enum(['PENDING', 'CONVERTED', 'CANCELLED', 'EXPIRED']).optional(),
    limit:    z.union([z.string(), z.number()]).optional(),
  }),
  get_transporters: z.object({
    query: z.string().optional(),
  }),
  get_suppliers: z.object({
    query:  z.string().optional(),
    filter: z.enum(['por_pagar', 'a_favor']).optional(),
  }),
  get_recent_purchases: z.object({
    branchId: z.string().optional(),
    limit:    z.union([z.string(), z.number()]).optional(),
    status:   z.enum(['RECEIVED', 'PENDING']).optional(),
  }),
  get_pending_orders: z.object({
    branchId:  z.string().optional(),
    status:    z.enum(['borrador', 'vigente', 'despachado', 'cancelado']).optional(),
    direction: z.enum(['emitidos', 'entrantes', 'both']).optional(),
  }),
  get_treasury_accounts: z.object({
    type: z.enum(['CASH_DRAWER', 'BANK', 'WALLET']).optional(),
  }),
  get_pending_approvals: z.object({
    category: z.enum(['gastos', 'devoluciones', 'descuentos', 'cancelaciones', 'todas']).optional(),
    limit:    z.union([z.string(), z.number()]).optional(),
  }),
  get_audit_alerts: z.object({
    branchId:   z.string().optional(),
    severity:   z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
    type:       z.enum(['CASH_DISCREPANCY', 'SECURITY', 'INVENTORY_THRESHOLD', 'DISCOUNT_OVERRIDE', 'TRANSFER_DISCREPANCY', 'SHIFT_OPEN_TOO_LONG', 'EXPENSE_LARGE', 'EXPENSE_DUPLICATE']).optional(),
    onlyUnread: z.enum(['true', 'false']).optional(),
    limit:      z.union([z.string(), z.number()]).optional(),
  }),
  get_kardex_movements: z.object({
    query:    z.string().min(2, 'query debe tener al menos 2 caracteres'),
    branchId: z.string().optional(),
    limit:    z.union([z.string(), z.number()]).optional(),
    type:     z.enum(['ENTRADA', 'SALIDA', 'AJUSTE', 'AJUSTE_MASIVO', 'TRASP_ENTRADA', 'TRASP_SALIDA', 'TRASP_REVERSAL', 'ANULACION', 'GARANTIA_ENTRADA', 'GARANTIA_SALIDA', 'CARGA_INICIAL', 'REPOSICION']).optional(),
  }),
  run_sql: z.object({
    query:       z.string().min(10, 'La consulta SQL debe tener al menos 10 caracteres'),
    description: z.string().optional(),
    maxRows:     z.number().positive().optional(),
  }),
};

// ─── Ejecutar tool call (con validación Zod) ──────────────────────────────────

/**
 * Ejecuta una tool call con validación de argumentos y retorna el resultado.
 * Lanza error si la herramienta no existe o los argumentos son inválidos.
 */
export async function executeToolCall(
  call: ToolCall,
  context: ToolContext
): Promise<string> {
  const handler = TOOL_HANDLERS[call.name];
  if (!handler) {
    return `❌ Herramienta desconocida: ${call.name}`;
  }

  // Validar argumentos con Zod
  const schema = TOOL_SCHEMAS[call.name];
  if (schema) {
    const parsed = schema.safeParse(call.arguments);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => i.message).join(', ');
      console.warn(`[Tools] Argumentos inválidos para ${call.name}:`, issues);
      return `❌ Parámetros inválidos para ${call.name}: ${issues}`;
    }
  }

  return handler(call.arguments, context);
}
