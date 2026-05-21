'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query as fsQuery, where as fsWhere, orderBy as fsOrderBy, limit as fsLimit, onSnapshot, QueryConstraint } from 'firebase/firestore';
import { usePagination } from '@/hooks/usePagination';
import { useModalDismiss } from '@/hooks/useModalDismiss';
import { createPortal } from 'react-dom';
import { SaleService } from '@/services/SaleService';
import { SaleApprovalService } from '@/services/SaleApprovalService';
import { CashierSessionService } from '@/services/CashierSessionService';
import { Sale, SaleItem, Installment } from '@/types';
import { useTransactionItems } from '@/hooks/useTransactionItems';
import { Eye, Printer, ShoppingBag, Download, RotateCcw, User, AlertTriangle, CornerUpLeft, TrendingUp, Calendar, X, CreditCard, WifiOff, RefreshCw, Trash2 } from 'lucide-react';
import { PrintService } from '@/services/PrintService';
import { useAuth } from '@/contexts/AuthContext';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useBranch } from '@/contexts/BranchContext';
import { downloadCSV } from '@/utils/csvExport';
import { startOfDay, endOfDay, localDateStr } from '@/lib/utils';
import { normalizeText } from '@/utils/normalize';
import { ensureDate, formatDate as formatBoDate, formatDateTime, formatTime } from '@/utils/dateHelpers';
import { isStaff as isStaffRole, isEncargadoVentas } from '@/utils/roles';
import { getFailedSales, clearFailedSales, QueuedSale } from '@/hooks/useOfflineQueue';

// Suite Pro v4.0 Components
import ModuleHeader from '@/components/common/ModuleHeader';
import KpiCard from '@/components/common/KpiCard';
import FilterBar from '@/components/common/FilterBar';
import TableFooter from '@/components/common/TableFooter';

