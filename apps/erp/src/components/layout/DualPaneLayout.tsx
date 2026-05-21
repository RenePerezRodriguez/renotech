'use client';

import { ReactNode } from 'react';
import clsx from 'clsx';

interface DualPaneLayoutProps {
    children: ReactNode; // Products/Main content
    aside: ReactNode;    // Cart/Aside content
    activeTab: 'products' | 'cart';
    // No onTabChange here because the module handles the state
}

/**
 * Standard Dual Pane Layout for operational modules (POS, Quotations, Purchases, etc.)
 * Ensures a side-by-side view on desktop and tabbed view on mobile.
 */
export default function DualPaneLayout({
    children,
    aside,
    activeTab
}: DualPaneLayoutProps) {
    return (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-[#111827] transition-colors overflow-hidden relative h-full">
            <div className="flex-1 flex flex-row min-w-0 overflow-hidden p-1.5 sm:p-2 md:p-4 gap-2 sm:gap-4 relative h-full">
                {/* Main Content Area (Products Grid) */}
                <div className={clsx(
                    "flex-1 flex flex-col min-w-0 h-full overflow-hidden transition-all duration-300 relative",
                    activeTab === 'products' ? "flex" : "hidden md:flex"
                )}>
                    {children}
                </div>

                {/* Side Content Area (Cart Aside) */}
                <aside
                    className={clsx(
                        "w-full md:w-95 lg:w-105 shrink-0 h-full flex flex-col bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 md:rounded-3xl md:shadow-2xl overflow-hidden transition-all duration-300",
                        activeTab === 'cart'
                            ? "fixed inset-0 z-120 flex md:p-0 md:relative md:inset-auto md:z-10"
                            : "hidden md:flex relative z-10"
                    )}
                    style={activeTab === 'cart' ? {
                        paddingTop: 'max(8px, env(safe-area-inset-top))',
                        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
                        paddingLeft: 'max(8px, env(safe-area-inset-left))',
                        paddingRight: 'max(8px, env(safe-area-inset-right))',
                    } : undefined}
                >
                    <div className="flex-1 overflow-hidden flex flex-col h-full">
                        {aside}
                    </div>
                </aside>
            </div>
        </div>
    );
}
