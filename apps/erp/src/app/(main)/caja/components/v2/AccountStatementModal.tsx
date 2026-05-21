/**
 * AccountStatementModal — historial de movimientos de una cuenta.
 * GERENTE puede ver todos los asientos (debit/credit) de una cuenta,
 * con filtros de período y categoría. Permite auditar entradas QR/TRANSFERENCIA
 * generadas por compras, ventas, abonos, gastos, etc.
 */
'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Wallet, Building2, Smartphone, ArrowDownCircle, ArrowUpCircle, Filter, Calendar, Download } from 'lucide-react';
import IndustrialModal from '@/components/common/IndustrialModal';
import { JournalService } from '@/services/JournalService';
import type { Account, JournalEntry, JournalCategory } from '@/types/treasury';
import { downloadCSV } from '@/utils/csvExport';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    account: Account | null;
}

type Period = 'today' | 'week' | 'month' | 'custom';

const TYPE_ICON: Record<Account['type'], React.ReactNode> = {
    CASH_DRAWER: <Wallet size={16} />,
    BANK: <Building2 size={16} />,
    WALLET: <Smartphone size={16} />,
};

const CATEGORY_LABELS: Record<JournalCategory, string> = {
    VENTA: 'Venta',
    COBRO_CUOTA: 'Cobro cuota',
    ABONO_CLIENTE: 'Abono cliente',
    INYECCION_CAPITAL: 'Inyección capital',
    TRASLADO_INGRESO: 'Traslado (ingreso)',
    AJUSTE_POSITIVO: 'Ajuste positivo',
    DEVOLUCION_COMPRA: 'Devolución compra',
    COMPRA_STOCK: 'Compra stock',
    GASTO_OPERATIVO: 'Gasto operativo',
    PAGO_PROVEEDOR: 'Pago proveedor',
    PAGO_PLANILLA: 'Pago planilla',
    RETIRO_UTILIDADES: 'Retiro utilidades',
    DEPOSITO_BANCO: 'Depósito banco',
    TRASLADO_EGRESO: 'Traslado (egreso)',
    AJUSTE_NEGATIVO: 'Ajuste negativo',
    DEVOLUCION_VENTA: 'Devolución venta',
};

function fmtBob(n: number) {
    return `Bs. ${n.toFixed(2)}`;
}

function fmtDate(d: unknown): string {
    if (!d) return '—';
    const date = d instanceof Date ? d : new Date(d as string);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function rangeFor(period: Period, customFrom: string, customTo: string): { from: Date; to: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'today') return { from: today, to: now };
    if (period === 'week') {
        const from = new Date(today);
        from.setDate(from.getDate() - 7);
        return { from, to: now };
    }
    if (period === 'month') {
        const from = new Date(today);
        from.setDate(from.getDate() - 30);
        return { from, to: now };
    }
    // custom
    const from = customFrom ? new Date(customFrom + 'T00:00:00') : today;
    const to = customTo ? new Date(customTo + 'T23:59:59') : now;
    return { from, to };
}

