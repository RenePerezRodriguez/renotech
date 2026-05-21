'use client';

import { useState, useEffect, useRef } from 'react';
import { LayoutGrid, ShoppingCart } from 'lucide-react';
import clsx from 'clsx';
import QuotationProductGrid from './components/QuotationProductGrid';
import QuotationCart from './components/QuotationCart';
import { useQuotationStore } from '@/store/quotationStore';
import DualPaneLayout from '@/components/layout/DualPaneLayout';

export default function NewQuotationPage() {
    const [activeTab, setActiveTab] = useState<'products' | 'cart'>('products');

    // Store
    const { getTotals } = useQuotationStore();
    const { itemCount } = getTotals();
    const gridRef = useRef<{ clearSearch: () => void }>(null);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // F2: Focus Search
            if (e.key === 'F2') {
                e.preventDefault();
                const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            }

            // ESC: Clear Search
            if (e.key === 'Escape') {
                const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
                if (document.activeElement === searchInput) {
                    gridRef.current?.clearSearch();
                }
            }

            // F8: Save Quotation
            if (e.key === 'F8') {
                e.preventDefault();
                const saveBtn = document.getElementById('save-quotation-btn') as HTMLButtonElement;
                if (saveBtn && !saveBtn.disabled) {
                    saveBtn.click();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="flex flex-col h-full min-w-0 w-full max-w-full bg-white dark:bg-background transition-colors duration-500 overflow-hidden">
            
            <div className="flex-1 min-w-0 overflow-hidden">
                <DualPaneLayout
                    activeTab={activeTab}
                    aside={<QuotationCart />}
                >
                    <QuotationProductGrid ref={gridRef} />

                    {/* Mobile Bottom Navigation */}
                    <div className="md:hidden fixed bottom-4 inset-x-4 h-16 bg-white/90 dark:bg-background/90 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl grid grid-cols-2 z-130 transition-colors p-1 gap-1">
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
                                    <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm z-130">
                                        {itemCount}
                                    </span>
                                )}
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-widest">
                                Cotización
                            </span>
                        </button>
                    </div>
                </DualPaneLayout>
            </div>
        </div>
    );
}
