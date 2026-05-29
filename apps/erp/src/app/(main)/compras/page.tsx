'use client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineModuleGuard } from '@/components/common/OfflineModuleGuard';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db } from '@/lib/firebase';
import { collection, query as fsQuery, where as fsWhere, orderBy as fsOrderBy, limit as fsLimit, onSnapshot, QueryConstraint } from 'firebase/firestore';
import { usePagination } from '@/hooks/usePagination';
import { useRouter } from 'next/navigation';
import { Purchase, PurchaseItem, SupplierAccount } from '@/types';
import { useTransactionItems } from '@/hooks/useTransactionItems';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { SupplierAccountService } from '@/services/SupplierAccountService';
import { PurchaseService } from '@/services/PurchaseService';
import { toast } from 'sonner';
import clsx from 'clsx';
import { downloadCSV } from '@/utils/csvExport';
import { ensureDate, formatDate, formatDateTime } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';
import { startOfDay, endOfDay } from '@/lib/utils';

// Suite Pro v4.0 Components
import ModuleHeader from '@/components/common/ModuleHeader';
import KpiCard from '@/components/common/KpiCard';
import FilterBar from '@/components/common/FilterBar';
import TableFooter from '@/components/common/TableFooter';
import { CheckCircle, Truck, ShoppingBag, Plus, Eye, Calendar, TrendingUp, X, Download, FileText, AlertTriangle, CornerUpLeft } from 'lucide-react';
import { PrintService } from '@/services/PrintService';

