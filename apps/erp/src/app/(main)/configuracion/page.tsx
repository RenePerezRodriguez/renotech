'use client';

import { useState, useEffect } from 'react';
import { useModalDismiss } from '@/hooks/useModalDismiss';
import { ConfigService } from '@/services/ConfigService';
import { AppConfig } from '@/types';
import { toast } from 'sonner';
import { Save, Settings, Building, MapPin, CreditCard, Upload, X, Building2, BarChart3, History, Trash2, AlertTriangle, RefreshCw, DollarSign, Smartphone, CheckCircle } from 'lucide-react';
import { logAdminAction } from '@/lib/audit';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { useBranch } from '@/contexts/BranchContext';
import { MaintenanceService } from '@/services/MaintenanceService';
import NumericInput from '@/components/common/NumericInput';
import { AnalyticsService } from '@/services/AnalyticsService';
import { localDateStr } from '@/lib/utils';
import { clsx } from 'clsx';
import { Shield } from 'lucide-react';
import { useInstallPWA } from '@/hooks/useInstallPWA';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export default function ConfigPage() {
    const { canSwitchBranch, branches, currentBranch, isHQ } = useBranch();
    const { user, role } = useAuth();
    const [selectedBranchId, setSelectedBranchId] = useState<string>('');
    const [config, setConfig] = useState<AppConfig>({
        companyName: '',
        branchName: '',
        address: '',
        phone: '',
        email: '',
        city: '',
        website: '',
        taxRate: 0,
        exchangeRate: 9.30,
        exchangeRateMode: 'MANUAL',
        currency: 'BOB',
        nit: '',
        bankName: '',
        accountNumber: '',
        accountType: '',
        accountHolder: '',
        qrImageUrl: '',
        updatedAt: new Date()
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showPurgeModal, setShowPurgeModal] = useState(false);
    const [isPurging, setIsPurging] = useState(false);
    const closePurgeModal = () => { setShowPurgeModal(false); };
    const purgeDismiss = useModalDismiss(showPurgeModal, closePurgeModal, { disabled: isPurging });
    const [purgePhrase, setPurgePhrase] = useState('');
    const [activeTab, setActiveTab] = useState<'identity' | 'finance' | 'system'>('identity');
    const [isSyncingRate, setIsSyncingRate] = useState(false);
    const { canInstall, isInstalled, promptInstall } = useInstallPWA();
    const { isOnline } = useNetworkStatus();
    const PURGE_PHRASE = 'BORRAR TODO';

    // Set initial selected branch based on currentBranch or empty (global)
    useEffect(() => {
        if (!canSwitchBranch && currentBranch?.id) {
            setSelectedBranchId(currentBranch.id);
        }
    }, [currentBranch?.id, canSwitchBranch]);

    useEffect(() => {
        const loadConfig = async () => {
            setIsLoading(true);
            try {
                const data = await ConfigService.getConfig(selectedBranchId || undefined);
                if (data) setConfig(data);
            } catch {
                toast.error("Error al cargar la configuración");
            } finally {
                setIsLoading(false);
            }
        };
        loadConfig();
    }, [selectedBranchId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        setConfig((prev: AppConfig) => ({
            ...prev,
            [name]: type === 'number' ? parseFloat(value) : value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await ConfigService.saveConfig(config, selectedBranchId || undefined);
            
            // Audit global config change
            await logAdminAction(
                user?.uid || '?',
                user?.email || '?',
                'UPDATE_CONFIG',
                selectedBranchId || 'GLOBAL',
                selectedBranchId ? selectedBranchId : 'HQ',
                `Configuración actualizada (${config.branchName})`
            );

            toast.success('Configuración guardada correctamente');
        } catch {
            toast.error('Error al guardar la configuración');
        } finally {
            setIsSaving(false);
        }
    };

    const handlePurgeDatabase = async () => {
        if (purgePhrase !== PURGE_PHRASE) return;
        
        setIsPurging(true);
        try {
            await MaintenanceService.purgeDatabase((msg) => toast.info(msg));

            toast.success('Base de datos limpia.');
            setShowPurgeModal(false);
            setPurgePhrase('');
            setTimeout(() => window.location.href = '/inicio', 2000);
        } catch {
            toast.error('No se pudo limpiar la base de datos. Intenta nuevamente.');
        } finally {
            setIsPurging(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    return (
        <div className="flex-1 min-w-0 w-full max-w-5xl mx-auto p-3 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-500 flex flex-col space-y-4 sm:space-y-6 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                        <Settings className="text-blue-600 dark:text-blue-400" />
                        Configuración {selectedBranchId ? 'de Sucursal' : 'General'}
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {selectedBranchId
                            ? 'Personaliza los metadatos y datos de contacto de esta sucursal.'
                            : 'Personaliza los ajustes globales que aparecerán por defecto.'}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Branch Selector for Admins */}
                    {canSwitchBranch && (
                        <div className="flex items-center gap-2 bg-white dark:bg-white/5 border dark:border-white/10 px-3 py-1.5 rounded-xl shadow-sm">
                            <Building2 size={16} className="text-slate-400" />
                            <select
                                value={selectedBranchId}
                                onChange={(e) => setSelectedBranchId(e.target.value)}
                                className="bg-transparent text-sm font-medium focus:outline-none dark:text-white"
                            >
                                <option value="">Configuración Global</option>
                                {branches.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Branch Management Shortcut */}
                    {isHQ && (
                        <Link
                            href="/configuracion/sucursales"
                            className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-yellow-500/10 active:scale-95 whitespace-nowrap border-b-2 border-yellow-600"
                        >
                            <Building2 size={16} />
                            Gestionar Sucursales
                        </Link>
                    )}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 space-y-8">
                {/* TAB NAVIGATION */}
                <div data-tour="config-tabs" className="flex items-center gap-1 bg-white/50 dark:bg-black/20 p-1.5 rounded-3xl border border-slate-200/60 dark:border-white/10 self-start w-full sm:w-auto overflow-x-auto scrollbar-none">
                <button
                    onClick={() => setActiveTab('identity')}
                    className={clsx(
                        "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2.5 sm:py-3 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0",
                        activeTab === 'identity'
                            ? "bg-slate-900 border-2 border-slate-800 text-white shadow-xl shadow-slate-900/20"
                            : "text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/5 border-2 border-transparent"
                    )}
                >
                    <Building size={14} />
                    <span className="hidden sm:inline">Identidad</span>
                    <span className="sm:hidden">ID</span>
                </button>
                <button
                    onClick={() => setActiveTab('finance')}
                    className={clsx(
                        "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2.5 sm:py-3 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0",
                        activeTab === 'finance'
                            ? "bg-slate-900 border-2 border-slate-800 text-white shadow-xl shadow-slate-900/20"
                            : "text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/5 border-2 border-transparent"
                    )}
                >
                    <CreditCard size={14} />
                    Finanzas
                </button>
                <button
                    onClick={() => setActiveTab('system')}
                    className={clsx(
                        "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2.5 sm:py-3 rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0",
                        activeTab === 'system'
                            ? "bg-slate-900 border-2 border-slate-800 text-white shadow-xl shadow-slate-900/20"
                            : "text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/5 border-2 border-transparent"
                    )}
                >
                    <Shield size={14} />
                    <span className="hidden sm:inline">Mantenimiento</span>
                    <span className="sm:hidden">Mant.</span>
                </button>
            </div>

                {/* TAB CONTENT: IDENTITY */}
                {activeTab === 'identity' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                        {/* 1. Datos de Empresa */}
                        <div data-tour="config-identity" className="bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                            <div className="p-5 bg-slate-50/50 dark:bg-white/5 border-b dark:border-white/10 flex items-center gap-3 text-slate-800 dark:text-white font-black uppercase tracking-widest text-[10px]">
                                <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl">
                                    <Building size={16} />
                                </div>
                                Datos de Identidad Comercial
                            </div>
                            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Nombre Comercial</label>
                                    <input name="branchName" value={config.branchName} onChange={handleChange} className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-blue-500/50 outline-none transition-all" placeholder="Ej: Renotech Solutions" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">NIT / ID Fiscal</label>
                                    <input name="nit" value={config.nit} onChange={handleChange} className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-blue-500/50 outline-none transition-all" placeholder="Ej: 1020304050" />
                                </div>
                            </div>
                        </div>

                        {/* 2. Contacto y Ubicación */}
                        <div className="bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                            <div className="p-5 bg-slate-50/50 dark:bg-white/5 border-b dark:border-white/10 flex items-center gap-3 text-slate-800 dark:text-white font-black uppercase tracking-widest text-[10px]">
                                <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
                                    <MapPin size={16} />
                                </div>
                                Ubicación y Canales de Contacto
                            </div>
                            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Dirección Completa</label>
                                    <input name="address" value={config.address} onChange={handleChange} className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-blue-500/50 outline-none transition-all" placeholder="Av. Principal #123" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Ciudad / Pais</label>
                                    <input name="city" value={config.city || ''} onChange={handleChange} className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-blue-500/50 outline-none transition-all" placeholder="Ej. Sucre, Bolivia" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Teléfono / Celular</label>
                                    <input name="phone" value={config.phone} onChange={handleChange} className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-blue-500/50 outline-none transition-all font-mono" placeholder="+591 ..." />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Correo Electrónico</label>
                                    <input name="email" value={config.email || ''} onChange={handleChange} className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-blue-500/50 outline-none transition-all" placeholder="contacto@empresa.com" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Sitio Web</label>
                                    <input name="website" value={config.website || ''} onChange={handleChange} className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-blue-500/50 outline-none transition-all" placeholder="www.tuempresa.com" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB CONTENT: FINANCE */}
                {activeTab === 'finance' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                        {/* Aviso: cuentas bancarias y QR ahora se gestionan desde Tesorería */}
                        <div className="bg-white dark:bg-background rounded-3xl border border-amber-500/30 shadow-sm overflow-hidden">
                            <div className="p-5 bg-amber-500/5 border-b border-amber-500/20 flex items-center gap-3 text-slate-800 dark:text-white font-black uppercase tracking-widest text-[10px]">
                                <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
                                    <CreditCard size={16} />
                                </div>
                                Cuentas bancarias y QR
                            </div>
                            <div className="p-8 space-y-4">
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                    Las cuentas bancarias, billeteras digitales y la imagen QR para recibos al cliente se administran desde
                                    <span className="text-blue-600 dark:text-yellow-500"> Tesorería</span>.
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    En Tesorería puedes crear/editar cuentas (banco, billetera) y, en su pestaña de Configuración,
                                    elegir cuál cuenta bancaria y cuál QR aparecen en proformas y recibos PDF.
                                </p>
                                <div className="flex gap-2 pt-2">
                                    <Link href="/tesoreria"
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase tracking-[0.2em] transition active:scale-95 shadow-sm">
                                        <Building2 size={12} /> Ir a Tesorería
                                    </Link>
                                </div>
                            </div>
                        </div>

                        {/* Tipo de Cambio BCB */}
                        <div data-tour="config-exchange" className="bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                            <div className="p-5 bg-slate-50/50 dark:bg-white/5 border-b dark:border-white/10 flex items-center gap-3 text-slate-800 dark:text-white font-black uppercase tracking-widest text-[10px]">
                                <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
                                    <DollarSign size={16} />
                                </div>
                                Tipo de Cambio USD → BOB
                            </div>
                            <div className="p-8 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Modo</label>
                                        <select
                                            value={config.exchangeRateMode || 'MANUAL'}
                                            onChange={(e) => setConfig(prev => ({ ...prev, exchangeRateMode: e.target.value as 'MANUAL' | 'AUTO' }))}
                                            className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-blue-500/50 outline-none transition-all"
                                        >
                                            <option value="MANUAL">Manual</option>
                                            <option value="AUTO">Automático (BCB)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">
                                            Tasa de Venta (Bs por 1 USD)
                                        </label>
                                        <NumericInput
                                            name="exchangeRate"
                                            value={config.exchangeRate}
                                            onChange={(val) => setConfig(prev => ({ ...prev, exchangeRate: val === '' ? 0 : parseFloat(val) }))}
                                            disabled={config.exchangeRateMode === 'AUTO'}
                                            className="w-full bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl py-4 px-5 text-sm font-black text-slate-900 dark:text-white tracking-tight focus:bg-white dark:focus:bg-black/40 focus:border-blue-500/50 outline-none transition-all font-mono disabled:opacity-50"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        disabled={isSyncingRate}
                                        onClick={async () => {
                                            setIsSyncingRate(true);
                                            try {
                                                const res = await fetch('/api/exchange-rate');
                                                const data = await res.json();
                                                if (data.venta && data.venta > 1) {
                                                    setConfig(prev => ({ ...prev, exchangeRate: data.venta }));
                                                    toast.success(`Tipo de cambio actualizado: Bs ${data.venta}`, {
                                                        description: `Fuente: ${data.source} | Compra: ${data.compra} | Venta: ${data.venta}`
                                                    });
                                                } else {
                                                    toast.error('No se pudo obtener el tipo de cambio');
                                                }
                                            } catch {
                                                toast.error('Error de conexión con BCB');
                                            } finally {
                                                setIsSyncingRate(false);
                                            }
                                        }}
                                        className="flex items-center justify-center gap-2 py-4 px-5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-2xl text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                                    >
                                        <RefreshCw size={14} className={isSyncingRate ? 'animate-spin' : ''} />
                                        Sincronizar BCB
                                    </button>
                                </div>
                                <p className="text-[9px] text-slate-400 dark:text-slate-600 font-medium">
                                    Fuente: Valor Referencial del Dólar Estadounidense — Banco Central de Bolivia (bcb.gob.bo). 
                                    En modo AUTO, se actualiza automáticamente al iniciar sesión.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB CONTENT: SYSTEM */}
                {activeTab === 'system' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                        {/* Aplicación PWA */}
                        {(canInstall || isInstalled) && (
                            <div className="bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                                <div className="p-5 bg-slate-50/50 dark:bg-white/5 border-b dark:border-white/10 flex items-center gap-3 text-slate-800 dark:text-white font-black uppercase tracking-widest text-[10px]">
                                    <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl">
                                        <Smartphone size={16} />
                                    </div>
                                    Aplicación
                                </div>
                                <div className="p-8 flex flex-col md:flex-row items-center justify-between gap-8">
                                    <div className="space-y-2">
                                        <h4 className="text-md font-black text-slate-900 dark:text-white uppercase tracking-tight">Instalar como app nativa</h4>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium max-w-sm">
                                            Instala Renotech en tu dispositivo para acceder sin navegador, con soporte offline y rendimiento nativo.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={isInstalled}
                                        onClick={promptInstall}
                                        className="flex items-center gap-3 px-8 py-4 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-600 text-blue-700 dark:text-blue-400 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border border-blue-200 dark:border-blue-500/20 shadow-sm group disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-blue-50 dark:disabled:hover:bg-blue-500/10 disabled:hover:text-blue-700 dark:disabled:hover:text-blue-400"
                                    >
                                        {isInstalled ? (
                                            <>
                                                <CheckCircle size={16} />
                                                Instalada
                                            </>
                                        ) : (
                                            <>
                                                <Smartphone size={16} className="group-hover:scale-110 transition-transform" />
                                                Instalar app
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 4. Cierre Administrativo */}
                        <div className="bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                            <div className="p-5 bg-slate-900 dark:bg-[#FFD700] border-b dark:border-white/10 flex items-center justify-between text-white dark:text-black font-black uppercase tracking-widest text-[10px]">
                                <div className="flex items-center gap-3">
                                    <BarChart3 size={16} />
                                    Cierre Administrativo (Snapshots)
                                </div>
                                <span className="hidden md:inline opacity-60">BI & Analytics</span>
                            </div>
                            <div className="p-8 flex flex-col md:flex-row items-center justify-between gap-8">
                                <div className="space-y-2">
                                    <h4 className="text-md font-black text-slate-900 dark:text-white uppercase tracking-tight">Generar Snapshot del Día</h4>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium max-w-sm">Consolida ventas, costos y márgenes de hoy para el reporte histórico. Acción inmutable para auditoría.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (!selectedBranchId && !currentBranch?.id) {
                                            toast.error("Seleccione una sucursal para el cierre");
                                            return;
                                        }
                                        const bid = selectedBranchId || currentBranch?.id;
                                        if (!bid) return;
                                        try {
                                            const todayStr = localDateStr();
                                            await AnalyticsService.generateDailySummary(bid, todayStr);
                                            toast.success("Snapshot de Auditoría generado", {
                                                description: `ID: ${bid} | REF: ${todayStr}`
                                            });
                                        } catch {
                                            toast.error("Error al generar snapshot");
                                        }
                                    }}
                                    className="flex items-center gap-3 px-8 py-4 bg-slate-100 dark:bg-white/5 hover:bg-slate-900 hover:text-white dark:hover:bg-[#FFD700] dark:hover:text-black rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border border-slate-200 dark:border-white/10 shadow-sm group"
                                >
                                    <History size={16} className="group-hover:rotate-12 transition-transform" />
                                    Ejecutar Cierre Maestro
                                </button>
                            </div>
                        </div>

                        {/* 4.1 GESTIÓN DE DESASTRES */}
                        {isHQ && !selectedBranchId && (
                            <div className="bg-white dark:bg-background rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
                                <div className="p-5 bg-emerald-600 dark:bg-emerald-500 border-b dark:border-white/10 flex items-center justify-between text-white font-black uppercase tracking-widest text-[10px]">
                                    <div className="flex items-center gap-3">
                                        <Save size={16} />
                                        Backup de Continuidad de Negocio
                                    </div>
                                    <span className="hidden md:inline opacity-60 text-[9px]">Protección de Datos Activa</span>
                                </div>
                                <div className="p-8 flex flex-col md:flex-row items-center justify-between gap-8">
                                    <div className="space-y-2">
                                        <h4 className="text-md font-black text-slate-900 dark:text-white uppercase tracking-tight">Respaldo Integral del Ecosistema</h4>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium max-w-sm">Exporta todas las colecciones (Catálogo, Ventas, Clientes) en formato JSON. Recomendado semanalmente.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const { ExportService } = await import('@/services/ExportService');
                                            toast.promise(ExportService.generateFullSystemBackup(), {
                                                loading: 'Extrayendo datos masivos...',
                                                success: 'Backup de Continuidad descargado.',
                                                error: 'Error al generar el backup.'
                                            });
                                        }}
                                        className="flex items-center gap-3 px-8 py-4 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-400 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border border-emerald-200 dark:border-emerald-500/20 shadow-sm group"
                                    >
                                        <Upload size={16} className="group-hover:-translate-y-1 transition-transform" />
                                        Descargar Backup Maestro
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 5. Zona de Peligro */}
                        {isHQ && !selectedBranchId && role === 'GERENTE' && (
                            <div className="bg-rose-50 dark:bg-rose-950/20 rounded-3xl border border-rose-200 dark:border-rose-900/50 p-8">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                                    <div className="space-y-3">
                                        <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400 flex items-center gap-3 uppercase tracking-tighter">
                                            <AlertTriangle size={32} />
                                            Operación Crítica
                                        </h3>
                                        <p className="text-[11px] text-rose-600/80 dark:text-rose-400/70 font-bold max-w-xl uppercase tracking-tight">
                                            Esta acción borrará permanentemente todo el catálogo, ventas e historial operativo. Los usuarios y configuración básica se conservarán. Acción ineludible e irreversible.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowPurgeModal(true)}
                                        disabled={!isOnline}
                                        title={!isOnline ? 'Requiere conexión' : undefined}
                                        className="flex items-center justify-center gap-3 px-8 py-5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-rose-600/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <Trash2 size={18} />
                                        Purgar Base de Datos
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* GLOBAL SAVE BUTTON */}
                <div data-tour="config-save" className="flex justify-end pt-8 border-t border-slate-100 dark:border-white/10 sticky bottom-0 bg-slate-50/90 dark:bg-[#020617]/90 pb-8 -mx-6 px-6 z-10">
                    <button
                        type="submit"
                        disabled={isSaving || !isOnline}
                        title={!isOnline ? 'Requiere conexión para guardar' : undefined}
                        className="flex items-center gap-3 rounded-2xl bg-slate-900 dark:bg-[#FFD700] px-10 py-5 text-[11px] font-black uppercase tracking-widest text-white dark:text-black hover:bg-black dark:hover:bg-yellow-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl shadow-yellow-500/20 active:scale-95 border-b-4 border-slate-800 dark:border-yellow-600"
                    >
                        {isSaving ? (
                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save size={18} strokeWidth={3} />
                                {!isOnline ? 'Sin conexión' : `Sincronizar Configuración ${activeTab === 'identity' ? 'Identidad' : activeTab === 'finance' ? 'Financiera' : 'de Sistema'}`}
                            </>
                        )}
                    </button>
                </div>
            </form>

            {/* Modal de Purga */}
            {showPurgeModal && (
                <div onClick={purgeDismiss.onBackdropClick} className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-background w-full max-w-sm rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 relative">
                        <button onClick={closePurgeModal} disabled={isPurging} className="absolute top-3 right-3 p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-all z-10 disabled:opacity-30"><X size={18} className="text-slate-400" /></button>
                        <div className="p-8 text-center space-y-6">
                            <div className="inline-flex p-4 bg-rose-100 dark:bg-rose-500/10 rounded-full text-rose-600 dark:text-rose-500 mb-2">
                                <AlertTriangle size={40} strokeWidth={2.5} />
                            </div>
                            
                            <div className="space-y-2">
                                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">¡Detente! Operación Crítica</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                                    Estás a punto de borrar permanentemente toda la información operativa del sistema de todas tus sucursales.
                                </p>
                            </div>

                            <div className="bg-rose-50 dark:bg-rose-950/30 p-4 rounded-2xl border border-rose-100 dark:border-rose-900/50 space-y-3">
                                <p className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest">Para proceder, escribe la frase:</p>
                                <p className="text-sm font-black text-rose-600 dark:text-rose-400 select-none">&quot;{PURGE_PHRASE}&quot;</p>
                                <input
                                    type="text"
                                    value={purgePhrase}
                                    onChange={(e) => setPurgePhrase(e.target.value.toUpperCase())}
                                    placeholder="Escribe la frase aquí..."
                                    className="w-full bg-white dark:bg-black/50 border-2 border-rose-200 dark:border-rose-900/50 rounded-xl px-4 py-3 text-center text-sm font-black text-rose-600 dark:text-rose-400 focus:outline-none focus:border-rose-500 transition-all"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => { setShowPurgeModal(false); setPurgePhrase(''); }}
                                    className="py-4 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                                >
                                    Arrepentirse
                                </button>
                                <button
                                    disabled={purgePhrase !== PURGE_PHRASE || isPurging}
                                    onClick={handlePurgeDatabase}
                                    className="py-4 bg-rose-600 hover:bg-rose-700 disabled:opacity-30 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2"
                                >
                                    {isPurging ? 'Purgando...' : 'Proceder'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
