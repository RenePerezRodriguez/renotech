import { db, app } from '@/lib/firebase';
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { logAdminAction } from '@/lib/audit';
import { Role } from '@/types';
import { menuGroups } from '@/config/menu';

const COLLECTION = 'roles';

// All possible routes extracted from menu config
export const ALL_ROUTES = menuGroups.flatMap(g => g.items.map(i => i.href));

// Default system roles
const DEFAULT_ROLES: Role[] = [
    {
        id: 'GERENTE',
        name: 'Gerente',
        description: 'Acceso total al sistema. No se puede modificar ni eliminar.',
        allowedRoutes: ALL_ROUTES,
        isSystem: true,
    },
    {
        id: 'ALMACENERO',
        name: 'Almacenero',
        description: 'Gestión de inventario, pedidos, envíos y compras.',
        allowedRoutes: ['/inicio', '/inventario', '/kardex', '/pedidos', '/envios', '/compras'],
        isSystem: true,
    },
    {
        id: 'ENCARGADO_VENTAS',
        name: 'Encargado de Ventas',
        description: 'Operaciones de caja, ventas, cotizaciones e inventario.',
        allowedRoutes: ['/inicio', '/punto-de-venta', '/caja', '/cotizaciones', '/ventas', '/clientes', '/creditos', '/inventario', '/kardex', '/pedidos', '/envios', '/compras'],
        isSystem: true,
    },
];

