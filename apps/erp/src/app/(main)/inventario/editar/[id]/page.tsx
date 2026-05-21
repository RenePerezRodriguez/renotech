'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ModuleHeader from '@/components/common/ModuleHeader';
import { Package, ChevronLeft } from 'lucide-react';
import ProductForm from '../../components/ProductForm';
import { InventoryService } from '@/services/InventoryService';
import { logAdminAction } from '@/lib/audit';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Product } from '@/types';
import { toast } from 'sonner';

export default function EditProductPage() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;
    const { user: currentUser } = useAuth();
    const { currentBranch, isHQ: isBranchHQ } = useBranch();

    const [isLoading, setIsLoading] = useState(false);
    const [initialData, setInitialData] = useState<Product | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;

        const fetchProduct = async () => {
            setIsLoading(true);
            try {
                const product = await InventoryService.getProductById(id);
                if (product) {
                    setInitialData(product);
                } else {
                    setError('El producto no existe');
                }
            } catch {
                setError('Error al cargar el producto');
            } finally {
                setIsLoading(false);
            }
        };

        fetchProduct();
    }, [id]);

    const handleSubmit = async (data: Omit<Product, 'id'>) => {
        setIsLoading(true);
        try {
            const newId = await InventoryService.updateProduct(id, data, isBranchHQ, currentBranch?.id);
            await logAdminAction(
                currentUser?.uid || '?',
                currentUser?.email || '?',
                'UPDATE_PRODUCT',
                newId,
                currentBranch?.id || 'GLOBAL',
                `Producto: ${data.nombre} ${id.startsWith('virtual-') ? '(Inicialización)' : ''}`
            );
            toast.success(id.startsWith('virtual-') ? 'Producto activado en sucursal' : 'Producto actualizado');
            router.push('/inventario');
        } catch {
            toast.error('Error al procesar el producto');
        } finally {
            setIsLoading(false);
        }
    };

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50 dark:bg-[#0f1523]">
                <div className="w-24 h-24 bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center mb-6 border border-rose-500/20 shadow-2xl shadow-rose-500/10">
                    <Package size={48} strokeWidth={1} />
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-4">{error}</h2>
                <button
                    onClick={() => router.push('/inventario')}
                    className="flex items-center gap-2 px-8 py-4 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black text-[10px] font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all active:scale-95 shadow-xl"
                >
                    <ChevronLeft size={16} strokeWidth={3} />
                    Volver al Inventario
                </button>
            </div>
        );
    }

    if (!initialData && isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-[#0f1523]">
                <div className="relative">
                    <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    <Package className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-500/50" size={24} />
                </div>
                <p className="mt-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] animate-pulse">Sincronizando Data Vault...</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full bg-slate-50 dark:bg-background relative overflow-hidden">
            <div className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col overflow-y-auto relative z-10 custom-scrollbar min-w-0">
                <div className="max-w-6xl mx-auto w-full space-y-4 sm:space-y-6 lg:space-y-8 min-w-0">
                    <ModuleHeader
                        title="Editar Repuesto"
                        subtitle={`Ajustando especificaciones técnicas de ${initialData?.nombre || 'activo'}`}
                        icon={Package}
                        onBack={() => router.push('/inventario')}
                        badge={initialData?.codigo}
                    />

                    {/* Form Container */}
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32">
                        {initialData && (
                            <ProductForm
                                initialData={initialData}
                                onSubmit={handleSubmit}
                                onCancel={() => router.push('/inventario')}
                                isLoading={isLoading}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
