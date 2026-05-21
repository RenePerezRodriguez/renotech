'use client';

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { Empresa, SupplierAccount } from '@/types';
import { EmpresaService } from '@/services/EmpresaService';
import { SupplierAccountService } from '@/services/SupplierAccountService';
import IndustrialModal from '@/components/common/IndustrialModal';
import EmpresaModal from '@/components/modals/EmpresaModal';
import SupplierAccountModal from '@/components/modals/SupplierAccountModal';
import {
    Building2, Search, Wallet, Star, Plus, ArrowLeft, Check,
    Landmark, Loader2, X,
} from 'lucide-react';
import clsx from 'clsx';

const fmtBob = (n?: number) =>
    new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n || 0);

export interface SelectedEmpresaAccount {
    empresa: Empresa;
    account: SupplierAccount;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (selection: SelectedEmpresaAccount) => void;
    /** Si está definido, filtra cuentas por sucursal (incluye globales). */
    branchId?: string;
    /** Tipos de cuenta admitidos. Default ['PROVEEDOR', 'AMBOS']. */
    allowedTipos?: Array<'PROVEEDOR' | 'CLIENTE' | 'AMBOS'>;
    /** Texto del botón de confirmación (default "Usar esta cuenta"). */
    confirmLabel?: string;
    title?: string;
}

type Step = 'empresa' | 'cuenta';

