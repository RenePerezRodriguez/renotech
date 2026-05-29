'use client';

import { clsx } from 'clsx';
import { AlertTriangle, RefreshCw, Layers, ClipboardList, AlertOctagon, Shield, Download, Bookmark, Package, X, Vault } from 'lucide-react';
import ModuleHeader from '@/components/common/ModuleHeader';
import FilterBar from '@/components/common/FilterBar';
import KpiCard from '@/components/common/KpiCard';
import TableFooter from '@/components/common/TableFooter';
import IndustrialModal from '@/components/common/IndustrialModal';
import { useAuditPage, type AuditStatusFilter } from '@/hooks/useAuditPage';
import { AuditAlert, AdminLog } from '@/types';
import { ensureDate, formatDate, formatTime, formatDateTime } from '@/utils/dateHelpers';
import { formatUserName } from '@/utils/formatUserName';

type AuditPageContentProps = ReturnType<typeof useAuditPage>;

export default function AuditPageContent(props: AuditPageContentProps) {
    const {
        activeTab, alerts, branches, currentPage, exportToCSV, filteredDiscrepancies,
        isLoading, newAlertsCount, pagedAlerts, pagedDiscrepancies, pagedLogs,
        savedViews, activeSavedView, saveCurrentView, applySavedView, removeSavedView,
        formatMetadataLabel, formatMetadataValue,
        setActiveTab, setActionFilter, setBranchFilter, branchFilter,
        setCurrentPage, setItemsPerPage, setSearchTerm, setSelectedAlert, setSelectedLog,
        setSeverityFilter, setStatusFilter, severityFilter, severityTypes, statusFilter,
        actionFilter, actionTypes, searchTerm, selectedAlert, selectedLog,
        totalItems, totalPages, itemsPerPage, logs,
        pagedKardex, pagedCaja, markAlertRead,
        startDate, endDate, userFilter, userEmails, setStartDate, setEndDate, setUserFilter,
    } = props;

    const safeAlerts = alerts ?? [];
    const safeBranches = branches ?? [];
    const safeLogs = logs ?? [];
    const safeSavedViews = savedViews ?? [];
    const safeFilteredDiscrepancies = filteredDiscrepancies ?? [];

    const auditFilters = [
        {
            id: 'branch', label: 'Sede', value: branchFilter,
            onChange: (val: string) => setBranchFilter(val),
            options: [
                { label: 'Central (HQ)', value: 'HQ' },
                ...safeBranches.filter(b => b.id !== 'HQ').map(b => ({ label: b.name, value: b.id || '' }))
            ]
        },
        ...(activeTab === 'LOGS' ? [{
            id: 'action', label: 'Acción', value: actionFilter,
            onChange: (val: string) => setActionFilter(val),
            options: [{ label: 'Todas', value: 'ALL' }, ...actionTypes.map(type => ({ label: type, value: type }))]
        }, {
            id: 'user', label: 'Usuario', value: userFilter,
            onChange: (val: string) => setUserFilter(val),
            options: [{ label: 'Todos', value: 'ALL' }, ...(userEmails || []).map(e => ({ label: e, value: e }))]
        }] : []),
        ...(activeTab !== 'LOGS' && activeTab !== 'KARDEX' && activeTab !== 'CAJA' ? [{
            id: 'severity', label: 'Severidad', value: severityFilter,
            onChange: (val: string) => setSeverityFilter(val),
            options: [{ label: 'Todas', value: 'ALL' }, ...severityTypes.map(type => ({ label: type, value: type }))]
        }, {
            id: 'status', label: 'Estado', value: statusFilter,
            onChange: (val: string) => setStatusFilter(val as AuditStatusFilter),
            options: [
                { label: 'Todos', value: 'ALL' }, { label: 'Pendientes', value: 'UNREAD' }, { label: 'Leídos', value: 'READ' }
            ]
        }] : [])
    ];

    const placeholders: Record<string, string> = {
        LOGS: 'Buscar por usuario, acción o detalle...',
        KARDEX: 'Buscar por producto, tipo o motivo...',
        CAJA: 'Buscar por cajero...',
    };

    return (
        <div className="flex-1 min-w-0 w-full max-w-full p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 bg-slate-50 dark:bg-[#020617]">
            <ModuleHeader
                title="Consola Maestra de Auditoría"
                subtitle="Trazabilidad Absoluta, Integridad de Datos e Inteligencia de Seguridad"
                icon={Shield}
                actions={[
                    { label: 'Exportar Reporte', onClick: exportToCSV, icon: Download, variant: 'secondary' as const },
                    { label: 'Guardar vista', onClick: saveCurrentView, icon: Bookmark, variant: 'secondary' as const },
                    { label: 'Sincronizar', onClick: props.loadData, icon: RefreshCw, variant: 'primary' as const }
                ]}
            />

            <div data-tour="auditoria-kpis" className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.6fr] gap-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
                    <KpiCard label="Alertas no leídas" value={safeAlerts.filter(a => !a.isRead).length} icon={AlertTriangle} color="red" secondaryLabel="Críticas" secondaryValue={safeAlerts.filter(a => a.severity === 'CRITICAL').length} />
                    <KpiCard label="Discrepancias" value={safeFilteredDiscrepancies.length} icon={Layers} color="amber" secondaryLabel="Pendientes" secondaryValue={safeFilteredDiscrepancies.filter(d => !d.isRead).length} />
                    <KpiCard label="Logs Totales" value={safeLogs.length} icon={RefreshCw} color="blue" secondaryLabel="Hoy" secondaryValue={safeLogs.filter(l => { const d = ensureDate(l.timestamp); return d.toDateString() === new Date().toDateString(); }).length} />
                    <KpiCard label="Sucursales" value={safeBranches.length} icon={Shield} color="slate" secondaryLabel="Vistas" secondaryValue={safeSavedViews.length} />
                </div>

                <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827] p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <Bookmark size={12} className="text-yellow-500" />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Vistas guardadas</span>
                        </div>
                        <div className="flex gap-2">
                            <select value={activeSavedView} onChange={(e) => applySavedView(e.target.value)} className="flex-1 h-9 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700 dark:text-slate-200">
                                <option value="">— Seleccionar —</option>
                                {safeSavedViews.map(view => (<option key={view.name} value={view.name}>{view.name}</option>))}
                            </select>
                            <button onClick={saveCurrentView} className="h-9 inline-flex items-center gap-1.5 bg-yellow-500 text-black rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-yellow-400 transition"><Bookmark size={12} /> Guardar</button>
                        </div>
                        {safeSavedViews.length === 0 ? (
                            <p className="mt-2 text-[9px] text-slate-400 dark:text-slate-500">Sin vistas guardadas. Configura filtros y guarda.</p>
                        ) : (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {safeSavedViews.map(view => (
                                    <span key={view.name} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/5 text-[9px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                        {view.name}
                                        <button onClick={() => removeSavedView(view.name)} className="text-slate-400 hover:text-rose-500"><X size={10} /></button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {newAlertsCount > 0 && (
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-4 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center"><AlertOctagon size={14} className="text-emerald-600 dark:text-emerald-400" /></div>
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Nuevas alertas</div>
                                <p className="text-[10px] text-emerald-600 dark:text-emerald-400"><span className="font-black">{newAlertsCount}</span> desde tu última carga</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Trazabilidad en tiempo real</span>
                <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                <span className="text-[10px] font-bold text-slate-400">{totalItems} registros</span>
            </div>

            <div data-tour="auditoria-tabs" className="flex p-1.5 bg-slate-100 dark:bg-[#111827] rounded-2xl w-fit shrink-0 border border-slate-200 dark:border-white/10 flex-wrap gap-x-1">
                {([
                    ['ALERTS', 'Alertas', AlertTriangle, safeAlerts.some(a => !a.isRead)],
                    ['LOGS', 'Logs', RefreshCw],
                    ['DISCREPANCIES', 'Discrepancias', Layers],
                    ['KARDEX', 'Kardex', Package],
                    ['CAJA', 'Caja', Vault],
                ] as const).map(([tab, label, Icon, hasBadge]) => (
                    <button key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={clsx(
                            'relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                            activeTab === tab ? 'bg-white dark:bg-white/5 text-blue-600 dark:text-[#FFD700] shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                        )}
                    >
                        <Icon size={14} /> {label}
                        {hasBadge && (<span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-100 dark:border-white/10" />)}
                    </button>
                ))}
            </div>

            <div data-tour="auditoria-filters">
            <FilterBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder={placeholders[activeTab] || 'Buscar por mensaje, tipo, sucursal o valor...'}
                dateRange={{ start: startDate, end: endDate, onStartChange: setStartDate, onEndChange: setEndDate }}
                filters={auditFilters}
                onClear={() => {
                    setSearchTerm(''); setStartDate(''); setEndDate(''); setBranchFilter('ALL');
                    setActionFilter('ALL'); setSeverityFilter('ALL'); setStatusFilter('ALL'); setUserFilter('ALL');
                }}
                isDirty={searchTerm !== '' || startDate !== '' || endDate !== '' || branchFilter !== 'ALL' || actionFilter !== 'ALL' || severityFilter !== 'ALL' || statusFilter !== 'ALL' || userFilter !== 'ALL'}
            />
            </div>

            <div data-tour="auditoria-table" className="flex-1 overflow-hidden bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 shadow-2xl rounded-3xl flex flex-col">
                <TableFooter
                    totalItems={totalItems} itemsPerPage={itemsPerPage}
                    onChangeItemsPerPage={(v) => { setItemsPerPage(v); setCurrentPage(1); }}
                    currentPage={currentPage} onChangePage={(v) => { setCurrentPage(typeof v === 'number' ? v : v(currentPage)); }}
                    totalPages={totalPages} label="registros cargados"
                    className="border-b border-t-0 bg-white/50 dark:bg-black/10"
                />
                <div className="overflow-auto flex-1">
                    {activeTab === 'LOGS' && <LogTable {...{ isLoading, pagedLogs, formatDate, formatTime, setSelectedLog, safeBranches }} />}
                    {activeTab === 'ALERTS' && <AlertTable {...{ isLoading, pagedAlerts, formatDate, formatTime, setSelectedAlert, markAlertRead, safeBranches }} />}
                    {activeTab === 'DISCREPANCIES' && <DiscrepancyTable {...{ isLoading, pagedDiscrepancies, formatDate, formatTime, setSelectedAlert, markAlertRead, safeBranches, formatMetadataLabel, formatMetadataValue }} />}
                    {activeTab === 'KARDEX' && <KardexTable {...{ isLoading, pagedKardex: pagedKardex || [], formatDate, safeBranches }} />}
                    {activeTab === 'CAJA' && <CajaTable {...{ isLoading, pagedCaja: pagedCaja || [], formatDate, safeBranches }} />}
                </div>

                <TableFooter
                    totalItems={totalItems} itemsPerPage={itemsPerPage}
                    onChangeItemsPerPage={(v) => { setItemsPerPage(v); setCurrentPage(1); }}
                    currentPage={currentPage} onChangePage={(v) => { setCurrentPage(typeof v === 'number' ? v : v(currentPage)); }}
                    totalPages={totalPages} label="registros cargados"
                    className="border-t border-slate-200 dark:border-white/10 bg-white/50 dark:bg-black/10"
                />
            </div>

            {selectedLog && (
                <IndustrialModal isOpen={!!selectedLog} onClose={() => setSelectedLog(null)} title="Detalle de Log" subtitle={selectedLog.action} icon={<ClipboardList size={20} />} theme="cobalt" maxWidth="max-w-2xl"
                    footer={<button onClick={() => setSelectedLog(null)} className="w-full h-12 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:brightness-110 transition-all">Cerrar</button>}>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Usuario</p><p className="text-sm font-bold text-slate-900 dark:text-white">{formatUserName(selectedLog.adminEmail)}</p></div>
                            <div className="space-y-2"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Sucursal</p><p className="text-sm font-bold text-slate-900 dark:text-white">{safeBranches.find(b => b.id === selectedLog.branchId)?.name || selectedLog.branchId}</p></div>
                        </div>
                        <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Fecha</p><p className="text-sm text-slate-800 dark:text-slate-200">{formatDateTime(selectedLog.timestamp)}</p></div>
                        <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Detalles</p><p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{selectedLog.details}</p></div>
                    </div>
                </IndustrialModal>
            )}

            {selectedAlert && (
                <IndustrialModal isOpen={!!selectedAlert} onClose={() => setSelectedAlert(null)} title="Detalle de Alerta" subtitle={selectedAlert.severity} icon={<AlertOctagon size={20} />} theme="titanium" maxWidth="max-w-2xl"
                    footer={<button onClick={() => setSelectedAlert(null)} className="w-full h-12 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:brightness-110 transition-all">Cerrar</button>}>
                    <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Mensaje</p><p className="text-sm font-bold text-slate-900 dark:text-white">{selectedAlert.message}</p></div>
                        </div>
                    </div>
                </IndustrialModal>
            )}
        </div>
    );
}

/* ── Sub-componentes de tabla ── */

function LogTable({ isLoading, pagedLogs, formatDate, formatTime, setSelectedLog, safeBranches }: any) {
    return (
        <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 dark:bg-[#020617] z-20 border-b border-slate-200 dark:border-white/10">
                <tr><Th>Fecha/Hora</Th><Th>Usuario</Th><Th>Sucursal</Th><Th>Acción</Th><Th>Detalles</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {isLoading ? <SkeletonRows cols={5} /> : pagedLogs.length === 0 ? <EmptyRow colSpan={5} msg="Sin registros encontrados." /> :
                    pagedLogs.map((log: AdminLog) => (
                        <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                            <td className="px-6 py-4"><div className="text-sm font-bold text-slate-900 dark:text-white">{formatDate(log.timestamp)}</div><div className="text-[10px] font-mono text-slate-500 uppercase">{formatTime(log.timestamp)}</div></td>
                            <td className="px-6 py-4"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-black text-[10px] uppercase">{log.adminEmail[0]}</div><div className="text-sm text-slate-600 dark:text-slate-300 wrap-break-word">{formatUserName(log.adminEmail)}</div></div></td>
                            <td className="px-6 py-4"><BranchBadge branchId={log.branchId} branches={safeBranches} /></td>
                            <td className="px-6 py-4"><span className="text-[10px] font-black font-mono text-slate-900 dark:text-[#FFD700] px-3 py-1 bg-slate-100 dark:bg-[#FFD700]/10 rounded-xl border border-slate-200 dark:border-[#FFD700]/20 uppercase tracking-wider">{log.action}</span></td>
                            <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400"><div className="flex items-center justify-between gap-3"><p className="max-w-md wrap-break-word">{log.details}</p><button onClick={() => setSelectedLog(log)} className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800">Ver</button></div></td>
                        </tr>
                    ))}
            </tbody>
        </table>
    );
}

function AlertTable({ isLoading, pagedAlerts, formatDate, formatTime, setSelectedAlert, markAlertRead, safeBranches }: any) {
    return (
        <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 dark:bg-[#020617] z-20 border-b border-slate-200 dark:border-white/10">
                <tr><Th>Fecha</Th><Th>Severidad</Th><Th>Sucursal</Th><Th>Mensaje</Th><Th>Acción</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {isLoading ? <SkeletonRows cols={5} /> : pagedAlerts.length === 0 ? <EmptyRow colSpan={5} msg="Sin alertas." /> :
                    pagedAlerts.map((alert: AuditAlert) => (
                        <tr key={alert.id} className={clsx('hover:bg-slate-50 dark:hover:bg-white/5 transition-colors', !alert.isRead && 'bg-blue-50/30 dark:bg-blue-900/5')}>
                            <td className="px-6 py-4"><div className="text-sm font-bold text-slate-900 dark:text-white">{formatDate(alert.createdAt)}</div><div className="text-[10px] text-slate-500 uppercase tracking-[0.2em]">{formatTime(alert.createdAt)}</div></td>
                            <td className="px-6 py-4"><SeverityBadge severity={alert.severity} /></td>
                            <td className="px-6 py-4"><span className="text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">{safeBranches.find((b: any) => b.id === alert.branchId)?.name || alert.branchId}</span></td>
                            <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{alert.message}</td>
                            <td className="px-6 py-4"><button onClick={() => { setSelectedAlert(alert); if (!alert.isRead) markAlertRead(alert.id!); }} className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800">Ver detalle</button></td>
                        </tr>
                    ))}
            </tbody>
        </table>
    );
}

function DiscrepancyTable({ isLoading, pagedDiscrepancies, formatDate, formatTime, setSelectedAlert, markAlertRead, safeBranches, formatMetadataLabel, formatMetadataValue }: any) {
    return (
        <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 dark:bg-[#020617] z-20 border-b border-slate-200 dark:border-white/10">
                <tr><Th>Fecha</Th><Th>Mensaje</Th><Th>Sucursal</Th><Th>Discrepancias</Th><Th>Acción</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {isLoading ? <SkeletonRows cols={5} /> : pagedDiscrepancies.length === 0 ? <EmptyRow colSpan={5} msg="No hay discrepancias." /> :
                    pagedDiscrepancies.map((alert: AuditAlert) => (
                        <tr key={alert.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4"><div className="text-sm font-bold text-slate-900 dark:text-white">{formatDate(alert.createdAt)}</div><div className="text-[10px] text-slate-500 uppercase tracking-[0.2em]">{formatTime(alert.createdAt)}</div></td>
                            <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{alert.message}</td>
                            <td className="px-6 py-4"><span className="text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">{safeBranches.find((b: any) => b.id === alert.branchId)?.name || alert.branchId}</span></td>
                            <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{Object.entries(alert.metadata || {}).map(([k, v]) => `${formatMetadataLabel(k)}: ${formatMetadataValue(v)}`).join(' • ') || 'Ver detalle'}</td>
                            <td className="px-6 py-4"><button onClick={() => { setSelectedAlert(alert); if (!alert.isRead) markAlertRead(alert.id!); }} className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800">Ver detalle</button></td>
                        </tr>
                    ))}
            </tbody>
        </table>
    );
}

function KardexTable({ isLoading, pagedKardex, formatDate, safeBranches }: any) {
    return (
        <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 dark:bg-[#020617] z-20 border-b border-slate-200 dark:border-white/10">
                <tr><Th>Fecha</Th><Th>Tipo</Th><Th>Producto</Th><Th>Cantidad</Th><Th>Sucursal</Th><Th>Motivo</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {isLoading ? <SkeletonRows cols={6} /> : pagedKardex.length === 0 ? <EmptyRow colSpan={6} msg="Sin movimientos de inventario." /> :
                    pagedKardex.map((m: any) => (
                        <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4"><div className="text-xs font-bold text-slate-900 dark:text-white">{formatDate(m.date)}</div></td>
                            <td className="px-6 py-4"><span className={clsx('inline-flex items-center px-2 py-1 rounded-xl text-[9px] font-black uppercase', m.type === 'ENTRADA' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : m.type === 'SALIDA' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' : 'bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300')}>{m.type}</span></td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-800 dark:text-slate-200">{m.productName || m.productId}</td>
                            <td className="px-6 py-4 font-black tabular-nums text-slate-900 dark:text-white">{m.quantity}</td>
                            <td className="px-6 py-4"><span className="text-[10px] font-bold uppercase text-slate-500">{safeBranches.find((b: any) => b.id === m.branchId)?.name || m.branchId}</span></td>
                            <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">{m.reason || '—'}</td>
                        </tr>
                    ))}
            </tbody>
        </table>
    );
}

function CajaTable({ isLoading, pagedCaja, formatDate, safeBranches }: any) {
    return (
        <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 dark:bg-[#020617] z-20 border-b border-slate-200 dark:border-white/10">
                <tr><Th>Apertura</Th><Th>Cajero</Th><Th>Sucursal</Th><Th>Saldo inicial</Th><Th>Estado</Th><Th>Cierre</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {isLoading ? <SkeletonRows cols={6} /> : pagedCaja.length === 0 ? <EmptyRow colSpan={6} msg="Sin sesiones de caja." /> :
                    pagedCaja.map((s: any) => (
                        <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4"><div className="text-xs font-bold text-slate-900 dark:text-white">{formatDate(s.openedAt)}</div></td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-800 dark:text-slate-200">{formatUserName(s.cashierName) || s.cashierId}</td>
                            <td className="px-6 py-4"><span className="text-[10px] font-bold uppercase text-slate-500">{safeBranches.find((b: any) => b.id === s.branchId)?.name || s.branchId}</span></td>
                            <td className="px-6 py-4 font-black tabular-nums text-slate-900 dark:text-white">Bs. {(s.initialAmount || 0).toFixed(2)}</td>
                            <td className="px-6 py-4"><span className={clsx('inline-flex items-center px-2 py-1 rounded-xl text-[9px] font-black uppercase', s.closedAt ? 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400')}>{s.closedAt ? 'Cerrada' : 'Abierta'}</span></td>
                            <td className="px-6 py-4 text-xs text-slate-500">{s.closedAt ? formatDate(s.closedAt) : '—'}</td>
                        </tr>
                    ))}
            </tbody>
        </table>
    );
}

/* ── Helpers ── */

function Th({ children }: { children: React.ReactNode }) { return <th className="px-6 py-5 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{children}</th>; }
function SkeletonRows({ cols }: { cols: number }) { return Array.from({ length: 5 }).map((_, i) => (<tr key={i} className="animate-pulse"><td colSpan={cols} className="px-6 py-8"><div className="h-4 bg-slate-100 dark:bg-white/5 rounded w-full" /></td></tr>)); }
function EmptyRow({ colSpan, msg }: { colSpan: number; msg: string }) { return <tr><td colSpan={colSpan} className="px-6 py-20 text-center text-slate-500 uppercase font-black text-[10px] tracking-widest">{msg}</td></tr>; }

function SeverityBadge({ severity }: { severity: string }) {
    return (
        <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-tight',
            severity === 'CRITICAL' ? 'bg-rose-100 text-rose-600' : severity === 'HIGH' ? 'bg-orange-100 text-orange-600' : severity === 'MEDIUM' ? 'bg-yellow-100 text-amber-600' : 'bg-blue-100 text-blue-600'
        )}>{severity}</span>
    );
}

function BranchBadge({ branchId, branches }: { branchId: string; branches: any[] }) {
    return (
        <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-tight',
            branchId === 'HQ' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : branchId === 'GLOBAL' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        )}>{branches.find((b: any) => b.id === branchId)?.name || (branchId === 'HQ' ? 'CENTRAL' : branchId)}</span>
    );
}
