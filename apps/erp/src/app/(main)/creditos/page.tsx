'use client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineModuleGuard } from '@/components/common/OfflineModuleGuard';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePagination } from '@/hooks/usePagination';
import { InstallmentService } from '@/services/InstallmentService';
import { ClientService } from '@/services/ClientService';
import { CashierSessionService } from '@/services/CashierSessionService';
import { Installment, Client, InstallmentPaymentHistory } from '@/types';
import { Banknote, AlertTriangle, CheckCircle2, Clock, Download, Calendar, Loader2, ShoppingBag, RefreshCw, TrendingUp, History } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { toast } from 'sonner';
import { Timestamp } from 'firebase/firestore';
import clsx from 'clsx';
import IndustrialModal, { IndustrialTheme } from '@/components/common/IndustrialModal';
import { downloadCSV } from '@/utils/csvExport';
import { formatUserName } from '@/utils/formatUserName';
import NumericInput from '@/components/common/NumericInput';
import { PrintService } from '@/services/PrintService';
import { startOfDay, endOfDay } from '@/lib/utils';

// Suite Pro v4.0 Components
import ModuleHeader from '@/components/common/ModuleHeader';
import KpiCard from '@/components/common/KpiCard';
import FilterBar from '@/components/common/FilterBar';
import TableFooter from '@/components/common/TableFooter';

type StatusFilter = 'ALL' | 'PENDING' | 'OVERDUE' | 'PAID';

type CreditSummary = {
    saleId: string;
    clientId: string;
    clientName: string;
    saleTotal: number;
    totalRemaining: number;
    productsSummary: string;
    adelanto?: number;
    branchId: string;
    createdAt: Timestamp;
    status: 'PENDING' | 'OVERDUE' | 'PAID';
    paidCount: number;
    pendingCount: number;
    totalInstallments: number;
    nextDueDate?: Date;
    nextUnpaidInstallment?: Installment;
    installments: Installment[];
};

function ensureDate(val: Date | Timestamp | { seconds: number } | undefined): Date {
    if (!val) return new Date();
    if (val instanceof Date) return val;
    if (val instanceof Timestamp) return val.toDate();
    if ('seconds' in val) return new Date(val.seconds * 1000);
    return new Date();
}

