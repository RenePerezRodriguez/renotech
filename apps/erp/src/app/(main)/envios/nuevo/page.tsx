'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Truck, Save, Loader2, Plus, Minus, Trash2, AlertCircle, Search,
    Package, ArrowLeft, Building2, Zap, FileText, CreditCard, X, UserIcon, Users,
} from 'lucide-react';
import TransportSelectorModal from '@/components/modals/TransportSelectorModal';
import ClientModal from '@/components/modals/ClientModal';
import type { Transport, Client } from '@/types';
import { toast } from 'sonner';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { PedidoService } from '@/services/PedidoService';
import { EnvioService } from '@/services/EnvioService';
import { Pedido, PedidoItem, EnvioItem } from '@/types';
import ModuleHeader from '@/components/common/ModuleHeader';
import NumericInput from '@/components/common/NumericInput';
import ConfirmModal from '@/components/common/ConfirmModal';

interface PrepLine extends EnvioItem {
    _key: string;
}

type Mode = 'PEDIDO' | 'DIRECTO';

function NuevoEnvioInner() {
    const router = useRouter();
    const sp = useSearchParams();
    const pedidoIdParam = sp.get('pedidoId') || '';
    const initialMode: Mode = pedidoIdParam ? 'PEDIDO' : 'DIRECTO';

    const { currentBranch, branches, loading: branchLoading, isHQ } = useBranch();
    const { user, userName, loading: authLoading } = useAuth();

    const [mode, setMode] = useState<Mode>(initialMode);
    const [pedido, setPedido] = useState<Pedido | null>(null);
    const [pedidoItems, setPedidoItems] = useState<PedidoItem[]>([]);
    const [loading, setLoading] = useState(initialMode === 'PEDIDO');
    const [lines, setLines] = useState<PrepLine[]>([]);
    const [notas, setNotas] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showAddPanel, setShowAddPanel] = useState(initialMode === 'DIRECTO');
    const [productSearch, setProductSearch] = useState('');

    // Modo DIRECTO: destino (sucursal o cliente)
    const [destType, setDestType] = useState<'SUCURSAL' | 'CLIENTE'>('SUCURSAL');
    const [toBranchId, setToBranchId] = useState<string>('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [clientModalOpen, setClientModalOpen] = useState(false);

    // Campos de transporte
    const [transportMethod, setTransportMethod] = useState('');
    const [transportId, setTransportId] = useState<string | undefined>();
    const [selectedTransport, setSelectedTransport] = useState<Transport | null>(null);
    const [transportSelectorOpen, setTransportSelectorOpen] = useState(false);
    const [transportPaymentType, setTransportPaymentType] = useState<'PAGADO' | 'POR_PAGAR'>('PAGADO');
    const [transportPaymentMethod, setTransportPaymentMethod] = useState<'EFECTIVO' | 'QR' | 'TRANSFERENCIA' | ''>('');
    const [transportBankRef, setTransportBankRef] = useState('');
    const [transportCost, setTransportCost] = useState('');

    const { products } = useProducts(currentBranch?.id || 'ALL');

    // Carga del pedido (solo modo PEDIDO)
    useEffect(() => {
        if (mode !== 'PEDIDO') return;
        if (!pedidoIdParam) {
            toast.error('Falta pedidoId');
            router.push('/envios');
            return;
        }
        if (branchLoading || authLoading || !user) return;
        (async () => {
            setLoading(true);
            try {
                const result = await PedidoService.getWithItems(pedidoIdParam);
                if (!result) {
                    toast.error('Pedido no encontrado');
                    router.push('/envios');
                    return;
                }
                if (result.pedido.status !== 'vigente') {
                    toast.error(`El pedido debe estar vigente (actual: ${result.pedido.status})`);
                    router.push(`/pedidos/${pedidoIdParam}`);
                    return;
                }
                if (result.pedido.envioId) {
                    toast.warning('Este pedido ya tiene un envío');
                    router.push(`/envios/${result.pedido.envioId}`);
                    return;
                }
                if (currentBranch && result.pedido.toBranchId !== currentBranch.id) {
                    toast.error('Solo la sucursal receptora del pedido puede preparar el envío');
                    router.push(`/pedidos/${pedidoIdParam}`);
                    return;
                }
                setPedido(result.pedido);
                setPedidoItems(result.items);
                setLines(EnvioService.pedidoItemsToEnvioItems(result.items).map((ei, idx) => ({
                    ...ei,
                    _key: `pre-${idx}`,
                })));
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'No se pudo cargar el pedido');
            } finally {
                setLoading(false);
            }
        })();
    }, [mode, pedidoIdParam, branchLoading, authLoading, user, currentBranch, router]);

    // Defensa: solo Casa Matriz puede enviar a clientes externos.
    // Si el usuario cambia a una sucursal no-HQ, forzar destino SUCURSAL.
    useEffect(() => {
        if (!isHQ && destType === 'CLIENTE') {
            setDestType('SUCURSAL');
            setSelectedClient(null);
        }
    }, [isHQ, destType]);

    // Sucursales disponibles como destino (cualquiera distinta a la mía)
    const destinationBranches = useMemo(() => {
        if (!currentBranch?.id) return [];
        return branches.filter(b => b.id !== currentBranch.id && b.status !== 'INACTIVE');
    }, [branches, currentBranch?.id]);

    const updateQty = (key: string, qty: number) => {
        setLines(prev => prev.map(l => l._key === key ? { ...l, qtyEnviada: Math.max(0, Math.floor(qty)) } : l));
    };
    const removeLine = (key: string) => setLines(prev => prev.filter(l => l._key !== key));

    const addExtra = (productId: string) => {
        const p = products.find(x => x.id === productId);
        if (!p) return;
        setLines(prev => {
            const existing = prev.find(l => l.productId === productId);
            if (existing) {
                return prev.map(l => l.productId === productId ? { ...l, qtyEnviada: l.qtyEnviada + 1 } : l);
            }
            return [...prev, {
                _key: `extra-${productId}-${Date.now()}`,
                productId: p.id!,
                masterId: p.masterId,
                productName: p.nombre,
                productCode: p.codigo,
                qtyPedida: 0,
                qtyEnviada: 1,
                costo: p.costo || 0,
                esExtra: mode === 'PEDIDO',
            }];
        });
    };

    const filteredProductsForAdd = useMemo(() => {
        if (!currentBranch?.id) return [];
        const q = productSearch.trim().toLowerCase();
        const list = products.filter(p => p.branchId === currentBranch.id);
        if (!q) return list.slice(0, 30);
        return list.filter(p =>
            (p.nombre || '').toLowerCase().includes(q) ||
            (p.codigo || '').toLowerCase().includes(q)
        ).slice(0, 30);
    }, [products, currentBranch?.id, productSearch]);

    const totalEnviadas = lines.reduce((s, l) => s + (l.qtyEnviada || 0), 0);
    const validLines = lines.filter(l => (l.qtyEnviada || 0) > 0);

    const validationError = useMemo(() => {
        if (mode === 'PEDIDO' && !pedido) return 'Cargando pedido...';
        if (mode === 'DIRECTO' && destType === 'SUCURSAL' && !toBranchId) return 'Selecciona la sucursal destino';
        if (mode === 'DIRECTO' && destType === 'CLIENTE' && !selectedClient) return 'Selecciona un cliente de destino';
        if (validLines.length === 0) return 'Indica al menos un ítem con cantidad > 0';
        return null;
    }, [mode, pedido, toBranchId, destType, selectedClient, validLines.length]);

    const handleSubmit = async () => {
        if (validationError) { toast.error(validationError); return; }
        if (!user || !currentBranch) return;
        setSubmitting(true);
        try {
            const items: EnvioItem[] = validLines.map(({ _key: _k, id: _id, ...rest }) => rest);
            let result: { id: string; codigo: string; numero: number };

            const transportFields = {
                transportId: transportId || undefined,
                transportMethod: transportMethod.trim() || undefined,
                transportPaymentType: transportCost && parseFloat(transportCost) > 0 ? transportPaymentType : undefined,
                transportCost: transportCost ? parseFloat(transportCost) : undefined,
                transportPaymentMethod: transportPaymentType === 'PAGADO' ? ((transportPaymentMethod || undefined) as 'EFECTIVO' | 'QR' | 'TRANSFERENCIA' | undefined) : undefined,
                transportBankRef: transportPaymentType === 'PAGADO' && transportPaymentMethod && transportPaymentMethod !== 'EFECTIVO' ? (transportBankRef.trim() || undefined) : undefined,
                transportName: selectedTransport?.razonSocial || transportMethod.trim() || undefined,
            };

            if (mode === 'PEDIDO') {
                if (!pedido) return;
                result = await EnvioService.createFromPedido({
                    pedidoId: pedido.codigo,
                    items,
                    notas: notas.trim() || undefined,
                    createdBy: user.uid,
                    createdByName: userName || user.email || 'Usuario',
                    userBranchId: currentBranch.id!,
                    ...transportFields,
                });
                toast.success(`Envío ${result.codigo} creado en preparación`);
            } else {
                const dest = destinationBranches.find(b => b.id === toBranchId);
                if (destType === 'SUCURSAL' && !dest) { toast.error('Sucursal destino inválida'); return; }
                result = await EnvioService.createDirect({
                    items,
                    toBranchId: destType === 'SUCURSAL' ? dest?.id : undefined,
                    toBranchName: destType === 'SUCURSAL' ? dest?.name : undefined,
                    clientId: destType === 'CLIENTE' ? selectedClient?.id : undefined,
                    clientName: destType === 'CLIENTE' ? selectedClient?.razonSocial : undefined,
                    notas: notas.trim() || undefined,
                    createdBy: user.uid,
                    createdByName: userName || user.email || 'Usuario',
                    userBranchId: currentBranch.id!,
                    userBranchName: currentBranch.name,
                    ...transportFields,
                });
                toast.success(`Envío directo ${result.codigo} creado en preparación`);
            }
            router.push(`/envios/${result.codigo}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo crear el envío');
        } finally {
            setSubmitting(false);
            setConfirmOpen(false);
        }
    };

    if (mode === 'PEDIDO' && (loading || !pedido)) {
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
                title="Nuevo envío"
                subtitle={
                    mode === 'PEDIDO' && pedido
                        ? `Desde pedido ${pedido.codigo} · ${pedido.toBranchName} → ${pedido.fromBranchName}`
                        : 'Envío directo (sin pedido origen)'
                }
                icon={Truck}
                onBack={() => router.push('/envios')}
            />

            {/* Toggle de modo solo si NO viene un pedidoId en la URL */}
            {!pedidoIdParam && (
                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-2 inline-flex gap-1 self-start">
                    <button
                        type="button"
                        onClick={() => setMode('DIRECTO')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-colors ${mode === 'DIRECTO'
                            ? 'bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                            }`}
                    >
                        <Zap size={12} /> Envío directo
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push('/pedidos')}
                        className="px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                        <FileText size={12} /> Desde pedido
                    </button>
                </div>
            )}

            {/* Resumen del pedido (modo PEDIDO) */}
            {mode === 'PEDIDO' && pedido && (
                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
                        <div><span className="font-bold text-slate-500 dark:text-slate-400">Pedido:</span> {pedido.codigo}</div>
                        <div><span className="font-bold text-slate-500 dark:text-slate-400">Solicitado por:</span> {pedido.fromBranchName}</div>
                        <div><span className="font-bold text-slate-500 dark:text-slate-400">Despacha:</span> {pedido.toBranchName}</div>
                        <div><span className="font-bold text-slate-500 dark:text-slate-400">Ítems pedidos:</span> {pedidoItems.length} ({pedido.totalUnits || 0} u.)</div>
                    </div>
                    {pedido.notas && (
                        <div className="mt-3 text-xs text-slate-700 dark:text-slate-300 italic border-l-2 border-slate-300 dark:border-white/10 pl-3">
                            “{pedido.notas}”
                        </div>
                    )}
                </div>
            )}

            {/* Selector de destino (modo DIRECTO) */}
            {mode === 'DIRECTO' && (
                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 inline-flex items-center gap-1">
                        <Building2 size={12} /> Destino del envío
                    </label>
                    {/* Toggle Sucursal / Cliente — solo Casa Matriz puede enviar a clientes */}
                    {isHQ && (
                        <div className="flex rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-1 mb-3 w-fit">
                            <button
                                type="button"
                                onClick={() => { setDestType('SUCURSAL'); setSelectedClient(null); }}
                                className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition flex items-center gap-1.5 ${destType === 'SUCURSAL' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
                            ><Building2 size={11} /> Sucursal</button>
                            <button
                                type="button"
                                onClick={() => { setDestType('CLIENTE'); setToBranchId(''); }}
                                className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition flex items-center gap-1.5 ${destType === 'CLIENTE' ? 'bg-violet-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
                            ><Users size={11} /> Cliente</button>
                        </div>
                    )}

                    {destType === 'SUCURSAL' ? (
                        <>
                            <select
                                value={toBranchId}
                                onChange={e => setToBranchId(e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-slate-400"
                            >
                                <option value="">— Selecciona sucursal —</option>
                                {destinationBranches.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                                Despachas desde <span className="font-bold">{currentBranch?.name}</span>. El envío sigue el flujo normal: preparación → tránsito → recepción.
                            </p>
                        </>
                    ) : (
                        <div>
                            {selectedClient ? (
                                <div className="flex items-center justify-between bg-violet-50 dark:bg-violet-500/5 border border-violet-200 dark:border-violet-500/20 rounded-xl px-4 py-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <UserIcon size={14} className="text-violet-600" />
                                            <span className="font-bold text-sm text-slate-900 dark:text-white">{selectedClient.razonSocial}</span>
                                        </div>
                                        {selectedClient.nit && <p className="text-[10px] text-slate-500 mt-0.5">NIT: {selectedClient.nit}</p>}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedClient(null); }}
                                        className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                                    ><X size={14} /></button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setClientModalOpen(true)}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-white/10 bg-white dark:bg-white/5 text-slate-500 hover:text-violet-600 hover:border-violet-400 transition-colors"
                                >
                                    <UserIcon size={18} />
                                    <span className="text-sm font-bold">Seleccionar cliente de destino...</span>
                                </button>
                            )}
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                                Envío directo a cliente externo. El stock se descuenta al despachar.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Modales */}
            <ClientModal isOpen={clientModalOpen} onClose={() => setClientModalOpen(false)} onSelect={(c) => { setSelectedClient(c); setClientModalOpen(false); }} />

            {/* Lista de preparación */}
            <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white inline-flex items-center gap-2">
                        <Package size={16} /> Preparación ({lines.length} ítems · {totalEnviadas} u.)
                    </h3>
                    <button
                        onClick={() => setShowAddPanel(s => !s)}
                        className="text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 hover:underline"
                    >
                        <Plus size={12} /> {showAddPanel ? 'Ocultar' : (mode === 'DIRECTO' ? 'Agregar ítem' : 'Añadir extra')}
                    </button>
                </div>

                {showAddPanel && (
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                        <div className="relative mb-2">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={productSearch}
                                onChange={e => setProductSearch(e.target.value)}
                                placeholder="Buscar producto en mi sucursal..."
                                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background"
                            />
                        </div>
                        <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-gray-800">
                            {filteredProductsForAdd.map(p => (
                                <li key={p.id} className="flex items-center gap-2 py-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{p.nombre}</div>
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{p.codigo} · stock: {p.stock || 0}</div>
                                    </div>
                                    <button
                                        onClick={() => addExtra(p.id!)}
                                        className="px-2 py-1 rounded-xl bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black text-xs font-bold inline-flex items-center gap-1"
                                    >
                                        <Plus size={10} /> Añadir
                                    </button>
                                </li>
                            ))}
                            {filteredProductsForAdd.length === 0 && (
                                <li className="text-center py-4 text-xs text-slate-500 dark:text-slate-400">Sin resultados</li>
                            )}
                        </ul>
                    </div>
                )}

                <ul className="divide-y divide-slate-100 dark:divide-gray-800">
                    {lines.length === 0 ? (
                        <li className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">No hay ítems</li>
                    ) : lines.map(line => {
                        const stockInfo = products.find(p => p.id === line.productId)?.stock ?? 0;
                        const insufficient = (line.qtyEnviada || 0) > stockInfo;
                        return (
                            <li key={line._key} className="px-4 py-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{line.productName}</div>
                                        {line.esExtra && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Extra</span>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                        {line.productCode} {mode === 'PEDIDO' && `· pedido: ${line.qtyPedida}`} · stock: {stockInfo}
                                    </div>
                                    {insufficient && (
                                        <div className="text-[11px] text-rose-600 dark:text-rose-400 font-bold mt-0.5 inline-flex items-center gap-1">
                                            <AlertCircle size={10} /> Stock insuficiente
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => updateQty(line._key, line.qtyEnviada - 1)} className="w-7 h-7 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5">
                                        <Minus size={12} />
                                    </button>
                                    <NumericInput
                                        value={line.qtyEnviada}
                                        onChange={v => updateQty(line._key, parseFloat(v) || 0)}
                                        className="w-14 text-center text-sm font-bold rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 py-1"
                                    />
                                    <button onClick={() => updateQty(line._key, line.qtyEnviada + 1)} className="w-7 h-7 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5">
                                        <Plus size={12} />
                                    </button>
                                </div>
                                <button onClick={() => removeLine(line._key)} className="w-7 h-7 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center justify-center">
                                    <Trash2 size={14} />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {/* Transporte */}
            <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 inline-flex items-center gap-1">
                    <CreditCard size={12} /> Transporte (opcional)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Transportista</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setTransportSelectorOpen(true)}
                                className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-left truncate text-slate-700 dark:text-slate-300 hover:border-slate-400 transition-colors"
                            >
                                {selectedTransport ? selectedTransport.razonSocial : <span className="text-slate-400">Seleccionar transporte...</span>}
                            </button>
                            {selectedTransport && (
                                <button type="button" onClick={() => { setSelectedTransport(null); setTransportId(undefined); setTransportMethod(''); }} className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-colors">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Costo flete (Bs.)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={transportCost}
                            onChange={e => setTransportCost(e.target.value)}
                            placeholder="0.00"
                            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-slate-400"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Tipo de pago</label>
                        <div className="flex rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-1">
                            <button
                                type="button"
                                onClick={() => setTransportPaymentType('PAGADO')}
                                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition ${transportPaymentType === 'PAGADO' ? 'bg-green-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
                            >Pagado</button>
                            <button
                                type="button"
                                onClick={() => setTransportPaymentType('POR_PAGAR')}
                                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition ${transportPaymentType === 'POR_PAGAR' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'}`}
                            >Por Pagar</button>
                        </div>
                    </div>
                </div>
                {transportPaymentType === 'PAGADO' && parseFloat(transportCost || '0') > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Método de pago</label>
                            <select
                                value={transportPaymentMethod}
                                onChange={e => {
                                    const v = e.target.value as 'EFECTIVO' | 'QR' | 'TRANSFERENCIA' | '';
                                    setTransportPaymentMethod(v);
                                    if (v === 'EFECTIVO' || v === '') setTransportBankRef('');
                                }}
                                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-slate-400"
                            >
                                <option value="">— Seleccionar —</option>
                                <option value="EFECTIVO">Efectivo</option>
                                <option value="QR">QR</option>
                                <option value="TRANSFERENCIA">Transferencia</option>
                            </select>
                        </div>
                        {transportPaymentMethod && transportPaymentMethod !== 'EFECTIVO' && (
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Referencia / N° comprobante</label>
                                <input
                                    type="text"
                                    value={transportBankRef}
                                    onChange={e => setTransportBankRef(e.target.value)}
                                    placeholder="Últimos dígitos o número de operación"
                                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                />
                            </div>
                        )}
                    </div>
                )}
                {transportPaymentType === 'PAGADO' && transportPaymentMethod === 'EFECTIVO' && parseFloat(transportCost || '0') > 0 && (
                    <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                        ? Requiere caja abierta — el flete se registrará como egreso de tu sesión.
                    </p>
                )}
                {transportPaymentType === 'POR_PAGAR' && parseFloat(transportCost || '0') > 0 && (
                    <p className="mt-2 text-[11px] text-blue-700 dark:text-blue-400">
                        ?? El flete quedará registrado como "Por Pagar" (informativo). No se registrará ningún gasto ahora.
                    </p>
                )}
            </div>

            {/* Notas y acciones */}
            <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Notas del envío (opcional)
                </label>
                <textarea
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    rows={2}
                    placeholder="Indicaciones de despacho, observaciones..."
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 resize-none focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
            </div>

            {validationError && (
                <div className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 inline-flex items-center gap-2">
                    <AlertCircle size={14} />
                    {validationError}
                </div>
            )}

            <div className="flex flex-wrap gap-2 justify-end">
                <button
                    onClick={() => router.back()}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm font-bold inline-flex items-center gap-2"
                >
                    <ArrowLeft size={14} /> Cancelar
                </button>
                <button
                    disabled={!!validationError || submitting}
                    onClick={() => setConfirmOpen(true)}
                    className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"
                >
                    <Save size={14} /> Crear envío en preparación
                </button>
            </div>

            <ConfirmModal
                isOpen={confirmOpen}
                onClose={() => !submitting && setConfirmOpen(false)}
                onConfirm={handleSubmit}
                title={mode === 'PEDIDO' ? 'Crear envío' : 'Crear envío directo'}
                message={
                    mode === 'PEDIDO' && pedido
                        ? `Se generará el envío correspondiente a ${pedido.codigo} en estado preparación. Aún podrás editar antes de despachar.`
                        : `Se generará un envío directo desde ${currentBranch?.name} hacia ${destinationBranches.find(b => b.id === toBranchId)?.name || ''} en estado preparación.`
                }
                confirmText={submitting ? 'Creando...' : 'Crear envío'}
                variant="info"
                isLoading={submitting}
            />
            <TransportSelectorModal
                isOpen={transportSelectorOpen}
                onClose={() => setTransportSelectorOpen(false)}
                onSelect={(t) => {
                    setSelectedTransport(t);
                    setTransportId(t.id);
                    setTransportMethod(t.razonSocial);
                    setTransportSelectorOpen(false);
                }}
            />
        </div>
    );
}

export default function NuevoEnvioPage() {
    return (
        <Suspense fallback={<div className="p-6 text-slate-500">Cargando...</div>}>
            <NuevoEnvioInner />
        </Suspense>
    );
}
