'use client';

import { useState, useEffect } from 'react';
import { SupplierHistoryEvent } from '@/services/SupplierPaymentHistoryService';
import IndustrialModal from '@/components/common/IndustrialModal';
import { Loader2, FileText, Undo2, Banknote, Package } from 'lucide-react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import clsx from 'clsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    event: SupplierHistoryEvent | null;
}

interface TransactionData {
    motivo?: string;
    notes?: string;
    observaciones?: string;
    [key: string]: unknown;
}

interface TransactionItem {
    id?: string;
    productCode?: string;
    codigo?: string;
    productName?: string;
    nombre?: string;
    quantity?: number;
    cantidad?: number;
    cost?: number;
    costo?: number;
    total?: number;
    [key: string]: unknown;
}

const fmtBob = (n: number) =>
    new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n || 0);

const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat('es-BO', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }).format(d);

export default function TransactionDetailsModal({ isOpen, onClose, event }: Props) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<TransactionData | null>(null);
    const [items, setItems] = useState<TransactionItem[]>([]);

    useEffect(() => {
        if (!isOpen || !event) {
            setData(null);
            setItems([]);
            return;
        }

        const fetchDetails = async () => {
            setLoading(true);
            try {
                if (event.kind.startsWith('COMPRA')) {
                    const docSnap = await getDoc(doc(db, 'compras', event.id));
                    if (docSnap.exists()) {
                        setData(docSnap.data());
                        const itemsSnap = await getDocs(collection(db, 'compras', event.id, 'items'));
                        setItems(itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                    }
                } else if (event.kind === 'DEVOLUCION') {
                    const docSnap = await getDoc(doc(db, 'devoluciones_proveedor', event.id));
                    if (docSnap.exists()) {
                        const d = docSnap.data();
                        setData(d);
                        setItems(d.items || []); // devoluciones guarda items directamente en el doc
                    }
                } else {
                    // Para pagos, la información base ya está en el event
                    setData({});
                    setItems([]);
                }
            } catch (error) {
                console.error('Error fetching details:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [isOpen, event]);

    if (!isOpen || !event) return null;

    const isDevolucion = event.kind === 'DEVOLUCION';
    const isCompra = event.kind.startsWith('COMPRA');

    const icon = isDevolucion ? <Undo2 size={24} /> : isCompra ? <FileText size={24} /> : <Banknote size={24} />;
    const iconBg = isDevolucion ? 'bg-amber-500' : isCompra ? 'bg-rose-500' : 'bg-emerald-500';
    const iconColor = 'text-white';

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={isDevolucion ? 'Detalle de Devolución' : isCompra ? 'Detalle de Compra' : 'Detalle de Pago'}
            subtitle={event.label}
            icon={icon}
            iconBg={iconBg}
            iconColor={iconColor}
            maxWidth="max-w-2xl"
        >
            <div className="pt-4 space-y-6">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 size={32} className="animate-spin text-slate-400 mb-4" />
                        <p className="text-sm font-bold text-slate-500">Cargando detalles...</p>
                    </div>
                ) : (
                    <>
                        {/* Cabecera Info */}
                        <div className={clsx(
                            'rounded-2xl border p-4 grid grid-cols-2 gap-4',
                            isDevolucion ? 'bg-amber-50/50 dark:bg-amber-500/5 border-amber-200/50 dark:border-amber-500/20' :
                            isCompra ? 'bg-rose-50/50 dark:bg-rose-500/5 border-rose-200/50 dark:border-rose-500/20' :
                            'bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-200/50 dark:border-emerald-500/20'
                        )}>
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fecha</p>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{fmtDate(event.date)}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Usuario</p>
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{event.userLabel || 'Sistema'}</p>
                            </div>
                            {event.reference && (
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Referencia</p>
                                    <p className="text-sm font-mono text-slate-700 dark:text-slate-300">{event.reference}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total</p>
                                <p className={clsx(
                                    'text-lg font-black tabular-nums',
                                    isDevolucion ? 'text-amber-600 dark:text-amber-500' :
                                    isCompra ? 'text-rose-600 dark:text-rose-500' :
                                    'text-emerald-600 dark:text-emerald-500'
                                )}>
                                    Bs. {fmtBob(event.amount).replace('Bs.', '')}
                                </p>
                            </div>
                            {(data?.motivo || data?.notes || data?.observaciones) && (
                                <div className="col-span-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Motivo / Notas</p>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                        {data.motivo || data.notes || data.observaciones}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Lista de Items */}
                        {(isCompra || isDevolucion) && (
                            <div className="border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden bg-white dark:bg-[#111827]">
                                <div className="bg-slate-50 dark:bg-white/5 px-4 py-3 flex items-center justify-between border-b border-slate-200 dark:border-white/10">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Productos incluidos ({items.length})
                                    </span>
                                </div>
                                {items.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                                        <Package size={24} className="mb-2 opacity-50" />
                                        <p className="text-xs font-bold">No hay productos registrados</p>
                                    </div>
                                ) : (
                                    <div className="max-h-64 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-white/5">
                                        {items.map((it, idx) => (
                                            <div key={it.id || idx} className="p-3 px-4 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] font-black text-slate-400">
                                                        {it.productCode || it.codigo}
                                                    </p>
                                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                                        {it.productName || it.nombre}
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                        Cant: {it.quantity || it.cantidad}
                                                    </p>
                                                    <p className="text-sm font-black tabular-nums">
                                                        Bs. {fmtBob(it.total || ((it.cost || it.costo || 0) * (it.quantity || it.cantidad || 0))).replace('Bs.', '')}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        
                        <div className="flex justify-end pt-4">
                            <button
                                onClick={onClose}
                                className="px-6 h-11 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 font-black uppercase text-[10px] tracking-widest transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </>
                )}
            </div>
        </IndustrialModal>
    );
}