export const RoleService = {
    /** Get all roles */
    async getAll(): Promise<Role[]> {
        const snapshot = await getDocs(collection(db, COLLECTION));
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Role));
    },

    /** Get a single role by ID */
    async getById(id: string): Promise<Role | null> {
        const snap = await getDoc(doc(db, COLLECTION, id));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() } as Role;
    },

    /** Create a new role */
    async create(role: Omit<Role, 'id' | 'createdAt'> & { id: string }, createdBy: string): Promise<void> {
        await setDoc(doc(db, COLLECTION, role.id), {
            name: role.name,
            description: role.description || '',
            allowedRoutes: role.allowedRoutes,
            permissions: Array.isArray(role.permissions) ? role.permissions : [],
            isSystem: false,
            createdAt: serverTimestamp(),
            createdBy,
        });
        await logAdminAction(createdBy, '?', 'CREATE_ROLE', role.id, 'HQ', `Rol: ${role.name}`);
    },

    /** Update a role. System roles only allow name + description; never allowedRoutes/permissions. */
    async update(id: string, data: Partial<Pick<Role, 'name' | 'description' | 'allowedRoutes' | 'permissions'>>): Promise<void> {
        const existing = await this.getById(id);
        if (!existing) throw new Error('Rol no encontrado');
        const payload: Partial<Pick<Role, 'name' | 'description' | 'allowedRoutes' | 'permissions'>> = existing.isSystem
            ? { ...(data.name !== undefined ? { name: data.name } : {}), ...(data.description !== undefined ? { description: data.description } : {}) }
            : data;
        if (Object.keys(payload).length === 0) return;
        await updateDoc(doc(db, COLLECTION, id), payload);
        await logAdminAction('system_service', '?', 'UPDATE_ROLE', id, 'HQ', `Rol: ${data.name || existing.name}`);

        // Si cambiaron los permisos de un rol no-sistema, sincronizamos los
        // custom claims de todos los usuarios que tienen este rol asignado.
        // Best-effort: si la Cloud Function falla la edición ya quedó persistida.
        if (!existing.isSystem && payload.permissions !== undefined) {
            try {
                const fn = httpsCallable<{ roleId: string }, { success: boolean; total: number; updated: number }>(
                    getFunctions(app, 'us-central1'),
                    'resyncRoleClaims'
                );
                await fn({ roleId: id });
            } catch (err) {
                console.warn('[RoleService.update] resyncRoleClaims failed (los usuarios deberán hacer logout/login):', err);
            }
        }
    },

    /** Delete a role (cannot delete system roles) */
    async delete(id: string): Promise<void> {
        const existing = await this.getById(id);
        if (!existing) throw new Error('Rol no encontrado');
        if (existing.isSystem) throw new Error('No se puede eliminar un rol del sistema');

        // Check if any users have this role
        const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', id)));
        if (!usersSnap.empty) {
            throw new Error(`No se puede eliminar: ${usersSnap.size} usuario(s) tienen este rol asignado`);
        }

        await deleteDoc(doc(db, COLLECTION, id));
    },

    /** Seed default roles — creates if missing, updates allowedRoutes if already exist (upsert) */
    async seedDefaults(): Promise<void> {
        for (const role of DEFAULT_ROLES) {
            const existing = await this.getById(role.id!);
            if (!existing) {
                await setDoc(doc(db, COLLECTION, role.id!), {
                    name: role.name,
                    description: role.description,
                    allowedRoutes: role.allowedRoutes,
                    isSystem: role.isSystem,
                    createdAt: serverTimestamp(),
                    createdBy: 'system',
                });
            } else {
                // Sync allowedRoutes from code (so new menu items propagate),
                // but preserve user-edited name and description.
                await updateDoc(doc(db, COLLECTION, role.id!), {
                    allowedRoutes: role.allowedRoutes,
                });
            }
        }
    },

    /** Normalize routes (migration helper for stale Firestore data) */
    normalizeRoutes(routes: string[]): string[] {
        const mapping: Record<string, string> = {
            '/dashboard': '/inicio',
            '/pos': '/punto-de-venta',
            '/auditoriaoria': '/auditoria',
            '/configuracionuracion': '/configuracion',
            '/verify': '/verificar',
            '/sales': '/ventas',
            '/quotations': '/cotizaciones',
            '/cash': '/caja',
            '/clients': '/clientes',
            '/inventory': '/inventario',
            '/purchases': '/compras',
            '/transfers': '/pedidos',
            '/transferencias': '/pedidos',
            '/suppliers': '/proveedores',
            '/statistics': '/estadisticas',
            '/users': '/usuarios',
            '/branches': '/sucursales',
            '/config': '/configuracion',
        };

        return Array.from(new Set(routes.map(r => {
            const clean = r.replace(/\/$/, '');
            return mapping[clean] || clean;
        })));
    },

    /** Get allowed routes for a given role ID */
    async getAllowedRoutes(roleId: string): Promise<string[]> {
        // Backward compat: map legacy role IDs to current ones
        const LEGACY_ALIAS: Record<string, string> = { 'CAJERO': 'ENCARGADO_VENTAS' };
        const resolvedId = LEGACY_ALIAS[roleId.toUpperCase()] || roleId;
        const normalizedId = resolvedId.toUpperCase();

        try {
            // Firestore is the source of truth
            const role = await this.getById(resolvedId);
            if (role?.allowedRoutes && role.allowedRoutes.length > 0) {
                return this.normalizeRoutes(role.allowedRoutes);
            }

            // Also try normalized ID in Firestore if they differ
            if (resolvedId !== normalizedId) {
                const normalizedRole = await this.getById(normalizedId);
                if (normalizedRole?.allowedRoutes && normalizedRole.allowedRoutes.length > 0) {
                    return this.normalizeRoutes(normalizedRole.allowedRoutes);
                }
            }

            // If Firestore role exists but has empty routes, log warning and fall through to defaults
            if (role) {
                console.warn(`[RoleService] Role '${resolvedId}' exists in Firestore but has empty allowedRoutes. Using defaults.`);
            }
        } catch {
            // Fallback below
        }

        // Fallback to hardcoded defaults
        const defaultRole = DEFAULT_ROLES.find(r => r.id === normalizedId);
        if (defaultRole) {
            return this.normalizeRoutes(defaultRole.allowedRoutes);
        }

        return ['/inicio'];
    },
};
