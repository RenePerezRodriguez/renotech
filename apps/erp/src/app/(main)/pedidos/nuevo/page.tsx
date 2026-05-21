'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ClipboardList, Save, Search, Plus, Minus, Trash2, Send,
    Package, Loader2, AlertCircle, WifiOff,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { PedidoService } from '@/services/PedidoService';
import { PedidoItem } from '@/types';
import ModuleHeader from '@/components/common/ModuleHeader';
import NumericInput from '@/components/common/NumericInput';
import ConfirmModal from '@/components/common/ConfirmModal';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

interface CartLine {
    productId: string;
    masterId: string;
    productName: string;
    productCode: string;
    quantity: number;
    costo: number;
    notas?: string;
    availableStock?: number;
}

export default function NuevoPedidoPage() {
    const router = useRouter();
    const { currentBranch, branches, loading: branchLoading } = useBranch();
    const { user, userName, loading: authLoading } = useAuth();
    const { isOnline } = useNetworkStatus();

    const [destinationId, setDestinationId] = useState<string>('');
    const [fechaRequerida, setFechaRequerida] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() + 3);
        return d.toISOString().split('T')[0];
    });
    const [notas, setNotas] = useState('');
    const [cart, setCart] = useState<CartLine[]>([]);
    const [search, setSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [validateAfter, setValidateAfter] = useState(false);

    // Productos de la sucursal DESTINO (la que tiene stock que vamos a pedir)
    const { products, loading: productsLoading } = useProducts(destinationId || 'ALL');
    // Productos de MI sucursal (para mostrar mi stock al lado)
    const { products: myProducts } = useProducts(currentBranch?.id || 'ALL');

    // Mapa rapido de mi stock por masterId
    const myStockByMasterId = useMemo(() => {
        const map = new Map<string, number>();
        myProducts.forEach(p => {
            if (p.branchId === currentBranch?.id) {
                map.set(p.masterId, (map.get(p.masterId) || 0) + (p.stock || 0));
            }
        });
        return map;
    }, [myProducts, currentBranch?.id]);

    const otherBranches = useMemo(
        () => branches.filter(b => b.id !== currentBranch?.id),
        [branches, currentBranch?.id]
    );

    // Auto-seleccionar HQ como destino preferido
    useEffect(() => {
        if (destinationId || otherBranches.length === 0) return;
        const hq = otherBranches.find(b => b.isHQ);
        setDestinationId((hq || otherBranches[0]).id || '');
    }, [otherBranches, destinationId]);

    const filteredProducts = useMemo(() => {
        if (!destinationId) return [];
        const q = search.trim().toLowerCase();
        const list = products.filter(p => p.branchId === destinationId);
        if (!q) return list.slice(0, 80);
        return list.filter(p =>
            (p.nombre || '').toLowerCase().includes(q) ||
            (p.codigo || '').toLowerCase().includes(q) ||
            (p.codigoOE || '').toLowerCase().includes(q)
        ).slice(0, 80);
    }, [products, destinationId, search]);

    const addToCart = (productId: string) => {
        const p = products.find(x => x.id === productId);
        if (!p) return;
        setCart(prev => {
            const existing = prev.find(c => c.productId === productId);
            if (existing) {
                return prev.map(c => c.productId === productId ? { ...c, quantity: c.quantity + 1 } : c);
            }
            return [...prev, {
                productId: p.id!,
                masterId: p.masterId,
                productName: p.nombre,
                productCode: p.codigo,
                quantity: 1,
                costo: p.costo || 0,
                availableStock: p.stock || 0,
            }];
        });
    };

    const updateQty = (productId: string, qty: number) => {
        setCart(prev => prev.map(c => c.productId === productId ? { ...c, quantity: Math.max(1, Math.floor(qty)) } : c));
    };

    const removeFromCart = (productId: string) => {
        setCart(prev => prev.filter(c => c.productId !== productId));
    };

    const totalUnits = cart.reduce((s, c) => s + c.quantity, 0);

    const destinationBranch = branches.find(b => b.id === destinationId);

    const validationError = useMemo(() => {
        if (!currentBranch?.id) return 'Selecciona tu sucursal';
        if (!destinationId) return 'Selecciona la sucursal destino';
        if (destinationId === currentBranch.id) return 'Origen y destino no pueden ser iguales';
        if (cart.length === 0) return 'Añade al menos un producto';
        if (!fechaRequerida) return 'Indica fecha requerida';
        return null;
    }, [currentBranch?.id, destinationId, cart.length, fechaRequerida]);

    const handleSubmit = async (alsoValidate: boolean) => {
        if (validationError) {
            toast.error(validationError);
            return;
        }
        if (!user || !currentBranch || !destinationBranch) return;

        setSubmitting(true);
        try {
            const items: PedidoItem[] = cart.map(c => ({
                productId: c.productId,
                masterId: c.masterId,
                productName: c.productName,
                productCode: c.productCode,
                quantity: c.quantity,
                costo: c.costo,
                notas: c.notas,
            }));

            const result = await PedidoService.create({
                fromBranchId: currentBranch.id!,
                fromBranchName: currentBranch.name,
                toBranchId: destinationBranch.id!,
                toBranchName: destinationBranch.name,
                fechaRequerida: new Date(fechaRequerida),
                items,
                notas: notas.trim() || undefined,
                createdBy: user.uid,
                createdByName: userName || user.email || 'Usuario',
                userBranchId: currentBranch.id!,
            });

            if (alsoValidate) {
                try {
                    await PedidoService.validate(result.codigo, user.uid, userName || user.email || 'Usuario', currentBranch.id!);
                    toast.success(`Pedido ${result.codigo} creado y validado`);
                } catch (e) {
                    toast.warning(`Pedido ${result.codigo} creado, pero no se validó: ${e instanceof Error ? e.message : 'error'}`);
                }
            } else {
                toast.success(`Borrador ${result.codigo} guardado`);
            }
            router.push(`/pedidos/${result.codigo}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo crear el pedido');
        } finally {
            setSubmitting(false);
            setConfirmOpen(false);
        }
    };

    if (branchLoading || authLoading) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
                <Loader2 size={24} className="animate-spin mr-2" />
                Cargando...
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6 min-w-0 w-full max-w-full pb-32">
            <ModuleHeader
                title="Nuevo pedido"
                subtitle={`Solicitar productos desde ${currentBranch?.name || 'mi sucursal'}`}
                icon={ClipboardList}
                onBack={() => router.push('/pedidos')}
            />

            {/* Encabezado del pedido */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                        Mi sucursal
                    </label>
                    <div className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-sm font-bold text-slate-900 dark:text-white">
                        {currentBranch?.name || '—'}
                    </div>
                </div>

                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                        De quién se pide
                    </label>
                    <select
                        value={destinationId}
                        onChange={e => { setDestinationId(e.target.value); setCart([]); }}
                        className="w-full px-3 py-2.5 text-sm font-bold rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-[#FFD700]"
                    >
                        <option value="">Seleccionar...</option>
                        {otherBranches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}{b.isHQ ? ' (HQ)' : ''}</option>
                        ))}
                    </select>
                </div>

                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                        Fecha requerida
                    </label>
                    <input
                        type="date"
                        value={fechaRequerida}
                        onChange={e => setFechaRequerida(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm font-bold rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-[#FFD700]"
                    />
                </div>
            </div>

            {/* Notas */}
            <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Notas (opcional)
                </label>
                <textarea
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    rows={2}
                    placeholder="Indicaciones para la sucursal destino..."
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-[#FFD700] resize-none"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Catálogo */}
                <div className="lg:col-span-3 bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white inline-flex items-center gap-2">
                            <Package size={16} />
                            Catálogo {destinationBranch ? `de ${destinationBranch.name}` : ''}
                        </h3>
                    </div>
                    <div className="relative mb-3">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por nombre, código u OEM..."
                            disabled={!destinationId}
                            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-[#FFD700] disabled:opacity-50"
                        />
                    </div>

                    {!destinationId ? (
                        <div className="text-center py-12 text-sm text-slate-500 dark:text-slate-400">
                            Selecciona una sucursal destino para ver su catálogo.
                        </div>
                    ) : productsLoading ? (
                        <div className="flex items-center justify-center py-12 text-slate-500 dark:text-slate-400">
                            <Loader2 size={20} className="animate-spin mr-2" />
                            Cargando catálogo...
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="text-center py-12 text-sm text-slate-500 dark:text-slate-400">
                            Sin productos. Ajusta la búsqueda.
                        </div>
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-gray-800 max-h-120 overflow-y-auto">
                            {filteredProducts.map(p => {
                                const inCart = cart.some(c => c.productId === p.id);
                                return (
                                    <li key={p.id} className="flex items-center gap-3 py-2.5">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{p.nombre}</div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-2 flex-wrap">
                                                <span>{p.codigo}</span>
                                                <span className={clsx('font-bold', (p.stock || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                                                    {destinationBranch?.name || 'Destino'}: {p.stock || 0}
                                                </span>
                                                <span className={clsx('font-bold', (myStockByMasterId.get(p.masterId) || 0) > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500')}>
                                                    {currentBranch?.name || 'Mi sucursal'}: {myStockByMasterId.get(p.masterId) || 0}
                                                </span>
                                                <span className="text-slate-400">{p.unidad || 'PZA'}</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => addToCart(p.id!)}
                                            className={clsx(
                                                'px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-all',
                                                inCart
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                                                    : 'bg-slate-900 text-white dark:bg-[#FFD700] dark:text-black hover:opacity-90'
                                            )}
                                        >
                                            <Plus size={12} />
                                            {inCart ? '+1' : 'Añadir'}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* Carrito */}
                <div className="lg:col-span-2 bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                            Pedido ({cart.length} ítems · {totalUnits} u.)
                        </h3>
                        {cart.length > 0 && (
                            <button
                                onClick={() => setCart([])}
                                className="text-xs text-rose-600 dark:text-rose-400 font-bold hover:underline"
                            >
                                Vaciar
                            </button>
                        )}
                    </div>

                    {cart.length === 0 ? (
                        <div className="text-center py-12 text-sm text-slate-500 dark:text-slate-400 flex-1 flex items-center justify-center">
                            Aún no añadiste productos.
                        </div>
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-gray-800 flex-1 overflow-y-auto max-h-100">
                            {cart.map(c => (
                                <li key={c.productId} className="py-3 flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{c.productName}</div>
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{c.productCode}</div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => updateQty(c.productId, c.quantity - 1)} className="w-7 h-7 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5">
                                            <Minus size={12} />
                                        </button>
                                        <NumericInput
                                            value={c.quantity}
                                            onChange={v => updateQty(c.productId, parseFloat(v) || 1)}
                                            className="w-14 text-center text-sm font-bold rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 py-1"
                                        />
                                        <button onClick={() => updateQty(c.productId, c.quantity + 1)} className="w-7 h-7 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5">
                                            <Plus size={12} />
                                        </button>
                                    </div>
                                    <button onClick={() => removeFromCart(c.productId)} className="w-7 h-7 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center justify-center">
                                        <Trash2 size={14} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {validationError && cart.length > 0 && (
                        <div className="mt-3 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 inline-flex items-center gap-2">
                            <AlertCircle size={14} />
                            {validationError}
                        </div>
                    )}

                    {!isOnline && (
                        <div className="mt-3 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-700 dark:text-amber-300 font-black uppercase tracking-wider inline-flex items-center gap-2">
                            <WifiOff size={13} />
                            Sin conexión — los pedidos requieren internet para guardarse
                        </div>
                    )}

                    <div className="mt-4 flex flex-col gap-2">
                        <button
                            disabled={!!validationError || submitting || !isOnline}
                            onClick={() => { setValidateAfter(false); setConfirmOpen(true); }}
                            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white font-bold text-sm inline-flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 dark:border-white/10"
                        >
                            <Save size={16} />
                            Guardar borrador
                        </button>
                        <button
                            disabled={!!validationError || submitting || !isOnline}
                            onClick={() => { setValidateAfter(true); setConfirmOpen(true); }}
                            className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black font-bold text-sm inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Send size={16} />
                            Guardar y validar
                        </button>
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmOpen}
                onClose={() => !submitting && setConfirmOpen(false)}
                onConfirm={() => handleSubmit(validateAfter)}
                title={validateAfter ? 'Validar pedido' : 'Guardar borrador'}
                message={validateAfter
                    ? `Se creará y enviará a ${destinationBranch?.name} como pedido vigente. Después solo un GERENTE podrá devolverlo a borrador.`
                    : `Se guardará como borrador. Podrás editarlo y validarlo más tarde.`}
                confirmText={submitting ? 'Procesando...' : (validateAfter ? 'Validar ahora' : 'Guardar')}
                variant={validateAfter ? 'warning' : 'info'}
                isLoading={submitting}
            />
        </div>
    );
}
