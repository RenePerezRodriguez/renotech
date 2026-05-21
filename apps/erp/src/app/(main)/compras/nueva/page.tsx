'use client';

import { useState, useCallback } from 'react';
import { PurchaseItem, Product } from '@/types';
import { LayoutGrid, ShoppingCart } from 'lucide-react';
import clsx from 'clsx';
import PurchaseProductGrid from './components/PurchaseProductGrid';
import PurchaseCart from './components/PurchaseCart';
import NewProductModal from './components/NewProductModal';
import { usePurchaseStore } from '@/store/purchaseStore';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineModuleGuard } from '@/components/common/OfflineModuleGuard';

import DualPaneLayout from '@/components/layout/DualPaneLayout';

export default function NewPurchasePage() {
    const { role } = useAuth();
    const { isHQ } = useBranch();
    const { isOnline } = useNetworkStatus();

    if (!isOnline) return <OfflineModuleGuard moduleName="Nueva Compra"><span/></OfflineModuleGuard>;
    const [activeTab, setActiveTab] = useState<'products' | 'cart'>('products');
    const [showNewProductModal, setShowNewProductModal] = useState(false);

    const canCreateProduct = isHQ && role === 'GERENTE';

    // Store
    const items = usePurchaseStore(state => state.items);
    const addItem = usePurchaseStore(state => state.addItem);
    const removeItem = usePurchaseStore(state => state.removeItem);
    const updateItem = usePurchaseStore(state => state.updateItem);
    const clearCart = usePurchaseStore(state => state.clearCart);

    const handleProductSelect = useCallback((product: Product) => {
        addItem({
            productId: product.id!,
            productCode: product.codigo,
            productName: product.nombre,
            quantity: 1,
            cost: product.costo ?? 0
        });

        // On mobile, switch to cart view
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setActiveTab('cart');
        }
    }, [addItem]);

    const handleRemoveItem = useCallback((index: number) => {
        const item = items[index];
        if (item) removeItem(item.productId);
    }, [items, removeItem]);

    const handleUpdateItem = useCallback((index: number, updates: Partial<PurchaseItem>) => {
        const item = items[index];
        if (item) updateItem(item.productId, updates);
    }, [items, updateItem]);

    const handleClearCart = useCallback(() => {
        clearCart();
    }, [clearCart]);

    const handleProductCreated = useCallback((product: { id: string; nombre: string; codigo: string; costo: number }) => {
        addItem({
            productId: product.id,
            productCode: product.codigo,
            productName: product.nombre,
            quantity: 1,
            cost: product.costo
        });
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setActiveTab('cart');
        }
    }, [addItem]);

    const totalItems = items.reduce((acc, i) => acc + i.quantity, 0);


    return (
        <div className="flex flex-col h-full min-w-0 w-full max-w-full overflow-hidden bg-slate-50 dark:bg-[#111827] transition-colors">
            <DualPaneLayout
                activeTab={activeTab}
                aside={
                    <PurchaseCart
                        items={items}
                        onRemoveItem={handleRemoveItem}
                        onUpdateItem={handleUpdateItem}
                        onClearCart={handleClearCart}
                    />
                }
            >
                <PurchaseProductGrid
                    onProductSelect={handleProductSelect}
                    onNewProduct={canCreateProduct ? () => setShowNewProductModal(true) : undefined}
                />

                {/* Mobile Bottom Navigation (Rendered here as it's module-specific) */}
                <div className="md:hidden fixed bottom-4 inset-x-4 h-16 bg-white dark:bg-[#020617] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl grid grid-cols-2 z-130 transition-colors p-1 gap-1">
                    <button
                        onClick={() => setActiveTab('products')}
                        className={clsx(
                            "flex flex-col items-center justify-center gap-1 rounded-xl transition-all",
                            activeTab === 'products' ? "bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black shadow-lg" : "text-slate-400 dark:text-slate-500"
                        )}
                    >
                        <LayoutGrid size={20} />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Catálogo</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('cart')}
                        className={clsx(
                            "flex flex-col items-center justify-center gap-1 rounded-xl transition-all relative",
                            activeTab === 'cart' ? "bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black shadow-lg" : "text-slate-400 dark:text-slate-500"
                        )}
                    >
                        <div className="relative">
                            <ShoppingCart size={20} />
                            {totalItems > 0 && (
                                <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                                    {totalItems}
                                </span>
                            )}
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-widest">Carrito</span>
                    </button>
                </div>
            </DualPaneLayout>

            {canCreateProduct && (
                <NewProductModal
                    isOpen={showNewProductModal}
                    onClose={() => setShowNewProductModal(false)}
                    onProductCreated={handleProductCreated}
                />
            )}
        </div>
    );
}

