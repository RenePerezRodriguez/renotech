'use client';

import { useState, useEffect } from 'react';
import { Save, Globe, Trash2, Edit2, X, Check, AlertTriangle, Loader2, WifiOff } from 'lucide-react';
import IndustrialModal from '@/components/common/IndustrialModal';
import { OriginService } from '@/services/OriginService';
import { InventoryService } from '@/services/InventoryService';
import { Origin } from '@/types';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/common/dialogs';
import clsx from 'clsx';
import { useBranch } from '@/contexts/BranchContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

interface OriginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (origin: Origin) => void;
}

export default function OriginModal({ isOpen, onClose, onSuccess }: OriginModalProps) {
    const { currentBranch } = useBranch();
    const { isOnline } = useNetworkStatus();
    const [loading, setLoading] = useState(false);
    const [origins, setOrigins] = useState<Origin[]>([]);
    const [dynamicOrigins, setDynamicOrigins] = useState<Origin[]>([]);
    const [nombre, setNombre] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const unsubscribe = OriginService.subscribeToOrigins(setOrigins);

        const loadDynamic = async () => {
            if (!currentBranch?.id) return;
            const usedNames = await InventoryService.getUniqueOrigins(currentBranch.id);
            setDynamicOrigins(usedNames.map(name => ({ id: `dyn-${name}`, nombre: name })));
        };
        loadDynamic();

        return () => unsubscribe();
    }, [isOpen, currentBranch?.id]);

    const allOrigins = [
        ...origins,
        ...dynamicOrigins.filter(d => !origins.some(o => o.nombre.toLowerCase() === d.nombre.toLowerCase()))
    ].sort((a, b) => a.nombre.localeCompare(b.nombre));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nombre.trim()) return;

        const normalized = nombre.trim().toUpperCase();
        const dup = origins.some(o => o.id !== editingId && o.nombre.trim().toUpperCase() === normalized);
        if (dup) {
            toast.error(`El origen "${normalized}" ya existe`);
            return;
        }

        setLoading(true);
        try {
            if (editingId) {
                await OriginService.updateOrigin(editingId, { nombre: normalized });
                toast.success('Origen actualizado con éxito');
                setEditingId(null);
            } else {
                const newOriginData = await OriginService.createOrigin({ nombre: normalized });
                const newOrigin: Origin = newOriginData as Origin;
                toast.success(isOnline ? 'Origen creado correctamente' : 'Origen guardado offline', {
                    description: isOnline ? undefined : 'Se subirá al reconectarse',
                });
                onSuccess(newOrigin);
            }
            setNombre('');
        } catch {
            toast.error("Error al procesar el origen");
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (o: Origin) => {
        setNombre(o.nombre);
        setEditingId(o.id || null);
    };

    const handleDelete = async (o: Origin) => {
        if (!o.id) return;

        setIsDeleting(o.id);
        try {
            const inUse = await InventoryService.isOriginInUse(o.nombre);
            if (inUse) {
                toast.error(`Acceso Denegado: El origen "${o.nombre}" está siendo usado por productos activos.`, {
                    description: 'Debes re-asignar los productos antes de eliminar este origen.',
                    duration: 5000
                });
                return;
            }

            const ok = await confirmDialog({
                title: 'Eliminar origen',
                message: `Eliminar "${o.nombre}". Esta acción no se puede deshacer.`,
                variant: 'danger',
                confirmText: 'Eliminar',
            });
            if (ok) {
                await OriginService.deleteOrigin(o.id);
                toast.success('Origen eliminado');
            }
        } catch {
            toast.error("Error al eliminar");
        } finally {
            setIsDeleting(null);
        }
    };

    const cancelEdit = () => {
        setEditingId(null);
        setNombre('');
    };

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={editingId ? "Editando Origen" : "Centro de Orígenes"}
            subtitle="Banco maestro de procedencias"
            icon={<Globe size={20} strokeWidth={2.5} className="text-yellow-500" />}
            maxWidth="max-w-xl"
        >
            {!isOnline && (
                <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    <WifiOff size={12} />
                    Sin conexión — creación offline activa · eliminación deshabilitada
                </div>
            )}
            <div className="flex flex-col md:flex-row gap-8 py-4">
                <div className="flex-1 space-y-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] ml-1">
                                {editingId ? 'Nuevo Nombre de Origen' : 'Registrar Nuevo Origen'}
                            </label>
                            <div className="relative">
                                <input
                                    required
                                    autoFocus
                                    type="text"
                                    className="w-full h-12 px-5 bg-slate-100 dark:bg-black border-2 border-transparent focus:border-yellow-500 rounded-xl outline-none text-xs font-black text-slate-900 dark:text-white transition-all uppercase placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-inner"
                                    placeholder="EJ. BRASIL..."
                                    value={nombre}
                                    onChange={e => setNombre(e.target.value)}
                                />
                                {editingId && (
                                    <button
                                        type="button"
                                        onClick={cancelEdit}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 transition-colors"
                                    >
                                        <X size={16} strokeWidth={3} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !nombre.trim()}
                            className={clsx(
                                "w-full h-12 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-30",
                                editingId
                                    ? "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                                    : "bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black hover:bg-black dark:hover:bg-yellow-400 shadow-xl shadow-black/20 dark:shadow-[#FFD700]/10"
                            )}
                        >
                            {loading ? (
                                <Loader2 className="animate-spin" size={16} strokeWidth={3} />
                            ) : (
                                <>
                                    {editingId ? <Check size={16} strokeWidth={3} /> : <Save size={16} strokeWidth={3} />}
                                    {editingId ? 'Confirmar Cambio' : 'Guardar Registro'}
                                </>
                            )}
                        </button>
                    </form>

                    <div className="p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl">
                        <div className="flex items-center gap-3 text-amber-500 mb-2">
                            <AlertTriangle size={14} strokeWidth={3} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Protocolo de Seguridad</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed italic">
                            No es posible eliminar orígenes que tengan productos asignados. Esto evita errores ortográficos y duplicados (ej: BRASIL vs BRAZIL).
                        </p>
                    </div>
                </div>

                <div className="flex-1 bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden flex flex-col h-87.5">
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Existentes</span>
                        <span className="px-2 py-1 bg-slate-900 dark:bg-white/10 rounded-xl text-[9px] font-black text-white">{allOrigins.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {allOrigins.map(o => {
                            const isDynamic = o.id?.startsWith('dyn-');
                            return (
                            <div
                                key={o.id}
                                className={clsx(
                                    "group flex items-center justify-between p-3 rounded-xl border transition-all",
                                    editingId === o.id
                                        ? "bg-blue-500/10 border-blue-500/30"
                                        : "bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-white/5"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={clsx(
                                        "text-xs font-bold wrap-break-word uppercase",
                                        editingId === o.id ? "text-blue-500" : "text-slate-700 dark:text-slate-300"
                                    )}>
                                        {o.nombre}
                                    </span>
                                    {isDynamic && (
                                        <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-600 dark:text-[#FFD700] rounded text-[8px] font-black uppercase tracking-widest">
                                            Importado
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!isDynamic && (
                                        <>
                                            <button
                                                onClick={() => handleEdit(o)}
                                                className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all active:scale-90"
                                            >
                                                <Edit2 size={12} strokeWidth={3} />
                                            </button>
                                            <button
                                                disabled={isDeleting === o.id || !isOnline}
                                                title={!isOnline ? 'Requiere conexión' : undefined}
                                                onClick={() => handleDelete(o)}
                                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all active:scale-90 disabled:opacity-20"
                                            >
                                                {isDeleting === o.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} strokeWidth={3} />}
                                            </button>
                                        </>
                                    )}
                                    {isDynamic && (
                                        <button
                                            title="Formalizar Origen"
                                            onClick={() => {
                                                setNombre(o.nombre);
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                            }}
                                            className="p-2 text-slate-400 hover:text-yellow-500 hover:bg-yellow-500/10 rounded-xl transition-all active:scale-90"
                                        >
                                            <Save size={12} strokeWidth={3} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )})}
                    </div>
                </div>
            </div>
        </IndustrialModal>
    );
}
