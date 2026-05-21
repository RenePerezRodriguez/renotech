'use client';

import { useState } from 'react';
import { Transport } from '@/types';
import { TransportService } from '@/services/TransportService';
import { toast } from 'sonner';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { logAdminAction } from '@/lib/audit';
import TransportForm from '@/components/forms/TransportForm';
import IndustrialModal from '@/components/common/IndustrialModal';
import { Truck, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

interface TransportModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: Transport | null;
}

export default function TransportModal({ isOpen, onClose, initialData }: TransportModalProps) {
    const [loading, setLoading] = useState(false);
    const { currentBranch, isConsolidatedView } = useBranch();
    const { user: currentUser } = useAuth();
    const { isOnline } = useNetworkStatus();

    if (!isOpen) return null;

    const handleSubmit = async (formData: Omit<Transport, 'id'>) => {
        setLoading(true);
        try {
            if (initialData?.id) {
                await TransportService.updateTransport(initialData.id, formData);
                await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'UPDATE_TRANSPORT', initialData.id, currentBranch?.id || '?', `Transporte: ${formData.razonSocial}`);
                toast.success("Transporte actualizado correctamente");
            } else {
                if (!currentBranch?.id && isConsolidatedView) {
                    toast.error('Seleccione una sucursal para crear un transporte');
                    setLoading(false);
                    return;
                }
                const id = await TransportService.createTransport(formData, currentBranch?.id);
                await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'CREATE_TRANSPORT', id, currentBranch?.id || '?', `Transporte: ${formData.razonSocial}`);
                toast.success(isOnline ? "Transporte registrado correctamente" : "Transporte guardado offline", {
                    description: isOnline ? undefined : 'Se subirá al reconectarse',
                });
            }
            onClose();
        } catch {
            toast.error("Error al guardar el transporte");
        } finally {
            setLoading(false);
        }
    };

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={initialData ? 'Editar Transporte' : 'Nuevo Transporte'}
            subtitle="Transporte"
            icon={<Truck size={24} strokeWidth={2.5} />}
            iconBg="bg-cyan-500"
            iconColor="text-white"
            maxWidth="max-w-2xl"
        >
            {!isOnline && !initialData && (
                <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    <WifiOff size={12} />
                    Sin conexión — el transporte se guardará al reconectarse
                </div>
            )}
            <TransportForm
                initialData={initialData}
                onSubmit={handleSubmit}
                onCancel={onClose}
                isLoading={loading}
            />
        </IndustrialModal>
    );
}
