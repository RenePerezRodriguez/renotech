import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { QuotationItem, Client } from '@/types';

interface QuotationState {
    items: QuotationItem[];
    selectedClient: Client | null;
    isTaxed: boolean;
    daysValid: number;
    notes: string;
    viewMode: 'grid' | 'list';
    
    // Actions
    addItem: (item: QuotationItem) => void;
    removeItem: (productId: string) => void;
    updateItem: (productId: string, updates: Partial<QuotationItem>) => void;
    setClient: (client: Client | null) => void;
    setIsTaxed: (isTaxed: boolean) => void;
    setDaysValid: (days: number) => void;
    setNotes: (notes: string) => void;
    setViewMode: (mode: 'grid' | 'list') => void;
    clearCart: () => void;
    
    // Helpers
    getTotals: () => { subtotal: number; total: number; itemCount: number };
}

export const useQuotationStore = create<QuotationState>()(
    persist(
        (set, get) => ({
            items: [],
            selectedClient: null,
            isTaxed: false,
            daysValid: 0,
            notes: '',
            viewMode: 'grid',

            addItem: (item) => set((state) => {
                const existingIndex = state.items.findIndex(i => i.productId === item.productId);
                if (existingIndex >= 0) {
                    const newItems = [...state.items];
                    const existingItem = { ...newItems[existingIndex] };
                    existingItem.quantity += item.quantity;
                    // Recalculate based on current unitPrice (which follows the item's mode)
                    existingItem.subtotal = existingItem.quantity * existingItem.unitPrice;
                    newItems[existingIndex] = existingItem;
                    return { items: newItems };
                }
                return { items: [...state.items, item] };
            }),

            removeItem: (productId) => set((state) => ({
                items: state.items.filter(i => i.productId !== productId)
            })),

            updateItem: (productId, updates) => set((state) => ({
                items: state.items.map(i => {
                    if (i.productId === productId) {
                        const updated = { ...i, ...updates };
                        
                        // If priceMode changed, sync unitPrice
                        if (updates.priceMode) {
                            updated.unitPrice = updates.priceMode === 'CON_FACTURA' 
                                ? (i.priceConFactura || 0) 
                                : (i.priceSinFactura || 0);
                        }

                        if (updates.quantity !== undefined || updates.unitPrice !== undefined || updates.priceMode !== undefined) {
                            updated.subtotal = updated.quantity * updated.unitPrice;
                        }
                        return updated;
                    }
                    return i;
                })
            })),

            setClient: (client) => set({ selectedClient: client }),
            setIsTaxed: (isTaxed) => set({ isTaxed }),
            setDaysValid: (daysValid) => set({ daysValid: Math.max(0, Math.min(365, Math.round(daysValid))) }),
            setNotes: (notes) => set({ notes }),
            setViewMode: (viewMode) => set({ viewMode }),
            
            clearCart: () => set({ 
                items: [], 
                selectedClient: null, 
                isTaxed: false, 
                daysValid: 0, 
                notes: '' 
            }),

            getTotals: () => {
                const items = get().items;
                const subtotal = items.reduce((acc, i) => acc + i.subtotal, 0);
                const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);
                return { subtotal, total: subtotal, itemCount };
            }
        }),
        {
            name: 'quotation-storage',
            storage: typeof window !== 'undefined' ? createJSONStorage(() => sessionStorage) : undefined,
        }
    )
);
