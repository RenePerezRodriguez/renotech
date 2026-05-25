'use client';

import { useState, useEffect } from 'react';
import { Empresa, SupplierAccount, Branch, Product } from '@/types';
import { DevolucionProveedorService, DevolucionItem } from '@/services/DevolucionProveedorService';
import { BranchService } from '@/services/BranchService';
import { useProducts } from '@/hooks/useProducts';
import { searchProducts } from '@/utils/searchProducts';
import IndustrialModal from '@/components/common/IndustrialModal';
import { Undo2, Save, Search, Trash2, Building2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import clsx from 'clsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    empresa: Empresa | null;
    accounts: SupplierAccount[];
}

export default function DevolucionProveedorModal({ isOpen, onClose, empresa, accounts }: Props) {
    const { user } = useAuth();
    const { currentBranch } = useBranch();
    const [step, setStep] = useState<1 | 2>(1);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<string>('');
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    
    // Búsqueda
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    
    // Productos locales para búsqueda instantánea
    const { products } = useProducts(selectedBranchId || 'ALL');
    
    // Items
    const [items, setItems] = useState<DevolucionItem[]>([]);
    const [motivo, setMotivo] = useState('Devolución de productos al proveedor');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setStep(1);
            setItems([]);
            setSearchTerm('');
            setSearchResults([]);
            setMotivo('Devolución de productos al proveedor');
            return;
        }
        BranchService.getActive().then(b => {
            setBranches(b);
            if (b.length > 0 && !selectedBranchId) {
                const defaultBranch = b.find(branch => branch.id === currentBranch?.id) || b[0];
                setSelectedBranchId(defaultBranch.id!);
            }
        });
        if (accounts.length > 0 && !selectedAccountId) {
            setSelectedAccountId(accounts[0].id!);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (!searchTerm.trim() || !selectedBranchId) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        // Búsqueda instantánea en memoria sin debounce
        const results = searchProducts(products, searchTerm, 10);
        setSearchResults(results.filter(p => p.branchId === selectedBranchId));
        setIsSearching(false);
    }, [searchTerm, selectedBranchId, products]);

    const addItem = (prod: Product) => {
        if (items.some(it => it.productId === prod.id)) {
            toast.error('El producto ya está en la lista');
            return;
        }
        setItems(prev => [...prev, {
            masterId: prod.masterId,
            productId: prod.id,
            productCode: prod.codigo,
            productName: prod.nombre,
            codigoFabrica: prod.codigoFabrica || '',
            codigoOE: prod.codigoOE || '',
            marca: prod.marca || '',
            quantity: 1,
            cost: 0, // Se puede dejar en 0 o pedir input si es necesario
            total: 0,
        }]);
        setSearchTerm('');
    };

    const removeItem = (productId: string) => {
        setItems(prev => prev.filter(it => it.productId !== productId));
    };

    const updateItemQty = (productId: string, qtyStr: string) => {
        const qty = parseInt(qtyStr) || 0;
        setItems(prev => prev.map(it => it.productId === productId ? { ...it, quantity: qty, total: qty * it.cost } : it));
    };
    
    const updateItemCost = (productId: string, costStr: string) => {
        const cost = parseFloat(costStr) || 0;
        setItems(prev => prev.map(it => it.productId === productId ? { ...it, cost, total: it.quantity * cost } : it));
    };

    const totalValue = items.reduce((sum, it) => sum + it.total, 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!empresa?.id || !selectedAccountId || !selectedBranchId) return;
        if (items.length === 0) {
            toast.error('Agrega al menos un producto');
            return;
        }
        if (items.some(it => it.quantity <= 0)) {
            toast.error('Las cantidades deben ser mayores a 0');
            return;
        }
        
        setSaving(true);
        try {
            const branch = branches.find(b => b.id === selectedBranchId);
            await DevolucionProveedorService.createAtomic({
                empresaId: empresa.id,
                empresaNombre: empresa.nombre,
                accountId: selectedAccountId,
                branchId: selectedBranchId,
                branchName: branch?.name || 'Desconocida',
                items,
                motivo,
                usuarioId: user?.uid || 'unknown',
                usuarioNombre: user?.email || 'unknown',
            });
            toast.success('Devolución registrada correctamente');
            onClose();
        } catch (err) {
            console.error(err);
            const error = err as Error;
            toast.error(error.message || 'Error al registrar devolución');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen || !empresa) return null;

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title="Nueva Devolución"
            subtitle={`A proveedor: ${empresa.nombre}`}
            icon={<Undo2 size={24} strokeWidth={2.5} />}
            iconBg="bg-amber-500"
            iconColor="text-slate-900"
            maxWidth="max-w-3xl"
        >
            <form onSubmit={handleSubmit} className="pt-4 space-y-6">
                {step === 1 ? (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2 ml-1">
                                    Sucursal de origen
                                </label>
                                <div className="relative">
                                    <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <select
                                        value={selectedBranchId}
                                        disabled
                                        className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-100/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none text-sm font-bold appearance-none opacity-70 cursor-not-allowed"
                                    >
                                        <option value="" disabled>Selecciona sucursal</option>
                                        {branches.map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2 ml-1">
                                    Cuenta afectada (Saldo)
                                </label>
                                <div className="relative">
                                    <Undo2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <select
                                        value={selectedAccountId}
                                        disabled
                                        className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-100/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 outline-none text-sm font-bold appearance-none opacity-70 cursor-not-allowed"
                                    >
                                        <option value="" disabled>Selecciona cuenta</option>
                                        {accounts.map(a => (
                                            <option key={a.id} value={a.id}>{a.alias || a.razonSocial}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Buscador de productos */}
                        <div className="bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-white/10 p-4 rounded-2xl relative">
                            <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2 ml-1">
                                Agregar Productos
                            </label>
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Buscar por código o nombre..."
                                    className="w-full pl-9 pr-4 py-3 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 focus:border-amber-500 outline-none text-sm font-bold"
                                />
                                {isSearching && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <span className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin inline-block"></span>
                                    </div>
                                )}
                            </div>
                            
                            {searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto">
                                    {searchResults.map(p => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => addItem(p)}
                                            disabled={(p.stock || 0) <= 0}
                                            className={clsx(
                                                "w-full text-left px-4 py-3 flex items-center justify-between border-b border-slate-100 dark:border-white/5 last:border-0",
                                                (p.stock || 0) <= 0 
                                                    ? "opacity-50 cursor-not-allowed bg-slate-50 dark:bg-white/5" 
                                                    : "hover:bg-slate-50 dark:hover:bg-white/5"
                                            )}
                                        >
                                            <div className="min-w-0 flex-1 pr-4">
                                                <p className="text-[10px] text-amber-500 font-black">{p.codigo}</p>
                                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{p.nombre}</p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="text-[10px] text-slate-400">Stock</p>
                                                {(p.stock || 0) <= 0 ? (
                                                    <p className="text-sm font-black text-red-500">Sin Stock</p>
                                                ) : (
                                                    <p className="text-sm font-black">{p.stock}</p>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Lista de Items */}
                        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
                            <div className="px-4 py-3 bg-slate-50 dark:bg-black/20 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Productos a devolver ({items.length})</span>
                                <span className="text-sm font-black text-amber-500">Bs. {totalValue.toFixed(2)}</span>
                            </div>
                            
                            {items.length === 0 ? (
                                <div className="py-10 text-center flex flex-col items-center">
                                    <Package size={24} className="text-slate-300 mb-2" />
                                    <p className="text-xs font-bold text-slate-400">No hay productos en la lista</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-60 overflow-y-auto custom-scrollbar">
                                    {items.map(it => (
                                        <div key={it.productId} className="p-4 flex items-center gap-4 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-amber-500">{it.productCode}</p>
                                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{it.productName}</p>
                                            </div>
                                            
                                            <div className="flex items-center gap-3">
                                                <div className="w-20">
                                                    <label className="block text-[8px] font-black text-slate-400 mb-1">CANT.</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={it.quantity || ''}
                                                        onChange={e => updateItemQty(it.productId, e.target.value)}
                                                        className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-xs font-black text-center outline-none focus:border-amber-500"
                                                    />
                                                </div>
                                                <div className="w-24">
                                                    <label className="block text-[8px] font-black text-slate-400 mb-1">VALOR (BOB)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.1"
                                                        value={it.cost || ''}
                                                        onChange={e => updateItemCost(it.productId, e.target.value)}
                                                        placeholder="0.00"
                                                        className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-xs font-black text-right outline-none focus:border-amber-500"
                                                    />
                                                </div>
                                                <div className="w-24 text-right">
                                                    <label className="block text-[8px] font-black text-slate-400 mb-1">TOTAL</label>
                                                    <p className="text-sm font-black tabular-nums">{it.total.toFixed(2)}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(it.productId)}
                                                    className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors self-end"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 h-11 rounded-xl font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (items.length > 0 && selectedBranchId && selectedAccountId) setStep(2);
                                    else toast.error('Selecciona sucursal, cuenta y agrega productos');
                                }}
                                className="flex-2 bg-amber-500 hover:bg-amber-400 text-slate-900 h-11 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                            >
                                Continuar
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-5">
                            <h3 className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-4">Resumen de Devolución</h3>
                            <div className="grid grid-cols-2 gap-y-4 text-sm">
                                <div>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Proveedor</p>
                                    <p className="font-bold text-slate-800 dark:text-slate-200">{empresa.nombre}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Sucursal Origen</p>
                                    <p className="font-bold text-slate-800 dark:text-slate-200">{branches.find(b => b.id === selectedBranchId)?.name}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Items</p>
                                    <p className="font-bold text-slate-800 dark:text-slate-200">{items.length} prod. / {items.reduce((s, i) => s + i.quantity, 0)} unid.</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Valor Total a Favor</p>
                                    <p className="font-black text-amber-600 dark:text-amber-500 tabular-nums">Bs. {totalValue.toFixed(2)}</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2 ml-1">
                                Motivo / Observaciones
                            </label>
                            <textarea
                                value={motivo}
                                onChange={e => setMotivo(e.target.value)}
                                rows={3}
                                className="w-full p-4 rounded-xl bg-slate-100/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:border-amber-500 outline-none text-sm font-bold resize-none"
                            ></textarea>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                disabled={saving}
                                className="flex-1 h-11 rounded-xl font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                            >
                                Volver
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex-2 bg-amber-500 hover:bg-amber-400 text-slate-900 h-11 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl shadow-amber-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                <Save size={14} strokeWidth={3} />
                                {saving ? 'Procesando...' : 'Confirmar Devolución'}
                            </button>
                        </div>
                    </div>
                )}
            </form>
        </IndustrialModal>
    );
}
