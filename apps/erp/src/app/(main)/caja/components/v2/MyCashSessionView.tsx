/**
 * MyCashSessionView — vista principal del cajero (su sesión actual).
 * - Si no hay sesión OPEN: pantalla de "Abrir sesión".
 * - Si hay sesión: KPIs de la sesión + tabla de movimientos + acciones (registrar mov, cerrar).
 */
'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Lock, LogOut, Plus, Wallet, Banknote, QrCode, Building2, Clock, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { CashierSessionService } from '@/services/CashierSessionService';
import { JournalService } from '@/services/JournalService';
import type { CashierSession, JournalEntry } from '@/types/treasury';
import { ensureDate } from '@/utils/dateHelpers';
import OpenSessionModal from './OpenSessionModal';
import CloseSessionModal from './CloseSessionModal';
import ExpenseFormModal from '@/components/common/ExpenseFormModal';
import SessionEntriesTable from './SessionEntriesTable';
import { toast } from 'sonner';
import { promptDialog } from '@/components/common/dialogs';
import clsx from 'clsx';

interface Props {
    cashierId: string;
    cashierName: string;
    cashierRole?: string;
    branchId: string | null;
    isGerente: boolean;
}

export default function MyCashSessionView({ cashierId, cashierName, cashierRole, branchId, isGerente }: Props) {
    const [session, setSession] = useState<CashierSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const [openModal, setOpenModal] = useState(false);
    const [closeModal, setCloseModal] = useState(false);
    const [expenseModal, setExpenseModal] = useState(false);

    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const [stats, setStats] = useState<{ EFECTIVO: { ingresos: number; egresos: number; neto: number }; QR: { ingresos: number; egresos: number; neto: number }; TRANSFERENCIA: { ingresos: number; egresos: number; neto: number } } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const userSession = await CashierSessionService.getCurrentSession(cashierId);
            // Si la sesi\u00f3n activa pertenece a otra sucursal, no mostrarla aqu\u00ed
            let s = userSession && branchId && userSession.branchId === branchId ? userSession : null;
            if (!s && branchId) {
                s = await CashierSessionService.getCurrentBranchSession(branchId);
            }
            setSession(s);
            if (s) {
                // Efectivo: por sessionId (asiento de cajon) + branchId para alinear con rules
                const cashSummary = await JournalService.summarize({ sessionId: s.id!, branchId: s.branchId });
                // Digital (QR/TRANSF): por sucursal + ventana del turno (no llevan sessionId)
                const openedAt = ensureDate(s.openedAt);
                const digitalSummary = await JournalService.summarize({ branchId: s.branchId, from: openedAt });
                setStats({
                    EFECTIVO: cashSummary.byMethod.EFECTIVO,
                    QR: digitalSummary.byMethod.QR,
                    TRANSFERENCIA: digitalSummary.byMethod.TRANSFERENCIA,
                });
            } else {
                setStats(null);
            }
        } catch (e) {
            toast.error('Error cargando sesión: ' + (e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [cashierId, branchId]);

    useEffect(() => { load(); }, [load, refreshKey]);

    // Auto-abrir modal si vienen con ?abrir=1 (clic desde widget header)
    useEffect(() => {
        if (loading) return;
        if (searchParams?.get('abrir') === '1' && !session && !openModal) {
            setOpenModal(true);
            // Limpiar el query param para que no reabra al refrescar
            router.replace(pathname || '/caja');
        }
    }, [loading, session, searchParams, openModal, router, pathname]);

    if (loading) {
        return <div className="text-xs font-bold uppercase tracking-wider text-slate-400 italic py-12 text-center">Cargando sesión…</div>;
    }

    if (!session) {
        return (
            <>
                <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/40 p-12 text-center space-y-5">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                        <Lock className="text-yellow-600 dark:text-yellow-500" size={28} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white">Sin sesión activa</h3>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-2">
                            Abre tu sesión de caja para comenzar a registrar operaciones.
                        </p>
                    </div>
                    <button onClick={() => setOpenModal(true)}
                        data-tour="caja-open"
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase tracking-[0.2em] transition active:scale-95 shadow-sm">
                        <Lock size={14} /> Abrir sesión
                    </button>
                </div>
                <OpenSessionModal isOpen={openModal} onClose={() => setOpenModal(false)}
                    onOpened={() => setRefreshKey(k => k + 1)}
                    cashierId={cashierId} cashierName={cashierName} cashierRole={cashierRole} branchId={branchId} />
            </>
        );
    }

    const openedAt = session.openedAt as Date;
    const hoursOpen = openedAt ? (Date.now() - openedAt.getTime()) / 3_600_000 : 0;

    return (
        <>
            <div className="space-y-4">
                {/* Header sesión */}
                <div data-tour="caja-session-info" className="rounded-2xl border border-yellow-500/30 bg-linear-to-br from-yellow-500/5 to-transparent p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1.5">
                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-yellow-600 dark:text-yellow-500">Sesión activa</div>
                        <div className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                            <Wallet size={14} className="text-yellow-600 dark:text-yellow-500" />
                            Cajón #{session.cashDrawerId.slice(0, 8)}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-3">
                            <span className="flex items-center gap-1"><Clock size={11} /> Abierta {openedAt?.toLocaleString?.('es-BO') || '—'}</span>
                            <span className="tabular-nums">· {hoursOpen.toFixed(1)} h</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => setExpenseModal(true)}
                            title="Registrar un movimiento de caja: gastos operativos (alquiler, sueldos, proveedores), ingresos (inyección de capital, ajustes) o egresos especiales de tesorería (depósito al banco, retiros)."
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition shadow-sm">
                            <Plus size={12} /> Nuevo Movimiento
                        </button>
                        <button onClick={() => setCloseModal(true)}
                            data-tour="caja-close-btn"
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition">
                            <LogOut size={12} /> Cerrar sesión
                        </button>
                    </div>
                </div>

                {/* KPIs */}
                {stats && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <KpiCard icon={<Banknote size={14} />} label="Efectivo (sesión)"
                            sub={`Apertura Bs. ${(session.openingTotal || 0).toFixed(2)} · Neto Bs. ${stats.EFECTIVO.neto.toFixed(2)}`}
                            valueExpected={(session.openingTotal || 0) + stats.EFECTIVO.neto}
                            ingresos={stats.EFECTIVO.ingresos} egresos={stats.EFECTIVO.egresos} accent="amber" />
                        <KpiCard icon={<QrCode size={14} />} label="QR" sub="Movimiento neto del turno" hint="Suma de cobros menos pagos QR durante este turno. No es el saldo de la cuenta digital."
                            valueExpected={stats.QR.neto}
                            ingresos={stats.QR.ingresos} egresos={stats.QR.egresos} accent="cyan" />
                        <KpiCard icon={<Building2 size={14} />} label="Transferencia Bancaria" sub="Movimiento neto del turno" hint="Suma de cobros menos pagos por transferencia bancaria durante este turno. No es el saldo de la cuenta bancaria."
                            valueExpected={stats.TRANSFERENCIA.neto}
                            ingresos={stats.TRANSFERENCIA.ingresos} egresos={stats.TRANSFERENCIA.egresos} accent="violet" />
                    </div>
                )}

                {/* Tabla de movimientos */}
                <div className="space-y-2">
                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        Movimientos del turno (efectivo + digitales de la sucursal)
                    </div>
                    <SessionEntriesTable sessionId={session.id!}
                        branchId={session.branchId}
                        windowFrom={ensureDate(session.openedAt)}
                        refreshKey={refreshKey}
                        canReverse={isGerente}
                        onReverse={(e) => handleReverse(e)} />
                </div>
            </div>

            <CloseSessionModal isOpen={closeModal} onClose={() => setCloseModal(false)}
                onClosed={() => setRefreshKey(k => k + 1)} session={session} cashierName={cashierName} />
            <ExpenseFormModal isOpen={expenseModal} onClose={() => setExpenseModal(false)}
                onCreated={() => setRefreshKey(k => k + 1)} />
        </>
    );

    async function handleReverse(entry: JournalEntry) {
        const reason = await promptDialog({
            title: 'Reverso de movimiento',
            label: `Razón del reverso de Bs. ${entry.amount.toFixed(2)}`,
            minLength: 5,
            multiline: true,
            variant: 'danger',
            confirmText: 'Reversar',
        });
        if (!reason || reason.trim().length < 5) {
            if (reason !== null) toast.error('Razón obligatoria (mín. 5 caracteres)');
            return;
        }
        try {
            await JournalService.reverseEntry(entry.id!, {
                reason: reason.trim(),
                userId: cashierId,
                userName: cashierName,
                sessionId: session?.id || null,
            });
            toast.success('Movimiento reversado');
            setRefreshKey(k => k + 1);
        } catch (e) {
            toast.error((e as Error).message);
        }
    }
}

