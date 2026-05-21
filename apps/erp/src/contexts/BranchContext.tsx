'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Branch } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { BranchService } from '@/services/BranchService';

interface BranchContextType {
    currentBranch: Branch | null;
    branches: Branch[];           // All branches (for HQ users)
    isHQ: boolean;                // Is current branch the HQ?
    canSwitchBranch: boolean;     // Can user switch between branches?
    isConsolidatedView: boolean;  // Viewing all branches data?
    loading: boolean;
    setBranch: (branchId: string) => void;
    setConsolidatedView: (value: boolean) => void;
    refreshBranches: () => Promise<void>;
}

const BranchContext = createContext<BranchContextType>({
    currentBranch: null,
    branches: [],
    isHQ: false,
    canSwitchBranch: false,
    isConsolidatedView: false,
    loading: true,
    setBranch: () => { },
    setConsolidatedView: () => { },
    refreshBranches: async () => { },
});

export const useBranch = () => useContext(BranchContext);

const BRANCH_STORAGE_KEY = 'renotech_current_branch';

export function BranchProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [isConsolidatedView, setIsConsolidatedView] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userBranchData, setUserBranchData] = useState<{
        branchId?: string;
        canAccessAllBranches?: boolean;
    }>({});

    // Load user's branch data from Firestore reactively
    useEffect(() => {
        if (!user) {
            // Set loading false in next tick to avoid cascading render warning
            setTimeout(() => {
                setLoading(false);
                setUserBranchData({});
            }, 0);
            return;
        }

        const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                setUserBranchData({
                    branchId: data.branchId,
                    canAccessAllBranches: data.canAccessAllBranches || false,
                });
            } else {
                setUserBranchData({});
                setLoading(false);
            }
        }, (err) => {
            console.error('Error loading user branch data:', err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    // Load all branches
    const refreshBranches = useCallback(async () => {
        try {
            const branchesRef = collection(db, 'branches');
            const q = query(branchesRef, where('status', '==', 'ACTIVE'));
            const snapshot = await getDocs(q);
            const branchList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Branch[];
            setBranches(branchList);
            
            // Sync currentBranch if it exists
            setCurrentBranch(prev => {
                if (!prev) return null;
                return branchList.find(b => b.id === prev.id) || prev;
            });
            
            return branchList;
        } catch (error) {
            console.error('Error loading branches:', error);
            return [];
        }
    }, []);

    // Initialize branch context
    useEffect(() => {
        const initializeBranch = async () => {
            if (!user) {
                setLoading(false);
                return;
            }

            setLoading(true);

            // Load all branches
            const branchList = await refreshBranches();

            if (branchList.length === 0) {
                // No branches exist yet - this is first run
                // Will be handled by migration script
                setLoading(false);
                return;
            }

            const canAccessAll = userBranchData.canAccessAllBranches || false;

            if (canAccessAll) {
                // HQ user - check localStorage for last selected branch
                const savedBranchId = localStorage.getItem(BRANCH_STORAGE_KEY);
                const savedBranch = branchList.find(b => b.id === savedBranchId);

                if (savedBranch) {
                    setCurrentBranch(savedBranch);
                } else {
                    // Default to HQ branch
                    const hqBranch = branchList.find(b => b.isHQ);
                    setCurrentBranch(hqBranch || branchList[0]);
                }
            } else {
                // Regular user - fixed to their assigned branch
                const userBranch = branchList.find(b => b.id === userBranchData.branchId);
                setCurrentBranch(userBranch || null);
            }

            setLoading(false);
        };

        if (userBranchData.branchId !== undefined || userBranchData.canAccessAllBranches !== undefined) {
            initializeBranch();
        }
    }, [user, userBranchData, refreshBranches]);

    // Switch branch (only for HQ users)
    const setBranch = useCallback((branchId: string) => {
        // Defense: only HQ users can switch branches
        if (!userBranchData.canAccessAllBranches) {
            console.warn('[BranchContext] Non-HQ user attempted branch switch', { branchId });
            return;
        }
        const branch = branches.find(b => b.id === branchId);
        if (!branch) {
            console.warn('[BranchContext] Invalid branch ID', { branchId });
            return;
        }
        setCurrentBranch(branch);
        localStorage.setItem(BRANCH_STORAGE_KEY, branchId);
        setIsConsolidatedView(false);
    }, [branches, userBranchData.canAccessAllBranches]);

    // Defense: on every render, verify currentBranch is still authorized.
    // Prevents stale localStorage from granting access to unauthorized branches.
    useEffect(() => {
        if (!currentBranch || loading) return;
        if (!userBranchData.canAccessAllBranches && currentBranch.id !== userBranchData.branchId) {
            // User somehow has a branch they shouldn't — force back to their assigned branch
            const correctBranch = branches.find(b => b.id === userBranchData.branchId);
            if (correctBranch) {
                console.warn('[BranchContext] Correcting unauthorized branch access', {
                    current: currentBranch.id,
                    assigned: userBranchData.branchId,
                });
                setTimeout(() => {
                    setCurrentBranch(correctBranch);
                    localStorage.removeItem(BRANCH_STORAGE_KEY);
                }, 0);
            }
        }
    }, [currentBranch, loading, userBranchData, branches]);

    // Self-healing: asegurar que la sucursal tenga Caja POS + Bóveda
    const provisionedRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (!currentBranch?.id || !currentBranch.name || loading) return;
        if (provisionedRef.current.has(currentBranch.id)) return;
        provisionedRef.current.add(currentBranch.id);
        BranchService.ensureTreasuryAccounts(currentBranch.id, currentBranch.name).catch(err =>
            console.warn('[BranchContext] ensureTreasuryAccounts failed:', err)
        );
    }, [currentBranch, loading]);

    const value: BranchContextType = {
        currentBranch,
        branches,
        isHQ: currentBranch?.isHQ || false,
        canSwitchBranch: userBranchData.canAccessAllBranches || false,
        isConsolidatedView,
        loading,
        setBranch,
        setConsolidatedView: setIsConsolidatedView,
        refreshBranches: async () => { await refreshBranches(); },
    };

    return (
        <BranchContext.Provider value={value}>
            {children}
        </BranchContext.Provider>
    );
}
