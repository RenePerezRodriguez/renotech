/**
 * Motor de embeddings semánticos usando Vertex AI (Google Cloud).
 *
 * Modelo: text-multilingual-embedding-002 (768 dimensiones, excelente en español)
 * Auth:   Reutiliza el service account de FIREBASE_SERVICE_ACCOUNT_KEY
 * Costo:  ~$0.0001 / 1k caracteres — prácticamente gratis para este volumen
 *
 * Compatible con Cloud Run (sin modelo en RAM, sin cold-start penalty).
 */

import { GoogleAuth } from 'google-auth-library';

const PROJECT_ID = 'renotech-cloud-app';
const LOCATION   = 'us-central1';
const MODEL      = 'text-multilingual-embedding-002';
const ENDPOINT   = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

// ─── Auth client (singleton, token se renueva automáticamente) ────────────────

let _auth: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (_auth) return _auth;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('[Embeddings] FIREBASE_SERVICE_ACCOUNT_KEY no configurada');
  const credentials = JSON.parse(raw);
  _auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  return _auth;
}

// ─── Embedding ────────────────────────────────────────────────────────────────

/**
 * Convierte un texto en un vector de 768 dimensiones.
 * El vector ya está normalizado (L2), por lo que el dot product = cosine similarity.
 */
export async function embedText(text: string): Promise<number[]> {
  const auth   = getAuth();
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('[Embeddings] No se pudo obtener token GCP');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ content: text }],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[Embeddings] Vertex AI ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const values = data?.predictions?.[0]?.embeddings?.values as number[] | undefined;
  if (!values) throw new Error('[Embeddings] Respuesta inesperada de Vertex AI');
  return values;
}

/**
 * Computa embeddings en lote con reintentos individuales.
 * Usa Promise.allSettled para que un fallo parcial no mate todo el lote.
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const results = await Promise.allSettled(texts.map(embedText));
  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.error(`[Embeddings] Falló chunk ${i}:`, r.reason);
    return null;
  });
}

// ─── Similitud coseno ─────────────────────────────────────────────────────────

/**
 * Similitud coseno entre dos vectores.
 * Los vectores de Vertex AI ya están normalizados → dot product = cosine similarity.
 * Implementación manual para evitar dependencias de álgebra lineal.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
