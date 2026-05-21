'use client';

import { auth, db } from '@/lib/firebase';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, serverTimestamp, getDoc, onSnapshot } from 'firebase/firestore';
import { RoleService } from '@/services/RoleService';
import { resolveRoleId } from '@/utils/roles';
import { toast } from 'sonner';
import { logAdminAction } from '@/lib/audit';

interface AuthContextType {
    user: User | null;
    role: string | null;
    roleName: string | null;        // Display name (e.g. 'Encargado de Ventas')
    realRole: string | null;        // Original role (for HQ admins)
    allowedRoutes: string[];
    loading: boolean;
    logout: () => Promise<void>;
    refreshUserClaims: () => Promise<void>;
    canAccess: (route: string) => boolean;
    simulateRole: (roleId: string | null) => Promise<void>;
    userName: string | null;        // Full name from Firestore
    branchId: string | null;        // Branch ID from Firestore
    isSimulating: boolean;          // Flag for Imposter Mode
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    role: null,
    roleName: null,
    realRole: null,
    allowedRoutes: [],
    loading: true,
    logout: async () => { },
    refreshUserClaims: async () => { },
    canAccess: () => false,
    simulateRole: async () => { },
    isSimulating: false,
    userName: null,
    branchId: null,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [realRole, setRealRole] = useState<string | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [roleName, setRoleName] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);
    const [branchId, setBranchId] = useState<string | null>(null);
    const [allowedRoutes, setAllowedRoutes] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const isSimulatingRef = useRef(false);

    // Load allowed routes for a given role
    const loadAllowedRoutes = useCallback(async (roleId: string) => {
        const resolved = resolveRoleId(roleId) || roleId;
        try {
            const routes = await RoleService.getAllowedRoutes(resolved);
            setAllowedRoutes(routes.length > 0 ? routes : ['/inicio']);
            // Resolve display name
            const roleDoc = await RoleService.getById(resolved);
            setRoleName(roleDoc?.name || resolved);
        } catch {
            setAllowedRoutes(['/inicio']);
            setRoleName(resolved);
        }
    }, []);

    useEffect(() => {
        let unsubscribeDoc: (() => void) | null = null;

        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                // Update lastLogin once
                const userRef = doc(db, 'users', currentUser.uid);
                updateDoc(userRef, { lastLogin: serverTimestamp() }).catch(err => console.error("Error updating lastLogin:", err));

                // Listen to user document reactively
                unsubscribeDoc = onSnapshot(userRef, async (snapshot) => {
                    const userData = snapshot.data();
                    
                    // --- SECURITY: Force Logout if Suspended (Architecture: data_flow.md L142) ---
                    if (userData?.status === 'SUSPENDED') {
                        toast.error('TU CUENTA HA SIDO SUSPENDIDA. Contacta a administración.');
                        await signOut(auth);
                        setLoading(false);
                        return;
                    }

                    // Get role from Firestore, but verify with custom claims from token
                    let userRole = userData?.role as string | undefined;
                    let userBranchId = userData?.branchId as string | undefined;
                    
                    // AUDIT FIX: Sync custom claims from Firebase Auth token for consistency
                    try {
                        const token = await currentUser.getIdTokenResult(true); // Force refresh to get latest custom claims
                        if (token.claims.role) {
                            userRole = token.claims.role as string;
                        }
                        if (token.claims.branchId) {
                            userBranchId = token.claims.branchId as string;
                        }
                    } catch (err) {
                        console.warn("Could not sync custom claims:", err);
                        // Fall back to Firestore values
                    }

                    setRealRole(userRole || null);

                    // Only update current role/routes if we are NOT in simulation mode
                    if (!isSimulatingRef.current) {
                        setRole(userRole || null);
                    }
                    const fsName = userData?.displayName || userData?.nombre || userData?.name;
                    const authDisplayName = currentUser.displayName;
                    const emailPrefix = currentUser.email?.split('@')[0];
                    // Intelligent fallback: Firestore first, then Auth (only if not technical email prefix)
                    const sanitizedName = fsName || (authDisplayName && authDisplayName !== emailPrefix ? authDisplayName : null);
                    setUserName(sanitizedName || null);
                    setBranchId(userBranchId || null);

                    if (userRole) {
                        try {
                            // Only GERENTE has write permission on /roles
                            if (userRole === 'GERENTE') await RoleService.seedDefaults();
                        } catch { /* ignore if already seeded or no perms */ }
                        if (!isSimulatingRef.current) {
                            await loadAllowedRoutes(userRole);
                        }
                    } else {
                        setAllowedRoutes([]);
                    }
                    setLoading(false);
                }, (error) => {
                    console.error("AuthContext Snapshot Error:", error);
                    setLoading(false);
                });
            } else {
                if (unsubscribeDoc) unsubscribeDoc();
                setRealRole(null);
                setRole(null);
                setUserName(null);
                setBranchId(null);
                setAllowedRoutes([]);
                setLoading(false);
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeDoc) unsubscribeDoc();
        };
    }, [loadAllowedRoutes]);

    // Simulate a different role (Imposter Mode)
    const simulateRole = async (roleId: string | null) => {
        // Solo el GERENTE real puede activar/desactivar simulación.
        if (realRole !== 'GERENTE') {
            toast.error('Solo el rol GERENTE puede simular otros roles.');
            return;
        }

        if (!roleId) {
            // Restore real role
            isSimulatingRef.current = false;
            setRole(realRole);
            if (realRole) {
                await loadAllowedRoutes(realRole);
            }
            logAdminAction(auth.currentUser?.uid || user?.uid || 'unknown', 'impersonation', 'SIMULATE_ROLE_STOP', realRole || 'unknown', 'N/A').catch(() => {});
            toast.success('Simulación de rol desactivada');
            return;
        }

        try {
            const routes = await RoleService.getAllowedRoutes(roleId);
            const normalizedRoutes = routes.length > 0 ? routes : ['/inicio'];

            isSimulatingRef.current = true;
            setRole(roleId);
            setAllowedRoutes(normalizedRoutes);

            logAdminAction(auth.currentUser?.uid || user?.uid || 'unknown', 'impersonation', `SIMULATE_ROLE_START:${roleId}`, realRole || 'unknown', 'N/A').catch(() => {});

            // Auto-redirect if current path is restricted
            const currentPath = window.location.pathname;
            const isAllowed = normalizedRoutes.some(r => currentPath.startsWith(r));
            if (!isAllowed) {
                router.push('/inicio');
            }

            toast.success(`Ahora viendo como: ${roleId}`);
        } catch (error) {
            console.error('Error simulating role:', error);
            toast.error('Error al simular rol');
        }
    };

    // Helper to force refresh role data
    const refreshUserClaims = async () => {
        if (auth.currentUser) {
            const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
            const userData = userDoc.data();
            const userRole = userData?.role as string | null;
            setRealRole(userRole || null);
            setRole(userRole || null);
            if (userRole) {
                await loadAllowedRoutes(userRole);
            }
        }
    };

    // Check if current user can access a specific route
    const canAccess = useCallback((route: string): boolean => {
        // While still loading auth state, allow access (prevents redirect loop)
        if (loading) return true;
        // GERENTE always has access, even to things not in menu config
        if (role === 'GERENTE') return true;

        // Ensure path normalization (trim and remove trailing slash)
        const normalizedRoute = route.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';

        const isAllowed = allowedRoutes.some(r => {
            const normalizedAllowed = r.replace(/\/$/, '') || '/';
            if (normalizedAllowed === normalizedRoute) return true;
            if (normalizedRoute.startsWith(normalizedAllowed + '/')) return true;
            return false;
        });

        // Debug logging for simulation issues, only when explicitly enabled.
        if (!isAllowed && role && process.env.NEXT_PUBLIC_RBAC_DEBUG === 'true') {
            console.warn(`[RBAC] Access Denied:`, {
                route: normalizedRoute,
                role,
                realRole,
                isSimulating: isSimulatingRef.current,
                allowedRoutesCount: allowedRoutes.length,
                allowedRoutesSample: allowedRoutes.slice(0, 5)
            });
        }

        return isAllowed || normalizedRoute === '/inicio';
    }, [role, allowedRoutes, realRole, loading]);

    const logout = async () => {
        await signOut(auth);
        setRole(null);
        setUserName(null);
        setAllowedRoutes([]);
        router.push('/acceso');
    };

    return (
        <AuthContext.Provider value={{
            user,
            role,
            roleName,
            realRole,
            loading,
            logout,
            refreshUserClaims,
            allowedRoutes,
            simulateRole,
            canAccess,
            isSimulating: role !== realRole,
            userName,
            branchId
        }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

