'use client';

import { useState } from 'react';
import { Client } from '@/types';
import { ClientService } from '@/services/ClientService';
import ClientTable from './components/ClientTable';
import ClientForm from './components/ClientForm';
import ClientHistoryModal from './components/ClientHistoryModal';
import { Users, Download, Building2, Activity, UserPlus } from 'lucide-react';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { logAdminAction } from '@/lib/audit';
import { localDateStr } from '@/lib/utils';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/common/dialogs';
import { useClients } from '@/hooks/useClients';

// Suite Pro v4.0 Components
import ModuleHeader from '@/components/common/ModuleHeader';
import KpiCard from '@/components/common/KpiCard';
import FilterBar from '@/components/common/FilterBar';

export default function ClientsPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'PARTICULAR' | 'EMPRESA'>('ALL');
    const [branchFilterSelect, setBranchFilterSelect] = useState<string>('ALL');

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<Partial<Client> | null>(null);
    const [historyClient, setHistoryClient] = useState<Client | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { currentBranch, isConsolidatedView, branches } = useBranch();
    const { user: currentUser } = useAuth();

    const branchFilter = isConsolidatedView ? undefined : currentBranch?.id;
    const { clients, loading } = useClients(branchFilter);

    // KPI Calculations
    const stats = {
        total: clients.length,
        empresas: clients.filter(c => c.tipo === 'EMPRESA').length,
        particulares: clients.filter(c => c.tipo === 'PARTICULAR').length
    };

    const handleExport = () => {
        if (clients.length === 0) {
            toast.error('No hay datos para exportar');
            return;
        }

        // Apply same filtering logic as Table for consistency
        const filtered = clients.filter(c => {
            const matchesSearch = (c.razonSocial?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                                 (c.nit?.toLowerCase() || '').includes(searchTerm.toLowerCase());
            const matchesType = typeFilter === 'ALL' || c.tipo === typeFilter;
            const matchesBranch = !isConsolidatedView || branchFilterSelect === 'ALL' || c.branchId === branchFilterSelect;
            return matchesSearch && matchesType && matchesBranch;
        });

        if (filtered.length === 0) {
            toast.error('No hay clientes que coincidan con los filtros actuales');
            return;
        }

        const headers = ['Razon Social', 'NIT/CI', 'Tipo', 'Telefono', 'Email', 'Direccion', 'Notas'];
        const rows = filtered.map(c => [
            `"${(c.razonSocial || '').replace(/"/g, '""')}"`,
            `"${(c.nit || '').replace(/"/g, '""')}"`,
            `"${(c.tipo || '').replace(/"/g, '""')}"`,
            `"${(c.telefono || '').replace(/"/g, '""')}"`,
            `"${(c.email || '').replace(/"/g, '""')}"`,
            `"${(c.direccion || '').replace(/"/g, '""')}"`,
            `"${(c.notas || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `clientes_renotech_${localDateStr()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success('Lista de clientes exportada para Excel');
    };

    const handleCreate = () => {
        setEditingClient(null);
        setIsFormOpen(true);
    };

    const handleEdit = (client: Client) => {
        setEditingClient(client);
        setIsFormOpen(true);
    };

    const handleDelete = async (id: string, name: string) => {
        const ok = await confirmDialog({
            title: 'Eliminar cliente',
            message: `Eliminar al cliente "${name}".`,
            variant: 'danger',
            confirmText: 'Eliminar',
        });
        if (ok) {
            try {
                await ClientService.deleteClient(id);
                await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'DELETE_CLIENT', id, currentBranch?.id || '?', `Cliente: ${name}`);
                toast.success('Cliente eliminado');
            } catch (error) {
                console.error(error);
                toast.error('Error al eliminar el cliente');
            }
        }
    };

    const handleSubmit = async (data: Omit<Client, 'id'>) => {
        // Validation for duplicate NIT (only when creating or changing NIT)
        if (data.nit && data.nit.trim() !== '') {
            const isDuplicate = clients.some(c => 
                c.nit === data.nit && c.id !== editingClient?.id
            );
            if (isDuplicate) {
                toast.error(`Ya existe un cliente registrado con el NIT/CI: ${data.nit}`);
                return;
            }
        }

        setIsSubmitting(true);
        try {
            if (editingClient?.id) {
                await ClientService.updateClient(editingClient.id, data);
                await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'UPDATE_CLIENT', editingClient.id, currentBranch?.id || '?', `Cliente: ${data.razonSocial}`);
                toast.success('Cliente actualizado');
            } else {
                if (!currentBranch?.id) {
                    toast.error('No se detectó en qué sucursal te encuentras. Selecciona una sucursal antes de continuar.');
                    setIsSubmitting(false);
                    return;
                }
                const newClientId = await ClientService.createClient(data, currentBranch.id);
                await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'CREATE_CLIENT', newClientId, currentBranch.id, `Cliente: ${data.razonSocial}`);
                toast.success('Cliente creado');
            }
            setIsFormOpen(false);
        } catch (error) {
            console.error(error);
            toast.error('Error al guardar el cliente');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex-1 min-w-0 w-full max-w-full p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 lg:space-y-8 bg-slate-50 dark:bg-[#020617]">
            {/* Header Area - Suite Pro Standard */}
            <ModuleHeader
                title="Directorio de Socios"
                subtitle="Gestión de Cartera de Clientes, Censo de Entidades y Auditoría de Relaciones"
                icon={Users}
                actions={[
                    {
                        label: "Exportar Inteligencia",
                        onClick: handleExport,
                        icon: Download,
                        variant: 'secondary',
                        disabled: clients.length === 0
                    },
                    ...(!isConsolidatedView ? [{
                        label: "Vincular Nuevo Socio",
                        onClick: handleCreate,
                        icon: UserPlus,
                        variant: 'primary' as const,
                        dataTourId: 'clientes-new-btn'
                    }] : [])
                ]}
            />

            {/* KPI Grid - Suite Pro v4.0 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard
                    label="Población de Socios"
                    value={stats.total}
                    icon={Users}
                    progress={100}
                    color="gold"
                    highlight
                />
                <KpiCard
                    label="Entidades Jurídicas"
                    value={stats.empresas}
                    icon={Building2}
                    progress={(stats.empresas / (stats.total || 1)) * 100}
                    color="blue"
                />
                <KpiCard
                    label="Sujetos Particulares"
                    value={stats.particulares}
                    icon={Users}
                    progress={(stats.particulares / (stats.total || 1)) * 100}
                    color="green"
                />
                <KpiCard
                    label="Índice de Actividad"
                    value="98.4%"
                    icon={Activity}
                    progress={98.4}
                    color="purple"
                />
            </div>

            {/* Filter Toolbar - High Density Suite Pro */}
            <div data-tour="clientes-search">
            <FilterBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Localizar por Razón Social, NIT/CI o identificador técnico..."
                filters={[
                    {
                        id: 'type',
                        label: 'Clasificación',
                        value: typeFilter,
                        onChange: (val) => setTypeFilter(val as 'ALL' | 'PARTICULAR' | 'EMPRESA'),
                        options: [
                            { label: 'Todos los Segmentos', value: 'ALL' },
                            { label: 'Sujeto Particular', value: 'PARTICULAR' },
                            { label: 'Entidad Jurídica', value: 'EMPRESA' }
                        ]
                    },
                    ...(isConsolidatedView ? [{
                        id: 'branch',
                        label: 'Filtrado por Sede',
                        value: branchFilterSelect,
                        onChange: setBranchFilterSelect,
                        options: branches.map(b => ({ label: b.name, value: b.id || 'N/A' }))
                    }] : [])
                ]}
                onClear={() => {
                    setSearchTerm('');
                    setTypeFilter('ALL');
                    setBranchFilterSelect('ALL');
                }}
                isDirty={searchTerm !== '' || typeFilter !== 'ALL' || (isConsolidatedView && branchFilterSelect !== 'ALL')}
            />
            </div>

            {/* Table Area (Ventas Parity) */}
            <div data-tour="clientes-table" className="flex-1 min-h-0 bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col transition-all duration-500">
                <ClientTable
                    clients={clients}
                    loading={loading}
                    typeFilter={typeFilter}
                    branchFilterSelect={branchFilterSelect}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onViewHistory={(client) => setHistoryClient(client)}
                    searchTerm={searchTerm}
                />
            </div>

            {/* Modals Support */}
            {isFormOpen && (
                <ClientForm
                    initialData={editingClient}
                    onSubmit={handleSubmit}
                    onCancel={() => setIsFormOpen(false)}
                    isLoading={isSubmitting}
                />
            )}

            {historyClient && (
                <ClientHistoryModal
                    client={historyClient}
                    onClose={() => setHistoryClient(null)}
                />
            )}
        </div>
    );
}
