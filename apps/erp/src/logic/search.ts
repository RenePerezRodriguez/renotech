import { MasterProduct } from "@/types";
import { normalizeText } from '@/utils/normalize';

/**
 * Motor de Generación de Tags de Búsqueda (Industrial Search v4.0)
 * Extrae términos clave de nombres, códigos OE, códigos de fábrica y códigos internos.
 * Elimina duplicados y caracteres especiales para búsqueda fuzzy.
 */
export const generateSearchTags = (data: Partial<MasterProduct>): string[] => {
    const tags = new Set<string>();

    const addTerms = (text: string | undefined) => {
        if (!text) return;
        const normalized = normalizeText(text);
        const words = normalized.split(/[\s\-\/\.]+/).filter(w => w.length > 1);
        words.forEach(w => tags.add(w));
        // Add full code as a single tag
        tags.add(normalized);
    };

    addTerms(data.nombre);
    addTerms(data.codigo);
    addTerms(data.codigoOE);
    addTerms(data.codigoFabrica);
    addTerms(data.origen);

    return Array.from(tags);
};
