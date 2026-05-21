import type { Branch } from '@/types';

/**
 * Tipo operativo de la sucursal:
 * - VENTA: opera caja diaria (POS, ventas, gastos), requiere apertura/cierre de turnos.
 * - MATRIZ: administrativa/almacén central. Maneja compras y pagos a proveedores
 *           usualmente por banco (transferencia/QR). NO requiere caja física diaria.
 *
 * Si el campo `tipo` no está definido, se infiere desde `isHQ`:
 *   isHQ === true  → MATRIZ
 *   isHQ === false → VENTA
 */
export function getBranchTipo(branch?: Pick<Branch, 'tipo' | 'isHQ'> | null): 'VENTA' | 'MATRIZ' {
    if (!branch) return 'VENTA';
    if (branch.tipo) return branch.tipo;
    return branch.isHQ ? 'MATRIZ' : 'VENTA';
}

export function isMatriz(branch?: Pick<Branch, 'tipo' | 'isHQ'> | null): boolean {
    return getBranchTipo(branch) === 'MATRIZ';
}

export function isPuntoVenta(branch?: Pick<Branch, 'tipo' | 'isHQ'> | null): boolean {
    return getBranchTipo(branch) === 'VENTA';
}
