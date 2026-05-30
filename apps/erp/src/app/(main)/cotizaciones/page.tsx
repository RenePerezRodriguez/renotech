'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePagination } from '@/hooks/usePagination';
import { useModalDismiss } from '@/hooks/useModalDismiss';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { QuotationService } from '@/services/QuotationService';
import { ensureDate, formatDate, formatTime } from '@/utils/dateHelpers';
import { Timestamp, FieldValue } from 'firebase/firestore';
import { Quotation, Product, QuotationItem } from '@/types';
import { useTransactionItems } from '@/hooks/useTransactionItems';
import { Eye, Printer, ShoppingCart, Plus, Download, TrendingUp, Clock, AlertTriangle, CheckCircle, Trash2, ShoppingBag, SearchX, User, X } from 'lucide-react';
import { PrintService } from '@/services/PrintService';
import clsx from 'clsx';
import { usePosStore } from '@/store/posStore';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { toast } from 'sonner';
import { useProducts } from '@/hooks/useProducts';
import { startOfDay, endOfDay, localDateStr } from '@/lib/utils';
import { downloadCSV } from '@/utils/csvExport';
import { BranchService } from '@/services/BranchService';
import { Branch } from '@/types';
import { isStaff as isStaffRole } from '@/utils/roles';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

// Suite Pro v4.0 Components
import ModuleHeader from '@/components/common/ModuleHeader';
import KpiCard from '@/components/common/KpiCard';
import FilterBar from '@/components/common/FilterBar';
import TableFooter from '@/components/common/TableFooter';

