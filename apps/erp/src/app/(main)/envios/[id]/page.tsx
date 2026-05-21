'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
    Truck, Loader2, Send, Edit3, PackageCheck, AlertTriangle, FileText,
    Plus, Minus, Trash2, Save, Search, User, Building2,
    MessageSquare, ShieldCheck, ShieldAlert, Package, Ban, RotateCcw, Printer,
    CreditCard, X,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Timestamp } from 'firebase/firestore';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { EnvioService } from '@/services/EnvioService';
import { PrintService } from '@/services/PrintService';
import { Envio, EnvioItem, EnvioStatus } from '@/types';
import type { Transport } from '@/types';
import ModuleHeader from '@/components/common/ModuleHeader';
import NumericInput from '@/components/common/NumericInput';
import ConfirmModal from '@/components/common/ConfirmModal';
import IndustrialModal from '@/components/common/IndustrialModal';
import TransportSelectorModal from '@/components/modals/TransportSelectorModal';
import { formatDate, formatDateTime } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';

const STATUS_LABEL: Record<EnvioStatus, string> = {
    preparacion: 'En preparación',
    en_transito: 'En tránsito',
    recibido: 'Recibido',
    cancelado_devolucion: 'Cancelado (devolución)',
    cancelado_perdida: 'Cancelado (pérdida)',
};

const DISCREPANCY_REASONS = ['SOBRANTE', 'FALTANTE', 'DAÑADO', 'OTRO'] as const;
type DiscrepancyReason = typeof DISCREPANCY_REASONS[number];

interface EditLine extends EnvioItem {
    _key: string;
}

type ActionType = 'dispatch' | null;

