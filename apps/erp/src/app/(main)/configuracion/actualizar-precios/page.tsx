'use client';
import { useState } from 'react';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/types';

const BATCH_SIZE = 400; // Firestore límite es 500; dejamos margen.

export default function UpdatePricesPage() {
    const { role } = useAuth();
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(false);
    const [margins] = useState({ sf: 1.30, cf: 1.45 });

    if (role !== 'GERENTE') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Acceso Restringido</h2>
                <p className="text-sm text-slate-500">Solo el rol GERENTE puede actualizar precios masivamente.</p>
            </div>
        );
    }


    const updateAll = async () => {
        setLoading(true);
        setStatus('Cargando productos…');
        try {
            const querySnapshot = await getDocs(collection(db, 'productos'));
            const products = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));

            // Filtrar productos con costo válido
            const targets = products.filter(p => (p.costo || 0) > 0 && p.id);
            setStatus(`Aplicando nuevos precios a ${targets.length} de ${products.length} productos…`);

            let processed = 0;
            for (let i = 0; i < targets.length; i += BATCH_SIZE) {
                const slice = targets.slice(i, i + BATCH_SIZE);
                const batch = writeBatch(db);
                for (const p of slice) {
                    const costo = p.costo || 0;
                    const precioSinFactura = Math.ceil(costo * margins.sf);
                    const precioConFactura = Math.ceil(costo * margins.cf);
                    batch.update(doc(db, 'productos', p.id!), { precioSinFactura, precioConFactura });
                }
                await batch.commit();
                processed += slice.length;
                setStatus(`Actualizados ${processed} de ${targets.length}…`);
            }

            setStatus(`Listo. Se actualizaron ${processed} productos.`);
        } catch (e: unknown) {
            console.error('updateAll prices:', e);
            const msg = e instanceof Error ? e.message : 'Error desconocido';
            // Si Firestore rechaza por reglas, mostrar amigable
            const friendly = msg.includes('PERMISSION_DENIED')
                ? 'No tienes permiso para actualizar precios. Verifica tu rol.'
                : 'No se pudieron actualizar todos los precios. Reintenta.';
            setStatus(friendly);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 sm:p-10 flex flex-col items-center justify-center min-h-[50vh] sm:min-h-screen max-w-lg mx-auto w-full min-w-0 bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white">
            <h1 className="text-3xl font-bold mb-6">Update Product Prices</h1>
            <p className="mb-8 text-center max-w-md">
                This utility will update all products with calculated prices based on your <a href="/configuracion" className="text-blue-500 underline font-bold">General Settings</a>:
                <br />
                <code className="bg-gray-200 dark:bg-white/5 px-1 rounded">Sin Factura = Cost * {margins.sf.toFixed(2)}</code>
                <br />
                <code className="bg-gray-200 dark:bg-white/5 px-1 rounded">Con Factura = Cost * {margins.cf.toFixed(2)}</code>
            </p>
            <button
                onClick={updateAll}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl disabled:opacity-50 transition-all shadow-lg"
            >
                {loading ? 'Processing...' : 'Run Update Script'}
            </button>
            <div className="mt-8 font-mono text-sm bg-slate-100 dark:bg-white/5 p-4 rounded-xl w-full max-w-md text-center border border-slate-200 dark:border-white/10">
                Status: {status || 'Ready to start'}
            </div>
        </div>
    );
}

