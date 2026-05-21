import { useState, useEffect, useCallback } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Industrial Hook to fetch items from any transaction sub-collection (ventas, cotizaciones, compras, pedidos, envios)
 */
export function useTransactionItems<T>(transactionId: string | undefined, collectionName: 'ventas' | 'cotizaciones' | 'compras' | 'pedidos' | 'envios') {
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const fetchItems = useCallback(async () => {
        if (!transactionId) {
            setItems([]);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const q = query(collection(db, `${collectionName}/${transactionId}/items`));
            const snapshot = await getDocs(q);
            const fetchedItems = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as T));
            setItems(fetchedItems);
        } catch (err) {
            setError(`No se pudieron cargar los ítems de la transacción.`);
        } finally {
            setLoading(false);
        }
    }, [transactionId, collectionName]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    return { items, loading, error, refetch: fetchItems };
}
