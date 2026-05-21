'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { EmpresaService } from '@/services/EmpresaService';
import { Empresa, SupplierAccount } from '@/types';
import { Wallet, ArrowUpRight, TrendingDown, TrendingUp, Vault, Loader2 } from 'lucide-react';

interface Props {
    /** Saldo actual de la bóveda física en BOB (efectivo en caja). null = sin caja abierta */
    cashBalance: number | null;
    /** Si está en vista global o de una sola sucursal (afecta solo la etiqueta) */
    isConsolidatedView: boolean;
    /** ID de la sucursal actual. undefined en vista consolidada. */
    currentBranchId?: string;
}

const fmtBob = (n: number) =>
    new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n || 0);

export default function FinancialOverview({ cashBalance, isConsolidatedView, currentBranchId }: Props) {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [branchAccounts, setBranchAccounts] = useState<SupplierAccount[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isConsolidatedView || !currentBranchId) {
            // Vista global: usar saldoTotal denormalizado de cada empresa
            const unsub = EmpresaService.subscribe((data) => {
                setEmpresas(data);
                setLoading(false);
            });
            return () => unsub();
        } else {
            // Vista de sucursal: filtrar cuentas_proveedores por branchId
            const q = query(
                collection(db, 'cuentas_proveedores'),
                where('branchId', '==', currentBranchId),
                where('isActive', '==', true)
            );
            const unsub = onSnapshot(q, (snap) => {
                setBranchAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupplierAccount)));
                setLoading(false);
            });
            return () => unsub();
        }
    }, [isConsolidatedView, currentBranchId]);

    // Consolidado: sumar saldoTotal de todas las empresas
    const porPagar = isConsolidatedView || !currentBranchId
        ? empresas.reduce((s, e) => s + Math.max(0, e.saldoTotal || 0), 0)
        : branchAccounts.reduce((s, a) => s + Math.max(0, a.saldo || 0), 0);

    const aFavor = isConsolidatedView || !currentBranchId
        ? Math.abs(empresas.reduce((s, e) => s + Math.min(0, e.saldoTotal || 0), 0))
        : Math.abs(branchAccounts.reduce((s, a) => s + Math.min(0, a.saldo || 0), 0));

    const empresasConDeuda = isConsolidatedView || !currentBranchId
        ? empresas.filter((e) => (e.saldoTotal || 0) > 0).length
        : new Set(branchAccounts.filter(a => (a.saldo || 0) > 0).map(a => a.empresaId)).size;

    return (
        <div className="bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-black/40 flex items-center justify-between">
                <div>
                    <h2 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Wallet size={12} className="text-yellow-500" />
                        Posición Financiera
                    </h2>
                    <p className="text-xs font-black text-slate-700 dark:text-slate-300 mt-0.5">
                        Bóveda: {isConsolidatedView ? 'todas las sucursales' : 'sucursal actual'} · Cuentas: globales
                    </p>
                </div>
                <Link
                    href="/proveedores"
                    className="text-[9px] font-black text-yellow-600 dark:text-[#FFD700] uppercase tracking-widest hover:underline flex items-center gap-1"
                >
                    Detalle <ArrowUpRight size={10} />
                </Link>
            </div>

            {loading ? (
                <div className="flex justify-center py-10">
                    <Loader2 size={24} className="animate-spin text-slate-400" />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-gray-800">
                    {/* Bóveda física */}
                    <div className="p-5 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center">
                                <Vault size={14} className="text-amber-600 dark:text-amber-400" strokeWidth={2.5} />
                            </div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bóveda física</span>
                        </div>
                        <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                            {cashBalance === null ? (
                                <span className="text-sm text-slate-400 font-bold">Sin caja abierta</span>
                            ) : (
                                fmtBob(cashBalance)
                            )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold leading-tight">Efectivo disponible en caja</p>
                    </div>

                    {/* Por pagar */}
                    <Link href="/proveedores" className="p-5 flex flex-col gap-2 hover:bg-rose-50/50 dark:hover:bg-rose-500/5 transition-colors group">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-500/10 flex items-center justify-center">
                                <TrendingDown size={14} className="text-rose-600 dark:text-rose-400" strokeWidth={2.5} />
                            </div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Por pagar</span>
                        </div>
                        <div className="text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums group-hover:translate-x-0.5 transition-transform">
                            {fmtBob(porPagar)}
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold leading-tight">
                            {empresasConDeuda} {empresasConDeuda === 1 ? 'proveedor' : 'proveedores'} con deuda
                        </p>
                    </Link>

                    {/* A favor */}
                    <div className="p-5 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center">
                                <TrendingUp size={14} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
                            </div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">A favor</span>
                        </div>
                        <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {fmtBob(aFavor)}
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold leading-tight">Anticipos / saldos a recuperar</p>
                    </div>
                </div>
            )}
        </div>
    );
}
