/**
 * BigQuery client for the AI assistant.
 *
 * The AI generates SQL against the renotech_data dataset.
 * Auth reuses FIREBASE_SERVICE_ACCOUNT_KEY credentials (same SA used for Vertex AI).
 *
 * Available views — always query these (not the *_raw tables):
 *   renotech_data.v_ventas       — current state of all sales (deduplicated)
 *   renotech_data.v_ventas_items — line items per sale
 *   renotech_data.v_catalogo     — current product catalog
 *   renotech_data.v_clientes     — current clients
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT  = 'renotech-cloud-app';
const DATASET  = 'renotech_data';
const TIMEOUT  = 25_000;          // 25 s per query
const MAX_SAFE = 500;             // hard cap on rows returned

let _bq: BigQuery | null = null;

function getBqClient(): BigQuery {
  if (_bq) return _bq;

  const keyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!keyEnv) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');

  const sa = JSON.parse(keyEnv) as { client_email: string; private_key: string };

  _bq = new BigQuery({
    projectId: PROJECT,
    credentials: {
      client_email: sa.client_email,
      private_key:  sa.private_key,
    },
  });

  return _bq;
}

export interface BqQueryResult {
  rows:      Record<string, unknown>[];
  columns:   string[];
  totalRows: number;
  truncated: boolean;
}

/**
 * Runs a SELECT query against renotech_data and returns up to maxRows rows.
 * Throws on non-SELECT SQL or BigQuery errors.
 */
export async function runBqQuery(sql: string, maxRows = 100): Promise<BqQueryResult> {
  const clean = sql.trim().replace(/;+$/, '');

  const firstWord = clean.split(/\s+/)[0]?.toUpperCase() ?? '';
  if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
    throw new Error('Solo se permiten consultas SELECT en el asistente.');
  }

  const limit = Math.min(maxRows, MAX_SAFE);
  const bq    = getBqClient();

  // bq.query(Query) → Promise<SimpleQueryRowsResponse> = [RowMetadata[], IJob]
  const [rows] = await bq.query({
    query: clean,
    location: 'us-central1',
    jobTimeoutMs: TIMEOUT,
    maxResults: limit + 1,
    defaultDataset: { datasetId: DATASET, projectId: PROJECT },
  });

  const truncated = rows.length > limit;
  const trimmed   = truncated ? rows.slice(0, limit) : rows;
  const columns   = trimmed.length > 0 ? Object.keys(trimmed[0]) : [];

  return {
    rows:      trimmed as Record<string, unknown>[],
    columns,
    totalRows: truncated ? limit + 1 : rows.length,
    truncated,
  };
}

/**
 * Formats a BqQueryResult as a Markdown table for the LLM.
 */
export function formatBqResult(result: BqQueryResult, description?: string): string {
  const { rows, columns, truncated, totalRows } = result;

  if (rows.length === 0) {
    return description
      ? `No hay datos para: _${description}_`
      : 'La consulta no retornó resultados.';
  }

  const hdrs  = `| ${columns.join(' | ')} |`;
  const sep   = `| ${columns.map(() => '---').join(' | ')} |`;
  const shown = rows.slice(0, 50);
  const body  = shown
    .map((r) => `| ${columns.map((c) => String(r[c] ?? '')).join(' | ')} |`)
    .join('\n');

  let out = `${hdrs}\n${sep}\n${body}`;

  if (truncated || rows.length > 50) {
    out += `\n\n_Mostrando ${shown.length} de ${totalRows}+ filas._`;
  }

  return out;
}
