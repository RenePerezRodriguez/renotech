'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, orderBy, limit, getDocs, where, startAt, endAt, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logAdminAction } from '@/lib/audit';
import { AdminLog, Branch, AuditAlert, InventoryMovement } from '@/types';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { BranchService } from '@/services/BranchService';
import { AuditAlertService } from '@/services/AuditAlertService';
import { CashierSessionService } from '@/services/CashierSessionService';
import { CashierSession } from '@/types/treasury';
import { toast } from 'sonner';
import { promptDialog } from '@/components/common/dialogs';
import { downloadCSV } from '@/utils/csvExport';
import { normalizeText } from '@/utils/normalize';
import { ensureDate, formatDateTime } from '@/utils/dateHelpers';

export type AuditTab = 'ALERTS' | 'LOGS' | 'DISCREPANCIES' | 'KARDEX' | 'CAJA';
export type AuditStatusFilter = 'ALL' | 'READ' | 'UNREAD';
export type SortBy = 'date' | 'branch' | 'severity' | 'action' | 'user';

export interface SavedView {
    name: string;
    tab: AuditTab;
    filters: {
        searchTerm: string;
        branchFilter: string;
        actionFilter: string;
        severityFilter: string;
        statusFilter: AuditStatusFilter;
        itemsPerPage: number;
        startDate: string;
        endDate: string;
        userFilter: string;
    };
}

export interface AuditPageState {
    activeTab: AuditTab;
    searchTerm: string;
    branchFilter: string;
    actionFilter: string;
    severityFilter: string;
    statusFilter: AuditStatusFilter;
    currentPage: number;
    itemsPerPage: number;
    selectedAlert: AuditAlert | null;
    selectedLog: AdminLog | null;
    branches: Branch[];
    alerts: AuditAlert[];
    logs: AdminLog[];
    isLoading: boolean;
    newAlertsCount: number;
    savedViews: SavedView[];
    activeSavedView: string;
    actionTypes: string[];
    severityTypes: string[];
    totalItems: number;
    totalPages: number;
    pagedLogs: AdminLog[];
    pagedAlerts: AuditAlert[];
    pagedDiscrepancies: AuditAlert[];
    formatMetadataLabel: (key: string) => string;
    formatMetadataValue: (value: unknown) => string;
}