export default function QuotationsPage() {
    const router = useRouter();
    const { currentBranch, isConsolidatedView, loading: branchLoading } = useBranch();
    const { isOnline } = useNetworkStatus();
    const { products } = useProducts();
    const { user: currentUser, role: userRole } = useAuth();
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
    const [voidModal, setVoidModal] = useState<{ isOpen: boolean, itemIndex: number | null, quotation: Quotation | null }>({ isOpen: false, itemIndex: null, quotation: null });
    const [cancelModal, setCancelModal] = useState<{ isOpen: boolean, quotation: Quotation | null }>({ isOpen: false, quotation: null });
    const [cancelReason, setCancelReason] = useState('');
    const [isVoiding, setIsVoiding] = useState(false);
    const closeCancelModal = useCallback(() => { setCancelModal({ isOpen: false, quotation: null }); setCancelReason(''); }, []);
    const closeVoidModal = useCallback(() => setVoidModal({ isOpen: false, itemIndex: null, quotation: null }), []);
    const cancelDismiss = useModalDismiss(cancelModal.isOpen, closeCancelModal, { disabled: isVoiding });
    const voidDismiss = useModalDismiss(voidModal.isOpen, closeVoidModal, { disabled: isVoiding });
    const { items: selectedQuotationItems, loading: loadingItems, refetch: refetchItems } = useTransactionItems<QuotationItem>(selectedQuotation?.id, 'cotizaciones');

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (cancelModal.isOpen) {
                setCancelModal({ isOpen: false, quotation: null });
                setCancelReason('');
                return;
            }
            if (voidModal.isOpen) {
                setVoidModal({ isOpen: false, itemIndex: null, quotation: null });
                return;
            }
            setSelectedQuotation(null);
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [cancelModal.isOpen, voidModal.isOpen]);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED'>('ALL');
    const [branchFilter, setBranchFilter] = useState('ALL');
    const [sellerFilter, setSellerFilter] = useState('Todos');

    // Helper: Estado de Vencimiento
    const getExpirationStatus = (validUntil: Date | Timestamp | FieldValue | string | null | undefined) => {
        const date = ensureDate(validUntil);
        const now = new Date();
        const diffMs = date.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffMs < 0) return { label: 'Vencida', color: 'text-red-600 bg-red-50 border-red-100 dark:bg-red-900/20 dark:text-red-400', icon: <X size={10} /> };
        if (diffHours < 48) return { label: 'Por Vencer', color: 'text-amber-600 bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400', icon: <Clock size={10} /> };
        return { label: 'Vigente', color: 'text-green-600 bg-green-50 border-green-100 dark:bg-green-900/20 dark:text-green-400', icon: <CheckCircle size={10} /> };
    };

    // List of unique sellers
    const sellersList = useMemo(() => {
        const usersMap = new Map<string, string>();
        quotations.forEach(q => {
            const userId = q.usuarioEmail || q.usuarioId;
            if (userId && !usersMap.has(userId)) {
                usersMap.set(userId, (q.usuarioNombre || '—').toUpperCase());
            }
        });
        return Array.from(usersMap.entries()).map(([id, name]) => ({ id, name }));
    }, [quotations]);

    const loadData = useCallback(async () => {
        if (branchLoading) return;
        setLoading(true);
        try {
            if (isConsolidatedView) {
                const bData = await BranchService.getAll();
                setBranches(bData);
            }

            let data: Quotation[] = [];
            const branchId = isConsolidatedView ? undefined : currentBranch?.id;

            if (isStaffRole(userRole)) {
                data = await QuotationService.getQuotations(branchId);
            } else if (currentUser) {
                data = await QuotationService.getQuotationsByClient(currentUser.uid, branchId);
            }
            setQuotations(data);
        } catch (error) {
            console.error("Error loading data:", error);
        } finally {
            setLoading(false);
        }
    }, [userRole, currentUser, currentBranch?.id, isConsolidatedView, branchLoading]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handlePrint = async (quotation: Quotation) => {
        toast.promise(
            PrintService.printDocument(quotation, 'QUOTATION', quotation.branchId),
            {
                loading: 'Generando Documento...',
                success: 'Documento listo para imprimir',
                error: 'Error al generar el documento PDF'
            }
        );
    };

    const handleLoadItems = async (quotation: Quotation) => {
        if (!products || products.length === 0) {
            toast.error('Cargando catálogo de productos...');
            return;
        }

        const useCachedItems = selectedQuotation?.id === quotation.id && selectedQuotationItems.length > 0;
        let itemsToLoad = useCachedItems ? selectedQuotationItems : [];

        if (itemsToLoad.length === 0) {
            toast.loading('Recuperando ítems...', { id: 'loading-pos' });
            itemsToLoad = await QuotationService.getQuotationItems(quotation.id!);
            toast.dismiss('loading-pos');
        }

        const itemsWithProducts = itemsToLoad
            .filter(item => !item.isVoided)
            .map(item => {
                const product = products.find(p => p.id === item.productId);
                return {
                    ...item,
                    product: product || null
                };
            }).filter(item => item.product !== null);

        if (itemsWithProducts.length === 0) {
            toast.error('No se encontraron productos válidos en esta cotización');
            return;
        }

        usePosStore.getState().loadFromQuotation(
            itemsWithProducts as (QuotationItem & { product: Product })[],
            quotation.cliente,
            !!quotation.isTaxed,
            quotation.id
        );

        toast.success('Items cargados al POS');
        router.push('/punto-de-venta');
    };

    const promptVoidItem = (quotation: Quotation, itemIndex: number) => {
        setVoidModal({ isOpen: true, itemIndex, quotation });
    };

    const confirmVoidItem = async () => {
        const { quotation, itemIndex } = voidModal;
        if (!quotation?.id || itemIndex === null) return;

        const itemId = selectedQuotationItems[itemIndex]?.id;
        if (!itemId) {
            toast.error("No se pudo identificar el producto. Recarga la página e intenta nuevamente.");
            return;
        }

        setIsVoiding(true);
        try {
            const adminInfo = currentUser ? { uid: currentUser.uid, email: currentUser.email || '', branchId: currentBranch?.id } : undefined;
            await QuotationService.voidQuotationItem(quotation.id, itemId, adminInfo);
            await loadData();
            // Refetch items via hook
            await refetchItems();
            toast.success('Ítem removido correctamente');
            setVoidModal({ isOpen: false, itemIndex: null, quotation: null });
        } catch (e) {
            console.error(e);
            toast.error('Error al remover el ítem');
        } finally {
            setIsVoiding(false);
        }
    };

    const handleCancelQuotation = async () => {
        const { quotation } = cancelModal;
        if (!quotation?.id) return;

        setIsVoiding(true);
        try {
            const adminInfo = currentUser ? { uid: currentUser.uid, email: currentUser.email || '', branchId: currentBranch?.id } : undefined;
            await QuotationService.updateQuotationStatus(quotation.id, 'REJECTED', cancelReason, adminInfo);
            await loadData();
            setSelectedQuotation(null);
            setCancelModal({ isOpen: false, quotation: null });
            setCancelReason('');
            toast.success('Cotización anulada correctamente');
        } catch (e) {
            console.error(e);
            toast.error('Error al anular la cotización');
        } finally {
            setIsVoiding(false);
        }
    };

    const filteredQuotations = useMemo(() => {
        return quotations.filter(q => {
            const matchesSearch = !searchTerm ||
                (q.cliente?.razonSocial || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (q.cliente?.nit || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (q.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                `COT-${q.id?.slice(-8).toUpperCase()}`.toLowerCase().includes(searchTerm.toLowerCase());

            const qDate = ensureDate(q.fecha);
            const matchesStart = !startDate || qDate >= startOfDay(startDate);
            const matchesEnd = !endDate || qDate <= endOfDay(endDate);
            const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
            const matchesBranch = branchFilter === 'ALL' || q.branchId === branchFilter;
            const matchesSeller = sellerFilter === 'Todos' || q.usuarioEmail === sellerFilter || q.usuarioId === sellerFilter;

            return matchesSearch && matchesStart && matchesEnd && matchesStatus && matchesBranch && matchesSeller;
        });
    }, [quotations, searchTerm, startDate, endDate, statusFilter, branchFilter, sellerFilter]);

    // Estadísticas — siempre sobre el universo completo (sin filtro de status)
    const stats = useMemo(() => {
        const allForStats = quotations.filter(q => {
            if (branchFilter !== 'ALL' && q.branchId !== branchFilter) return false;
            if (sellerFilter !== 'ALL' && q.usuarioEmail !== sellerFilter && q.usuarioId !== sellerFilter) return false;
            return true;
        });
        const pending = allForStats.filter(q => q.status === 'PENDING');
        const converted = allForStats.filter(q => q.status === 'CONVERTED');

        const totalAmount = pending.reduce((acc, q) => acc + (q.total ?? 0), 0);
        const convertedAmount = converted.reduce((acc, q) => acc + (q.total ?? 0), 0);
        const conversionRate = (pending.length + converted.length) > 0
            ? (converted.length / (pending.length + converted.length)) * 100
            : 0;

        const expiringSoon = pending.filter(q => {
            const date = ensureDate(q.validUntil);
            const diff = date.getTime() - new Date().getTime();
            return diff > 0 && diff < (48 * 60 * 60 * 1000);
        }).length;

        return { totalAmount, convertedAmount, conversionRate, expiringSoon };
    }, [quotations, branchFilter, sellerFilter]);

    const handleExport = () => {
        const headers = [
            'ID',
            'FECHA',
            'CLIENTE',
            'NIT/CI',
            'TELÉFONO',
            'SUBTOTAL',
            'TOTAL',
            'ESTADO',
            'VENCIMIENTO',
            'SUCURSAL',
            'VENDEDOR',
            'NOTAS'
        ];

        const rows = filteredQuotations.map(q => {
            const qDate = ensureDate(q.fecha);
            const vDate = ensureDate(q.validUntil);

            const formatDate = (date: Date) => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            };

            const translateStatus = (status: string) => {
                switch (status) {
                    case 'PENDING': return 'PENDIENTE';
                    case 'CONVERTED': return 'VENDIDA';
                    case 'REJECTED': return 'ANULADA';
                    case 'EXPIRED': return 'VENCIDA';
                    case 'ACCEPTED': return 'ACEPTADA';
                    default: return status;
                }
            };

            const branchName = isConsolidatedView
                ? branches.find(b => b.id === q.branchId)?.name || 'Central'
                : currentBranch?.name || 'Central';
            const sellerName = q.usuarioNombre || 'SISTEMA';

            return [
                `COT-${q.id?.slice(-8).toUpperCase()}`,
                formatDate(qDate),
                q.cliente?.razonSocial || 'CLIENTE GENERAL',
                q.cliente?.nit || 'S/N',
                q.cliente?.telefono || '---',
                (q.subtotal ?? 0).toFixed(2),
                (q.total ?? 0).toFixed(2),
                translateStatus(q.status),
                formatDate(vDate),
                branchName,
                sellerName.toUpperCase(),
                (q.notes || '').replace(/[\n\r;]/g, ' ')
            ];
        });
        downloadCSV(`cotizaciones_${localDateStr()}`, headers, rows);
        toast.success('Reporte exportado correctamente');
    };

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedQuotations } = usePagination(filteredQuotations);

    if (loading) return <div className="p-8 text-center uppercase font-black text-slate-400 animate-pulse">Cargando Cotizaciones...</div>;

    return (
        <div className="flex-1 min-w-0 w-full max-w-full p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 bg-slate-50 dark:bg-background">
            {/* Header Area - Suite Pro Standard */}
            <ModuleHeader
                title="Historial de Cotizaciones"
                subtitle="Gestión Operativa de Proformas y Presupuestos"
                icon={ShoppingBag}
                actions={[
                    {
                        label: "Exportar CSV",
                        onClick: handleExport,
                        icon: Download,
                        variant: 'secondary' as const
                    },
                    {
                        label: "Nueva Proforma",
                        onClick: () => router.push('/cotizaciones/nueva'),
                        icon: Plus,
                        variant: 'primary' as const,
                        dataTourId: 'cotizaciones-new-btn'
                    }
                ]}
            />

            {/* KPI Cards - Technical Command Center Style (Suite Pro Standard) */}
            <div data-tour="cotizaciones-kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    label="Saldo Pendiente"
                    value={stats.totalAmount}
                    prefix="Bs"
                    icon={TrendingUp}
                    progress={70}
                    color="gold"
                    highlight
                />
                <KpiCard
                    label="Ventas Cerradas"
                    value={stats.convertedAmount}
                    prefix="Bs"
                    icon={ShoppingBag}
                    progress={100}
                    color="blue"
                />
                <KpiCard
                    label="Ratio de Éxito"
                    value={`${stats.conversionRate.toFixed(1)}%`}
                    icon={CheckCircle}
                    progress={stats.conversionRate}
                    color="green"
                    secondaryLabel="Cierre"
                />
                <KpiCard
                    label="Próximos Vencimientos"
                    value={stats.expiringSoon}
                    icon={Clock}
                    progress={stats.expiringSoon > 0 ? 100 : 0}
                    color={stats.expiringSoon > 0 ? "red" : "slate"}
                    secondaryLabel="Documentos"
                />
            </div>

            {/* Filter Toolbar - High Density Suite Pro Standard */}
            <div data-tour="cotizaciones-filters">
                <FilterBar
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Buscar por cliente, nit o código de proforma..."
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
                            onChange: (val) => setStatusFilter(val as 'ALL' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED'),
                            options: [
                                { label: 'Pendiente', value: 'PENDING' },
                                { label: 'Vendida', value: 'CONVERTED' },
                                { label: 'Anulada', value: 'REJECTED' }
                            ]
                        },
                        ...(isConsolidatedView && userRole === 'GERENTE' ? [
                            {
                                id: 'branch',
                                label: 'Sede',
                                value: branchFilter,
                                onChange: setBranchFilter,
                                options: branches.map(b => ({ label: b.name, value: b.id || '' }))
                            },
                            {
                                id: 'seller',
                                label: 'Agente',
                                value: sellerFilter,
                                onChange: setSellerFilter,
                                options: sellersList.map(u => ({ label: u.name, value: u.id }))
                            }
                        ] : [])
                    ]}
                    onClear={() => {
                        setSearchTerm('');
                        setStartDate('');
                        setEndDate('');
                        setStatusFilter('ALL');
                        setBranchFilter('ALL');
                        setSellerFilter('Todos');
                    }}
                    isDirty={searchTerm !== '' || startDate !== '' || endDate !== '' || statusFilter !== 'ALL' || branchFilter !== 'ALL' || sellerFilter !== 'Todos'}
                />
            </div>

            {/* Table / List Container - Suite Pro Standard */}
            <div data-tour="cotizaciones-table" className="bg-white dark:bg-black/20 border border-slate-100 dark:border-white/10 rounded-3xl shadow-xl flex flex-col overflow-hidden transition-all duration-500">
                {/* Top Pagination Bar */}
                <TableFooter
                    totalItems={filteredQuotations.length}
                    itemsPerPage={itemsPerPage}
                    onChangeItemsPerPage={setItemsPerPage}
                    currentPage={currentPage}
                    onChangePage={setCurrentPage}
                    totalPages={totalPages}
                    label="Registros Técnicos"
                    className="border-b border-t-0 bg-white/50 dark:bg-black/10"
                />
                <div className="p-4 md:p-0">
                    {/* Mobile Card View - Suite Pro Technical Standard */}
                    <div className="lg:hidden space-y-4">
                        {paginatedQuotations.length === 0 ? (
                            <div className="py-20 flex flex-col items-center justify-center text-center px-6">
                                <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-3xl flex items-center justify-center mb-6 text-slate-300 group-hover:scale-110 transition-transform">
                                    <SearchX size={40} strokeWidth={1.5} />
                                </div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Sin Coincidencias</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium max-w-60 leading-relaxed mb-8">
                                    No encontramos proformas que coincidan con los criterios técnicos aplicados.
                                </p>
                            </div>
                        ) : (
                            paginatedQuotations.map((q) => {
                                const qDate = ensureDate(q.fecha);
                                return (
                                    <div 
                                        key={q.id} 
                                        onClick={() => setSelectedQuotation(q)} 
                                        className="bg-white dark:bg-black/30 rounded-3xl p-5 border border-slate-100 dark:border-white/10 shadow-xl active:scale-[0.98] transition-all group"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                                                    <span className="font-mono text-[11px] font-black text-yellow-600 dark:text-[#FFD700] tracking-tighter">
                                                        COT-{q.id?.slice(-8).toUpperCase()}
                                                    </span>
                                                </div>
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                    {formatDate(qDate)}
                                                </span>
                                            </div>
                                            <span className={clsx(
                                                "px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border shadow-sm",
                                                q.status === 'CONVERTED' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                                    q.status === 'REJECTED' ? "bg-rose-500/10 text-rose-500 border-rose-500/20" :
                                                        "bg-slate-500/10 text-slate-400 border-slate-500/20"
                                            )}>
                                                {q.status === 'CONVERTED' ? 'VENDIDA' : q.status === 'REJECTED' ? 'ANULADA' : q.status === 'PENDING' ? 'PENDIENTE' : q.status}
                                            </span>
                                        </div>
                                        <div className="space-y-2 mb-5">
                                            <p className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight wrap-break-word group-hover:text-yellow-500 transition-colors">
                                                {q.cliente?.razonSocial || 'CLIENTE GENERAL'}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-3">
                                                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">NIT</span>
                                                    <span className="text-[9px] font-bold text-slate-700 dark:text-slate-300 font-mono">{q.cliente?.nit || 'S/N'}</span>
                                                </div>
                                                <div className={clsx("flex items-center gap-1.5 px-2 py-1 rounded-xl border shadow-sm", getExpirationStatus(q.validUntil).color)}>
                                                    <span className="text-[9px] font-black uppercase tracking-tight">{getExpirationStatus(q.validUntil).label}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-white/10">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">Importe Total</span>
                                                <span className="text-xl font-black text-slate-900 dark:text-white tracking-widest">
                                                    <span className="text-xs mr-1 opacity-40">Bs</span>
                                                    {q.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                            <div className="h-10 w-10 bg-slate-900 dark:bg-white/5 rounded-xl flex items-center justify-center text-white dark:text-[#FFD700] shadow-lg border border-white/5">
                                                <Eye size={16} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Desktop Table — visible lg+ */}
                    <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-black/40 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] sticky top-0 z-10 border-b border-slate-100 dark:border-white/10 transition-colors">
                            <tr>
                                <th className="px-6 py-4">Proforma ID</th>
                                <th className="px-6 py-4 hidden xl:table-cell">Registro</th>
                                <th className="px-6 py-4">Cliente</th>
                                {isConsolidatedView && <th className="px-4 py-4 text-center hidden xl:table-cell">Sucursal</th>}
                                <th className="px-4 py-4 text-center hidden xl:table-cell">Vencimiento</th>
                                <th className="px-4 py-4 text-right">Total Bs</th>
                                <th className="px-4 py-4 text-center">Estado</th>
                                <th className="px-6 py-4 text-center">Gestión</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-black/10 transition-colors">
                            {paginatedQuotations.length === 0 ? (
                                <tr>
                                    <td colSpan={isConsolidatedView ? 8 : 7} className="py-40 text-center">
                                        <div className="space-y-6">
                                            <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-full text-slate-300">
                                                <SearchX size={40} />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">Cero Coincidencias</h3>
                                                <p className="text-xs text-slate-400 mt-1 font-medium tracking-tight">No se han encontrado registros para los parámetros de auditoría actuales.</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedQuotations.map((q) => {
                                    const qDate = ensureDate(q.fecha);
                                    return (
                                        <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-white/3 transition-all group/row cursor-pointer" onClick={() => setSelectedQuotation(q)}>
                                            <td className="px-6 py-5">
                                                <span className="font-mono text-[11px] font-black text-yellow-600 dark:text-[#FFD700] bg-yellow-500/10 px-2 py-1 rounded-xl border border-yellow-500/20 shadow-sm">
                                                    COT-{q.id?.slice(-8).toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 whitespace-nowrap hidden xl:table-cell">
                                                <div className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                                                    {formatDate(qDate)}
                                                </div>
                                                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest opacity-60">
                                                    {formatTime(qDate)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="font-black text-slate-900 dark:text-white text-[11px] wrap-break-word uppercase tracking-tight group-hover/row:text-yellow-500 transition-colors">
                                                    {q.cliente?.razonSocial || 'CLIENTE GENERAL'}
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase opacity-40">Nit: {q.cliente?.nit || 'S/N'}</span>
                                                    {isConsolidatedView && (
                                                        <span className="text-[8px] font-black text-slate-500 uppercase px-1.5 py-0.5 bg-slate-100 dark:bg-white/5 rounded border border-slate-200 dark:border-white/10">
                                                            {branches.find(b => b.id === q.branchId)?.name || 'Central'}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            {isConsolidatedView && (
                                                <td className="px-4 py-5 text-center hidden xl:table-cell">
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                            {(q.usuarioNombre || 'SISTEMA').toUpperCase()}
                                                        </span>
                                                    </div>
                                                </td>
                                            )}
                                            <td className="px-4 py-5 text-center hidden xl:table-cell">
                                                <div className={clsx(
                                                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-tight border shadow-sm",
                                                    getExpirationStatus(q.validUntil).color
                                                )}>
                                                    {getExpirationStatus(q.validUntil).icon}
                                                    {getExpirationStatus(q.validUntil).label}
                                                </div>
                                            </td>
                                            <td className="px-4 py-5 text-right whitespace-nowrap">
                                                <div className="text-[13px] font-black text-slate-900 dark:text-white tracking-widest">
                                                    <span className="text-[9px] mr-1 opacity-40">Bs</span>
                                                    {q.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </div>
                                            </td>
                                            <td className="px-4 py-5 text-center">
                                                <span className={clsx(
                                                    "px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border shadow-sm",
                                                    q.status === 'CONVERTED' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                                        q.status === 'REJECTED' ? "bg-rose-500/10 text-rose-500 border-rose-500/20" :
                                                            "bg-slate-500/10 text-slate-400 border-slate-500/20"
                                                )}>
                                                    {q.status === 'CONVERTED' ? 'VENDIDA' : q.status === 'REJECTED' ? 'ANULADA' : q.status === 'PENDING' ? 'PENDIENTE' : q.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex justify-center gap-1.5">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setSelectedQuotation(q); }}
                                                        className="h-8 w-8 flex items-center justify-center bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-400 dark:text-white/40 hover:text-yellow-500 dark:hover:text-[#FFD700] hover:border-yellow-500/50 hover:bg-yellow-500/5 transition-all active:scale-90"
                                                        title="Ver Expediente"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    {q.status !== 'REJECTED' && getExpirationStatus(q.validUntil).label !== 'Vencida' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handlePrint(q); }}
                                                            className="h-8 w-8 flex items-center justify-center bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-400 dark:text-white/40 hover:bg-slate-900 dark:hover:bg-white/10 hover:text-white transition-all active:scale-90"
                                                            title="Imprimir"
                                                        >
                                                            <Printer size={14} />
                                                        </button>
                                                    )}
                                                    {q.status !== 'CONVERTED' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleLoadItems(q); }}
                                                            className="h-8 w-8 flex items-center justify-center bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-400 dark:text-white/40 hover:text-emerald-500 hover:bg-emerald-500/5 hover:border-emerald-500/50 transition-all active:scale-90"
                                                            title="Cargar al POS"
                                                        >
                                                            <ShoppingCart size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                    </div>
                </div>

                <TableFooter
                    totalItems={filteredQuotations.length}
                    itemsPerPage={itemsPerPage}
                    onChangeItemsPerPage={setItemsPerPage}
                    currentPage={currentPage}
                    onChangePage={setCurrentPage}
                    totalPages={totalPages}
                    label="Registros Técnicos"
                />
            </div>

            {/* Modal de Detalle - Suite Pro Technical Portal */}
            {selectedQuotation && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-modal flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setSelectedQuotation(null)}>
                    <div
                        className="bg-white dark:bg-background w-full max-w-2xl rounded-3xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden border border-slate-200 dark:border-white/10 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header Técnico */}
                        <div className="p-6 border-b border-slate-100 dark:border-white/10 flex justify-between items-center bg-slate-50 dark:bg-black/20">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-3 mb-1">
                                    <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                                    <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-tighter text-lg">
                                        Expediente <span className="text-yellow-500">COT-{selectedQuotation.id?.slice(-8).toUpperCase()}</span>
                                    </h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={clsx(
                                        "px-2 py-0.5 rounded-xl text-[10px] font-black uppercase tracking-widest border shadow-sm",
                                        selectedQuotation.status === 'CONVERTED' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                            selectedQuotation.status === 'REJECTED' ? "bg-rose-500/10 text-rose-500 border-rose-500/20" :
                                                "bg-slate-500/10 text-slate-400 border-slate-500/20"
                                    )}>
                                        {selectedQuotation.status === 'CONVERTED' ? 'VENDIDA' : selectedQuotation.status === 'REJECTED' ? 'ANULADA' : 'PENDIENTE'}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest opacity-60">Ref: COT-{selectedQuotation.id?.slice(-8).toUpperCase()}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedQuotation(null)}
                                className="h-10 w-10 flex items-center justify-center bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl text-slate-400 hover:text-rose-500 transition-all active:scale-90"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Contenido de Alta Densidad */}
                        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                            {/* Card de Cliente Premium */}
                            <div className="relative p-6 rounded-3xl bg-slate-50 dark:bg-black/40 border border-slate-800 shadow-2xl overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <User size={80} strokeWidth={1} className="text-white" />
                                </div>
                                <div className="relative z-10">
                                    <div className="text-[10px] font-black text-yellow-500/60 uppercase tracking-widest mb-3">Información del Solicitante</div>
                                    <h4 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2 leading-none">
                                        {selectedQuotation.cliente?.razonSocial || 'CLIENTE GENERAL'}
                                    </h4>
                                    <div className="flex flex-wrap gap-4 mt-4">
                                        <div className="bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                                            <span className="text-[9px] font-black text-slate-700 dark:text-slate-300 uppercase mr-2">NIT/CI:</span>
                                            <span className="text-xs font-black text-slate-900 dark:text-white font-mono tracking-wider">{selectedQuotation.cliente?.nit || 'S/N'}</span>
                                        </div>
                                        <div className="bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 flex flex-col gap-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[9px] font-bold text-slate-500 uppercase">Validez:</span>
                                                <span className={clsx("text-xs font-black tracking-tight", getExpirationStatus(selectedQuotation.validUntil).color.replace(/bg-[^\s]+/g, '').trim())}>
                                                    {getExpirationStatus(selectedQuotation.validUntil).label}
                                                    {(() => {
                                                        const d = ensureDate(selectedQuotation.validUntil);
                                                        const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
                                                        return diff > 0 ? ` · ${diff} día${diff !== 1 ? 's' : ''} restante${diff !== 1 ? 's' : ''}` : '';
                                                    })()}
                                                </span>
                                            </div>
                                            {selectedQuotation.fecha && selectedQuotation.validUntil && (
                                                <span className="text-[9px] text-slate-400 font-mono">
                                                    {formatDate(selectedQuotation.fecha)}
                                                    {' → '}
                                                    {formatDate(selectedQuotation.validUntil)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Detalle de Ítems - Technical Grid */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Desglose Comercial</h5>
                                    <span className="text-[10px] font-bold text-slate-500">{selectedQuotationItems.length} Componentes</span>
                                </div>
                                <div className="border border-slate-100 dark:border-white/10 rounded-3xl overflow-hidden bg-white dark:bg-black/10 relative min-h-25">
                                    {loadingItems && (
                                        <div className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
                                            <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    )}
                                    <table className="w-full text-left border-collapse text-sm">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-white/2 border-b border-slate-100 dark:border-white/10">
                                                <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Descripción</th>
                                                <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Cant</th>
                                                <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Unitario</th>
                                                <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                                            {selectedQuotationItems.length === 0 && !loadingItems && (
                                                <tr>
                                                    <td colSpan={4} className="px-5 py-10 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">No se han detectado ítems en este registro</td>
                                                </tr>
                                            )}
                                            {selectedQuotationItems.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-white/2 transition-colors">
                                                    <td className="p-3">
                                                        <p className={clsx("font-bold text-slate-900 dark:text-white text-xs leading-tight", item?.isVoided && "line-through opacity-50")}>
                                                            {item?.productName || 'N/A'}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {item?.productCodigoFabrica && (
                                                                <span className="text-[9px] font-black text-blue-500/70 uppercase">
                                                                    Fáb: {item.productCodigoFabrica}
                                                                </span>
                                                            )}
                                                            {item?.productCodigoOE && (
                                                                <span className="text-[9px] font-black text-purple-500/70 border-l border-slate-200 dark:border-white/10 pl-2 uppercase">
                                                                    OEM: {item.productCodigoOE}
                                                                </span>
                                                            )}
                                                            {!item?.isVoided && selectedQuotation.status !== 'CONVERTED' && (
                                                                <button onClick={(e) => { e.stopPropagation(); promptVoidItem(selectedQuotation, idx); }} disabled={!isOnline} title={!isOnline ? 'Requiere conexión' : 'Remover ítem'} className="ml-auto text-slate-300 hover:text-rose-500 transition disabled:opacity-30 disabled:cursor-not-allowed"><X size={12} /></button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="text-[11px] font-black text-slate-900 dark:text-white font-mono bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-xl border border-slate-200 dark:border-white/10">
                                                            {item?.quantity ?? 0}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className="text-[11px] font-bold text-slate-500 font-mono">
                                                            {item?.unitPrice?.toLocaleString() ?? '0.00'}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3 text-right">
                                                        <span className="text-[11px] font-black text-slate-900 dark:text-white font-mono">{item?.subtotal?.toLocaleString() ?? '0.00'}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50 dark:bg-black/20 font-black">
                                            <tr>
                                                <td colSpan={3} className="px-5 py-4 text-right text-[10px] text-slate-400 uppercase tracking-widest">Total Cotización</td>
                                                <td className="px-5 py-4 text-right text-lg text-slate-900 dark:text-white tracking-widest">Bs. {selectedQuotation.total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                {selectedQuotation.notes && (
                                    <div className="p-4 bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/10 rounded-2xl">
                                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Notas de Auditoría / Motivo</div>
                                        <p className="text-xs text-slate-600 dark:text-slate-400 italic">&quot;{selectedQuotation.notes}&quot;</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Acciones de Control Técnico */}
                        <div className="p-6 bg-slate-50 dark:bg-black/40 border-t border-slate-100 dark:border-white/10 flex flex-wrap gap-3">
                            <button
                                onClick={() => handlePrint(selectedQuotation)}
                                className="flex-1 min-w-35 h-12 flex items-center justify-center gap-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-white hover:bg-slate-900 dark:hover:bg-white/10 hover:text-white transition-all active:scale-95 shadow-sm"
                            >
                                <Printer size={16} />
                                Imprimir Comprobante
                            </button>

                            {selectedQuotation.status === 'PENDING' && (
                                <>
                                    <button
                                        onClick={() => handleLoadItems(selectedQuotation)}
                                        className="flex-[1.5] min-w-35 h-12 flex items-center justify-center gap-2 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black rounded-2xl text-[11px] font-black uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-yellow-500/20"
                                    >
                                        <ShoppingCart size={16} />
                                        Cargar al POS
                                    </button>
                                    <button
                                        onClick={() => { setCancelModal({ isOpen: true, quotation: selectedQuotation }); setSelectedQuotation(null); }}
                                        className="h-12 w-12 flex items-center justify-center bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-2xl hover:bg-rose-500 hover:text-white transition-all active:scale-95"
                                        title="Anular Proforma"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </>
                            )}
                            {selectedQuotation.status !== 'PENDING' && (
                                <button
                                    onClick={() => handleLoadItems(selectedQuotation)}
                                    className="flex-1 min-w-35 h-12 flex items-center justify-center gap-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-white/60 hover:bg-slate-200 dark:hover:bg-white/10 transition-all active:scale-95 shadow-sm"
                                >
                                    <Plus size={16} />
                                    Duplicar para Editar
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Modal de Cancelación (Anulación Completa) - Suite Pro Portal */}
            {cancelModal.isOpen && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-1000 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 animate-in fade-in duration-300" onClick={cancelDismiss.onBackdropClick}>
                    <div className="bg-white dark:bg-background rounded-3xl w-full max-sm:max-w-100 max-w-sm shadow-2xl overflow-hidden border border-rose-100 dark:border-rose-900/30 animate-in zoom-in-95 duration-300 relative" onClick={(e) => e.stopPropagation()}>
                        <button onClick={closeCancelModal} className="absolute top-3 right-3 p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl transition-all z-10"><X size={16} className="text-slate-400" /></button>
                        <div className="p-8 bg-rose-50 dark:bg-rose-900/10 flex flex-col items-center text-center">
                            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-xl bg-white dark:bg-black/20 text-rose-500 border border-rose-100 dark:border-rose-900/30">
                                <AlertTriangle size={40} strokeWidth={1.5} />
                            </div>
                            <h3 className="text-xl font-black uppercase tracking-tighter text-rose-600 dark:text-rose-400">
                                ¿Anular Cotización?
                            </h3>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-3 px-2 leading-relaxed uppercase tracking-tight">
                                Esta acción invalidará por completo la proforma técnica. No podrá convertirse en venta después de esto.
                            </p>
                        </div>

                        <div className="p-8 space-y-6">
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block px-1">Motivo / Justificación Técnica</label>
                                <textarea
                                    value={cancelReason}
                                    onChange={(e) => setCancelReason(e.target.value)}
                                    placeholder="Ej: El cliente desistió de la compra..."
                                    className="w-full h-24 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-xs text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all resize-none font-medium italic"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setCancelModal({ isOpen: false, quotation: null });
                                        setCancelReason('');
                                    }}
                                    className="flex-1 h-12 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 transition-all active:scale-95"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleCancelQuotation}
                                    disabled={isVoiding}
                                    className="flex-1 h-12 bg-rose-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-600 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-rose-500/20"
                                >
                                    {isVoiding ? 'Anulando...' : 'Si, Anular'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Modal de Remover Ítem (Anulación Parcial) - Suite Pro Portal */}
            {voidModal.isOpen && voidModal.quotation && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-1000 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 animate-in fade-in duration-300" onClick={voidDismiss.onBackdropClick}>
                    <div className="bg-white dark:bg-background rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-amber-100 dark:border-amber-900/30 animate-in zoom-in-95 duration-300 relative" onClick={(e) => e.stopPropagation()}>
                        <button onClick={closeVoidModal} className="absolute top-3 right-3 p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl transition-all z-10"><X size={16} className="text-slate-400" /></button>
                        <div className="p-8 bg-amber-50 dark:bg-amber-900/10 flex flex-col items-center text-center">
                            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-xl bg-white dark:bg-black/20 text-amber-500 border border-amber-100 dark:border-amber-900/30">
                                <Trash2 size={40} strokeWidth={1.5} />
                            </div>
                            <h3 className="text-xl font-black uppercase tracking-tighter text-amber-600 dark:text-amber-400">
                                ¿Remover Ítem?
                            </h3>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-3 px-2 leading-relaxed uppercase tracking-tight">
                                Esto quitará el producto seleccionado de la cotización técnica de forma permanente.
                            </p>
                        </div>

                        <div className="p-8 flex gap-3">
                            <button
                                onClick={() => setVoidModal({ isOpen: false, itemIndex: null, quotation: null })}
                                className="flex-1 h-12 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 transition-all active:scale-95"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmVoidItem}
                                disabled={isVoiding}
                                className="flex-1 h-12 bg-amber-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-600 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-amber-500/20 flex justify-center items-center"
                            >
                                {isVoiding ? 'Removiendo...' : 'Si, Remover'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
