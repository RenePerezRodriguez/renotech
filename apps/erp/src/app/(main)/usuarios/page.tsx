'use client';

import { useState, useEffect } from 'react';
import { useModalDismiss } from '@/hooks/useModalDismiss';
import { usePagination } from '@/hooks/usePagination';
import { db, auth } from '@/lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { User, Shield, Key, Mail, Calendar, Trash2, Building2, Settings2, UserPlus, Activity, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import clsx from 'clsx';
import { UserProfile, Branch, Role } from '@/types';
import { logAdminAction } from '@/lib/audit';
import ConfirmModal from '@/components/common/ConfirmModal';
import { toast } from 'sonner';
import EmptyState from '@/components/common/EmptyState';
import { BranchService } from '@/services/BranchService';
import { useBranch } from '@/contexts/BranchContext';
import TableFooter from '@/components/common/TableFooter';
import RolesManager from '@/components/users/RolesManager';
import { useMemo } from 'react';
import { RoleService } from '@/services/RoleService';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineModuleGuard } from '@/components/common/OfflineModuleGuard';

// Suite Pro v4.0 Components
import ModuleHeader from '@/components/common/ModuleHeader';
import KpiCard from '@/components/common/KpiCard';
import FilterBar from '@/components/common/FilterBar';
import { formatDate, formatDateTime } from '@/utils/dateHelpers';
import { formatRoleName } from '@/utils/formatRoleName';

