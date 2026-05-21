/**
 * Normalizes text by converting to lowercase and removing accents/diacritics.
 * Example: "Batería" -> "bateria"
 */
export const normalizeText = (text: string | null | undefined): string => {
    if (!text) return '';
    return text
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
};