export default function EnvioDetailPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const envioId = params?.id;

    const { currentBranch, loading: branchLoading } = useBranch();
    const { user, userName, loading: authLoading } = useAuth();

    const [envio, setEnvio] = useState<Envio | null>(null);
    const [items, setItems] = useState<EnvioItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Edición de items (preparación o tránsito)
    const [isEditing, setIsEditing] = useState(false);
    const [editLines, setEditLines] = useState<EditLine[]>([]);
    const [editNotas, setEditNotas] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [showAddPanel, setShowAddPanel] = useState(false);
    const [productSearch, setProductSearch] = useState('');

    // Edición de cabecera (solo en preparacion). Snapshot al iniciar edición.
    const [editTransportId, setEditTransportId] = useState<string | undefined>();
    const [editTransportName, setEditTransportName] = useState<string>('');
    const [editTransportMethod, setEditTransportMethod] = useState<string>('');
    const [editTransportCost, setEditTransportCost] = useState<string>('');
    const [editTransportPaymentType, setEditTransportPaymentType] = useState<'PAGADO' | 'POR_PAGAR'>('PAGADO');
    const [editTransportPaymentMethod, setEditTransportPaymentMethod] = useState<'EFECTIVO' | 'QR' | 'TRANSFERENCIA' | ''>('');
    const [editTransportBankRef, setEditTransportBankRef] = useState<string>('');
    const [transportSelectorOpen, setTransportSelectorOpen] = useState(false);

    // Acción (despachar)
    const [actionType, setActionType] = useState<ActionType>(null);
    const [submitting, setSubmitting] = useState(false);

    // Recepción
    const [receiveOpen, setReceiveOpen] = useState(false);
    const [received, setReceived] = useState<Record<string, number>>({});
    const [discrepancies, setDiscrepancies] = useState<Record<string, { reason: DiscrepancyReason; note?: string }>>({});

    // Solicitud de cancelación en tránsito
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelMode, setCancelMode] = useState<'devolucion' | 'perdida'>('devolucion');
    const [cancelReason, setCancelReason] = useState('');
    const [cancelSubmitting, setCancelSubmitting] = useState(false);

    // Productos de la sucursal despachadora (envio.fromBranchId)
    const { products } = useProducts(envio?.fromBranchId || 'ALL');

    // Mapa productId -> stock disponible en la sucursal despachadora
    const stockMap = useMemo(() => {
        const m: Record<string, number> = {};
        products.forEach(p => { if (p.id) m[p.id] = p.stock || 0; });
        return m;
    }, [products]);

    const userBranchId = currentBranch?.id || '';
    const isDespachadora = envio && userBranchId === envio.fromBranchId;
    const isReceptora = envio && userBranchId === envio.toBranchId;

    const reload = useCallback(async () => {
        if (!envioId) return;
        setLoading(true);
        try {
            const result = await EnvioService.getWithItems(envioId);
            if (!result) {
                toast.error('Envío no encontrado');
                router.push('/envios');
                return;
            }
            setEnvio(result.envio);
            setItems(result.items);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo cargar el envío');
        } finally {
            setLoading(false);
        }
    }, [envioId, router]);

    useEffect(() => {
        if (branchLoading || authLoading || !user) return;
        reload();
    }, [reload, branchLoading, authLoading, user]);

    // Inicializar mapa de recepción cuando se abre el modal
    useEffect(() => {
        if (receiveOpen && items.length > 0) {
            const initial: Record<string, number> = {};
            items.forEach(it => { initial[it.productId] = it.qtyEnviada || 0; });
            setReceived(initial);
            setDiscrepancies({});
        }
    }, [receiveOpen, items]);

    const startEdit = () => {
        setEditLines(items.map((it, idx) => ({ ...it, _key: it.id || `tmp-${idx}` })));
        setEditNotas(envio?.notas || '');
        // Snapshot de cabecera (solo se usará si status === 'preparacion')
        setEditTransportId(envio?.transportId);
        setEditTransportName(envio?.transportName || '');
        setEditTransportMethod(envio?.transportMethod || '');
        setEditTransportCost(envio?.transportCost != null ? String(envio.transportCost) : '');
        setEditTransportPaymentType(envio?.transportPaymentType || 'PAGADO');
        setEditTransportPaymentMethod(envio?.transportPaymentMethod || '');
        setEditTransportBankRef(envio?.transportBankRef || '');
        setIsEditing(true);
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setEditLines([]);
        setShowAddPanel(false);
    };

    const updateEditQty = (key: string, qty: number) => {
        setEditLines(prev => prev.map(l => l._key === key ? { ...l, qtyEnviada: Math.max(0, Math.floor(qty)) } : l));
    };

    const removeEditLine = (key: string) => setEditLines(prev => prev.filter(l => l._key !== key));

    const addEditExtra = (productId: string) => {
        const p = products.find(x => x.id === productId);
        if (!p) return;
        setEditLines(prev => {
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
                esExtra: true,
            }];
        });
    };

    const filteredProductsForAdd = useMemo(() => {
        if (!envio) return [];
        const q = productSearch.trim().toLowerCase();
        const list = products.filter(p => p.branchId === envio.fromBranchId);
        if (!q) return list.slice(0, 30);
        return list.filter(p =>
            (p.nombre || '').toLowerCase().includes(q) ||
            (p.codigo || '').toLowerCase().includes(q)
        ).slice(0, 30);
    }, [products, envio, productSearch]);

    const saveEdit = async () => {
        if (!envio || !user || !currentBranch) return;
        const valid = editLines.filter(l => (l.qtyEnviada || 0) > 0);
        if (valid.length === 0) {
            toast.error('Debe haber al menos un ítem con cantidad > 0');
            return;
        }
        // Validación de cabecera (solo si está editable: status preparacion)
        const headerEditable = envio.status === 'preparacion';
        if (headerEditable) {
            const cost = parseFloat(editTransportCost || '0') || 0;
            if (cost > 0 && editTransportPaymentType === 'PAGADO' && !editTransportPaymentMethod) {
                toast.error('Selecciona el método de pago del flete');
                return;
            }
        }
        setSavingEdit(true);
        try {
            // 1) Actualizar cabecera primero (si aplica)
            if (headerEditable) {
                const cost = parseFloat(editTransportCost || '0') || 0;
                const finalType = cost > 0 ? editTransportPaymentType : null;
                const finalMethod = cost > 0 && editTransportPaymentType === 'PAGADO' ? (editTransportPaymentMethod || null) : null;
                const finalBankRef = finalMethod && finalMethod !== 'EFECTIVO' ? (editTransportBankRef.trim() || null) : null;
                await EnvioService.updateHeader({
                    envioId: envio.codigo,
                    userId: user.uid,
                    userName: userName || user.email || 'Usuario',
                    userBranchId: currentBranch.id!,
                    notas: editNotas,
                    transportId: editTransportId || null,
                    transportMethod: editTransportMethod.trim() || null,
                    transportName: editTransportName.trim() || editTransportMethod.trim() || null,
                    transportPaymentType: finalType,
                    transportPaymentMethod: finalMethod,
                    transportBankRef: finalBankRef,
                    transportCost: cost,
                });
            }
            // 2) Actualizar items
            const cleanItems: EnvioItem[] = valid.map(({ _key: _k, id: _id, ...rest }) => rest);
            await EnvioService.updateItems({
                envioId: envio.codigo,
                items: cleanItems,
                notas: editNotas,
                editedBy: user.uid,
                editedByName: userName || user.email || 'Usuario',
                userBranchId: currentBranch.id!,
            });
            toast.success('Envío actualizado');
            setIsEditing(false);
            await reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
        } finally {
            setSavingEdit(false);
        }
    };

    const runDispatch = async () => {
        if (!envio || !user || !currentBranch) return;
        setSubmitting(true);
        try {
            await EnvioService.dispatch({
                envioId: envio.codigo,
                userId: user.uid,
                userName: userName || user.email || 'Usuario',
                userBranchId: currentBranch.id!,
            });
            toast.success('Envío despachado. Stock descontado.');
            setActionType(null);
            await reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo despachar');
        } finally {
            setSubmitting(false);
        }
    };

    const updateReceivedQty = (productId: string, qty: number) => {
        setReceived(prev => ({ ...prev, [productId]: Math.max(0, Math.floor(qty)) }));
    };

    const setDiscrepancyReason = (productId: string, reason: DiscrepancyReason) => {
        setDiscrepancies(prev => ({ ...prev, [productId]: { ...prev[productId], reason } }));
    };
    const setDiscrepancyNote = (productId: string, note: string) => {
        setDiscrepancies(prev => ({ ...prev, [productId]: { ...prev[productId], reason: prev[productId]?.reason || 'OTRO', note } }));
    };

    const receptionValidation = useMemo(() => {
        for (const it of items) {
            const qr = received[it.productId];
            if (qr == null || !Number.isFinite(qr) || qr < 0) return `Cantidad inválida en ${it.productName}`;
            if (qr !== (it.qtyEnviada || 0) && !discrepancies[it.productId]?.reason) {
                return `Justifica la diferencia en ${it.productName}`;
            }
        }
        return null;
    }, [items, received, discrepancies]);

    const runReceive = async () => {
        if (!envio || !user || !currentBranch) return;
        if (receptionValidation) { toast.error(receptionValidation); return; }
        setSubmitting(true);
        try {
            const result = await EnvioService.receive({
                envioId: envio.codigo,
                received,
                discrepancies: Object.keys(discrepancies).length ? discrepancies : undefined,
                userId: user.uid,
                userName: userName || user.email || 'Usuario',
                userBranchId: currentBranch.id!,
            });
            toast.success(result.hasDiscrepancy ? 'Recibido con discrepancia (alerta creada)' : 'Recibido sin discrepancias');
            setReceiveOpen(false);
            await reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo recibir');
        } finally {
            setSubmitting(false);
        }
    };

    const submitCancel = async () => {
        if (!envio || !user || !currentBranch?.id) return;
        if (cancelReason.trim().length < 5) {
            toast.error('Motivo requerido (mínimo 5 caracteres)');
            return;
        }
        setCancelSubmitting(true);
        try {
            await EnvioService.requestInTransitCancellation({
                envioId: envio.codigo,
                mode: cancelMode,
                reason: cancelReason.trim(),
                userId: user.uid,
                userName: userName || user.email || 'Usuario',
                userBranchId: currentBranch.id,
            });
            toast.success('Solicitud enviada. Espera aprobación HQ.');
            setCancelOpen(false);
            await reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo solicitar');
        } finally {
            setCancelSubmitting(false);
        }
    };

    if (loading || !envio) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
                <Loader2 size={24} className="animate-spin mr-2" />
                Cargando envío...
            </div>
        );
    }

    const fechaCreacion = (envio.createdAt as Timestamp)?.toDate?.();
    const totalEnv = (isEditing ? editLines : items).reduce((s, i) => s + (i.qtyEnviada || 0), 0);
    const totalRec = items.reduce((s, i) => s + (i.qtyRecibida || 0), 0);

    const canEdit = (envio.status === 'preparacion' || envio.status === 'en_transito') && isDespachadora && !isEditing;
    const canDispatch = envio.status === 'preparacion' && isDespachadora;
    const canReceive = envio.status === 'en_transito' && isReceptora;
    const canRequestCancel = envio.status === 'en_transito' && (isDespachadora || isReceptora) && !envio.cancellationPending;

    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6 min-w-0 w-full max-w-full pb-32">
            <ModuleHeader
                title={envio.codigo}
                subtitle={`${envio.fromBranchName} → ${envio.toBranchName}`}
                icon={Truck}
                onBack={() => router.push('/envios')}
                badge={STATUS_LABEL[envio.status]}
                actions={[
                    {
                        label: 'Imprimir guía',
                        icon: Printer,
                        variant: 'outline',
                        onClick: async () => {
                            const t = toast.loading('Generando guía...');
                            try {
                                await PrintService.printEnvioGuide(envio, items, envio.fromBranchId);
                                toast.success('Guía lista', { id: t });
                            } catch (e) {
                                const msg = e instanceof Error ? e.message : 'Error al generar la guía';
                                toast.error(msg, { id: t });
                            }
                        },
                    },
                ]}
            />

            {/* Banners */}
            {envio.editedInTransit && envio.status === 'en_transito' && (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-3 inline-flex items-start gap-2">
                    <AlertTriangle size={16} className="text-amber-700 dark:text-amber-300 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-900 dark:text-amber-200">
                        Este envío fue modificado durante el tránsito{envio.lastTransitEditByName ? ` por ${formatUserName(envio.lastTransitEditByName)}` : ''}.
                    </div>
                </div>
            )}

            {envio.lastHeaderEditAt && (
                <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl p-3 inline-flex items-start gap-2">
                    <Edit3 size={16} className="text-blue-700 dark:text-blue-300 mt-0.5 shrink-0" />
                    <div className="text-xs text-blue-900 dark:text-blue-200">
                        Cabecera editada{envio.lastHeaderEditByName ? ` por ${formatUserName(envio.lastHeaderEditByName)}` : ''}
                        {envio.lastHeaderEditAt ? ` · ${formatDateTime((envio.lastHeaderEditAt as Timestamp).toDate())}` : ''}.
                    </div>
                </div>
            )}

            {envio.hasDiscrepancy && (
                <div className={clsx(
                    "border rounded-2xl p-3 inline-flex items-start gap-2",
                    envio.discrepancyStatus === 'approved'
                        ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20"
                        : envio.discrepancyStatus === 'rejected'
                        ? "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10"
                        : "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20"
                )}>
                    <ShieldAlert size={16} className={clsx(
                        "mt-0.5 shrink-0",
                        envio.discrepancyStatus === 'approved'
                            ? "text-emerald-700 dark:text-emerald-300"
                            : envio.discrepancyStatus === 'rejected'
                            ? "text-slate-500 dark:text-slate-300"
                            : "text-rose-700 dark:text-rose-300"
                    )} />
                    <div className={clsx(
                        "text-xs",
                        envio.discrepancyStatus === 'approved'
                            ? "text-emerald-900 dark:text-emerald-200"
                            : envio.discrepancyStatus === 'rejected'
                            ? "text-slate-700 dark:text-slate-200"
                            : "text-rose-900 dark:text-rose-200"
                    )}>
                        {envio.discrepancyStatus === 'approved' && (
                            <>Discrepancia <strong>aprobada</strong> por {formatUserName(envio.discrepancyResolvedByName)} ({totalEnv} env vs {totalRec} rec). Stock origen ajustado según la decisión.</>
                        )}
                        {envio.discrepancyStatus === 'rejected' && (
                            <>Discrepancia <strong>rechazada</strong> por {formatUserName(envio.discrepancyResolvedByName)} ({totalEnv} env vs {totalRec} rec). No se aplicaron ajustes.</>
                        )}
                        {(!envio.discrepancyStatus || envio.discrepancyStatus === 'pending') && (
                            <>Recepción con discrepancia ({totalEnv} enviadas vs {totalRec} recibidas). <strong>Pendiente de revisión por gerencia.</strong></>
                        )}
                        {envio.discrepancyResolutionNote && (
                            <span className="block mt-1 italic opacity-80">“{envio.discrepancyResolutionNote}”</span>
                        )}
                    </div>
                </div>
            )}

            {/* Metadatos */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetaCard icon={Building2} label="Despacha" value={envio.fromBranchName} />
                <MetaCard icon={envio.clientName ? User : Building2} label="Recibe" value={envio.clientName || envio.toBranchName || '—'} />
                <MetaCard
                    icon={FileText}
                    label={envio.isDirect ? 'Tipo' : 'Pedido'}
                    value={envio.isDirect ? 'Envío directo' : (envio.pedidoId || '—')}
                />
                <MetaCard icon={User} label="Creado por" value={`${formatUserName(envio.createdByName)}\n${fechaCreacion ? formatDate(fechaCreacion) : ''}`.trim()} />
            </div>

            {/* Transporte */}
            {(envio.transportMethod || envio.transportPaymentMethod || (envio.transportCost || 0) > 0) && (
                <div className="space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {envio.transportMethod && (
                            <MetaCard icon={Truck} label="Transporte" value={envio.transportMethod} />
                        )}
                        {envio.transportCost != null && envio.transportCost > 0 && (
                            <MetaCard icon={FileText} label="Costo flete" value={`Bs. ${envio.transportCost.toFixed(2)}`} />
                        )}
                        {envio.transportPaymentMethod ? (
                            <MetaCard
                                icon={FileText}
                                label="Pago flete"
                                value={`${envio.transportPaymentMethod === 'EFECTIVO' ? 'Efectivo' : envio.transportPaymentMethod === 'QR' ? 'QR' : 'Transferencia'}${envio.transportBankRef ? ` · Ref. ${envio.transportBankRef}` : ''}`}
                            />
                        ) : envio.transportPaymentType && (
                            <MetaCard icon={FileText} label="Pago flete" value={envio.transportPaymentType === 'PAGADO' ? 'Pagado' : 'Por pagar'} />
                        )}
                    </div>
                    {/* Aviso + retry para flete huérfano (sin gasto registrado) */}
                    {envio.transportPaymentMethod
                        && (envio.transportCost || 0) > 0
                        && !envio.transportExpenseId
                        && isDespachadora && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl">
                            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                            <div className="flex-1 text-[11px] text-amber-800 dark:text-amber-300">
                                Este flete no tiene gasto registrado en la cuenta. Verifica que la cuenta default para {envio.transportPaymentMethod} esté configurada en Caja → Ajustes y reintenta.
                            </div>
                            <button
                                onClick={async () => {
                                    if (!user) return;
                                    try {
                                        await EnvioService.retryFleteExpense(envio.codigo, user.uid, userName || user.email || 'Usuario');
                                        toast.success('Flete registrado correctamente');
                                        reload();
                                    } catch (e) {
                                        toast.error(e instanceof Error ? e.message : 'No se pudo reintentar');
                                    }
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold whitespace-nowrap"
                            >
                                <RotateCcw size={12} /> Reintentar
                            </button>
                        </div>
                    )}
                </div>
            )}

            {envio.notas && !isEditing && (
                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        <MessageSquare size={12} /> Notas
                    </div>
                    <div className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{envio.notas}</div>
                </div>
            )}

            {/* Editor de cabecera (solo en preparación) */}
            {isEditing && envio.status === 'preparacion' && (
                <div className="bg-amber-50/40 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-3 inline-flex items-center gap-1">
                        <CreditCard size={12} /> Cabecera de transporte
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
                                    {editTransportName || editTransportMethod || <span className="text-slate-400">Seleccionar transporte...</span>}
                                </button>
                                {(editTransportId || editTransportName || editTransportMethod) && (
                                    <button
                                        type="button"
                                        onClick={() => { setEditTransportId(undefined); setEditTransportName(''); setEditTransportMethod(''); }}
                                        className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-colors"
                                    >
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
                                value={editTransportCost}
                                onChange={e => setEditTransportCost(e.target.value)}
                                placeholder="0.00"
                                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-slate-400"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Tipo de pago</label>
                            <div className="flex rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-1">
                                <button
                                    type="button"
                                    onClick={() => setEditTransportPaymentType('PAGADO')}
                                    className={clsx(
                                        'flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition',
                                        editTransportPaymentType === 'PAGADO' ? 'bg-green-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'
                                    )}
                                >Pagado</button>
                                <button
                                    type="button"
                                    onClick={() => setEditTransportPaymentType('POR_PAGAR')}
                                    className={clsx(
                                        'flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition',
                                        editTransportPaymentType === 'POR_PAGAR' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-white'
                                    )}
                                >Por Pagar</button>
                            </div>
                        </div>
                    </div>
                    {editTransportPaymentType === 'PAGADO' && parseFloat(editTransportCost || '0') > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Método de pago</label>
                                <select
                                    value={editTransportPaymentMethod}
                                    onChange={e => {
                                        const v = e.target.value as 'EFECTIVO' | 'QR' | 'TRANSFERENCIA' | '';
                                        setEditTransportPaymentMethod(v);
                                        if (v === 'EFECTIVO' || v === '') setEditTransportBankRef('');
                                    }}
                                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                >
                                    <option value="">— Seleccionar —</option>
                                    <option value="EFECTIVO">Efectivo</option>
                                    <option value="QR">QR</option>
                                    <option value="TRANSFERENCIA">Transferencia</option>
                                </select>
                            </div>
                            {editTransportPaymentMethod && editTransportPaymentMethod !== 'EFECTIVO' && (
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Referencia / N° comprobante</label>
                                    <input
                                        type="text"
                                        value={editTransportBankRef}
                                        onChange={e => setEditTransportBankRef(e.target.value)}
                                        placeholder="Últimos dígitos o número de operación"
                                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                    {envio.transportExpenseId && (
                        <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-400">
                            ⚠ Este envío ya tiene un gasto registrado. Si cambias el monto, tipo o método de pago, el gasto previo se anulará automáticamente y se generará uno nuevo.
                        </p>
                    )}
                </div>
            )}

            {/* Lista de ítems / editor */}
            <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white inline-flex items-center gap-2">
                        <Package size={16} />
                        Ítems ({(isEditing ? editLines : items).length} · {totalEnv} enviadas{envio.status === 'recibido' ? ` · ${totalRec} recibidas` : ''})
                    </h3>
                    {isEditing && (
                        <button
                            onClick={() => setShowAddPanel(s => !s)}
                            className="text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 hover:underline"
                        >
                            <Plus size={12} /> {showAddPanel ? 'Ocultar' : 'Añadir extra'}
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
                                        onClick={() => addEditExtra(p.id!)}
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
                            <li className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">Sin ítems</li>
                        ) : editLines.map(line => (
                            <li key={line._key} className="px-4 py-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{line.productName}</div>
                                        {line.esExtra && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Extra</span>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                        {line.productCode} · pedido: {line.qtyPedida}
                                        {isDespachadora && (() => {
                                            const stock = stockMap[line.productId] ?? 0;
                                            const insuf = line.qtyEnviada > stock;
                                            return (
                                                <> · stock: <span className={clsx('font-bold', insuf ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300')}>{stock}</span></>
                                            );
                                        })()}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => updateEditQty(line._key, line.qtyEnviada - 1)} className="w-7 h-7 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5">
                                        <Minus size={12} />
                                    </button>
                                    <NumericInput
                                        value={line.qtyEnviada}
                                        onChange={v => updateEditQty(line._key, parseFloat(v) || 0)}
                                        className="w-14 text-center text-sm font-bold rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 py-1"
                                    />
                                    <button onClick={() => updateEditQty(line._key, line.qtyEnviada + 1)} className="w-7 h-7 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5">
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
                        ) : items.map(it => {
                            const diff = (it.qtyRecibida ?? it.qtyEnviada) - it.qtyEnviada;
                            return (
                                <li key={it.id} className="px-4 py-3 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{it.productName}</div>
                                            {it.esExtra && (
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Extra</span>
                                            )}
                                            {it.discrepancyReason && (
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                                                    {it.discrepancyReason}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                            {it.productCode} · pedido {it.qtyPedida} · enviado {it.qtyEnviada}
                                            {isDespachadora && envio.status === 'preparacion' && (() => {
                                                const stock = stockMap[it.productId] ?? 0;
                                                const insuf = it.qtyEnviada > stock;
                                                return (
                                                    <> · stock: <span className={clsx('font-bold', insuf ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300')}>{stock}</span></>
                                                );
                                            })()}
                                            {envio.status === 'recibido' && it.qtyRecibida != null && (
                                                <> · recibido <span className="font-bold">{it.qtyRecibida}</span></>
                                            )}
                                        </div>
                                        {it.discrepancyNote && (
                                            <div className="text-[11px] italic text-rose-600 dark:text-rose-400 mt-0.5">“{it.discrepancyNote}”</div>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
                                            {envio.status === 'recibido' && it.qtyRecibida != null ? it.qtyRecibida : it.qtyEnviada}
                                        </div>
                                        {envio.status === 'recibido' && diff !== 0 && (
                                            <div className={clsx('text-[10px] font-bold', diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                                                {diff > 0 ? '+' : ''}{diff}
                                            </div>
                                        )}
                                    </div>
                                </li>
                            );
                        })
                    )}
                </ul>

                {isEditing && (
                    <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Notas</label>
                        <input
                            value={editNotas}
                            onChange={e => setEditNotas(e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background"
                        />
                    </div>
                )}
            </div>

            {/* Acciones según estado/rol */}
            {!isEditing && (
                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4 flex flex-wrap gap-2 justify-end">
                    {canEdit && (
                        <button
                            onClick={startEdit}
                            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm font-bold inline-flex items-center gap-2"
                        >
                            <Edit3 size={14} /> {envio.status === 'preparacion' ? 'Editar' : 'Editar ítems'}
                        </button>
                    )}
                    {canDispatch && (
                        <button
                            onClick={() => setActionType('dispatch')}
                            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black text-sm font-bold inline-flex items-center gap-2"
                        >
                            <Send size={14} /> Despachar
                        </button>
                    )}
                    {canReceive && (
                        <button
                            onClick={() => setReceiveOpen(true)}
                            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-2"
                        >
                            <PackageCheck size={14} /> Recibir
                        </button>
                    )}
                    {canRequestCancel && (
                        <button
                            onClick={() => { setCancelMode('devolucion'); setCancelReason(''); setCancelOpen(true); }}
                            className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm font-bold inline-flex items-center gap-2"
                        >
                            <Ban size={14} /> Solicitar cancelación
                        </button>
                    )}
                    {envio.cancellationPending && (
                        <span className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-2">
                            <AlertTriangle size={14} /> Cancelación pendiente HQ ({envio.cancellationMode === 'devolucion' ? 'devolución' : 'pérdida'})
                        </span>
                    )}
                </div>
            )}

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

            {/* Histórico */}
            <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 inline-flex items-center gap-2">
                    <FileText size={12} /> Historial
                </div>
                <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    {fechaCreacion && (
                        <li>
                            <span className="font-bold">Creado</span> · {formatDateTime(fechaCreacion)} · por {formatUserName(envio.createdByName)}
                        </li>
                    )}
                    {envio.despachadoAt && (
                        <li className="inline-flex items-center gap-1">
                            <Send size={12} className="text-emerald-600 dark:text-emerald-400" />
                            <span><span className="font-bold">Despachado</span> · {formatDateTime((envio.despachadoAt as Timestamp).toDate())} · por {formatUserName(envio.despachadoByName)}</span>
                        </li>
                    )}
                    {envio.lastTransitEditAt && (
                        <li className="inline-flex items-center gap-1">
                            <Edit3 size={12} className="text-amber-600 dark:text-amber-400" />
                            <span><span className="font-bold">Editado en tránsito</span> · {formatDateTime((envio.lastTransitEditAt as Timestamp).toDate())} · por {formatUserName(envio.lastTransitEditByName)}</span>
                        </li>
                    )}
                    {envio.lastHeaderEditAt && (
                        <li className="inline-flex items-center gap-1">
                            <Edit3 size={12} className="text-blue-600 dark:text-blue-400" />
                            <span><span className="font-bold">Cabecera editada</span> · {formatDateTime((envio.lastHeaderEditAt as Timestamp).toDate())} · por {formatUserName(envio.lastHeaderEditByName)}</span>
                        </li>
                    )}
                    {envio.recibidoAt && (
                        <li className="inline-flex items-center gap-1">
                            <ShieldCheck size={12} className="text-emerald-600 dark:text-emerald-400" />
                            <span><span className="font-bold">Recibido</span> · {formatDateTime((envio.recibidoAt as Timestamp).toDate())} · por {formatUserName(envio.recibidoByName)}</span>
                        </li>
                    )}
                    {envio.cancellationRequestedAt && (
                        <li className="inline-flex items-center gap-1">
                            <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400" />
                            <span>
                                <span className="font-bold">Cancelación solicitada</span> · {formatDateTime((envio.cancellationRequestedAt as Timestamp).toDate())}
                                {envio.cancellationRequestedByName && <> · por {formatUserName(envio.cancellationRequestedByName)}</>}
                                {envio.cancellationMode && <> · modo {envio.cancellationMode === 'devolucion' ? 'devolución' : 'pérdida'}</>}
                                {envio.cancellationReason && <> · «{envio.cancellationReason}»</>}
                            </span>
                        </li>
                    )}
                    {envio.cancellationRejectedAt && (
                        <li className="inline-flex items-center gap-1">
                            <Ban size={12} className="text-amber-700 dark:text-amber-400" />
                            <span>
                                <span className="font-bold">Cancelación RECHAZADA</span> · {formatDateTime((envio.cancellationRejectedAt as Timestamp).toDate())}
                                {envio.cancellationRejectedByName && <> · por {formatUserName(envio.cancellationRejectedByName)}</>}
                                {envio.cancellationRejectionReason && <> · motivo: «{envio.cancellationRejectionReason}»</>}
                            </span>
                        </li>
                    )}
                    {envio.cancelledAt && (
                        <li className="inline-flex items-center gap-1">
                            <Ban size={12} className="text-rose-600 dark:text-rose-400" />
                            <span>
                                <span className="font-bold">Cancelación APROBADA</span> · {formatDateTime((envio.cancelledAt as Timestamp).toDate())}
                                {envio.cancelledByName && <> · por {formatUserName(envio.cancelledByName)}</>}
                                {envio.cancellationMode && (
                                    <> · {envio.cancellationMode === 'devolucion' ? 'devolución (stock revertido al despachador)' : 'pérdida (sin reversa de stock)'}</>
                                )}
                            </span>
                        </li>
                    )}
                </ul>
            </div>

            {/* Modal Despachar */}
            <ConfirmModal
                isOpen={actionType === 'dispatch'}
                onClose={() => !submitting && setActionType(null)}
                onConfirm={runDispatch}
                title="Despachar envío"
                message={`Se descontará el stock de ${envio.fromBranchName} (${totalEnv} unidades) y el envío pasará a tránsito.`}
                confirmText={submitting ? 'Despachando...' : 'Despachar ahora'}
                variant="warning"
                isLoading={submitting}
            />

            {/* Modal Recibir */}
            <IndustrialModal
                isOpen={receiveOpen}
                onClose={() => !submitting && setReceiveOpen(false)}
                title="Recibir envío"
                subtitle="Confirma cantidades reales"
                icon={<PackageCheck size={24} />}
                theme="cobalt"
                maxWidth="max-w-2xl"
            >
                <div className="space-y-4">
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                        Indica la cantidad real recibida por ítem. Si difiere de lo enviado, debes seleccionar un motivo.
                    </p>
                    <div className="border border-slate-200 dark:border-white/10 rounded-xl divide-y divide-slate-100 dark:divide-gray-800 max-h-96 overflow-y-auto">
                        {items.map(it => {
                            const qr = received[it.productId] ?? 0;
                            const diff = qr - (it.qtyEnviada || 0);
                            const needsReason = diff !== 0;
                            const disc = discrepancies[it.productId];
                            return (
                                <div key={it.id} className="px-3 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{it.productName}</div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                {it.productCode} · enviado: {it.qtyEnviada}
                                            </div>
                                        </div>
                                        <NumericInput
                                            value={qr}
                                            onChange={v => updateReceivedQty(it.productId, parseFloat(v) || 0)}
                                            className="w-20 text-center text-sm font-bold rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 py-1.5"
                                        />
                                        {diff !== 0 && (
                                            <span className={clsx(
                                                'text-[10px] font-black px-2 py-0.5 rounded-xl',
                                                diff > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                                                         : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                                            )}>
                                                {diff > 0 ? '+' : ''}{diff}
                                            </span>
                                        )}
                                    </div>
                                    {needsReason && (
                                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <select
                                                value={disc?.reason || ''}
                                                onChange={e => setDiscrepancyReason(it.productId, e.target.value as DiscrepancyReason)}
                                                className="px-2 py-1.5 text-xs rounded-xl border border-rose-200 dark:border-rose-500/30 bg-white dark:bg-white/5 text-slate-900 dark:text-white"
                                            >
                                                <option value="">Motivo *</option>
                                                {DISCREPANCY_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                            <input
                                                value={disc?.note || ''}
                                                onChange={e => setDiscrepancyNote(it.productId, e.target.value)}
                                                placeholder="Nota (opcional)"
                                                className="px-2 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5"
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {receptionValidation && (
                        <div className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 inline-flex items-center gap-2">
                            <AlertTriangle size={14} />
                            {receptionValidation}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            disabled={submitting}
                            onClick={() => setReceiveOpen(false)}
                            className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase tracking-widest border border-slate-200 dark:border-white/10 disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            disabled={submitting || !!receptionValidation}
                            onClick={runReceive}
                            className="flex-[1.5] h-11 rounded-xl font-bold text-xs uppercase tracking-widest text-white bg-emerald-600 hover:bg-emerald-500 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
                            Confirmar recepción
                        </button>
                    </div>
                </div>
            </IndustrialModal>

            {/* Modal solicitud de cancelación */}
            <IndustrialModal
                isOpen={cancelOpen}
                onClose={() => !cancelSubmitting && setCancelOpen(false)}
                title="Solicitar cancelación de envío"
                subtitle="Requiere aprobación de gerencia HQ"
                icon={<Ban size={20} />}
            >
                <div className="space-y-4 p-1">
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        Esta solicitud requiere aprobación de Gerencia HQ. Mientras esté pendiente, el envío no podrá recibirse.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                            onClick={() => setCancelMode('devolucion')}
                            className={clsx(
                                'p-3 rounded-xl border text-left transition',
                                cancelMode === 'devolucion'
                                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5'
                            )}
                        >
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                                <RotateCcw size={14} /> Devolución
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                                El stock vuelve a {envio.fromBranchName} (sucursal despachadora).
                            </p>
                        </button>
                        <button
                            onClick={() => setCancelMode('perdida')}
                            className={clsx(
                                'p-3 rounded-xl border text-left transition',
                                cancelMode === 'perdida'
                                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-500/10'
                                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5'
                            )}
                        >
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                                <AlertTriangle size={14} /> Pérdida
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                                Mercadería dada por perdida. El stock NO retorna.
                            </p>
                        </button>
                    </div>
                    <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Motivo *</label>
                        <textarea
                            value={cancelReason}
                            onChange={e => setCancelReason(e.target.value)}
                            rows={3}
                            placeholder="Detalla qué pasó con este envío..."
                            className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-background"
                        />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={() => setCancelOpen(false)}
                            disabled={cancelSubmitting}
                            className="flex-1 h-11 rounded-xl font-bold text-xs uppercase tracking-widest bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 disabled:opacity-50"
                        >
                            Cerrar
                        </button>
                        <button
                            onClick={submitCancel}
                            disabled={cancelSubmitting || cancelReason.trim().length < 5}
                            className="flex-[1.5] h-11 rounded-xl font-bold text-xs uppercase tracking-widest text-white bg-rose-600 hover:bg-rose-500 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {cancelSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                            Enviar solicitud
                        </button>
                    </div>
                </div>
            </IndustrialModal>

            <TransportSelectorModal
                isOpen={transportSelectorOpen}
                onClose={() => setTransportSelectorOpen(false)}
                onSelect={(t: Transport) => {
                    setEditTransportId(t.id);
                    setEditTransportName(t.razonSocial);
                    setEditTransportMethod(t.razonSocial);
                    setTransportSelectorOpen(false);
                }}
            />
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
