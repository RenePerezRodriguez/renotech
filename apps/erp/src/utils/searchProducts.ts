import { normalizeText } from './normalize';
import { Product } from '@/types';

const FIELDS: { key: keyof Product; weight: number }[] = [
    { key: 'codigo',        weight: 10 },
    { key: 'codigoFabrica', weight: 9  },
    { key: 'codigoOE',      weight: 9  },
    { key: 'barcode',       weight: 8  },
    { key: 'nombre',        weight: 7  },
    { key: 'marca',         weight: 5  },
    { key: 'categoria',     weight: 4  },
    { key: 'origen',        weight: 3  },
    { key: 'descripcion',   weight: 2  },
];

function scoreField(raw: string, term: string, weight: number): number {
    const v = normalizeText(raw);
    if (!v) return 0;

    if (v === term)           return weight * 4;   // exacto
    if (v.startsWith(term))   return weight * 2;   // prefijo
    if (v.includes(term))     return weight;       // contiene

    // Comparación sin separadores: "32715100" encuentra "L-327-15-100"
    const vStrip = v.replace(/[-\/\s_.]/g, '');
    const tStrip = term.replace(/[-\/\s_.]/g, '');
    if (tStrip.length >= 3 && vStrip.includes(tStrip)) return weight * 0.8;

    return 0;
}

function scoreForTerm(p: Product, term: string): number {
    let best = 0;
    for (const { key, weight } of FIELDS) {
        const val = String((p as unknown as Record<string, unknown>)[key] ?? '');
        const s = scoreField(val, term, weight);
        if (s > best) best = s;
    }
    return best;
}

/**
 * Búsqueda inteligente sobre un array de productos ya en memoria.
 * Lógica AND: todas las palabras del query deben aparecer en algún campo.
 * Devuelve productos ordenados por relevancia, máximo `limit`.
 */
export function searchProducts(products: Product[], query: string, limit = 20): Product[] {
    const q = query.trim();
    if (!q) return [];

    const terms = normalizeText(q).split(/\s+/).filter(t => t.length > 0);
    if (terms.length === 0) return [];

    const scored: { p: Product; score: number }[] = [];

    for (const p of products) {
        let total = 0;
        for (const term of terms) {
            const s = scoreForTerm(p, term);
            if (s === 0) { total = 0; break; }   // AND: si un término no coincide, fuera
            total += s;
        }
        if (total > 0) scored.push({ p, score: total });
    }

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(x => x.p);
}
