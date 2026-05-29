'use client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineModuleGuard } from '@/components/common/OfflineModuleGuard';



import { useState, useEffect } from 'react';

import { useAuth } from '@/contexts/AuthContext';

import { usePendingApprovalsCount } from '@/hooks/usePendingApprovalsCount';

import PendingBanner from '@/components/common/PendingBanner';

import { useBranch } from '@/contexts/BranchContext';

import { useConfig } from '@/contexts/ConfigContext';

import { useRouter, useSearchParams } from 'next/navigation';

import { ExpenseService } from '@/services/ExpenseService';

import { SaleApprovalService } from '@/services/SaleApprovalService';

import { DiscountApprovalService } from '@/services/DiscountApprovalService';

import { CashierSessionService } from '@/services/CashierSessionService';

import { ConfigService } from '@/services/ConfigService';

import { PedidoService } from '@/services/PedidoService';

import { EnvioService } from '@/services/EnvioService';

import { AuditAlertService } from '@/services/AuditAlertService';

import { OperationalExpense, AppConfig, PendingVoidApproval, PendingDiscountApproval, Pedido, Envio, EnvioItem, AuditAlert } from '@/types';

import { CashierSession } from '@/types/treasury';

import { ensureDate } from '@/utils/dateHelpers';

import { formatUserName } from '@/utils/formatUserName';

import { toast } from 'sonner';

import { confirmDialog, promptDialog } from '@/components/common/dialogs';

import {

    Briefcase, ShieldCheck, Settings2, Inbox, AlertTriangle,

    CheckCircle2, XCircle, Clock, FileText, Building2,

    RotateCcw, DoorClosed, Percent, Truck, ArrowRight, AlertOctagon,

    SlidersHorizontal, X, ChevronUp, ChevronDown

} from 'lucide-react';

import clsx from 'clsx';

import { db } from '@/lib/firebase';

import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';



type Tab = 'approvals' | 'voidApprovals' | 'discountApprovals' | 'cancellations' | 'discrepancies' | 'remoteShifts' | 'policies' | 'info';



const TABS: { id: Tab; label: string; icon: typeof Inbox }[] = [

    { id: 'approvals', label: 'Gastos', icon: Inbox },

    { id: 'voidApprovals', label: 'Devoluciones', icon: RotateCcw },

    { id: 'discountApprovals', label: 'Descuentos', icon: Percent },

    { id: 'cancellations', label: 'Cancelaciones', icon: Truck },

    { id: 'discrepancies', label: 'Discrepancias', icon: AlertOctagon },

    { id: 'remoteShifts', label: 'Turnos Abiertos', icon: DoorClosed },

    { id: 'policies', label: 'Políticas', icon: Settings2 },

    { id: 'info', label: 'Información', icon: ShieldCheck },

];



export default function GerenciaPage() {
    const { isOnline } = useNetworkStatus();


    const { user, userName, role } = useAuth();

    const { isHQ } = useBranch();

    const { config, refreshConfig } = useConfig();

    const router = useRouter();

    const searchParams = useSearchParams();



    const initialTab: Tab = (() => {

        const t = searchParams.get('tab');

        if (t === 'approvals' || t === 'voidApprovals' || t === 'discountApprovals' || t === 'cancellations' || t === 'discrepancies' || t === 'remoteShifts' || t === 'policies' || t === 'info') return t;

        return 'approvals';

    })();

    const [tab, setTab] = useState<Tab>(initialTab);

    const approvals = usePendingApprovalsCount(role === 'GERENTE');



    // Guard: solo GERENTE

    useEffect(() => {

        if (role && role !== 'GERENTE') {

            toast.error('Solo GERENTE puede acceder al panel de Gerencia.');

            router.replace('/inicio');

        }

    }, [role, router]);



    if (!isOnline) return <OfflineModuleGuard moduleName="Gerencia"><span/></OfflineModuleGuard>;

    if (role !== 'GERENTE') {

        return null;

    }



    return (

        <div className="min-h-full p-6 lg:p-8 bg-slate-50 dark:bg-background">

            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header */}

                <div data-tour="gerencia-header" className="flex items-center gap-4">

                    <div className="p-3 rounded-2xl bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black shadow-xl">

                        <Briefcase size={24} strokeWidth={2.5} />

                    </div>

                    <div>

                        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">Centro de Gerencia</h1>

                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">

                            Aprobaciones · Políticas · Control operativo

                        </p>

                    </div>

                </div>



                <div data-tour="gerencia-banner">
                <PendingBanner chips={[

                    { count: approvals.expenses,      label: 'Gastos',         icon: FileText,    color: 'amber',  onClick: () => setTab('approvals')          },

                    { count: approvals.voids,          label: 'Devoluciones',   icon: RotateCcw,   color: 'blue',   onClick: () => setTab('voidApprovals')      },

                    { count: approvals.discounts,      label: 'Descuentos',     icon: Percent,     color: 'purple', onClick: () => setTab('discountApprovals')  },

                    { count: approvals.cancellations,  label: 'Cancelaciones',  icon: Truck,       color: 'rose',   onClick: () => setTab('cancellations')      },

                    { count: approvals.discrepancies,  label: 'Discrepancias',  icon: AlertOctagon,color: 'rose',   onClick: () => setTab('discrepancies')      },

                ]} />
                </div>



                {/* Tabs */}

                <div data-tour="gerencia-tabs" className="flex gap-2 border-b border-slate-200 dark:border-white/10">

                    {TABS.map(t => (

                        <button

                            key={t.id}

                            onClick={() => setTab(t.id)}

                            className={clsx(

                                "flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all",

                                tab === t.id

                                    ? "border-yellow-500 text-slate-900 dark:text-white"

                                    : "border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-white"

                            )}

                        >

                            <t.icon size={14} strokeWidth={2.5} />

                            {t.label}

                        </button>

                    ))}

                </div>



                {/* Body */}

                <div data-tour="gerencia-tab-content">

                {tab === 'approvals' && (

                    <ApprovalsTab

                        branchId={undefined}

                        approverId={user?.uid || ''}

                        approverName={userName ?? ''}

                        approverRole={role ?? undefined}

                    />

                )}

                {tab === 'voidApprovals' && (

                    <VoidApprovalsTab

                        branchId={undefined}

                        approverId={user?.uid || ''}

                        approverName={userName ?? ''}

                        approverEmail={user?.email || ''}

                        approverRole={role ?? undefined}

                    />

                )}

                {tab === 'discountApprovals' && (

                    <DiscountApprovalsTab

                        branchId={undefined}

                        approverId={user?.uid || ''}

                        approverName={userName ?? ''}

                        approverRole={role ?? undefined}

                    />

                )}

                {tab === 'cancellations' && (

                    <CancellationsTab

                        approverId={user?.uid || ''}

                        approverName={userName ?? ''}

                        isHQManager={isHQ && role === 'GERENTE'}

                    />

                )}

                {tab === 'discrepancies' && (

                    <DiscrepanciesTab

                        resolverId={user?.uid || ''}

                        resolverName={userName ?? ''}

                    />

                )}

                {tab === 'remoteShifts' && (

                    <RemoteShiftsTab

                        adminId={user?.uid || ''}

                        adminName={userName ?? user?.email ?? ''}

                    />

                )}

                {tab === 'policies' && (

                    <PoliciesTab config={config} onSaved={refreshConfig} />

                )}

                {tab === 'info' && <InfoTab />}

                </div>

            </div>

        </div>

    );

}



// ============================================================

// TAB: APROBACIONES DE GASTOS

// ============================================================

