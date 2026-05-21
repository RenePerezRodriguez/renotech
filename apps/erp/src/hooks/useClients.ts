import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Client } from '@/types';

export function useClients(branchId?: string) {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let q = query(collection(db, 'clientes'), orderBy('razonSocial'));

        if (branchId) {
            q = query(q, where('branchId', '==', branchId));
        }

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const items: Client[] = [];
                snapshot.forEach((doc) => {
                    items.push({ id: doc.id, ...doc.data() } as Client);
                });
                setClients(items);
                setLoading(false);
            },
            (err) => {
                console.error("Error fetching clients:", err);
                setError(err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [branchId]);

    return { clients, loading, error };
}
