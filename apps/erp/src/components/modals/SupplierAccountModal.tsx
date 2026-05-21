'use client';

import { useState } from 'react';
import { SupplierAccount } from '@/types';
import { SupplierAccountService } from '@/services/SupplierAccountService';
import { EmpresaService } from '@/services/EmpresaService';
import IndustrialModal from '@/components/common/IndustrialModal';
import SupplierAccountForm from '@/components/forms/SupplierAccountForm';
import { Wallet } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    empresaId: string;
    empresaNombre: string;
    initialData?: SupplierAccount | null;
    suggestDefault?: boolean;
    onSuccess?: (account: SupplierAccount) => void;
}

export default function SupplierAccountModal({
    isOpen,
    onClose,
    empresaId,
    empresaNombre,
    initialData,
    suggestDefault,
    onSuccess,
}: Props) {
    const [loading, setLoading] = useState(false);
    if (!isOpen) return null;

    const handleSubmit = async (data: Omit<SupplierAccount, 'id' | 'createdAt' | 'updatedAt'>) => {
        setLoading(true);
        try {
            if (initialData?.id) {
                await SupplierAccountService.update(initialData.id, data);
                toast.success('Cuenta actualizada');
                onSuccess?.({ ...initialData, ...data });
            } else {
                const id = await SupplierAccountService.create(data);
                toast.success('Cuenta creada');
                onSuccess?.({ ...data, id });
            }
            onClose();
            // Recompute métricas en segundo plano (best-effort, no bloquea UI)
            EmpresaService.recomputeMetrics(empresaId).catch((e) =>
                console.warn('recomputeMetrics falló (no bloqueante):', e)
            );
        } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'Error al guardar cuenta');
        } finally {
            setLoading(false);
        }
    };

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={initialData ? 'Editar Cuenta' : 'Nueva Cuenta'}
            subtitle={empresaNombre}
            icon={<Wallet size={24} strokeWidth={2.5} />}
            iconBg="bg-amber-500"
            iconColor="text-slate-950"
            maxWidth="max-w-2xl"
        >
            <SupplierAccountForm
                empresaId={empresaId}
                empresaNombre={empresaNombre}
                initialData={initialData}
                onSubmit={handleSubmit}
                onCancel={onClose}
                isLoading={loading}
                suggestDefault={suggestDefault}
            />
        </IndustrialModal>
    );
}
