'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Empresa, SupplierAccount } from '@/types';
import { SupplierAccountService } from '@/services/SupplierAccountService';
import { EmpresaService } from '@/services/EmpresaService';
import { useBranch } from '@/contexts/BranchContext';
import {
    X, Plus, Edit, Trash2, Star, Wallet, Phone, Mail,
    MapPin, Landmark, Building2, Loader2, Banknote, Undo2
} from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import SupplierAccountModal from '@/components/modals/SupplierAccountModal';
import EmpresaModal from '@/components/modals/EmpresaModal';
import PaySupplierModal from '@/components/modals/PaySupplierModal';
import ConfirmModal from '@/components/common/ConfirmModal';
import SupplierHistorySection from '@/components/proveedores/SupplierHistorySection';
import DevolucionProveedorModal from '@/components/modals/DevolucionProveedorModal';

interface Props {
    empresa: Empresa | null;
    onClose: () => void;
    isGerente: boolean;
}

const fmtBob = (n?: number) =>
    new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n || 0);

export default function EmpresaDrawer({ empresa, onClose, isGerente }: Props) {
    const { currentBranch, isConsolidatedView, isHQ } = useBranch();
    const [accounts, setAccounts] = useState<SupplierAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [accountModalOpen, setAccountModalOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<SupplierAccount | null>(null);
    const [empresaModalOpen, setEmpresaModalOpen] = useState(false);
    const [devolucionModalOpen, setDevolucionModalOpen] = useState(false);
    const [payingAccount, setPayingAccount] = useState<SupplierAccount | null>(null);
    const [historyRefresh, setHistoryRefresh] = useState(0);
    const [confirm, setConfirm] = useState<{
        open: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        loading?: boolean;
    } | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
        if (!empresa?.id) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setAccounts([]);
            return;
        }
        setLoading(true);
        const unsub = SupplierAccountService.subscribe(
            (data) => {
                setAccounts(data);
                setLoading(false);
            },
            { empresaId: empresa.id }
        );
        return () => unsub();
    }, [empresa?.id]);

    // HQ y vista consolidada ven todas las cuentas; sucursales solo ven las suyas o las globales (sin branchId)
    const visibleAccounts = useMemo(() => {
        if (isConsolidatedView || isHQ) return accounts;
        return accounts.filter(a => !a.branchId || a.branchId === currentBranch?.id);
    }, [accounts, isConsolidatedView, isHQ, currentBranch?.id]);

    if (!mounted || !empresa) return null;

    const setDefault = async (acc: SupplierAccount) => {
        try {
            await SupplierAccountService.setDefault(acc.id!, empresa.id!);
            toast.success('Cuenta por defecto actualizada');
        } catch {
            toast.error('Error al marcar por defecto');
        }
    };

    const removeAccount = (acc: SupplierAccount) => {
        setConfirm({
            open: true,
            title: 'Eliminar Cuenta',
            message: `¿Eliminar la cuenta "${acc.alias || acc.razonSocial}"?`,
            onConfirm: async () => {
                setConfirm((c) => c && { ...c, loading: true });
                try {
                    await SupplierAccountService.softDelete(acc.id!);
                    toast.success('Cuenta eliminada');
                    setConfirm(null);
                    // Recompute en segundo plano
                    EmpresaService.recomputeMetrics(empresa.id!).catch((e) =>
                        console.warn('recomputeMetrics falló (no bloqueante):', e)
                    );
                } catch (e) {
                    console.error(e);
                    toast.error('Error al eliminar');
                    setConfirm((c) => c && { ...c, loading: false });
                }
            },
        });
    };

    const removeEmpresa = () => {
        setConfirm({
            open: true,
            title: 'Eliminar Empresa',
            message: `¿Eliminar "${empresa.nombre}"? Las cuentas no se borran pero quedarán huérfanas.`,
            onConfirm: async () => {
                setConfirm((c) => c && { ...c, loading: true });
                try {
                    await EmpresaService.softDelete(empresa.id!);
                    toast.success('Empresa eliminada');
                    setConfirm(null);
                    onClose();
                } catch {
                    toast.error('Error al eliminar');
                    setConfirm((c) => c && { ...c, loading: false });
                }
            },
        });
    };

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[950] animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Drawer */}
            <aside className="fixed top-0 right-0 h-full w-full max-w-2xl bg-white dark:bg-[#0f1419] z-[960] shadow-2xl border-l border-slate-200 dark:border-white/10 flex flex-col animate-in slide-in-from-right duration-300">
                {/* Header */}
                <header className="px-6 py-5 border-b border-slate-100 dark:border-white/10 flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center overflow-hidden relative shrink-0">
                        {empresa.logoUrl ? (
                            <Image src={empresa.logoUrl} alt={empresa.nombre} fill className="object-contain p-1" />
                        ) : (
                            <Building2 size={26} className="text-purple-500" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-purple-500">Empresa</p>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white truncate">{empresa.nombre}</h2>
                        {empresa.notas && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{empresa.notas}</p>
                        )}
                        {(() => {
                            // BUG-FIX: derivar saldo de cuentas reales para evitar mostrar saldoTotal desincronizado
                            const derivedSaldo = visibleAccounts.reduce((s, a) => s + Number(a.saldo || 0), 0);
                            const derivedCount = visibleAccounts.length || empresa.cuentaCount || 0;
                            return (
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        {derivedCount} cuenta{derivedCount === 1 ? '' : 's'}
                                    </span>
                                    <span className="text-slate-300">•</span>
                                    <span className={clsx(
                                        'text-[10px] font-black uppercase tracking-widest',
                                        derivedSaldo > 0.01 ? 'text-rose-500' : derivedSaldo < -0.01 ? 'text-emerald-500' : 'text-slate-400'
                                    )}>
                                        Saldo {fmtBob(derivedSaldo)}
                                    </span>
                                </div>
                            );
                        })()}
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                    >
                        <X size={18} />
                    </button>
                </header>

                {/* Toolbar */}
                {isGerente && (
                    <div className="px-6 py-3 border-b border-slate-100 dark:border-white/10 flex items-center gap-2 bg-slate-50/60 dark:bg-black/20">
                        <button
                            onClick={() => { setEditingAccount(null); setAccountModalOpen(true); }}
                            className="flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors active:scale-95"
                        >
                            <Plus size={13} strokeWidth={3} /> Nueva Cuenta
                        </button>
                        <button
                            onClick={() => setEmpresaModalOpen(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-slate-200 dark:border-white/10 active:scale-95"
                        >
                            <Edit size={13} /> Editar Empresa
                        </button>
                        <button
                            onClick={() => setDevolucionModalOpen(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-amber-200 dark:border-amber-500/20 active:scale-95"
                        >
                            <Undo2 size={13} /> Devolver
                        </button>
                        <div className="flex-1" />
                        <button
                            onClick={removeEmpresa}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors active:scale-95"
                        >
                            <Trash2 size={13} /> Eliminar
                        </button>
                    </div>
                )}

                {/* Accounts list */}
                <div className="flex-1 overflow-auto p-6 space-y-4 custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center py-16">
                            <Loader2 size={28} className="animate-spin text-amber-500" />
                        </div>
                    ) : visibleAccounts.length === 0 ? (
                        <div className="text-center py-16">
                            <Wallet size={36} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Sin cuentas para esta sucursal</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Esta empresa no tiene cuentas asignadas a tu sucursal.</p>
                        </div>
                    ) : (
                        visibleAccounts.map((acc) => (
                            <article
                                key={acc.id}
                                className={clsx(
                                    'rounded-2xl border bg-white dark:bg-white/5/40 p-5 transition-all relative group',
                                    acc.isDefault
                                        ? 'border-amber-400 dark:border-amber-500/50 shadow-md shadow-amber-500/10'
                                        : 'border-slate-100 dark:border-white/10 hover:border-amber-500/30'
                                )}
                            >
                                {acc.isDefault && (
                                    <div className="absolute -top-2 left-4 bg-amber-500 text-slate-950 text-[8px] font-black uppercase tracking-[0.25em] px-2 py-0.5 rounded-xl flex items-center gap-1">
                                        <Star size={9} fill="currentColor" /> Por Defecto
                                    </div>
                                )}

                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="flex-1 min-w-0">
                                        {acc.alias && (
                                            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-amber-600 dark:text-amber-400">
                                                {acc.alias}
                                            </p>
                                        )}
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                                            {acc.razonSocial}
                                        </h3>
                                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                                            {acc.nit && (
                                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                                    <Landmark size={10} /> NIT {acc.nit}
                                                </span>
                                            )}
                                            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-500">
                                                {acc.tipo || 'PROVEEDOR'}
                                            </span>
                                        </div>
                                    </div>
                                    {isGerente && (
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {!acc.isDefault && (
                                                <button
                                                    onClick={() => setDefault(acc)}
                                                    className="w-8 h-8 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-500/10 text-slate-400 hover:text-amber-500 flex items-center justify-center transition-colors"
                                                    title="Marcar como default"
                                                >
                                                    <Star size={13} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => { setEditingAccount(acc); setAccountModalOpen(true); }}
                                                className="w-8 h-8 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-500/10 text-slate-400 hover:text-blue-500 flex items-center justify-center transition-colors"
                                                title="Editar"
                                            >
                                                <Edit size={13} />
                                            </button>
                                            <button
                                                onClick={() => removeAccount(acc)}
                                                className="w-8 h-8 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-colors"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
                                    {acc.telefono && (
                                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                                            <Phone size={11} className="text-emerald-500" />
                                            <span className="font-mono truncate">{acc.telefono}</span>
                                        </div>
                                    )}
                                    {acc.email && (
                                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 min-w-0">
                                            <Mail size={11} className="text-indigo-500" />
                                            <span className="truncate lowercase">{acc.email}</span>
                                        </div>
                                    )}
                                    {(acc.ciudad || acc.estado || acc.pais) && (
                                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 col-span-2">
                                            <MapPin size={11} className="text-rose-500" />
                                            <span className="truncate">
                                                {[acc.ciudad, acc.estado, acc.pais].filter(Boolean).join(', ')}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/10">
                                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">Saldo</span>
                                    <div className="flex items-center gap-3">
                                        <span className={clsx(
                                            'text-sm font-black tabular-nums',
                                            (acc.saldo || 0) > 0 ? 'text-rose-500' : (acc.saldo || 0) < 0 ? 'text-emerald-500' : 'text-slate-500'
                                        )}>
                                            {fmtBob(acc.saldo)}
                                        </span>
                                        {(acc.saldo || 0) !== 0 && (
                                            <button
                                                onClick={() => setPayingAccount(acc)}
                                                className={clsx(
                                                    'flex items-center gap-1.5 px-3 h-8 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors active:scale-95',
                                                    (acc.saldo || 0) > 0
                                                        ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                                                        : 'bg-slate-200 dark:bg-white/10 hover:bg-slate-300 text-slate-700 dark:text-slate-300'
                                                )}
                                                title={(acc.saldo || 0) > 0 ? 'Pagar deuda' : 'Registrar movimiento'}
                                            >
                                                <Banknote size={12} strokeWidth={3} />
                                                {(acc.saldo || 0) > 0 ? 'Pagar' : 'Movimiento'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </article>
                        ))
                    )}

                    {/* Historial de movimientos (pagos + compras a crédito) */}
                    {!loading && visibleAccounts.length > 0 && (
                        <SupplierHistorySection accounts={visibleAccounts} refreshKey={historyRefresh} />
                    )}
                </div>
            </aside>

            {/* Modals */}
            <SupplierAccountModal
                isOpen={accountModalOpen}
                onClose={() => { setAccountModalOpen(false); setEditingAccount(null); }}
                empresaId={empresa.id!}
                empresaNombre={empresa.nombre}
                initialData={editingAccount}
                suggestDefault={visibleAccounts.length === 0}
            />
            <EmpresaModal
                isOpen={empresaModalOpen}
                onClose={() => setEmpresaModalOpen(false)}
                initialData={empresa}
            />
            <ConfirmModal
                isOpen={!!confirm?.open}
                onClose={() => setConfirm(null)}
                onConfirm={() => confirm?.onConfirm()}
                title={confirm?.title || ''}
                message={confirm?.message || ''}
                variant="danger"
                isLoading={confirm?.loading}
            />
            <PaySupplierModal
                isOpen={!!payingAccount}
                onClose={() => setPayingAccount(null)}
                account={payingAccount}
                onSuccess={() => {
                    EmpresaService.recomputeMetrics(empresa.id!).catch(() => {});
                    setHistoryRefresh(t => t + 1);
                }}
            />
            <DevolucionProveedorModal
                isOpen={devolucionModalOpen}
                onClose={() => {
                    setDevolucionModalOpen(false);
                    setHistoryRefresh(t => t + 1);
                }}
                empresa={empresa}
                accounts={visibleAccounts}
            />
        </>,
        document.body
    );
}
