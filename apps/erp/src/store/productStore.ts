import { create } from 'zustand';
import { Product } from '@/types';
import { searchProducts } from '@/utils/searchProducts';

interface ProductStore {
    products: Product[];
    loading: boolean;
    branchId: string | null;

    setProducts: (products: Product[], branchId: string) => void;
    setLoading:  (loading: boolean) => void;

    /** Búsqueda inteligente en memoria — sin Firestore, sin debounce necesario */
    search: (query: string, limit?: number) => Product[];
}

export const useProductStore = create<ProductStore>((set, get) => ({
    products: [],
    loading:  true,
    branchId: null,

    setProducts: (products, branchId) => set({ products, branchId, loading: false }),
    setLoading:  (loading) => set({ loading }),

    search: (query, limit = 20) => searchProducts(get().products, query, limit),
}));
