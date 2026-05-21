'use client';

import { useState } from 'react';
import { Supplier } from '@/types';
import { SupplierService } from '@/services/SupplierService';
import { toast } from 'sonner';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { logAdminAction } from '@/lib/audit';
import SupplierForm from '@/components/forms/SupplierForm';
import IndustrialModal from '@/components/common/IndustrialModal';
import { Building2, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

interface SupplierModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (supplier: Supplier) => void;
    initialData?: Supplier | null;
}

export default function SupplierModal({ isOpen, onClose, onSuccess, initialData }: SupplierModalProps) {
    const [loading, setLoading] = useState(false);
    const { currentBranch, isConsolidatedView } = useBranch();
    const { user: currentUser } = useAuth();
    const { isOnline } = useNetworkStatus();

    if (!isOpen) return null;

    const handleSubmit = async (formData: Omit<Supplier, 'id'>) => {
        setLoading(true);
        try {
            let result: Supplier;
            if (initialData?.id) {
                await SupplierService.updateSupplier(initialData.id, formData);
                await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'UPDATE_SUPPLIER', initialData.id, currentBranch?.id || '?', `Proveedor: ${formData.razonSocial}`);
                result = { ...formData, id: initialData.id };
                toast.success("Proveedor actualizado correctamente");
            } else {
                if (!currentBranch?.id && isConsolidatedView) {
                    toast.error('Seleccione una sucursal para crear un proveedor');
                    setLoading(false);
                    return;
                }
                const id = await SupplierService.createSupplier(formData, currentBranch?.id);
                await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'CREATE_SUPPLIER', id, currentBranch?.id || '?', `Proveedor: ${formData.razonSocial}`);
                result = { ...formData, id };
                toast.success(isOnline ? "Proveedor creado correctamente" : "Proveedor guardado offline", {
                    description: isOnline ? undefined : 'Se subirá al reconectarse',
                });
            }
            if (onSuccess) onSuccess(result);
            onClose();
        } catch {
            toast.error("Error al guardar el proveedor");
        } finally {
            setLoading(false);
        }
    };

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={initialData ? 'Editar Proveedor' : 'Nuevo Proveedor'}
            subtitle="Proveedor"
            icon={<Building2 size={24} strokeWidth={2.5} />}
            iconBg="bg-yellow-500"
            iconColor="text-slate-950"
            maxWidth="max-w-2xl"
        >
            {!isOnline && !initialData && (
                <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    <WifiOff size={12} />
                    Sin conexión — el proveedor se guardará al reconectarse
                </div>
            )}
            <SupplierForm
                initialData={initialData}
                onSubmit={handleSubmit}
                onCancel={onClose}
                isLoading={loading}
            />
        </IndustrialModal>
    );
}
