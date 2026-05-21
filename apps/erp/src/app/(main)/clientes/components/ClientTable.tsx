'use client';

import { Client } from '@/types';
import { Edit, Trash2, User, Building2, History } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePagination } from '@/hooks/usePagination';
import { useBranch } from '@/contexts/BranchContext';
import { clsx } from 'clsx';
import TableFooter from '@/components/common/TableFooter';
import AbonoModal from './AbonoModal';
import { Banknote } from 'lucide-react';

interface ClientTableProps {
    clients: Client[];
    loading: boolean;
    searchTerm: string;
    typeFilter: 'ALL' | 'PARTICULAR' | 'EMPRESA';
    branchFilterSelect: string;
    onEdit: (client: Client) => void;
    onDelete: (id: string, name: string) => void;
    onViewHistory: (client: Client) => void;
}

export default function ClientTable({ 
    clients, 
    loading, 
    searchTerm, 
    typeFilter, 
    branchFilterSelect,
    onEdit, 
    onDelete, 
    onViewHistory 
}: ClientTableProps) {
    const { branches, isConsolidatedView } = useBranch();
    const [selectedClientForAbono, setSelectedClientForAbono] = useState<Client | null>(null);

    const filteredClients = useMemo(() => {
        return clients.filter(c => {
            const matchesSearch = (c.razonSocial?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                                 (c.nit?.toLowerCase() || '').includes(searchTerm.toLowerCase());
            const matchesType = typeFilter === 'ALL' || c.tipo === typeFilter;
            const matchesBranch = !isConsolidatedView || branchFilterSelect === 'ALL' || c.branchId === branchFilterSelect;
            return matchesSearch && matchesType && matchesBranch;
        });
    }, [clients, searchTerm, typeFilter, branchFilterSelect, isConsolidatedView]);

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedClients } = usePagination(filteredClients);

    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-w-0 w-full bg-transparent overflow-hidden">
            {/* Top Pagination Bar */}
            <TableFooter
                totalItems={filteredClients.length}
                itemsPerPage={itemsPerPage}
                onChangeItemsPerPage={setItemsPerPage}
                currentPage={currentPage}
                onChangePage={setCurrentPage}
                totalPages={totalPages}
                label="Socios"
                className="border-b border-t-0 bg-white/50 dark:bg-black/10"
            />
            <div className="flex-1 overflow-auto custom-scrollbar">
                {/* Mobile View - High Density Minimalist */}
                <div className="md:hidden space-y-4 p-3 sm:p-6 pb-24">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-yellow-500" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizando socios...</p>
                        </div>
                    ) : paginatedClients.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <User size={48} strokeWidth={1} className="opacity-20 mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Sin registros detectados</p>
                        </div>
                    ) : (
                        paginatedClients.map((client) => (
                            <div key={client.id} className="bg-white dark:bg-white/5/40 rounded-3xl p-5 border border-slate-100 dark:border-white/10 shadow-sm active:scale-[0.98] transition-all relative group overflow-hidden">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-slate-900 dark:bg-[#FFD700] flex items-center justify-center text-white dark:text-black shadow-lg shadow-black/10">
                                            {client.tipo === 'EMPRESA' ? <Building2 size={18} /> : <User size={18} />}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-[0.2em] mb-0.5">
                                                {client.tipo}
                                            </span>
                                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase leading-none tracking-tight">
                                                {client.razonSocial}
                                            </h3>
                                        </div>
                                    </div>
                                    <span className="font-mono text-[10px] font-black text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-xl border border-slate-200 dark:border-white/10">
                                        {client.nit}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Contacto Directo</span>
                                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                                            {client.telefono || 'No registrado'}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Canal de Enlace</span>
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 wrap-break-word">
                                            {client.email || 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-4 border-t border-slate-50 dark:border-white/10">
                                    <button 
                                        onClick={() => onViewHistory(client)} 
                                        className="w-10 h-10 flex items-center justify-center bg-slate-50 dark:bg-white/5 rounded-2xl text-slate-400 hover:text-blue-500 transition-all border border-slate-100 dark:border-white/10"
                                    >
                                        <History size={18} />
                                    </button>
                                    {(client.balance || 0) > 0 && (
                                        <button 
                                            onClick={() => setSelectedClientForAbono(client)} 
                                            className="w-10 h-10 flex items-center justify-center bg-emerald-500/10 dark:bg-emerald-500/20 rounded-2xl text-emerald-500 transition-all border border-emerald-500/20"
                                        >
                                            <Banknote size={18} />
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => onEdit(client)} 
                                        className="flex-1 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-lg shadow-black/10 py-3"
                                    >
                                        Ver Expediente
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Desktop View - Technical Table (Industrial Premium) */}
                <div className="hidden md:block">
                    <table className="w-full border-separate border-spacing-0">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-[#020617] text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] sticky top-0 z-10">
                                <th className="px-6 py-5 text-left border-b border-slate-100 dark:border-white/10">Razón Social / Identidad</th>
                                <th className="px-6 py-5 text-left border-b border-slate-100 dark:border-white/10">Identificador (NIT/CI)</th>
                                <th className="px-6 py-5 text-left border-b border-slate-100 dark:border-white/10">Segmentación</th>
                                <th className="px-6 py-5 text-left border-b border-slate-100 dark:border-white/10">Contacto Directo</th>
                                {isConsolidatedView && <th className="px-6 py-5 text-center border-b border-slate-100 dark:border-white/10">Sede Operativa</th>}
                                <th className="px-6 py-5 text-right border-b border-slate-100 dark:border-white/10 pr-8">Auditoría y Gestión</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {paginatedClients.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-32 text-center">
                                        <div className="flex flex-col items-center gap-4 opacity-20">
                                            <User size={64} strokeWidth={0.5} className="text-slate-400" />
                                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300 dark:text-slate-600">Archive Void</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedClients.map((client) => (
                                    <tr key={client.id} className="hover:bg-slate-50/50 dark:hover:bg-white/2 transition-all group cursor-pointer" onClick={() => onEdit(client)}>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 dark:group-hover:bg-[#FFD700] group-hover:text-white dark:group-hover:text-black transition-all duration-300 shadow-sm">
                                                    {client.tipo === 'EMPRESA' ? <Building2 size={16} /> : <User size={16} />}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-slate-900 dark:text-slate-200 uppercase tracking-tight group-hover:text-blue-500 transition-colors">
                                                        {client.razonSocial}
                                                    </span>
                                                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest">Socio Activo</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-mono text-[10px] font-black text-slate-500 dark:text-slate-400 tabular-nums select-all bg-slate-100/50 dark:bg-white/5 px-2 py-1 rounded-xl border border-slate-200/50 dark:border-white/10 tracking-tighter">
                                                {client.nit}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={clsx(
                                                "inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border shadow-sm transition-all",
                                                client.tipo === 'EMPRESA'
                                                    ? "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
                                                    : "bg-slate-500/10 border-slate-500/20 text-slate-600 dark:text-slate-400"
                                            )}>
                                                {client.tipo}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 tabular-nums">{client.telefono || '-'}</span>
                                                    {client.telefono && (
                                                        <a
                                                            href={`https://wa.me/591${client.telefono.replace(/\D/g, '')}`}
                                                            target="_blank" rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="text-emerald-500 hover:scale-110 transition-transform"
                                                            title="Enlace WhatsApp"
                                                        >
                                                            <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current">
                                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.94 3.659 1.437 5.634 1.437h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                                            </svg>
                                                        </a>
                                                    )}
                                                </div>
                                                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 tracking-widest uppercase">{client.email || 'SIN REGISTRO DIGITAL'}</span>
                                            </div>
                                        </td>
                                        {isConsolidatedView && (
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-xl border border-slate-200 dark:border-white/10">
                                                    {branches.find(b => b.id === client.branchId)?.name || 'CENTRAL'}
                                                </span>
                                            </td>
                                        )}
                                        <td className="px-6 py-4 text-right pr-6">
                                            <div className="flex justify-end items-center gap-2">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onViewHistory(client); }} 
                                                    className="w-9 h-9 flex items-center justify-center bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 rounded-xl transition-all border border-transparent hover:border-blue-500/20" 
                                                    title="Historial de Ventas"
                                                >
                                                    <History size={16} strokeWidth={2.5} />
                                                </button>
                                                {(client.balance || 0) > 0 && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setSelectedClientForAbono(client); }} 
                                                        className="w-9 h-9 flex items-center justify-center bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-xl transition-all border border-transparent hover:border-emerald-500/20" 
                                                        title="Registrar Abono / Pago"
                                                    >
                                                        <Banknote size={16} strokeWidth={2.5} />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onEdit(client); }} 
                                                    className="w-9 h-9 flex items-center justify-center bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black rounded-xl shadow-lg shadow-black/10 transition-transform active:scale-90" 
                                                    title="Modificar Socios"
                                                >
                                                    <Edit size={16} strokeWidth={2.5} />
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onDelete(client.id!, client.razonSocial); }} 
                                                    className="w-9 h-9 flex items-center justify-center bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all" 
                                                    title="Revocar Socio"
                                                >
                                                    <Trash2 size={16} strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination & Audit Footer - Standard v4.0 */}
            <TableFooter
                totalItems={filteredClients.length}
                itemsPerPage={itemsPerPage}
                onChangeItemsPerPage={setItemsPerPage}
                currentPage={currentPage}
                onChangePage={setCurrentPage}
                totalPages={totalPages}
                label="Socios"
            />
            {selectedClientForAbono && (
                <AbonoModal
                    isOpen={!!selectedClientForAbono}
                    onClose={() => setSelectedClientForAbono(null)}
                    client={{
                        id: selectedClientForAbono.id!,
                        razonSocial: selectedClientForAbono.razonSocial,
                        balance: selectedClientForAbono.balance || 0
                    }}
                    onSuccess={() => {
                        // Success toast is handled in the modal
                        // The hook should refresh the balance automatically if using a real-time listener or re-fetching
                    }}
                />
            )}
        </div>
    );
}
