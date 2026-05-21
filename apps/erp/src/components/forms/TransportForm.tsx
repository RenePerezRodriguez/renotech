'use client';

import { useState } from 'react';
import { Building2, Phone, MapPin, FileText, Save, Landmark, Tag } from 'lucide-react';
import { Transport } from '@/types';
import clsx from 'clsx';

const TRANSPORT_TYPES = [
    'TERRESTRE',
    'AÉREO',
    'MARÍTIMO',
    'FLUVIAL',
    'ENCOMIENDA',
    'COURIER',
    'MIXTO',
];

const LabelV4 = ({ children, icon: Icon }: { children: React.ReactNode, icon?: React.ElementType }) => (
    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500 mb-1.5 ml-1">
        {Icon && <Icon size={12} strokeWidth={2.5} />}
        {children}
    </label>
);

const InputV4 = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="relative group">
        <input
            {...props}
            className={clsx(
                "w-full rounded-2xl border-2 border-transparent bg-slate-100/50 dark:bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:border-(--industrial-accent) focus:bg-white dark:focus:bg-black transition-all outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-inner",
                props.className
            )}
        />
    </div>
);

interface TransportFormProps {
    initialData?: Partial<Transport> | null;
    onSubmit: (data: Omit<Transport, 'id'>) => Promise<void>;
    onCancel: () => void;
    isLoading: boolean;
}

export default function TransportForm({ initialData, onSubmit, onCancel, isLoading }: TransportFormProps) {
    const [form, setForm] = useState<Omit<Transport, 'id'>>({
        tipoTransporte: initialData?.tipoTransporte || '',
        razonSocial: initialData?.razonSocial || '',
        telefono: initialData?.telefono || '',
        nit: initialData?.nit || '',
        ubicacion: initialData?.ubicacion || '',
        anotaciones: initialData?.anotaciones || '',
        isActive: initialData?.isActive ?? true,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit(form);
    };

    return (
        <form onSubmit={handleSubmit} className="pt-2 space-y-3">
            <div className="space-y-3">
                {/* Tipo + Razón Social en una fila */}
                <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
                    <div>
                        <LabelV4 icon={Tag}>Tipo</LabelV4>
                        <select
                            required
                            value={form.tipoTransporte}
                            onChange={e => setForm({ ...form, tipoTransporte: e.target.value })}
                            className="w-full rounded-2xl border-2 border-transparent bg-slate-100/50 dark:bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:border-(--industrial-accent) focus:bg-white dark:focus:bg-black transition-all outline-none shadow-inner"
                        >
                            <option value="">Seleccionar...</option>
                            {TRANSPORT_TYPES.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <LabelV4 icon={Building2}>Nombre / Razón Social</LabelV4>
                        <InputV4
                            required
                            name="razonSocial"
                            type="text"
                            placeholder="Ej. TRANSPORTE BOLÍVAR S.R.L."
                            value={form.razonSocial}
                            onChange={e => setForm({ ...form, razonSocial: (e.target as HTMLInputElement).value })}
                        />
                    </div>
                </div>

                {/* Teléfono + NIT */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <div>
                        <LabelV4 icon={Landmark}>NIT</LabelV4>
                        <InputV4
                            name="nit"
                            type="text"
                            placeholder="123456789"
                            value={form.nit}
                            onChange={e => setForm({ ...form, nit: (e.target as HTMLInputElement).value })}
                        />
                    </div>
                </div>

                {/* Ubicación */}
                <div>
                    <LabelV4 icon={MapPin}>Ubicación</LabelV4>
                    <InputV4
                        name="ubicacion"
                        type="text"
                        placeholder="Ej. Terminal de buses, Av. Aroma #123"
                        value={form.ubicacion}
                        onChange={e => setForm({ ...form, ubicacion: (e.target as HTMLInputElement).value })}
                    />
                </div>

                {/* Anotaciones */}
                <div>
                    <LabelV4 icon={FileText}>Anotaciones (opcional)</LabelV4>
                    <textarea
                        name="anotaciones"
                        rows={2}
                        placeholder="Horarios, condiciones especiales, rutas frecuentes..."
                        value={form.anotaciones}
                        onChange={e => setForm({ ...form, anotaciones: e.target.value })}
                        className="w-full rounded-2xl border-2 border-transparent bg-slate-100/50 dark:bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:border-(--industrial-accent) focus:bg-white dark:focus:bg-black transition-all outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-inner resize-none"
                    />
                </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-white/10">
                <button type="button" onClick={onCancel} className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={isLoading || !form.razonSocial || !form.tipoTransporte}
                    className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-black dark:hover:bg-yellow-400 transition-all disabled:opacity-40 active:scale-95"
                >
                    {isLoading ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <Save size={16} strokeWidth={2.5} />
                            {initialData ? 'Actualizar' : 'Registrar'}
                        </>
                    )}
                </button>
            </div>
        </form>
    );
}
