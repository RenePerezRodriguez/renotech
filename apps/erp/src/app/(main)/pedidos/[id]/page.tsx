'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
    ClipboardList, Loader2, Send, Edit3, XCircle, AlertTriangle, FileText,
    PackageCheck, Undo2, CheckCircle2, Truck, Plus, Minus, Trash2, Save, Search,
    User, Building2, Calendar, MessageSquare, ShieldAlert, ShieldCheck, Printer, FileDown,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Timestamp } from 'firebase/firestore';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { PedidoService } from '@/services/PedidoService';
import { PrintService } from '@/services/PrintService';
import { Pedido, PedidoItem, PedidoStatus } from '@/types';
import ModuleHeader from '@/components/common/ModuleHeader';
import NumericInput from '@/components/common/NumericInput';
import ConfirmModal from '@/components/common/ConfirmModal';
import IndustrialModal from '@/components/common/IndustrialModal';
import PedidoExportModal from '@/components/pedidos/PedidoExportModal';
import { formatDate, formatDateTime } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';

type ActionType =
    | 'validate'
    | 'devalidate'
    | 'requestCancel'
    | 'approveCancel'
    | 'rejectCancel'
    | null;

const STATUS_LABEL: Record<PedidoStatus, string> = {
    borrador: 'Borrador',
    vigente: 'Vigente',
    despachado: 'Despachado',
    cancelado: 'Cancelado',
};

interface EditableLine extends PedidoItem {
    _key: string;
}

