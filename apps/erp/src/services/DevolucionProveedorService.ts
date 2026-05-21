import { db } from '@/lib/firebase';
import {
    collection,
    doc,
    runTransaction,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    increment,
} from 'firebase/firestore';

export interface DevolucionItem {
    masterId: string;
    productCode: string;
    productName: string;
    codigoFabrica?: string;
    codigoOE?: string;
    marca?: string;
    quantity: number;
    cost: number;
    total: number;
    productId: string; // ID en la sucursal de origen
}

export interface DevolucionProveedor {
    id?: string;
    proveedorNombre: string;
    empresaId: string;
    accountId?: string; // Opcional, si afecta a una cuenta específica
    fecha: Date;
    items: DevolucionItem[];
    itemCount: number;
    totalUnits: number;
    totalValue: number;
    motivo: string;
    branchId: string;
    branchName: string;
    status: 'COMPLETADO' | 'ANULADO';
    usuarioId: string;
    usuarioNombre: string;
    createdAt?: Date;
}

const COL = 'devoluciones_proveedor';

export const DevolucionProveedorService = {
    subscribeByEmpresa(empresaId: string, callback: (data: DevolucionProveedor[]) => void) {
        const q = query(
            collection(db, COL),
            where('empresaId', '==', empresaId),
            orderBy('fecha', 'desc')
        );
        return onSnapshot(q, (snap) => {
            const items = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    ...data,
                    fecha: data.fecha?.toDate() || new Date(),
                    createdAt: data.createdAt?.toDate(),
                } as DevolucionProveedor;
            });
            callback(items);
        });
    },

    subscribeAll(callback: (data: DevolucionProveedor[]) => void) {
        const q = query(collection(db, COL), orderBy('fecha', 'desc'));
        return onSnapshot(q, (snap) => {
            const items = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    ...data,
                    fecha: data.fecha?.toDate() || new Date(),
                    createdAt: data.createdAt?.toDate(),
                } as DevolucionProveedor;
            });
            callback(items);
        });
    },

    async createAtomic(input: {
        empresaId: string;
        empresaNombre: string;
        accountId: string; // Cuenta a la que se le debitará el saldo
        branchId: string;
        branchName: string;
        items: DevolucionItem[];
        motivo: string;
        usuarioId: string;
        usuarioNombre: string;
    }): Promise<string> {
        if (!input.items.length) throw new Error('No hay productos para devolver');
        
        let totalUnits = 0;
        let totalValue = 0;
        input.items.forEach(it => {
            totalUnits += it.quantity;
            totalValue += it.total;
        });

        let newId = '';

        await runTransaction(db, async (tx) => {
            // 1. Leer cuenta y empresa para validar que existen
            const cuentaRef = doc(db, 'cuentas_proveedores', input.accountId);
            const cuentaSnap = await tx.get(cuentaRef);
            if (!cuentaSnap.exists()) throw new Error('Cuenta de proveedor no encontrada');

            const empresaRef = doc(db, 'empresas', input.empresaId);
            const empresaSnap = await tx.get(empresaRef);
            if (!empresaSnap.exists()) throw new Error('Empresa no encontrada');

            // 2. Descontar stock de la sucursal (productos)
            const resolvedStocks: Record<string, { current: number, previous: number }> = {};
            for (const item of input.items) {
                const pRef = doc(db, 'productos', item.productId);
                const pSnap = await tx.get(pRef);
                if (!pSnap.exists()) throw new Error(`Producto ${item.productCode} no existe en la sucursal`);
                
                const currentStock = pSnap.data().stock || 0;
                if (currentStock < item.quantity) {
                    throw new Error(`Stock insuficiente para ${item.productCode} (Disp: ${currentStock}, Req: ${item.quantity})`);
                }
                const newStock = currentStock - item.quantity;
                resolvedStocks[item.productId] = { previous: currentStock, current: newStock };

                tx.update(pRef, {
                    stock: newStock,
                    updatedAt: serverTimestamp(),
                });
            }

            // 3. Registrar GARANTIA_SALIDA en kardex (movimientos)
            const movCol = collection(db, 'movimientos');
            for (const item of input.items) {
                const movRef = doc(movCol);
                const stocks = resolvedStocks[item.productId];
                tx.set(movRef, {
                    productId: item.productId,
                    masterId: item.masterId,
                    type: 'GARANTIA_SALIDA',
                    quantity: -item.quantity, // negativo porque es salida
                    currentStock: stocks.current,
                    previousStock: stocks.previous,
                    date: serverTimestamp(),
                    branchId: input.branchId,
                    userId: input.usuarioId,
                    userName: input.usuarioNombre,
                    unitCost: item.cost, // estandarizar a unitCost o costo
                    costo: item.cost,
                    notes: `Devolución a proveedor: ${input.empresaNombre}. ${input.motivo}`,
                    createdAt: serverTimestamp(),
                });
            }

            // 4. Ajustar saldo financiero
            // Si hacemos una devolución, el proveedor NOS DEBE o NUESTRA DEUDA DISMINUYE.
            // En el sistema, `saldo` > 0 significa "debemos al proveedor".
            // Para disminuir nuestra deuda (o crear saldo a favor), decrementamos el saldo.
            tx.update(cuentaRef, {
                saldo: increment(-totalValue),
                updatedAt: serverTimestamp(),
            });
            tx.update(empresaRef, {
                saldoTotal: increment(-totalValue),
                updatedAt: serverTimestamp(),
            });

            // 5. Crear el documento de la devolución
            const devCol = collection(db, COL);
            const devRef = doc(devCol);
            newId = devRef.id;
            
            tx.set(devRef, {
                proveedorNombre: input.empresaNombre,
                empresaId: input.empresaId,
                accountId: input.accountId,
                fecha: serverTimestamp(),
                items: input.items,
                itemCount: input.items.length,
                totalUnits,
                totalValue,
                motivo: input.motivo,
                branchId: input.branchId,
                branchName: input.branchName,
                status: 'COMPLETADO',
                usuarioId: input.usuarioId,
                usuarioNombre: input.usuarioNombre,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        });

        return newId;
    }
};
