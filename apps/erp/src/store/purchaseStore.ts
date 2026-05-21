import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { PurchaseItem } from '@/types';
import { localDateStr } from '@/lib/utils';

export type PurchasePaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'QR' | 'CREDITO';

interface PurchaseState {
    items: PurchaseItem[];
    supplierId: string | null;
    supplierName: string | null;
    date: string;
    paymentMethod: PurchasePaymentMethod;
    paymentReference: string;
    dueDate: string; // ISO date para CREDITO (opcional)
    addItem: (item: PurchaseItem) => void;
    removeItem: (productId: string) => void;
    updateItem: (productId: string, updates: Partial<PurchaseItem>) => void;
    setSupplier: (id: string | null, name: string | null) => void;
    setDate: (date: string) => void;
    setPaymentMethod: (m: PurchasePaymentMethod) => void;
    setPaymentReference: (r: string) => void;
    setDueDate: (d: string) => void;
    clearCart: () => void;
}

export const usePurchaseStore = create<PurchaseState>()(
    persist(
        (set) => ({
            items: [],
            supplierId: null,
            supplierName: null,
            date: localDateStr(),
            paymentMethod: 'EFECTIVO',
            paymentReference: '',
            dueDate: '',
            addItem: (item) => set((state) => {
                const existingIndex = state.items.findIndex(i => i.productId === item.productId);
                if (existingIndex >= 0) {
                    const newItems = [...state.items];
                    newItems[existingIndex].quantity += item.quantity;
                    return { items: newItems };
                }
                return { items: [...state.items, item] };
            }),
            removeItem: (productId) => set((state) => ({
                items: state.items.filter(i => i.productId !== productId)
            })),
            updateItem: (productId, updates) => set((state) => ({
                items: state.items.map(i =>
                    i.productId === productId ? { ...i, ...updates } : i
                )
            })),
            setSupplier: (id, name) => set({ supplierId: id, supplierName: name }),
            setDate: (date) => set({ date }),
            setPaymentMethod: (m) => set({ paymentMethod: m }),
            setPaymentReference: (r) => set({ paymentReference: r }),
            setDueDate: (d) => set({ dueDate: d }),
            clearCart: () => set({
                items: [],
                supplierId: null,
                supplierName: null,
                date: localDateStr(),
                paymentMethod: 'EFECTIVO',
                paymentReference: '',
                dueDate: ''
            }),
        }),
        {
            name: 'purchase-storage',
            storage: typeof window !== 'undefined' ? createJSONStorage(() => sessionStorage) : undefined,
        }
    )
);
