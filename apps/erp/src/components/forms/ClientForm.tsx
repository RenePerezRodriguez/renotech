'use client';

import { useState } from 'react';
import { Client } from '@/types';
import { Plus, Save, ChevronDown, Info } from 'lucide-react';

interface ClientFormProps {
    initialData?: Partial<Client> | null;
    onSubmit: (data: Omit<Client, 'id'>) => Promise<void>;
    onCancel: () => void;
    isLoading: boolean;
    showCancel?: boolean;
    submitLabel?: string;
    compact?: boolean;
}

export default function ClientForm({ 
    initialData, 
    onSubmit, 
    onCancel, 
    isLoading,
    showCancel = true,
    submitLabel = 'Registrar Socio',
    compact = true
}: ClientFormProps) {
    const [formData, setFormData] = useState<Omit<Client, 'id'>>({
        razonSocial: initialData?.razonSocial || '',
        nit: initialData?.nit || '',
        tipo: initialData?.tipo || 'PARTICULAR',
        telefono: initialData?.telefono || '',
        email: initialData?.email || '',
        direccion: initialData?.direccion || '',
        notas: initialData?.notas || '',
        lineaDeCredito: initialData?.lineaDeCredito ?? 0,
        isActive: initialData?.isActive ?? true
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.razonSocial) return;
        await onSubmit(formData);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? (value === '' ? 0 : Math.max(0, parseFloat(value) || 0)) : value
        }));
    };

    return (
        <form onSubmit={handleSubmit} className={compact ? "space-y-5" : "space-y-6"}>
            <div className={compact ? "space-y-3.5 px-2" : "space-y-4 px-2"}>
                {/* Line 1: Main Identity - Audit Style */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                        <label className="flex items-end min-h-6 text-[9px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-[0.25em] mb-1.5 ml-1">Socio / Razón Social (REQUERIDO)</label>
                        <div className="relative group">
                            <input
                                name="razonSocial"
                                type="text"
                                value={formData.razonSocial}
                                onChange={handleChange}
                                className="w-full px-5 py-3 bg-slate-100 dark:bg-black/40 border-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl outline-none text-xs font-black text-slate-900 dark:text-white transition-all uppercase placeholder:text-slate-400 shadow-inner"
                                placeholder="Ej. Juan Pérez o Distribuidora S.A."
                                autoFocus
                                required
                            />
                        </div>
                    </div>
                    <div className="md:col-span-1">
                        <label className="flex items-end min-h-6 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] mb-1.5 ml-1">NIT / CI (OPCIONAL)</label>
                        <input
                            name="nit"
                            type="text"
                            value={formData.nit}
                            onChange={handleChange}
                            className="w-full px-5 py-3 bg-slate-100 dark:bg-black/40 border-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl outline-none text-xs font-black text-slate-900 dark:text-white transition-all uppercase placeholder:text-slate-400 shadow-inner"
                            placeholder="87654321"
                        />
                    </div>
                </div>

                {/* Line 2: Fiscal & Contact - Technical Efficiency */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="col-span-1">
                        <label className="flex items-end min-h-6 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] mb-1.5 ml-1">Tipo Fiscal</label>
                        <div className="relative">
                            <select
                                name="tipo"
                                value={formData.tipo}
                                onChange={handleChange}
                                className="w-full px-5 py-3 bg-slate-100 dark:bg-black/40 border-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl outline-none text-xs font-black text-slate-900 dark:text-white transition-all uppercase appearance-none cursor-pointer shadow-inner"
                            >
                                <option value="PARTICULAR">Particular</option>
                                <option value="EMPRESA">Comercial / Empresa</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <ChevronDown size={14} />
                            </div>
                        </div>
                    </div>
                    <div className="col-span-1">
                        <label className="flex items-end min-h-6 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] mb-1.5 ml-1">Teléfono Principal</label>
                        <input
                            name="telefono"
                            type="text"
                            value={formData.telefono}
                            onChange={handleChange}
                            className="w-full px-5 py-3 bg-slate-100 dark:bg-black/40 border-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl outline-none text-xs font-black text-slate-900 dark:text-white transition-all uppercase placeholder:text-slate-400 shadow-inner"
                            placeholder="77000000"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="flex items-end min-h-6 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] mb-1.5 ml-1">Email Corporativo</label>
                        <input
                            name="email"
                            type="email"
                            value={formData.email}
                            onChange={handleChange}
                            className="w-full px-5 py-3 bg-slate-100 dark:bg-black/40 border-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl outline-none text-xs font-black text-slate-900 dark:text-white transition-all placeholder:text-slate-400 shadow-inner"
                            placeholder="cliente@renotech.com"
                        />
                    </div>
                </div>

                {/* Line 3: Location - Full Width Audit */}
                <div>
                    <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] mb-1.5 ml-1">Ubicación Geo-Referencial (OPCIONAL)</label>
                    <input
                        name="direccion"
                        type="text"
                        value={formData.direccion}
                        onChange={handleChange}
                        className="w-full px-5 py-3 bg-slate-100 dark:bg-black/40 border-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl outline-none text-xs font-black text-slate-900 dark:text-white transition-all uppercase placeholder:text-slate-400 shadow-inner"
                        placeholder="Ej: Av. Principal entre 4to y 5to anillo"
                    />
                </div>

                {/* Line 3.5: Línea de Crédito (habilita ventas a CRÉDITO) */}
                <div>
                    <label className="flex items-center gap-2 text-[9px] font-black text-purple-500 dark:text-purple-400 uppercase tracking-[0.25em] mb-1.5 ml-1">
                        <span>Línea de Crédito (Bs.) — 0 = sin crédito</span>
                        <Info
                            size={12}
                            className="text-purple-500 hover:text-purple-400 cursor-help"
                            title="En esta versión, 0 también actúa como 'sin límite explícito' en la validación actual. Para restringir ventas a crédito, asigna un monto mayor a 0."
                        />
                    </label>
                    <input
                        name="lineaDeCredito"
                        type="number"
                        min={0}
                        step={50}
                        value={formData.lineaDeCredito ?? 0}
                        onChange={handleChange}
                        className="w-full px-5 py-3 bg-slate-100 dark:bg-black/40 border-2 border-transparent focus:border-purple-500 focus:bg-white dark:focus:bg-black rounded-xl outline-none text-xs font-black text-slate-900 dark:text-white transition-all placeholder:text-slate-400 shadow-inner tabular-nums"
                        placeholder="0"
                    />
                    <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1 ml-1">
                        Asigna un monto mayor a 0 para permitir ventas a crédito (cuenta corriente).
                    </p>
                </div>

                {/* Line 4: Notes - Technical Detail */}
                <div>
                    <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] mb-1.5 ml-1">Anotaciones de Servicio (OPCIONAL)</label>
                    <textarea
                        name="notas"
                        value={formData.notas}
                        onChange={handleChange}
                        className="w-full px-5 py-3 bg-slate-100 dark:bg-black/40 border-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-black rounded-xl outline-none text-xs font-medium text-slate-900 dark:text-white transition-all placeholder:text-slate-400 shadow-inner resize-none"
                        placeholder="Detalles importantes sobre el cliente..."
                        rows={compact ? 2 : 3}
                    />
                </div>
            </div>

            <div className="flex gap-3 pt-2">
                {showCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 h-11 rounded-xl font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5 transition-all active:scale-95 border border-transparent hover:border-slate-200 dark:hover:border-white/10"
                    >
                        Ignorar
                    </button>
                )}
                <button
                    type="submit"
                    disabled={isLoading || !formData.razonSocial}
                    className="flex-2 bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black h-11 rounded-xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:shadow-yellow-500/10 dark:hover:bg-yellow-400 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-30 border border-transparent dark:border-white/20"
                >
                    {isLoading ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        initialData ? <Save size={16} strokeWidth={3} /> : <Plus size={16} strokeWidth={3} />
                    )}
                    {isLoading ? 'GUARDANDO...' : submitLabel}
                </button>
            </div>
        </form>
    );
}