export function useAuditPage() {
    const { isHQ } = useBranch();
    const { user: currentUser } = useAuth();
    const [logs, setLogs] = useState<AdminLog[]>([]);
    const [alerts, setAlerts] = useState<AuditAlert[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [activeTab, setActiveTab] = useState<AuditTab>('ALERTS');
    const [selectedAlert, setSelectedAlert] = useState<AuditAlert | null>(null);
    const [selectedLog, setSelectedLog] = useState<AdminLog | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [userFilter, setUserFilter] = useState('ALL');

    const [branchFilter, setBranchFilter] = useState('ALL');
    const [actionFilter, setActionFilter] = useState('ALL');
    const [severityFilter, setSeverityFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState<AuditStatusFilter>('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [newAlertsCount, setNewAlertsCount] = useState(0);
    const [lastAlertCount, setLastAlertCount] = useState(0);
    const [savedViews, setSavedViews] = useState<SavedView[]>([]);
    const [activeSavedView, setActiveSavedView] = useState('');
    const [kardexMovements, setKardexMovements] = useState<InventoryMovement[]>([]);
    const [cajaSessions, setCajaSessions] = useState<CashierSession[]>([]);

    const fetchLogs = useCallback(async () => {
        const constraints: any[] = [orderBy('timestamp', 'desc'), limit(1000)];
        if (startDate) {
            const s = new Date(startDate + 'T00:00:00');
            constraints.push(where('timestamp', '>=', Timestamp.fromDate(s)));
        }
        if (endDate) {
            const e = new Date(endDate + 'T23:59:59.999');
            constraints.push(where('timestamp', '<=', Timestamp.fromDate(e)));
        }
        const q = query(collection(db, 'admin_logs'), ...constraints);
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: ensureDate(doc.data().timestamp)
        } as AdminLog));
    }, [startDate, endDate]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [logsData, alertsData, branchesData] = await Promise.all([
                fetchLogs(),
                AuditAlertService.getAlerts(branchFilter),
                BranchService.getAll()
            ]);
            setLogs(Array.isArray(logsData) ? logsData : []);
            setAlerts(Array.isArray(alertsData) ? alertsData : []);
            setBranches(Array.isArray(branchesData) ? branchesData : []);
        } catch (error) {
            console.error('Error loading audit data', error);
            toast.error('Error al cargar datos de auditoría');
            setLogs([]);
            setAlerts([]);
            setBranches([]);
        } finally {
            setIsLoading(false);
        }
    }, [branchFilter, fetchLogs]);

    const fetchKardex = useCallback(async () => {
        try {
            const mQ = query(collection(db, 'movimientos'), orderBy('date', 'desc'), limit(1000));
            const mSnap = await getDocs(mQ);
            const raw = mSnap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryMovement));
            
            // Hidratar nombres de producto desde catálogo maestro (por masterId)
            const masterIds = [...new Set(raw.map(m => m.masterId).filter(Boolean))];
            const nameMap: Record<string, string> = {};
            if (masterIds.length > 0) {
                const masterQ = query(collection(db, 'catalogo_maestro'), where('__name__', 'in', masterIds));
                const masterSnap = await getDocs(masterQ);
                masterSnap.docs.forEach(d => { nameMap[d.id] = d.data().nombre || d.id; });
            }
            // También buscar por productId directo (si no se resolvió por masterId)
            const unresolved = raw.filter(m => !nameMap[m.productId] && !nameMap[m.masterId]);
            if (unresolved.length > 0) {
                const productIds = [...new Set(unresolved.map(m => m.productId).filter(Boolean))];
                const prodQ = query(collection(db, 'productos'), where('__name__', 'in', productIds));
                const prodSnap = await getDocs(prodQ);
                prodSnap.docs.forEach(d => { nameMap[d.id] = d.data().nombre || d.id; });
            }
            
            setKardexMovements(raw.map(m => ({
                ...m,
                productName: nameMap[m.masterId] || nameMap[m.productId] || m.productId,
            } as any)));
        } catch { setKardexMovements([]); }
    }, []);

    const fetchCaja = useCallback(async () => {
        try {
            const sQ = query(collection(db, 'cashier_sessions'), orderBy('openedAt', 'desc'), limit(500));
            const sSnap = await getDocs(sQ);
            setCajaSessions(sSnap.docs.map(d => ({ id: d.id, ...d.data() } as CashierSession)));
        } catch { setCajaSessions([]); }
    }, []);

    useEffect(() => {
        loadData();
        fetchKardex();
        fetchCaja();

        if (currentUser) {
            logAdminAction(
                currentUser.uid,
                currentUser.email || '?',
                'VIEW_AUDIT_LOGS',
                'console',
                'HQ',
                'Accedió a la consola de auditoría'
            );
        }
    }, [currentUser, loadData]);

    const filteredLogs = useMemo(() => logs.filter(log => {
        const normSearch = normalizeText(searchTerm);
        const matchesSearch =
            normalizeText(log.adminEmail).includes(normSearch) ||
            normalizeText(log.action).includes(normSearch) ||
            normalizeText(log.details).includes(normSearch);
        const matchesBranch = branchFilter === 'ALL' || log.branchId === branchFilter;
        const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
        const matchesUser = userFilter === 'ALL' || log.adminEmail === userFilter;
        return matchesSearch && matchesBranch && matchesAction && matchesUser;
    }), [logs, searchTerm, branchFilter, actionFilter, userFilter]);

    const userEmails = useMemo(() => Array.from(new Set(logs.map(l => l.adminEmail))).sort(), [logs]);

    const filteredAlerts = useMemo(() => alerts.filter(alert => {
        const matchesSearch = normalizeText(alert.message).includes(normalizeText(searchTerm)) ||
            normalizeText(alert.type).includes(normalizeText(searchTerm));
        const matchesBranch = branchFilter === 'ALL' || alert.branchId === branchFilter;
        const matchesSeverity = severityFilter === 'ALL' || alert.severity === severityFilter;
        const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'READ' ? alert.isRead : !alert.isRead);
        return matchesSearch && matchesBranch && matchesSeverity && matchesStatus;
    }), [alerts, searchTerm, branchFilter, severityFilter, statusFilter]);

    const discrepancyAlerts = useMemo(() => alerts.filter(alert => {
        const t = alert.type || '';
        return t === 'TRANSFER_DISCREPANCY' || t === 'EXPENSE_LARGE' || alert.message.toLowerCase().includes('discrep');
    }), [alerts]);

    const filteredDiscrepancies = useMemo(() => discrepancyAlerts.filter(alert => {
        const matchesSearch = normalizeText(alert.message).includes(normalizeText(searchTerm)) ||
            Object.entries(alert.metadata || {}).some(([_key, value]) => normalizeText(String(value)).includes(normalizeText(searchTerm)));
        const matchesBranch = branchFilter === 'ALL' || alert.branchId === branchFilter;
        const matchesSeverity = severityFilter === 'ALL' || alert.severity === severityFilter;
        const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'READ' ? alert.isRead : !alert.isRead);
        return matchesSearch && matchesBranch && matchesSeverity && matchesStatus;
    }), [discrepancyAlerts, searchTerm, branchFilter, severityFilter, statusFilter]);

    const actionTypes = useMemo(() => Array.from(new Set(logs.map(l => l.action))).sort(), [logs]);
    const severityTypes = useMemo(() => Array.from(new Set(alerts.map(a => a.severity))).sort(), [alerts]);

    const filteredKardex = useMemo(() => kardexMovements.filter(m => {
        const matchesBranch = branchFilter === 'ALL' || m.branchId === branchFilter;
        const matchesSearch = normalizeText(m.productId || '').includes(normalizeText(searchTerm))
            || normalizeText(m.type || '').includes(normalizeText(searchTerm))
            || normalizeText(m.reason || '').includes(normalizeText(searchTerm));
        return matchesBranch && matchesSearch;
    }), [kardexMovements, branchFilter, searchTerm]);

    const filteredCaja = useMemo(() => cajaSessions.filter(s => {
        const matchesBranch = branchFilter === 'ALL' || s.branchId === branchFilter;
        const matchesSearch = normalizeText(s.cashierName || s.cashierId || '').includes(normalizeText(searchTerm));
        return matchesBranch && matchesSearch;
    }), [cajaSessions, branchFilter, searchTerm]);

    const totalItems = useMemo(() => {
        if (activeTab === 'LOGS') return filteredLogs.length;
        if (activeTab === 'DISCREPANCIES') return filteredDiscrepancies.length;
        if (activeTab === 'KARDEX') return filteredKardex.length;
        if (activeTab === 'CAJA') return filteredCaja.length;
        return filteredAlerts.length;
    }, [activeTab, filteredLogs.length, filteredAlerts.length, filteredDiscrepancies.length, filteredKardex.length, filteredCaja.length]);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(totalItems / itemsPerPage)), [totalItems, itemsPerPage]);

    const pagedLogs = useMemo(() => filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredLogs, currentPage, itemsPerPage]);
    const pagedAlerts = useMemo(() => filteredAlerts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredAlerts, currentPage, itemsPerPage]);
    const pagedDiscrepancies = useMemo(() => filteredDiscrepancies.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredDiscrepancies, currentPage, itemsPerPage]);
    const pagedKardex = useMemo(() => filteredKardex.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredKardex, currentPage, itemsPerPage]);
    const pagedCaja = useMemo(() => filteredCaja.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredCaja, currentPage, itemsPerPage]);

    const markAlertRead = useCallback(async (alertId: string) => {
        try {
            await AuditAlertService.markAsRead(alertId);
            setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, isRead: true } : a));
            toast.success('Alerta marcada como leída');
        } catch {
            toast.error('Error al marcar como leída');
        }
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, branchFilter, actionFilter, severityFilter, statusFilter, searchTerm, itemsPerPage]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const savedViewsKey = 'auditSavedViews_v1';

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const raw = localStorage.getItem(savedViewsKey);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    setSavedViews(parsed);
                } else {
                    localStorage.removeItem(savedViewsKey);
                }
            } catch {
                localStorage.removeItem(savedViewsKey);
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(savedViewsKey, JSON.stringify(savedViews));
    }, [savedViews]);

    useEffect(() => {
        const unread = alerts.filter(alert => !alert.isRead).length;
        if (lastAlertCount && unread > lastAlertCount) {
            setNewAlertsCount(unread - lastAlertCount);
        }
        setLastAlertCount(unread);
    }, [alerts, lastAlertCount]);

    const saveCurrentView = async () => {
        const name = await promptDialog({
            title: 'Guardar vista',
            label: 'Nombre de la vista',
            placeholder: 'Ej: Caja del lunes',
            minLength: 1,
            confirmText: 'Guardar',
        });
        if (!name?.trim()) return;

        const newView: SavedView = {
            name: name.trim(),
            tab: activeTab,
            filters: {
                searchTerm,
                branchFilter,
                actionFilter,
                severityFilter,
                statusFilter,
                itemsPerPage,
                startDate,
                endDate,
                userFilter,
            }
        };

        setSavedViews(prev => [newView, ...prev.filter(v => v.name !== newView.name)]);
        setActiveSavedView(newView.name);
        toast.success('Vista guardada');
    };

    const applySavedView = (viewName: string) => {
        const view = savedViews.find(v => v.name === viewName);
        if (!view) return;

        setActiveTab(view.tab);
        setSearchTerm(view.filters.searchTerm);
        setBranchFilter(view.filters.branchFilter);
        setActionFilter(view.filters.actionFilter);
        setSeverityFilter(view.filters.severityFilter);
        setStatusFilter(view.filters.statusFilter);
        setItemsPerPage(view.filters.itemsPerPage);
        setStartDate(view.filters.startDate || '');
        setEndDate(view.filters.endDate || '');
        setUserFilter(view.filters.userFilter || 'ALL');
        setCurrentPage(1);
        setActiveSavedView(view.name);
        toast.success(`Vista '${view.name}' aplicada`);
    };

    const removeSavedView = (viewName: string) => {
        setSavedViews(prev => prev.filter(v => v.name !== viewName));
        if (activeSavedView === viewName) setActiveSavedView('');
    };

    const formatMetadataLabel = (key: string) => {
        const labels: Record<string, string> = {
            isCritical: 'Crítica',
            shiftId: 'Turno',
            endAmount: 'Monto final',
            differenceTarjeta: 'Diferencia Tarjeta',
            differenceQR: 'Diferencia QR',
            differenceEfectivo: 'Diferencia Efectivo',
            originalPrice: 'Precio original',
            discountValue: 'Valor del descuento',
            finalPrice: 'Precio final',
            transactionId: 'Transacción',
            cashAmount: 'Efectivo',
            cardAmount: 'Tarjeta',
            receiptId: 'Recibo',
        };
        return labels[key] || key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, char => char.toUpperCase());
    };

    const formatMetadataValue = (value: unknown) => {
        if (typeof value === 'boolean') return value ? 'Sí' : 'No';
        if (typeof value === 'number') return `Bs. ${value.toFixed(2)}`;
        return String(value);
    };

    const exportToCSV = () => {
        if (activeTab === 'LOGS') {
            const headers = ['Fecha', 'Usuario', 'Acción', 'Sucursal', 'Detalles'];
            const rows = filteredLogs.map(log => [
                formatDateTime(log.timestamp),
                log.adminEmail,
                log.action,
                `"${branches.find(b => b.id === log.branchId)?.name || log.branchId}"`,
                `"${log.details}"`
            ]);
            downloadCSV('auditoria_logs', headers, rows);
        } else {
            const headers = ['Fecha', 'Severidad', 'Mensaje', 'Sucursal', 'Estado'];
            const rows = filteredAlerts.map(alert => [
                formatDateTime(alert.createdAt),
                alert.severity,
                `"${alert.message}"`,
                `"${branches.find(b => b.id === alert.branchId)?.name || alert.branchId}"`,
                alert.isRead ? 'Leído' : 'Pendiente'
            ]);
            downloadCSV('auditoria_alertas', headers, rows);
        }
    };

    return {
        isHQ,
        currentUser,
        logs,
        alerts,
        branches,
        activeTab,
        searchTerm,
        branchFilter,
        actionFilter,
        severityFilter,
        statusFilter,
        currentPage,
        itemsPerPage,
        selectedAlert,
        selectedLog,
        isLoading,
        newAlertsCount,
        savedViews,
        activeSavedView,
        actionTypes,
        severityTypes,
        totalItems,
        totalPages,
        pagedLogs,
        pagedAlerts,
        pagedDiscrepancies,
        filteredLogs,
        filteredAlerts,
        filteredDiscrepancies,
        setActiveTab,
        setSearchTerm,
        setBranchFilter,
        setActionFilter,
        setSeverityFilter,
        setStatusFilter,
        setCurrentPage,
        setItemsPerPage,
        setSelectedAlert,
        setSelectedLog,
        loadData,
        saveCurrentView,
        applySavedView,
        removeSavedView,
        kardexMovements,
        cajaSessions,
        filteredKardex,
        filteredCaja,
        pagedKardex,
        pagedCaja,
        markAlertRead,
        startDate,
        endDate,
        userFilter,
        userEmails,
        setStartDate,
        setEndDate,
        setUserFilter,
        exportToCSV,
        formatMetadataLabel,
        formatMetadataValue,
    } as const;
}
