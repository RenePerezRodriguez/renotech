'use client';

import { useState, useEffect } from 'react';
import { Role } from '@/types';
import { RoleService } from '@/services/RoleService';
import { menuGroups } from '@/config/menu';
import { ALL_PERMISSIONS, type Permission } from '@/lib/permissions';
import { Shield, Plus, Trash2, Edit2, X, Check, Lock, Key } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/common/dialogs';
import clsx from 'clsx';

interface RolesManagerProps {
    isOpen: boolean;
    onClose: () => void;
    currentUserId: string;
}

export default function RolesManager({ isOpen, onClose, currentUserId }: RolesManagerProps) {
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // New role form
    const [newRole, setNewRole] = useState({
        name: '',
        description: '',
        allowedRoutes: ['/inicio'] as string[],
        permissions: [] as string[],
    });

    // Edit form
    const [editData, setEditData] = useState<{ name: string; description: string; allowedRoutes: string[]; permissions: string[] }>({
        name: '',
        description: '',
        allowedRoutes: [],
        permissions: [],
    });

    // Load roles
    useEffect(() => {
        if (isOpen) {
            loadRoles();
        }
    }, [isOpen]);

    const loadRoles = async () => {
        setLoading(true);
        try {
            await RoleService.seedDefaults();
            const data = await RoleService.getAll();
            setRoles(data);
        } catch {
            toast.error('Error al cargar roles');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newRole.name.trim()) {
            toast.error('El nombre es obligatorio');
            return;
        }
        // Auto-generate ID from name: uppercase, no spaces, no accents
        const roleId = newRole.name
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
        if (!roleId) {
            toast.error('El nombre debe contener al menos un carácter alfanumérico');
            return;
        }
        setSaving(true);
        try {
            await RoleService.create(
                { ...newRole, id: roleId, isSystem: false },
                currentUserId
            );
            toast.success(`Rol "${newRole.name}" creado`);
            setNewRole({ name: '', description: '', allowedRoutes: ['/inicio'], permissions: [] });
            setIsCreating(false);
            await loadRoles();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error al crear rol');
        } finally {
            setSaving(false);
        }
    };

    const handleStartEdit = (role: Role) => {
        setEditingRoleId(role.id!);
        setEditData({
            name: role.name,
            description: role.description || '',
            allowedRoutes: [...role.allowedRoutes],
            permissions: Array.isArray(role.permissions) ? [...role.permissions] : [],
        });
    };

    const handleSaveEdit = async () => {
        if (!editingRoleId) return;
        const target = roles.find(r => r.id === editingRoleId);
        setSaving(true);
        try {
            // System roles only update name + description; routes are locked.
            const payload = target?.isSystem
                ? { name: editData.name, description: editData.description }
                : editData;
            await RoleService.update(editingRoleId, payload);
            toast.success('Rol actualizado');
            setEditingRoleId(null);
            await loadRoles();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error al actualizar');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (roleId: string) => {
        const ok = await confirmDialog({
            title: 'Eliminar rol',
            message: 'Los usuarios asignados a este rol perderán acceso.',
            variant: 'danger',
            confirmText: 'Eliminar',
        });
        if (!ok) return;
        try {
            await RoleService.delete(roleId);
            toast.success('Rol eliminado');
            await loadRoles();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error al eliminar');
        }
    };

    const toggleRoute = (route: string, target: 'new' | 'edit') => {
        if (target === 'new') {
            setNewRole(prev => ({
                ...prev,
                allowedRoutes: prev.allowedRoutes.includes(route)
                    ? prev.allowedRoutes.filter(r => r !== route)
                    : [...prev.allowedRoutes, route],
            }));
        } else {
            setEditData(prev => ({
                ...prev,
                allowedRoutes: prev.allowedRoutes.includes(route)
                    ? prev.allowedRoutes.filter(r => r !== route)
                    : [...prev.allowedRoutes, route],
            }));
        }
    };

    const togglePermission = (perm: Permission, target: 'new' | 'edit') => {
        if (target === 'new') {
            setNewRole(prev => ({
                ...prev,
                permissions: prev.permissions.includes(perm)
                    ? prev.permissions.filter(p => p !== perm)
                    : [...prev.permissions, perm],
            }));
        } else {
            setEditData(prev => ({
                ...prev,
                permissions: prev.permissions.includes(perm)
                    ? prev.permissions.filter(p => p !== perm)
                    : [...prev.permissions, perm],
            }));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-1000 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-background rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden border border-slate-200 dark:border-white/10 flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-white/10 flex justify-between items-center bg-slate-50 dark:bg-background shrink-0">
                    <div>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                            <Shield className="text-purple-500" size={20} />
                            Gestión de Roles
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Crea y edita roles con permisos personalizados por vista</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
                        </div>
                    ) : (
                        <>
                            {/* Existing Roles */}
                            <div className="space-y-3">
                                {roles.map(role => (
                                    <div
                                        key={role.id}
                                        className={clsx(
                                            "border rounded-xl p-4 transition-colors",
                                            role.isSystem
                                                ? "border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10"
                                                : "border-slate-200 dark:border-white/10 bg-white dark:bg-white/5/40"
                                        )}
                                    >
                                        {editingRoleId === role.id ? (
                                            /* Edit Mode */
                                            <div className="space-y-4">
                                                <div className="flex gap-3">
                                                    <input
                                                        value={editData.name}
                                                        onChange={e => setEditData({ ...editData, name: e.target.value })}
                                                        className="flex-1 bg-slate-50 dark:bg-background border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-purple-500 outline-none"
                                                        placeholder="Nombre del rol"
                                                    />
                                                    <input
                                                        value={editData.description}
                                                        onChange={e => setEditData({ ...editData, description: e.target.value })}
                                                        className="flex-1 bg-slate-50 dark:bg-background border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                                        placeholder="Descripción"
                                                    />
                                                </div>
                                                {role.isSystem ? (
                                                    <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl px-3 py-2 flex items-center gap-2">
                                                        <Lock size={11} />
                                                        Las vistas y permisos de los roles del sistema no se pueden modificar (se gestionan en código). Sólo puedes cambiar el nombre y la descripción.
                                                    </div>
                                                ) : (
                                                    <>
                                                        <RouteCheckboxes
                                                            selectedRoutes={editData.allowedRoutes}
                                                            onToggle={(route) => toggleRoute(route, 'edit')}
                                                        />
                                                        <PermissionCheckboxes
                                                            selected={editData.permissions}
                                                            onToggle={(p) => togglePermission(p, 'edit')}
                                                        />
                                                    </>
                                                )}
                                                <div className="flex gap-2 justify-end">
                                                    <button onClick={() => setEditingRoleId(null)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-xl transition">
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={handleSaveEdit}
                                                        disabled={saving}
                                                        className="px-4 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition disabled:opacity-50 flex items-center gap-1"
                                                    >
                                                        <Check size={14} /> Guardar
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            /* View Mode */
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-black text-slate-900 dark:text-white">{role.name}</span>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">{role.id}</span>
                                                        {role.isSystem && (
                                                            <span className="text-[10px] font-bold text-purple-500 uppercase tracking-widest bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded flex items-center gap-1">
                                                                <Lock size={8} /> Sistema
                                                            </span>
                                                        )}
                                                    </div>
                                                    {role.description && (
                                                        <p className="text-xs text-slate-500 mt-1">{role.description}</p>
                                                    )}
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {RoleService.normalizeRoutes(role.allowedRoutes).map(route => {
                                                            const menuItem = menuGroups.flatMap(g => g.items).find(i => i.href === route);
                                                            return (
                                                                <span key={route} className="text-[10px] font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-800">
                                                                    {menuItem?.name || route}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                {!role.isSystem ? (
                                                    <div className="flex gap-1 shrink-0">
                                                        <button
                                                            onClick={() => handleStartEdit(role)}
                                                            className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
                                                            title="Editar"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(role.id!)}
                                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-1 shrink-0">
                                                        <button
                                                            onClick={() => handleStartEdit(role)}
                                                            className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
                                                            title="Editar nombre y descripción"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Create New Role */}
                            {isCreating ? (
                                <div className="border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-xl p-5 space-y-4 bg-purple-50/30 dark:bg-purple-900/5">
                                    <h4 className="text-sm font-black text-purple-700 dark:text-purple-400 uppercase tracking-wider">Nuevo Rol</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <input
                                            value={newRole.name}
                                            onChange={e => setNewRole({ ...newRole, name: e.target.value })}
                                            className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-purple-500 outline-none"
                                            placeholder="Nombre del rol (ej: Cajero)"
                                        />
                                        <input
                                            value={newRole.description}
                                            onChange={e => setNewRole({ ...newRole, description: e.target.value })}
                                            className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                            placeholder="Descripción (opcional)"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                            Vistas Permitidas
                                        </label>
                                        <RouteCheckboxes
                                            selectedRoutes={newRole.allowedRoutes}
                                            onToggle={(route) => toggleRoute(route, 'new')}
                                        />
                                    </div>

                                    <PermissionCheckboxes
                                        selected={newRole.permissions}
                                        onToggle={(p) => togglePermission(p, 'new')}
                                    />

                                    <div className="flex gap-2 justify-end pt-2">
                                        <button onClick={() => setIsCreating(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-xl transition">
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleCreate}
                                            disabled={saving || !newRole.name.trim()}
                                            className="px-4 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition disabled:opacity-50 flex items-center gap-1"
                                        >
                                            <Check size={14} /> Crear Rol
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsCreating(true)}
                                    className="w-full border-2 border-dashed border-slate-300 dark:border-white/10 rounded-xl p-4 text-sm font-bold text-slate-400 hover:text-purple-500 hover:border-purple-400 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Plus size={16} /> Crear Nuevo Rol
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Reusable checkboxes for route selection, grouped by menu category */
function RouteCheckboxes({ selectedRoutes, onToggle }: { selectedRoutes: string[]; onToggle: (route: string) => void }) {
    return (
        <div className="space-y-3">
            {menuGroups.map(group => (
                <div key={group.title}>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{group.title}</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                        {group.items.map(item => {
                            const Icon = item.icon;
                            const isSelected = selectedRoutes.includes(item.href);
                            return (
                                <button
                                    key={item.href}
                                    type="button"
                                    onClick={() => onToggle(item.href)}
                                    className={clsx(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                                        isSelected
                                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 shadow-sm"
                                            : "bg-slate-50 dark:bg-white/5 text-slate-400 border-slate-200 dark:border-white/10 hover:border-blue-300 hover:text-blue-500"
                                    )}
                                >
                                    <Icon size={12} />
                                    {item.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * Reusable checkboxes for granular permissions.
 * Permite a un rol personalizado realizar acciones que normalmente sólo
 * el rol GERENTE puede hacer (resolver alertas, anular gastos, aprobar
 * descuentos, etc). Las reglas de Firestore consultan estos permisos
 * via `hasPerm()` y siempre permiten la acción a GERENTE como bypass.
 */
function PermissionCheckboxes({ selected, onToggle }: { selected: string[]; onToggle: (p: Permission) => void }) {
    return (
        <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Key size={12} className="text-amber-500" />
                Permisos Especiales
            </label>
            <p className="text-[10px] text-slate-400 mb-2">
                Otorga a este rol acciones que normalmente requieren ser Gerente. Únicamente activa lo que necesites.
            </p>
            <div className="flex flex-col gap-1.5">
                {ALL_PERMISSIONS.map(perm => {
                    const isSelected = selected.includes(perm.id);
                    return (
                        <button
                            key={perm.id}
                            type="button"
                            onClick={() => onToggle(perm.id)}
                            className={clsx(
                                "text-left flex items-start gap-2.5 px-3 py-2 rounded-xl border transition-all",
                                isSelected
                                    ? "bg-amber-50 dark:bg-amber-900/15 border-amber-300 dark:border-amber-700"
                                    : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-amber-300"
                            )}
                        >
                            <div className={clsx(
                                "w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5",
                                isSelected
                                    ? "bg-amber-500 border-amber-500 text-white"
                                    : "border-slate-300 dark:border-gray-600"
                            )}>
                                {isSelected && <Check size={11} strokeWidth={3} />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={clsx(
                                    "text-xs font-bold",
                                    isSelected ? "text-amber-900 dark:text-amber-200" : "text-slate-600 dark:text-slate-300"
                                )}>
                                    {perm.label}
                                </p>
                                <p className="text-[10px] text-slate-500 mt-0.5">{perm.description}</p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

