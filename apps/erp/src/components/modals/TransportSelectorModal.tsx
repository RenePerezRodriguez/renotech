'use client';

import { useState, useEffect, useMemo } from 'react';
import { Transport } from '@/types';
import { TransportService } from '@/services/TransportService';
import { Search, Truck, Plus } from 'lucide-react';
import TransportForm from '@/components/forms/TransportForm';
import IndustrialModal from '@/components/common/IndustrialModal';
import { useBranch } from '@/contexts/BranchContext';
import { toast } from 'sonner';
import { logAdminAction } from '@/lib/audit';
import { useAuth } from '@/contexts/AuthContext';

interface TransportSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (transport: Transport) => void;
}

export default function TransportSelectorModal({ isOpen, onClose, onSelect }: TransportSelectorModalProps) {
    const [transports, setTransports] = useState<Transport[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const { currentBranch } = useBranch();
    const { user: currentUser } = useAuth();

    useEffect(() => {
        if (!isOpen) return;
        const load = async () => {
            setLoading(true);
            try {
                const data = await TransportService.getTransports(currentBranch?.id);
                setTransports(data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [isOpen, currentBranch?.id]);

    const filteredTransports = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return transports.filter(t =>
            t.razonSocial.toLowerCase().includes(term) ||
            t.tipoTransporte.toLowerCase().includes(term) ||
            (t.nit || '').includes(searchTerm)
        );
    }, [searchTerm, transports]);

    const handleCreateTransport = async (formData: Omit<Transport, 'id'>) => {
        if (!currentBranch?.id) {
            toast.error('Seleccione una sucursal');
            return;
        }
        setLoading(true);
        try {
            const id = await TransportService.createTransport(formData, currentBranch.id);
            await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'CREATE_TRANSPORT', id, currentBranch.id, `Transporte: ${formData.razonSocial}`);
            const created: Transport = { ...formData, id, branchId: currentBranch.id };
            onSelect(created);
            onClose();
        } catch {
            toast.error('Error al crear transporte');
        } finally {
            setLoading(false);
        }
    };

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={isCreating ? "REGISTRAR TRANSPORTE" : "SELECCIONAR TRANSPORTE"}
            subtitle={isCreating ? "DATOS DEL SERVICIO DE TRANSPORTE" : "BASE DE DATOS - TRANSPORTES REGISTRADOS"}
            icon={<Truck size={22} strokeWidth={2.5} />}
            maxWidth="max-w-2xl"
            theme="stealth"
        >
            <div className="flex flex-col pt-2 max-h-150">
                {isCreating ? (
                    <div className="space-y-2">
                        <TransportForm
                            onSubmit={handleCreateTransport}
                            onCancel={() => setIsCreating(false)}
                            isLoading={loading}
                        />
                    </div>
                ) : (
                    <div className="flex flex-col h-full overflow-hidden">
                        <div className="pb-4 space-y-3 px-1">
                            <div className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={16} strokeWidth={3} />
                                <input
                                    type="text"
                                    placeholder="BUSCAR TRANSPORTE POR NOMBRE, TIPO O NIT..."
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
                                <Plus size={14} strokeWidth={3} /> Registrar Nuevo Transporte
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                            {loading ? (
                                <div className="p-12 text-center text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 animate-pulse">Consultando Registros...</div>
                            ) : filteredTransports.length === 0 ? (
                                <div className="p-12 text-center text-[9px] font-black uppercase tracking-[0.3em] text-slate-300 dark:text-slate-800">No se encontraron transportes</div>
                            ) : (
                                filteredTransports.map(transport => (
                                    <button
                                        key={transport.id}
                                        onClick={() => {
                                            onSelect(transport);
                                            onClose();
                                        }}
                                        className="w-full flex items-center gap-4 p-3.5 rounded-xl hover:bg-white dark:hover:bg-white/5 transition-all text-left group border border-transparent hover:border-blue-500/20 shadow-sm hover:shadow-md active:scale-[0.99]"
                                    >
                                        <div className="h-11 w-11 rounded-xl bg-slate-100 dark:bg-[#111827] flex items-center justify-center text-slate-400 dark:text-slate-600 group-hover:bg-blue-500 group-hover:text-white transition-all shadow-inner">
                                            <Truck size={20} strokeWidth={2.5} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-black text-slate-900 dark:text-white uppercase text-xs group-hover:text-blue-500 transition-colors wrap-break-word tracking-tighter">{transport.razonSocial}</div>
                                            <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-0.5 tracking-[0.15em] uppercase">
                                                {transport.tipoTransporte}{transport.nit ? ` · NIT: ${transport.nit}` : ''}
                                            </div>
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
