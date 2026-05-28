export const ENTRY_TYPES = new Set([
    'ENTRADA',
    'TRASP_ENTRADA',
    'TRASP_REVERSAL',
    'GARANTIA_ENTRADA',
    'ANULACION',
    'CARGA_INICIAL',
    'REPOSICION',
]);

export const EXIT_TYPES = new Set([
    'SALIDA',
    'TRASP_SALIDA',
    'GARANTIA_SALIDA',
]);

export function getMovementDelta(type: string, quantity: number): number {
    if (ENTRY_TYPES.has(type)) return Math.abs(quantity);
    if (EXIT_TYPES.has(type)) return -Math.abs(quantity);
    return quantity;
}
