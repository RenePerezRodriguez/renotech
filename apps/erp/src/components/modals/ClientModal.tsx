'use client';

import { useState, useEffect, useMemo } from 'react';
import { Client } from '@/types';
import { ClientService } from '@/services/ClientService';
import { Search, User, Plus, WifiOff } from 'lucide-react';
import ClientFormFields from '@/components/forms/ClientForm';
import IndustrialModal from '@/components/common/IndustrialModal';
import { useBranch } from '@/contexts/BranchContext';
import { toast } from 'sonner';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

interface ClientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (client: Client) => void;
}

export default function ClientModal({ isOpen, onClose, onSelect }: ClientModalProps) {
    const [clients, setClients] = useState<Client[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const { currentBranch } = useBranch();
    const { isOnline } = useNetworkStatus();

    const handleCreateClient = async (clientData: Omit<Client, 'id'>) => {
        if (!currentBranch?.id) {
            toast.error('No se detectó en qué sucursal te encuentras. Selecciona una sucursal desde el menú antes de continuar.');
            return;
        }
        setLoading(true);
        try {
            const id = await ClientService.createClient(clientData, currentBranch.id);
            const createdClient = { id, ...clientData, branchId: currentBranch.id };
            onSelect(createdClient);
            onClose();
            if (isOnline) {
                toast.success('Cliente registrado correctamente');
            } else {
                toast.success('Cliente guardado offline', {
                    description: 'Los datos se subirán al reconectarse',
                });
            }
        } catch (error) {
            console.error(error);
            toast.error('Error al crear cliente');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        const load = async () => {
            setLoading(true);
            try {
                const data = await ClientService.getAllClients(currentBranch?.id);
                setClients(data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [isOpen, currentBranch?.id]);

    const filteredClients = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();
        return clients.filter(c =>
            c.razonSocial.toLowerCase().includes(lowerSearch) ||
            (c.nit || '').includes(lowerSearch)
        );
    }, [searchTerm, clients]);

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={isCreating ? "REGISTRAR SOCIO" : "SELECCIONAR SOCIO"}
            subtitle={isCreating ? "PARÁMETROS TÉCNICOS DEL CLIENTE" : "BASE DE DATOS - AUDITORÍA DE SOCIOS"}
            icon={<User size={22} strokeWidth={2.5} />}
            maxWidth="max-w-2xl"
            theme="stealth"
        >
            <div className="flex flex-col pt-4 min-h-100 max-h-150">
                {isCreating ? (
                        <div className="space-y-4">
                            {!isOnline && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                                    <WifiOff size={12} />
                                    Sin conexión — el cliente se guardará al reconectarse
                                </div>
                            )}
                            <ClientFormFields
                                onSubmit={handleCreateClient}
                                onCancel={() => setIsCreating(false)}
                                isLoading={loading}
                                compact={true}
                                submitLabel="Registrar Socio"
                            />
                        </div>
                ) : (
                    <div className="flex flex-col h-full overflow-hidden">
                        <div className="pb-4 space-y-3 px-1">
                             <div className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={16} strokeWidth={3} />
                                <input
                                    type="text"
                                    placeholder="BUSCAR SOCIO POR NOMBRE O NIT..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-black/40 py-3.5 pl-12 pr-4 text-[10px] font-black uppercase tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl border-2 border-transparent transition-all shadow-inner placeholder:text-slate-400"
                                    autoFocus
                                />
                            </div>
                            <button
                                onClick={() => setIsCreating(true)}
                                className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.25em] hover:bg-white dark:hover:bg-white/5 hover:text-blue-500 hover:border-blue-500/30 transition-all flex items-center justify-center gap-3 text-[9px] active:scale-[0.98]"
                            >
                                <Plus size={14} strokeWidth={3} /> Registrar Nuevo Socio
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                            {loading ? (
                                <div className="p-12 text-center text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 animate-pulse">Consultando Registros...</div>
                            ) : filteredClients.length === 0 ? (
                                <div className="p-12 text-center text-[9px] font-black uppercase tracking-[0.3em] text-slate-300 dark:text-slate-800">No se encontraron socios</div>
                            ) : (
                                filteredClients.map(client => (
                                     <button
                                        key={client.id}
                                        onClick={() => {
                                            onSelect(client);
                                            onClose();
                                        }}
                                        className="w-full flex items-center gap-4 p-3.5 rounded-xl hover:bg-white dark:hover:bg-white/5 transition-all text-left group border border-transparent hover:border-blue-500/20 shadow-sm hover:shadow-md active:scale-[0.99]"
                                    >
                                        <div className="h-11 w-11 rounded-xl bg-slate-100 dark:bg-[#111827] flex items-center justify-center text-slate-400 dark:text-slate-600 group-hover:bg-blue-500 group-hover:text-white transition-all shadow-inner">
                                            <User size={20} strokeWidth={2.5} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-black text-slate-900 dark:text-white uppercase text-xs group-hover:text-blue-500 transition-colors wrap-break-word tracking-tighter">{client.razonSocial}</div>
                                            <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-0.5 tracking-[0.15em] uppercase">{client.nit ? `NIT: ${client.nit}` : 'SOCIO PARTICULAR'}</div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </IndustrialModal>
    );
}