function KpiCard({ icon, label, sub, valueExpected, ingresos, egresos, accent, hint }:
    { icon: React.ReactNode; label: string; sub: string; valueExpected: number; ingresos: number; egresos: number; accent: 'amber' | 'cyan' | 'violet'; hint?: string }) {
    const accentMap = {
        amber: { border: 'border-amber-500/30', icon: 'text-amber-600 dark:text-amber-400' },
        cyan: { border: 'border-blue-500/30', icon: 'text-blue-600 dark:text-blue-400' },
        violet: { border: 'border-violet-500/30', icon: 'text-violet-600 dark:text-violet-400' },
    };
    const a = accentMap[accent];
    return (
        <div className={clsx('rounded-2xl border bg-white dark:bg-[#111827]/60 p-5 transition hover:border-slate-300 dark:hover:border-white/20', a.border)} title={hint}>
            <div className={clsx('flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em]', a.icon)}>
                {icon} {label}
            </div>
            <div className="mt-3 text-2xl font-black tabular-nums tracking-tighter text-slate-900 dark:text-white">
                Bs. {valueExpected.toFixed(2)}
            </div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1">{sub}</div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 grid grid-cols-2 gap-2 text-[10px] tabular-nums">
                <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-500 inline-flex items-center gap-1">
                        <ArrowDownCircle size={10} strokeWidth={2.5} /> Ingresos
                    </span>
                    <span className="font-black text-emerald-600 dark:text-emerald-500">Bs. {ingresos.toFixed(2)}</span>
                </div>
                <div className="flex flex-col text-right">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-rose-600 dark:text-rose-500 inline-flex items-center gap-1 justify-end">
                        <ArrowUpCircle size={10} strokeWidth={2.5} /> Egresos
                    </span>
                    <span className="font-black text-rose-600 dark:text-rose-500">Bs. {egresos.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}
