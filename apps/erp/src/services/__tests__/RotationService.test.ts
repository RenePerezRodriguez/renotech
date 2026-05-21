import { describe, it, expect } from 'vitest';
import { consumirLotes, __testables, type Lote } from '@/services/RotationService';

const { semaforo, ROTACION_VERDE, ROTACION_AMARILLO } = __testables;

function mkLote(compraId: string, cantDisp: number, costo: number = 10): Lote {
    return { compraId, fecha: '', sucursalCompra: '', cantDisp, costo };
}

describe('RotationService.semaforo', () => {
    it('clasifica >= 70% como verde', () => {
        expect(semaforo(70)).toBe('verde');
        expect(semaforo(100)).toBe('verde');
        expect(semaforo(ROTACION_VERDE)).toBe('verde');
    });

    it('clasifica 30-69% como amarillo', () => {
        expect(semaforo(30)).toBe('amarillo');
        expect(semaforo(50)).toBe('amarillo');
        expect(semaforo(69.99)).toBe('amarillo');
        expect(semaforo(ROTACION_AMARILLO)).toBe('amarillo');
    });

    it('clasifica < 30% como rojo', () => {
        expect(semaforo(0)).toBe('rojo');
        expect(semaforo(29.99)).toBe('rojo');
        expect(semaforo(ROTACION_AMARILLO - 0.01)).toBe('rojo');
    });
});

describe('RotationService.consumirLotes (FIFO)', () => {
    it('no hace nada si producto no existe en colas', () => {
        const colas = new Map<string, Lote[]>();
        consumirLotes(colas, 'p1', 5);
        expect(colas.size).toBe(0);
    });

    it('consume del lote más antiguo primero', () => {
        const colas = new Map<string, Lote[]>([
            ['p1', [mkLote('cA', 10), mkLote('cB', 5)]],
        ]);
        consumirLotes(colas, 'p1', 3);
        const lote = colas.get('p1')!;
        expect(lote[0].compraId).toBe('cA');
        expect(lote[0].cantDisp).toBe(7);
        expect(lote[1].cantDisp).toBe(5);
    });

    it('avanza al siguiente lote cuando el primero se agota', () => {
        const colas = new Map<string, Lote[]>([
            ['p1', [mkLote('cA', 10), mkLote('cB', 5)]],
        ]);
        consumirLotes(colas, 'p1', 12);
        const lote = colas.get('p1')!;
        expect(lote.length).toBe(1);
        expect(lote[0].compraId).toBe('cB');
        expect(lote[0].cantDisp).toBe(3);
    });

    it('elimina la entrada del mapa cuando se consumen todos los lotes', () => {
        const colas = new Map<string, Lote[]>([
            ['p1', [mkLote('cA', 10), mkLote('cB', 5)]],
        ]);
        consumirLotes(colas, 'p1', 15);
        expect(colas.has('p1')).toBe(false);
    });

    it('si se pide más de lo disponible, vacía pero no falla', () => {
        const colas = new Map<string, Lote[]>([
            ['p1', [mkLote('cA', 10)]],
        ]);
        consumirLotes(colas, 'p1', 100);
        expect(colas.has('p1')).toBe(false);
    });

    it('cantidad 0 no muta nada', () => {
        const colas = new Map<string, Lote[]>([
            ['p1', [mkLote('cA', 10)]],
        ]);
        consumirLotes(colas, 'p1', 0);
        expect(colas.get('p1')![0].cantDisp).toBe(10);
    });

    it('múltiples productos son independientes', () => {
        const colas = new Map<string, Lote[]>([
            ['p1', [mkLote('cA', 10)]],
            ['p2', [mkLote('cB', 20)]],
        ]);
        consumirLotes(colas, 'p1', 5);
        expect(colas.get('p1')![0].cantDisp).toBe(5);
        expect(colas.get('p2')![0].cantDisp).toBe(20);
    });
});

describe('FIFO sell-through con devoluciones (simulación)', () => {
    /**
     * Simula el modelo lacasavolvo: compra de 10 unidades + venta de 8 + devolución
     * a proveedor de 1 unidad → quedan 1 en stock; rotación = 8/10 = 80% (verde).
     */
    it('compra(10) → venta(8) → devolucion(1) deja 1 en stock', () => {
        const colas = new Map<string, Lote[]>([
            ['p1', [mkLote('cA', 10, 50)]],
        ]);
        // Venta consume 8
        consumirLotes(colas, 'p1', 8);
        expect(colas.get('p1')![0].cantDisp).toBe(2);
        // Devolución a proveedor (GARANTIA_SALIDA) consume 1 más
        consumirLotes(colas, 'p1', 1);
        expect(colas.get('p1')![0].cantDisp).toBe(1);
    });

    it('venta multi-lote: 12 unidades cruzando lotes A(10) y B(5) consume 10+2', () => {
        const colas = new Map<string, Lote[]>([
            ['p1', [mkLote('cA', 10, 50), mkLote('cB', 5, 60)]],
        ]);
        consumirLotes(colas, 'p1', 12);
        // Lote A vacío y removido; B con 3 restantes
        const restante = colas.get('p1')!;
        expect(restante.length).toBe(1);
        expect(restante[0].compraId).toBe('cB');
        expect(restante[0].cantDisp).toBe(3);
    });
});
