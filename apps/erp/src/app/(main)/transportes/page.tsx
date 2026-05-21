'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePagination } from '@/hooks/usePagination';
import { Transport, Envio } from '@/types';
import { TransportService } from '@/services/TransportService';
import TransportModal from '@/components/modals/TransportModal';
import { Truck, Plus, Edit, Trash2, Phone, MapPin, FileText, Tag, Banknote, ArrowLeftRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { logAdminAction } from '@/lib/audit';
import { toast } from 'sonner';
import { useBranch } from '@/contexts/BranchContext';
import ConfirmModal from '@/components/common/ConfirmModal';
import EmptyState from '@/components/common/EmptyState';
import TableFooter from '@/components/common/TableFooter';
import ModuleHeader from '@/components/common/ModuleHeader';
import KpiCard from '@/components/common/KpiCard';
import FilterBar from '@/components/common/FilterBar';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export default function TransportesPage() {
    const { role, user: currentUser } = useAuth();
    const { currentBranch, isConsolidatedView, branches } = useBranch();
    const { isOnline } = useNetworkStatus();
    const isGerente = role === 'GERENTE';

    const [transports, setTransports] = useState<Transport[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingTransport, setEditingTransport] = useState<Transport | null>(null);

    // Usage stats per transport (from envios)
    interface TransportUsage {
        count: number;
        totalCost: number;
        lastUsed: Date | null;
        branches: Set<string>;
    }
    const [usageMap, setUsageMap] = useState<Record<string, TransportUsage>>({});


    // Confirm modal
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        isLoading?: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
    });

    const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

    useEffect(() => {
        const branchFilter = isConsolidatedView ? undefined : currentBranch?.id;
        const unsubscribe = TransportService.subscribeToTransports((data) => {
            setTransports(data);
            setLoading(false);
        }, branchFilter);
        return () => unsubscribe();
    }, [currentBranch?.id, isConsolidatedView]);

    // Load usage stats from envios
    useEffect(() => {
        if (transports.length === 0) return;
        const ids = transports.map(t => t.id).filter(Boolean) as string[];
        if (ids.length === 0) return;

        // Firestore 'in' supports max 30 values per query
        const loadUsage = async () => {
            const map: Record<string, TransportUsage> = {};
            const chunks: string[][] = [];
            for (let i = 0; i < ids.length; i += 30) {
                chunks.push(ids.slice(i, i + 30));
            }
            for (const chunk of chunks) {
                const q = query(collection(db, 'envios'), where('transportId', 'in', chunk));
                const snap = await getDocs(q);
                snap.docs.forEach(d => {
                    const data = d.data() as Envio;
                    const tid = data.transportId!;
                    if (!map[tid]) map[tid] = { count: 0, totalCost: 0, lastUsed: null, branches: new Set() };
                    map[tid].count++;
                    map[tid].totalCost += data.transportCost || 0;
                    const created = data.createdAt;
                    if (created && created instanceof Timestamp) {
                        const d2 = created.toDate();
                        if (!map[tid].lastUsed || d2 > map[tid].lastUsed!) map[tid].lastUsed = d2;
                    }
                    if (data.fromBranchName) map[tid].branches.add(data.fromBranchName);
                    if (data.toBranchName) map[tid].branches.add(data.toBranchName);
                });
            }
            setUsageMap(map);
        };
        loadUsage();
    }, [transports]);

    const filteredTransports = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return transports.filter(t =>
            t.razonSocial.toLowerCase().includes(term) ||
            t.nit?.includes(searchTerm) ||
            t.tipoTransporte.toLowerCase().includes(term) ||
            t.ubicacion?.toLowerCase().includes(term)
        );
    }, [transports, searchTerm]);

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedTransports } = usePagination(filteredTransports, 12);

    const stats = {
        total: transports.length,
        withPhone: transports.filter(t => !!t.telefono).length,
    };

    const handleDelete = (id: string, name: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Eliminar Transporte',
            message: `¿Estás seguro de eliminar "${name}"?`,
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isLoading: true }));
                try {
                    await TransportService.deleteTransport(id);
                    await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'DELETE_TRANSPORT', id, currentBranch?.id || '?', `Transporte: ${name}`);
                    toast.success(`Transporte "${name}" eliminado`);
                    closeConfirmModal();
                } catch {
                    toast.error("Error al eliminar el transporte");
                    setConfirmModal(prev => ({ ...prev, isLoading: false }));
                }
            }
        });
    };

    return (
        <div className="flex-1 min-w-0 w-full max-w-full p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 lg:space-y-8 bg-slate-50 dark:bg-background">
            <ModuleHeader
                title="Transportes"
                subtitle="Registro y gestión de servicios de transporte"
                icon={Truck}
                actions={isGerente ? [
                    {
                        label: "Nuevo Transporte",
                        onClick: () => {
                            setEditingTransport(null);
                            setIsFormOpen(true);
                        },
                        icon: Plus,
                        variant: 'primary' as const,
                        dataTourId: 'transportes-new-btn',
                    }
                ] : []}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <KpiCard label="Total Transportes" value={stats.total} icon={Truck} progress={100} color="blue" />
                <KpiCard label="Con Teléfono" value={stats.withPhone} icon={Phone} progress={(stats.withPhone / (stats.total || 1)) * 100} color="green" />
            </div>

            <div data-tour="transportes-search">
            <FilterBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Buscar por razón social, NIT, tipo o ubicación..."
                onClear={() => setSearchTerm('')}
                isDirty={searchTerm !== ''}
            />
            </div>

            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl flex-1 overflow-hidden flex flex-col transition-all duration-500">
                <TableFooter totalItems={filteredTransports.length} itemsPerPage={itemsPerPage} onChangeItemsPerPage={setItemsPerPage} currentPage={currentPage} onChangePage={setCurrentPage} totalPages={totalPages} label="Transportes" className="border-b border-t-0 bg-white/50 dark:bg-black/10" />
                <div className="overflow-auto flex-1 custom-scrollbar p-6">
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
                        </div>
                    ) : filteredTransports.length === 0 ? (
                        <div className="py-20">
                            <EmptyState title="No hay transportes" description={searchTerm ? "No se encontraron resultados para tu búsqueda." : "Aún no hay transportes registrados."} icon={Truck} />
                        </div>
                    ) : (
                        <div data-tour="transportes-grid" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                            {paginatedTransports.map((transport) => (
                                <div key={transport.id} className="relative bg-white dark:bg-white/5/40 rounded-3xl p-6 border border-slate-100 dark:border-white/10 hover:border-cyan-500/30 transition-all duration-300 group shadow-sm hover:shadow-xl hover:shadow-cyan-500/5 flex flex-col">
                                    {/* Action Overlays */}
                                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                                        {isGerente && (
                                            <>
                                                <button onClick={() => { setEditingTransport(transport); setIsFormOpen(true); }} className="w-10 h-10 flex items-center justify-center bg-white dark:bg-[#111827] text-slate-400 hover:text-blue-500 rounded-xl border border-slate-200 dark:border-white/10 shadow-lg transition-all" title="Editar">
                                                    <Edit size={16} strokeWidth={2.5} />
                                                </button>
                                                <button onClick={() => handleDelete(transport.id!, transport.razonSocial)} disabled={!isOnline} className="w-10 h-10 flex items-center justify-center bg-white dark:bg-[#111827] text-slate-400 hover:text-red-500 rounded-xl border border-slate-200 dark:border-white/10 shadow-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed" title={!isOnline ? 'Requiere conexión' : 'Eliminar'}>
                                                    <Trash2 size={16} strokeWidth={2.5} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    {/* Brand Header */}
                                    <div className="mb-6">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-500 font-black text-lg">
                                                {transport.razonSocial.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight wrap-break-word group-hover:text-cyan-500 transition-colors">{transport.razonSocial}</h3>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">NIT: {transport.nit || 'NO REGISTRADO'}</p>
                                            </div>
                                        </div>
                                        {/* Type badge */}
                                        <div className="mt-3 flex gap-2 flex-wrap">
                                            <span className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-[8px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                                                <Tag size={8} /> {transport.tipoTransporte}
                                            </span>
                                            {isConsolidatedView && (
                                                <span className="px-2 py-1 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-xl text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                                    <Truck size={8} /> Sede: {branches.find(b => b.id === transport.branchId)?.name || 'Sin sede'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Details */}
                                    <div className="space-y-4 pt-4 border-t border-slate-50 dark:border-white/10 flex-1">
                                        {transport.telefono && (
                                            <div className="flex items-center gap-4">
                                                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400"><Phone size={14} strokeWidth={2.5} /></div>
                                                <div className="flex-1 min-w-0">
                                                    <span className="block text-[8px] font-black text-slate-400 uppercase tracking-[0.15em] mb-0.5">Teléfono</span>
                                                    <span className="block text-[10px] font-black text-slate-700 dark:text-slate-300 font-mono tracking-tight">{transport.telefono}</span>
                                                </div>
                                            </div>
                                        )}
                                        {transport.ubicacion && (
                                            <div className="flex items-center gap-4">
                                                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400"><MapPin size={14} strokeWidth={2.5} /></div>
                                                <div className="flex-1 min-w-0">
                                                    <span className="block text-[8px] font-black text-slate-400 uppercase tracking-[0.15em] mb-0.5">Ubicación</span>
                                                    <span className="block text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase wrap-break-word">{transport.ubicacion}</span>
                                                </div>
                                            </div>
                                        )}
                                        {transport.anotaciones && (
                                            <div className="flex items-start gap-4">
                                                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0"><FileText size={14} strokeWidth={2.5} /></div>
                                                <div className="flex-1 min-w-0">
                                                    <span className="block text-[8px] font-black text-slate-400 uppercase tracking-[0.15em] mb-0.5">Anotaciones</span>
                                                    <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 wrap-break-word">{transport.anotaciones}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {/* Usage Stats */}
                                    {usageMap[transport.id!] && (
                                        <div className="mt-4 pt-4 border-t border-slate-50 dark:border-white/10 space-y-2">
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Historial de Uso</span>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="flex items-center gap-2 bg-slate-50 dark:bg-white/5 rounded-xl px-2 py-1.5">
                                                    <ArrowLeftRight size={10} className="text-blue-500" />
                                                    <div>
                                                        <span className="block text-[8px] font-bold text-slate-400 uppercase">Envíos</span>
                                                        <span className="block text-[11px] font-black text-slate-700 dark:text-white">{usageMap[transport.id!].count}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 bg-slate-50 dark:bg-white/5 rounded-xl px-2 py-1.5">
                                                    <Banknote size={10} className="text-green-500" />
                                                    <div>
                                                        <span className="block text-[8px] font-bold text-slate-400 uppercase">Costo Total</span>
                                                        <span className="block text-[11px] font-black text-slate-700 dark:text-white">Bs. {usageMap[transport.id!].totalCost.toFixed(0)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            {usageMap[transport.id!].lastUsed && (
                                                <p className="text-[9px] font-bold text-slate-400">
                                                    Último uso: {usageMap[transport.id!].lastUsed!.toLocaleDateString('es-BO')}
                                                </p>
                                            )}
                                            {usageMap[transport.id!].branches.size > 0 && (
                                                <p className="text-[9px] font-bold text-slate-400 wrap-break-word">
                                                    Sucursales: {Array.from(usageMap[transport.id!].branches).join(', ')}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-linear-to-br from-cyan-500/5 to-transparent rounded-full blur-2xl group-hover:scale-150 transition-all duration-700" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <TableFooter totalItems={filteredTransports.length} itemsPerPage={itemsPerPage} onChangeItemsPerPage={setItemsPerPage} currentPage={currentPage} onChangePage={setCurrentPage} totalPages={totalPages} label="Transportes" />
            </div>

            <TransportModal isOpen={isFormOpen} initialData={editingTransport} onClose={() => { setIsFormOpen(false); setEditingTransport(null); }} />
            <ConfirmModal isOpen={confirmModal.isOpen} onClose={closeConfirmModal} onConfirm={confirmModal.onConfirm} title={confirmModal.title} message={confirmModal.message} variant="danger" isLoading={confirmModal.isLoading} />
        </div>
    );
}
