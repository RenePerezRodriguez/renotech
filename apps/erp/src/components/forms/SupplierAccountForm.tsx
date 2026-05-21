'use client';

import { useState, useMemo, useEffect } from 'react';
import { Building2, User, Phone, MapPin, Mail, Save, Globe, Landmark, Tag, Wallet, Star } from 'lucide-react';
import { useLocations } from '@/hooks/useLocations';
import { useBranch } from '@/contexts/BranchContext';
import { SupplierAccount } from '@/types';
import SearchableSelect, { Option } from '@/components/ui/SearchableSelect';
import clsx from 'clsx';

const Lbl = ({ children, icon: Icon }: { children: React.ReactNode, icon?: React.ElementType }) => (
    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500 mb-2.5 ml-1">
        {Icon && <Icon size={12} strokeWidth={2.5} />}
        {children}
    </label>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
        {...props}
        className={clsx(
            "w-full rounded-2xl border-2 border-transparent bg-slate-100/50 dark:bg-white/5 p-4 text-sm font-bold text-slate-900 dark:text-white focus:border-(--industrial-accent) focus:bg-white dark:focus:bg-black transition-all outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-inner",
            props.className
        )}
    />
);

interface Props {
    empresaId: string;
    empresaNombre: string;
    initialData?: Partial<SupplierAccount> | null;
    onSubmit: (data: Omit<SupplierAccount, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
    onCancel: () => void;
    isLoading: boolean;
    /** Si esta es la primera cuenta de la empresa, sugerir isDefault. */
    suggestDefault?: boolean;
}

export default function SupplierAccountForm({
    empresaId,
    empresaNombre,
    initialData,
    onSubmit,
    onCancel,
    isLoading,
    suggestDefault,
}: Props) {
    const { branches } = useBranch();
    const [form, setForm] = useState<Omit<SupplierAccount, 'id' | 'createdAt' | 'updatedAt'>>({
        empresaId,
        empresaNombre,
        alias: initialData?.alias || '',
        razonSocial: initialData?.razonSocial || empresaNombre,
        nit: initialData?.nit || '',
        contacto: initialData?.contacto || '',
        telefono: initialData?.telefono || '',
        email: initialData?.email || '',
        direccion: initialData?.direccion || '',
        pais: initialData?.pais || 'Bolivia',
        ciudad: initialData?.ciudad || '',
        estado: initialData?.estado || '',
        saldo: initialData?.saldo ?? 0,
        branchId: initialData?.branchId !== undefined ? initialData.branchId : '',
        tipo: initialData?.tipo || 'PROVEEDOR',
        isDefault: initialData?.isDefault ?? !!suggestDefault,
        isActive: initialData?.isActive ?? true,
    });

    const { countries, loading: loadingCountries, getStates } = useLocations();
    const [states, setStates] = useState<string[]>([]);
    const [loadingStates, setLoadingStates] = useState(false);

    useEffect(() => {
        const load = async () => {
            if (form.pais) {
                const countryEn = countries.find(c => c.name_es === form.pais)?.name_en;
                if (countryEn) {
                    setLoadingStates(true);
                    try {
                        setStates(await getStates(countryEn));
                    } finally {
                        setLoadingStates(false);
                    }
                }
            }
        };
        if (countries.length > 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [countries]);

    const handleCountry = async (paisEs: string) => {
        const country = countries.find(c => c.name_es === paisEs);
        setForm(p => ({ ...p, pais: paisEs, estado: '' }));
        setStates([]);
        if (country) {
            setLoadingStates(true);
            setStates(await getStates(country.name_en));
            setLoadingStates(false);
        }
    };

    const countryOpts: Option[] = useMemo(() =>
        countries.map(c => ({ label: c.name_es, value: c.name_es, icon: c.flag, group: c.region })), [countries]);
    const stateOpts: Option[] = useMemo(() => states.map(s => ({ label: s, value: s })), [states]);
    const branchOpts: Option[] = useMemo(() => [
        { label: '— Global (todas las sucursales) —', value: '' },
        ...branches.map(b => ({ label: b.name, value: b.id! })),
    ], [branches]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit({
            ...form,
            alias: form.alias?.trim() || undefined,
            saldo: Number(form.saldo) || 0,
        });
    };

    return (
        <form onSubmit={submit} className="pt-4 space-y-6">
            {/* Empresa pinned */}
            <div className="rounded-2xl bg-purple-50 dark:bg-purple-500/5 border border-purple-200 dark:border-purple-500/20 px-4 py-3 flex items-center gap-3">
                <Building2 size={16} className="text-purple-600 dark:text-purple-400 shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-[8px] font-black uppercase tracking-[0.25em] text-purple-500 dark:text-purple-400">Empresa</div>
                    <div className="text-xs font-black text-slate-900 dark:text-white truncate">{empresaNombre}</div>
                </div>
            </div>

            {/* Alias + tipo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="sm:col-span-2">
                    <Lbl icon={Tag}>Alias (opcional)</Lbl>
                    <Input
                        placeholder="Ej. NIT principal, Sucursal Cobija"
                        value={form.alias}
                        onChange={e => setForm({ ...form, alias: e.target.value })}
                    />
                </div>
                <div>
                    <Lbl icon={Tag}>Tipo</Lbl>
                    <select
                        value={form.tipo || 'PROVEEDOR'}
                        onChange={e => setForm({ ...form, tipo: e.target.value as SupplierAccount['tipo'] })}
                        className="w-full rounded-2xl border-2 border-transparent bg-slate-100/50 dark:bg-white/5 p-4 text-sm font-bold text-slate-900 dark:text-white focus:border-(--industrial-accent) focus:bg-white dark:focus:bg-black transition-all outline-none shadow-inner"
                    >
                        <option value="PROVEEDOR">Proveedor</option>
                        <option value="CLIENTE">Cliente</option>
                        <option value="AMBOS">Ambos</option>
                    </select>
                </div>
            </div>

            {/* Razón social + NIT */}
            <div>
                <Lbl icon={Building2}>Razón Social</Lbl>
                <Input
                    required
                    placeholder="Razón social fiscal"
                    value={form.razonSocial}
                    onChange={e => setForm({ ...form, razonSocial: e.target.value })}
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                    <Lbl icon={Landmark}>NIT / CI</Lbl>
                    <Input
                        placeholder="123456789"
                        value={form.nit}
                        onChange={e => setForm({ ...form, nit: e.target.value })}
                    />
                </div>
                <div>
                    <Lbl icon={Phone}>Teléfono</Lbl>
                    <Input
                        placeholder="+591 000 00000"
                        value={form.telefono}
                        onChange={e => setForm({ ...form, telefono: e.target.value })}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-4 border-t border-slate-100 dark:border-white/10">
                <div>
                    <Lbl icon={User}>Contacto</Lbl>
                    <Input
                        placeholder="Nombre completo"
                        value={form.contacto}
                        onChange={e => setForm({ ...form, contacto: e.target.value })}
                    />
                </div>
                <div>
                    <Lbl icon={Mail}>Email</Lbl>
                    <Input
                        type="email"
                        placeholder="proveedor@empresa.com"
                        value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                    />
                </div>
            </div>

            <div className="pt-5 border-t border-slate-100 dark:border-white/10 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                        <Lbl icon={Globe}>País</Lbl>
                        <div className="rounded-xl border-2 border-transparent bg-slate-100/50 dark:bg-white/5 overflow-hidden focus-within:border-(--industrial-accent)">
                            <SearchableSelect
                                grouped
                                loading={loadingCountries}
                                options={countryOpts}
                                value={form.pais || 'Bolivia'}
                                onChange={handleCountry}
                                placeholder="Seleccionar País"
                            />
                        </div>
                    </div>
                    <div>
                        <Lbl icon={MapPin}>Departamento</Lbl>
                        <div className="rounded-xl border-2 border-transparent bg-slate-100/50 dark:bg-white/5 overflow-hidden focus-within:border-(--industrial-accent)">
                            <SearchableSelect
                                disabled={!form.pais}
                                loading={loadingStates}
                                options={stateOpts}
                                value={form.estado || ''}
                                onChange={estado => setForm({ ...form, estado })}
                                placeholder={form.pais ? "Seleccionar" : "Primero País"}
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                        <Lbl icon={MapPin}>Ciudad</Lbl>
                        <Input
                            placeholder="Ej. Cochabamba"
                            value={form.ciudad}
                            onChange={e => setForm({ ...form, ciudad: e.target.value })}
                        />
                    </div>
                    <div>
                        <Lbl icon={MapPin}>Dirección</Lbl>
                        <Input
                            className="text-xs"
                            placeholder="Av. Principal #123..."
                            value={form.direccion}
                            onChange={e => setForm({ ...form, direccion: e.target.value })}
                        />
                    </div>
                </div>
            </div>

            {/* Saldo + sucursal + default */}
            <div className="pt-5 border-t border-slate-100 dark:border-white/10 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                        <Lbl icon={Wallet}>Saldo inicial (BOB)</Lbl>
                        <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={form.saldo ?? 0}
                            onChange={e => setForm({ ...form, saldo: Number(e.target.value) })}
                        />
                        <p className="text-[10px] text-slate-400 mt-1.5 ml-1">Positivo = nosotros le debemos.</p>
                    </div>
                    <div>
                        <Lbl icon={Building2}>Sucursal</Lbl>
                        <div className="rounded-xl border-2 border-transparent bg-slate-100/50 dark:bg-white/5 overflow-hidden focus-within:border-(--industrial-accent)">
                            <SearchableSelect
                                options={branchOpts}
                                value={form.branchId || ''}
                                onChange={v => setForm({ ...form, branchId: v || undefined })}
                                placeholder="Global o sucursal"
                            />
                        </div>
                    </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer p-3 bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-xl select-none">
                    <input
                        type="checkbox"
                        checked={!!form.isDefault}
                        onChange={e => setForm({ ...form, isDefault: e.target.checked })}
                        className="w-4 h-4 accent-amber-500"
                    />
                    <Star size={14} className="text-amber-500" />
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Marcar como cuenta por defecto de esta empresa
                    </span>
                </label>
            </div>

            <div className="pt-5 flex gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 h-11 rounded-xl font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5 transition-all active:scale-95"
                >
                    Descartar
                </button>
                <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-2 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-slate-950 h-11 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl dark:shadow-[#FFD700]/20 hover:bg-black dark:hover:bg-yellow-400 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-30 ring-2 ring-white/10"
                >
                    {isLoading ? (
                        <span className="animate-spin h-5 w-5 border-2 border-slate-900 border-t-transparent rounded-full" />
                    ) : (
                        <>
                            <Save size={16} strokeWidth={3} /> {initialData ? 'Actualizar' : 'Crear Cuenta'}
                        </>
                    )}
                </button>
            </div>
        </form>
    );
}
