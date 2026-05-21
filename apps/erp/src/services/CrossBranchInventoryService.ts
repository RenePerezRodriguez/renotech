'use client';

import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { BranchService } from './BranchService';
import { MasterCatalogService } from './MasterCatalogService';
import { Branch } from '@/types';

// Fields that are HIDDEN from cross-branch views (sensitive data)
const SENSITIVE_FIELDS = ['precioSinFactura', 'precioConFactura', 'precioMayorista', 'supplierId'];

export interface CrossBranchProduct {
    id: string;
    masterId: string; // Atomic Link
    codigo: string;
    nombre: string;
    marca?: string;
    categoria: string;
    stock: number;
    unidad?: string;
    codigoOE?: string;
    codigoFabrica?: string;
    origen?: string;
    imagenUrl?: string;
    branchId: string;
}

export interface BranchStock {
    branch: Branch;
    products: CrossBranchProduct[];
    totalProducts: number;
    totalStock: number;
}

const sanitizeProduct = (id: string, data: Record<string, unknown>): CrossBranchProduct => {
    const clean: Record<string, unknown> = { id };
    for (const [key, value] of Object.entries(data)) {
        if (!SENSITIVE_FIELDS.includes(key)) {
            clean[key] = value;
        }
    }
    // Validate required fields exist after sanitization
    if (!clean.masterId || !clean.codigo || !clean.nombre || !clean.categoria) {
        console.warn('[sanitizeProduct] Missing required fields', { id, keys: Object.keys(clean) });
    }
    return clean as unknown as CrossBranchProduct;
};

export const CrossBranchInventoryService = {
    /**
     * Get all active branches except the current one
     */
    async getOtherBranches(currentBranchId: string): Promise<Branch[]> {
        const allBranches = await BranchService.getActive();
        return allBranches.filter(b => b.id !== currentBranchId);
    },

    /**
     * Get products from a specific branch (sanitized - no sensitive fields)
     */
    async getBranchProducts(branchId: string): Promise<CrossBranchProduct[]> {
        const q = query(
            collection(db, 'productos'),
            where('branchId', '==', branchId),
            orderBy('nombre'),
            limit(500)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => sanitizeProduct(doc.id, doc.data()));
    },

    /**
     * Get stock summary for all other branches
     */
    async getAllBranchesStock(currentBranchId: string): Promise<BranchStock[]> {
        const otherBranches = await this.getOtherBranches(currentBranchId);
        const results: BranchStock[] = [];

        for (const branch of otherBranches) {
            const products = await this.getBranchProducts(branch.id!);
            results.push({
                branch,
                products,
                totalProducts: products.length,
                totalStock: products.reduce((acc, p) => acc + (p.stock || 0), 0),
            });
        }

        return results;
    },

    /**
     * Search a product across ALL branches using the Master Catalog as source.
     * This allows for smart partial matches using search tags.
     */
    async searchAcrossBranches(
        searchTerm: string
    ): Promise<{ branch: Branch | null; product: CrossBranchProduct }[]> {
        // 1. Search in Master Catalog (Smart Partial Search with Tags)
        const masters = await MasterCatalogService.search(searchTerm);
        
        // 2. Map to expected format
        // We return product information with null branchId initially, 
        // the UI will handle showing 'Sede Local' badge if it exists in currentBranch
        return masters.map(m => ({
            branch: null,
            product: {
                id: m.id!,
                masterId: m.id!,
                codigo: m.codigo,
                nombre: m.nombre,
                marca: '', // We could fetch this but for high-speed search, ID/Name/Code is primary
                categoria: 'Otros',
                stock: 0, 
                codigoOE: m.codigoOE,
                codigoFabrica: m.codigoFabrica,
                origen: m.origen,
                imagenUrl: m.imagenUrls?.[0] || '', // Correctly mapping plural to singular
                branchId: ''
            }
        }));
    },

    /**
     * Get stock details for a specific product ID (Master ID) across ALL active branches.
     * Use masterId instead of code for 100% precision across all locations.
     */
    async getProductStockAcrossBranches(masterId: string): Promise<{ branchName: string; stock: number; costo: number; branchId: string; productId: string; isHQ?: boolean }[]> {
        const branches = await BranchService.getActive();

        // We use a Promise.all for faster execution across all branches
        const promises = branches.map(async (branch) => {
            const q = query(
                collection(db, 'productos'),
                where('branchId', '==', branch.id),
                where('masterId', '==', masterId) // The masterId is the atomic link
            );
            const snap = await getDocs(q);
            
            // If the branch has the product document
            if (!snap.empty) {
                const data = snap.docs[0].data();
                return {
                    branchName: branch.name,
                    stock: Number(data.stock) || 0,
                    costo: Number(data.costo) || 0, // Injected for transfer bridge
                    branchId: branch.id!,
                    productId: snap.docs[0].id, // CRITICAL: This is the actual Doc ID for this branch
                    isHQ: branch.isHQ
                };
            }
            
            // If the branch doesn't have the product record at all, return 0 stock
            return {
                branchName: branch.name,
                stock: 0,
                costo: 0,
                branchId: branch.id!,
                productId: '', // No record exists
                isHQ: branch.isHQ
            };
        });

        const resolved = await Promise.all(promises);
        return resolved;
    },

    /**
     * Search products within a specific branch
     */
    async searchInBranch(branchId: string, term: string): Promise<CrossBranchProduct[]> {
        const t = term.trim().toLowerCase();
        // Since Firestore doesn't support partial string match easily with multiple filters,
        // we use the masterId link or a custom term search if we had tags.
        // For now, we'll search by master catalog tags and then check branch stock.
        const masters = await MasterCatalogService.search(t);
        const masterIds = masters.map(m => m.id!);
        
        if (masterIds.length === 0) return [];

        const results: CrossBranchProduct[] = [];
        // We can't use 'in' for more than 10 masterIds, so we search and filter or do multiple queries.
        // For simple search, let's just query products in branch and filter by masterIds.
        const q = query(
            collection(db, 'productos'),
            where('branchId', '==', branchId),
            limit(500)
        );
        const snapshot = await getDocs(q);
        
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (masterIds.includes(data.masterId)) {
                results.push(sanitizeProduct(doc.id, data));
            }
        });

        // Sort by master match order or name
        return results.sort((a, b) => a.nombre.localeCompare(b.nombre));
    }
};