export default function PedidoDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const pedidoId = params?.id;

    const { currentBranch, isHQ, loading: branchLoading } = useBranch();
    const { user, userName, role, loading: authLoading } = useAuth();

    const [pedido, setPedido] = useState<Pedido | null>(null);
    const [items, setItems] = useState<PedidoItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionType, setActionType] = useState<ActionType>(null);
    const [submitting, setSubmitting] = useState(false);
    const [reason, setReason] = useState('');
    const [exportOpen, setExportOpen] = useState(false);

    // Edición de borrador
    const [isEditing, setIsEditing] = useState(false);
    const [editLines, setEditLines] = useState<EditableLine[]>([]);
    const [editFecha, setEditFecha] = useState('');
    const [editNotas, setEditNotas] = useState('');
    const [editClientLastEditedAt, setEditClientLastEditedAt] = useState<number | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const [showAddPanel, setShowAddPanel] = useState(false);

    // Productos del destino para añadir nuevas líneas en edición
    const { products } = useProducts(pedido?.toBranchId || 'ALL');

    const isGerente = !!role && /GERENTE|ADMIN/i.test(role);
    const isHQManager = isGerente && isHQ;

    const userBranchId = currentBranch?.id || '';
    const isEmisora = pedido && userBranchId === pedido.fromBranchId;
    const isReceptora = pedido && userBranchId === pedido.toBranchId;
    const cancelPending = !!pedido?.cancellationRequestedAt && pedido.status !== 'cancelado';

    const reload = useCallback(async () => {
        if (!pedidoId) return;
        setLoading(true);
        try {
            const result = await PedidoService.getWithItems(pedidoId);
            if (!result) {
                toast.error('Pedido no encontrado');
                router.push('/pedidos');
                return;
            }
            setPedido(result.pedido);
            setItems(result.items);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo cargar el pedido');
        } finally {
            setLoading(false);
        }
    }, [pedidoId, router]);

    useEffect(() => {
        if (branchLoading || authLoading || !user) return;
        reload();
    }, [reload, branchLoading, authLoading, user]);

    const startEdit = () => {
        if (!pedido) return;
        setEditLines(items.map((it, idx) => ({ ...it, _key: it.id || `tmp-${idx}` })));
        const fr = (pedido.fechaRequerida as Timestamp)?.toDate?.();
        setEditFecha(fr ? fr.toISOString().split('T')[0] : '');
        setEditNotas(pedido.notas || '');
        setEditClientLastEditedAt((pedido.lastEditedAt as Timestamp | undefined)?.toMillis?.() ?? null);
        setIsEditing(true);
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setEditLines([]);
        setShowAddPanel(false);
        setProductSearch('');
    };

    const updateEditQty = (key: string, qty: number) => {
        setEditLines(prev => prev.map(l => l._key === key ? { ...l, quantity: Math.max(1, Math.floor(qty)) } : l));
    };

    const removeEditLine = (key: string) => {
        setEditLines(prev => prev.filter(l => l._key !== key));
    };

    const addProductToEdit = (productId: string) => {
        const p = products.find(x => x.id === productId);
        if (!p) return;
        setEditLines(prev => {
            const existing = prev.find(l => l.productId === productId);
            if (existing) {
                return prev.map(l => l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l);
            }
            return [...prev, {
                _key: `new-${productId}-${Date.now()}`,
                productId: p.id!,
                masterId: p.masterId,
                productName: p.nombre,
                productCode: p.codigo,
                quantity: 1,
                costo: p.costo || 0,
            }];
        });
    };

    const filteredProductsForAdd = useMemo(() => {
        if (!pedido) return [];
        const q = productSearch.trim().toLowerCase();
        const list = products.filter(p => p.branchId === pedido.toBranchId);
        if (!q) return list.slice(0, 30);
        return list.filter(p =>
            (p.nombre || '').toLowerCase().includes(q) ||
            (p.codigo || '').toLowerCase().includes(q)
        ).slice(0, 30);
    }, [products, pedido, productSearch]);

    const saveEdit = async () => {
        if (!pedido || !user || !currentBranch) return;
        if (editLines.length === 0) {
            toast.error('Debe haber al menos un ítem');
            return;
        }
        setSavingEdit(true);
        try {
            const cleanItems: PedidoItem[] = editLines.map(({ _key: _k, id: _id, ...rest }) => rest);
            await PedidoService.updateBorrador({
                pedidoId: pedido.codigo,
                items: cleanItems,
                fechaRequerida: editFecha ? new Date(editFecha) : undefined,
                notas: editNotas,
                editedBy: user.uid,
                editedByName: userName || user.email || 'Usuario',
                userBranchId: currentBranch.id!,
                clientLastEditedAt: editClientLastEditedAt,
            });
            toast.success('Borrador actualizado');
            setIsEditing(false);
            await reload();
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'No se pudo guardar';
            if (msg.includes('LOCK_CONFLICT')) {
                toast.error(`Otro usuario editó este pedido. Recarga para ver cambios.`);
            } else {
                toast.error(msg);
            }
        } finally {
            setSavingEdit(false);
        }
    };

    const runAction = async () => {
        if (!pedido || !user || !currentBranch) return;
        const uName = userName || user.email || 'Usuario';
        setSubmitting(true);
        try {
            switch (actionType) {
                case 'validate':
                    await PedidoService.validate(pedido.codigo, user.uid, uName, currentBranch.id!);
                    toast.success('Pedido validado');
                    break;
                case 'devalidate':
                    await PedidoService.devalidate(pedido.codigo, user.uid, uName, currentBranch.id!, isGerente);
                    toast.success('Pedido devuelto a borrador');
                    break;
                case 'requestCancel':
                    if (!reason.trim()) { toast.error('Indica una razón'); setSubmitting(false); return; }
                    await PedidoService.requestCancellation(pedido.codigo, user.uid, uName, currentBranch.id!, reason.trim());
                    toast.success('Solicitud de cancelación enviada');
                    break;
                case 'approveCancel':
                    await PedidoService.approveCancellation(pedido.codigo, user.uid, uName, isHQManager);
                    toast.success('Cancelación aprobada');
                    break;
                case 'rejectCancel':
                    await PedidoService.rejectCancellation(pedido.codigo, user.uid, uName, isHQManager, reason.trim() || undefined);
                    toast.success('Cancelación rechazada');
                    break;
            }
            setActionType(null);
            setReason('');
            await reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Operación falló');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading || !pedido) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
                <Loader2 size={24} className="animate-spin mr-2" />
                Cargando pedido...
            </div>
        );
    }

    const fechaCreacion = (pedido.createdAt as Timestamp)?.toDate?.();
    const fechaRequerida = (pedido.fechaRequerida as Timestamp)?.toDate?.();
    const totalUnits = (isEditing ? editLines : items).reduce((s, i) => s + (i.quantity || 0), 0);

    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6 min-w-0 w-full max-w-full pb-32">
            <ModuleHeader
                title={pedido.codigo}
                subtitle={`${pedido.fromBranchName} → ${pedido.toBranchName}`}
                icon={ClipboardList}
                onBack={() => router.push('/pedidos')}
                badge={STATUS_LABEL[pedido.status]}
                actions={[
                    {
                        label: 'Exportar',
                        icon: FileDown,
                        variant: 'outline',
                        onClick: () => setExportOpen(true),
                    },
                ]}
            />

            <PedidoExportModal
                isOpen={exportOpen}
                onClose={() => setExportOpen(false)}
                pedido={pedido}
                items={items}
                isGerente={isGerente}
            />

            {/* Banner cancelación pendiente */}
            {cancelPending && (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4 flex flex-wrap items-start gap-3">
                    <AlertTriangle size={20} className="text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-amber-900 dark:text-amber-200">Cancelación solicitada</div>
                        <div className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                            Por {formatUserName(pedido.cancellationRequestedByName)} · {formatDateTime((pedido.cancellationRequestedAt as Timestamp).toDate())}
                        </div>
                        {pedido.cancellationReason && (
                            <div className="text-xs text-amber-900 dark:text-amber-200 mt-2 italic">&ldquo;{pedido.cancellationReason}&rdquo;</div>
                        )}
                        {!isHQManager && (
                            <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
                                Pendiente de aprobación de un GERENTE HQ.
                            </div>
                        )}
                    </div>
                    {isHQManager && (
                        <div className="flex gap-2 w-full sm:w-auto">
                            <button
                                onClick={() => setActionType('rejectCancel')}
                                className="px-3 py-1.5 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-bold inline-flex items-center gap-1"
                            >
                                <Undo2 size={12} /> Rechazar
                            </button>
                            <button
                                onClick={() => setActionType('approveCancel')}
                                className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold inline-flex items-center gap-1"
                            >
                                <CheckCircle2 size={12} /> Aprobar cancelación
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Metadatos */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetaCard icon={Building2} label="Origen" value={pedido.fromBranchName} />
                <MetaCard icon={Building2} label="Destino" value={pedido.toBranchName} />
                <MetaCard icon={Calendar} label="Fecha requerida" value={fechaRequerida ? formatDate(fechaRequerida) : '—'} />
                <MetaCard icon={User} label="Creado por" value={`${formatUserName(pedido.createdByName)}\n${fechaCreacion ? formatDate(fechaCreacion) : ''}`.trim()} />
            </div>

            {pedido.notas && !isEditing && (
                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        <MessageSquare size={12} /> Notas
                    </div>
                    <div className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{pedido.notas}</div>
                </div>
            )}

            {/* Ítems / editor */}
            <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                        Ítems ({(isEditing ? editLines : items).length} · {totalUnits} u.)
                    </h3>
                    {isEditing && (
                        <button
                            onClick={() => setShowAddPanel(s => !s)}
                            className="text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 hover:underline"
                        >
                            <Plus size={12} /> {showAddPanel ? 'Ocultar' : 'Añadir producto'}
                        </button>
                    )}
                </div>

                {isEditing && showAddPanel && (
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                        <div className="relative mb-2">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={productSearch}
                                onChange={e => setProductSearch(e.target.value)}
                                placeholder="Buscar producto en destino..."
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
                                        onClick={() => addProductToEdit(p.id!)}
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
                    {isEditing ? (
                        editLines.length === 0 ? (
                            <li className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">No quedan ítems</li>
                        ) : editLines.map(line => (
                            <li key={line._key} className="px-4 py-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{line.productName}</div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{line.productCode}</div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => updateEditQty(line._key, line.quantity - 1)} className="w-7 h-7 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5">
                                        <Minus size={12} />
                                    </button>
                                    <NumericInput
                                        value={line.quantity}
                                        onChange={v => updateEditQty(line._key, parseFloat(v) || 1)}
                                        className="w-14 text-center text-sm font-bold rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 py-1"
                                    />
                                    <button onClick={() => updateEditQty(line._key, line.quantity + 1)} className="w-7 h-7 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5">
                                        <Plus size={12} />
                                    </button>
                                </div>
                                <button onClick={() => removeEditLine(line._key)} className="w-7 h-7 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center justify-center">
                                    <Trash2 size={14} />
                                </button>
                            </li>
                        ))
                    ) : (
                        items.length === 0 ? (
                            <li className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">Sin ítems</li>
                        ) : items.map(it => (
                            <li key={it.id} className="px-4 py-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{it.productName}</div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{it.productCode}</div>
                                </div>
                                <div className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
                                    {it.quantity}
                                </div>
                            </li>
                        ))
                    )}
                </ul>

                {isEditing && (
                    <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Fecha requerida</label>
                            <input
                                type="date"
                                value={editFecha}
                                onChange={e => setEditFecha(e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Notas</label>
                            <input
                                value={editNotas}
                                onChange={e => setEditNotas(e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Acciones según estado/rol */}
            {!isEditing && (
                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4 flex flex-wrap gap-2 justify-end">
                    {/* BORRADOR + emisora: editar / validar / cancelar */}
                    {pedido.status === 'borrador' && isEmisora && !cancelPending && (
                        <>
                            <button
                                onClick={() => setActionType('requestCancel')}
                                className="px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm font-bold inline-flex items-center gap-2 text-rose-600 dark:text-rose-400"
                            >
                                <XCircle size={14} /> Solicitar cancelación
                            </button>
                            <button
                                onClick={startEdit}
                                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm font-bold inline-flex items-center gap-2"
                            >
                                <Edit3 size={14} /> Editar
                            </button>
                            <button
                                onClick={() => setActionType('validate')}
                                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black text-sm font-bold inline-flex items-center gap-2"
                            >
                                <Send size={14} /> Validar
                            </button>
                        </>
                    )}

                    {/* VIGENTE + emisora: desvalidar (gerente) / cancelar */}
                    {pedido.status === 'vigente' && isEmisora && !cancelPending && (
                        <>
                            <button
                                onClick={() => setActionType('requestCancel')}
                                className="px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm font-bold inline-flex items-center gap-2 text-rose-600 dark:text-rose-400"
                            >
                                <XCircle size={14} /> Solicitar cancelación
                            </button>
                            {isGerente && (
                                <button
                                    onClick={() => setActionType('devalidate')}
                                    className="px-3 py-2 rounded-xl bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300 text-sm font-bold inline-flex items-center gap-2"
                                >
                                    <Undo2 size={14} /> Desvalidar
                                </button>
                            )}
                        </>
                    )}

                    {/* VIGENTE + receptora: solicitar cancelación + crear envío */}
                    {pedido.status === 'vigente' && isReceptora && !cancelPending && (
                        <>
                            <button
                                onClick={() => setActionType('requestCancel')}
                                className="px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm font-bold inline-flex items-center gap-2 text-rose-600 dark:text-rose-400"
                            >
                                <XCircle size={14} /> Solicitar cancelación
                            </button>
                            <button
                                onClick={() => router.push(`/envios/nuevo?pedidoId=${pedido.codigo}`)}
                                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black inline-flex items-center gap-2"
                                title="Podrás ajustar cantidades y elegir qué ítems despachar antes de confirmar el envío"
                            >
                                <Truck size={14} />
                                <span className="flex flex-col items-start leading-tight">
                                    <span className="text-sm font-bold">Preparar y enviar</span>
                                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">Ajustable</span>
                                </span>
                            </button>
                        </>
                    )}

                    {/* DESPACHADO: enlace al envío */}
                    {pedido.status === 'despachado' && pedido.envioId && (
                        <button
                            onClick={() => router.push(`/envios/${pedido.envioId}`)}
                            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-2"
                        >
                            <PackageCheck size={14} /> Ver envío {pedido.envioId}
                        </button>
                    )}
                </div>
            )}

            {/* Acciones de edición */}
            {isEditing && (
                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4 flex flex-wrap gap-2 justify-end">
                    <button
                        disabled={savingEdit}
                        onClick={cancelEdit}
                        className="px-3 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm font-bold disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        disabled={savingEdit || editLines.length === 0}
                        onClick={saveEdit}
                        className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"
                    >
                        {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Guardar cambios
                    </button>
                </div>
            )}

            {/* Histórico minimal */}
            <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 inline-flex items-center gap-2">
                    <FileText size={12} /> Historial
                </div>
                <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    {fechaCreacion && (
                        <li>
                            <span className="font-bold">Creado</span> · {formatDateTime(fechaCreacion)} · por {formatUserName(pedido.createdByName)}
                        </li>
                    )}
                    {pedido.validatedAt && (
                        <li className="inline-flex items-center gap-1">
                            <ShieldCheck size={12} className="text-emerald-600 dark:text-emerald-400" />
                            <span><span className="font-bold">Validado</span> · {formatDateTime((pedido.validatedAt as Timestamp).toDate())} · por {formatUserName(pedido.validatedByName)}</span>
                        </li>
                    )}
                    {pedido.devalidatedAt && (
                        <li className="inline-flex items-center gap-1">
                            <Undo2 size={12} className="text-amber-600 dark:text-amber-400" />
                            <span><span className="font-bold">Desvalidado</span> · {formatDateTime((pedido.devalidatedAt as Timestamp).toDate())} · por {formatUserName(pedido.devalidatedByName)}</span>
                        </li>
                    )}
                    {pedido.despachadoAt && (
                        <li className="inline-flex items-center gap-1">
                            <Truck size={12} className="text-emerald-600 dark:text-emerald-400" />
                            <span><span className="font-bold">Despachado</span> · {formatDateTime((pedido.despachadoAt as Timestamp).toDate())} {pedido.envioId ? `· envío ${pedido.envioId}` : ''}</span>
                        </li>
                    )}
                    {pedido.cancelledAt && (
                        <li className="inline-flex items-center gap-1">
                            <XCircle size={12} className="text-rose-600 dark:text-rose-400" />
                            <span><span className="font-bold">Cancelado</span> · {formatDateTime((pedido.cancelledAt as Timestamp).toDate())} · por {formatUserName(pedido.cancelledByName)}</span>
                        </li>
                    )}
                </ul>
            </div>

            {/* Modal de confirmación simple (acciones sin razón) */}
            <ConfirmModal
                isOpen={actionType === 'validate' || actionType === 'devalidate' || actionType === 'approveCancel'}
                onClose={() => { if (!submitting) { setActionType(null); setReason(''); } }}
                onConfirm={runAction}
                title={
                    actionType === 'validate' ? 'Validar pedido' :
                    actionType === 'devalidate' ? 'Devolver a borrador' :
                    actionType === 'approveCancel' ? 'Aprobar cancelación' : ''
                }
                message={
                    actionType === 'validate' ? `Una vez validado, ${pedido.toBranchName} podrá generar el envío.` :
                    actionType === 'devalidate' ? 'Solo se puede mientras no exista un envío. El pedido volverá a estado borrador.' :
                    actionType === 'approveCancel' ? 'El pedido quedará marcado como cancelado de forma definitiva.' : ''
                }
                confirmText={submitting ? 'Procesando...' : 'Confirmar'}
                variant={actionType === 'approveCancel' ? 'danger' : actionType === 'devalidate' ? 'warning' : 'info'}
                isLoading={submitting}
            />

            {/* Modal con razón (cancelar / rechazar cancelación) */}
            <IndustrialModal
                isOpen={actionType === 'requestCancel' || actionType === 'rejectCancel'}
                onClose={() => { if (!submitting) { setActionType(null); setReason(''); } }}
                title={actionType === 'requestCancel' ? 'Solicitar cancelación' : 'Rechazar cancelación'}
                subtitle="Indica el motivo"
                icon={actionType === 'requestCancel' ? <ShieldAlert size={24} /> : <Undo2 size={24} />}
                theme={actionType === 'requestCancel' ? 'carbon' : 'stealth'}
                maxWidth="max-w-md"
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        {actionType === 'requestCancel'
                            ? 'La cancelación requiere aprobación de un GERENTE HQ. Indica una razón clara.'
                            : 'La solicitud quedará rechazada y el pedido continuará su flujo. Motivo opcional.'}
                    </p>
                    <textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        rows={3}
                        placeholder={actionType === 'requestCancel' ? 'Razón (obligatoria)' : 'Motivo del rechazo (opcional)'}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-slate-400"
                    />
                    <div className="flex gap-3 pt-2">
                        <button
                            disabled={submitting}
                            onClick={() => { if (!submitting) { setActionType(null); setReason(''); } }}
                            className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase tracking-widest border border-slate-200 dark:border-white/10 disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            disabled={submitting || (actionType === 'requestCancel' && !reason.trim())}
                            onClick={runAction}
                            className={clsx(
                                'flex-[1.5] h-11 rounded-xl font-bold text-xs uppercase tracking-widest text-white inline-flex items-center justify-center gap-2 disabled:opacity-50',
                                actionType === 'requestCancel' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-700 hover:bg-slate-600'
                            )}
                        >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            Confirmar
                        </button>
                    </div>
                </div>
            </IndustrialModal>
        </div>
    );
}

function MetaCard({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
    return (
        <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                <Icon size={11} /> {label}
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-white whitespace-pre-line leading-tight">{value}</div>
        </div>
    );
}