export default function CreditosPage() {
    const { isOnline } = useNetworkStatus();
    const { user: currentUser } = useAuth();
    const { currentBranch, branches, isConsolidatedView, loading: branchLoading } = useBranch();

    const [installments, setInstallments] = useState<Installment[]>([]);
    const [clients, setClients] = useState<Record<string, Client>>({});
    const [loading, setLoading] = useState(true);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [branchFilter, setBranchFilter] = useState<string>('all');
    const [clientFilter, setClientFilter] = useState<string>('all');
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'dueDate'>('newest');


    // Payment modal
    const [payingInstallment, setPayingInstallment] = useState<Installment | null>(null);
    const [payAmount, setPayAmount] = useState<number>(0);
    const [payMethod, setPayMethod] = useState<'EFECTIVO' | 'QR' | 'TRANSFERENCIA'>('EFECTIVO');
    const [payNotes, setPayNotes] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Refinance modal
    const [refinancingInstallment, setRefinancingInstallment] = useState<Installment | null>(null);
    const [refinanceCount, setRefinanceCount] = useState<number>(2);
    const [isRefinancing, setIsRefinancing] = useState(false);

    // Payment history
    const [paymentHistory, setPaymentHistory] = useState<Array<{ id: string; amount: number; method: string; date: unknown; userName: string; notes?: string }>>([]);
    const [creditPaymentHistory, setCreditPaymentHistory] = useState<InstallmentPaymentHistory[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [selectedCredit, setSelectedCredit] = useState<CreditSummary | null>(null);
    const [isCreditDetailsLoading, setIsCreditDetailsLoading] = useState(false);


    const loadData = useCallback(async () => {
        if (branchLoading) return;
        setLoading(true);
        try {
            const branchId = isConsolidatedView
                ? (branchFilter === 'all' ? undefined : branchFilter)
                : currentBranch?.id;

            // Mark overdue first 
            await InstallmentService.markOverdue(branchId);

            const [cuotas, allClients] = await Promise.all([
                InstallmentService.getByBranch(branchId),
                ClientService.getAllClients(),
            ]);
            setInstallments(cuotas.filter(c => c.status !== 'CANCELLED'));

            const clientMap: Record<string, Client> = {};
            allClients.forEach(c => { if (c.id) clientMap[c.id] = c; });
            setClients(clientMap);
        } catch (error) {
            console.error('Error loading installments:', error);
            toast.error('Error al cargar cuotas pendientes');
        } finally {
            setLoading(false);
        }
    }, [branchLoading, isConsolidatedView, branchFilter, currentBranch?.id]);

    useEffect(() => { loadData(); }, [loadData]);

    // KPIs
    const kpis = useMemo(() => {
        const pending = installments.filter(i => i.status === 'PENDING');
        const overdue = installments.filter(i => i.status === 'OVERDUE');
        const paid = installments.filter(i => i.status === 'PAID');
        return {
            totalPending: pending.reduce((s, i) => s + i.remainingBalance, 0),
            totalOverdue: overdue.reduce((s, i) => s + i.remainingBalance, 0),
            countPending: pending.length,
            countOverdue: overdue.length,
            countPaid: paid.length,
            totalCollected: paid.reduce((s, i) => s + (i.amount - i.remainingBalance), 0),
        };
    }, [installments]);

    const credits = useMemo(() => {
        const grouped = new Map<string, CreditSummary>();

        installments.forEach(inst => {
            const existing = grouped.get(inst.saleId);
            const dueDate = ensureDate(inst.dueDate);
            const status = inst.status === 'OVERDUE' ? 'OVERDUE' : (inst.status === 'PAID' ? 'PAID' : 'PENDING');

            if (!existing) {
                grouped.set(inst.saleId, {
                    saleId: inst.saleId,
                    clientId: inst.clientId,
                    clientName: inst.clientName,
                    saleTotal: inst.saleTotal || inst.totalAmount,
                    totalRemaining: inst.remainingBalance,
                    productsSummary: inst.productsSummary,
                    adelanto: inst.adelanto,
                    branchId: inst.branchId,
                    createdAt: inst.createdAt,
                    status,
                    paidCount: inst.status === 'PAID' ? 1 : 0,
                    pendingCount: inst.status === 'PAID' ? 0 : 1,
                    totalInstallments: inst.installmentsTotal,
                    nextDueDate: inst.status !== 'PAID' ? dueDate : undefined,
                    nextUnpaidInstallment: inst.status !== 'PAID' ? inst : undefined,
                    installments: [inst],
                });
                return;
            }

            existing.totalRemaining += inst.remainingBalance;
            existing.paidCount += inst.status === 'PAID' ? 1 : 0;
            existing.pendingCount += inst.status === 'PAID' ? 0 : 1;
            existing.status = existing.status === 'OVERDUE' || status === 'OVERDUE' ? 'OVERDUE' : (existing.status === 'PENDING' || status === 'PENDING' ? 'PENDING' : 'PAID');
            existing.installments.push(inst);

            if (inst.status !== 'PAID') {
                const currentNext = existing.nextDueDate ? ensureDate(existing.nextDueDate) : undefined;
                if (!currentNext || dueDate < currentNext) {
                    existing.nextDueDate = dueDate;
                    existing.nextUnpaidInstallment = inst;
                }
            }
        });

        return Array.from(grouped.values()).map(credit => {
            if (credit.status !== 'PAID' && credit.pendingCount === 0) {
                credit.status = 'PAID';
            }
            return credit;
        });
    }, [installments]);

    // Unique clients for filter dropdown
    const clientOptions = useMemo(() => {
        const seen = new Map<string, string>();
        credits.forEach(credit => {
            if (!seen.has(credit.clientId)) {
                const c = clients[credit.clientId];
                seen.set(credit.clientId, c?.razonSocial || credit.clientName || 'Sin nombre');
            }
        });
        return Array.from(seen.entries()).map(([id, name]) => ({ label: name, value: id })).sort((a, b) => a.label.localeCompare(b.label));
    }, [credits, clients]);

    // Filtered + sorted data
    const filteredCredits = useMemo(() => {
        const result = credits.filter(credit => {
            const client = clients[credit.clientId];
            const matchesSearch = !searchTerm ||
                (client?.razonSocial || credit.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (client?.nit || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                credit.saleId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (credit.productsSummary || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'ALL' || credit.status === statusFilter;
            const matchesClient = clientFilter === 'all' || credit.clientId === clientFilter;
            const due = credit.nextDueDate || ensureDate(credit.createdAt);
            const matchesDateStart = !dateStart || due >= startOfDay(dateStart);
            const matchesDateEnd = !dateEnd || due <= endOfDay(dateEnd);
            return matchesSearch && matchesStatus && matchesClient && matchesDateStart && matchesDateEnd;
        });
        result.sort((a, b) => {
            if (sortOrder === 'newest') return ensureDate(b.createdAt).getTime() - ensureDate(a.createdAt).getTime();
            if (sortOrder === 'oldest') return ensureDate(a.createdAt).getTime() - ensureDate(b.createdAt).getTime();
            return ensureDate((a.nextDueDate || a.createdAt)).getTime() - ensureDate((b.nextDueDate || b.createdAt)).getTime();
        });
        return result;
    }, [credits, clients, searchTerm, statusFilter, clientFilter, dateStart, dateEnd, sortOrder]);

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paged } = usePagination(filteredCredits, 20);

    // Payment modal handlers
    const openPayModal = (credit: CreditSummary) => {
        const inst = credit.nextUnpaidInstallment;
        if (!inst) return;
        setPayingInstallment(inst);
        setPayAmount(credit.totalRemaining);
        setPayMethod('EFECTIVO');
        setPayNotes('');
        // Load payment history for selected installment
        setLoadingHistory(true);
        InstallmentService.getPaymentHistory(inst.id)
            .then(h => setPaymentHistory(h as typeof paymentHistory))
            .catch(() => setPaymentHistory([]))
            .finally(() => setLoadingHistory(false));
    };

    const openCreditDetails = async (credit: CreditSummary) => {
        setSelectedCredit(credit);
        setCreditPaymentHistory([]);
        setIsCreditDetailsLoading(true);
        try {
            const history = await InstallmentService.getPaymentHistoryBySale(credit.saleId);
            setCreditPaymentHistory(history as InstallmentPaymentHistory[]);
        } catch (error) {
            console.error('Error cargando historial de crédito:', error);
            toast.error('Error al cargar el historial de pagos del crédito');
            setCreditPaymentHistory([]);
        } finally {
            setIsCreditDetailsLoading(false);
        }
    };

    const handlePrintCreditReceipt = async () => {
        if (!selectedCredit) return;
        setIsProcessing(true);
        try {
            await PrintService.printCreditReceipt({
                credit: selectedCredit,
                paymentHistory: creditPaymentHistory,
                branchName: currentBranch?.name,
            });
            toast.success('Recibo de deuda generado correctamente');
        } catch (error) {
            console.error('Error imprimiendo recibo de deuda:', error);
            toast.error('Error al generar el recibo de deuda');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRefinance = async () => {
        if (!refinancingInstallment || !currentUser || refinanceCount < 2) return;
        setIsRefinancing(true);
        try {
            await InstallmentService.refinance(
                refinancingInstallment.id,
                refinanceCount,
                currentUser.uid,
                refinancingInstallment.branchId
            );
            toast.success(`Cuota refinanciada en ${refinanceCount} nuevas cuotas`);
            setRefinancingInstallment(null);
            await loadData();
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Error al refinanciar');
        } finally {
            setIsRefinancing(false);
        }
    };

    // Calculate total remaining for all unpaid sibling cuotas
    const siblingCuotasForModal = useMemo(() => {
        if (!payingInstallment) return [];
        return installments
            .filter(i => i.saleId === payingInstallment.saleId && i.status !== 'PAID')
            .sort((a, b) => a.installmentNumber - b.installmentNumber);
    }, [payingInstallment, installments]);

    const totalRemainingAllCuotas = useMemo(() => {
        return siblingCuotasForModal.reduce((s, i) => s + i.remainingBalance, 0);
    }, [siblingCuotasForModal]);

    if (!isOnline) return <OfflineModuleGuard moduleName="Créditos"><span/></OfflineModuleGuard>;

    const handlePay = async () => {
        if (!payingInstallment || payAmount <= 0 || !currentUser) return;
        if (payAmount > totalRemainingAllCuotas) {
            toast.error(`El monto no puede superar la deuda total (Bs. ${totalRemainingAllCuotas.toFixed(2)})`);
            return;
        }
        // Validar caja abierta en la sucursal actual (compartida)
        const shift = await CashierSessionService.getOperableSession(currentUser.uid, currentBranch?.id);
        if (!shift || (currentBranch?.id && shift.branchId !== currentBranch.id)) {
            toast.error('Debes abrir una sesión de caja en esta sucursal antes de cobrar la cuota.');
            return;
        }
        setIsProcessing(true);
        try {
            const branchId = payingInstallment.branchId;

            // Distribute payment across cuotas starting from the selected one
            let remaining = payAmount;
            const cuotasToPayIn = siblingCuotasForModal.filter(c => {
                // Start from selected cuota, then continue to next ones
                return c.installmentNumber >= payingInstallment.installmentNumber;
            });
            // Also include earlier unpaid cuotas (if any overdue before selected)
            const earlierUnpaid = siblingCuotasForModal.filter(c => c.installmentNumber < payingInstallment.installmentNumber);
            const orderedCuotas = [...cuotasToPayIn, ...earlierUnpaid];

            let cuotasPaidCount = 0;
            for (const cuota of orderedCuotas) {
                if (remaining <= 0) break;
                const toPay = Math.min(remaining, cuota.remainingBalance);
                await InstallmentService.registerPayment(
                    cuota.id,
                    toPay,
                    payMethod,
                    currentUser.uid,
                    currentUser.email || 'Admin',
                    branchId,
                    payNotes || `Cobro desde módulo de Créditos${orderedCuotas.length > 1 ? ' (pago múltiple)' : ''}`
                );
                remaining = Number((remaining - toPay).toFixed(2));
                if (toPay >= cuota.remainingBalance) cuotasPaidCount++;
            }

            // Generate receipt
            const client = clients[payingInstallment.clientId];
            const allSiblings = installments.filter(i => i.saleId === payingInstallment.saleId);
            const paidAfter = allSiblings.filter(i => i.status === 'PAID').length + cuotasPaidCount;
            const pendingAfter = allSiblings.length - paidAfter;
            const totalDebtRemaining = totalRemainingAllCuotas - payAmount;
            const nextCuota = allSiblings
                .filter(i => i.status !== 'PAID' && !orderedCuotas.slice(0, cuotasPaidCount).some(p => p.id === i.id))
                .sort((a, b) => ensureDate(a.dueDate).getTime() - ensureDate(b.dueDate).getTime())[0];

            try {
                await PrintService.printInstallmentReceipt({
                    installment: payingInstallment,
                    paidAmount: payAmount,
                    paymentMethod: payMethod,
                    clientName: client?.razonSocial || payingInstallment.clientName || 'Cliente',
                    clientNit: client?.nit,
                    paidCuotas: paidAfter,
                    pendingCuotas: pendingAfter,
                    totalDebtRemaining: Math.max(0, totalDebtRemaining),
                    nextDueDate: nextCuota ? ensureDate(nextCuota.dueDate) : undefined,
                    branchName: currentBranch?.name,
                    cashierName: currentUser.email || undefined,
                    notes: payNotes || undefined,
                });
            } catch { /* receipt generation is non-blocking */ }

            toast.success(cuotasPaidCount > 1 ? `${cuotasPaidCount} cuotas pagadas exitosamente` : 'Cobro registrado exitosamente');
            setPayingInstallment(null);
            await loadData();
        } catch (error) {
            console.error(error);
            toast.error('Error al registrar cobro');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleExport = () => {
        if (filteredCredits.length === 0) { toast.error('No hay datos para exportar'); return; }
        const headers = ['Cliente', 'NIT', 'Venta', 'Deuda Total', 'Restante', 'Vencimiento Próximo', 'Estado', 'Cuotas Pendientes'];
        const rows = filteredCredits.map(credit => {
            const c = clients[credit.clientId];
            return [
                c?.razonSocial || '-',
                c?.nit || '-',
                credit.saleId,
                credit.saleTotal.toFixed(2),
                credit.totalRemaining.toFixed(2),
                credit.nextDueDate ? credit.nextDueDate.toLocaleDateString('es-BO') : '-',
                credit.status,
                `${credit.pendingCount}/${credit.totalInstallments}`,
            ];
        });
        downloadCSV('cuentas_corrientes', headers, rows);
        toast.success('Exportado a CSV');
    };

    const statusBadge = (status: string) => {
        switch (status) {
            case 'PAID': return <span className="px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-500 border border-blue-500/20">Pagada</span>;
            case 'OVERDUE': return <span className="px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-500 border border-rose-500/20">Vencida</span>;
            default: return <span className="px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border border-yellow-500/20">Pendiente</span>;
        }
    };

    const theme: IndustrialTheme = 'stealth';

    return (
        <div className="space-y-4 sm:space-y-6 p-2 sm:p-4 md:p-6 animate-in fade-in duration-500">
            {/* Module Header */}
            <ModuleHeader
                title="Créditos"
                subtitle="Control de cuotas y cartera de cobranza"
                icon={Banknote}
                actions={[
                    { label: 'Exportar', onClick: handleExport, icon: Download, variant: 'outline' },
                ]}
            />

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <KpiCard label="Pendiente" value={kpis.totalPending} prefix="Bs." color="amber" icon={Clock} secondaryLabel="Cuotas" secondaryValue={kpis.countPending} />
                <KpiCard label="Vencido" value={kpis.totalOverdue} prefix="Bs." color="red" icon={AlertTriangle} secondaryLabel="Cuotas" secondaryValue={kpis.countOverdue} />
                <KpiCard label="Cobrado" value={kpis.totalCollected} prefix="Bs." color="blue" icon={CheckCircle2} secondaryLabel="Cuotas" secondaryValue={kpis.countPaid} />
                <KpiCard label="Cartera Total" value={kpis.totalPending + kpis.totalOverdue} prefix="Bs." color="gold" icon={Banknote} highlight />
            </div>

            {/* Filters */}
            <div data-tour="creditos-filters">
            <FilterBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Buscar cliente, NIT o venta..."
                filters={[
                    {
                        id: 'status',
                        label: 'Estado',
                        value: statusFilter,
                        options: [
                            { label: 'Todos', value: 'ALL' },
                            { label: 'Pendiente', value: 'PENDING' },
                            { label: 'Vencida', value: 'OVERDUE' },
                            { label: 'Pagada', value: 'PAID' },
                        ],
                        onChange: (v) => setStatusFilter(v as StatusFilter),
                    },
                    {
                        id: 'client',
                        label: 'Cliente',
                        value: clientFilter,
                        options: [
                            { label: 'Todos', value: 'all' },
                            ...clientOptions,
                        ],
                        onChange: setClientFilter,
                    },
                    {
                        id: 'sort',
                        label: 'Orden',
                        value: sortOrder,
                        options: [
                            { label: 'Más recientes', value: 'newest' },
                            { label: 'Más antiguas', value: 'oldest' },
                            { label: 'Por vencimiento', value: 'dueDate' },
                        ],
                        onChange: (v) => setSortOrder(v as 'newest' | 'oldest' | 'dueDate'),
                    },
                    ...(isConsolidatedView ? [{
                        id: 'branch',
                        label: 'Sucursal',
                        value: branchFilter,
                        options: [
                            { label: 'Todas', value: 'all' },
                            ...branches.filter(b => b.id).map(b => ({ label: b.name, value: b.id as string })),
                        ],
                        onChange: setBranchFilter,
                    }] : []),
                ]}
                dateRange={{
                    start: dateStart,
                    end: dateEnd,
                    onStartChange: setDateStart,
                    onEndChange: setDateEnd,
                }}
                onClear={() => { setSearchTerm(''); setStatusFilter('ALL'); setBranchFilter('all'); setClientFilter('all'); setDateStart(''); setDateEnd(''); setSortOrder('newest'); }}
                isDirty={!!searchTerm || statusFilter !== 'ALL' || branchFilter !== 'all' || clientFilter !== 'all' || !!dateStart || !!dateEnd || sortOrder !== 'newest'}
            />
            </div>

            {/* Table */}
            <div data-tour="creditos-table" className="bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
                        <Loader2 className="animate-spin" size={20} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Cargando cartera...</span>
                    </div>
                ) : filteredCredits.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-400">
                        <CheckCircle2 size={32} />
                        <p className="text-[10px] font-black uppercase tracking-widest">Sin créditos activos</p>
                    </div>
                ) : (
                    <>
                        {/* Desktop Table (lg+) */}
                        <div className="hidden lg:block overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-[#111827]">
                                        {[
                                            { label: 'Cliente', className: '' },
                                            { label: 'Venta', className: 'hidden xl:table-cell' },
                                            { label: 'Deuda total', className: 'hidden xl:table-cell' },
                                            { label: 'Restante', className: '' },
                                            { label: 'Vencimiento', className: 'hidden xl:table-cell' },
                                            { label: 'Estado', className: '' },
                                            { label: 'Acciones', className: '' },
                                        ].map(h => (
                                            <th key={h.label} className={clsx('px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500', h.className)}>{h.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                    {paged.map(credit => {
                                        const client = clients[credit.clientId];
                                        const due = credit.nextDueDate || ensureDate(credit.createdAt);
                                        const isOverdue = credit.status === 'OVERDUE';
                                        return (
                                            <tr key={credit.saleId} className={clsx(
                                                "transition-colors hover:bg-slate-50/50 dark:hover:bg-white/2",
                                                isOverdue && "bg-rose-50/30 dark:bg-rose-950/10"
                                            )}>
                                                <td className="px-4 py-3">
                                                    <p className="text-xs font-bold uppercase text-slate-900 dark:text-white">{client?.razonSocial || credit.clientName || 'Sin nombre'}</p>
                                                    <p className="text-[10px] text-slate-400">{client?.nit || '-'}</p>
                                                </td>
                                                <td className="px-4 py-3 hidden xl:table-cell">
                                                    <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">VEN-{credit.saleId?.slice(-8).toUpperCase()}</p>
                                                    {credit.productsSummary && (
                                                        <p className="text-[9px] text-slate-400 wrap-break-word" title={credit.productsSummary}>{credit.productsSummary}</p>
                                                    )}
                                                    <p className="text-[9px] text-slate-400 mt-1">Cuotas {credit.pendingCount}/{credit.totalInstallments}</p>
                                                </td>
                                                <td className="px-4 py-3 hidden xl:table-cell">
                                                    <span className="text-xs font-black tabular-nums text-slate-900 dark:text-white">{credit.saleTotal.toFixed(2)} Bs.</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={clsx(
                                                        "text-xs font-black tabular-nums",
                                                        credit.totalRemaining > 0 ? "text-amber-600 dark:text-amber-500" : "text-blue-500"
                                                    )}>{credit.totalRemaining.toFixed(2)} Bs.</span>
                                                </td>
                                                <td className="px-4 py-3 hidden xl:table-cell">
                                                    <div className="flex items-center gap-1.5">
                                                        <Calendar size={12} className="text-slate-400" />
                                                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">{due.toLocaleDateString('es-BO')}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">{statusBadge(credit.status)}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex gap-1 flex-wrap">
                                                        {credit.nextUnpaidInstallment && (
                                                            <button
                                                                data-tour="creditos-cobrar"
                                                                onClick={() => openPayModal(credit)}
                                                                className="h-8 px-3 rounded-xl bg-yellow-500 text-black text-[9px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-sm"
                                                            >
                                                                Cobrar
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => openCreditDetails(credit)}
                                                            className="h-8 px-3 rounded-xl border border-slate-200 dark:border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                                                        >
                                                            Detalles
                                                        </button>
                                                        {credit.nextUnpaidInstallment && (
                                                            <button
                                                                onClick={() => { setRefinancingInstallment(credit.nextUnpaidInstallment as Installment); setRefinanceCount(2); }}
                                                                className="h-8 px-2 rounded-xl border border-purple-500/30 text-purple-500 text-[9px] font-black uppercase tracking-widest hover:bg-purple-500/10 active:scale-95 transition-all"
                                                                title="Refinanciar"
                                                            >
                                                                <RefreshCw size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Cards */}
                        <div className="lg:hidden divide-y divide-slate-100 dark:divide-white/5">
                            {paged.map(credit => {
                                const client = clients[credit.clientId];
                                const due = credit.nextDueDate || ensureDate(credit.createdAt);
                                return (
                                    <div key={credit.saleId} className={clsx(
                                        "p-4 space-y-3",
                                        credit.status === 'OVERDUE' && "bg-rose-50/30 dark:bg-rose-950/10"
                                    )}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-xs font-bold uppercase text-slate-900 dark:text-white">{client?.razonSocial || credit.clientName || 'Sin nombre'}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">VEN-{credit.saleId?.slice(-8).toUpperCase()}</p>
                                                {credit.productsSummary && (
                                                    <p className="text-[9px] text-slate-400 mt-0.5 wrap-break-word">{credit.productsSummary}</p>
                                                )}
                                            </div>
                                            {statusBadge(credit.status)}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Deuda total</p>
                                                <p className="text-sm font-black tabular-nums text-slate-900 dark:text-white">{credit.saleTotal.toFixed(2)} Bs.</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Restante</p>
                                                <p className="text-sm font-black tabular-nums text-amber-600 dark:text-amber-500">{credit.totalRemaining.toFixed(2)} Bs.</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-[9px] text-slate-400">Próximo vencimiento</p>
                                                <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{due.toLocaleDateString('es-BO')}</p>
                                            </div>
                                            <div className="text-[9px] text-slate-400">Cuotas {credit.pendingCount}/{credit.totalInstallments}</div>
                                        </div>
                                        <div className="flex gap-1.5 flex-wrap">
                                            {credit.nextUnpaidInstallment && (
                                                <button
                                                    onClick={() => openPayModal(credit)}
                                                    className="flex-1 h-9 rounded-xl bg-yellow-500 text-black text-[9px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-sm"
                                                >
                                                    Cobrar
                                                </button>
                                            )}
                                            <button
                                                onClick={() => openCreditDetails(credit)}
                                                className="flex-1 h-9 rounded-xl border border-slate-200 dark:border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                                            >
                                                Detalles
                                            </button>
                                            {credit.nextUnpaidInstallment && (
                                                <button
                                                    onClick={() => { setRefinancingInstallment(credit.nextUnpaidInstallment as Installment); setRefinanceCount(2); }}
                                                    className="h-9 w-9 rounded-xl border border-purple-500/30 text-purple-500 flex items-center justify-center hover:bg-purple-500/10 active:scale-95 transition-all"
                                                >
                                                    <RefreshCw size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <TableFooter
                            totalItems={filteredCredits.length}
                            itemsPerPage={itemsPerPage}
                            onChangeItemsPerPage={setItemsPerPage}
                            currentPage={currentPage}
                            onChangePage={setCurrentPage}
                            totalPages={totalPages}
                            label="Créditos"
                        />
                    </>
                )}
            </div>

            {/* Payment Modal */}
            {payingInstallment && (() => {
                const client = clients[payingInstallment.clientId];
                const siblingCuotas = installments.filter(i => i.saleId === payingInstallment.saleId);
                const paidCount = siblingCuotas.filter(i => i.status === 'PAID').length;
                const pendingCount = siblingCuotas.filter(i => i.status !== 'PAID').length;
                const totalRemaining = totalRemainingAllCuotas;
                const amountExceedsBalance = payAmount > totalRemaining;

                return (
                <IndustrialModal
                    isOpen={!!payingInstallment}
                    onClose={() => setPayingInstallment(null)}
                    title="Cobro de Cuota"
                    subtitle={`CUOTA ${payingInstallment.installmentNumber}/${payingInstallment.installmentsTotal} • ${(client?.razonSocial || payingInstallment.clientName || 'CLIENTE').toUpperCase()}`}
                    icon={<Banknote size={20} />}
                    theme={theme}
                    maxWidth="max-w-md"
                    footer={
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => setPayingInstallment(null)}
                                className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handlePay}
                                disabled={isProcessing || payAmount <= 0 || amountExceedsBalance}
                                className="flex-2 h-12 rounded-xl bg-yellow-500 text-black text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
                            >
                                {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                                Confirmar Cobro
                            </button>
                        </div>
                    }
                >
                    <div className="space-y-5">
                        {/* Sale context */}
                        <div className="p-3 bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/20 rounded-xl space-y-2">
                            <div className="flex items-center gap-2 mb-1">
                                <ShoppingBag size={14} className="text-purple-500" />
                                <span className="text-[9px] font-black text-purple-500 uppercase tracking-widest">Venta Original</span>
                            </div>
                            <div className="flex justify-between text-[10px] font-bold">
                                <span className="text-slate-500 dark:text-slate-400">Total venta</span>
                                <span className="text-slate-900 dark:text-white tabular-nums">Bs. {(payingInstallment.saleTotal || payingInstallment.totalAmount).toFixed(2)}</span>
                            </div>
                            {payingInstallment.productsSummary && (
                                <p className="text-[9px] text-slate-400 leading-relaxed">{payingInstallment.productsSummary}</p>
                            )}
                            <div className="flex gap-3 pt-1">
                                <span className="text-[9px] font-bold text-blue-500">Pagadas: {paidCount}</span>
                                <span className="text-[9px] font-bold text-amber-500">Pendientes: {pendingCount}</span>
                            </div>
                            {payingInstallment.adelanto != null && payingInstallment.adelanto > 0 && (
                                <div className="flex justify-between text-[10px] font-bold pt-1">
                                    <span className="text-emerald-500">Adelanto pagado</span>
                                    <span className="text-emerald-500 tabular-nums">Bs. {payingInstallment.adelanto.toFixed(2)}</span>
                                </div>
                            )}
                        </div>

                        {/* All Installments Timeline — reactive preview */}
                        <div className="p-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl space-y-1.5">
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2">
                                Detalle de Cuotas {payAmount > 0 && <span className="text-blue-500 normal-case">(vista previa del pago)</span>}
                            </p>
                            {(() => {
                                // Compute preview: simulate distributing payAmount across cuotas
                                const sorted = [...siblingCuotas].sort((a, b) => a.installmentNumber - b.installmentNumber);
                                // Build payment order: selected cuota first, then remaining by number
                                const unpaidInOrder = sorted.filter(c => c.status !== 'PAID');
                                const fromSelected = unpaidInOrder.filter(c => c.installmentNumber >= payingInstallment.installmentNumber);
                                const beforeSelected = unpaidInOrder.filter(c => c.installmentNumber < payingInstallment.installmentNumber);
                                const payOrder = [...fromSelected, ...beforeSelected];
                                
                                let remaining = payAmount;
                                const previewMap = new Map<string, { newBalance: number; previewStatus: 'WILL_PAY' | 'PARTIAL' | 'NO_CHANGE' }>();
                                for (const c of payOrder) {
                                    if (remaining <= 0) {
                                        previewMap.set(c.id, { newBalance: c.remainingBalance, previewStatus: 'NO_CHANGE' });
                                    } else if (remaining >= c.remainingBalance) {
                                        previewMap.set(c.id, { newBalance: 0, previewStatus: 'WILL_PAY' });
                                        remaining = Number((remaining - c.remainingBalance).toFixed(2));
                                    } else {
                                        previewMap.set(c.id, { newBalance: Number((c.remainingBalance - remaining).toFixed(2)), previewStatus: 'PARTIAL' });
                                        remaining = 0;
                                    }
                                }

                                return sorted.map(cuota => {
                                    const preview = previewMap.get(cuota.id);
                                    const isPaid = cuota.status === 'PAID';
                                    const willFullyPay = preview?.previewStatus === 'WILL_PAY';
                                    const willPartialPay = preview?.previewStatus === 'PARTIAL';
                                    const isSelected = cuota.id === payingInstallment.id;

                                    return (
                                        <div
                                            key={cuota.id}
                                            className={clsx(
                                                "flex items-center justify-between px-3 py-2 rounded-xl border transition-all",
                                                isPaid ? "bg-emerald-500/5 border-emerald-500/10"
                                                : willFullyPay ? "bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20"
                                                : willPartialPay ? "bg-blue-500/10 border-blue-500/30 ring-1 ring-blue-500/20"
                                                : isSelected ? "bg-yellow-500/10 border-yellow-500/30 ring-1 ring-yellow-500/20"
                                                : cuota.status === 'OVERDUE' ? "bg-rose-500/5 border-rose-500/10"
                                                : "bg-white dark:bg-white/5 border-slate-100 dark:border-white/5"
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={clsx(
                                                    "w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black",
                                                    isPaid ? "bg-emerald-500 text-white"
                                                    : willFullyPay ? "bg-emerald-500 text-white"
                                                    : willPartialPay ? "bg-blue-500 text-white"
                                                    : isSelected ? "bg-yellow-500 text-black"
                                                    : cuota.status === 'OVERDUE' ? "bg-rose-500 text-white"
                                                    : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                                                )}>
                                                    {cuota.installmentNumber}
                                                </span>
                                                <div>
                                                    <p className={clsx(
                                                        "text-[10px] font-bold tabular-nums",
                                                        isPaid ? "text-emerald-600 dark:text-emerald-400 line-through"
                                                        : willFullyPay ? "text-emerald-600 dark:text-emerald-400 line-through"
                                                        : willPartialPay ? "text-blue-600 dark:text-blue-400"
                                                        : isSelected ? "text-yellow-600 dark:text-yellow-400"
                                                        : "text-slate-700 dark:text-slate-300"
                                                    )}>
                                                        Bs. {cuota.remainingBalance.toFixed(2)}
                                                        {willPartialPay && preview && (
                                                            <span className="text-blue-500 ml-1">→ {preview.newBalance.toFixed(2)}</span>
                                                        )}
                                                    </p>
                                                    <p className="text-[8px] text-slate-400 tabular-nums">
                                                        {ensureDate(cuota.dueDate).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={clsx(
                                                "text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded",
                                                isPaid ? "text-emerald-500 bg-emerald-500/10"
                                                : willFullyPay ? "text-emerald-500 bg-emerald-500/10"
                                                : willPartialPay ? "text-blue-500 bg-blue-500/10"
                                                : cuota.status === 'OVERDUE' ? "text-rose-500 bg-rose-500/10"
                                                : isSelected ? "text-yellow-500 bg-yellow-500/10"
                                                : "text-slate-400 bg-slate-100 dark:bg-white/5"
                                            )}>
                                                {isPaid ? 'Pagada'
                                                : willFullyPay ? 'Se paga'
                                                : willPartialPay ? 'Parcial'
                                                : cuota.status === 'OVERDUE' ? 'Vencida'
                                                : isSelected ? 'Cobrando'
                                                : 'Pendiente'}
                                            </span>
                                        </div>
                                    );
                                });
                            })()}
                        </div>

                        {/* Installment Info */}
                        <div className="p-4 bg-slate-900 border border-white/5 rounded-2xl">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-500 shrink-0">
                                        <Banknote size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Saldo Cuota {payingInstallment.installmentNumber}</p>
                                        <p className="text-xl font-black text-white tabular-nums">{payingInstallment.remainingBalance.toFixed(2)} <span className="text-[10px] text-slate-400">Bs.</span></p>
                                        {payingInstallment.lateFee && payingInstallment.lateFee > 0 && (
                                            <p className="text-[9px] font-bold text-rose-400 mt-0.5">Mora: +Bs. {payingInstallment.lateFee.toFixed(2)}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Vence</p>
                                    <p className="text-[11px] font-bold text-slate-300 tabular-nums">{ensureDate(payingInstallment.dueDate).toLocaleDateString('es-BO')}</p>
                                </div>
                            </div>
                        </div>

                        {/* Payment History */}
                        {paymentHistory.length > 0 && (
                            <div className="p-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl space-y-2">
                                <div className="flex items-center gap-2">
                                    <History size={12} className="text-slate-400" />
                                    <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Historial de Pagos</p>
                                </div>
                                {loadingHistory ? (
                                    <div className="flex items-center gap-2 text-slate-400 text-[10px]"><Loader2 className="animate-spin" size={12} /> Cargando...</div>
                                ) : (
                                    paymentHistory.map((p, i) => (
                                        <div key={p.id || i} className="flex justify-between items-center px-2 py-1.5 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5">
                                            <div>
                                                <p className="text-[10px] font-bold text-emerald-600 tabular-nums">Bs. {p.amount.toFixed(2)} — {p.method}</p>
                                                <p className="text-[8px] text-slate-400">{formatUserName(p.userName)}{p.notes ? ` • ${p.notes}` : ''}</p>
                                            </div>
                                            <p className="text-[9px] text-slate-400 tabular-nums">{ensureDate(p.date as Timestamp).toLocaleDateString('es-BO')}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* Payment Method */}
                        <div>
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">Método de Pago</p>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    { value: 'EFECTIVO' as const, label: 'Efectivo' },
                                    { value: 'QR' as const, label: 'QR' },
                                    { value: 'TRANSFERENCIA' as const, label: 'Transfer.' },
                                ]).map(m => (
                                    <button
                                        key={m.value}
                                        onClick={() => setPayMethod(m.value)}
                                        className={clsx(
                                            "h-11 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all active:scale-95",
                                            payMethod === m.value
                                                ? "bg-yellow-500 text-black border-yellow-500 shadow-lg"
                                                : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 hover:bg-slate-50 dark:hover:bg-white/10"
                                        )}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Amount */}
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Monto a Cobrar (Bs.)</p>
                                <div className="flex gap-2">
                                    {payAmount !== payingInstallment.remainingBalance && (
                                        <button
                                            onClick={() => setPayAmount(payingInstallment.remainingBalance)}
                                            className="text-[9px] font-bold text-blue-500 uppercase hover:underline"
                                        >
                                            Esta cuota
                                        </button>
                                    )}
                                    {pendingCount > 1 && payAmount !== totalRemaining && (
                                        <button
                                            onClick={() => setPayAmount(totalRemaining)}
                                            className="text-[9px] font-bold text-emerald-500 uppercase hover:underline"
                                        >
                                            Pagar todo
                                        </button>
                                    )}
                                </div>
                            </div>
                            <NumericInput
                                value={payAmount || ''}
                                onChange={(val) => setPayAmount(Number(val))}
                                className={clsx(
                                    "w-full h-12 px-4 rounded-xl border bg-white dark:bg-white/5 text-lg font-black tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 transition-all",
                                    amountExceedsBalance
                                        ? "border-rose-500 focus:ring-rose-500"
                                        : "border-slate-200 dark:border-white/10 focus:ring-yellow-500"
                                )}
                            />
                            {payAmount > payingInstallment.remainingBalance && payAmount <= totalRemaining && (
                                <p className="text-[9px] font-bold text-blue-500 mt-1">El pago cubrirá múltiples cuotas automáticamente</p>
                            )}
                            {amountExceedsBalance && (
                                <p className="text-[9px] font-bold text-rose-500 mt-1">El monto supera la deuda total (máx. Bs. {totalRemaining.toFixed(2)})</p>
                            )}
                        </div>

                        {/* Notes */}
                        <div>
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">Notas (Opcional)</p>
                            <input
                                type="text"
                                value={payNotes}
                                onChange={e => setPayNotes(e.target.value)}
                                placeholder="Observaciones del cobro..."
                                className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                            />
                        </div>
                    </div>
                </IndustrialModal>
                );
            })()}

            {/* Refinance Modal */}
            {refinancingInstallment && (() => {
                const client = clients[refinancingInstallment.clientId];
                const remaining = refinancingInstallment.remainingBalance;
                const newAmt = Number((remaining / refinanceCount).toFixed(2));
                return (
                    <IndustrialModal
                        isOpen={!!refinancingInstallment}
                        onClose={() => setRefinancingInstallment(null)}
                        title="Refinanciar Cuota"
                        subtitle={`${(client?.razonSocial || refinancingInstallment.clientName || 'CLIENTE').toUpperCase()} • CUOTA ${refinancingInstallment.installmentNumber}/${refinancingInstallment.installmentsTotal}`}
                        icon={<RefreshCw size={20} />}
                        theme={theme}
                        maxWidth="max-w-sm"
                        footer={
                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setRefinancingInstallment(null)}
                                    className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleRefinance}
                                    disabled={isRefinancing}
                                    className="flex-2 h-12 rounded-xl bg-purple-500 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isRefinancing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                                    Refinanciar
                                </button>
                            </div>
                        }
                    >
                        <div className="space-y-5">
                            <div className="p-4 bg-slate-900 border border-white/5 rounded-2xl">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Saldo a Refinanciar</p>
                                <p className="text-2xl font-black text-white tabular-nums">{remaining.toFixed(2)} <span className="text-sm text-slate-400">Bs.</span></p>
                            </div>

                            <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Nuevas Cuotas</p>
                                <div className="grid grid-cols-4 gap-2">
                                    {[2, 3, 4, 6].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setRefinanceCount(n)}
                                            className={clsx(
                                                "py-3 rounded-xl font-black text-sm border-2 transition-all",
                                                refinanceCount === n
                                                    ? "border-purple-500 bg-purple-500/10 text-purple-600"
                                                    : "border-slate-100 dark:border-white/10 text-slate-400"
                                            )}
                                        >
                                            {n}x
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/10 space-y-1.5">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Plan Nuevo</p>
                                {Array.from({ length: refinanceCount }, (_, i) => {
                                    const dueDate = new Date();
                                    dueDate.setMonth(dueDate.getMonth() + i + 1);
                                    const amt = i === refinanceCount - 1
                                        ? Number((remaining - newAmt * (refinanceCount - 1)).toFixed(2))
                                        : newAmt;
                                    return (
                                        <div key={i} className="flex justify-between text-[10px] px-2 py-1.5 bg-white dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5">
                                            <span className="text-slate-400 font-bold">Cuota {i + 1} — {dueDate.toLocaleDateString('es-BO', { month: 'short', year: 'numeric' })}</span>
                                            <span className="text-purple-600 dark:text-purple-400 font-bold tabular-nums">Bs. {amt.toFixed(2)}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            <p className="text-[9px] text-slate-400 leading-relaxed">
                                La cuota original será cancelada y reemplazada por {refinanceCount} nuevas cuotas con vencimiento mensual.
                            </p>
                        </div>
                    </IndustrialModal>
                );
            })()}

            {selectedCredit && (
                <IndustrialModal
                    isOpen={!!selectedCredit}
                    onClose={() => { setSelectedCredit(null); setCreditPaymentHistory([]); }}
                    title="Detalles del Crédito"
                    subtitle={`VEN-${selectedCredit.saleId?.slice(-8).toUpperCase()} · ${(clients[selectedCredit.clientId]?.razonSocial || selectedCredit.clientName || 'Cliente').toUpperCase()}`}
                    icon={<ShoppingBag size={20} />}
                    theme={theme}
                    maxWidth="max-w-2xl"
                    footer={
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => { setSelectedCredit(null); setCreditPaymentHistory([]); }}
                                className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                            >
                                Cerrar
                            </button>
                            <button
                                onClick={handlePrintCreditReceipt}
                                disabled={isCreditDetailsLoading || isProcessing}
                                className="flex-2 h-12 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                                Imprimir Recibo
                            </button>
                        </div>
                    }
                >
                    <div className="space-y-5">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl space-y-3">
                                <div className="space-y-2">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Resumen del Crédito</p>
                                    <div className="grid grid-cols-2 gap-3 text-[10px] text-slate-600">
                                        <div className="space-y-1">
                                            <p className="font-bold text-slate-900">Venta total</p>
                                            <p>Bs. {selectedCredit.saleTotal.toFixed(2)}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="font-bold text-slate-900">Saldo restante</p>
                                            <p className="text-amber-600">Bs. {selectedCredit.totalRemaining.toFixed(2)}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="font-bold text-slate-900">Cuotas pagadas</p>
                                            <p>{selectedCredit.paidCount}/{selectedCredit.totalInstallments}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="font-bold text-slate-900">Próximo vencimiento</p>
                                            <p>{selectedCredit.nextDueDate ? selectedCredit.nextDueDate.toLocaleDateString('es-BO') : 'Sin cuotas pendientes'}</p>
                                        </div>
                                    </div>
                                </div>
                                {selectedCredit.productsSummary && (
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Productos</p>
                                        <p className="text-[10px] text-slate-600 leading-relaxed">{selectedCredit.productsSummary}</p>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl space-y-3">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Datos del Cliente</p>
                                <div className="space-y-1 text-[10px] text-slate-600">
                                    <p className="font-bold text-slate-900">{clients[selectedCredit.clientId]?.razonSocial || selectedCredit.clientName || 'Sin nombre'}</p>
                                    <p>NIT: {clients[selectedCredit.clientId]?.nit || 'No disponible'}</p>
                                    <p>Sucursal: {branches.find(b => b.id === selectedCredit.branchId)?.name || 'General'}</p>
                                    <p>Estado: {selectedCredit.status === 'PAID' ? 'Pagada' : selectedCredit.status === 'OVERDUE' ? 'Vencida' : 'Pendiente'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid lg:grid-cols-2 gap-4">
                            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Plan de Cuotas</p>
                                    <span className="text-[9px] font-bold text-slate-500">{selectedCredit.totalInstallments} cuotas</span>
                                </div>
                                <div className="space-y-2">
                                    {selectedCredit.installments.sort((a, b) => a.installmentNumber - b.installmentNumber).map(cuota => (
                                        <div key={cuota.id} className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5">
                                            <div>
                                                <p className="text-[10px] font-black text-slate-900">Cuota {cuota.installmentNumber}</p>
                                                <p className="text-[9px] text-slate-500">Vence {ensureDate(cuota.dueDate).toLocaleDateString('es-BO')}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-black tabular-nums">Bs. {cuota.remainingBalance.toFixed(2)}</p>
                                                <p className={clsx(
                                                    'text-[8px] font-black uppercase tracking-[0.2em]',
                                                    cuota.status === 'PAID' ? 'text-emerald-600' : cuota.status === 'OVERDUE' ? 'text-rose-500' : 'text-yellow-600'
                                                )}>{cuota.status === 'PAID' ? 'Pagada' : cuota.status === 'OVERDUE' ? 'Vencida' : 'Pendiente'}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Historial de Pagos</p>
                                    <span className="text-[9px] font-bold text-slate-500">{creditPaymentHistory.length} registros</span>
                                </div>
                                {isCreditDetailsLoading ? (
                                    <div className="flex items-center gap-2 text-slate-400 text-[10px]"><Loader2 className="animate-spin" size={14} /> Cargando historial...</div>
                                ) : creditPaymentHistory.length === 0 ? (
                                    <div className="text-[10px] text-slate-500">Aún no hay pagos registrados para este crédito.</div>
                                ) : (
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {creditPaymentHistory.map((payment, index) => (
                                            <div key={`${payment.id}-${index}`} className="p-3 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-[10px] font-black text-slate-900">Bs. {payment.amount.toFixed(2)}</p>
                                                        <p className="text-[8px] text-slate-400">{payment.method} · Cuota {payment.installmentNumber}</p>
                                                    </div>
                                                    <p className="text-[9px] text-slate-500 tabular-nums">{ensureDate(payment.date).toLocaleDateString('es-BO')}</p>
                                                </div>
                                                <p className="text-[8px] text-slate-500 mt-1">{formatUserName(payment.userName)}{payment.notes ? ` · ${payment.notes}` : ''}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </IndustrialModal>
            )}

            {/* Portfolio / Aging Dashboard */}
            {!loading && installments.length > 0 && (() => {
                const now = new Date();
                const aging = {
                    current: 0,
                    days30: 0,
                    days60: 0,
                    days90: 0,
                    over90: 0,
                };
                const monthlyProjection: Record<string, number> = {};

                installments.filter(i => i.status !== 'PAID').forEach(inst => {
                    const due = ensureDate(inst.dueDate);
                    const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                    
                    if (diffDays <= 0) aging.current += inst.remainingBalance;
                    else if (diffDays <= 30) aging.days30 += inst.remainingBalance;
                    else if (diffDays <= 60) aging.days60 += inst.remainingBalance;
                    else if (diffDays <= 90) aging.days90 += inst.remainingBalance;
                    else aging.over90 += inst.remainingBalance;

                    // Monthly projections (upcoming)
                    if (inst.status !== 'PAID') {
                        const monthKey = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}`;
                        monthlyProjection[monthKey] = (monthlyProjection[monthKey] || 0) + inst.remainingBalance;
                    }
                });

                const totalPortfolio = aging.current + aging.days30 + aging.days60 + aging.days90 + aging.over90;
                const maxAging = Math.max(aging.current, aging.days30, aging.days60, aging.days90, aging.over90, 1);

                const sortedMonths = Object.entries(monthlyProjection).sort(([a], [b]) => a.localeCompare(b)).slice(0, 6);
                const maxMonthly = Math.max(...sortedMonths.map(([, v]) => v), 1);

                return (
                    <div className="bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-white/10 flex items-center gap-3">
                            <TrendingUp size={18} className="text-slate-400" />
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Análisis de Cartera</h3>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Aging + Proyección Mensual</p>
                            </div>
                        </div>
                        <div className="p-4 grid md:grid-cols-2 gap-6">
                            {/* Aging Analysis */}
                            <div className="space-y-3">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Antigüedad de Cartera</p>
                                {[
                                    { label: 'Al día', value: aging.current, color: 'bg-emerald-500' },
                                    { label: '1-30 días', value: aging.days30, color: 'bg-yellow-500' },
                                    { label: '31-60 días', value: aging.days60, color: 'bg-amber-500' },
                                    { label: '61-90 días', value: aging.days90, color: 'bg-orange-500' },
                                    { label: '+90 días', value: aging.over90, color: 'bg-rose-500' },
                                ].map(bucket => (
                                    <div key={bucket.label} className="space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold">
                                            <span className="text-slate-500">{bucket.label}</span>
                                            <span className="text-slate-700 dark:text-slate-300 tabular-nums">Bs. {bucket.value.toFixed(2)} ({totalPortfolio > 0 ? Math.round(bucket.value / totalPortfolio * 100) : 0}%)</span>
                                        </div>
                                        <div className="h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                            <div className={clsx("h-full rounded-full transition-all", bucket.color)} style={{ width: `${(bucket.value / maxAging) * 100}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Monthly Projection */}
                            <div className="space-y-3">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Cobranza Proyectada</p>
                                {sortedMonths.length === 0 ? (
                                    <p className="text-[10px] text-slate-400">Sin cuotas futuras</p>
                                ) : sortedMonths.map(([month, value]) => {
                                    const [y, m] = month.split('-');
                                    const monthName = new Date(Number(y), Number(m) - 1).toLocaleDateString('es-BO', { month: 'short', year: 'numeric' });
                                    return (
                                        <div key={month} className="space-y-1">
                                            <div className="flex justify-between text-[10px] font-bold">
                                                <span className="text-slate-500 capitalize">{monthName}</span>
                                                <span className="text-slate-700 dark:text-slate-300 tabular-nums">Bs. {value.toFixed(2)}</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${(value / maxMonthly) * 100}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