export default function EmpresaAccountSelector({
    isOpen,
    onClose,
    onSelect,
    branchId,
    allowedTipos = ['PROVEEDOR', 'AMBOS'],
    confirmLabel = 'Usar esta cuenta',
    title = 'Seleccionar Empresa y Cuenta',
}: Props) {
    const [step, setStep] = useState<Step>('empresa');
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [accounts, setAccounts] = useState<SupplierAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [empresaModalOpen, setEmpresaModalOpen] = useState(false);
    const [accountModalOpen, setAccountModalOpen] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        // Patrón imperativo de subscribe: marcamos loading antes de suscribirnos.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        const u1 = EmpresaService.subscribe((data) => {
            setEmpresas(data);
            setLoading(false);
        });
        const u2 = SupplierAccountService.subscribe(
            (data) => setAccounts(data),
            { branchId }
        );
        return () => { u1(); u2(); };
    }, [isOpen, branchId]);

    // Reset al cerrar
    useEffect(() => {
        if (!isOpen) {
            // Reset coordinado al cerrar el selector.
            /* eslint-disable react-hooks/set-state-in-effect */
            setStep('empresa');
            setSearch('');
            setSelectedEmpresa(null);
            setSelectedAccountId('');
            /* eslint-enable react-hooks/set-state-in-effect */
        }
    }, [isOpen]);

    const cuentasEmpresa = useMemo(() => {
        if (!selectedEmpresa) return [];
        return accounts
            .filter((a) => a.empresaId === selectedEmpresa.id)
            .filter((a) => allowedTipos.includes(a.tipo || 'PROVEEDOR'));
    }, [accounts, selectedEmpresa, allowedTipos]);

    // Auto-seleccionar default al entrar al paso "cuenta"
    useEffect(() => {
        if (step === 'cuenta' && cuentasEmpresa.length > 0 && !selectedAccountId) {
            const def = cuentasEmpresa.find((a) => a.isDefault) || cuentasEmpresa[0];
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedAccountId(def.id!);
        }
    }, [step, cuentasEmpresa, selectedAccountId]);

    const filteredEmpresas = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return empresas;
        const empIdsViaCuenta = new Set(
            accounts
                .filter((a) =>
                    allowedTipos.includes(a.tipo || 'PROVEEDOR') &&
                    (a.nit?.toLowerCase().includes(q) ||
                        a.alias?.toLowerCase().includes(q) ||
                        a.razonSocial?.toLowerCase().includes(q))
                )
                .map((a) => a.empresaId)
        );
        return empresas.filter(
            (e) => e.nombre.toLowerCase().includes(q) || empIdsViaCuenta.has(e.id!)
        );
    }, [empresas, accounts, search, allowedTipos]);

    if (!isOpen) return null;

    const goToEmpresa = (emp: Empresa) => {
        setSelectedEmpresa(emp);
        setSelectedAccountId('');
        setStep('cuenta');
    };

    const handleConfirm = () => {
        if (!selectedEmpresa || !selectedAccountId) return;
        const account = cuentasEmpresa.find((a) => a.id === selectedAccountId);
        if (!account) return;
        onSelect({ empresa: selectedEmpresa, account });
        onClose();
    };

    return (
        <>
            <IndustrialModal
                isOpen={isOpen}
                onClose={onClose}
                title={title}
                subtitle={step === 'empresa' ? 'Paso 1 de 2' : 'Paso 2 de 2'}
                icon={step === 'empresa' ? <Building2 size={24} strokeWidth={2.5} /> : <Wallet size={24} strokeWidth={2.5} />}
                iconBg={step === 'empresa' ? 'bg-purple-500' : 'bg-amber-500'}
                iconColor={step === 'empresa' ? 'text-white' : 'text-slate-950'}
                maxWidth="max-w-2xl"
            >
                {step === 'empresa' ? (
                    <div className="space-y-4 px-2">
                        {/* Search + nueva */}
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <input
                                    autoFocus
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Buscar empresa, NIT o alias..."
                                    className="w-full pl-11 pr-10 py-3 rounded-xl bg-slate-100 dark:bg-black/40 focus:bg-white dark:focus:bg-black border-2 border-transparent focus:border-purple-500 outline-none text-xs font-bold text-slate-900 dark:text-white shadow-inner placeholder:text-slate-400"
                                />
                                {search && (
                                    <button
                                        onClick={() => setSearch('')}
                                        type="button"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl text-slate-400"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setEmpresaModalOpen(true)}
                                className="px-3 py-3 bg-purple-500 hover:bg-purple-400 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 active:scale-95"
                            >
                                <Plus size={13} strokeWidth={3} /> Nueva
                            </button>
                        </div>

                        {/* Lista empresas */}
                        <div className="max-h-[55vh] overflow-auto custom-scrollbar -mx-2 px-2">
                            {loading ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 size={28} className="animate-spin text-purple-500" />
                                </div>
                            ) : filteredEmpresas.length === 0 ? (
                                <div className="text-center py-12">
                                    <Building2 size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                                    <p className="text-sm font-bold text-slate-500">Sin empresas</p>
                                    <p className="text-[11px] text-slate-400 mt-1">Crea una nueva para empezar.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {filteredEmpresas.map((emp) => {
                                        const cnt = accounts.filter(
                                            (a) => a.empresaId === emp.id && allowedTipos.includes(a.tipo || 'PROVEEDOR')
                                        ).length;
                                        return (
                                            <button
                                                key={emp.id}
                                                type="button"
                                                onClick={() => goToEmpresa(emp)}
                                                className="text-left p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border-2 border-transparent hover:border-purple-500 hover:bg-white dark:hover:bg-black/40 transition-all flex items-center gap-3 group"
                                            >
                                                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center overflow-hidden relative shrink-0">
                                                    {emp.logoUrl ? (
                                                        <Image src={emp.logoUrl} alt={emp.nombre} fill className="object-contain p-1" sizes="48px" />
                                                    ) : (
                                                        <span className="font-black text-base text-purple-500">
                                                            {emp.nombre.charAt(0).toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase truncate group-hover:text-purple-500 transition-colors">
                                                        {emp.nombre}
                                                    </h4>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                                        {cnt} cuenta{cnt === 1 ? '' : 's'}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 px-2">
                        {/* Empresa seleccionada (header) */}
                        <div className="rounded-2xl bg-purple-50 dark:bg-purple-500/5 border border-purple-200 dark:border-purple-500/20 p-3 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center overflow-hidden relative shrink-0">
                                {selectedEmpresa?.logoUrl ? (
                                    <Image src={selectedEmpresa.logoUrl} alt={selectedEmpresa.nombre} fill className="object-contain p-1" sizes="40px" />
                                ) : (
                                    <Building2 size={18} className="text-purple-500" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[8px] font-black uppercase tracking-[0.25em] text-purple-500">Empresa</p>
                                <p className="text-xs font-black text-slate-900 dark:text-white truncate">
                                    {selectedEmpresa?.nombre}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setStep('empresa')}
                                className="px-2 py-1.5 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-500/10 text-purple-500 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-colors"
                            >
                                <ArrowLeft size={11} /> Cambiar
                            </button>
                        </div>

                        {/* Lista cuentas */}
                        <div className="space-y-2 max-h-[45vh] overflow-auto custom-scrollbar">
                            {cuentasEmpresa.length === 0 ? (
                                <div className="text-center py-8">
                                    <Wallet size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                                    <p className="text-xs font-bold text-slate-500">Sin cuentas para esta empresa</p>
                                    <p className="text-[10px] text-slate-400 mt-1">Crea una para continuar.</p>
                                </div>
                            ) : (
                                cuentasEmpresa.map((acc) => (
                                    <button
                                        key={acc.id}
                                        type="button"
                                        onClick={() => setSelectedAccountId(acc.id!)}
                                        className={clsx(
                                            'w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center gap-3',
                                            selectedAccountId === acc.id
                                                ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10'
                                                : 'border-transparent bg-slate-50 dark:bg-white/5 hover:border-amber-500/40'
                                        )}
                                    >
                                        <div className={clsx(
                                            'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                                            selectedAccountId === acc.id
                                                ? 'bg-amber-500 border-amber-500'
                                                : 'border-slate-300 dark:border-gray-600'
                                        )}>
                                            {selectedAccountId === acc.id && <Check size={12} className="text-white" strokeWidth={3} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                                                    {acc.alias || acc.razonSocial}
                                                </span>
                                                {acc.isDefault && (
                                                    <span className="text-[7px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                        <Star size={8} fill="currentColor" /> Default
                                                    </span>
                                                )}
                                                <span className="text-[7px] font-black uppercase tracking-widest text-slate-500 bg-slate-200 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                                    {acc.tipo || 'PROVEEDOR'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1">
                                                {acc.nit && (
                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                                        <Landmark size={10} /> {acc.nit}
                                                    </span>
                                                )}
                                                <span className={clsx(
                                                    'text-[10px] font-black tabular-nums ml-auto',
                                                    (acc.saldo || 0) > 0 ? 'text-rose-500' : (acc.saldo || 0) < 0 ? 'text-emerald-500' : 'text-slate-400'
                                                )}>
                                                    {fmtBob(acc.saldo)}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}

                            {/* Crear nueva cuenta para esta empresa */}
                            <button
                                type="button"
                                onClick={() => setAccountModalOpen(true)}
                                className="w-full p-3 rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-amber-500 hover:text-amber-500 transition-colors text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                            >
                                <Plus size={13} /> Nueva cuenta para esta empresa
                            </button>
                        </div>

                        {/* Footer */}
                        <div className="flex gap-3 pt-3 border-t border-slate-100 dark:border-white/10">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 h-11 rounded-xl font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                disabled={!selectedAccountId}
                                className="flex-2 bg-amber-500 hover:bg-amber-400 text-slate-950 h-11 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-30"
                            >
                                <Check size={16} strokeWidth={3} /> {confirmLabel}
                            </button>
                        </div>
                    </div>
                )}
            </IndustrialModal>

            {/* Sub-modales */}
            <EmpresaModal
                isOpen={empresaModalOpen}
                onClose={() => setEmpresaModalOpen(false)}
                onSuccess={(emp) => {
                    setSelectedEmpresa(emp);
                    setStep('cuenta');
                }}
            />
            {selectedEmpresa && (
                <SupplierAccountModal
                    isOpen={accountModalOpen}
                    onClose={() => setAccountModalOpen(false)}
                    empresaId={selectedEmpresa.id!}
                    empresaNombre={selectedEmpresa.nombre}
                    suggestDefault={cuentasEmpresa.length === 0}
                    onSuccess={(acc) => setSelectedAccountId(acc.id!)}
                />
            )}
        </>
    );
}
