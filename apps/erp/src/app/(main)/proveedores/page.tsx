'use client';

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { Empresa, SupplierAccount } from '@/types';
import { EmpresaService } from '@/services/EmpresaService';
import { SupplierAccountService } from '@/services/SupplierAccountService';
import { DevolucionProveedorService, DevolucionProveedor } from '@/services/DevolucionProveedorService';
import { EmpresaModal } from '@/components/modals';
import PaySupplierModal from '@/components/modals/PaySupplierModal';
import EmpresaDrawer from '@/components/proveedores/EmpresaDrawer';
import ConfirmModal from '@/components/common/ConfirmModal';
import {
    Building2, Plus, Wallet, Search, X, RefreshCw, Loader2,
    Eye, Edit, Trash2, DollarSign,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import clsx from 'clsx';
import EmptyState from '@/components/common/EmptyState';
import ModuleHeader from '@/components/common/ModuleHeader';
import KpiCard from '@/components/common/KpiCard';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineModuleGuard } from '@/components/common/OfflineModuleGuard';
import { useBranch } from '@/contexts/BranchContext';

const fmtBob = (n?: number) =>
    new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n || 0);

export default function ProveedoresPage() {
    const { role } = useAuth();
    const isGerente = role === 'GERENTE';
    const { isOnline } = useNetworkStatus();
    const { currentBranch, isConsolidatedView, isHQ } = useBranch();

    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [accounts, setAccounts] = useState<SupplierAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [empresaModalOpen, setEmpresaModalOpen] = useState(false);
    const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
    const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
    const [recomputing, setRecomputing] = useState(false);
    const [filterMode, setFilterMode] = useState<'TODAS' | 'POR_PAGAR' | 'A_FAVOR'>('TODAS');
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; empresa: Empresa } | null>(null);
    const [deletingEmpresa, setDeletingEmpresa] = useState<Empresa | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [payingAccount, setPayingAccount] = useState<SupplierAccount | null>(null);
    const [devoluciones, setDevoluciones] = useState<DevolucionProveedor[]>([]);

    useEffect(() => {
        const u1 = EmpresaService.subscribe((data) => {
            setEmpresas(data);
            setLoading(false);
        });
        const u2 = SupplierAccountService.subscribe((data) => setAccounts(data));
        const u3 = DevolucionProveedorService.subscribeAll((data) => setDevoluciones(data));
        return () => { u1(); u2(); u3(); };
    }, []);

    // Re-sync selected empresa con el snapshot fresco para reflejar cambios.
    useEffect(() => {
        if (selectedEmpresa?.id) {
            const fresh = empresas.find((e) => e.id === selectedEmpresa.id);
            if (fresh && fresh !== selectedEmpresa) setSelectedEmpresa(fresh);
        }
    }, [empresas, selectedEmpresa]);

    // Cuentas visibles según sucursal: HQ/consolidado ve todas; sucursales solo las suyas o globales
    const visibleAccounts = useMemo(() => {
        if (isConsolidatedView || isHQ) return accounts;
        return accounts.filter(a => !a.branchId || a.branchId === currentBranch?.id);
    }, [accounts, isConsolidatedView, isHQ, currentBranch?.id]);

    // Saldo por empresa calculado desde cuentas visibles (branch-aware)
    const saldoPorEmpresa = useMemo(() => {
        const map = new Map<string, number>();
        for (const a of visibleAccounts) {
            if (!a.empresaId) continue;
            map.set(a.empresaId, (map.get(a.empresaId) || 0) + (a.saldo || 0));
        }
        return map;
    }, [visibleAccounts]);

    const filteredEmpresas = useMemo(() => {
        const q = search.trim().toLowerCase();
        let base = empresas;
        if (filterMode === 'POR_PAGAR') {
            base = empresas.filter((e) => (saldoPorEmpresa.get(e.id!) || 0) > 0);
        } else if (filterMode === 'A_FAVOR') {
            base = empresas.filter((e) => (saldoPorEmpresa.get(e.id!) || 0) < 0);
        }
        if (!q) return base;
        const empIdsViaCuenta = new Set(
            visibleAccounts
                .filter((a) =>
                    a.nit?.toLowerCase().includes(q) ||
                    a.alias?.toLowerCase().includes(q) ||
                    a.razonSocial?.toLowerCase().includes(q)
                )
                .map((a) => a.empresaId)
        );
        return base.filter((e) =>
            e.nombre.toLowerCase().includes(q) || empIdsViaCuenta.has(e.id!)
        );
    }, [empresas, visibleAccounts, saldoPorEmpresa, search, filterMode]);

    const stats = useMemo(() => {
        const totalPorPagar = empresas.reduce((s, e) => s + Math.max(0, saldoPorEmpresa.get(e.id!) || 0), 0);
        const totalAFavor = empresas.reduce((s, e) => s + Math.min(0, saldoPorEmpresa.get(e.id!) || 0), 0);
        const totalDevuelto = devoluciones.reduce((s, d) => s + (d.totalValue || 0), 0);
        return {
            empresas: empresas.length,
            cuentas: visibleAccounts.length,
            saldoTotal: empresas.reduce((sum, e) => sum + (saldoPorEmpresa.get(e.id!) || 0), 0),
            porPagar: totalPorPagar,
            aFavor: Math.abs(totalAFavor),
            porPagarCount: empresas.filter((e) => (saldoPorEmpresa.get(e.id!) || 0) > 0).length,
            devuelto: totalDevuelto,
        };
    }, [empresas, accounts, devoluciones]);

    const handleRecompute = async () => {
        setRecomputing(true);
        try {
            const n = await EmpresaService.recomputeAllMetrics();
            toast.success(`Métricas recalculadas (${n} empresas)`);
        } catch {
            toast.error('Error al recalcular');
        } finally {
            setRecomputing(false);
        }
    };

    const openContextMenu = (e: React.MouseEvent, emp: Empresa) => {
        e.preventDefault();
        const PAD = 8;
        const W = 220;
        const H = 220;
        const x = Math.min(e.clientX, window.innerWidth - W - PAD);
        const y = Math.min(e.clientY, window.innerHeight - H - PAD);
        setCtxMenu({ x, y, empresa: emp });
    };

    /**
     * Inicia el pago a una empresa desde el menú contextual.
     * - Si la empresa tiene 1 sola cuenta: abre PaySupplierModal directo.
     * - Si tiene múltiples: abre el drawer para que el usuario elija qué cuenta pagar.
     */
    const handlePayFromContext = (emp: Empresa) => {
        const empAccounts = accounts.filter(a => a.empresaId === emp.id && a.isActive !== false);
        if (empAccounts.length === 0) {
            toast.error('Esta empresa no tiene cuentas activas para pagar.');
            return;
        }
        if (empAccounts.length === 1) {
            setPayingAccount(empAccounts[0]);
        } else {
            // Priorizar la cuenta con mayor saldo positivo (más deuda).
            const sorted = [...empAccounts].sort((a, b) => (b.saldo || 0) - (a.saldo || 0));
            if ((sorted[0].saldo || 0) > 0) {
                setPayingAccount(sorted[0]);
                toast.info(`${empAccounts.length} cuentas: pagando la de mayor deuda. Usa "Ver detalles" para elegir otra.`);
            } else {
                setSelectedEmpresa(emp);
                toast.info('Selecciona la cuenta a pagar desde el detalle.');
            }
        }
    };

    const handleDeleteEmpresa = async () => {
        if (!deletingEmpresa?.id) return;
        setDeleteLoading(true);
        try {
            await EmpresaService.softDelete(deletingEmpresa.id);
            toast.success('Empresa eliminada');
            setDeletingEmpresa(null);
        } catch {
            toast.error('Error al eliminar empresa');
        } finally {
            setDeleteLoading(false);
        }
    };

    if (!isOnline) return <OfflineModuleGuard moduleName="Proveedores"><span/></OfflineModuleGuard>;

    return (
        <div className="flex-1 min-w-0 w-full max-w-full p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 lg:space-y-8 bg-slate-50 dark:bg-background">
            <ModuleHeader
                title="Empresas y Cuentas"
                subtitle="Proveedores agrupados por empresa con cuentas múltiples"
                icon={Building2}
                actions={isGerente ? [
                    {
                        label: 'Nueva Empresa',
                        onClick: () => setEmpresaModalOpen(true),
                        icon: Plus,
                        variant: 'primary' as const,
                        dataTourId: 'proveedores-new-btn',
                    },
                ] : []}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <KpiCard label="Empresas" value={stats.empresas} icon={Building2} progress={100} color="purple" />
                <KpiCard
                    label={`Por Pagar (${stats.porPagarCount})`}
                    value={fmtBob(stats.porPagar)}
                    icon={Wallet}
                    progress={100}
                    color="red"
                />
                <KpiCard
                    label="A Favor (BOB)"
                    value={fmtBob(stats.aFavor)}
                    icon={Wallet}
                    progress={100}
                    color="green"
                />
                <KpiCard
                    label="Devuelto (BOB)"
                    value={fmtBob(stats.devuelto)}
                    icon={Wallet}
                    progress={100}
                    color="amber"
                />
            </div>

            {/* Tabs filtro */}
            <div data-tour="proveedores-tabs" className="flex items-center gap-2 flex-wrap">
                {[
                    { v: 'TODAS' as const, label: 'Todas', count: stats.empresas },
                    { v: 'POR_PAGAR' as const, label: 'Por pagar', count: stats.porPagarCount },
                    { v: 'A_FAVOR' as const, label: 'A favor', count: empresas.filter(e => (saldoPorEmpresa.get(e.id!) || 0) < 0).length },
                ].map(t => (
                    <button
                        key={t.v}
                        onClick={() => setFilterMode(t.v)}
                        className={`flex items-center gap-2 px-4 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            filterMode === t.v
                                ? t.v === 'POR_PAGAR'
                                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                                    : t.v === 'A_FAVOR'
                                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                        : 'bg-slate-900 dark:bg-white text-white dark:text-black'
                                : 'bg-white dark:bg-[#111827] text-slate-500 hover:text-slate-700 border border-slate-200 dark:border-white/10'
                        }`}
                    >
                        <span>{t.label}</span>
                        <span className="px-1.5 py-0.5 rounded-xl bg-black/15 dark:bg-white/10 text-[9px]">{t.count}</span>
                    </button>
                ))}
            </div>

            <div data-tour="proveedores-search" className="flex items-center gap-3">
                <div className="flex-1 relative">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por empresa, NIT, alias o razón social..."
                        className="w-full pl-11 pr-10 py-3 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 focus:border-purple-500 outline-none text-xs font-bold text-slate-900 dark:text-white shadow-sm transition-colors placeholder:text-slate-400"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl text-slate-400"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
                {isGerente && (
                    <button
                        onClick={handleRecompute}
                        disabled={recomputing}
                        title="Recalcular métricas"
                        className="px-4 py-3 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 hover:border-purple-300 text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {recomputing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">Recalcular</span>
                    </button>
                )}
            </div>

            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl flex-1 overflow-hidden flex flex-col">
                <div className="overflow-auto flex-1 custom-scrollbar p-6">
                    {loading ? (
                        <div className="flex justify-center py-20">
                            <Loader2 size={32} className="animate-spin text-purple-500" />
                        </div>
                    ) : filteredEmpresas.length === 0 ? (
                        <div className="py-20">
                            <EmptyState
                                title={search ? 'Sin resultados' : 'No hay empresas'}
                                description={search ? 'No se encontraron empresas con ese criterio.' : 'Crea tu primera empresa para empezar.'}
                                icon={Building2}
                            />
                        </div>
                    ) : (
                        <div data-tour="proveedores-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
                            {filteredEmpresas.map((emp) => {
                                const cuentas = visibleAccounts.filter((a) => a.empresaId === emp.id);
                                const cuentaCount = cuentas.length || emp.cuentaCount || 0;
                                const saldoTotal = saldoPorEmpresa.get(emp.id!) ?? 0;
                                return (
                                    <button
                                        key={emp.id}
                                        onClick={() => setSelectedEmpresa(emp)}
                                        onContextMenu={(e) => openContextMenu(e, emp)}
                                        className="text-left bg-white dark:bg-white/5/40 rounded-3xl p-5 border border-slate-100 dark:border-white/10 hover:border-purple-500/40 transition-all duration-300 group shadow-sm hover:shadow-xl hover:shadow-purple-500/5 flex flex-col"
                                    >
                                        <div className="flex items-start gap-3 mb-4">
                                            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center overflow-hidden relative shrink-0 group-hover:scale-105 transition-transform">
                                                {emp.logoUrl ? (
                                                    <Image src={emp.logoUrl} alt={emp.nombre} fill className="object-contain p-1" sizes="56px" />
                                                ) : (
                                                    <span className="font-black text-lg text-purple-500">
                                                        {emp.nombre.charAt(0).toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight wrap-break-word group-hover:text-purple-500 transition-colors line-clamp-2">
                                                    {emp.nombre}
                                                </h3>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                                    {cuentaCount} cuenta{cuentaCount === 1 ? '' : 's'}
                                                </p>
                                            </div>
                                        </div>

                                        {cuentas.length > 0 && (
                                            <div className="space-y-1 mb-4 min-h-12">
                                                {cuentas.slice(0, 3).map((a) => (
                                                    <div key={a.id} className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                                        <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                                                        <span className="font-bold truncate">
                                                            {a.alias || a.razonSocial}
                                                            {a.nit && <span className="text-slate-400 font-normal"> · {a.nit}</span>}
                                                        </span>
                                                    </div>
                                                ))}
                                                {cuentas.length > 3 && (
                                                    <div className="text-[9px] font-bold text-purple-500 ml-2.5">
                                                        +{cuentas.length - 3} más…
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="mt-auto pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
                                            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">Saldo Total</span>
                                            <span className={clsx(
                                                'text-sm font-black tabular-nums',
                                                saldoTotal > 0 ? 'text-rose-500' : saldoTotal < 0 ? 'text-emerald-500' : 'text-slate-500'
                                            )}>
                                                {fmtBob(saldoTotal)}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <EmpresaModal
                isOpen={empresaModalOpen || !!editingEmpresa}
                onClose={() => { setEmpresaModalOpen(false); setEditingEmpresa(null); }}
                initialData={editingEmpresa}
            />
            <EmpresaDrawer
                empresa={selectedEmpresa}
                onClose={() => setSelectedEmpresa(null)}
                isGerente={isGerente}
            />

            {/* Context menu personalizado (click derecho) */}
            {ctxMenu && (
                <>
                    <div
                        className="fixed inset-0 z-1200"
                        onClick={() => setCtxMenu(null)}
                        onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}
                    />
                    <div
                        className="fixed z-1210 w-56 bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
                        style={{ top: ctxMenu.y, left: ctxMenu.x }}
                    >
                        <div className="px-3 py-2 text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 truncate border-b border-slate-100 dark:border-white/10 mb-1">
                            {ctxMenu.empresa.nombre}
                        </div>
                        <CtxItem
                            icon={Eye}
                            label="Ver detalles"
                            onClick={() => { setSelectedEmpresa(ctxMenu.empresa); setCtxMenu(null); }}
                        />
                        {(ctxMenu.empresa.saldoTotal || 0) > 0 && (
                            <CtxItem
                                icon={DollarSign}
                                label={`Pagar (${fmtBob(ctxMenu.empresa.saldoTotal || 0)})`}
                                accent
                                onClick={() => { handlePayFromContext(ctxMenu.empresa); setCtxMenu(null); }}
                            />
                        )}
                        {isGerente && (
                            <CtxItem
                                icon={Edit}
                                label="Editar empresa"
                                onClick={() => { setEditingEmpresa(ctxMenu.empresa); setCtxMenu(null); }}
                            />
                        )}
                        {isGerente && (
                            <CtxItem
                                icon={Trash2}
                                label="Eliminar empresa"
                                danger
                                onClick={() => { setDeletingEmpresa(ctxMenu.empresa); setCtxMenu(null); }}
                            />
                        )}
                    </div>
                </>
            )}

            <ConfirmModal
                isOpen={!!deletingEmpresa}
                onClose={() => setDeletingEmpresa(null)}
                onConfirm={handleDeleteEmpresa}
                title="Eliminar Empresa"
                message={`¿Eliminar "${deletingEmpresa?.nombre}"? Las cuentas no se borran pero quedarán huérfanas.`}
                variant="danger"
                isLoading={deleteLoading}
            />

            <PaySupplierModal
                isOpen={!!payingAccount}
                account={payingAccount}
                onClose={() => setPayingAccount(null)}
            />
        </div>
    );
}

function CtxItem({
    icon: Icon, label, onClick, danger, accent,
}: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    danger?: boolean;
    accent?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                'w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold transition-colors',
                danger
                    ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                    : accent
                        ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            )}
        >
            <Icon size={14} strokeWidth={2.5} />
            {label}
        </button>
    );
}
