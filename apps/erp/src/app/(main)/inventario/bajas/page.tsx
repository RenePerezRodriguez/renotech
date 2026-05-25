'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { InventoryService } from '@/services/InventoryService';
import { Product } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import Image from 'next/image';
import {
    Archive,
    Package,
    RotateCcw,
    History,
    Search,
    Loader2,
    ArrowLeft,
    CalendarX,
    ShieldAlert,
} from 'lucide-react';
import ModuleHeader from '@/components/common/ModuleHeader';
import ConfirmModal from '@/components/common/ConfirmModal';
import { ensureDate } from '@/utils/dateHelpers';
import { normalizeText } from '@/utils/normalize';
import { searchProducts } from '@/utils/searchProducts';
import clsx from 'clsx';

type DeletedProduct = Product & { deletedAt?: Timestamp; deletedBy?: string };

export default function BajasPage() {
    const router = useRouter();
    const { user: currentUser, role } = useAuth();
    const { currentBranch, isHQ: isBranchHQ } = useBranch();

    const [products, setProducts] = useState<DeletedProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const [restoreTarget, setRestoreTarget] = useState<DeletedProduct | null>(null);
    const [isRestoring, setIsRestoring] = useState(false);

    const isGerente = role === 'GERENTE';
    const canRestore = isGerente && isBranchHQ;

    const fetchDeleted = async () => {
        setLoading(true);
        try {
            const data = await InventoryService.getDeletedProducts();
            setProducts(data);
        } catch {
            toast.error('Error al cargar el archivo de bajas');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDeleted();
    }, []);

    const filtered = useMemo(() => {
        if (!searchTerm.trim()) return products;
        return searchProducts(products, searchTerm, 200) as DeletedProduct[];
    }, [products, searchTerm]);

    const handleRestore = async () => {
        if (!restoreTarget || !currentUser) return;
        setIsRestoring(true);
        try {
            await InventoryService.restoreProduct(restoreTarget.masterId, {
                uid: currentUser.uid,
                email: currentUser.email || '?',
                branchId: currentBranch?.id || 'GLOBAL',
                isHQ: isBranchHQ,
            });
            toast.success(`"${restoreTarget.nombre}" restaurado correctamente`);
            setRestoreTarget(null);
            await fetchDeleted();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Error al restaurar el producto');
        } finally {
            setIsRestoring(false);
        }
    };

    const formatDeletedAt = (ts?: Timestamp) => {
        if (!ts) return '—';
        try {
            return ensureDate(ts).toLocaleDateString('es-BO', {
                day: '2-digit', month: 'short', year: 'numeric',
            });
        } catch {
            return '—';
        }
    };

    return (
        <div className="flex-1 min-w-0 w-full max-w-full animate-in fade-in duration-500 flex flex-col space-y-6">

            <ModuleHeader
                title="Archivo de Bajas"
                subtitle="Productos dados de baja del sistema — historial preservado, restauración disponible"
                icon={Archive}
                actions={[
                    {
                        label: 'Volver al Inventario',
                        onClick: () => router.push('/inventario'),
                        icon: ArrowLeft,
                        variant: 'secondary',
                    },
                ]}
            />

            {/* Search bar */}
            <div className="relative max-w-lg">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                    type="text"
                    placeholder="Buscar por nombre, código, marca o categoría..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 text-[11px] font-bold bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
                />
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl overflow-hidden">

                {/* Table header */}
                <div className="shrink-0 px-6 py-4 flex items-center justify-between border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-black/20">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                            {loading ? 'Cargando...' : `${filtered.length} producto${filtered.length !== 1 ? 's' : ''} en archivo`}
                        </span>
                    </div>
                    {!canRestore && (
                        <div className="flex items-center gap-1.5 text-amber-500">
                            <ShieldAlert size={13} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Solo lectura — restauración requiere acceso HQ</span>
                        </div>
                    )}
                </div>

                {/* Loading state */}
                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-24 gap-4">
                        <Loader2 size={32} className="animate-spin text-blue-500" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando archivo de bajas...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-24 gap-4">
                        <Archive size={64} strokeWidth={0.5} className="opacity-20 text-slate-400" />
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                            {searchTerm ? 'Sin coincidencias' : 'Archivo vacío — no hay productos dados de baja'}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Desktop table */}
                        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
                            <table className="hidden md:table w-full text-sm border-separate border-spacing-0">
                                <thead className="sticky top-0 z-20 bg-slate-50/90 dark:bg-black/40 backdrop-blur-xl border-b border-slate-200 dark:border-white/10">
                                    <tr className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                                        <th className="px-6 py-4">Producto</th>
                                        <th className="px-6 py-4 text-center">Categoría</th>
                                        <th className="px-6 py-4 text-center">Stock al dar de baja</th>
                                        <th className="px-6 py-4 text-center">Fecha de Baja</th>
                                        <th className="px-6 py-4 text-right pr-8">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                    {filtered.map((product) => (
                                        <tr
                                            key={product.id}
                                            className="group hover:bg-slate-50/50 dark:hover:bg-white/2 transition-all duration-200"
                                        >
                                            {/* Product cell */}
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="relative shrink-0 w-14 h-14 rounded-2xl overflow-hidden bg-rose-50 dark:bg-rose-500/10 border-2 border-rose-100 dark:border-rose-500/20 flex items-center justify-center shadow-inner">
                                                        {product.imagenUrl ? (
                                                            <Image src={product.imagenUrl} alt="" fill className="object-contain opacity-60 grayscale" />
                                                        ) : (
                                                            <Package size={22} className="text-rose-300 dark:text-rose-500" strokeWidth={1} />
                                                        )}
                                                        <div className="absolute inset-0 bg-rose-500/10" />
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <h3 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase leading-none tracking-tight line-through decoration-rose-400/60 mb-1">
                                                            {product.nombre}
                                                        </h3>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                                                {product.codigo}
                                                            </span>
                                                            {product.marca && (
                                                                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                                                                    {product.marca}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Category */}
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-block px-3 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-white/10">
                                                    {product.categoria || 'Sin categoría'}
                                                </span>
                                            </td>

                                            {/* Stock */}
                                            <td className="px-6 py-4 text-center">
                                                <span className={clsx(
                                                    "text-sm font-black tabular-nums",
                                                    product.stock === 0 ? "text-slate-400" : "text-rose-500"
                                                )}>
                                                    {product.stock}
                                                </span>
                                            </td>

                                            {/* Deleted at */}
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-1.5 text-slate-400">
                                                    <CalendarX size={12} />
                                                    <span className="text-[10px] font-bold">
                                                        {formatDeletedAt(product.deletedAt)}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-6 py-4 text-right pr-8" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => router.push(`/kardex/${product.id}`)}
                                                        className="w-9 h-9 flex items-center justify-center bg-slate-50 dark:bg-white/3 hover:bg-indigo-500 hover:text-white text-slate-400 dark:text-slate-500 rounded-xl transition-all active:scale-95 border border-slate-100 dark:border-white/10"
                                                        title="Ver Kardex histórico"
                                                    >
                                                        <History size={15} />
                                                    </button>

                                                    {canRestore && (
                                                        <button
                                                            onClick={() => setRestoreTarget(product)}
                                                            className="flex items-center gap-2 px-4 h-9 bg-emerald-500/10 dark:bg-emerald-500/20 hover:bg-emerald-500 hover:text-white text-emerald-600 dark:text-emerald-400 rounded-xl transition-all active:scale-95 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest"
                                                            title="Restaurar producto"
                                                        >
                                                            <RotateCcw size={13} />
                                                            Restaurar
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Mobile cards */}
                            <div className="md:hidden divide-y divide-slate-100 dark:divide-white/5">
                                {filtered.map((product) => (
                                    <div key={product.id} className="p-5 flex gap-4">
                                        <div className="shrink-0 w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 flex items-center justify-center">
                                            {product.imagenUrl ? (
                                                <Image src={product.imagenUrl} alt="" width={56} height={56} className="object-contain grayscale opacity-60" />
                                            ) : (
                                                <Package size={20} className="text-rose-300" strokeWidth={1} />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-[11px] font-black text-slate-500 uppercase line-through decoration-rose-400/60 mb-1 leading-tight">
                                                {product.nombre}
                                            </h3>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{product.codigo}</p>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] text-slate-400 flex items-center gap-1">
                                                    <CalendarX size={10} />
                                                    {formatDeletedAt(product.deletedAt)}
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => router.push(`/kardex/${product.id}`)}
                                                        className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-white/5 text-slate-400 hover:bg-indigo-500 hover:text-white rounded-xl transition-all active:scale-90"
                                                    >
                                                        <History size={14} />
                                                    </button>
                                                    {canRestore && (
                                                        <button
                                                            onClick={() => setRestoreTarget(product)}
                                                            className="w-8 h-8 flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl transition-all active:scale-90 border border-emerald-500/20"
                                                        >
                                                            <RotateCcw size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Restore confirmation modal */}
            <ConfirmModal
                isOpen={!!restoreTarget}
                onClose={() => setRestoreTarget(null)}
                onConfirm={handleRestore}
                title="Restaurar Producto"
                message={`¿Deseas reactivar "${restoreTarget?.nombre}" en todas las sucursales? El producto volverá a aparecer en el inventario con su stock actual.`}
                confirmText="Sí, Restaurar"
                cancelText="Cancelar"
                variant="info"
                isLoading={isRestoring}
            />
        </div>
    );
}
