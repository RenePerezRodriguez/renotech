'use client';

import { Client } from '@/types';
import { User } from 'lucide-react';
import IndustrialModal from '@/components/common/IndustrialModal';
import ClientFields from '@/components/forms/ClientForm';

interface ClientFormProps {
    initialData?: Partial<Client> | null;
    onSubmit: (data: Omit<Client, 'id'>) => Promise<void>;
    onCancel: () => void;
    isLoading: boolean;
}

export default function ClientForm({ initialData, onSubmit, onCancel, isLoading }: ClientFormProps) {
    return (
        <IndustrialModal
            isOpen={true}
            onClose={onCancel}
            title={initialData ? "MODIFICAR SOCIO" : "REGISTRAR SOCIO"}
            subtitle="PARÁMETROS TÉCNICOS DEL CLIENTE"
            icon={<User size={22} strokeWidth={2.5} />}
            maxWidth="max-w-2xl"
            theme="stealth"
        >
            <div className="pt-4">
                <ClientFields 
                    initialData={initialData}
                    onSubmit={onSubmit}
                    onCancel={onCancel}
                    isLoading={isLoading}
                    submitLabel={initialData ? 'Guardar Cambios' : 'Registrar Socio'}
                />
            </div>
        </IndustrialModal>
    );
}