export default function AccountStatementModal({ isOpen, onClose, account }: Props) {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [period, setPeriod] = useState<Period>('month');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [directionFilter, setDirectionFilter] = useState<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');
    const [categoryFilter, setCategoryFilter] = useState<'ALL' | JournalCategory>('ALL');
    const { role } = useAuth();
    const { currentBranch } = useBranch();

    const load = useCallback(async () => {
        if (!account?.id) return;
        setLoading(true);
        try {
            const { from, to } = rangeFor(period, customFrom, customTo);
            const list = await JournalService.list({ 
                accountId: account.id, 
                from, 
                to, 
                limit: 500,
                ...(role !== 'GERENTE' && currentBranch?.id ? { branchId: currentBranch.id } : {})
            });
            setEntries(list);
        } catch (e) {
            toast.error('Error: ' + (e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [account?.id, period, customFrom, customTo, currentBranch?.id, role]);

    useEffect(() => {
        if (isOpen) load();
    }, [isOpen, load]);

    const filtered = useMemo(() => {
        return entries.filter(e => {
            if (directionFilter !== 'ALL' && e.direction !== directionFilter) return false;
            if (categoryFilter !== 'ALL' && e.category !== categoryFilter) return false;
            return true;
        });
    }, [entries, directionFilter, categoryFilter]);

    const totals = useMemo(() => {
        let inflow = 0;
        let outflow = 0;
        filtered.forEach(e => {
            if (e.direction === 'DEBIT') inflow += e.amount;
            else outflow += e.amount;
        });
        return { inflow, outflow, net: inflow - outflow, count: filtered.length };
    }, [filtered]);

    const handleExport = () => {
        if (!account) return;
        const headers = ['Fecha', 'Categoría', 'Descripción', 'Método', 'Referencia', 'Tipo', 'Monto', 'Usuario', 'Conciliación'];
        const rows = filtered.map(e => [
            fmtDate(e.date),
            CATEGORY_LABELS[e.category] || e.category,
            e.description,
            e.paymentMethod,
            e.bankRef || '',
            e.direction === 'DEBIT' ? 'INGRESO' : 'EGRESO',
            e.amount.toFixed(2),
            e.userName || e.userId,
            e.reconciliationStatus,
        ]);
        downloadCSV(`estado_cuenta_${account.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}`, headers, rows);
    };

    if (!account) return null;

    return (
        <IndustrialModal
            isOpen={isOpen}
            onClose={onClose}
            title={`Estado de cuenta · ${account.name}`}
            subtitle={`${account.type === 'CASH_DRAWER' ? 'Cajón' : account.type === 'BANK' ? 'Banco' : 'Wallet'}${account.bankName ? ' · ' + account.bankName : ''}${account.accountNumber ? ' · ' + account.accountNumber : ''}`}
            icon={TYPE_ICON[account.type]}
            theme="cobalt"
            maxWidth="max-w-5xl"
        >
            <div className="space-y-4">
                {/* Saldo header */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50 dark:bg-white/5">
                    <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Saldo actual</div>
                        <div className={clsx('font-black text-2xl tabular-nums tracking-tighter',
                            (account.currentBalance || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                            (account.currentBalance || 0) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                        )}>
                            {fmtBob(account.currentBalance || 0)}
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-right">
                        <div>
                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Ingresos</div>
                            <div className="text-sm font-black tabular-nums text-emerald-600 dark:text-emerald-400">+{fmtBob(totals.inflow)}</div>
                        </div>
                        <div>
                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Egresos</div>
                            <div className="text-sm font-black tabular-nums text-rose-600 dark:text-rose-400">−{fmtBob(totals.outflow)}</div>
                        </div>
                        <div>
                            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Neto</div>
                            <div className={clsx('text-sm font-black tabular-nums',
                                totals.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            )}>
                                {totals.net >= 0 ? '+' : ''}{fmtBob(totals.net)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filtros */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                        {(['today', 'week', 'month', 'custom'] as Period[]).map(p => (
                            <button key={p} onClick={() => setPeriod(p)}
                                className={clsx(
                                    'px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] transition',
                                    period === p
                                        ? 'bg-blue-500/10 dark:bg-yellow-500/10 text-blue-600 dark:text-yellow-500'
                                        : 'bg-white dark:bg-white/5 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                )}>
                                {p === 'today' ? 'Hoy' : p === 'week' ? '7 días' : p === 'month' ? '30 días' : 'Personalizado'}
                            </button>
                        ))}
                    </div>

                    {period === 'custom' && (
                        <>
                            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 bg-white dark:bg-white/5">
                                <Calendar size={12} className="text-slate-400" />
                                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                                    className="text-[10px] font-bold bg-transparent outline-none" />
                            </div>
                            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 bg-white dark:bg-white/5">
                                <Calendar size={12} className="text-slate-400" />
                                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                                    className="text-[10px] font-bold bg-transparent outline-none" />
                            </div>
                            <button onClick={load}
                                className="px-3 py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-[9px] font-black uppercase tracking-[0.2em] active:scale-95 transition">
                                Aplicar
                            </button>
                        </>
                    )}

                    <select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value as 'ALL' | 'DEBIT' | 'CREDIT')}
                        className="rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 bg-white dark:bg-white/5 text-[10px] font-bold uppercase tracking-wider outline-none">
                        <option value="ALL">Todos</option>
                        <option value="DEBIT">Solo ingresos</option>
                        <option value="CREDIT">Solo egresos</option>
                    </select>

                    <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | JournalCategory)}
                        className="rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 bg-white dark:bg-white/5 text-[10px] font-bold uppercase tracking-wider outline-none">
                        <option value="ALL">Todas las categorías</option>
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>

                    <span className="ml-auto text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        <Filter size={10} className="inline mr-1" /> {totals.count} movimientos
                    </span>

                    <button onClick={handleExport} disabled={filtered.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-50 dark:hover:bg-white/5 transition disabled:opacity-40">
                        <Download size={12} /> CSV
                    </button>
                </div>

                {/* Tabla */}
                <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
                    {loading ? (
                        <div className="py-16 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 italic">Cargando…</div>
                    ) : filtered.length === 0 ? (
                        <div className="py-16 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 italic">Sin movimientos en el período</div>
                    ) : (
                        <div className="max-h-[50vh] overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-slate-50 dark:bg-[#020617] border-b border-slate-200 dark:border-white/10">
                                    <tr className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                                        <th className="text-left px-3 py-2.5">Fecha</th>
                                        <th className="text-left px-3 py-2.5">Categoría</th>
                                        <th className="text-left px-3 py-2.5">Descripción</th>
                                        <th className="text-left px-3 py-2.5">Método</th>
                                        <th className="text-left px-3 py-2.5">Ref.</th>
                                        <th className="text-right px-3 py-2.5">Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(e => (
                                        <tr key={e.id} className="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition">
                                            <td className="px-3 py-2.5 text-[10px] tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(e.date)}</td>
                                            <td className="px-3 py-2.5">
                                                <span className="inline-block text-[9px] font-black uppercase tracking-[0.15em] px-2 py-1 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                                    {CATEGORY_LABELS[e.category] || e.category}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 max-w-xs truncate" title={e.description}>{e.description}</td>
                                            <td className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{e.paymentMethod}</td>
                                            <td className="px-3 py-2.5 text-[10px] text-slate-500 font-mono truncate max-w-[120px]" title={e.bankRef || ''}>{e.bankRef || '—'}</td>
                                            <td className={clsx('px-3 py-2.5 text-right font-black tabular-nums whitespace-nowrap',
                                                e.direction === 'DEBIT' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                            )}>
                                                <span className="inline-flex items-center gap-1 justify-end">
                                                    {e.direction === 'DEBIT' ? <ArrowDownCircle size={12} /> : <ArrowUpCircle size={12} />}
                                                    {e.direction === 'DEBIT' ? '+' : '−'}{fmtBob(e.amount)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </IndustrialModal>
    );
}
