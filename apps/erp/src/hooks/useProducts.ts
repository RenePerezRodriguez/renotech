import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Product, MasterProduct } from '@/types';
import { useBranch } from '@/contexts/BranchContext';
import { BranchService } from '@/services/BranchService';

export function useProducts(branchId: string = 'ALL') {
    const [localStocks, setLocalStocks] = useState<Product[]>([]);
    const [hqStocks, setHqStocks] = useState<Product[]>([]);
    const [masterCatalog, setMasterCatalog] = useState<Record<string, MasterProduct>>({});
    const [hqId, setHqId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { currentBranch, isConsolidatedView, branches, loading: branchLoading } = useBranch();

    // Fetch HQ ID once
    useEffect(() => {
        BranchService.getHQ().then(b => setHqId(b?.id || null));
    }, []);

    // Subscribe to local products
    useEffect(() => {
        if (branchLoading) return;

        const productsRef = collection(db, 'productos');
        let q;

        // Logic priority:
        // 1. If branchId is specified (not 'ALL'), filter by it.
        // 2. If isConsolidatedView and branchId is 'ALL', get everything.
        // 3. Otherwise, use currentBranch.id.
        
        const effectiveBranchId = (isConsolidatedView && branchId === 'ALL') 
            ? null 
            : (branchId !== 'ALL' ? branchId : currentBranch?.id);

        // Avoid querying the full productos collection if we don't yet know the branch.
        if (!effectiveBranchId && !isConsolidatedView) {
            return;
        }

        if (!effectiveBranchId) {
            q = query(productsRef);
        } else {
            q = query(productsRef, where('branchId', '==', effectiveBranchId));
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
            setLocalStocks(items);
            // If current is HQ or we have no HQ yet, this is the only load
            if (!hqId || currentBranch?.id === hqId || isConsolidatedView) {
                setLoading(false);
            }
        }, (err) => {
            setError(err.message);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentBranch?.id, hqId, isConsolidatedView, branchLoading, branchId]);

    // Subscribe to HQ products (only if not already in HQ view)
    useEffect(() => {
        if (branchLoading || !hqId || currentBranch?.id === hqId || isConsolidatedView) {
            return;
        }

        const q = query(collection(db, 'productos'), where('branchId', '==', hqId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
            setHqStocks(items);
            setLoading(false);
        }, (err) => {
            setError(err.message);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [hqId, currentBranch?.id, isConsolidatedView, branchLoading, branchId]);

    // Subscribe to Master Catalog
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'catalogo_maestro'), (snapshot) => {
            const catalog: Record<string, MasterProduct> = {};
            snapshot.forEach(doc => {
                catalog[doc.id] = { id: doc.id, ...doc.data() } as MasterProduct;
            });
            setMasterCatalog(catalog);
        });
        return () => unsubscribe();
    }, []);

    // Efficient Hydration Logic
    const products = useMemo(() => {
        const getBranchName = (id?: string) => {
            if (!id) return 'CENTRAL';
            const b = branches.find(b => b.id === id);
            return b?.name || 'CENTRAL';
        };

        const hydrate = (stock: Partial<Product>, master?: MasterProduct): Product => {
            const m = master || masterCatalog[stock.masterId || ''];
            return {
                ...stock,
                id: stock.id || `virtual-${m?.id}-${stock.branchId || currentBranch?.id}`,
                masterId: m?.id || stock.masterId || '',
                // --- Datos del Catálogo Maestro (heredados) ---
                codigo: m?.codigo || 'S/N',
                nombre: m?.nombre || 'Producto no vinculado',
                marca: m?.marcaId || 'N/A', 
                categoria: m?.categoriaId || 'N/A',
                imagenUrl: m?.imagenUrls?.[0],
                origen: m?.origen || '',
                codigoOE: m?.codigoOE || '',
                codigoFabrica: m?.codigoFabrica || '',
                descripcion: m?.descripcion || '',
                unidad: m?.unidad || 'PZA',
                precioUSD: m?.precioUSD || 0,
                // --- Datos Financieros (local > maestro) ---
                costo: stock.costo !== undefined ? stock.costo : (m?.costoBase || 0),
                precio: (stock.precioOverride != null) ? stock.precioOverride : (m?.precioDefault || 0),
                precioConFactura: (stock.precioConFactura != null && stock.precioConFactura > 0) ? stock.precioConFactura : ((stock.precioOverride != null && stock.precioOverride > 0) ? stock.precioOverride : (m?.precioConFactura || m?.precioDefault || 0)),
                precioSinFactura: (stock.precioSinFactura != null && stock.precioSinFactura > 0) ? stock.precioSinFactura : ((stock.precioOverride != null && stock.precioOverride > 0) ? stock.precioOverride : (m?.precioSinFactura || m?.precioDefault || 0)),
                precioMayorista: stock.precioMayorista || 0,
                barcode: stock.barcode || '',
                supplierId: stock.supplierId || '',
                // --- Datos Operativos ---
                branchName: getBranchName(stock.branchId || currentBranch?.id),
                isLocal: (stock.branchId || currentBranch?.id) === currentBranch?.id,
                stock: stock.stock || 0,
                stockHQ: stock.stockHQ || 0,
                ubicacionFisica: stock.ubicacionFisica || '',
                branchId: stock.branchId || currentBranch?.id || '',
                isActive: stock.isActive ?? m?.isActive ?? true,
                isHQVirtual: stock.isHQVirtual || false,
                createdAt: stock.createdAt || m?.createdAt || null,
                updatedAt: stock.updatedAt || m?.updatedAt || null
            } as Product;
        };

        // En vista consolidada, mostramos solo las instancias reales por sucursal
        if (isConsolidatedView) {
            return localStocks.map(s => hydrate(s)).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        }

        const localMap = new Map(localStocks.map(s => [s.masterId, s]));
        const hqMap = new Map(hqStocks.map(s => [s.masterId, s]));

        const merged: Product[] = [];

        // Asegurar que absolutamente TODO el catálogo maestro se muestre, con stock 0 si no existe localmente
        Object.values(masterCatalog).forEach(master => {
            if (master.isActive === false) return; // Saltamos productos borrados/inactivos globalmente

            const local = localMap.get(master.id!);
            const hq = hqMap.get(master.id!);

            // Generamos o hidratamos el producto
            const product = hydrate(local || { masterId: master.id!, branchId: currentBranch?.id }, master);

            // Inyectar datos de la casa matriz para traslados y visualización (si aplica)
            if (hqId && currentBranch?.id !== hqId) {
                if (!local && hq) {
                    product.isHQVirtual = true;
                }
                product.stockHQ = hq?.stock || 0;
            }

            merged.push(product);
        });

        return merged.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    }, [localStocks, hqStocks, masterCatalog, hqId, currentBranch?.id, isConsolidatedView, branches]);

    return { products, loading: loading || branchLoading, error };
}

