'use client';

import { useState, useMemo, useEffect } from 'react';
import { Building2, User, Phone, MapPin, Mail, Save, Globe, Landmark } from 'lucide-react';
import { useLocations } from '@/hooks/useLocations';
import { Supplier } from '@/types';
import SearchableSelect, { Option } from '@/components/ui/SearchableSelect';
import clsx from 'clsx';

const LabelV4 = ({ children, icon: Icon }: { children: React.ReactNode, icon?: React.ElementType }) => (
    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500 mb-2.5 ml-1">
        {Icon && <Icon size={12} strokeWidth={2.5} />}
        {children}
    </label>
);

const InputV4 = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="relative group">
        <input 
            {...props}
            className={clsx(
                "w-full rounded-2xl border-2 border-transparent bg-slate-100/50 dark:bg-white/5 p-4 text-sm font-bold text-slate-900 dark:text-white focus:border-(--industrial-accent) focus:bg-white dark:focus:bg-black transition-all outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-inner",
                props.className
            )}
        />
    </div>
);

interface SupplierFormProps {
    initialData?: Partial<Supplier> | null;
    onSubmit: (data: Omit<Supplier, 'id'>) => Promise<void>;
    onCancel: () => void;
    isLoading: boolean;
    title?: string;
}

export default function SupplierForm({ initialData, onSubmit, onCancel, isLoading }: SupplierFormProps) {
    const [form, setForm] = useState<Omit<Supplier, 'id'>>({
        razonSocial: initialData?.razonSocial || '',
        nit: initialData?.nit || '',
        contacto: initialData?.contacto || '',
        telefono: initialData?.telefono || '',
        direccion: initialData?.direccion || '',
        email: initialData?.email || '',
        pais: initialData?.pais || '',
        estado: initialData?.estado || '',
        ciudad: initialData?.ciudad || '',
        isActive: initialData?.isActive ?? true
    });

    const { countries, loading: loadingCountries, getStates } = useLocations();
    const [states, setStates] = useState<string[]>([]);
    const [loadingStates, setLoadingStates] = useState(false);

    // Initial load of states if editing
    useEffect(() => {
        const loadInitial = async () => {
            if (initialData?.pais) {
                const countryEn = countries.find(c => c.name_es === initialData.pais)?.name_en;
                if (countryEn) {
                    const s = await getStates(countryEn);
                    setStates(s);
                }
            }
        };
        if (countries.length > 0) loadInitial();
    }, [initialData, countries, getStates]);

    const handleCountryChange = async (paisEs: string) => {
        const country = countries.find(c => c.name_es === paisEs);
        setForm(prev => ({ ...prev, pais: paisEs, estado: '', ciudad: prev.ciudad }));
        setStates([]);

        if (country) {
            setLoadingStates(true);
            const s = await getStates(country.name_en);
            setStates(s);
            setLoadingStates(false);
        }
    };

    const countryOptions: Option[] = useMemo(() =>
        countries.map(c => ({
            label: c.name_es,
            value: c.name_es,
            icon: c.flag,
            group: c.region
        })), [countries]);

    const stateOptions: Option[] = useMemo(() =>
        states.map(s => ({ label: s, value: s })), [states]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit(form);
    };

    return (
        <form onSubmit={handleSubmit} className="pt-4 space-y-6">
            <div className="space-y-5">
                    {/* Primary Identity Section */}
                    <div className="space-y-5">
                        <div>
                            <LabelV4 icon={Building2}>Razón Social</LabelV4>
                            <InputV4
                                required
                                name="razonSocial"
                                type="text"
                                placeholder="Ej. IMPORTADORA SOLAR LTDA"
                                value={form.razonSocial}
                                onChange={e => setForm({ ...form, razonSocial: (e.target as HTMLInputElement).value })}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div>
                                <LabelV4 icon={Landmark}>NIT / CI</LabelV4>
                                <InputV4
                                    name="nit"
                                    type="text"
                                    placeholder="123456789"
                                    value={form.nit}
                                    onChange={e => setForm({ ...form, nit: (e.target as HTMLInputElement).value })}
                                />
                            </div>
                            <div>
                                <LabelV4 icon={Phone}>Teléfono</LabelV4>
                                <InputV4
                                    name="telefono"
                                    type="text"
                                    placeholder="+591 000 00000"
                                    value={form.telefono}
                                    onChange={e => setForm({ ...form, telefono: (e.target as HTMLInputElement).value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Personal & Digital Section */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-4 border-t border-slate-100 dark:border-white/10">
                        <div>
                            <LabelV4 icon={User}>Contacto</LabelV4>
                            <InputV4
                                name="contacto"
                                type="text"
                                placeholder="Nombre completo"
                                value={form.contacto}
                                onChange={e => setForm({ ...form, contacto: (e.target as HTMLInputElement).value })}
                            />
                        </div>
                        <div>
                            <LabelV4 icon={Mail}>Email</LabelV4>
                            <InputV4
                                name="email"
                                type="email"
                                placeholder="proveedor@renotech.com"
                                value={form.email}
                                onChange={e => setForm({ ...form, email: (e.target as HTMLInputElement).value })}
                            />
                        </div>
                    </div>

                    {/* Logistics & Location Section */}
                    <div className="pt-5 border-t border-slate-100 dark:border-white/10 space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <LabelV4 icon={Globe}>País</LabelV4>
                                <div className="rounded-xl border-2 border-transparent bg-slate-100/50 dark:bg-white/5 overflow-hidden focus-within:border-(--industrial-accent) transition-all">
                                    <SearchableSelect
                                        grouped
                                        loading={loadingCountries}
                                        options={countryOptions}
                                        value={form.pais || 'Bolivia'}
                                        onChange={handleCountryChange}
                                        placeholder="Seleccionar País"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <LabelV4 icon={MapPin}>Departamento</LabelV4>
                                <div className="rounded-xl border-2 border-transparent bg-slate-100/50 dark:bg-white/5 overflow-hidden focus-within:border-(--industrial-accent) transition-all">
                                    <SearchableSelect
                                        disabled={!form.pais}
                                        loading={loadingStates}
                                        options={stateOptions}
                                        value={form.estado || ''}
                                        onChange={estado => setForm({ ...form, estado })}
                                        placeholder={form.pais ? "Seleccionar" : "Primero País"}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div>
                                <LabelV4 icon={MapPin}>Ciudad</LabelV4>
                                <InputV4
                                    type="text"
                                    placeholder="Ej. Cochabamba"
                                    value={form.ciudad}
                                    onChange={e => setForm({ ...form, ciudad: (e.target as HTMLInputElement).value })}
                                />
                            </div>
                            <div>
                                <LabelV4 icon={MapPin}>Dirección</LabelV4>
                                <InputV4
                                    type="text"
                                    className="text-xs"
                                    placeholder="Av. Principal #123..."
                                    value={form.direccion}
                                    onChange={e => setForm({ ...form, direccion: (e.target as HTMLInputElement).value })}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Industrial Footer Action */}
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
                        className="flex-2 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-slate-950 h-11 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl dark:shadow-[#FFD700]/20 hover:bg-black dark:hover:bg-yellow-400 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-30 ring-2 ring-white/10 select-none"
                    >
                        {isLoading ? (
                            <span className="animate-spin h-5 w-5 border-2 border-slate-900 border-t-transparent rounded-full" />
                        ) : (
                            <>
                                <Save size={16} strokeWidth={3} /> {initialData ? 'Actualizar' : 'Guardar Proveedor'}
                            </>
                        )}
                    </button>
                </div>
            </form>
    );
}
