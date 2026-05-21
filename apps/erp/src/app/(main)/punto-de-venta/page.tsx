'use client';

import { useState, useEffect } from 'react';
import ProductGrid from './components/ProductGrid';
import PosCart from './components/PosCart';
import KeyboardGuide from './components/KeyboardGuide';
import { LayoutGrid, ShoppingCart } from 'lucide-react';
import clsx from 'clsx';
import { usePosStore } from '@/store/posStore';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { logAdminAction } from '@/lib/audit';
import DualPaneLayout from '@/components/layout/DualPaneLayout';

export default function PosPage() {
    const { user } = useAuth();
    const { currentBranch } = useBranch();
    const [activeTab, setActiveTab] = useState<'products' | 'cart'>('products');
    const { getTotals } = usePosStore();
    const { itemCount, total } = getTotals();

    useEffect(() => {
        if (user && currentBranch?.id) {
            logAdminAction(
                user.uid,
                user.email || '?',
                'VIEW_POS',
                currentBranch.id,
                currentBranch.id,
                `Acceso al Punto de Venta - Sucursal: ${currentBranch.name}`
            ).catch(() => {});
        }
    }, [user, currentBranch?.id, currentBranch?.name]);

    return (
        <div className="flex flex-col h-full min-w-0 w-full max-w-full bg-white dark:bg-background transition-colors duration-500 overflow-hidden">
            
            <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
                <DualPaneLayout
                    activeTab={activeTab}
                    aside={<PosCart />}
                >
                    <ProductGrid />
                    <KeyboardGuide />

                    {/* Mobile Bottom Navigation */}
                    <div className="md:hidden fixed bottom-4 inset-x-4 h-16 bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl grid grid-cols-2 z-50 transition-colors p-1 gap-1">
                        <button
                            onClick={() => setActiveTab('products')}
                            className={clsx(
                                "flex flex-col items-center justify-center gap-1 rounded-xl transition-all",
                                activeTab === 'products' ? "bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black shadow-lg" : "text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5"
                            )}
                        >
                            <LayoutGrid size={20} />
                            <span className="text-[9px] font-bold uppercase tracking-widest">Productos</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('cart')}
                            className={clsx(
                                "flex flex-col items-center justify-center gap-1 rounded-xl transition-all relative",
                                activeTab === 'cart' ? "bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black shadow-lg" : "text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5"
                            )}
                        >
                            <div className="relative">
                                <ShoppingCart size={20} />
                                {itemCount > 0 && (
                                    <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                                        {itemCount}
                                    </span>
                                )}
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-widest">
                                Carrito {total > 0 && `(Bs. ${total.toFixed(0)})`}
                            </span>
                        </button>
                    </div>
                </DualPaneLayout>
            </div>
        </div>
    );
}
