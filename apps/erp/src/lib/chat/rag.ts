/**
 * RAG (Retrieval-Augmented Generation) — búsqueda semántica sobre /docs.
 *
 * Estrategia:
 *   1. Al primer uso, carga todos los .md de /docs y los divide en chunks por sección.
 *   2. Cada chunk se embede con Vertex AI (text-multilingual-embedding-002).
 *   3. Las búsquedas usan similitud coseno en lugar de TF-IDF.
 *
 * Resultado: "verificar cuentas" encuentra "conciliación bancaria" aunque no
 * compartan ninguna palabra. Mucho mejor para preguntas en lenguaje natural.
 */

import fs   from 'fs';
import path from 'path';
import { embedText, embedBatch, cosineSimilarity } from './embeddings';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DocChunk {
  id:        string;
  title:     string;
  section:   string;
  content:   string;
  embedding: number[] | null; // null si el embedding falló
}

// ─── Carga y chunking ─────────────────────────────────────────────────────────

const DOCS_DIR      = path.join(process.cwd(), 'docs');
const MAX_CHUNK     = 1200; // caracteres máximos por chunk

function loadMarkdownFiles(dir: string): { filePath: string; content: string }[] {
  const files: { filePath: string; content: string }[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...loadMarkdownFiles(full));
    else if (entry.name.endsWith('.md')) files.push({ filePath: full, content: fs.readFileSync(full, 'utf-8') });
  }
  return files;
}

function chunkMarkdown(content: string, title: string): Omit<DocChunk, 'embedding'>[] {
  const chunks: Omit<DocChunk, 'embedding'>[] = [];
  const lines = content.split('\n');
  let section = title;
  let current = '';
  let idx     = 0;

  const flush = () => {
    if (current.trim().length > 60) {
      chunks.push({ id: `${title}_${idx++}`, title, section, content: current.trim() });
    }
    current = '';
  };

  for (const line of lines) {
    const header = line.match(/^#{1,3}\s+(.+)/);
    if (header) {
      flush();
      section  = header[1].trim();
      current  = line + '\n';
    } else {
      current += line + '\n';
      if (current.length > MAX_CHUNK) flush();
    }
  }
  flush();
  return chunks;
}

// ─── Índice en memoria ────────────────────────────────────────────────────────

let _chunks: DocChunk[] | null = null;
let _indexReady: Promise<DocChunk[]> | null = null;

async function buildIndex(): Promise<DocChunk[]> {
  const files  = loadMarkdownFiles(DOCS_DIR);
  const raw: Omit<DocChunk, 'embedding'>[] = [];

  for (const file of files) {
    const title = path.basename(file.filePath, '.md').replace(/_/g, ' ');
    raw.push(...chunkMarkdown(file.content, title));
  }

  // Embede todos los chunks en paralelo (Promise.allSettled por seguridad)
  const embeddings = await embedBatch(raw.map(c => `${c.title}: ${c.section}\n${c.content}`));

  const chunks: DocChunk[] = raw.map((c, i) => ({ ...c, embedding: embeddings[i] }));
  console.log(`[RAG] Indexados ${chunks.length} chunks (${files.length} docs)`);
  return chunks;
}

function getChunks(): Promise<DocChunk[]> {
  if (_chunks) return Promise.resolve(_chunks);
  if (_indexReady) return _indexReady;

  _indexReady = buildIndex().then(chunks => {
    _chunks = chunks;
    return chunks;
  }).catch(err => {
    console.error('[RAG] Error al indexar:', err);
    _indexReady = null; // permite reintentar
    return [];
  });

  return _indexReady;
}

// ─── Búsqueda semántica ───────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.3;

/**
 * Busca los chunks más relevantes para una query usando similitud coseno.
 * Fallback: si el embedding de la query falla, retorna array vacío.
 */
export async function searchDocs(query: string, topK = 5): Promise<DocChunk[]> {
  const chunks = await getChunks();
  if (chunks.length === 0) return [];

  let queryEmb: number[];
  try {
    queryEmb = await embedText(query);
  } catch (err) {
    console.error('[RAG] No se pudo embeder la query:', err);
    return [];
  }

  return chunks
    .filter(c => c.embedding !== null)
    .map(c => ({ chunk: c, score: cosineSimilarity(queryEmb, c.embedding!) }))
    .filter(r => r.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(r => r.chunk);
}

/**
 * Construye el bloque de contexto RAG para inyectar en el system prompt.
 */
export function buildRagContext(chunks: DocChunk[]): string {
  if (chunks.length === 0) return '';
  return chunks
    .map((c, i) => `[Doc ${i + 1}: ${c.title} › ${c.section}]\n${c.content}`)
    .join('\n\n---\n\n');
}

/**
 * Fuerza la pre-carga del índice (útil para warm-up en startup).
 * Llamar desde route handler en el primer request.
 */
export function warmupRag(): void {
  getChunks().catch(() => {});
}