export default function PurchasesPage() {
    const { isOnline } = useNetworkStatus();
    const router = useRouter();
    const { user: currentUser } = useAuth();
    const { currentBranch, branches, isConsolidatedView, loading: branchLoading } = useBranch();
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [loading, setLoading] = useState(true);
    const [accountSaldoMap, setAccountSaldoMap] = useState<Map<string, number>>(new Map());
    /** Map purchaseId → monto pagado (allocación FIFO contra los pagos del proveedor). */
    const [paidPerPurchase, setPaidPerPurchase] = useState<Map<string, number>>(new Map());

    const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
    const { items: selectedPurchaseItems, loading: loadingItems } = useTransactionItems<PurchaseItem>(selectedPurchase?.id, 'compras');
    const [generatingPdf, setGeneratingPdf] = useState(false);
    
    // Void Modal State
    const [voidModal, setVoidModal] = useState<{ isOpen: boolean, type: 'ITEM', purchase: Purchase | null, itemIndex?: number }>({ isOpen: false, type: 'ITEM', purchase: null });
    const [voidReason, setVoidReason] = useState('');
    const [voidItemQty, setVoidItemQty] = useState<number>(1);
    const [isVoiding, setIsVoiding] = useState(false);

    const closeVoidModal = () => setVoidModal({ isOpen: false, type: 'ITEM', purchase: null });

    const promptReturnItem = (purchase: Purchase, itemIndex: number) => {
        const item = selectedPurchaseItems[itemIndex];
        if (!item) return;
        const availableQty = item.quantity - (item.returnedQuantity || 0);
        if (availableQty <= 0) {
            toast.error('Este producto ya fue devuelto en su totalidad.');
            return;
        }
        setVoidItemQty(availableQty);
        setVoidModal({ isOpen: true, type: 'ITEM', purchase, itemIndex });
        setVoidReason('');
    };

    const confirmVoidAction = async () => {
        if (!voidModal.purchase || voidModal.itemIndex === undefined) return;
        if (!voidReason.trim()) {
            toast.error('Debe ingresar un motivo para la anulación');
            return;
        }
        
        setIsVoiding(true);
        try {
            const purchase = voidModal.purchase;
            const itemId = selectedPurchaseItems[voidModal.itemIndex]?.id;
            if (!itemId) throw new Error("ID de ítem no encontrado");
            
            await PurchaseService.voidPurchaseItem(
                purchase.id!,
                itemId,
                voidItemQty,
                voidReason,
                {
                    uid: currentUser?.uid || '?',
                    email: currentUser?.email || '?',
                    branchId: purchase.branchId || '?',
                    name: currentUser?.displayName || currentUser?.email || '?'
                }
            );
            toast.success('Devolución del producto procesada exitosamente.');
            closeVoidModal();

            // Refrescar modal si está abierto
            if (selectedPurchase && selectedPurchase.id === purchase.id) {
                const updatedPurchases = await PurchaseService.getPurchases(isConsolidatedView ? undefined : currentBranch?.id);
                const fresh = updatedPurchases.find(p => p.id === purchase.id);
                if (fresh) setSelectedPurchase(fresh);
            }
        } catch (e) {
            console.error(e);
            toast.error((e as Error).message || 'Error al procesar la devolución');
        } finally {
            setIsVoiding(false);
        }
    };

    const handlePrintPurchase = async (purchase: Purchase) => {
        setGeneratingPdf(true);
        try {
            await PrintService.printPurchase(purchase, selectedPurchaseItems, purchase.branchId);
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setGeneratingPdf(false);
        }
    };

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'RECEIVED' | 'PENDING'>('ALL');
    const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'EFECTIVO' | 'TRANSFERENCIA' | 'QR' | 'CREDITO'>('ALL');
    const [sortBy, setSortBy] = useState<'DATE_DESC' | 'DATE_ASC' | 'TOTAL_DESC' | 'TOTAL_ASC' | 'SUPPLIER'>('DATE_DESC');



    // Realtime: lista de compras (limit 500)
    useEffect(() => {
        if (branchLoading) return;
        const branchId = isConsolidatedView ? undefined : currentBranch?.id;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag mientras llega el primer snapshot
        setLoading(true);
        const constraints: QueryConstraint[] = [fsOrderBy('date', 'desc'), fsLimit(500)];
        if (branchId) constraints.unshift(fsWhere('branchId', '==', branchId));
        const q = fsQuery(collection(db, 'compras'), ...constraints);
        const unsub = onSnapshot(
            q,
            snap => {
                const data = snap.docs.map(d => {
                    const raw = d.data();
                    return { id: d.id, ...raw, date: raw.date?.toDate?.() || raw.date } as Purchase;
                });
                setPurchases(data);
                setLoading(false);
            },
            err => {
                console.error('Purchases onSnapshot:', err);
                setLoading(false);
            }
        );
        return () => unsub();
    }, [currentBranch?.id, isConsolidatedView, branchLoading]);

    // Saldos por cuenta de proveedor + asignación FIFO de pagos a compras CREDITO.
    //
    // Lógica: el `saldo` de la cuenta de proveedor es la fuente de verdad de la deuda
    // pendiente. Calculamos `pagado_total = sum(creditos) - saldo` y lo asignamos en
    // orden FIFO (compras más antiguas primero) a las CREDITO de esa cuenta.
    // Esto evita el bug de marcar como PAGADA una compra nueva si historicamente
    // el proveedor recibió pagos por otros conceptos.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const accs: SupplierAccount[] = await SupplierAccountService.getAll();
                if (cancelled) return;
                const sMap = new Map<string, number>();
                accs.forEach(a => { if (a.id) sMap.set(a.id, Number(a.saldo) || 0); });
                setAccountSaldoMap(sMap);

                // Agrupar compras CREDITO por supplierId (= accountId).
                const bySupplier = new Map<string, Purchase[]>();
                purchases.forEach(p => {
                    if (p.paymentMethod === 'CREDITO' && p.supplierId && p.id) {
                        if (!bySupplier.has(p.supplierId)) bySupplier.set(p.supplierId, []);
                        bySupplier.get(p.supplierId)!.push(p);
                    }
                });

                const paidMap = new Map<string, number>();
                bySupplier.forEach((purchs, supplierId) => {
                    const totalCredito = purchs.reduce((s, p) => s + (Number(p.total) || 0), 0);
                    const saldoActual = Math.max(0, sMap.get(supplierId) ?? totalCredito);
                    // Pagado = total CREDITO - saldo pendiente (cap a 0 si excede)
                    let remaining = Math.max(0, totalCredito - saldoActual);
                    const sorted = [...purchs].sort((a, b) => ensureDate(a.date).getTime() - ensureDate(b.date).getTime());
                    for (const p of sorted) {
                        const apply = Math.max(0, Math.min(remaining, Number(p.total) || 0));
                        paidMap.set(p.id!, apply);
                        remaining -= apply;
                    }
                });
                if (!cancelled) setPaidPerPurchase(paidMap);
            } catch (err) {
                console.error('Load supplier accounts:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [purchases]);

    const filteredPurchases = useMemo(() => {
        const filtered = purchases.filter(purchase => {
            const matchesSearch = !searchTerm ||
                purchase.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                purchase.id?.toLowerCase().includes(searchTerm.toLowerCase());

            const purchaseDate = ensureDate(purchase.date);
            const matchesStart = !startDate || purchaseDate >= startOfDay(startDate);
            const matchesEnd = !endDate || purchaseDate <= endOfDay(endDate);
            const matchesStatus = statusFilter === 'ALL' || purchase.status === statusFilter;
            const matchesPayment = paymentFilter === 'ALL' || (purchase.paymentMethod || 'EFECTIVO') === paymentFilter;

            return matchesSearch && matchesStart && matchesEnd && matchesStatus && matchesPayment;
        });

        // Aplicar orden según sortBy
        const sorted = [...filtered];
        switch (sortBy) {
            case 'DATE_DESC':
                sorted.sort((a, b) => ensureDate(b.date).getTime() - ensureDate(a.date).getTime());
                break;
            case 'DATE_ASC':
                sorted.sort((a, b) => ensureDate(a.date).getTime() - ensureDate(b.date).getTime());
                break;
            case 'TOTAL_DESC':
                sorted.sort((a, b) => (b.total || 0) - (a.total || 0));
                break;
            case 'TOTAL_ASC':
                sorted.sort((a, b) => (a.total || 0) - (b.total || 0));
                break;
            case 'SUPPLIER':
                sorted.sort((a, b) => (a.supplierName || '').localeCompare(b.supplierName || ''));
                break;
        }
        return sorted;
    }, [purchases, searchTerm, startDate, endDate, statusFilter, paymentFilter, sortBy]);

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedPurchases } = usePagination(filteredPurchases);

    const stats = useMemo(() => {
        const received = filteredPurchases.filter(p => p.status === 'RECEIVED');
        const pending = filteredPurchases.filter(p => p.status === 'PENDING');
        const total = received.reduce((acc, curr) => acc + (curr.total ?? 0), 0);
        return {
            total,
            count: filteredPurchases.length,
            receivedCount: received.length,
            pendingCount: pending.length,
            avg: filteredPurchases.length > 0 ? total / filteredPurchases.length : 0
        };
    }, [filteredPurchases]);



    const exportToCSV = () => {
        if (filteredPurchases.length === 0) return;

        const headers = ['ID', 'Fecha', 'Proveedor', 'Items', 'Total', 'Estado', 'Responsable'];
        const rows = filteredPurchases.map(p => [
            `COM-${p.id?.slice(-6).toUpperCase()}`,
            formatDate(p.date),
            `"${p.supplierName}"`,
            String(p.itemCount ?? '-'),
            p.total.toFixed(2),
            p.status === 'RECEIVED' ? 'RECIBIDA' : (p.status === 'PENDING' ? 'PENDIENTE' : p.status),
            `"${formatUserName(p.usuarioNombre) || 'SISTEMA'}"`
        ]);

        downloadCSV('compras', headers, rows);
    };

    if (!isOnline) return <OfflineModuleGuard moduleName="Compras"><span/></OfflineModuleGuard>;

    return (
        <>
        <div className="flex-1 min-w-0 w-full max-w-full p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 lg:space-y-8 bg-slate-50 dark:bg-background">
            <ModuleHeader
                title="Compras"
                subtitle="Registro y control de compras"
                icon={Truck}
                actions={[
                    {
                        label: "Exportar",
                        onClick: exportToCSV,
                        icon: Download,
                        variant: 'secondary'
                    },
                    {
                        label: "Nueva Compra",
                        onClick: () => router.push('/compras/nueva'),
                        icon: Plus,
                        variant: 'primary',
                        dataTourId: 'compras-new-btn'
                    }
                ]}
            />

            {/* KPI Grid - Suite Pro v4.0 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard
                    label="Total Invertido"
                    value={stats.total}
                    prefix="Bs"
                    icon={TrendingUp}
                    progress={100}
                    color="gold"
                    highlight
                />
                <KpiCard
                    label="Total Compras"
                    value={stats.count}
                    icon={ShoppingBag}
                    progress={100}
                    color="blue"
                />
                <KpiCard
                    label="Recibidas"
                    value={stats.receivedCount}
                    icon={CheckCircle}
                    progress={(stats.receivedCount / (stats.count || 1)) * 100}
                    color="green"
                />
                <KpiCard
                    label="Promedio por Compra"
                    value={stats.avg}
                    prefix="Bs"
                    icon={Calendar}
                    progress={100}
                    color="purple"
                />
            </div>

            <FilterBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Buscar por proveedor o código..."
                dateRange={{
                    start: startDate,
                    end: endDate,
                    onStartChange: setStartDate,
                    onEndChange: setEndDate
                }}
                filters={[
                    {
                        id: 'status',
                        label: 'Estado',
                        value: statusFilter,
                        onChange: (val) => setStatusFilter((val === 'all' ? 'ALL' : val) as 'ALL' | 'RECEIVED' | 'PENDING'),
                        options: [
                            { label: 'Recibidas', value: 'RECEIVED' },
                            { label: 'Pendientes', value: 'PENDING' }
                        ]
                    },
                    {
                        id: 'payment',
                        label: 'Pago',
                        value: paymentFilter,
                        onChange: (val) => setPaymentFilter((val === 'all' ? 'ALL' : val) as typeof paymentFilter),
                        options: [
                            { label: 'Efectivo', value: 'EFECTIVO' },
                            { label: 'Transferencia', value: 'TRANSFERENCIA' },
                            { label: 'QR', value: 'QR' },
                            { label: 'Crédito', value: 'CREDITO' },
                        ]
                    },
                    {
                        id: 'sort',
                        label: 'Ordenar',
                        value: sortBy,
                        onChange: (val) => {
                            // 'all' significa orden por defecto
                            if (val === 'all') { setSortBy('DATE_DESC'); return; }
                            setSortBy(val as typeof sortBy);
                        },
                        options: [
                            { label: 'Fecha (más nuevo)', value: 'DATE_DESC' },
                            { label: 'Fecha (más viejo)', value: 'DATE_ASC' },
                            { label: 'Total (mayor)', value: 'TOTAL_DESC' },
                            { label: 'Total (menor)', value: 'TOTAL_ASC' },
                            { label: 'Proveedor (A-Z)', value: 'SUPPLIER' },
                        ]
                    }
                ]}
                onClear={() => {
                    setSearchTerm('');
                    setStartDate('');
                    setEndDate('');
                    // Removed hardcoded GERENTE guard. Role protection is now handled dynamicall via MainLayout.
                    setStatusFilter('ALL');
                    setPaymentFilter('ALL');
                    setSortBy('DATE_DESC');
                }}
                isDirty={searchTerm !== '' || startDate !== '' || endDate !== '' || statusFilter !== 'ALL' || paymentFilter !== 'ALL' || sortBy !== 'DATE_DESC'}
            />

            {/* Table / List - Industrial Premium View */}
            <div data-tour="compras-list" className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl flex-1 overflow-hidden flex flex-col transition-all duration-500">
                {/* Top Pagination Bar */}
                <TableFooter
                    totalItems={filteredPurchases.length}
                    itemsPerPage={itemsPerPage}
                    onChangeItemsPerPage={setItemsPerPage}
                    currentPage={currentPage}
                    onChangePage={setCurrentPage}
                    totalPages={totalPages}
                    label="Compras"
                    className="border-b border-t-0 bg-white/50 dark:bg-black/10"
                />
                <div className="overflow-auto flex-1 custom-scrollbar p-6 md:p-0">

                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3">
                        {!loading && paginatedPurchases.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-300 dark:text-slate-600">
                                <Truck size={48} strokeWidth={0.5} className="mb-3 opacity-40" />
                                <p className="text-[10px] font-bold uppercase tracking-widest">Sin registros</p>
                            </div>
                        )}
                        {paginatedPurchases.map((purchase) => (
                            <div key={purchase.id} onClick={() => setSelectedPurchase(purchase)} className="bg-slate-50 dark:bg-white/5/40 rounded-xl p-4 border border-slate-100 dark:border-white/10/50 active:scale-[0.98] transition-all">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex flex-col gap-1">
                                        <span className="font-mono text-xs font-bold text-yellow-600 dark:text-[#FFD700] bg-yellow-100/50 dark:bg-[#FFD700]/10 px-1.5 py-0.5 rounded w-fit">
                                            COM-{purchase.id?.slice(-6).toUpperCase()}
                                        </span>
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                            {formatDate(purchase.date)}
                                        </span>
                                    </div>
                                    <span className={clsx(
                                        "px-2 py-1 rounded-xl text-[9px] font-bold uppercase border",
                                        purchase.status === 'RECEIVED'
                                            ? "bg-green-100 dark:bg-green-900/20 text-green-600 border-green-200 dark:border-green-900/30"
                                            : "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 border-yellow-200 dark:border-yellow-900/30"
                                    )}>
                                        {purchase.status === 'RECEIVED' ? 'Recibida' : 'Pendiente'}
                                    </span>
                                </div>
                                <p className="font-bold text-slate-900 dark:text-white text-sm wrap-break-word mb-2">
                                    {purchase.supplierName}
                                </p>
                                {purchase.paymentMethod && (
                                    <div className="flex flex-wrap items-center gap-1 mb-2">
                                        <span className={clsx(
                                            'inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border',
                                            purchase.paymentMethod === 'CREDITO'
                                                ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                                                : purchase.paymentMethod === 'EFECTIVO'
                                                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                                    : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                        )}>
                                            {purchase.paymentMethod === 'CREDITO' ? 'Crédito' : purchase.paymentMethod}
                                        </span>
                                        {purchase.paymentMethod === 'CREDITO' && purchase.id && (() => {
                                            const paid = paidPerPurchase.get(purchase.id) ?? 0;
                                            const total = Number(purchase.total) || 0;
                                            if (paid >= total - 0.01 && total > 0) {
                                                return (
                                                    <span className="inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                                        Pagada
                                                    </span>
                                                );
                                            }
                                            if (paid > 0.01) {
                                                return (
                                                    <span className="inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-amber-500/10 text-amber-600 border-amber-500/20" title={`Pagado Bs. ${paid.toFixed(2)} de Bs. ${total.toFixed(2)}`}>
                                                        Parcial
                                                    </span>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                )}
                                <div className="flex justify-between items-end border-t border-slate-100 dark:border-white/10 pt-2">
                                    <div>
                                        <span className="text-[9px] text-slate-400 uppercase">Total</span>
                                        <p className="text-base font-bold text-slate-900 dark:text-white">Bs. {purchase.total.toFixed(2)}</p>
                                    </div>
                                    <button className="p-2 bg-white dark:bg-white/5 rounded-xl shadow-sm border border-slate-100 dark:border-gray-600 text-slate-400 dark:text-slate-300">
                                        <Eye size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop Table - High Density */}
                    <table className="hidden md:table w-full text-sm text-left border-separate border-spacing-0">
                        <thead className="bg-slate-50 dark:bg-[#020617] border-b border-slate-200 dark:border-white/10 transition-colors z-20 sticky top-0">
                            <tr className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                                <th className="px-6 py-4">Código</th>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Proveedor</th>
                                <th className="px-6 py-4 text-center">Productos</th>
                                <th className="px-6 py-4 text-right">Total (Bs)</th>
                                <th className="px-6 py-4 text-center">Estado</th>
                                <th className="px-6 py-4">Responsable</th>
                                <th className="px-6 py-4 text-right pr-6 min-w-20"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="py-20 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-yellow-500" />
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargando...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedPurchases.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-32 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <Truck size={64} strokeWidth={0.5} className="opacity-20 translate-y-4 text-slate-400" />
                                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-300 dark:text-slate-600">Sin registros</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedPurchases.map((purchase) => (
                                    <tr key={purchase.id} className="hover:bg-slate-50/50 dark:hover:bg-white/2 transition-all group cursor-pointer" onClick={() => setSelectedPurchase(purchase)}>
                                        <td className="px-6 py-4">
                                            <span className="font-mono text-[11px] font-bold text-yellow-600 dark:text-[#FFD700] bg-yellow-500/5 px-2 py-1 rounded-xl border border-yellow-500/10 select-all">
                                                COM-{purchase.id?.slice(-6).toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-[10px] font-black text-slate-900 dark:text-white uppercase">
                                                {formatDate(purchase.date)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-black text-slate-900 dark:text-slate-200 text-[11px] uppercase tracking-tight wrap-break-word group-hover:text-yellow-500 transition-colors">
                                                {purchase.supplierName}
                                            </div>
                                            {purchase.paymentMethod && (
                                                <div className="flex flex-wrap items-center gap-1 mt-1">
                                                    <span className={clsx(
                                                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border',
                                                        purchase.paymentMethod === 'CREDITO'
                                                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                                            : purchase.paymentMethod === 'EFECTIVO'
                                                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                                                    )}>
                                                        {purchase.paymentMethod === 'CREDITO' ? 'Crédito' : purchase.paymentMethod}
                                                    </span>
                                                    {purchase.paymentMethod === 'CREDITO' && purchase.id && (() => {
                                                        const paid = paidPerPurchase.get(purchase.id) ?? 0;
                                                        const total = Number(purchase.total) || 0;
                                                        if (paid >= total - 0.01 && total > 0) {
                                                            return (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                                                                    Pagada
                                                                </span>
                                                            );
                                                        }
                                                        if (paid > 0.01) {
                                                            return (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" title={`Pagado Bs. ${paid.toFixed(2)} de Bs. ${total.toFixed(2)}`}>
                                                                    Parcial
                                                                </span>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-[10px] font-black text-slate-600 dark:text-slate-400">
                                                {purchase.itemCount ?? '—'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-black text-slate-900 dark:text-white text-sm tabular-nums tracking-tighter">
                                            {purchase.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={clsx(
                                                "px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border shadow-sm",
                                                purchase.status === 'RECEIVED'
                                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                                    : "bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20"
                                            )}>
                                                {purchase.status === 'RECEIVED' ? 'Recibida' : 'Pendiente'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                                {formatUserName(purchase.usuarioNombre) || 'SISTEMA'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right pr-6">
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setSelectedPurchase(purchase); }}
                                                    className="w-9 h-9 flex items-center justify-center bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black rounded-xl shadow-lg shadow-black/10 transition-transform active:scale-90"
                                                    title="Ver detalles"
                                                >
                                                    <Eye size={16} strokeWidth={2.5} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>


                </div>

                <TableFooter
                    totalItems={filteredPurchases.length}
                    itemsPerPage={itemsPerPage}
                    onChangeItemsPerPage={setItemsPerPage}
                    currentPage={currentPage}
                    onChangePage={setCurrentPage}
                    totalPages={totalPages}
                    label="Compras"
                />
            </div>

            {/* Detail Modal */}
            {selectedPurchase && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-modal flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-6 animate-in fade-in duration-300" onClick={() => setSelectedPurchase(null)}>
                    <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-[#111827] rounded-t-3xl md:rounded-3xl w-full h-[90vh] md:h-auto md:max-w-2xl shadow-2xl overflow-hidden border-t md:border border-slate-200 dark:border-white/10 flex flex-col">
                        <div className="p-6 border-b border-slate-200 dark:border-white/10 flex justify-between items-center bg-slate-50 dark:bg-black/20">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-3">
                                    <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-tight text-lg">
                                        COM-{selectedPurchase.id?.slice(-6).toUpperCase()}
                                    </h3>
                                    <span className={clsx(
                                        "px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border",
                                        selectedPurchase.status === 'RECEIVED'
                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                            : "bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20"
                                    )}>
                                        {selectedPurchase.status === 'RECEIVED' ? 'RECIBIDA' : 'PENDIENTE'}
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => setSelectedPurchase(null)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all text-slate-400">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10">
                                <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Proveedor</div>
                                <div className="font-black text-slate-900 dark:text-white text-xl uppercase tracking-tight mb-3">{selectedPurchase.supplierName}</div>
                                <div className="grid grid-cols-2 gap-4 text-xs">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Fecha y hora</span>
                                        <span className="font-bold text-slate-600 dark:text-slate-300">{formatDateTime(selectedPurchase.date)}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Responsable</span>
                                        <span className="font-bold text-slate-600 dark:text-slate-300">{formatUserName(selectedPurchase.usuarioNombre) || 'SISTEMA'}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Sucursal registro</span>
                                        <span className="font-bold text-slate-600 dark:text-slate-300 truncate">{branches.find(b => b.id === selectedPurchase.branchId)?.name || selectedPurchase.branchId || '—'}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Productos</span>
                                        <span className="font-bold text-slate-600 dark:text-slate-300">{selectedPurchase.itemCount ?? selectedPurchaseItems.length}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Bloque de pago detallado */}
                            <div className="p-5 rounded-2xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Forma de pago</span>
                                    <span className={clsx(
                                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border',
                                        selectedPurchase.paymentMethod === 'CREDITO'
                                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                            : selectedPurchase.paymentMethod === 'EFECTIVO'
                                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                                    )}>
                                        {selectedPurchase.paymentMethod === 'CREDITO' ? 'Crédito a proveedor'
                                            : selectedPurchase.paymentMethod === 'EFECTIVO' ? 'Efectivo (descontó caja)'
                                                : selectedPurchase.paymentMethod === 'TRANSFERENCIA' ? 'Transferencia bancaria'
                                                    : selectedPurchase.paymentMethod === 'QR' ? 'Pago QR'
                                                        : 'Sin método'}
                                    </span>
                                </div>

                                {selectedPurchase.paymentReference && (
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Referencia / comprobante</span>
                                        <span className="font-mono font-bold text-slate-700 dark:text-slate-200 select-all">{selectedPurchase.paymentReference}</span>
                                    </div>
                                )}

                                {selectedPurchase.dueDate && (
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Vence</span>
                                        <span className="font-bold text-amber-600 dark:text-amber-400">{formatDate(selectedPurchase.dueDate)}</span>
                                    </div>
                                )}

                                {selectedPurchase.paymentMethod === 'CREDITO' && selectedPurchase.id && (() => {
                                    const paid = paidPerPurchase.get(selectedPurchase.id) ?? 0;
                                    const total = Number(selectedPurchase.total) || 0;
                                    const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
                                    const isFull = paid >= total - 0.01 && total > 0;
                                    const isPartial = paid > 0.01 && !isFull;
                                    return (
                                        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/10">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Pagado a esta compra (FIFO)</span>
                                                <span className={clsx('font-black tabular-nums',
                                                    isFull ? 'text-emerald-600 dark:text-emerald-400'
                                                        : isPartial ? 'text-amber-600 dark:text-amber-400'
                                                            : 'text-rose-600 dark:text-rose-400')}>
                                                    Bs. {paid.toFixed(2)} / {total.toFixed(2)}
                                                </span>
                                            </div>
                                            <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                                                <div className={clsx('h-full transition-all',
                                                    isFull ? 'bg-emerald-500' : isPartial ? 'bg-amber-500' : 'bg-rose-500')}
                                                    style={{ width: `${pct}%` }} />
                                            </div>
                                            <p className="text-[9px] text-slate-400 dark:text-slate-500 italic leading-relaxed">
                                                Los pagos al proveedor se asignan en orden a las compras más antiguas primero (FIFO). El saldo total de la cuenta es Bs. {(accountSaldoMap.get(selectedPurchase.supplierId || '') ?? 0).toFixed(2)}.
                                             </p>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between px-1">
                                    <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Productos</div>
                                    <span className="text-[10px] font-bold text-slate-400">{selectedPurchaseItems.length} items</span>
                                </div>
                                <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl overflow-x-auto relative min-h-20">
                                    {loadingItems && (
                                        <div className="absolute inset-0 bg-white/50 dark:bg-[#111827]/50 z-10 flex items-center justify-center">
                                            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    )}
                                    <table className="w-full min-w-[360px] text-sm border-separate border-spacing-0">
                                        <thead className="bg-slate-50/80 dark:bg-white/5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                            <tr>
                                                <th className="p-3 text-left">Producto</th>
                                                <th className="p-3 text-center">Cant.</th>
                                                <th className="p-3 text-right pr-4">Costo Unit.</th>
                                                <th className="p-3 text-center">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                            {selectedPurchaseItems.length === 0 && !loadingItems && (
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-8 text-center text-[10px] font-bold text-slate-400">Sin productos registrados</td>
                                                </tr>
                                            )}
                                            {selectedPurchaseItems.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-white/2 transition-colors">
                                                    <td className="p-3">
                                                        <div className="flex flex-col gap-0.5">
                                                            <p className="font-bold text-slate-900 dark:text-white text-[11px] uppercase tracking-tight">
                                                                {item?.productName || 'N/A'}
                                                            </p>
                                                            {item?.returnedQuantity && item.returnedQuantity > 0 ? (
                                                                <p className="text-[9px] font-black text-amber-500 uppercase mt-0.5">Devolución: {item.returnedQuantity}</p>
                                                            ) : (
                                                                <p className="text-[9px] font-mono text-slate-400 dark:text-slate-500">
                                                                    {item?.productCode || 'S/C'}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className={clsx("text-[11px] font-bold bg-blue-500/10 px-2 py-0.5 rounded", (item?.quantity || 0) === (item?.returnedQuantity || 0) ? "text-slate-400" : "text-blue-600 dark:text-blue-400")}>
                                                            {(item?.quantity || 0) - (item?.returnedQuantity || 0)}
                                                        </span>
                                                        {item?.returnedQuantity && item.returnedQuantity > 0 ? (
                                                            <span className="block text-[10px] text-slate-400 line-through mt-1">{item.quantity}</span>
                                                        ) : null}
                                                    </td>
                                                    <td className="p-3 text-right pr-4 font-mono font-bold text-[11px] text-slate-600 dark:text-slate-300">
                                                        Bs. {item?.cost?.toFixed(2) ?? '0.00'}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        {selectedPurchase.status !== 'RETURNED' && ((item?.quantity || 0) - (item?.returnedQuantity || 0) > 0) && (
                                                            <button 
                                                                onClick={() => promptReturnItem(selectedPurchase, idx)} 
                                                                className="px-3 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-amber-100 dark:hover:bg-amber-500/20 hover:scale-105 transition-all active:scale-95"
                                                                title="Devolver Producto al Proveedor"
                                                            >
                                                                Devolver
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50/80 dark:bg-white/3 border-t border-slate-200 dark:border-white/10">
                                            <tr>
                                                <td colSpan={2} className="p-4 text-right text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total</td>
                                                <td colSpan={2} className="p-4 text-right pr-4 text-lg font-black text-slate-900 dark:text-white tabular-nums">
                                                    <span className="text-xs mr-1 text-slate-400">Bs</span>
                                                    {selectedPurchase.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>

                            {selectedPurchase.notes && (
                                <div className="p-4 bg-amber-50 dark:bg-amber-500/5 rounded-xl border border-amber-200 dark:border-amber-500/10">
                                    <p className="text-[9px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest mb-1">Notas</p>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 italic">{selectedPurchase.notes}</p>
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 flex gap-2">
                            <button
                                onClick={() => handlePrintPurchase(selectedPurchase)}
                                disabled={generatingPdf || loadingItems}
                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-900 dark:bg-[#FFD700] hover:bg-slate-700 dark:hover:bg-yellow-400 text-white dark:text-black rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <FileText size={14} />
                                {generatingPdf ? 'Generando PDF…' : 'Descargar PDF'}
                            </button>
                            <button
                                onClick={() => setSelectedPurchase(null)}
                                className="flex-1 py-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
        
            {/* Void / Return Modal - Portal */}
            {voidModal.isOpen && voidModal.purchase && typeof document !== 'undefined' && createPortal(
                <div onClick={closeVoidModal} className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in zoom-in-95 duration-200">
                    <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-background rounded-[28px] w-full max-w-sm shadow-[0_32px_128px_-20px_rgba(0,0,0,0.8)] overflow-hidden border border-white/10 flex flex-col scale-in-center relative">
                        <button onClick={closeVoidModal} className="absolute top-3 right-3 p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl transition-all z-10"><X size={16} className="text-slate-400" /></button>
                        <div className="bg-amber-500/5 p-8 flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-6 shadow-2xl rotate-3 bg-amber-500 text-white"><AlertTriangle size={32} /></div>
                            <h3 className="text-xl font-black uppercase tracking-tighter mb-2 text-amber-500">Reversión de Compra</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium px-4 leading-relaxed">Se registrará una devolución al proveedor. Esta acción ajustará el inventario y generará saldo a favor.</p>
                        </div>
                        <div className="p-8 space-y-4">
                            {voidModal.itemIndex !== undefined && selectedPurchaseItems?.[voidModal.itemIndex] && (
                                <div className="mb-4">
                                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2.5 px-1">Cantidad a devolver <span className="text-rose-500">*</span></label>
                                    <input 
                                        type="number" 
                                        min={1} 
                                        max={(selectedPurchaseItems?.[voidModal.itemIndex]?.quantity || 0) - (selectedPurchaseItems?.[voidModal.itemIndex]?.returnedQuantity || 0)} 
                                        value={voidItemQty}
                                        onChange={(e) => {
                                            const max = (selectedPurchaseItems?.[voidModal.itemIndex!]?.quantity || 0) - (selectedPurchaseItems?.[voidModal.itemIndex!]?.returnedQuantity || 0);
                                            let val = parseInt(e.target.value);
                                            if (isNaN(val)) val = 1;
                                            if (val < 1) val = 1;
                                            if (val > max) val = max;
                                            setVoidItemQty(val);
                                        }}
                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/10 rounded-2xl p-4 text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                                    />
                                    <p className="text-[10px] text-slate-500 mt-2 px-1">Máximo disponible: {(selectedPurchaseItems?.[voidModal.itemIndex]?.quantity || 0) - (selectedPurchaseItems?.[voidModal.itemIndex]?.returnedQuantity || 0)}</p>
                                </div>
                            )}
                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2.5 px-1">Motivo de Devolución <span className="text-rose-500">*</span></label>
                            <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Indique el motivo de la devolución..." className="w-full bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/10 rounded-2xl p-4 text-xs dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 resize-none h-28 outline-none transition-all" autoFocus />
                        </div>
                        <div className="p-6 pt-0 flex gap-3">
                            <button onClick={closeVoidModal} className="flex-1 py-4 bg-slate-100 dark:bg-white/5 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
                            <button onClick={confirmVoidAction} disabled={!voidReason.trim() || isVoiding} className="flex-[1.5] py-4 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-30 flex justify-center items-center shadow-xl bg-amber-500 shadow-amber-500/20">Ejecutar</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}


