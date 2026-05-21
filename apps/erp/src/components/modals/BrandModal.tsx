'use client';

import { useState, useEffect } from 'react';
import { Save, Award, Trash2, Edit2, X, Check, AlertTriangle, Loader2, WifiOff } from 'lucide-react';
import IndustrialModal from '@/components/common/IndustrialModal';
import { BrandService } from '@/services/BrandService';
import { InventoryService } from '@/services/InventoryService';
import { Brand } from '@/types';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/common/dialogs';
import clsx from 'clsx';
import { useBranch } from '@/contexts/BranchContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

interface BrandModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (brand: Brand) => void;
}

export default function BrandModal({ isOpen, onClose, onSuccess }: BrandModalProps) {
    const { currentBranch } = useBranch();
    const { isOnline } = useNetworkStatus();
    const [loading, setLoading] = useState(false);
    const [brands, setBrands] = useState<Brand[]>([]);
    const [dynamicBrands, setDynamicBrands] = useState<Brand[]>([]);
    const [nombre, setNombre] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const unsubscribe = BrandService.subscribeToBrands(setBrands);

        const loadDynamic = async () => {
            if (!currentBranch?.id) return;
            const usedNames = await InventoryService.getUniqueBrands(currentBranch.id);
            setDynamicBrands(usedNames.map(name => ({ id: `dyn-${name}`, nombre: name })));
        };
        loadDynamic();

        return () => unsubscribe();
    }, [isOpen, currentBranch?.id]);

    const allBrands = [
        ...brands,
        ...dynamicBrands.filter(d => !brands.some(b => b.nombre.toLowerCase() === d.nombre.toLowerCase()))
    ].sort((a, b) => a.nombre.localeCompare(b.nombre));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nombre.trim()) return;

        const normalized = nombre.trim().toUpperCase();
        // Validar duplicado (case-insensitive)
        const dup = brands.some(b => b.id !== editingId && b.nombre.trim().toUpperCase() === normalized);
        if (dup) {
            toast.error(`La marca "${normalized}" ya existe`);
            return;
        }

        setLoading(true);
        try {
            if (editingId) {
                await BrandService.updateBrand(editingId, { nombre: normalized });
                toast.success('Marca actualizada con éxito');
                setEditingId(null);
            } else {
                const newBrandData = await BrandService.createBrand({ nombre: normalized });
                const newBrand: Brand = newBrandData as Brand;
                toast.success(isOnline ? 'Marca creada correctamente' : 'Marca guardada offline', {
                    description: isOnline ? undefined : 'Se subirá al reconectarse',
                });
                onSuccess(newBrand);
            }
            setNombre('');
        } catch {
            toast.error("Error al procesar la marca");
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (b: Brand) => {
        setNombre(b.nombre);
        setEditingId(b.id || null);
    };

    const handleDelete = async (b: Brand) => {
        if (!b.id) return;

        setIsDeleting(b.id);
        try {
            const inUse = await InventoryService.isBrandInUse(b.nombre);
            if (inUse) {
                toast.error(`Acceso Denegado: La marca "${b.nombre}" está siendo usada por productos activos.`, {
                    description: 'Debes re-asignar los productos antes de eliminar esta marca.',
                    duration: 5000
                });
                return;
            }

            const ok = await confirmDialog({
                title: 'Eliminar marca',
                message: `Eliminar "${b.nombre}". Esta acción no se puede deshacer.`,
                variant: 'danger',
                confirmText: 'Eliminar',
            });
            if (ok) {
                await BrandService.deleteBrand(b.id);
                toast.success('Marca eliminada');
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
            title={editingId ? "Editando Marca" : "Centro de Marcas"}
            subtitle="Banco maestro de marcas"
            icon={<Award size={20} strokeWidth={2.5} className="text-yellow-500" />}
            maxWidth="max-w-xl"
        >
            {!isOnline && (
                <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    <WifiOff size={12} />
                    Sin conexión — creación offline activa · eliminación deshabilitada
                </div>
            )}
            <div className="flex flex-col md:flex-row gap-8 py-4">
                {/* Form Side */}
                <div className="flex-1 space-y-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] ml-1">
                                {editingId ? 'Nuevo Nombre de Marca' : 'Registrar Nueva Marca'}
                            </label>
                            <div className="relative">
                                <input
                                    required
                                    autoFocus
                                    type="text"
                                    className="w-full h-12 px-5 bg-slate-100 dark:bg-black border-2 border-transparent focus:border-yellow-500 rounded-xl outline-none text-xs font-black text-slate-900 dark:text-white transition-all uppercase placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-inner"
                                    placeholder="EJ. BOSCH..."
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
                            No es posible eliminar marcas que tengan productos asignados. Esto evita errores ortográficos y duplicados (ej: BOSCH vs BOSH).
                        </p>
                    </div>
                </div>

                {/* List Side */}
                <div className="flex-1 bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden flex flex-col h-87.5">
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Existentes</span>
                        <span className="px-2 py-1 bg-slate-900 dark:bg-white/10 rounded-xl text-[9px] font-black text-white">{allBrands.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {allBrands.map(b => {
                            const isDynamic = b.id?.startsWith('dyn-');
                            return (
                            <div
                                key={b.id}
                                className={clsx(
                                    "group flex items-center justify-between p-3 rounded-xl border transition-all",
                                    editingId === b.id
                                        ? "bg-blue-500/10 border-blue-500/30"
                                        : "bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-white/5"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={clsx(
                                        "text-xs font-bold wrap-break-word uppercase",
                                        editingId === b.id ? "text-blue-500" : "text-slate-700 dark:text-slate-300"
                                    )}>
                                        {b.nombre}
                                    </span>
                                    {isDynamic && (
                                        <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-600 dark:text-[#FFD700] rounded text-[8px] font-black uppercase tracking-widest">
                                            Importada
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!isDynamic && (
                                        <>
                                            <button
                                                onClick={() => handleEdit(b)}
                                                className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all active:scale-90"
                                            >
                                                <Edit2 size={12} strokeWidth={3} />
                                            </button>
                                            <button
                                                disabled={isDeleting === b.id || !isOnline}
                                                title={!isOnline ? 'Requiere conexión' : undefined}
                                                onClick={() => handleDelete(b)}
                                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all active:scale-90 disabled:opacity-20"
                                            >
                                                {isDeleting === b.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} strokeWidth={3} />}
                                            </button>
                                        </>
                                    )}
                                    {isDynamic && (
                                        <button
                                            title="Formalizar Marca"
                                            onClick={() => {
                                                setNombre(b.nombre);
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
