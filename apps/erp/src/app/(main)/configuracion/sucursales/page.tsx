'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Branch } from '@/types';
import { BranchService } from '@/services/BranchService';
import { logAdminAction } from '@/lib/audit';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/common/dialogs';
import {
    Building2, Plus, Edit2, Trash2, MapPin, Phone,
    Save, Crown, Shield
} from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';
import ModuleHeader from '@/components/common/ModuleHeader';

export default function BranchesAdminPage() {
    const router = useRouter();
    const { canSwitchBranch, refreshBranches, isHQ, isConsolidatedView } = useBranch();
    const { user, role } = useAuth();
    const [branches, setBranches] = useState<Branch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        address: '',
        phone: '',
        isHQ: false,
        tipo: 'VENTA' as 'VENTA' | 'MATRIZ',
        status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE'
    });

    useEffect(() => {
        loadBranches();
    }, []);

    // Bootstrap mode: allow access only for GERENTE when no branches exist yet
    const isBootstrapMode = !isLoading && branches.length === 0 && role === 'GERENTE';

    const loadBranches = async () => {
        setIsLoading(true);
        try {
            const data = await BranchService.getAll();
            setBranches(data);
        } catch {
            toast.error('Error al cargar sucursales');
        } finally {
            setIsLoading(false);
        }
    };

    const openCreateModal = () => {
        setEditingBranch(null);
        // If this is the first branch (bootstrap mode), force it to be HQ
        const forceHQ = branches.length === 0;
        setFormData({
            name: forceHQ ? 'Central' : '',
            code: '', // Managed by system
            address: '',
            phone: '',
            isHQ: forceHQ,
            tipo: forceHQ ? 'MATRIZ' : 'VENTA',
            status: 'ACTIVE'
        });
        setIsModalOpen(true);
    };

    const openEditModal = (branch: Branch) => {
        setEditingBranch(branch);
        setFormData({
            name: branch.name,
            code: branch.code || '',
            address: branch.address || '',
            phone: branch.phone || '',
            isHQ: branch.isHQ,
            tipo: branch.tipo || (branch.isHQ ? 'MATRIZ' : 'VENTA'),
            status: branch.status
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const sanitizedName = formData.name.trim().replace(/[<>"'&]/g, '');
        if (!sanitizedName) {
            toast.error('El nombre es requerido');
            return;
        }

        setIsSaving(true);
        try {
            const submitData = { ...formData, name: sanitizedName };
            if (editingBranch) {
                await BranchService.update(editingBranch.id!, submitData);
                await logAdminAction(user?.uid || '?', user?.email || '?', 'UPDATE_BRANCH', editingBranch.id!, 'HQ', `Sucursal: ${sanitizedName} (${formData.code})`);
                toast.success('Sucursal actualizada');
            } else {
                const newBranchId = await BranchService.create({
                    ...submitData,
                    config: {
                        canReceiveTransfers: true,
                        canRequestTransfers: true
                    }
                });

                // If this is the first branch (HQ), assign the current user to it
                if (isBootstrapMode && user?.uid && formData.isHQ) {
                    await updateDoc(doc(db, 'users', user.uid), {
                        branchId: newBranchId,
                        branchName: formData.name,
                        canAccessAllBranches: true
                    });
                    toast.success('Sucursal Central creada con Caja y Bóveda · Asignada a tu perfil');
                } else if (!editingBranch) {
                    await logAdminAction(user?.uid || '?', user?.email || '?', 'CREATE_BRANCH', newBranchId, 'HQ', `Sucursal: ${formData.name} (${formData.code})`);
                    toast.success('Sucursal creada · Caja y Bóveda auto-generadas');
                }
            }
            setIsModalOpen(false);
            loadBranches();
            refreshBranches();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error al guardar');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (branch: Branch) => {
        if (branch.isHQ) {
            toast.error('No se puede eliminar la sucursal central');
            return;
        }

        const ok = await confirmDialog({
            title: 'Eliminar sucursal',
            message: `Eliminar la sucursal "${branch.name}". Quedará desactivada.`,
            variant: 'danger',
            confirmText: 'Eliminar',
        });
        if (!ok) return;

        try {
            await BranchService.delete(branch.id!);
            await logAdminAction(
                user?.uid || '?',
                user?.email || '?',
                'DELETE_BRANCH',
                branch.id!,
                'HQ',
                `Sucursal eliminada (desactivada): ${branch.name}`
            );
            toast.success('Sucursal desactivada');
            loadBranches();
            refreshBranches();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error al eliminar');
        }
    };

    const toggleStatus = async (branch: Branch) => {
        try {
            const newStatus = branch.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
            await BranchService.update(branch.id!, { status: newStatus });
            await logAdminAction(
                user?.uid || '?',
                user?.email || '?',
                'TOGGLE_BRANCH_STATUS',
                branch.id!,
                'HQ',
                `Estado de sucursal ${branch.name} cambiado a ${newStatus}`
            );
            toast.success(`Sucursal ${newStatus === 'ACTIVE' ? 'activada' : 'desactivada'}`);
            loadBranches();
            refreshBranches();
        } catch {
            toast.error('Error al cambiar estado');
        }
    };

    const canManage = isHQ || isConsolidatedView || isBootstrapMode;

    // Access Check - Allow bootstrap mode for first branch creation
    if (!canSwitchBranch && !isBootstrapMode) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <Building2 size={64} className="text-slate-300 dark:text-slate-600 mb-4" />
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Acceso Restringido</h2>
                <p className="text-sm text-slate-500">Solo usuarios HQ pueden gestionar sucursales.</p>
            </div>
        );
    }

    // Security Guard: Deny access if not in HQ context OR Consolidated view
    if (!canManage && !isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-slate-50 dark:bg-background">
                <div className="w-20 h-20 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-6">
                    <Shield size={40} className="text-red-600 dark:text-red-400" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Acceso Restringido</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-md font-medium">
                    La gestión de sucursales es una función administrativa global. 
                    Para acceder, por favor regresa a la <strong>Sucursal Central</strong> o activa la <strong>Vista Consolidada</strong>.
                </p>
                <div className="mt-8 flex gap-3">
                    <Link
                        href="/inicio"
                        className="px-6 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                    >
                        Ir al Dashboard
                    </Link>
                    <button
                        onClick={() => window.location.href = '/'} 
                        className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-yellow-500/20 transition-all"
                    >
                        Cambiar a Central
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 min-w-0 w-full max-w-6xl mx-auto p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 lg:space-y-8 bg-slate-50 dark:bg-background pb-20">
            <div data-tour="sucursales-header">
            <ModuleHeader
                title="Sucursales"
                subtitle="Administración de sucursales del sistema"
                icon={Building2}
                onBack={() => router.push('/configuracion')}
                actions={isHQ ? [
                    {
                        label: "Nueva Sucursal",
                        onClick: openCreateModal,
                        icon: Plus,
                        variant: 'primary',
                        dataTourId: 'sucursales-nueva-btn',
                    }
                ] : []}
            />
            </div>

            {/* In-Branch Warning */}
            {!isHQ && !isBootstrapMode && (
                <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-4 mb-2 flex items-center gap-3">
                    <Building2 className="text-blue-500 shrink-0" size={20} />
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                        Estás visualizando las sucursales en modo lectura. Para realizar cambios, regresa a la <strong>Sucursal Central</strong>.
                    </p>
                </div>
            )}

            {/* Branches Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-yellow-500"></div>
                </div>
            ) : branches.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 bg-yellow-50 dark:bg-[#FFD700]/5 border-2 border-dashed border-yellow-300 dark:border-[#FFD700]/30 rounded-2xl">
                    <Crown size={48} className="mb-4 text-yellow-500" />
                    <p className="font-black text-lg text-yellow-600 dark:text-yellow-400">¡Bienvenido!</p>
                    <p className="text-sm text-yellow-600/70 dark:text-[#FFD700]/70 max-w-xs text-center mt-1">
                        Crea tu primera sucursal Central (HQ) para comenzar a usar el sistema multi-sucursal.
                    </p>
                    <button
                        onClick={openCreateModal}
                        className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl transition-colors shadow-lg shadow-yellow-500/20 active:scale-95"
                    >
                        <Plus size={18} />
                        Crear Sucursal Central
                    </button>
                </div>
            ) : (
                <div data-tour="sucursales-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {branches.map((branch, idx) => (
                        <div
                            key={branch.id}
                            {...(idx === 0 ? { 'data-tour': 'sucursales-card' } : {})}
                            className={clsx(
                                "group relative bg-white dark:bg-background rounded-3xl border p-8 transition-all duration-500 hover:shadow-2xl hover:-translate-y-1",
                                branch.status === 'ACTIVE'
                                    ? "border-slate-200 dark:border-white/10"
                                    : "border-rose-200 dark:border-rose-900/30 opacity-60 grayscale-[0.5]"
                            )}
                        >
                            {/* HQ Badge */}
                            {branch.isHQ && (
                                <div className="absolute -top-3 right-8 flex items-center gap-2 px-4 py-1.5 bg-amber-500 border border-amber-600 rounded-full text-black shadow-xl shadow-amber-500/20 z-10 animate-in slide-in-from-top-2 duration-500">
                                    <Crown size={12} strokeWidth={3} />
                                    <span className="text-[9px] font-black uppercase tracking-[0.15em]">Sede Matriz</span>
                                </div>
                            )}

                            {/* Branch Info */}
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className={clsx(
                                            "w-2 h-2 rounded-full animate-pulse",
                                            branch.status === 'ACTIVE' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                                        )} />
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                                            {branch.code === 'HQ' ? 'CENTRAL' : (branch.code || 'SUC-000')}
                                        </span>
                                    </div>
                                    <div className="h-px flex-1 mx-4 bg-slate-100 dark:bg-white/5 opacity-50" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none group-hover:text-yellow-500 transition-colors">
                                    {branch.name}
                                </h3>
                            </div>

                            {/* Details */}
                            <div className="space-y-3 mb-8">
                                <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/10 transition-colors group-hover:bg-white dark:group-hover:bg-black/20">
                                    <MapPin size={16} className="text-slate-400 dark:text-[#FFD700]/50" />
                                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-tight wrap-break-word">{branch.address || 'Sin dirección registrada'}</span>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/10 transition-colors group-hover:bg-white dark:group-hover:bg-black/20">
                                    <Phone size={16} className="text-slate-400 dark:text-[#FFD700]/50" />
                                    <span className="text-[11px] font-black text-slate-900 dark:text-white font-mono">{branch.phone || 'S/T'}</span>
                                </div>
                            </div>

                            {/* Actions */}
                            {isHQ && (
                                <div {...(idx === 0 ? { 'data-tour': 'sucursales-actions' } : {})} className="flex items-center gap-3 pt-6 border-t border-slate-100 dark:border-white/10">
                                    <button
                                        onClick={() => openEditModal(branch)}
                                        className="flex-1 flex items-center justify-center gap-2 h-12 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 rounded-2xl hover:bg-slate-900 dark:hover:bg-[#FFD700] hover:text-white dark:hover:text-black transition-all duration-300 text-[10px] font-black uppercase tracking-widest border border-transparent hover:border-white/10"
                                    >
                                        <Edit2 size={14} strokeWidth={3} />
                                        Configuración
                                    </button>
                                    
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => !branch.isHQ && toggleStatus(branch)}
                                            disabled={branch.isHQ}
                                            className={clsx(
                                                "flex-[0.6] h-12 flex items-center justify-center rounded-2xl transition-all duration-300 border-2 font-black text-[10px] uppercase tracking-widest px-6",
                                                branch.status === 'ACTIVE'
                                                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                                    : "bg-rose-500/10 text-rose-500 border-rose-500/20",
                                                branch.isHQ && "opacity-50 cursor-not-allowed border-slate-200 grayscale"
                                            )}
                                        >
                                            {branch.status === 'ACTIVE' ? 'Activa' : 'Inactiva'}
                                        </button>
                                        
                                        {!branch.isHQ && (
                                            <button
                                                onClick={() => handleDelete(branch)}
                                                className="w-12 h-12 flex items-center justify-center bg-rose-500/10 text-rose-500 rounded-2xl border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all duration-300"
                                            >
                                                <Trash2 size={18} strokeWidth={3} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 overflow-y-auto" onClick={() => !isSaving && setIsModalOpen(false)}>
                    <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-500 my-auto">
                        {/* Modal Header */}
                        <div className="p-8 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-black/20">
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-4">
                                <Building2 className="text-yellow-500" size={32} strokeWidth={2.5} />
                                {editingBranch ? 'Editar Sucursal' : 'Nueva Sucursal'}
                            </h3>
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-2">
                                {editingBranch ? `Modificando: ${editingBranch.name}` : 'Completa los datos de la nueva sucursal'}
                            </p>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleSubmit} className="p-8 space-y-8">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="col-span-2 space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Nombre</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-yellow-500/50 outline-none transition-all"
                                        placeholder="Ingrese nombre"
                                    />
                                </div>

                                {/* Code field removed - managed by system */}

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Teléfono</label>
                                    <input
                                        type="text"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-yellow-500/50 outline-none transition-all font-mono"
                                        placeholder="+591"
                                    />
                                </div>

                                <div className="col-span-2 space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Dirección</label>
                                    <input
                                        type="text"
                                        value={formData.address}
                                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-yellow-500/50 outline-none transition-all"
                                        placeholder="Dirección completa"
                                    />
                                </div>
                            </div>

                            <div className="col-span-2 space-y-2">
                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Tipo</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, isHQ: false })}
                                        className={clsx(
                                            "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2",
                                            !formData.isHQ 
                                                ? "bg-slate-900 dark:bg-white text-white dark:text-black border-transparent" 
                                                : "bg-transparent border-slate-100 dark:border-white/10 text-slate-400 hover:border-slate-200"
                                        )}
                                    >
                                        <Building2 size={24} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Unidad Operativa</span>
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!editingBranch && branches.some(b => b.isHQ)}
                                        onClick={() => setFormData({ ...formData, isHQ: true })}
                                        className={clsx(
                                            "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2 text-center relative",
                                            formData.isHQ 
                                                ? "bg-amber-500 border-transparent text-black" 
                                                : "bg-transparent border-slate-100 dark:border-white/10 text-slate-400 hover:border-amber-500/30",
                                            (!editingBranch && branches.some(b => b.isHQ)) && "opacity-40 cursor-not-allowed grayscale"
                                        )}
                                    >
                                        <Crown size={24} />
                                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">Sede Matriz / Almacén Central</span>
                                        {!editingBranch && branches.some(b => b.isHQ) && (
                                            <span className="absolute -bottom-2 px-2 py-0.5 bg-slate-800 text-[7px] text-white rounded-xl font-black uppercase tracking-tight">HQ ya existente</span>
                                        )}
                                    </button>
                                </div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mt-2 px-1">
                                    * La Sede Matriz tiene privilegios exclusivos para gestionar el Catálogo Maestro y la Migración de Datos (Excel).
                                    {!editingBranch && branches.some(b => b.isHQ) && (
                                        <span className="block mt-1 text-orange-500 font-black">* Para cambiar la Sede Matriz, edita una sucursal existente.</span>
                                    )}
                                </p>
                            </div>

                            {/* Operativa: VENTA o MATRIZ */}
                            <div className="col-span-2 space-y-2">
                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Operativa diaria</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, tipo: 'VENTA' })}
                                        className={clsx(
                                            "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2 text-center",
                                            formData.tipo === 'VENTA'
                                                ? "bg-emerald-500 border-transparent text-white"
                                                : "bg-transparent border-slate-100 dark:border-white/10 text-slate-400 hover:border-emerald-500/30"
                                        )}
                                    >
                                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">Punto de Venta</span>
                                        <span className="text-[8px] font-bold opacity-80 leading-tight">Caja diaria · Ventas POS</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, tipo: 'MATRIZ' })}
                                        className={clsx(
                                            "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2 text-center",
                                            formData.tipo === 'MATRIZ'
                                                ? "bg-blue-500 border-transparent text-white"
                                                : "bg-transparent border-slate-100 dark:border-white/10 text-slate-400 hover:border-blue-500/30"
                                        )}
                                    >
                                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">Matriz Administrativa</span>
                                        <span className="text-[8px] font-bold opacity-80 leading-tight">Compras · Banco · Sin caja diaria</span>
                                    </button>
                                </div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mt-2 px-1">
                                    * &quot;Punto de Venta&quot;: requiere apertura/cierre de caja diaria.
                                    * &quot;Matriz&quot;: opera por banco (transferencias/QR), no requiere caja física diaria.
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-4 pt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-4 px-4 rounded-2xl border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-2 py-4 px-4 rounded-2xl bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-2xl shadow-yellow-500/20 active:scale-95"
                                >
                                    {isSaving ? (
                                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Save size={18} strokeWidth={3} />
                                            Guardar
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

