'use client';

import AuditPageContent from '@/components/auditoria/AuditPageContent';
import ModuleHeader from '@/components/common/ModuleHeader';
import EmptyState from '@/components/common/EmptyState';
import { useAuditPage } from '@/hooks/useAuditPage';
import { Shield, Lock } from 'lucide-react';

export default function AuditPage() {
    const audit = useAuditPage();

    if (!audit.isHQ) {
        return (
            <div className="flex-1 min-w-0 w-full max-w-full p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 bg-slate-50 dark:bg-[#020617]">
                <ModuleHeader
                    title="Auditoría"
                    subtitle="Consola exclusiva de la Oficina Central"
                    icon={Shield}
                />
                <div className="flex-1 flex items-center justify-center">
                    <EmptyState
                        title="Acceso Restringido"
                        description="Esta consola de trazabilidad y seguridad es exclusiva de la Oficina Central. Cambia a la vista Casa Matriz para acceder."
                        icon={Lock}
                    />
                </div>
            </div>
        );
    }

    return <AuditPageContent {...audit} />;
}