export default function SalesHistoryPage() {
    const { user: currentUser, role: userRole } = useAuth();
    const { currentBranch, branches, isConsolidatedView, loading: branchLoading } = useBranch();
    const [sales, setSales] = useState<Sale[]>([]);
    const [loading, setLoading] = useState(true);

    // Tab: historial | pendientes
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState<'historial' | 'pendientes'>(
        searchParams.get('tab') === 'pendientes' ? 'pendientes' : 'historial'
    );
    const [failedSales, setFailedSales] = useState<(QueuedSale & { failedAt?: string; failReason?: string })[]>([]);

    const refreshFailedSales = useCallback(() => {
        setFailedSales(getFailedSales());
    }, []);

    useEffect(() => {
        if (activeTab === 'pendientes') refreshFailedSales();
    }, [activeTab, refreshFailedSales]);

    const handleDiscardFailedSale = useCallback((id: string) => {
        const current = getFailedSales();
        const next = current.filter((s: QueuedSale) => s.id !== id);
        localStorage.setItem('renotech_failed_sync_sales', JSON.stringify(next));
        setFailedSales(next);
        toast.success('Venta descartada del registro de pendientes');
    }, []);

    const handleClearAllFailed = useCallback(() => {
        clearFailedSales();
        setFailedSales([]);
        toast.success('Registro de pendientes limpiado');
    }, []);
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const { items: selectedSaleItems, loading: loadingItems } = useTransactionItems<SaleItem>(selectedSale?.id, 'ventas');
    const [isVoiding, setIsVoiding] = useState<string | null>(null);
    const [voidModal, setVoidModal] = useState<{ isOpen: boolean, type: 'SALE' | 'ITEM', sale: Sale | null, itemIndex?: number }>({ isOpen: false, type: 'SALE', sale: null });
    const closeVoidModal = useCallback(() => setVoidModal({ isOpen: false, type: 'SALE', sale: null }), []);
    const voidDismiss = useModalDismiss(voidModal.isOpen, closeVoidModal, { disabled: !!isVoiding });
    const [voidReason, setVoidReason] = useState('');
    const [saleInstallments, setSaleInstallments] = useState<Installment[]>([]);

    // Load installments when a CUOTAS sale is selected
    useEffect(() => {
        if (selectedSale?.metodoPago === 'CUOTAS' && selectedSale.id) {
            SaleService.getInstallmentsBySaleId(selectedSale.id).then(setSaleInstallments).catch(() => setSaleInstallments([]));
        } else {
            setSaleInstallments([]);
        }
    }, [selectedSale?.id, selectedSale?.metodoPago]);

    // Close modals with Escape key
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (voidModal.isOpen) {
                setVoidModal({ isOpen: false, type: 'SALE', sale: null });
                setVoidReason('');
                return;
            }
            if (selectedSale) {
                setSelectedSale(null);
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [selectedSale, voidModal.isOpen]);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [userFilter, setUserFilter] = useState('Todos');
    const [branchFilter, setBranchFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'VALID' | 'VOIDED'>('ALL');

    const loadSales = useCallback(async () => {
        if (branchLoading) return;
        setLoading(true);
        try {
            let data: Sale[] = [];
            const branchId = isConsolidatedView 
                ? (branchFilter === 'all' ? undefined : branchFilter) 
                : currentBranch?.id;

            // If user is staff, fetch everything for their branch
            if (isStaffRole(userRole)) {
                data = await SaleService.getRecentSales(500, branchId);
            } else if (currentUser) {
                // If normal logged in user (customer), fetch only theirs
                data = await SaleService.getSalesByClient(currentUser.uid, branchId);
            }
            setSales(data);
        } catch (error) {
            console.error("Error loading sales:", error);
        } finally {
            setLoading(false);
        }
    }, [currentUser, userRole, currentBranch?.id, isConsolidatedView, branchLoading, branchFilter]);

    // Realtime subscription para staff.
    // Para clientes finales se mantiene loadSales puntual.
    useEffect(() => {
        if (branchLoading) return;
        if (!isStaffRole(userRole)) {
            loadSales();
            return;
        }
        const branchId = isConsolidatedView
            ? (branchFilter === 'all' ? undefined : branchFilter)
            : currentBranch?.id;
        setLoading(true);
        const constraints: QueryConstraint[] = [fsOrderBy('fecha', 'desc'), fsLimit(500)];
        if (branchId) constraints.unshift(fsWhere('branchId', '==', branchId));
        const q = fsQuery(collection(db, 'ventas'), ...constraints);
        const unsub = onSnapshot(
            q,
            snap => {
                const data = snap.docs.map(d => {
                    const raw = d.data();
                    return { id: d.id, ...raw, fecha: raw.fecha?.toDate?.() || raw.fecha } as Sale;
                });
                setSales(data);
                setLoading(false);
            },
            err => {
                console.error('SalesHistory onSnapshot:', err);
                setLoading(false);
            }
        );
        return () => unsub();
    }, [userRole, currentBranch?.id, isConsolidatedView, branchLoading, branchFilter, loadSales]);

    const handlePrint = async (sale: Sale) => {
        toast.promise(
            PrintService.printDocument(sale, 'SALE', sale.branchId),
            {
                loading: 'Generando Documento...',
                success: 'Documento list para imprimir',
                error: 'Error al generar el documento PDF'
            }
        );
    };

    const filteredSales = useMemo(() => {
        return sales.filter(sale => {
            // Normalize search term: remove common prefixes users might type
            const normSearch = normalizeText(searchTerm);
            const searchId = normSearch.replace(/^(vta-|ven-|cot-|#)/, '');

            const matchesSearch = !searchTerm ||
                normalizeText(sale.cliente?.razonSocial || '').includes(normSearch) ||
                normalizeText(sale.id).includes(normSearch) ||
                (searchId && normalizeText(sale.id).includes(searchId)) ||
                // Allow searching by NIT
                normalizeText(sale.cliente?.nit || '').includes(normSearch);

            const saleDate = ensureDate(sale.fecha);
            const matchesStart = !startDate || saleDate >= startOfDay(startDate);
            const matchesEnd = !endDate || saleDate <= endOfDay(endDate);

            const saleUser = sale.usuarioEmail || sale.usuarioId;
            const matchesUser = userFilter === 'Todos' || saleUser === userFilter;
            const matchesStatus = statusFilter === 'ALL' ||
                (statusFilter === 'VALID' && sale.status === 'COMPLETED') ||
                (statusFilter === 'VOIDED' && sale.status === 'VOIDED');

            return matchesSearch && matchesStart && matchesEnd && matchesUser && matchesStatus;
        });
    }, [sales, searchTerm, startDate, endDate, userFilter, statusFilter]);

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedSales } = usePagination(filteredSales);

    const usersList = useMemo(() => {
        const usersMap = new Map<string, string>();
        sales.forEach(s => {
            const userId = s.usuarioEmail || s.usuarioId;
            if (userId && !usersMap.has(userId)) {
                usersMap.set(userId, (s.usuarioNombre || '—').toUpperCase());
            }
        });
        return Array.from(usersMap.entries()).map(([id, name]) => ({ id, name }));
    }, [sales]);

    const stats = useMemo(() => {
        const valid = filteredSales.filter(s => s.status !== 'VOIDED');
        const voided = filteredSales.filter(s => s.status === 'VOIDED');
        const total = valid.reduce((acc, curr) => acc + (curr.total ?? 0), 0);
        return {
            total,
            count: valid.length,
            voidedCount: voided.length,
            avg: valid.length > 0 ? total / valid.length : 0
        };
    }, [filteredSales]);

    const exportToCSV = () => {
        if (filteredSales.length === 0) return;
        const headers = [
            'ID', 
            'FECHA', 
            'HORA', 
            'CLIENTE', 
            'NIT/CI', 
            'TELÉFONO',
            'USUARIO', 
            'SUCURSAL', 
            'MÉTODO', 
            'TOTAL', 
            'CUOTAS',
            'ADELANTO',
            'FINANCIADO',
            'ESTADO'
        ];

        const rows = filteredSales.map(s => {
            const d = ensureDate(s.fecha);
            const branchName = branches.find(b => b.id === s.branchId)?.name || 'S/D';
            
            const formatDate = (date: Date) => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            };

            const translateStatus = (status: string) => {
                switch(status) {
                    case 'COMPLETED': return 'COMPLETADA';
                    case 'VOIDED': return 'ANULADA';
                    default: return status;
                }
            };

            const numInstallments = Number(s.installments) || 0;
            const adelantoVal = Number(s.adelanto) || 0;
            const financed = numInstallments > 0 ? (s.total - adelantoVal).toFixed(2) : '';

            return [
                `VEN-${s.id?.slice(-8).toUpperCase() || ''}`,
                formatDate(d),
                formatTime(d),
                (s.cliente?.razonSocial || '').replace(/;/g, ' '),
                s.cliente?.nit || 'S/N',
                s.cliente?.telefono || '---',
                (s.usuarioNombre || s.usuarioEmail || s.usuarioId || '').toUpperCase(),
                branchName,
                s.metodoPago || 'S/D',
                s.total.toFixed(2),
                numInstallments > 0 ? `${numInstallments}x` : '-',
                adelantoVal > 0 ? adelantoVal.toFixed(2) : '-',
                financed || '-',
                translateStatus(s.status)
            ];
        });
        
        downloadCSV(`ventas_${localDateStr()}`, headers, rows);
        toast.success('Reporte de ventas exportado');
    };



    const promptVoidSale = (sale: Sale) => {
        setVoidModal({ isOpen: true, type: 'SALE', sale });
        setVoidReason('');
    };

    const promptReturnItem = (sale: Sale, itemIndex: number) => {
        setVoidModal({ isOpen: true, type: 'ITEM', sale, itemIndex });
        setVoidReason('');
    };

    const confirmVoidAction = async () => {
        if (!voidReason.trim()) {
            toast.error('El motivo de la anulación es obligatorio');
            return;
        }

        const { type, sale, itemIndex } = voidModal;
        if (!sale || !sale.id) return;

        setIsVoiding(sale.id);
        const originalSelectedSale = selectedSale; // Keep track to know if we need to update it
        setVoidModal({ isOpen: false, type: 'SALE', sale: null });

        try {
            if (type === 'SALE') {
                // Cross-shift detection: si la venta pertenece a un turno cerrado / anterior
                // y el usuario es CAJERO, generar solicitud de aprobación para GERENTE.
                let needsApproval = false;
                if (isEncargadoVentas(userRole) && currentUser?.uid) {
                    const activeSession = await CashierSessionService.getCurrentSession(currentUser.uid);
                    const saleDate = ensureDate(sale.fecha);
                    const sessionStart = activeSession?.openedAt && typeof (activeSession.openedAt as { toDate?: () => Date }).toDate === 'function'
                        ? (activeSession.openedAt as { toDate: () => Date }).toDate()
                        : null;
                    if (!activeSession || !sessionStart || saleDate < sessionStart) {
                        needsApproval = true;
                    }
                }

                if (needsApproval) {
                    await SaleApprovalService.requestVoidApproval(
                        sale.id,
                        currentUser?.uid || '?',
                        currentUser?.email || '?',
                        voidReason
                    );
                    toast.success('Solicitud enviada al GERENTE para aprobación.');
                } else {
                    await SaleService.voidSale(sale.id, currentUser?.email || 'unknown', voidReason, {
                        uid: currentUser?.uid || '?',
                        email: currentUser?.email || '?',
                        branchId: sale.branchId || '?'
                    });
                    toast.success('Venta anulada correctamente');
                }
            } else if (type === 'ITEM' && itemIndex !== undefined) {
                const itemId = selectedSaleItems[itemIndex]?.id;
                if (!itemId) throw new Error("ID de ítem no encontrado");
                
                await SaleService.voidSaleItem(sale.id, itemId, currentUser?.email || 'unknown', voidReason, {
                    uid: currentUser?.uid || '?',
                    email: currentUser?.email || '?',
                    branchId: sale.branchId || '?'
                });
                toast.success('Devolución del producto procesada');
            }

            await loadSales(); // refresh list

            // Update details modal if it's currently open
            if (originalSelectedSale && originalSelectedSale.id === sale.id) {
                if (type === 'SALE') {
                    // Si se anuló la venta, cerramos el modal porque ya está muerta
                    setSelectedSale(null);
                } else {
                    // Si solo fue un ítem, refrescamos la vista de la venta actual
                    const branchFilt = isConsolidatedView ? undefined : currentBranch?.id;
                    const updatedSales = await SaleService.getRecentSales(500, branchFilt);
                    const fresh = updatedSales.find(s => s.id === sale.id);
                    if (fresh) setSelectedSale(fresh);
                }
            }
        } catch (e) {
            console.error(e);
            toast.error(type === 'SALE' ? 'Error al anular la venta' : 'Error al procesar la devolución');
        } finally {
            setIsVoiding(null);
        }
    };

    return (
        <>
            <div className="flex-1 min-w-0 w-full max-w-full p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 bg-slate-50 dark:bg-background">
            {/* Header Area - Suite Pro Standard */}
            <ModuleHeader
                title="Historial de Ventas"
                subtitle="Gestión Operativa y Auditoría de Transacciones de Venta"
                icon={ShoppingBag}
                actions={[
                    {
                        label: "Exportar CSV",
                        onClick: exportToCSV,
                        icon: Download,
                        variant: 'secondary',
                        disabled: filteredSales.length === 0,
                        dataTourId: 'ventas-export',
                    },
                    {
                        label: "Actualizar Sistema",
                        onClick: loadSales,
                        variant: 'primary'
                    }
                ]}
            />

            {/* KPI Cards - Technical Command Center Style */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    label="Facturación Bruta"
                    value={stats.total}
                    prefix="Bs"
                    color="gold"
                    icon={TrendingUp}
                    progress={70}
                />
                <KpiCard
                    label="Transacciones OK"
                    value={stats.count}
                    secondaryLabel="Registros"
                    secondaryValue={stats.count}
                    color="blue"
                    icon={ShoppingBag}
                />
                <KpiCard
                    label="Ticket Anulados"
                    value={stats.voidedCount}
                    secondaryLabel="Nulos"
                    secondaryValue={stats.voidedCount}
                    color="red"
                    icon={RotateCcw}
                />
                <KpiCard
                    label="Promedio Ticket"
                    value={stats.avg}
                    prefix="Bs"
                    color="green"
                    icon={Calendar}
                />
            </div>

            {/* Tab Switcher */}
            <div className="flex items-center gap-1 bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-2xl p-1 w-fit shadow-sm">
                <button
                    onClick={() => setActiveTab('historial')}
                    className={clsx(
                        'px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all',
                        activeTab === 'historial'
                            ? 'bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    )}
                >
                    Historial
                </button>
                <button
                    onClick={() => setActiveTab('pendientes')}
                    className={clsx(
                        'flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all',
                        activeTab === 'pendientes'
                            ? 'bg-amber-500 text-black shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    )}
                >
                    <WifiOff size={11} />
                    Pendientes
                    {failedSales.length > 0 && (
                        <span className="bg-rose-500 text-white rounded-full text-[9px] font-black w-4 h-4 flex items-center justify-center">
                            {failedSales.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Pendientes Tab Content */}
            {activeTab === 'pendientes' && (
                <div className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                <WifiOff size={18} className="text-amber-500" />
                            </div>
                            <div>
                                <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Ventas sin sincronizar</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    {failedSales.length === 0
                                        ? 'No hay ventas pendientes — todo sincronizado'
                                        : `${failedSales.length} venta${failedSales.length !== 1 ? 's' : ''} fallaron al sincronizar`}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={refreshFailedSales}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-500 text-[10px] font-black uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                            >
                                <RefreshCw size={11} /> Actualizar
                            </button>
                            {failedSales.length > 0 && (
                                <button
                                    onClick={handleClearAllFailed}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase tracking-wider hover:bg-rose-500 hover:text-white transition-colors"
                                >
                                    <Trash2 size={11} /> Limpiar todo
                                </button>
                            )}
                        </div>
                    </div>

                    {failedSales.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                                <ShoppingBag size={24} className="text-emerald-500" />
                            </div>
                            <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Sin pendientes</p>
                            <p className="text-[11px] text-slate-400 max-w-xs">
                                Todas las ventas offline se sincronizaron correctamente. Si alguna falla, aparecerá aquí.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-white/5">
                            {failedSales.map((entry) => (
                                <div key={entry.id} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                                                Offline
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-mono">
                                                ID: {entry.id.slice(0, 8).toUpperCase()}
                                            </span>
                                            {entry.queuedAt && (
                                                <span className="text-[10px] text-slate-400">
                                                    · {new Date(entry.queuedAt).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm font-black text-slate-900 dark:text-white">
                                            {entry.saleData?.cliente?.razonSocial || 'Sin cliente'}{' '}
                                            <span className="font-mono text-yellow-500">
                                                Bs. {(entry.saleData?.total ?? 0).toFixed(2)}
                                            </span>
                                        </p>
                                        <p className="text-[10px] text-rose-500 mt-0.5">
                                            {entry.failReason || 'Error al sincronizar'}
                                            {(entry.retries ?? 0) > 0 && ` · ${entry.retries} reintento${entry.retries !== 1 ? 's' : ''}`}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleDiscardFailedSale(entry.id)}
                                        className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase tracking-wider hover:bg-rose-500 hover:text-white transition-colors"
                                    >
                                        <Trash2 size={11} /> Descartar
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Filter Toolbar - High Density Suite Pro */}
            <div className={activeTab !== 'historial' ? 'hidden' : ''}>
            <div data-tour="ventas-filters">
            <FilterBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Buscar por cliente, nit o id de venta..."
                filters={[
                    {
                        id: 'status',
                        label: 'Status',
                        value: statusFilter,
                        onChange: (val: string) => setStatusFilter(val as 'ALL' | 'VALID' | 'VOIDED'),
                        options: [
                            { label: 'Todas', value: 'ALL' },
                            { label: 'Válidas', value: 'VALID' },
                            { label: 'Anuladas', value: 'VOIDED' }
                        ]
                    },
                    {
                        id: 'user',
                        label: 'Auditor',
                        value: userFilter,
                        onChange: setUserFilter,
                        options: usersList.map(u => ({ label: u.name, value: u.id }))
                    },
                    ...(isConsolidatedView ? [{
                        id: 'branch',
                        label: 'Sede',
                        value: branchFilter,
                        onChange: setBranchFilter,
                        options: branches.map(b => ({ label: b.name, value: b.id || 'all' }))
                    }] : [])
                ]}
                dateRange={{
                    start: startDate,
                    end: endDate,
                    onStartChange: setStartDate,
                    onEndChange: setEndDate
                }}
                onClear={() => {
                    setSearchTerm('');
                    setStartDate('');
                    setEndDate('');
                    setUserFilter('Todos');
                    setStatusFilter('ALL');
                    setBranchFilter('all');
                }}
                isDirty={searchTerm !== '' || startDate !== '' || endDate !== '' || userFilter !== 'Todos' || statusFilter !== 'ALL' || (isConsolidatedView && branchFilter !== 'all')}
            />
            </div>
            </div>

            {/* Table / List Area */}
            <div className={activeTab !== 'historial' ? 'hidden' : ''}>
            <div data-tour="ventas-table" className="bg-white dark:bg-background border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl overflow-hidden flex flex-col transition-all">
                <div className="p-0 flex flex-col">
                    {/* Top Pagination Bar */}
                    <TableFooter
                        totalItems={filteredSales.length}
                        itemsPerPage={itemsPerPage}
                        onChangeItemsPerPage={setItemsPerPage}
                        currentPage={currentPage}
                        onChangePage={setCurrentPage}
                        totalPages={totalPages}
                        label="Registros"
                        className="border-b border-t-0 bg-white/50 dark:bg-black/10"
                    />

                    {/* Mobile Card View - Modernized */}
                    <div className="md:hidden divide-y divide-slate-100 dark:divide-white/5">
                        {paginatedSales.map((sale) => (
                            <div key={sale.id} onClick={() => setSelectedSale(sale)} className={clsx(
                                "p-5 active:bg-slate-50 dark:active:bg-white/5 transition-colors cursor-pointer relative overflow-hidden",
                                sale.status === 'VOIDED' && "opacity-60 grayscale bg-rose-50/10"
                            )}>
                                {sale.status === 'VOIDED' && (
                                    <div className="absolute -right-6 top-3 bg-rose-500 text-white text-[8px] font-black py-1 px-8 rotate-45 uppercase tracking-widest shadow-lg">ANULADA</div>
                                )}
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="font-mono text-[10px] font-black text-yellow-600 dark:text-[#FFD700] bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">
                                                VEN-{sale.id?.slice(-8).toUpperCase()}
                                            </span>
                                            {isConsolidatedView && (
                                                <span className="text-[8px] font-black text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded uppercase">
                                                    {branches.find(b => b.id === sale.branchId)?.name || 'S/D'}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest">
                                            {formatDateTime(sale.fecha)}
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Monto Total</span>
                                        <span className="text-xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums">Bs. {sale.total.toFixed(2)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                                            <User size={14} className="text-slate-400" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900 dark:text-white text-xs leading-none mb-1">
                                                {sale.cliente?.razonSocial || 'Sin Nombre'}
                                            </p>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                NIT: {sale.cliente?.nit || 'S/N'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className={clsx(
                                        "px-2.5 py-1 border rounded-xl text-[9px] font-black uppercase",
                                        sale.metodoPago === 'CUOTAS' ? "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/20" :
                                        "bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-white/10"
                                    )}>
                                        {sale.metodoPago || 'EFE'}
                                        {sale.metodoPago === 'CUOTAS' && sale.installments && (
                                            <span className="ml-1">({sale.installments}x)</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop Table - Suite Pro Tech Standard */}
                    <table className="hidden md:table w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-black/40 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] transition-colors border-b border-slate-200 dark:border-white/10">
                            <tr>
                                <th className="px-6 py-4">Ref. Auditoría</th>
                                <th className="px-6 py-4">Timestamp</th>
                                <th className="px-6 py-4">Titular de Operación</th>
                                {isConsolidatedView && <th className="px-6 py-4">Sucursal</th>}
                                <th className="px-6 py-4">Agente</th>
                                <th className="px-6 py-4 text-center">Modo</th>
                                <th className="px-6 py-4 text-right">Monto Bruto</th>
                                <th className="px-6 py-4 text-center">Status</th>
                                <th className="px-6 py-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {paginatedSales.map((sale) => (
                                <tr key={sale.id} className={clsx(
                                    "hover:bg-slate-50 dark:hover:bg-white/2 transition-colors group",
                                    sale.status === 'VOIDED' && "bg-rose-50/10 dark:bg-rose-500/5 opacity-60 italic"
                                )}>
                                    <td className="px-6 py-4">
                                        <span className="font-mono text-[10px] font-black text-yellow-600 dark:text-[#FFD700] bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20 select-all">
                                            VEN-{sale.id?.slice(-8).toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-[10px] font-bold text-slate-900 dark:text-white uppercase">
                                            {formatBoDate(sale.fecha)}
                                        </div>
                                        <div className="text-[10px] font-black text-slate-400 font-mono tracking-tighter">
                                            {formatTime(sale.fecha)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-900 dark:text-white text-[11px] wrap-break-word">
                                            {sale.cliente?.razonSocial || 'PUBLICO GENERAL'}
                                        </div>
                                        <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-0.5">ID Fiscal: {sale.cliente?.nit || 'S/N'}</div>
                                    </td>
                                    {isConsolidatedView && (
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-0.5 rounded text-[8px] font-black text-blue-500 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 uppercase tracking-widest">
                                                {branches.find(b => b.id === sale.branchId)?.name || 'S/D'}
                                            </span>
                                        </td>
                                    )}
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black uppercase text-slate-900 dark:text-slate-300 tracking-widest">
                                                {sale.usuarioNombre || 'SYSTEM_CORE'}
                                            </span>
                                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                                USR-{sale.usuarioId?.slice(-6) || 'SVC'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className={clsx(
                                                "px-2 py-1 rounded text-[9px] font-black uppercase tracking-tighter border",
                                                sale.metodoPago === 'CUOTAS' ? "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/20" :
                                                sale.metodoPago === 'CREDITO' ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20" :
                                                "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10"
                                            )}>
                                                {sale.metodoPago?.slice(0, 3) || 'EFE'}
                                            </span>
                                            {sale.metodoPago === 'CUOTAS' && sale.installments && (
                                                <span className="text-[8px] font-bold text-purple-500">
                                                    {sale.installments}x{sale.adelanto ? ` +Adel.` : ''}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="font-black text-slate-900 dark:text-white text-sm tracking-tighter tabular-nums">
                                            {sale.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className={clsx(
                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest border",
                                            sale.status === 'VOIDED' 
                                                ? "bg-rose-500/10 text-rose-500 border-rose-500/20" 
                                                : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                        )}>
                                            <div className={clsx("w-1 h-1 rounded-full animate-pulse", sale.status === 'VOIDED' ? "bg-rose-500" : "bg-emerald-500")} />
                                            {sale.status === 'VOIDED' ? 'Anulada' : 'Válida'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-end gap-1.5">
                                            <button
                                                onClick={() => setSelectedSale(sale)}
                                                className="p-2 text-slate-400 hover:text-yellow-500 hover:bg-yellow-500/10 rounded-xl transition-all active:scale-90"
                                                title="Detalle Inteligente"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            <button
                                                onClick={() => handlePrint(sale)}
                                                className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all active:scale-90 disabled:opacity-0"
                                                title="Reimprimir Comprobante"
                                                disabled={sale.status === 'VOIDED'}
                                            >
                                                <Printer size={16} />
                                            </button>
                                            {sale.status !== 'VOIDED' && (
                                                <button
                                                    onClick={() => promptVoidSale(sale)}
                                                    className="p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all active:scale-90"
                                                    title="Protocolo de Anulación"
                                                >
                                                    <RotateCcw size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {(loading || filteredSales.length === 0) && (
                        <>
                            {/* Empty State - Suite Pro Tech */}
                            <div className="flex flex-col items-center justify-center py-32 space-y-4 w-full">
                                {loading ? (
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-12 h-12 border-4 border-slate-200 dark:border-white/10 border-t-yellow-500 rounded-full animate-spin" />
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Sincronizando Base de Datos...</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-20 h-20 bg-slate-50 dark:bg-white/5 rounded-3xl flex items-center justify-center border border-slate-100 dark:border-white/10 shadow-inner">
                                            <ShoppingBag size={32} className="text-slate-300 dark:text-slate-600" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] mb-1">Nivel de Datos: Cero</p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">No se detectaron transacciones para los filtros actuales</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Pagination Footer - Suite Pro Visual Alignment */}
                <TableFooter
                    totalItems={filteredSales.length}
                    itemsPerPage={itemsPerPage}
                    onChangeItemsPerPage={setItemsPerPage}
                    currentPage={currentPage}
                    onChangePage={setCurrentPage}
                    totalPages={totalPages}
                    label="Registros"
                />
            </div>
        </div>
            </div>

        {/* Detail Modal - Portal & Suite Pro Styling */}
            {selectedSale && typeof document !== 'undefined' && createPortal(
                (() => {
                    const sale = selectedSale;
                    return (
                        <div onClick={() => setSelectedSale(null)} className="fixed inset-0 z-1000 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4 animate-in fade-in duration-200">
                            <div 
                                className="bg-white dark:bg-background rounded-t-4xl md:rounded-3xl w-full h-[95vh] md:h-auto md:max-h-[90vh] md:max-w-xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] overflow-hidden border-t md:border border-white/10 flex flex-col transform transition-all animate-in slide-in-from-bottom-10"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Modal Header */}
                                <div className="p-6 border-b border-slate-100 dark:border-white/10 flex justify-between items-center bg-slate-50 dark:bg-black/20">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-yellow-500/10 rounded-xl">
                                            <ShoppingBag size={18} className="text-yellow-600 dark:text-[#FFD700]" />
                                        </div>
                                        <div className="flex flex-col">
                                            <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-tighter text-sm">
                                                Comprobante VEN-{sale.id?.slice(-8).toUpperCase()}
                                            </h3>
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Auditoría de Transacción</span>
                                        </div>
                                        {sale.status === 'VOIDED' && (
                                            <span className="bg-rose-500/10 text-rose-500 px-2 py-0.5 rounded-xl text-[8px] font-black uppercase tracking-widest border border-rose-500/20">ANULADA</span>
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => setSelectedSale(null)} 
                                        className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/5 rounded-full transition-all text-slate-400 active:scale-90"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                {/* Modal Content - Scrollable */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar dark:bg-background/50">
                                    <div className={clsx(
                                        "p-5 rounded-2xl border transition-all",
                                        sale.status === 'VOIDED' ? "bg-rose-500/5 border-rose-500/20" : "bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10"
                                    )}>
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="space-y-1">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Titular del Recibo</span>
                                                <h4 className="font-black text-slate-900 dark:text-white text-xl leading-none tracking-tighter uppercase">
                                                    {sale.cliente?.razonSocial || 'PUBLICO GENERAL'}
                                                </h4>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">ID Fiscal</span>
                                                <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-white/10 px-2 py-0.5 rounded">
                                                    {sale.cliente?.nit || 'S/N'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-white/10">
                                            <div>
                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Fecha de Operación</span>
                                                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">{formatBoDate(sale.fecha)}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Hora de Cierre</span>
                                                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">{formatTime(sale.fecha)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between px-1">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Desglose de Conceptos</span>
                                            <span className="text-[9px] font-bold text-slate-500 uppercase">{selectedSaleItems.length} Productos</span>
                                        </div>
                                        <div className="border border-slate-200 dark:border-white/10 rounded-2xl overflow-x-auto shadow-sm relative min-h-25">
                                            {loadingItems && (
                                                <div className="absolute inset-0 bg-white/50 dark:bg-background/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
                                                    <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                                                </div>
                                            )}
                                            <table className="w-full min-w-[380px] text-sm">
                                                <thead className="bg-slate-50 dark:bg-black/40 text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-200 dark:border-white/10">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left">Producto / Servicio</th>
                                                        <th className="px-4 py-3 text-center">Cant.</th>
                                                        <th className="px-4 py-3 text-right">Subtotal</th>
                                                        <th className="px-4 py-3 text-center">Audit</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                                    {selectedSaleItems.length === 0 && !loadingItems && (
                                                        <tr>
                                                            <td colSpan={4} className="px-4 py-8 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">No hay ítems para mostrar</td>
                                                        </tr>
                                                    )}
                                                    {selectedSaleItems.map((item, idx) => (
                                                        <tr key={idx} className={clsx("bg-white dark:bg-background", item?.isVoided && "bg-rose-500/5 opacity-50")}>
                                                            <td className="px-4 py-3">
                                                                <p className={clsx("font-bold text-slate-900 dark:text-slate-200 text-xs tracking-tight", item?.isVoided && "line-through")}>{item?.productName || 'N/A'}</p>
                                                                {item?.isVoided && <p className="text-[8px] font-black text-rose-500 uppercase mt-0.5 animate-pulse">Devolución Procesada</p>}
                                                            </td>
                                                            <td className="px-4 py-3 text-center"><span className="font-mono font-black text-blue-500 dark:text-blue-400 text-xs">x{item?.quantity ?? 0}</span></td>
                                                            <td className="px-4 py-3 text-right"><span className="font-mono font-black text-slate-900 dark:text-white text-xs tabular-nums">{item?.subtotal?.toFixed(2) ?? '0.00'}</span></td>
                                                            <td className="px-4 py-3 text-center">
                                                                {!item?.isVoided && sale.status !== 'VOIDED' && (
                                                                    <button onClick={() => promptReturnItem(sale, idx)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all active:scale-90"><CornerUpLeft size={16} /></button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="bg-slate-900 dark:bg-black text-white">
                                                    <tr>
                                                        <td colSpan={2} className="px-4 py-5 text-left text-[9px] font-black uppercase tracking-[0.2em] text-white/40 italic">Monto de Liquidación Final</td>
                                                        <td colSpan={2} className="px-4 py-5 text-right">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-xl font-black tracking-tighter tabular-nums text-yellow-500"><span className="text-[10px] mr-1 opacity-50 uppercase font-semibold">Bs</span>{sale.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                                <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mt-1">Status: {sale.status === 'COMPLETED' ? 'OPERACION_EXITOSA' : 'OPERACION_REVERSADA'}</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>

                                    {/* CUOTAS Section */}
                                    {sale.metodoPago === 'CUOTAS' && (
                                        <div className="p-5 bg-purple-500/5 border border-purple-500/20 rounded-2xl space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <CreditCard size={16} className="text-purple-500" />
                                                    <span className="text-[10px] font-black text-purple-500 uppercase tracking-widest">Plan de Cuotas</span>
                                                </div>
                                                <span className="text-[9px] font-black text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
                                                    {Number(sale.installments) || '?'} cuotas
                                                </span>
                                            </div>

                                            {/* Summary */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div className="bg-white dark:bg-white/5 p-3 rounded-xl border border-slate-100 dark:border-white/10 text-center">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Venta</p>
                                                    <p className="text-sm font-black text-slate-900 dark:text-white tabular-nums">Bs. {sale.total.toFixed(2)}</p>
                                                </div>
                                                <div className="bg-white dark:bg-white/5 p-3 rounded-xl border border-emerald-200 dark:border-emerald-500/20 text-center">
                                                    <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-1">Adelanto</p>
                                                    <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums">Bs. {(Number(sale.adelanto) || 0).toFixed(2)}</p>
                                                </div>
                                                <div className="bg-white dark:bg-white/5 p-3 rounded-xl border border-purple-200 dark:border-purple-500/20 text-center">
                                                    <p className="text-[8px] font-black text-purple-500 uppercase tracking-widest mb-1">Financiado</p>
                                                    <p className="text-sm font-black text-purple-600 dark:text-purple-400 tabular-nums">Bs. {(sale.total - (Number(sale.adelanto) || 0)).toFixed(2)}</p>
                                                </div>
                                            </div>

                                            {/* Installments List */}
                                            {saleInstallments.length > 0 ? (
                                                <div className="space-y-1.5">
                                                    {saleInstallments.map(cuota => {
                                                        const due = cuota.dueDate instanceof Date ? cuota.dueDate : cuota.dueDate && 'toDate' in cuota.dueDate ? cuota.dueDate.toDate() : new Date();
                                                        return (
                                                            <div key={cuota.id} className={clsx(
                                                                "flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all",
                                                                cuota.status === 'PAID' ? "bg-emerald-500/5 border-emerald-500/15" :
                                                                cuota.status === 'OVERDUE' ? "bg-rose-500/5 border-rose-500/15" :
                                                                "bg-white dark:bg-white/5 border-slate-100 dark:border-white/5"
                                                            )}>
                                                                <div className="flex items-center gap-3">
                                                                    <span className={clsx(
                                                                        "w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black shrink-0",
                                                                        cuota.status === 'PAID' ? "bg-emerald-500 text-white" :
                                                                        cuota.status === 'OVERDUE' ? "bg-rose-500 text-white" :
                                                                        "bg-slate-200 dark:bg-slate-700 text-slate-500"
                                                                    )}>
                                                                        {cuota.installmentNumber}
                                                                    </span>
                                                                    <div>
                                                                        <p className={clsx(
                                                                            "text-[11px] font-bold tabular-nums",
                                                                            cuota.status === 'PAID' ? "text-emerald-600 dark:text-emerald-400 line-through" :
                                                                            "text-slate-900 dark:text-white"
                                                                        )}>
                                                                            Bs. {cuota.amount.toFixed(2)}
                                                                        </p>
                                                                        <p className="text-[9px] text-slate-400 tabular-nums">
                                                                            Vence: {due.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <span className={clsx(
                                                                    "text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full",
                                                                    cuota.status === 'PAID' ? "text-emerald-500 bg-emerald-500/10" :
                                                                    cuota.status === 'OVERDUE' ? "text-rose-500 bg-rose-500/10" :
                                                                    "text-amber-500 bg-amber-500/10"
                                                                )}>
                                                                    {cuota.status === 'PAID' ? 'Pagada' : cuota.status === 'OVERDUE' ? 'Vencida' : 'Pendiente'}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-[9px] text-slate-400 text-center py-2">Cargando cuotas...</p>
                                            )}
                                        </div>
                                    )}

                                    <div className="bg-slate-50 dark:bg-black/20 p-4 rounded-2xl flex items-center justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest border border-slate-100 dark:border-white/10">
                                        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span>Agente: {(sale.usuarioNombre || 'SISTEMA_CORE').toUpperCase()}</span></div>
                                        <div className="font-mono tracking-tighter">REF_LOG: {sale.id?.toUpperCase()}</div>
                                    </div>

                                    {sale.status === 'VOIDED' && (
                                        <div className="p-5 bg-rose-500/5 border border-rose-500/20 rounded-2xl space-y-3">
                                            <div className="flex items-center gap-2 text-rose-500"><AlertTriangle size={18} /><span className="text-[10px] font-black uppercase tracking-widest">Justificación de Anulación</span></div>
                                            <div className="bg-white dark:bg-black/40 p-4 rounded-xl border border-rose-500/10 italic text-xs text-slate-600 dark:text-slate-400">&quot;{sale.voidReason || 'Anulación de sistema sin comentario adicional.'}&quot;</div>
                                        </div>
                                    )}
                                </div>

                                <div className="p-6 border-t border-slate-100 dark:border-white/10 bg-white dark:bg-background flex flex-col md:flex-row gap-3">
                                    {sale.status !== 'VOIDED' ? (
                                        <>
                                            <button className="flex-1 flex items-center justify-center gap-3 py-4 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] hover:opacity-90 shadow-2xl transition-all" onClick={() => handlePrint(sale)}><Printer size={18} /> IMPRIMIR COMPROBANTE</button>
                                            <button disabled={isVoiding === sale.id} className="shrink-0 flex items-center justify-center gap-3 px-8 py-4 bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] transition-all" onClick={() => promptVoidSale(sale)}>{isVoiding === sale.id ? <div className="animate-spin border-2 border-current border-t-transparent rounded-full h-4 w-4" /> : <RotateCcw size={18} />} ANULAR</button>
                                        </>
                                    ) : (
                                        <div className="w-full py-4 text-center bg-rose-500/5 rounded-2xl border border-rose-500/10 border-dashed"><p className="text-[9px] font-black text-rose-500/50 uppercase tracking-[0.3em]">Registro en modo Solo Lectura - Transacción Histórica</p></div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })(),
                document.body
            )}

            {/* Void / Return Modal - Portal & Suite Pro Styling */}
            {voidModal.isOpen && voidModal.sale && typeof document !== 'undefined' && createPortal(
                (() => {
                    return (
                        <div onClick={voidDismiss.onBackdropClick} className="fixed inset-0 z-1100 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-in fade-in zoom-in-95 duration-200">
                            <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-background rounded-[28px] w-full max-w-sm shadow-[0_32px_128px_-20px_rgba(0,0,0,0.8)] overflow-hidden border border-white/10 flex flex-col scale-in-center relative">
                                <button onClick={closeVoidModal} className="absolute top-3 right-3 p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl transition-all z-10"><X size={16} className="text-slate-400" /></button>
                                <div className={clsx("p-8 flex flex-col items-center text-center", voidModal.type === 'SALE' ? "bg-rose-500/5" : "bg-amber-500/5")}>
                                    <div className={clsx("w-16 h-16 rounded-3xl flex items-center justify-center mb-6 shadow-2xl rotate-3", voidModal.type === 'SALE' ? "bg-rose-500 text-white" : "bg-amber-500 text-white")}><AlertTriangle size={32} /></div>
                                    <h3 className={clsx("text-xl font-black uppercase tracking-tighter mb-2", voidModal.type === 'SALE' ? "text-rose-500" : "text-amber-500")}>{voidModal.type === 'SALE' ? 'Protocolo de Anulación' : 'Reversión de Item'}</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium px-4 leading-relaxed">{voidModal.type === 'SALE' ? 'Esta acción invalidará la venta por completo y restaurará el inventario asociado.' : 'El stock de este producto será reintegrado automáticamente.'}</p>
                                </div>
                                <div className="p-8 space-y-4">
                                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2.5 px-1">Justificación Obligatoria <span className="text-rose-500">*</span></label>
                                    <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Indique el motivo técnico..." className="w-full bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/10 rounded-2xl p-4 text-xs dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-yellow-500 resize-none h-28 outline-none transition-all" autoFocus />
                                </div>
                                <div className="p-6 pt-0 flex gap-3">
                                    <button onClick={() => setVoidModal({ isOpen: false, type: 'SALE', sale: null })} className="flex-1 py-4 bg-slate-100 dark:bg-white/5 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
                                    <button onClick={confirmVoidAction} disabled={!voidReason.trim()} className={clsx("flex-[1.5] py-4 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-30 flex justify-center items-center shadow-xl", voidModal.type === 'SALE' ? "bg-rose-500 shadow-rose-500/20" : "bg-amber-500 shadow-amber-500/20")}>Ejecutar Protocolo</button>
                                </div>
                            </div>
                        </div>
                    );
                })(),
                document.body
            )}
        </>
    );
}