function ApprovalsTab({

    branchId, approverId, approverName, approverRole

}: {

    branchId: string | undefined;

    approverId: string;

    approverName: string;

    approverRole: string | undefined;

}) {

    const [view, setView] = useState<'pending' | 'history'>('pending');

    const [items, setItems] = useState<OperationalExpense[]>([]);

    const [loading, setLoading] = useState(true);

    const [busyId, setBusyId] = useState<string | null>(null);

    const [search, setSearch] = useState('');

    const [dateFrom, setDateFrom] = useState('');

    const [dateTo, setDateTo] = useState('');



    useEffect(() => {

        setLoading(true);

        if (view === 'pending') {

            const constraints = [where('status', '==', 'PENDING_APPROVAL'), orderBy('createdAt', 'desc')];

            if (branchId) constraints.unshift(where('branchId', '==', branchId));

            const q = query(collection(db, 'gastos_operativos'), ...constraints);

            const unsub = onSnapshot(q,

                snap => {

                    const data = snap.docs.map(d => { const raw = d.data(); return { id: d.id, ...raw, date: raw.date?.toDate?.() || raw.date, createdAt: raw.createdAt?.toDate?.() || raw.createdAt } as OperationalExpense; });

                    setItems(data); setLoading(false);

                },

                err => { console.error('ApprovalsTab snapshot:', err); toast.error('Error en tiempo real: ' + err.message); setLoading(false); }

            );

            return () => unsub();

        } else {

            const constraints = [where('status', 'in', ['ACTIVE', 'REJECTED'])];

            if (branchId) constraints.unshift(where('branchId', '==', branchId));

            const q = query(collection(db, 'gastos_operativos'), ...constraints);

            const unsub = onSnapshot(q,

                snap => {

                    const data = snap.docs

                        .map(d => { const raw = d.data(); return { id: d.id, ...raw, date: raw.date?.toDate?.() || raw.date, createdAt: raw.createdAt?.toDate?.() || raw.createdAt } as OperationalExpense; })

                        .filter(e => e.approvedBy || e.rejectedBy)

                        .sort((a, b) => { const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : 0; const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : 0; return tb - ta; });

                    setItems(data); setLoading(false);

                },

                err => { console.error('ApprovalsTab history snapshot:', err); toast.error('Error en tiempo real: ' + err.message); setLoading(false); }

            );

            return () => unsub();

        }

    }, [branchId, view]);



    const handleApprove = async (exp: OperationalExpense) => {

        if (!exp.id || busyId) return;

        const ok = await confirmDialog({

            title: 'Aprobar gasto',

            message: `${exp.category} — Bs. ${exp.amount.toFixed(2)} — ${exp.description}. Solicitado por ${exp.userName}. Se registrará un EGRESO en la caja del cajero solicitante.`,

            variant: 'warning',

            confirmText: 'Aprobar',

        });

        if (!ok) return;

        setBusyId(exp.id);

        try {

            await ExpenseService.approve(exp.id, approverId, approverName, approverRole);

            toast.success('Gasto aprobado y egreso registrado en caja.');

        } catch (err) {

            toast.error(err instanceof Error ? err.message : 'Error al aprobar');

        } finally {

            setBusyId(null);

        }

    };



    const handleReject = async (exp: OperationalExpense) => {

        if (!exp.id || busyId) return;

        const reason = await promptDialog({

            title: 'Rechazar gasto',

            label: 'Motivo del rechazo',

            minLength: 5,

            multiline: true,

            variant: 'danger',

            confirmText: 'Rechazar',

        });

        if (!reason || reason.trim().length < 5) {

            if (reason !== null) toast.error('Motivo requerido');

            return;

        }

        setBusyId(exp.id);

        try {

            await ExpenseService.reject(exp.id, approverId, approverName, reason, approverRole);

            toast.success('Gasto rechazado.');

        } catch (err) {

            toast.error(err instanceof Error ? err.message : 'Error al rechazar');

        } finally {

            setBusyId(null);

        }

    };



    const filtered = items.filter(exp => {

        if (search.trim()) {

            const s = search.trim().toLowerCase();

            if (!(exp.description || '').toLowerCase().includes(s) && !(exp.category || '').toLowerCase().includes(s) && !(exp.userName || '').toLowerCase().includes(s)) return false;

        }

        if (dateFrom && exp.createdAt instanceof Date && exp.createdAt < new Date(dateFrom + 'T00:00:00')) return false;

        if (dateTo && exp.createdAt instanceof Date && exp.createdAt > new Date(dateTo + 'T23:59:59')) return false;

        return true;

    });



    return (

        <div className="space-y-4">

            <div className="flex items-center justify-between flex-wrap gap-2">

                <div>

                    <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">

                        Gastos Operativos

                    </h2>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">

                        {view === 'pending' ? 'Cajeros que solicitaron registrar gastos sobre el umbral' : 'Gastos ya aprobados o rechazados'}

                    </p>

                </div>

                <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">

                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> En vivo

                </span>

            </div>



            <SegmentedToggle

                value={view}

                onChange={(v) => setView(v as 'pending' | 'history')}

                options={[{ value: 'pending', label: 'Pendientes' }, { value: 'history', label: 'Histórico' }]}

            />



            <FilterBar

                search={search}

                onSearch={setSearch}

                dateFrom={dateFrom}

                dateTo={dateTo}

                onDateFrom={setDateFrom}

                onDateTo={setDateTo}

                placeholder="Buscar por categoría, descripción o cajero…"

            />



            {loading ? (

                <div className="text-center py-12 text-slate-400 text-[10px] font-bold uppercase tracking-widest">Cargando...</div>

            ) : filtered.length === 0 ? (

                <div className="text-center py-16 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10">

                    <CheckCircle2 size={48} strokeWidth={1.5} className="mx-auto text-emerald-500 mb-3" />

                    <p className="text-sm font-black text-slate-900 dark:text-white">

                        {view === 'pending' ? 'Sin solicitudes pendientes' : 'Sin registros en el histórico'}

                    </p>

                    {view === 'pending' && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Todo al día</p>}

                </div>

            ) : (

                <div className="space-y-3">

                    {filtered.map(exp => (

                        <div key={exp.id} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">

                            <div className="space-y-2">

                                <div className="flex items-center gap-2 flex-wrap">

                                    <span className="px-2 py-0.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[9px] font-black uppercase tracking-widest">

                                        {exp.category}

                                    </span>

                                    <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">

                                        Bs. {exp.amount.toFixed(2)}

                                    </span>

                                </div>

                                <p className="text-sm text-slate-700 dark:text-slate-300">{exp.description}</p>

                                <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">

                                    <span className="flex items-center gap-1"><Building2 size={11} /> {exp.branchId}</span>

                                    <span className="flex items-center gap-1"><Clock size={11} /> {exp.date instanceof Date ? exp.date.toLocaleDateString('es-BO') : ensureDate(exp.date).toLocaleDateString('es-BO')}</span>

                                    <span className="flex items-center gap-1">Cajero: {exp.userName}</span>

                                    {exp.paymentMethod && <span>Pago: {exp.paymentMethod}</span>}

                                    {exp.supplierName && <span>Prov: {exp.supplierName}</span>}

                                </div>

                                {exp.receiptUrl && (

                                    <a

                                        href={exp.receiptUrl}

                                        target="_blank"

                                        rel="noopener noreferrer"

                                        className="inline-flex items-center gap-1 text-[10px] font-black text-blue-600 hover:underline uppercase tracking-widest"

                                    >

                                        <FileText size={11} /> Ver comprobante

                                    </a>

                                )}

                            </div>

                            {view === 'pending' ? (

                                <div className="flex md:flex-col gap-2 self-center">

                                    <button

                                        onClick={() => handleApprove(exp)}

                                        disabled={busyId === exp.id}

                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"

                                    >

                                        <CheckCircle2 size={12} strokeWidth={2.5} /> {busyId === exp.id ? 'Procesando…' : 'Aprobar'}

                                    </button>

                                    <button

                                        onClick={() => handleReject(exp)}

                                        disabled={busyId === exp.id}

                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"

                                    >

                                        <XCircle size={12} strokeWidth={2.5} /> Rechazar

                                    </button>

                                </div>

                            ) : (

                                <div className="flex flex-col items-end gap-1 self-center min-w-28">

                                    <span className={clsx('px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest', exp.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400')}>

                                        {exp.status === 'ACTIVE' ? 'Aprobado' : 'Rechazado'}

                                    </span>

                                    {exp.approvedByName && <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">por {exp.approvedByName}</span>}

                                    {exp.rejectedByName && <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">por {exp.rejectedByName}</span>}

                                    {exp.rejectionReason && <span className="text-[9px] text-rose-500 font-bold text-right">{exp.rejectionReason}</span>}

                                </div>

                            )}

                        </div>

                    ))}

                </div>

            )}

        </div>

    );

}



// ============================================================

// TAB: POLÍTICAS OPERATIVAS (toggles + umbrales)

// ============================================================

function PoliciesTab({ config, onSaved }: { config: AppConfig | null; onSaved: () => void }) {

    const [allowSales, setAllowSales] = useState(false);

    const [allowPurchases, setAllowPurchases] = useState(false);

    const [allowExpenses, setAllowExpenses] = useState(false);

    const [discountHardBlock, setDiscountHardBlock] = useState('30');

    const [saving, setSaving] = useState(false);



    useEffect(() => {

        if (!config) return;

        setAllowSales(config.allowRetroactiveSales === true);

        setAllowPurchases(config.allowRetroactivePurchases === true);

        setAllowExpenses(config.allowRetroactiveExpenses === true);

        setDiscountHardBlock(String(config.discountHardBlockThresholdPercent ?? 30));

    }, [config]);



    const handleSave = async () => {

        if (!config) {

            toast.error('Configuración no cargada');

            return;

        }

        setSaving(true);

        try {

            const updated: AppConfig = {

                ...config,

                allowRetroactiveSales: allowSales,

                allowRetroactivePurchases: allowPurchases,

                allowRetroactiveExpenses: allowExpenses,

                discountHardBlockThresholdPercent: Math.max(0, Math.min(100, parseFloat(discountHardBlock) || 0)),

                updatedAt: new Date()

            };

            // Políticas globales ? NO pasar branchId (evita desviar a metadata de sucursal)

            await ConfigService.saveConfig(updated);

            toast.success('Políticas guardadas');

            onSaved();

        } catch (err) {

            toast.error(err instanceof Error ? err.message : 'Error al guardar');

        } finally {

            setSaving(false);

        }

    };



    return (

        <div className="space-y-6">

            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-5">

                <div>

                    <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Operaciones Retroactivas</h2>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">

                        Controla si se pueden registrar ventas/compras/gastos con fecha pasada. Aplica para TODOS los roles.

                    </p>

                </div>



                <ToggleRow

                    label="Permitir ventas retroactivas"

                    description="POS permitirá fechar ventas en días anteriores"

                    value={allowSales}

                    onChange={setAllowSales}

                />

                <ToggleRow

                    label="Permitir compras retroactivas"

                    description="Formulario de compras permitirá fechas anteriores"

                    value={allowPurchases}

                    onChange={setAllowPurchases}

                />

                <ToggleRow

                    label="Permitir gastos retroactivos"

                    description="Modal de gastos permitirá registrar fechas anteriores (solo libro contable, no afecta caja)"

                    value={allowExpenses}

                    onChange={setAllowExpenses}

                />

            </div>



            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-5">

                <div>

                    <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Umbrales Operativos</h2>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">

                        Límites para alertas automáticas y aprobación de gastos

                    </p>

                </div>



                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    <NumberField

                        label="% Descuento máximo permitido"

                        suffix="%"

                        value={discountHardBlock}

                        onChange={setDiscountHardBlock}

                        hint="Por debajo de este % el descuento se aplica y queda en auditoría. Por encima, el POS se bloquea hasta que el GERENTE apruebe en tiempo real."

                    />

                </div>

                <div className="rounded-2xl border border-yellow-200/80 bg-yellow-50/80 dark:bg-yellow-950/20 p-4 text-sm text-slate-700 dark:text-slate-200">

                    El umbral de alerta por sesión prolongada y cierre forzoso se configura desde <a href="/tesoreria?tab=CONFIG" className="font-black underline">Tesorería ? Configuración</a>.

                </div>

            </div>



            <div className="flex justify-end">

                <button

                    onClick={handleSave}

                    disabled={saving}

                    className="px-8 py-3 rounded-2xl bg-slate-900 dark:bg-[#FFD700] text-white dark:text-black text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"

                >

                    {saving ? 'Guardando...' : 'Guardar Políticas'}

                </button>

            </div>

        </div>

    );

}



function ToggleRow({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {

    return (

        <div className="flex items-start justify-between gap-4">

            <div className="flex-1">

                <p className="text-sm font-black text-slate-900 dark:text-white">{label}</p>

                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{description}</p>

            </div>

            <button

                type="button"

                role="switch"

                aria-checked={value}

                aria-label={label}

                onClick={() => onChange(!value)}

                className={clsx(

                    "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900",

                    value ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"

                )}

            >

                <span

                    aria-hidden="true"

                    className={clsx(

                        "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition-transform",

                        value ? "translate-x-5.5" : "translate-x-0.5"

                    )}

                />

            </button>

        </div>

    );

}



function NumberField({ label, value, onChange, suffix, hint }: { label: string; value: string; onChange: (v: string) => void; suffix?: string; hint?: string }) {

    return (

        <div className="space-y-1.5">

            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>

            <div className="flex items-center bg-slate-50 dark:bg-white/5 rounded-xl border-2 border-slate-100 dark:border-white/10 focus-within:border-yellow-500">

                <input

                    type="number"

                    min="0"

                    value={value}

                    onChange={e => onChange(e.target.value)}

                    className="flex-1 bg-transparent p-3 text-lg font-black text-slate-900 dark:text-white outline-none tabular-nums"

                />

                {suffix && <span className="px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{suffix}</span>}

            </div>

            {hint && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{hint}</p>}

        </div>

    );

}



// ============================================================

// TAB: INFO / ATAJOS

// ============================================================

function InfoTab() {

    return (

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <InfoCard

                href="/auditoria/alertas"

                icon={AlertTriangle}

                title="Alertas Operativas"

                description="Descuadres de caja, turnos largos, gastos duplicados, descuentos altos"

                color="amber"

            />

            <InfoCard

                href="/auditoria"

                icon={ShieldCheck}

                title="Bitácora Completa"

                description="Todos los eventos auditables del sistema"

                color="slate"

            />

            <InfoCard

                href="/caja"

                icon={Inbox}

                title="Caja"

                description="Reapertura de turnos cerrados, traslados de bóveda entre sucursales"

                color="emerald"

            />

            <InfoCard

                href="/configuracion"

                icon={Settings2}

                title="Configuración General"

                description="Datos de empresa, tipo de cambio, banca, QR"

                color="blue"

            />

        </div>

    );

}



function InfoCard({ href, icon: Icon, title, description, color }: {

    href: string;

    icon: typeof Inbox;

    title: string;

    description: string;

    color: 'amber' | 'slate' | 'emerald' | 'blue';

}) {

    const colorMap: Record<string, string> = {

        amber: 'bg-amber-500/10 text-amber-600 border-amber-500/30',

        slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30',

        emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',

        blue: 'bg-blue-500/10 text-blue-600 border-blue-500/30',

    };

    return (

        <a href={href} className="group bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 hover:border-yellow-500 transition-all">

            <div className={clsx("inline-flex p-3 rounded-2xl border-2 mb-3", colorMap[color])}>

                <Icon size={20} strokeWidth={2.5} />

            </div>

            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{title}</h3>

            <p className="text-[11px] text-slate-500 mt-1">{description}</p>

        </a>

    );

}



// ============================================================

// TAB: APROBACIONES DE ANULACIÓN DE VENTA (cross-shift)

// ============================================================

function VoidApprovalsTab({

    branchId, approverId, approverName, approverEmail, approverRole

}: {

    branchId: string | undefined;

    approverId: string;

    approverName: string;

    approverEmail: string;

    approverRole: string | undefined;

}) {

    const [view, setView] = useState<'pending' | 'history'>('pending');

    const [items, setItems] = useState<PendingVoidApproval[]>([]);

    const [loading, setLoading] = useState(true);

    const [busyId, setBusyId] = useState<string | null>(null);

    const [search, setSearch] = useState('');

    const [dateFrom, setDateFrom] = useState('');

    const [dateTo, setDateTo] = useState('');



    // Realtime

    useEffect(() => {

        setLoading(true);

        const statusFilter = view === 'pending' ? where('status', '==', 'PENDING') : where('status', 'in', ['APPROVED', 'REJECTED']);

        const orderC = view === 'pending' ? [orderBy('requestedAt', 'desc')] : [];

        const constraints = [statusFilter, ...orderC];

        if (branchId) constraints.unshift(where('branchId', '==', branchId));

        const q = query(collection(db, 'pending_void_approvals'), ...constraints);

        const unsub = onSnapshot(

            q,

            snap => {

                let data = snap.docs.map(d => {

                    const raw = d.data();

                    return {

                        id: d.id,

                        ...raw,

                        saleDate: raw.saleDate?.toDate?.() || raw.saleDate,

                        requestedAt: raw.requestedAt?.toDate?.() || raw.requestedAt,

                        resolvedAt: raw.resolvedAt?.toDate?.() || raw.resolvedAt,

                    } as unknown as PendingVoidApproval;

                });

                if (view === 'history') {

                    data = data.sort((a, b) => {

                        const ta = a.approvedAt instanceof Date ? a.approvedAt.getTime() : a.requestedAt instanceof Date ? a.requestedAt.getTime() : 0;

                        const tb = b.approvedAt instanceof Date ? b.approvedAt.getTime() : b.requestedAt instanceof Date ? b.requestedAt.getTime() : 0;

                        return tb - ta;

                    });

                }

                setItems(data);

                setLoading(false);

            },

            err => {

                console.error('VoidApprovalsTab snapshot:', err);

                toast.error('Error en tiempo real: ' + err.message);

                setLoading(false);

            }

        );

        return () => unsub();

    }, [branchId, view]);



    const handleApprove = async (req: PendingVoidApproval) => {

        if (!req.id) return;

        const ok = await confirmDialog({

            title: 'Aprobar anulación de venta',

            message: `Venta #${req.saleShortId} — Bs. ${req.saleTotal.toFixed(2)} (${req.saleMethod}). Motivo: ${req.reason}. Solicitado por ${req.requestedByName}. Se restaurará el stock y se generará el egreso de caja.`,

            variant: 'warning',

            confirmText: 'Aprobar anulación',

        });

        if (!ok) return;

        setBusyId(req.id);

        try {

            await SaleApprovalService.approve(req.id, approverId, approverName, approverEmail, approverRole);

            toast.success('Anulación aprobada y procesada.');

        } catch (err) {

            toast.error(err instanceof Error ? err.message : 'Error al aprobar');

        } finally {

            setBusyId(null);

        }

    };



    const handleReject = async (req: PendingVoidApproval) => {

        if (!req.id) return;

        const reason = await promptDialog({

            title: 'Rechazar anulación',

            label: 'Motivo del rechazo',

            minLength: 5,

            multiline: true,

            variant: 'danger',

            confirmText: 'Rechazar',

        });

        if (!reason || reason.trim().length < 5) {

            if (reason !== null) toast.error('Motivo requerido');

            return;

        }

        setBusyId(req.id);

        try {

            await SaleApprovalService.reject(req.id, approverId, approverName, reason, approverRole);

            toast.success('Solicitud rechazada.');

        } catch (err) {

            toast.error(err instanceof Error ? err.message : 'Error al rechazar');

        } finally {

            setBusyId(null);

        }

    };



    const voidFiltered = items.filter(req => {

        if (search.trim()) {

            const s = search.trim().toLowerCase();

            if (!String(req.saleShortId || '').toLowerCase().includes(s) && !(req.reason || '').toLowerCase().includes(s) && !(req.requestedByName || '').toLowerCase().includes(s)) return false;

        }

        const refDate = req.requestedAt instanceof Date ? req.requestedAt : undefined;

        if (dateFrom && refDate && refDate < new Date(dateFrom + 'T00:00:00')) return false;

        if (dateTo && refDate && refDate > new Date(dateTo + 'T23:59:59')) return false;

        return true;

    });



    return (

        <div className="space-y-4">

            <div className="flex items-center justify-between flex-wrap gap-2">

                <div>

                    <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">

                        Devoluciones / Anulaciones

                    </h2>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">

                        {view === 'pending' ? 'Cajeros que pidieron anular ventas de turnos cerrados' : 'Anulaciones ya aprobadas o rechazadas'}

                    </p>

                </div>

                <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">

                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> En vivo

                </span>

            </div>



            <SegmentedToggle

                value={view}

                onChange={(v) => setView(v as 'pending' | 'history')}

                options={[{ value: 'pending', label: 'Pendientes' }, { value: 'history', label: 'Histórico' }]}

            />



            <FilterBar

                search={search}

                onSearch={setSearch}

                dateFrom={dateFrom}

                dateTo={dateTo}

                onDateFrom={setDateFrom}

                onDateTo={setDateTo}

                placeholder="Buscar por venta, motivo o cajero…"

            />



            {loading ? (

                <div className="text-center py-12 text-slate-400 text-[10px] font-bold uppercase tracking-widest">Cargando...</div>

            ) : voidFiltered.length === 0 ? (

                <div className="text-center py-16 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10">

                    <CheckCircle2 size={48} strokeWidth={1.5} className="mx-auto text-emerald-500 mb-3" />

                    <p className="text-sm font-black text-slate-900 dark:text-white">

                        {view === 'pending' ? 'Sin anulaciones pendientes' : 'Sin registros en el histórico'}

                    </p>

                </div>

            ) : (

                <div className="space-y-3">

                    {voidFiltered.map(req => (

                        <div key={req.id} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">

                            <div className="space-y-2">

                                <div className="flex items-center gap-2 flex-wrap">

                                    <span className="px-2 py-0.5 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[9px] font-black uppercase tracking-widest">

                                        Venta #{req.saleShortId}

                                    </span>

                                    <span className="px-2 py-0.5 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest">

                                        {req.saleMethod}

                                    </span>

                                    <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">

                                        Bs. {req.saleTotal.toFixed(2)}

                                    </span>

                                </div>

                                <p className="text-sm text-slate-700 dark:text-slate-300"><strong>Motivo:</strong> {req.reason}</p>

                                <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">

                                    <span className="flex items-center gap-1"><Building2 size={11} /> {req.branchId}</span>

                                    <span className="flex items-center gap-1"><Clock size={11} /> Venta: {ensureDate(req.saleDate as Date).toLocaleDateString('es-BO')}</span>

                                    <span>Solicitó: {req.requestedByName}</span>

                                </div>

                            </div>

                            {view === 'pending' ? (

                                <div className="flex md:flex-col gap-2 self-center">

                                    <button

                                        onClick={() => handleApprove(req)}

                                        disabled={busyId === req.id}

                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50"

                                    >

                                        <CheckCircle2 size={12} strokeWidth={2.5} /> Aprobar

                                    </button>

                                    <button

                                        onClick={() => handleReject(req)}

                                        disabled={busyId === req.id}

                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-50"

                                    >

                                        <XCircle size={12} strokeWidth={2.5} /> Rechazar

                                    </button>

                                </div>

                            ) : (

                                <div className="flex flex-col items-end gap-1 self-center min-w-28">

                                    <span className={clsx('px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest', req.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400')}>

                                        {req.status === 'APPROVED' ? 'Aprobada' : 'Rechazada'}

                                    </span>

                                    {req.approvedByName && <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">por {req.approvedByName}</span>}

                                    {req.approvedAt instanceof Date && <span className="text-[9px] text-slate-400 font-bold">{req.approvedAt.toLocaleDateString('es-BO')}</span>}

                                </div>

                            )}

                        </div>

                    ))}

                </div>

            )}

        </div>

    );

}



// ============================================================

// TAB: TURNOS ABIERTOS (cierre remoto)

// ============================================================

function RemoteShiftsTab({ adminId, adminName }: { adminId: string; adminName: string }) {

    const { branches } = useBranch();

    const [view, setView] = useState<'pending' | 'history'>('pending');

    const [shifts, setShifts] = useState<CashierSession[]>([]);

    const [loading, setLoading] = useState(true);

    const [busyId, setBusyId] = useState<string | null>(null);

    const [search, setSearch] = useState('');



    useEffect(() => {

        setLoading(true);

        let q;

        if (view === 'pending') {

            q = query(collection(db, 'cashier_sessions'), where('status', '==', 'OPEN'), orderBy('openedAt', 'asc'));

        } else {

            q = query(collection(db, 'cashier_sessions'), where('status', 'in', ['CLOSED', 'FORCE_CLOSED']));

        }

        const unsub = onSnapshot(

            q,

            snap => {

                let data = snap.docs.map(d => {

                    const raw = d.data();

                    return {

                        id: d.id,

                        ...raw,

                        openedAt: raw.openedAt?.toDate?.() || raw.openedAt,

                        closedAt: raw.closedAt?.toDate?.() || raw.closedAt,

                    } as CashierSession;

                });

                if (view === 'history') {

                    data = data.sort((a, b) => {

                        const ta = a.closedAt instanceof Date ? a.closedAt.getTime() : 0;

                        const tb = b.closedAt instanceof Date ? b.closedAt.getTime() : 0;

                        return tb - ta;

                    }).slice(0, 100);

                }

                setShifts(data);

                setLoading(false);

            },

            err => {

                console.error('RemoteShiftsTab snapshot:', err);

                toast.error('Error en tiempo real: ' + err.message);

                setLoading(false);

            }

        );

        return () => unsub();

    }, [view]);



    const branchName = (id: string) => branches.find(b => b.id === id)?.name || id;



    const handleForceClose = async (s: CashierSession) => {

        if (!s.id) return;

        const openedAtDate = s.openedAt instanceof Date

            ? s.openedAt

            : (s.openedAt as { toDate?: () => Date })?.toDate?.() ?? new Date();

        const startedHrs = ((Date.now() - openedAtDate.getTime()) / (1000 * 60 * 60)).toFixed(1);

        const ok = await confirmDialog({

            title: 'Cierre forzado de sesión',

            message: `Sucursal: ${branchName(s.branchId)}. Cajero: ${s.cashierName || '?'}. Abierta hace ${startedHrs}h. Efectivo inicial: Bs. ${s.openingTotal?.toFixed(2) ?? '0.00'}. Se cerrará con cuadre forzado y se registrará en bitácora.`,

            variant: 'danger',

            confirmText: 'Forzar cierre',

        });

        if (!ok) return;

        setBusyId(s.id);

        try {

            await CashierSessionService.forceClose(s.id, { uid: adminId, name: adminName }, 'Cierre remoto desde Gerencia');

            toast.success('Sesión cerrada de forma remota.');

        } catch (err) {

            toast.error(err instanceof Error ? err.message : 'Error al cerrar sesión');

        } finally {

            setBusyId(null);

        }

    };



    const shiftsFiltered = shifts.filter(s => {

        if (!search.trim()) return true;

        const str = search.trim().toLowerCase();

        return (s.cashierName || '').toLowerCase().includes(str) || branchName(s.branchId).toLowerCase().includes(str);

    });



    return (

        <div className="space-y-4">

            <div className="flex items-center justify-between flex-wrap gap-2">

                <div>

                    <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">

                        Turnos de Caja

                    </h2>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">

                        {view === 'pending' ? 'Turnos OPEN — cierre forzado para turnos abandonados' : 'Últimos 100 turnos cerrados'}

                    </p>

                </div>

                <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">

                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> En vivo

                </span>

            </div>



            <SegmentedToggle

                value={view}

                onChange={(v) => setView(v as 'pending' | 'history')}

                options={[{ value: 'pending', label: 'Abiertos' }, { value: 'history', label: 'Histórico' }]}

            />



            <input

                type="text"

                value={search}

                onChange={e => setSearch(e.target.value)}

                placeholder="Buscar por cajero o sucursal…"

                className="w-full max-w-xs text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"

            />



            {loading ? (

                <div className="text-center py-12 text-slate-400 text-[10px] font-bold uppercase tracking-widest">Cargando...</div>

            ) : shiftsFiltered.length === 0 ? (

                <div className="text-center py-16 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10">

                    <CheckCircle2 size={48} strokeWidth={1.5} className="mx-auto text-emerald-500 mb-3" />

                    <p className="text-sm font-black text-slate-900 dark:text-white">

                        {view === 'pending' ? 'No hay turnos abiertos' : 'Sin turnos en el histórico'}

                    </p>

                </div>

            ) : (

                <div className="space-y-3">

                    {shiftsFiltered.map(s => {

                        const openedAtDate = s.openedAt instanceof Date

                            ? s.openedAt

                            : (s.openedAt as { toDate?: () => Date })?.toDate?.() ?? new Date();

                        const closedAtDate = s.closedAt instanceof Date

                            ? s.closedAt

                            : (s.closedAt as { toDate?: () => Date })?.toDate?.() ?? null;

                        const startedHrs = (Date.now() - openedAtDate.getTime()) / (1000 * 60 * 60);

                        const durationHrs = closedAtDate ? (closedAtDate.getTime() - openedAtDate.getTime()) / (1000 * 60 * 60) : startedHrs;

                        const isLong = startedHrs > 12;

                        const isForceClosed = s.status === 'FORCE_CLOSED';

                        return (

                            <div key={s.id} className={clsx(

                                "bg-white dark:bg-white/5 border rounded-2xl p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4",

                                view === 'pending' && isLong ? "border-amber-500/40" : "border-slate-200 dark:border-white/10"

                            )}>

                                <div className="space-y-2">

                                    <div className="flex items-center gap-2 flex-wrap">

                                        <span className={clsx('px-2 py-0.5 rounded-xl text-[9px] font-black uppercase tracking-widest', view === 'pending' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : isForceClosed ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300')}>

                                            {view === 'pending' ? 'OPEN' : isForceClosed ? 'Cierre Forzado' : 'Cerrado'}

                                        </span>

                                        {view === 'pending' && isLong && (

                                            <span className="px-2 py-0.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[9px] font-black uppercase tracking-widest">

                                                {startedHrs.toFixed(1)}h

                                            </span>

                                        )}

                                        <span className="text-base font-black text-slate-900 dark:text-white">{formatUserName(s.cashierName) || '?'}</span>

                                    </div>

                                    <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">

                                        <span className="flex items-center gap-1"><Building2 size={11} /> {branchName(s.branchId)}</span>

                                        <span className="flex items-center gap-1"><Clock size={11} /> Apertura: {openedAtDate.toLocaleString('es-BO')}</span>

                                        {closedAtDate && <span className="flex items-center gap-1"><Clock size={11} /> Cierre: {closedAtDate.toLocaleString('es-BO')}</span>}

                                        <span>Inicial: Bs. {(s.openingTotal ?? 0).toFixed(2)}</span>

                                        {view === 'history' && <span>Duración: {durationHrs.toFixed(1)}h</span>}

                                    </div>

                                </div>

                                {view === 'pending' ? (

                                    <div className="flex md:flex-col gap-2 self-center">

                                        <button

                                            onClick={() => handleForceClose(s)}

                                            disabled={busyId === s.id}

                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-50"

                                        >

                                            <DoorClosed size={12} strokeWidth={2.5} /> Cerrar Remoto

                                        </button>

                                    </div>

                                ) : (

                                    <div className="self-center text-[10px] font-bold text-slate-500 text-right">

                                        {(s as unknown as Record<string, string | undefined>).closedByName && <p className="text-slate-700 dark:text-slate-300">Cerrado por: {(s as unknown as Record<string, string | undefined>).closedByName}</p>}

                                    </div>

                                )}

                            </div>

                        );

                    })}

                </div>

            )}

        </div>

    );

}



// ============================================================

// TAB: APROBACIONES DE DESCUENTO (revisión post-venta)

// ============================================================

function DiscountApprovalsTab({

    branchId, approverId, approverName, approverRole

}: {

    branchId: string | undefined;

    approverId: string;

    approverName: string;

    approverRole: string | undefined;

}) {

    const { branches } = useBranch();

    const [view, setView] = useState<'pending' | 'history'>('pending');

    const [items, setItems] = useState<PendingDiscountApproval[]>([]);

    const [loading, setLoading] = useState(true);

    const [busyId, setBusyId] = useState<string | null>(null);

    const [search, setSearch] = useState('');

    const [dateFrom, setDateFrom] = useState('');

    const [dateTo, setDateTo] = useState('');



    useEffect(() => {

        setLoading(true);

        const statusFilter = view === 'pending' ? where('status', 'in', ['PENDING', 'BLOCKED_PENDING']) : where('status', 'in', ['APPROVED', 'REJECTED']);

        const orderC = view === 'pending' ? [orderBy('requestedAt', 'desc')] : [];

        const constraints = [statusFilter, ...orderC];

        if (branchId) constraints.unshift(where('branchId', '==', branchId));

        const q = query(collection(db, 'pending_discount_approvals'), ...constraints);

        const unsub = onSnapshot(

            q,

            snap => {

                let data = snap.docs.map(d => {

                    const raw = d.data();

                    return {

                        id: d.id,

                        ...raw,

                        requestedAt: raw.requestedAt?.toDate?.() || raw.requestedAt,

                        resolvedAt: raw.resolvedAt?.toDate?.() || raw.resolvedAt,

                    } as PendingDiscountApproval;

                });

                if (view === 'history') {

                    data = data.sort((a, b) => {

                        const ta = a.resolvedAt instanceof Date ? a.resolvedAt.getTime() : a.requestedAt instanceof Date ? a.requestedAt.getTime() : 0;

                        const tb = b.resolvedAt instanceof Date ? b.resolvedAt.getTime() : b.requestedAt instanceof Date ? b.requestedAt.getTime() : 0;

                        return tb - ta;

                    });

                }

                setItems(data);

                setLoading(false);

            },

            err => {

                console.error('DiscountApprovalsTab snapshot:', err);

                toast.error('Error en tiempo real: ' + err.message);

                setLoading(false);

            }

        );

        return () => unsub();

    }, [branchId, view]);



    const branchName = (id: string) => branches.find(b => b.id === id)?.name || id;



    const handleApprove = async (req: PendingDiscountApproval) => {

        if (!req.id) return;

        const ok = await confirmDialog({

            title: 'Aprobar descuento',

            message: `${req.productName} (${req.productCode}). ${req.effectiveDiscountPct.toFixed(1)}% — Bs. ${req.originalPrice.toFixed(2)} ? Bs. ${req.finalPrice.toFixed(2)}. Cajero: ${req.cashierName}. No se revierte ninguna venta. Solo se marca como APROBADO.`,

            variant: 'warning',

            confirmText: 'Aprobar descuento',

        });

        if (!ok) return;

        setBusyId(req.id);

        try {

            await DiscountApprovalService.approve(req.id, approverId, approverName, approverRole);

            toast.success('Descuento aprobado.');

        } catch (err) {

            toast.error(err instanceof Error ? err.message : 'Error al aprobar');

        } finally {

            setBusyId(null);

        }

    };



    const handleReject = async (req: PendingDiscountApproval) => {

        if (!req.id) return;

        const reason = await promptDialog({

            title: 'Rechazar descuento',

            label: 'Motivo del rechazo',

            minLength: 5,

            multiline: true,

            variant: 'danger',

            confirmText: 'Rechazar',

        });

        if (!reason || reason.trim().length < 5) {

            if (reason !== null) toast.error('Motivo requerido');

            return;

        }

        setBusyId(req.id);

        try {

            await DiscountApprovalService.reject(req.id, approverId, approverName, reason, approverRole);

            toast.success('Descuento rechazado y registrado.');

        } catch (err) {

            toast.error(err instanceof Error ? err.message : 'Error al rechazar');

        } finally {

            setBusyId(null);

        }

    };



    const discountFiltered = items.filter(req => {

        if (search.trim()) {

            const s = search.trim().toLowerCase();

            if (!(req.productName || '').toLowerCase().includes(s) && !(req.productCode || '').toLowerCase().includes(s) && !(req.cashierName || '').toLowerCase().includes(s)) return false;

        }

        const refDate = req.requestedAt instanceof Date ? req.requestedAt : undefined;

        if (dateFrom && refDate && refDate < new Date(dateFrom + 'T00:00:00')) return false;

        if (dateTo && refDate && refDate > new Date(dateTo + 'T23:59:59')) return false;

        return true;

    });



    return (

        <div className="space-y-4">

            <div className="flex items-center justify-between flex-wrap gap-2">

                <div>

                    <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">

                        Descuentos sobre el Umbral

                    </h2>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">

                        {view === 'pending' ? 'Cajeros aplicaron descuentos sobre el umbral configurado' : 'Descuentos ya aprobados o rechazados'}

                    </p>

                </div>

                <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">

                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> En vivo

                </span>

            </div>



            <SegmentedToggle

                value={view}

                onChange={(v) => setView(v as 'pending' | 'history')}

                options={[{ value: 'pending', label: 'Pendientes' }, { value: 'history', label: 'Histórico' }]}

            />



            <FilterBar

                search={search}

                onSearch={setSearch}

                dateFrom={dateFrom}

                dateTo={dateTo}

                onDateFrom={setDateFrom}

                onDateTo={setDateTo}

                placeholder="Buscar por producto, código o cajero…"

            />



            {loading ? (

                <div className="text-center py-12 text-slate-400 text-[10px] font-bold uppercase tracking-widest">Cargando...</div>

            ) : discountFiltered.length === 0 ? (

                <div className="text-center py-16 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10">

                    <CheckCircle2 size={48} strokeWidth={1.5} className="mx-auto text-emerald-500 mb-3" />

                    <p className="text-sm font-black text-slate-900 dark:text-white">

                        {view === 'pending' ? 'Sin descuentos pendientes' : 'Sin registros en el histórico'}

                    </p>

                </div>

            ) : (

                <div className="space-y-3">

                    {discountFiltered.map(req => {

                        const ts = ensureDate(req.requestedAt);

                        return (

                            <div key={req.id} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">

                                <div className="space-y-2">

                                    <div className="flex items-center gap-2 flex-wrap">

                                        {req.hardBlock && (
                                            <span className="px-2 py-0.5 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[9px] font-black uppercase tracking-widest animate-pulse">
                                                Bloqueado
                                            </span>
                                        )}

                                        <span className="px-2 py-0.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[9px] font-black uppercase tracking-widest">

                                            {req.effectiveDiscountPct.toFixed(1)}%

                                        </span>

                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">

                                            Umbral: {req.thresholdPct}%

                                        </span>

                                        <span className="text-base font-black text-slate-900 dark:text-white">{req.productName}</span>

                                        <span className="text-[10px] font-bold text-slate-400">({req.productCode})</span>

                                    </div>

                                    <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">

                                        <span>Bs. {req.originalPrice.toFixed(2)} → <span className="text-rose-500">Bs. {req.finalPrice.toFixed(2)}</span></span>

                                        <span className="flex items-center gap-1"><Building2 size={11} /> {branchName(req.branchId)}</span>

                                        <span>Cajero: {formatUserName(req.cashierName)}</span>

                                        {ts && <span className="flex items-center gap-1"><Clock size={11} /> {ts.toLocaleString('es-BO')}</span>}

                                    </div>

                                </div>

                                {view === 'pending' ? (

                                    <div className="flex md:flex-col gap-2 self-center">

                                        <button

                                            onClick={() => handleApprove(req)}

                                            disabled={busyId === req.id}

                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50"

                                        >

                                            <CheckCircle2 size={12} strokeWidth={2.5} /> Aprobar

                                        </button>

                                        <button

                                            onClick={() => handleReject(req)}

                                            disabled={busyId === req.id}

                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-50"

                                        >

                                            <XCircle size={12} strokeWidth={2.5} /> Rechazar

                                        </button>

                                    </div>

                                ) : (

                                    <div className="flex flex-col items-end gap-1 self-center min-w-28">

                                        <span className={clsx('px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest', req.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400')}>

                                            {req.status === 'APPROVED' ? 'Aprobado' : 'Rechazado'}

                                        </span>

                                        {req.resolvedByName && <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">por {req.resolvedByName}</span>}

                                        {req.resolvedAt instanceof Date && <span className="text-[9px] text-slate-400 font-bold">{req.resolvedAt.toLocaleDateString('es-BO')}</span>}

                                    </div>

                                )}

                            </div>

                        );

                    })}

                </div>

            )}

        </div>

    );

}





// ============================================================

// TAB: CANCELACIONES DE PEDIDOS (HQ aprueba)

// ============================================================

function CancellationsTab({

    approverId, approverName, isHQManager

}: {

    approverId: string;

    approverName: string;

    isHQManager: boolean;

}) {

    const router = useRouter();

    const [view, setView] = useState<'pending' | 'history'>('pending');

    const [pedidos, setPedidos] = useState<Pedido[]>([]);

    const [envios, setEnvios] = useState<Envio[]>([]);

    const [loadingP, setLoadingP] = useState(true);

    const [loadingE, setLoadingE] = useState(true);

    const [busyId, setBusyId] = useState<string | null>(null);



    useEffect(() => {

        setLoadingP(true);

        setLoadingE(true);

        if (view === 'pending') {

            const unsubP = PedidoService.subscribePendingCancellations(data => { setPedidos(data); setLoadingP(false); });

            const unsubE = EnvioService.subscribePendingCancellations(data => { setEnvios(data); setLoadingE(false); });

            return () => { unsubP(); unsubE(); };

        } else {

            const qP = query(collection(db, 'pedidos'), where('status', '==', 'CANCELLED'), orderBy('createdAt', 'desc'));

            const unsubP = onSnapshot(qP, snap => {

                setPedidos(snap.docs.map(d => ({ codigo: d.id, ...d.data() } as Pedido)));

                setLoadingP(false);

            }, () => setLoadingP(false));

            const qE = query(collection(db, 'envios'), where('status', '==', 'CANCELLED'), orderBy('createdAt', 'desc'));

            const unsubE = onSnapshot(qE, snap => {

                setEnvios(snap.docs.map(d => ({ codigo: d.id, ...d.data() } as Envio)));

                setLoadingE(false);

            }, () => setLoadingE(false));

            return () => { unsubP(); unsubE(); };

        }

    }, [view]);



    const handleApprovePedido = async (p: Pedido) => {

        if (!p.codigo || !isHQManager) return;

        const ok = await confirmDialog({

            title: `Aprobar cancelación del pedido ${p.codigo}`,

            message: `${p.fromBranchName} ? ${p.toBranchName}. Motivo: ${p.cancellationReason}. Solicitó: ${p.cancellationRequestedByName}. El pedido pasará a estado CANCELADO.`,

            variant: 'warning',

            confirmText: 'Aprobar cancelación',

        });

        if (!ok) return;

        setBusyId(p.codigo);

        try {

            await PedidoService.approveCancellation(p.codigo, approverId, approverName, isHQManager);

            toast.success('Cancelación aprobada.');

        } catch (err) {

            toast.error(err instanceof Error ? err.message : 'Error al aprobar');

        } finally {

            setBusyId(null);

        }

    };



    const handleRejectPedido = async (p: Pedido) => {

        if (!p.codigo || !isHQManager) return;

        const reason = await promptDialog({

            title: 'Rechazar cancelación de pedido',

            label: 'Motivo del rechazo',

            minLength: 5,

            multiline: true,

            variant: 'danger',

            confirmText: 'Rechazar',

        });

        if (!reason || reason.trim().length < 5) {

            if (reason !== null) toast.error('Motivo requerido');

            return;

        }

        setBusyId(p.codigo);

        try {

            await PedidoService.rejectCancellation(p.codigo, approverId, approverName, isHQManager, reason.trim());

            toast.success('Solicitud rechazada.');

        } catch (err) {

            toast.error(err instanceof Error ? err.message : 'Error al rechazar');

        } finally {

            setBusyId(null);

        }

    };



    const handleApproveEnvio = async (e: Envio) => {

        if (!e.codigo || !isHQManager) return;

        const modeLabel = e.cancellationMode === 'devolucion' ? 'DEVOLUCIÓN (stock vuelve a origen)' : 'PÉRDIDA (stock NO retorna)';

        const ok = await confirmDialog({

            title: `Aprobar cancelación del envío ${e.codigo}`,

            message: `Modo: ${modeLabel}. ${e.fromBranchName} ? ${e.toBranchName}. Motivo: ${e.cancellationReason}. Solicitó: ${e.cancellationRequestedByName}.`,

            variant: 'warning',

            confirmText: 'Aprobar cancelación',

        });

        if (!ok) return;

        setBusyId(e.codigo);

        try {

            await EnvioService.approveInTransitCancellation({ envioId: e.codigo, approverId, approverName, isHQManager });

            toast.success('Cancelación aprobada.');

        } catch (err) {

            toast.error(err instanceof Error ? err.message : 'Error al aprobar');

        } finally {

            setBusyId(null);

        }

    };



    const handleRejectEnvio = async (e: Envio) => {

        if (!e.codigo || !isHQManager) return;

        const reason = await promptDialog({

            title: 'Rechazar cancelación de envío',

            label: 'Motivo del rechazo',

            minLength: 5,

            multiline: true,

            variant: 'danger',

            confirmText: 'Rechazar',

        });

        if (!reason || reason.trim().length < 5) {

            if (reason !== null) toast.error('Motivo requerido');

            return;

        }

        setBusyId(e.codigo);

        try {

            await EnvioService.rejectInTransitCancellation({ envioId: e.codigo, approverId, approverName, isHQManager, reason: reason.trim() });

            toast.success('Solicitud rechazada.');

        } catch (err) {

            toast.error(err instanceof Error ? err.message : 'Error al rechazar');

        } finally {

            setBusyId(null);

        }

    };



    const loading = loadingP || loadingE;

    const empty = !loading && pedidos.length === 0 && envios.length === 0;



    return (

        <div className="space-y-4">

            <div className="flex items-center justify-between flex-wrap gap-2">

                <div>

                    <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">

                        Cancelaciones de Pedidos y Envíos

                    </h2>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">

                        {view === 'pending' ? 'Solicitudes pendientes de aprobación HQ' : 'Pedidos y envíos cancelados'}

                    </p>

                </div>

                <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">

                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> En vivo

                </span>

            </div>



            <SegmentedToggle

                value={view}

                onChange={(v) => setView(v as 'pending' | 'history')}

                options={[{ value: 'pending', label: 'Pendientes' }, { value: 'history', label: 'Histórico' }]}

            />



            {view === 'pending' && !isHQManager && (

                <div className="p-4 rounded-xl border border-amber-300/40 bg-amber-50 dark:bg-amber-500/5 text-[11px] font-bold text-amber-800 dark:text-amber-300">

                    Solo el GERENTE de la sede HQ puede aprobar o rechazar cancelaciones.

                </div>

            )}



            {loading ? (

                <div className="text-center py-12 text-slate-400 text-[10px] font-bold uppercase tracking-widest">Cargando...</div>

            ) : empty ? (

                <div className="text-center py-16 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10">

                    <CheckCircle2 size={48} strokeWidth={1.5} className="mx-auto text-emerald-500 mb-3" />

                    <p className="text-sm font-black text-slate-900 dark:text-white">

                        {view === 'pending' ? 'Sin cancelaciones pendientes' : 'Sin cancelaciones en el histórico'}

                    </p>

                </div>

            ) : (

                <div className="space-y-6">

                    {pedidos.length > 0 && (

                        <div className="space-y-3">

                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pedidos ({pedidos.length})</h3>

                            {pedidos.map(p => {

                                const reqAt = (p.cancellationRequestedAt as Timestamp | undefined)?.toDate?.();

                                return (

                                    <div key={p.codigo} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">

                                        <div className="space-y-2">

                                            <div className="flex items-center gap-2 flex-wrap">

                                                <span className="px-2 py-0.5 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[9px] font-black uppercase tracking-widest">{p.codigo}</span>

                                                <span className="px-2 py-0.5 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest">{p.status}</span>

                                                <span className="text-sm font-black text-slate-900 dark:text-white inline-flex items-center gap-1">

                                                    {p.fromBranchName} <ArrowRight size={12} /> {p.toBranchName}

                                                </span>

                                            </div>

                                            <p className="text-sm text-slate-700 dark:text-slate-300"><strong>Motivo:</strong> {p.cancellationReason}</p>

                                            <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest items-center">

                                                <span>Solicitó: {p.cancellationRequestedByName}</span>

                                                {reqAt && <span className="flex items-center gap-1"><Clock size={11} /> {reqAt.toLocaleString('es-BO')}</span>}

                                                <button onClick={() => router.push(`/pedidos/${p.codigo}`)} className="text-blue-600 dark:text-blue-400 hover:underline">Ver pedido ?</button>

                                            </div>

                                        </div>

                                        {view === 'pending' ? (

                                            <div className="flex md:flex-col gap-2 self-center">

                                                <button onClick={() => handleApprovePedido(p)} disabled={busyId === p.codigo || !isHQManager} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50">

                                                    <CheckCircle2 size={12} strokeWidth={2.5} /> Aprobar

                                                </button>

                                                <button onClick={() => handleRejectPedido(p)} disabled={busyId === p.codigo || !isHQManager} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-50">

                                                    <XCircle size={12} strokeWidth={2.5} /> Rechazar

                                                </button>

                                            </div>

                                        ) : (

                                            <span className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest self-center">Cancelado</span>

                                        )}

                                    </div>

                                );

                            })}

                        </div>

                    )}



                    {envios.length > 0 && (

                        <div className="space-y-3">

                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Envíos en tránsito ({envios.length})</h3>

                            {envios.map(e => {

                                const reqAt = (e.cancellationRequestedAt as Timestamp | undefined)?.toDate?.();

                                const modeColor = e.cancellationMode === 'devolucion' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400';

                                return (

                                    <div key={e.codigo} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">

                                        <div className="space-y-2">

                                            <div className="flex items-center gap-2 flex-wrap">

                                                <span className="px-2 py-0.5 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[9px] font-black uppercase tracking-widest">{e.codigo}</span>

                                                <span className={`px-2 py-0.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${modeColor}`}>

                                                    <Truck size={9} className="inline mr-1" /> {e.cancellationMode === 'devolucion' ? 'Devolución' : 'Pérdida'}

                                                </span>

                                                <span className="text-sm font-black text-slate-900 dark:text-white inline-flex items-center gap-1">

                                                    {e.fromBranchName} <ArrowRight size={12} /> {e.toBranchName}

                                                </span>

                                            </div>

                                            <p className="text-sm text-slate-700 dark:text-slate-300"><strong>Motivo:</strong> {e.cancellationReason}</p>

                                            <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest items-center">

                                                <span>Solicitó: {e.cancellationRequestedByName}</span>

                                                {reqAt && <span className="flex items-center gap-1"><Clock size={11} /> {reqAt.toLocaleString('es-BO')}</span>}

                                                <button onClick={() => router.push(`/envios/${e.codigo}`)} className="text-blue-600 dark:text-blue-400 hover:underline">Ver envío ?</button>

                                            </div>

                                        </div>

                                        {view === 'pending' ? (

                                            <div className="flex md:flex-col gap-2 self-center">

                                                <button onClick={() => handleApproveEnvio(e)} disabled={busyId === e.codigo || !isHQManager} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50">

                                                    <CheckCircle2 size={12} strokeWidth={2.5} /> Aprobar

                                                </button>

                                                <button onClick={() => handleRejectEnvio(e)} disabled={busyId === e.codigo || !isHQManager} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-50">

                                                    <XCircle size={12} strokeWidth={2.5} /> Rechazar

                                                </button>

                                            </div>

                                        ) : (

                                            <span className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest self-center">Cancelado</span>

                                        )}

                                    </div>

                                );

                            })}

                        </div>

                    )}

                </div>

            )}

        </div>

    );

}



// ============================================================

// COMPONENTES UI REUSABLES (toggle pendientes/histórico, filtros)

// ============================================================

function SegmentedToggle({ value, onChange, options }: {

    value: string;

    onChange: (v: string) => void;

    options: { value: string; label: string }[];

}) {

    return (

        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-white/5 p-1 gap-1">

            {options.map(opt => (

                <button

                    key={opt.value}

                    onClick={() => onChange(opt.value)}

                    className={clsx(

                        'px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',

                        value === opt.value

                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'

                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'

                    )}

                >

                    {opt.label}

                </button>

            ))}

        </div>

    );

}



function FilterBar({

    search, onSearch, dateFrom, dateTo, onDateFrom, onDateTo, placeholder,

}: {

    search: string;

    onSearch: (v: string) => void;

    dateFrom: string;

    dateTo: string;

    onDateFrom: (v: string) => void;

    onDateTo: (v: string) => void;

    placeholder?: string;

}) {

    return (

        <div className="flex flex-wrap gap-2 items-center">

            <input

                type="text"

                value={search}

                onChange={(e) => onSearch(e.target.value)}

                placeholder={placeholder || 'Buscar…'}

                className="flex-1 min-w-50 text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"

            />

            <input

                type="date"

                value={dateFrom}

                onChange={(e) => onDateFrom(e.target.value)}

                className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"

            />

            <input

                type="date"

                value={dateTo}

                onChange={(e) => onDateTo(e.target.value)}

                className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"

            />

            {(search || dateFrom || dateTo) && (

                <button

                    onClick={() => { onSearch(''); onDateFrom(''); onDateTo(''); }}

                    className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-3 py-2"

                >

                    Limpiar

                </button>

            )}

        </div>

    );

}



// ============================================================

// TAB: DISCREPANCIAS DE TRASPASOS (aprobar/rechazar + histórico)

// ============================================================

function DiscrepanciesTab({ resolverId, resolverName }: { resolverId: string; resolverName: string }) {

    const router = useRouter();

    const [view, setView] = useState<'pending' | 'history'>('pending');

    const [items, setItems] = useState<AuditAlert[]>([]);

    const [loading, setLoading] = useState(true);

    const [selected, setSelected] = useState<AuditAlert | null>(null);

    const [search, setSearch] = useState('');

    const [dateFrom, setDateFrom] = useState('');

    const [dateTo, setDateTo] = useState('');

    const [branchFilter, setBranchFilter] = useState('');

    const [productFilter, setProductFilter] = useState('');

    const [decisionFilter, setDecisionFilter] = useState<'ALL' | 'approved' | 'rejected' | 'pending'>('ALL');

    const [showExtraFilters, setShowExtraFilters] = useState(false);



    useEffect(() => {

        // Patr\u00f3n imperativo: marcamos loading al re-suscribir.

        // eslint-disable-next-line react-hooks/set-state-in-effect

        setLoading(true);

        const types: AuditAlert['type'][] = view === 'pending'

            ? ['TRANSFER_DISCREPANCY']

            : ['TRANSFER_DISCREPANCY', 'TRANSFER_DISCREPANCY_RESOLVED'];

        const status = view === 'pending' ? 'open' : 'resolved';

        const opts: { status: 'open' | 'resolved'; dateFrom?: Date; dateTo?: Date } = { status };

        if (dateFrom) opts.dateFrom = new Date(dateFrom + 'T00:00:00');

        if (dateTo) opts.dateTo = new Date(dateTo + 'T23:59:59');

        const unsub = AuditAlertService.subscribeAlertsByTypes(types, opts, data => {

            setItems(data);

            setLoading(false);

        });

        return () => unsub();

    }, [view, dateFrom, dateTo]);



    const filtered = items.filter(a => {

        if (search.trim()) {

            const s = search.trim().toLowerCase();

            const meta = a.metadata || {};

            const envioId = ((meta.envioId as string) || '').toLowerCase();

            if (!envioId.includes(s) && !a.message.toLowerCase().includes(s) && !(a.branchId || '').toLowerCase().includes(s)) return false;

        }

        if (branchFilter.trim()) {

            const bf = branchFilter.trim().toLowerCase();

            const fromName = ((a.metadata?.fromBranchName as string) || '').toLowerCase();

            const toName = ((a.metadata?.toBranchName as string) || '').toLowerCase();

            const branchId = (a.branchId || '').toLowerCase();

            if (!fromName.includes(bf) && !toName.includes(bf) && !branchId.includes(bf)) return false;

        }

        if (productFilter.trim()) {

            const pf = productFilter.trim().toLowerCase();

            const names = (a.metadata?.productNames as string[]) || [];

            if (!names.some(n => n.toLowerCase().includes(pf))) return false;

        }

        if (decisionFilter !== 'ALL') {

            const decision = (a.metadata?.decision as string) || '';

            if (decisionFilter === 'pending') {

                if (decision) return false;

            } else {

                if (decision !== decisionFilter) return false;

            }

        }

        return true;

    });



    return (

        <div className="space-y-4">

            <div className="flex items-center justify-between flex-wrap gap-2">

                <div>

                    <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">

                        Discrepancias de Traspasos

                    </h2>

                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">

                        Aprueba o rechaza diferencias entre lo despachado y recibido

                    </p>

                </div>

                <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">

                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> En vivo

                </span>

            </div>



            <SegmentedToggle

                value={view}

                onChange={(v) => setView(v as 'pending' | 'history')}

                options={[

                    { value: 'pending', label: 'Pendientes' },

                    { value: 'history', label: 'Histórico' },

                ]}

            />



            <FilterBar

                search={search}

                onSearch={setSearch}

                dateFrom={dateFrom}

                dateTo={dateTo}

                onDateFrom={setDateFrom}

                onDateTo={setDateTo}

                placeholder="Buscar por envío, mensaje o sucursal…"

            />



            {/* Filtros adicionales */}

            <div>

                <button

                    onClick={() => setShowExtraFilters(v => !v)}

                    className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 hover:text-blue-500 uppercase tracking-widest transition-colors"

                >

                    <SlidersHorizontal size={11} /> Más filtros {showExtraFilters ? <ChevronUp size={11} /> : <ChevronDown size={11} />}

                </button>

                {showExtraFilters && (

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">

                        <div className="flex flex-col gap-1">

                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sucursal</label>

                            <input

                                type="text"

                                value={branchFilter}

                                onChange={e => setBranchFilter(e.target.value)}

                                placeholder="Nombre de sucursal…"

                                className="h-9 px-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[11px] font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30"

                            />

                        </div>

                        <div className="flex flex-col gap-1">

                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Producto</label>

                            <input

                                type="text"

                                value={productFilter}

                                onChange={e => setProductFilter(e.target.value)}

                                placeholder="Nombre de producto…"

                                className="h-9 px-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[11px] font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30"

                            />

                        </div>

                        <div className="flex flex-col gap-1">

                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Decisión</label>

                            <select

                                value={decisionFilter}

                                onChange={e => setDecisionFilter(e.target.value as typeof decisionFilter)}

                                className="h-9 px-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[11px] font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30"

                            >

                                <option value="ALL">Todas las decisiones</option>

                                <option value="approved">Aprobadas</option>

                                <option value="rejected">Rechazadas</option>

                                <option value="pending">Sin decisión aún</option>

                            </select>

                        </div>

                        {(branchFilter || productFilter || decisionFilter !== 'ALL') && (

                            <button

                                onClick={() => { setBranchFilter(''); setProductFilter(''); setDecisionFilter('ALL'); }}

                                className="text-[9px] font-black text-rose-500 hover:text-rose-600 uppercase tracking-widest flex items-center gap-1 sm:col-span-3"

                            >

                                <X size={10} /> Limpiar filtros adicionales

                            </button>

                        )}

                    </div>

                )}

            </div>



            {loading ? (

                <div className="text-center py-12 text-slate-400 text-[10px] font-bold uppercase tracking-widest">Cargando...</div>

            ) : filtered.length === 0 ? (

                <div className="text-center py-16 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10">

                    <CheckCircle2 size={48} strokeWidth={1.5} className="mx-auto text-emerald-500 mb-3" />

                    <p className="text-sm font-black text-slate-900 dark:text-white">

                        {view === 'pending' ? 'Sin discrepancias pendientes' : 'Sin registros en el histórico'}

                    </p>

                </div>

            ) : (

                <div className="space-y-3">

                    {filtered.map(a => {

                        const ts = ensureDate(a.createdAt as Date);

                        const meta = a.metadata || {};

                        const envioId = (meta.envioId as string) || (meta.transferId as string) || '';

                        const decision = (meta.decision as string) || '';

                        const isResolved = !!a.resolved || a.type === 'TRANSFER_DISCREPANCY_RESOLVED';

                        return (

                            <div key={a.id} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">

                                <div className="space-y-2">

                                    <div className="flex items-center gap-2 flex-wrap">

                                        <span className={clsx(

                                            'px-2 py-0.5 rounded-xl text-[9px] font-black uppercase tracking-widest',

                                            isResolved ? 'bg-slate-500/10 text-slate-600 dark:text-slate-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'

                                        )}>

                                            {a.severity}

                                        </span>

                                        {envioId && (

                                            <span className="px-2 py-0.5 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest">

                                                {envioId}

                                            </span>

                                        )}

                                        {decision && (

                                            <span className={clsx(

                                                'px-2 py-0.5 rounded-xl text-[9px] font-black uppercase tracking-widest',

                                                decision === 'approved'

                                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'

                                                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'

                                            )}>

                                                {decision === 'approved' ? 'Aprobada' : 'Rechazada'}

                                            </span>

                                        )}

                                        <span className="text-sm font-bold text-slate-900 dark:text-white">{a.message}</span>

                                    </div>

                                    <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest items-center">

                                        <span className="flex items-center gap-1"><Building2 size={11} /> {a.branchId}</span>

                                        {a.userName && <span>Por: {a.userName}</span>}

                                        {ts && <span className="flex items-center gap-1"><Clock size={11} /> {ts.toLocaleString('es-BO')}</span>}

                                        {a.resolvedByName && (

                                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">

                                                Resuelto por: {a.resolvedByName}

                                            </span>

                                        )}

                                        {envioId && (

                                            <button

                                                onClick={() => router.push(`/envios/${envioId}`)}

                                                className="text-blue-600 dark:text-blue-400 hover:underline"

                                            >

                                                Ver envío ?

                                            </button>

                                        )}

                                    </div>

                                    {a.resolutionNote && (

                                        <p className="text-xs text-slate-600 dark:text-slate-400 italic border-l-2 border-slate-300 dark:border-white/10 pl-2 mt-1">

                                            {a.resolutionNote}

                                        </p>

                                    )}

                                </div>

                                {view === 'pending' && a.type === 'TRANSFER_DISCREPANCY' && (

                                    <div className="flex md:flex-col gap-2 self-center">

                                        <button

                                            onClick={() => setSelected(a)}

                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 active:scale-95 transition-all"

                                        >

                                            <AlertOctagon size={12} strokeWidth={2.5} /> Revisar

                                        </button>

                                    </div>

                                )}

                            </div>

                        );

                    })}

                </div>

            )}



            {selected && (

                <ReviewDiscrepancyModal

                    alert={selected}

                    resolverId={resolverId}

                    resolverName={resolverName}

                    onClose={() => setSelected(null)}

                />

            )}

        </div>

    );

}



// ============================================================

// MODAL: Revisar discrepancia (aprobar/rechazar)

// ============================================================

function ReviewDiscrepancyModal({

    alert,

    resolverId,

    resolverName,

    onClose,

}: {

    alert: AuditAlert;

    resolverId: string;

    resolverName: string;

    onClose: () => void;

}) {

    const meta = alert.metadata || {};

    const envioId = (meta.envioId as string) || '';

    const [envio, setEnvio] = useState<Envio | null>(null);

    const [items, setItems] = useState<EnvioItem[]>([]);

    const [loading, setLoading] = useState(true);

    const [actions, setActions] = useState<Record<string, 'NO_AJUSTAR' | 'DESCONTAR_ORIGEN' | 'DEVOLVER_ORIGEN' | 'MERMA_ORIGEN'>>({});

    const [note, setNote] = useState('');

    const [busy, setBusy] = useState(false);

    const [originStocks, setOriginStocks] = useState<Record<string, number>>({});



    useEffect(() => {

        let cancel = false;

        (async () => {

            try {

                const e = await EnvioService.getById(envioId);

                if (cancel) return;

                setEnvio(e || null);

                if (e) {

                    const its = await EnvioService.getItems(envioId);

                    if (cancel) return;

                    setItems(its);

                    // Pre-elegir acción sugerida por ítem

                    const init: Record<string, 'NO_AJUSTAR' | 'DESCONTAR_ORIGEN' | 'DEVOLVER_ORIGEN' | 'MERMA_ORIGEN'> = {};

                    for (const it of its) {

                        const env = it.qtyEnviada || 0;

                        const rec = it.qtyRecibida ?? 0;

                        if (rec > env) init[it.productId] = 'DESCONTAR_ORIGEN';

                        else if (env > rec) init[it.productId] = 'DEVOLVER_ORIGEN';

                        else init[it.productId] = 'NO_AJUSTAR';

                    }

                    setActions(init);

                    // Cargar stock actual en origen para detectar posibles negativos

                    const stocks = await EnvioService.getOriginStocks(its, e.fromBranchId);

                    if (!cancel) setOriginStocks(stocks);

                }

            } catch (err) {

                console.error(err);

                toast.error('No se pudo cargar el envío');

            } finally {

                if (!cancel) setLoading(false);

            }

        })();

        return () => { cancel = true; };

    }, [envioId]);



    const submit = async (decision: 'approved' | 'rejected') => {

        if (note.trim().length < 5) { toast.error('Nota requerida (mínimo 5 caracteres)'); return; }

        setBusy(true);

        try {

            await EnvioService.resolveDiscrepancy({

                envioId,

                decision,

                note: note.trim(),

                perItemActions: decision === 'approved' ? actions : undefined,

                gerenteId: resolverId,

                gerenteName: resolverName,

            });

            toast.success(decision === 'approved' ? 'Discrepancia aprobada y stock ajustado' : 'Discrepancia rechazada');

            onClose();

        } catch (err) {

            toast.error(err instanceof Error ? err.message : 'Error al resolver');

        } finally {

            setBusy(false);

        }

    };



    return (

        <div className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>

            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl my-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>

                <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">

                    <div>

                        <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white">Revisar discrepancia</h3>

                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{envioId}</p>

                    </div>

                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">

                        <XCircle size={20} />

                    </button>

                </div>



                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

                    {loading ? (

                        <div className="text-center py-8 text-slate-400 text-[10px] font-bold uppercase tracking-widest">Cargando…</div>

                    ) : !envio ? (

                        <div className="text-center py-8 text-rose-500 text-xs font-bold">No se encontró el envío</div>

                    ) : (

                        <>

                            <div className="grid grid-cols-2 gap-3 text-xs">

                                <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3">

                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Origen</p>

                                    <p className="font-bold text-slate-900 dark:text-white">{envio.fromBranchName}</p>

                                </div>

                                <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3">

                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Destino</p>

                                    <p className="font-bold text-slate-900 dark:text-white">{envio.toBranchName}</p>

                                </div>

                            </div>



                            <div className="space-y-2">

                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ítems con diferencia</p>

                                <div className="space-y-2">

                                    {items.map(it => {

                                        const env = it.qtyEnviada || 0;

                                        const rec = it.qtyRecibida ?? 0;

                                        const diff = rec - env;

                                        const hasDiff = diff !== 0;

                                        const originStock = originStocks[it.productId] ?? null;

                                        const wouldGoNegative = diff > 0 && originStock !== null && (originStock - diff) < 0;

                                        return (

                                            <div key={it.id} className={clsx(

                                                'rounded-xl p-3 border',

                                                hasDiff ? 'border-rose-200 dark:border-rose-500/20 bg-rose-50/30 dark:bg-rose-500/5' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5'

                                            )}>

                                                <div className="flex items-center justify-between gap-3 flex-wrap">

                                                    <div>

                                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{it.productName}</p>

                                                        <p className="text-[10px] text-slate-500 font-mono">{it.productCode || it.productId}</p>

                                                    </div>

                                                    <div className="flex items-center gap-3 text-[11px] font-bold">

                                                        <span className="text-slate-500">Env: <span className="text-slate-900 dark:text-white">{env}</span></span>

                                                        <span className="text-slate-500">Rec: <span className="text-slate-900 dark:text-white">{rec}</span></span>

                                                        <span className={clsx('font-black', diff > 0 ? 'text-amber-600' : diff < 0 ? 'text-rose-600' : 'text-slate-400')}>

                                                            ? {diff > 0 ? '+' : ''}{diff}

                                                        </span>

                                                        {originStock !== null && (

                                                            <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-xl', originStock <= 0 ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400' : 'bg-slate-100 dark:bg-white/10 text-slate-500')}>

                                                                Stock origen: {originStock}

                                                            </span>

                                                        )}

                                                    </div>

                                                </div>

                                                {hasDiff && (

                                                    <div className="mt-2">

                                                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">Acción al aprobar</label>

                                                        <select

                                                            value={actions[it.productId] || 'NO_AJUSTAR'}

                                                            onChange={(e) => setActions(p => ({ ...p, [it.productId]: e.target.value as 'NO_AJUSTAR' | 'DESCONTAR_ORIGEN' | 'DEVOLVER_ORIGEN' | 'MERMA_ORIGEN' }))}

                                                            className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"

                                                        >

                                                            <option value="NO_AJUSTAR">No ajustar stock origen (quedará incorrecto)</option>

                                                            {diff > 0 && <option value="DESCONTAR_ORIGEN">Descontar {diff} adicional del origen (salieron {env + diff} en total)</option>}

                                                            {diff < 0 && <option value="DEVOLVER_ORIGEN">Devolver {Math.abs(diff)} al origen (no se enviaron)</option>}

                                                            {diff < 0 && <option value="MERMA_ORIGEN">Registrar merma de {Math.abs(diff)} en origen (se perdieron)</option>}

                                                        </select>

                                                        {(actions[it.productId] === 'NO_AJUSTAR' || !actions[it.productId]) && (

                                                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-1.5 bg-amber-50 dark:bg-amber-500/10 rounded-xl px-2 py-1">

                                                                {diff > 0

                                                                    ? `El stock de ${envio?.fromBranchName} quedará como si solo saliera ${env} unidad(es), pero en realidad salieron ${env + diff}.`

                                                                    : `El stock de ${envio?.fromBranchName} quedará como si salieran ${env} unidad(es), pero solo llegaron ${rec}.`}

                                                            </p>

                                                        )}

                                                        {actions[it.productId] === 'DESCONTAR_ORIGEN' && wouldGoNegative && (

                                                            <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-1.5 bg-rose-50 dark:bg-rose-500/10 rounded-xl px-2 py-1">

                                                                Stock insuficiente en {envio?.fromBranchName}: tiene {originStock}, descontar {diff} adicional dejaría el stock en {(originStock ?? 0) - diff}. El sistema lo permitirá pero quedará en negativo — investiga si el conteo en destino es correcto.

                                                            </p>

                                                        )}

                                                        {it.discrepancyReason && (

                                                            <p className="text-[10px] text-slate-500 mt-1">

                                                                Motivo registrado: <span className="font-bold">{it.discrepancyReason}</span>

                                                                {it.discrepancyNote && ` — ${it.discrepancyNote}`}

                                                            </p>

                                                        )}

                                                    </div>

                                                )}

                                            </div>

                                        );

                                    })}

                                </div>

                            </div>



                            <div>

                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">

                                    Nota de resolución (mínimo 5 caracteres)

                                </label>

                                <textarea

                                    value={note}

                                    onChange={(e) => setNote(e.target.value)}

                                    rows={3}

                                    className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"

                                    placeholder="Detalle la decisión tomada y la razón…"

                                />

                            </div>

                        </>

                    )}

                </div>



                <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">

                    <button

                        onClick={onClose}

                        disabled={busy}

                        className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-50"

                    >

                        Cancelar

                    </button>

                    <div className="flex gap-2">

                        <button

                            onClick={() => submit('rejected')}

                            disabled={busy || loading || !envio}

                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-50"

                        >

                            <XCircle size={12} strokeWidth={2.5} /> Rechazar

                        </button>

                        <button

                            onClick={() => submit('approved')}

                            disabled={busy || loading || !envio}

                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50"

                        >

                            <CheckCircle2 size={12} strokeWidth={2.5} /> Aprobar y ajustar stock

                        </button>

                    </div>

                </div>

            </div>

        </div>

    );

}

