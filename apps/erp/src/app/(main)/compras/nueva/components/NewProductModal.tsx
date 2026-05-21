'use client';

import { useState } from 'react';
import { X, PackagePlus } from 'lucide-react';
import ProductForm from '@/app/(main)/inventario/components/ProductForm';
import { InventoryService } from '@/services/InventoryService';
import { logAdminAction } from '@/lib/audit';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { toast } from 'sonner';
import { Product } from '@/types';

interface NewProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onProductCreated: (product: { id: string; nombre: string; codigo: string; costo: number }) => void;
}

export default function NewProductModal({ isOpen, onClose, onProductCreated }: NewProductModalProps) {
    const { user } = useAuth();
    const { currentBranch, isHQ } = useBranch();
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (data: Omit<Product, 'id'>) => {
        if (!isHQ || !currentBranch?.id) return;

        setIsLoading(true);
        try {
            // Force stock to 0 — the purchase transaction itself will add the purchased quantity
            const newId = await InventoryService.createProduct({ ...data, stock: 0 }, currentBranch.id, isHQ);
            await logAdminAction(
                user?.uid || '?',
                user?.email || '?',
                'CREATE_PRODUCT',
                newId,
                currentBranch.id,
                `Producto creado desde compras: ${data.nombre}`
            );
            onProductCreated({
                id: newId,
                nombre: data.nombre,
                codigo: data.codigo || 'S/N',
                costo: data.costo || 0
            });
            toast.success(`"${data.nombre}" creado y agregado al carrito`);
            onClose();
        } catch {
            toast.error('Error al crear el producto');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-1000 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-[#020617] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-linear-to-r from-emerald-500 to-emerald-600 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-xl">
                            <PackagePlus className="text-white" size={20} />
                        </div>
                        <div>
                            <h2 className="font-black text-white text-sm uppercase tracking-wider">Registrar Producto Nuevo</h2>
                            <p className="text-emerald-100 text-[10px] font-bold uppercase tracking-widest">Se agregará al carrito automáticamente</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* ProductForm Container */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                    <ProductForm
                        onSubmit={handleSubmit}
                        onCancel={onClose}
                        isLoading={isLoading}
                    />
                </div>
            </div>
        </div>
    );
}
