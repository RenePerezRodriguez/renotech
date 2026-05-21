'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Package, AlertCircle, WifiOff } from 'lucide-react';
import ProductForm from '../components/ProductForm';
import { InventoryService } from '@/services/InventoryService';
import { logAdminAction } from '@/lib/audit';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { toast } from 'sonner';
import { Product } from '@/types';
import ModuleHeader from '@/components/common/ModuleHeader';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export default function NewProductPage() {
    const router = useRouter();
    const { user: currentUser, role } = useAuth();
    const { currentBranch, isHQ } = useBranch();
    const { isOnline } = useNetworkStatus();
    const [isLoading, setIsLoading] = useState(false);

    const isAuthorized = role === 'GERENTE' && isHQ;

    useEffect(() => {
        if (!isAuthorized && !isLoading) {
            toast.error('Acceso denegado: Solo la Sede Central puede crear nuevos repuestos.', {
                icon: <AlertCircle className="text-rose-500" />
            });
            router.push('/inventario');
        }
    }, [isAuthorized, router, isLoading]);

    const handleSubmit = async (data: Omit<Product, 'id'>) => {
        if (!isAuthorized) return;
        if (!isOnline) {
            toast.error('Sin conexión — crear productos requiere internet');
            return;
        }
        
        if (!currentBranch?.id) {
            toast.error('Error: No hay sucursal seleccionada');
            return;
        }

        setIsLoading(true);
        try {
            const newId = await InventoryService.createProduct(data, currentBranch.id, isHQ);
            await logAdminAction(
                currentUser?.uid || '?',
                currentUser?.email || '?',
                'CREATE_PRODUCT',
                newId,
                currentBranch.id,
                `Producto: ${data.nombre} (Sucursal: ${currentBranch.name})`
            );
            router.push('/inventario');
        } catch {
            toast.error('Error al crear el producto');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isAuthorized) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 animate-pulse">
                    <AlertCircle size={48} className="text-slate-300" />
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Verificando Credenciales...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full bg-slate-50 dark:bg-background relative overflow-hidden">
            <div className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col overflow-y-auto relative z-10 custom-scrollbar min-w-0">
                <div className="max-w-6xl mx-auto w-full space-y-4 sm:space-y-6 lg:space-y-8 min-w-0">
                    <ModuleHeader
                        title="Nuevo Repuesto"
                        subtitle="Registra un nuevo activo en el catálogo maestro"
                        icon={Package}
                        onBack={() => router.push('/inventario')}
                    />

                    {!isOnline && (
                        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-[11px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                            <WifiOff size={14} />
                            Sin conexión — guardar un producto requiere internet
                        </div>
                    )}

                    {/* Form Container */}
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32">
                        <ProductForm
                            onSubmit={handleSubmit}
                            onCancel={() => router.push('/inventario')}
                            isLoading={isLoading}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