export default function UsersPage() {
    const { user: currentUser, loading: authLoading } = useAuth();
    const { isHQ, currentBranch } = useBranch();
    const { isOnline } = useNetworkStatus();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const closeCreateModal = () => setIsCreateModalOpen(false);
    const createDismiss = useModalDismiss(isCreateModalOpen, closeCreateModal, { disabled: creating });
    const [newUser, setNewUser] = useState({ email: '', password: '', displayName: '', role: 'ENCARGADO_VENTAS', branchId: '', canAccessAllBranches: false });
    const [branches, setBranches] = useState<Branch[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [isRolesManagerOpen, setIsRolesManagerOpen] = useState(false);
    const [roleFilter, setRoleFilter] = useState('ALL');


    // Modal States
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmText?: string;
        variant?: 'danger' | 'warning' | 'info';
        onConfirm: () => void;
        isLoading?: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
    });

    const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

    const handleDeleteUser = (userId: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Eliminar Usuario',
            message: `¿Estás seguro de eliminar este usuario (ID: ${userId})? Se borrará su acceso y sus datos.`,
            confirmText: 'Sí, Eliminar',
            variant: 'danger',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isLoading: true }));
                try {
                    const token = await currentUser?.getIdToken();
                    const response = await fetch('/api/admin/delete-user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ uid: userId })
                    });
                    if (!response.ok) throw new Error(await response.text());
                    await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'DELETE_USER', userId, currentBranch?.id || 'HQ');

                    toast.success("Usuario eliminado correctamente.");
                    closeConfirmModal();
                } catch {
                    toast.error("Error al eliminar usuario.");
                    setConfirmModal(prev => ({ ...prev, isLoading: false }));
                }
            }
        });
    };

    // Imports for secondary app (Dynamic import to avoid init issues? No, standard import is fine if we use initializeApp safely)
    // We need to import these at top level really, but let's see if we can add imports first.

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            const token = await currentUser?.getIdToken();
            const response = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    email: newUser.email,
                    password: newUser.password,
                    displayName: newUser.displayName,
                    role: newUser.role,
                    branchId: newUser.branchId || null,
                    canAccessAllBranches: newUser.canAccessAllBranches
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al crear usuario');
            }

            const result = await response.json();
            await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'CREATE_USER', result.uid, currentBranch?.id || 'HQ', `Email: ${newUser.email}, Role: ${newUser.role}`);

            setIsCreateModalOpen(false);
            setNewUser({ email: '', password: '', displayName: '', role: 'ENCARGADO_VENTAS', branchId: '', canAccessAllBranches: false });
            toast.success("Usuario creado exitosamente.");

        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            toast.error("Error al crear usuario: " + errorMessage);
        } finally {
            setCreating(false);
        }
    };

    useEffect(() => {
        const q = query(collection(db, 'users'));
        
        // Contextual Filter: If not in HQ, only show users of this branch
        // Note: We'll filter in memory for simplicity or use where clause if preferred.
        // Let's stick to memory filter for now to avoid index creation for such a small list.

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let usersData = snapshot.docs.map(doc => ({
                id: doc.id,
                uid: doc.id, // Fallback if uid is missing in data
                ...doc.data()
            })) as unknown as UserProfile[];
            
            if (!isHQ && currentBranch?.id) {
                usersData = usersData.filter(u => u.branchId === currentBranch.id);
            }
            
            setUsers(usersData);
            setLoading(false);
        }, () => {
            setLoading(false);
        });
        return () => unsubscribe();
    }, [isHQ, currentBranch?.id]);

    // Load branches and roles
    useEffect(() => {
        BranchService.getActive().then(setBranches).catch((e) => console.error('[Usuarios] Failed to load branches', e));
        RoleService.seedDefaults().then(() => RoleService.getAll().then(setRoles)).catch((e) => console.error('[Usuarios] Failed to load roles', e));
    }, []);

    // Reload roles when RolesManager closes
    const handleRolesManagerClose = () => {
        setIsRolesManagerOpen(false);
        RoleService.getAll().then(setRoles).catch((e) => console.error('[Usuarios] Failed to reload roles', e));
    };

    const handleResetPassword = (email: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Restablecer Contraseña',
            message: `¿Enviar correo de restablecimiento a ${email}?`,
            confirmText: 'Enviar Correo',
            variant: 'info',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isLoading: true }));
                try {
                    await sendPasswordResetEmail(auth, email);
                    toast.success(`Correo de restablecimiento enviado a ${email}`);
                    closeConfirmModal();
                } catch {
                    toast.error("Error al enviar correo de restablecimiento.");
                    setConfirmModal(prev => ({ ...prev, isLoading: false }));
                }
            }
        });
    };

    const handleToggleStatus = (userId: string, currentDisabled: boolean) => {
        const action = currentDisabled ? 'activar' : 'suspender';
        setConfirmModal({
            isOpen: true,
            title: `${currentDisabled ? 'Activar' : 'Suspender'} Usuario`,
            message: `¿Estás seguro de ${action} esta cuenta?`,
            confirmText: currentDisabled ? 'Activar' : 'Suspender',
            variant: currentDisabled ? 'info' : 'warning',
            onConfirm: async () => {
                setConfirmModal(prev => ({ ...prev, isLoading: true }));
                try {
                    const token = await currentUser?.getIdToken();
                    const response = await fetch('/api/admin/toggle-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ uid: userId, disabled: !currentDisabled })
                    });
                    if (!response.ok) throw new Error(await response.text());
                    await updateDoc(doc(db, 'users', userId), { disabled: !currentDisabled });
                    await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'TOGGLE_STATUS', userId, currentBranch?.id || 'HQ', `New status: ${!currentDisabled ? 'DISABLED' : 'ENABLED'}`);

                    toast.success(`Cuenta ${action}da correctamente.`);
                    closeConfirmModal();
                } catch {
                    toast.error("Error al cambiar estado.");
                    setConfirmModal(prev => ({ ...prev, isLoading: false }));
                }
            }
        });
    };


    const handleBranchChange = async (userId: string, branchId: string) => {
        try {
            const selectedBranch = branches.find(b => b.id === branchId);
            await updateDoc(doc(db, 'users', userId), {
                branchId: branchId || null,
                branchName: selectedBranch?.name || null
            });
            await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'CHANGE_BRANCH', userId, currentBranch?.id || 'HQ', `New branch: ${selectedBranch?.name || 'Sin asignar'}`);
            toast.success("Sucursal actualizada");
        } catch {
            toast.error("Error al cambiar sucursal");
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        if (userId === currentUser?.uid) return;
        try {
            const token = await currentUser?.getIdToken();
            const response = await fetch('/api/admin/set-role', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ uid: userId, role: newRole })
            });
            if (!response.ok) throw new Error(await response.text());
            await updateDoc(doc(db, 'users', userId), { role: newRole, roleId: newRole });
            await logAdminAction(currentUser?.uid || '?', currentUser?.email || '?', 'CHANGE_ROLE', userId, currentBranch?.id || 'HQ', `New role: ${newRole}`);
            toast.success(`Rol actualizado a ${newRole}`);
        } catch {
            toast.error("Error al cambiar rol");
        }
    };

    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const matchesSearch = !searchTerm ||
                (user.displayName?.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (user.email?.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
            return matchesSearch && matchesRole;
        });
    }, [users, searchTerm, roleFilter]);

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedUsers } = usePagination(filteredUsers);

    const stats = {
        total: users.length,
        admins: users.filter(u => u.role === 'GERENTE').length,
        suspended: users.filter(u => !!u.disabled).length,
        active: users.filter(u => !u.disabled).length
    };

    if (authLoading) {
        return (
            <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-background">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            </div>
        );
    }

    if (!isOnline) return <OfflineModuleGuard moduleName="Usuarios"><span/></OfflineModuleGuard>;

    // Removed hardcoded role guards. RBAC is managed via MainLayout.

    return (
        <div className="flex-1 min-w-0 w-full max-w-full p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 lg:space-y-8 bg-slate-50 dark:bg-background">
            {/* Header Area - Suite Pro Standard */}
            <ModuleHeader
                title="Gestión de Capital Humano"
                subtitle="Control de Entidades, Privilegios y Seguridad Estructural"
                icon={User}
                actions={[
                    ...(isHQ ? [{
                        label: "Directivas de Rol",
                        onClick: () => setIsRolesManagerOpen(true),
                        icon: Settings2,
                        variant: 'secondary' as const
                    }] : []),
                    {
                        label: "Alta de Usuario",
                        onClick: () => setIsCreateModalOpen(true),
                        icon: UserPlus,
                        variant: 'primary' as const,
                        dataTourId: 'usuarios-nuevo-btn',
                    }
                ]}
            />

            {/* KPI Grid - Suite Pro v4.0 */}
            <div data-tour="usuarios-kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard
                    label="Efectivo Total"
                    value={stats.total}
                    icon={User}
                    progress={100}
                    color="blue"
                />
                <KpiCard
                    label="Nivel Directivo"
                    value={stats.admins}
                    icon={Shield}
                    progress={(stats.admins / (stats.total || 1)) * 100}
                    color="purple"
                />
                <KpiCard
                    label="Fuerza Operativa"
                    value={stats.active}
                    icon={Activity}
                    progress={(stats.active / (stats.total || 1)) * 100}
                    color="green"
                />
                <KpiCard
                    label="Accesos Revocados"
                    value={stats.suspended}
                    icon={AlertTriangle}
                    progress={(stats.suspended / (stats.total || 1)) * 100}
                    color="red"
                />
            </div>

            {/* Filter Toolbar - High Density Suite Pro */}
            <div data-tour="usuarios-filters">
            <FilterBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Buscar por nombre, email o identidad..."
                filters={[
                    {
                        id: 'role',
                        label: 'Rol',
                        value: roleFilter,
                        onChange: setRoleFilter,
                        options: roles.map(r => ({ label: r.name, value: r.id || '' }))
                    }
                ]}
                onClear={() => {
                    setSearchTerm('');
                    setRoleFilter('ALL');
                }}
                isDirty={searchTerm !== '' || roleFilter !== 'ALL'}
            />
            </div>

            {/* Table / Grid Container */}
            <div data-tour="usuarios-table" className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl flex-1 overflow-hidden flex flex-col transition-all duration-500">
                {/* Top Pagination Bar */}
                <TableFooter
                    totalItems={filteredUsers.length}
                    itemsPerPage={itemsPerPage}
                    onChangeItemsPerPage={setItemsPerPage}
                    currentPage={currentPage}
                    onChangePage={setCurrentPage}
                    totalPages={totalPages}
                    label="Usuarios Registrados"
                    className="border-b border-t-0 bg-white/50 dark:bg-black/10"
                />
                <div className="overflow-auto flex-1 custom-scrollbar">
                    {/* Mobile Card View - Suite Pro v4.0 High Density */}
                    <div className="md:hidden space-y-4 p-4">
                        {loading ? (
                            <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div></div>
                        ) : paginatedUsers.map((user) => (
                            <div key={user.uid} className={clsx(
                                "relative bg-white dark:bg-white/5/40 rounded-3xl p-6 border transition-all duration-300",
                                user.uid === currentUser?.uid ? "border-purple-500/30 bg-purple-500/5 shadow-lg shadow-purple-500/5" : "border-slate-100 dark:border-white/10",
                                user.disabled && "opacity-60 grayscale-[0.5]"
                            )}>
                                {/* Profile Context */}
                                <div className="flex items-center gap-4 mb-6">
                                    <div className={clsx(
                                        "h-14 w-14 rounded-2xl flex items-center justify-center font-black text-2xl border-2 shadow-inner",
                                        user.role === 'GERENTE'
                                            ? "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400"
                                            : "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
                                    )}>
                                        {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-tight wrap-break-word">
                                                {user.displayName || user.email}
                                            </h3>
                                            {user.uid === currentUser?.uid && (
                                                <span className="px-1.5 py-0.5 bg-yellow-500 text-black text-[8px] font-black rounded uppercase tracking-widest">Tú</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest wrap-break-word">
                                            <Mail size={10} strokeWidth={3} /> {user.email}
                                        </div>
                                    </div>
                                </div>

                                {/* Metrics Area */}
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/10">
                                        <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Rango Operativo</span>
                                        <div className="flex items-center gap-2">
                                            <Shield size={10} className="text-yellow-500" />
                                            <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase">{formatRoleName(user.role)}</span>
                                        </div>
                                    </div>
                                    <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/10">
                                        <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Destino Asignado</span>
                                        <div className="flex items-center gap-2">
                                            <Building2 size={10} className="text-blue-500" />
                                            <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase wrap-break-word">{user.branchName || 'RESERVA'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Mobile Controls */}
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => handleResetPassword(user.email)}
                                        className="h-10 flex items-center justify-center bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-200 transition-all border border-transparent"
                                    >
                                        <Key size={14} strokeWidth={3} />
                                    </button>
                                    <button
                                        onClick={() => handleToggleStatus(user.uid, !!user.disabled)}
                                        disabled={user.uid === currentUser?.uid}
                                        className={clsx(
                                            "h-10 flex items-center justify-center rounded-xl transition-all border disabled:opacity-30",
                                            user.disabled 
                                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" 
                                                : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                        )}
                                    >
                                        <Activity size={14} strokeWidth={3} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteUser(user.uid)}
                                        disabled={user.uid === currentUser?.uid}
                                        className="h-10 flex items-center justify-center bg-rose-500/10 text-rose-500 rounded-xl border border-rose-500/20 disabled:opacity-30"
                                    >
                                        <Trash2 size={14} strokeWidth={3} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    {!loading && filteredUsers.length === 0 && (
                        <div className="p-8">
                            <EmptyState
                                title="No hay usuarios"
                                description="No se encontraron usuarios."
                                icon={User}
                            />
                        </div>
                    )}

                    <table className="hidden md:table w-full text-sm text-left text-slate-600 dark:text-slate-300 border-separate border-spacing-0">
                        <thead className="bg-slate-50 dark:bg-black/20 text-slate-500 dark:text-slate-400 font-medium sticky top-0 z-10 transition-colors border-b border-slate-100 dark:border-white/10">
                            <tr className="text-[9px] font-black uppercase tracking-[0.2em]">
                                <th className="px-6 py-4">Contexto de Identidad</th>
                                <th className="px-6 py-4">Seguridad / Email</th>
                                <th className="px-6 py-4">Rango Asignado</th>
                                <th className="px-6 py-4">Asignación de Unidad</th>
                                <th className="px-6 py-4">Última Sincro</th>
                                <th data-tour="usuarios-acciones" className="px-6 py-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center border-none">
                                        <div className="flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div></div>
                                    </td>
                                </tr>
                            ) : paginatedUsers.map((user) => (
                                <tr key={user.uid} className={clsx(
                                    "hover:bg-slate-50/50 dark:hover:bg-white/2 transition-colors group",
                                    user.uid === currentUser?.uid && "bg-purple-500/3 dark:bg-[#FFD700]/2",
                                    user.disabled && "opacity-60 grayscale-[0.5]"
                                )}>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-4">
                                            <div className={clsx(
                                                "h-12 w-12 rounded-2xl flex items-center justify-center font-black text-xl border shadow-sm transition-all group-hover:scale-105",
                                                user.role === 'GERENTE'
                                                    ? "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400"
                                                    : "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
                                            )}>
                                                {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight leading-tight">
                                                    {user.displayName || user.email}
                                                </div>
                                                {user.uid === currentUser?.uid && (
                                                    <span className="text-[8px] font-black text-yellow-600 dark:text-[#FFD700] uppercase tracking-widest mt-0.5 block">Identidad Maestro (Tú)</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 dark:text-slate-400 font-mono">
                                                <Mail size={12} strokeWidth={3} className="text-slate-300" /> {user.email}
                                            </div>
                                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest opacity-50 flex items-center gap-1">
                                                <Calendar size={10} /> {formatDate(user.createdAt)}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {user.uid === currentUser?.uid ? (
                                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-xl">
                                                <Shield size={12} className="text-purple-500" />
                                                <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">{formatRoleName(user.role)}</span>
                                            </div>
                                        ) : (
                                            <select
                                                value={user.role}
                                                onChange={(e) => handleRoleChange(user.uid, e.target.value)}
                                                className="bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/10 rounded-xl py-2 px-3 text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight focus:border-purple-500/50 outline-none transition-all appearance-none cursor-pointer"
                                            >
                                                {roles.map(r => (
                                                    <option key={r.id} value={r.id}>{r.name}</option>
                                                ))}
                                            </select>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-2 min-w-40">
                                            <select
                                                value={user.branchId || ''}
                                                onChange={(e) => handleBranchChange(user.uid, e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/10 rounded-xl py-2 px-3 text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tight focus:border-yellow-500/50 outline-none transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="">RESERVA LOGÍSTICA</option>
                                                {isHQ ? branches.map(b => (
                                                    <option key={b.id} value={b.id}>{b.name}</option>
                                                )) : branches.filter(b => b.id === currentBranch?.id).map(b => (
                                                    <option key={b.id} value={b.id}>{b.name}</option>
                                                ))}
                                            </select>
                                            
                                            {user.role === 'GERENTE' && (
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            await updateDoc(doc(db, 'users', user.uid), { canAccessAllBranches: !user.canAccessAllBranches });
                                                            toast.success("Permisos Maestro Actualizados");
                                                        } catch {
                                                            toast.error("No se pudieron actualizar los permisos. Intenta nuevamente.");
                                                        }
                                                    }}
                                                    className={clsx(
                                                        "text-[8px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5 px-2 py-0.5 rounded-xl w-fit border",
                                                        user.canAccessAllBranches 
                                                            ? "text-yellow-600 dark:text-[#FFD700] border-yellow-500/20 bg-yellow-500/5" 
                                                            : "text-slate-400 border-slate-200 dark:border-white/10"
                                                    )}
                                                >
                                                    <Settings2 size={10} /> {user.canAccessAllBranches ? "Acceso Total Activo" : "Acceso Restringido"}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-tight flex items-center gap-2">
                                            <Activity size={12} className="text-slate-300" />
                                            {formatDateTime(user.lastLogin)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-2">
                                            <button
                                                onClick={() => handleResetPassword(user.email)}
                                                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all border border-transparent hover:border-blue-500/20"
                                                title="Restablecer Contraseña"
                                            >
                                                <Key size={14} strokeWidth={3} />
                                            </button>

                                            <button
                                                onClick={() => handleToggleStatus(user.uid, !!user.disabled)}
                                                disabled={user.uid === currentUser?.uid}
                                                className={clsx(
                                                    "w-8 h-8 flex items-center justify-center rounded-xl transition-all border border-transparent disabled:opacity-30",
                                                    user.disabled
                                                        ? "text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/20"
                                                        : "text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/20"
                                                )}
                                                title={user.disabled ? "Restaurar Acceso" : "Suspender Actividad"}
                                            >
                                                <Activity size={14} strokeWidth={3} />
                                            </button>

                                            <button
                                                onClick={() => handleDeleteUser(user.uid)}
                                                disabled={user.uid === currentUser?.uid}
                                                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all border border-transparent hover:border-rose-500/20 disabled:opacity-30"
                                                title="Eliminación Definitiva"
                                            >
                                                <Trash2 size={14} strokeWidth={3} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loading && filteredUsers.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-12">
                                        <EmptyState
                                            title="No hay usuarios"
                                            description="No se encontraron usuarios que coincidan con la búsqueda."
                                            icon={User}
                                        />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <TableFooter
                    totalItems={filteredUsers.length}
                    itemsPerPage={itemsPerPage}
                    onChangeItemsPerPage={setItemsPerPage}
                    currentPage={currentPage}
                    onChangePage={setCurrentPage}
                    totalPages={totalPages}
                    label="Usuarios Registrados"
                />
            </div>

            {/* Create User Modal - Suite Pro v4.0 */}
            {isCreateModalOpen && (
                <div onClick={createDismiss.onBackdropClick} className="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 shadow-[0_32px_128px_rgba(0,0,0,0.5)] w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-500 max-h-[90vh] overflow-y-auto relative">
                        <button onClick={closeCreateModal} disabled={creating} className="absolute top-4 right-4 p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-all z-10 disabled:opacity-30"><X size={18} className="text-slate-400" /></button>
                        {/* Modal Header */}
                        <div className="p-8 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-black/20">
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-4">
                                <UserPlus className="text-yellow-500" size={32} strokeWidth={2.5} />
                                Nuevo Usuario
                            </h3>
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-2">
                                Registro de usuario y asignación de rol
                            </p>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleCreateUser} className="p-8 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Nombre Completo</label>
                                    <input
                                        type="text"
                                        required
                                        value={newUser.displayName}
                                        onChange={e => setNewUser({ ...newUser, displayName: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-yellow-500/50 outline-none transition-all"
                                        placeholder="Ej. Juan Pérez"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Email Corporativo</label>
                                    <input
                                        type="email"
                                        required
                                        value={newUser.email}
                                        onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white font-mono focus:bg-white dark:focus:bg-black/40 focus:border-yellow-500/50 outline-none transition-all"
                                        placeholder="usuario@renotech.com"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Credencial Maestro (Mín. 6 carecteres)</label>
                                    <div className="relative">
                                        <input
                                            type="password"
                                            required
                                            minLength={6}
                                            value={newUser.password}
                                            onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                            className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white tracking-widest focus:bg-white dark:focus:bg-black/40 focus:border-yellow-500/50 outline-none transition-all font-mono"
                                            placeholder="••••••"
                                        />
                                        <Key className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Rango / Rol</label>
                                        <select
                                            value={newUser.role}
                                            onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                                            className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight focus:border-yellow-500/50 outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {roles.map(r => (
                                                <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Unidad Destino</label>
                                        <select
                                            value={newUser.branchId || (isHQ ? '' : currentBranch?.id || '')}
                                            onChange={e => setNewUser({ ...newUser, branchId: e.target.value })}
                                            disabled={!isHQ}
                                            className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-tight focus:border-yellow-500/50 outline-none transition-all appearance-none disabled:opacity-50 cursor-pointer"
                                        >
                                            <option value="">{isHQ ? 'SIN ASIGNAR' : 'CARGANDO...'}</option>
                                            {branches.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {newUser.role === 'GERENTE' && (
                                    <label className="flex items-center gap-4 p-4 rounded-2xl bg-yellow-500/5 border border-yellow-500/10 cursor-pointer group hover:bg-yellow-500/10 transition-all">
                                        <input
                                            type="checkbox"
                                            checked={newUser.canAccessAllBranches}
                                            onChange={(e) => setNewUser({ ...newUser, canAccessAllBranches: e.target.checked })}
                                            className="w-5 h-5 accent-yellow-500 cursor-pointer"
                                        />
                                        <div>
                                            <span className="text-[10px] font-black text-yellow-600 dark:text-[#FFD700] uppercase tracking-widest">Habilitar Privilegios Multisucursal</span>
                                            <p className="text-[8px] font-bold text-yellow-600/60 dark:text-[#FFD700]/40 uppercase mt-0.5">Visibilidad total de la red logística</p>
                                        </div>
                                    </label>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="flex-1 py-4 px-4 rounded-2xl border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="flex-2 py-4 px-4 rounded-2xl bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-2xl shadow-yellow-500/20 active:scale-95"
                                >
                                    {creating ? (
                                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <UserPlus size={18} strokeWidth={3} />
                                            Crear Usuario
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación Global - Suite Pro v4.0 */}
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={closeConfirmModal}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                variant={confirmModal.variant}
                isLoading={confirmModal.isLoading}
            />

            {/* Roles Manager Modal */}
            <RolesManager
                isOpen={isRolesManagerOpen}
                onClose={handleRolesManagerClose}
                currentUserId={currentUser?.uid || ''}
            />
        </div>
    );
}
