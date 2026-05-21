'use client';

import { useEffect } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useProductStore } from '@/store/productStore';
import { useBranch } from '@/contexts/BranchContext';

/**
 * Monta una suscripción a useProducts y sincroniza los resultados al productStore global.
 * Colocado en (main)/layout.tsx para que todos los módulos compartan los mismos datos en memoria.
 */
export function ProductCacheProvider({ children }: { children: React.ReactNode }) {
    const { currentBranch, isConsolidatedView } = useBranch();
    const effectiveBranchId = isConsolidatedView ? 'ALL' : (currentBranch?.id ?? '');

    const { products, loading } = useProducts(effectiveBranchId);

    const setProducts = useProductStore(s => s.setProducts);
    const setLoading  = useProductStore(s => s.setLoading);

    useEffect(() => { setLoading(loading); }, [loading, setLoading]);

    useEffect(() => {
        if (!loading && effectiveBranchId) {
            setProducts(products, effectiveBranchId);
        }
    }, [products, loading, effectiveBranchId, setProducts]);

    return <>{children}</>;
}
