/**
 * BankReconciliationView — Tab "Conciliación" (GERENTE).
 * - Selector de cuenta BANK/WALLET.
 * - Lista de batches existentes (status, periodo, matched/total).
 * - Botón "Importar extracto" → ImportStatementModal.
 * - Drilldown: ver líneas del batch, conciliar manualmente las no matcheadas.
 */
'use client';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ScrollText, FileUp, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, Clock, Link2, TriangleAlert } from 'lucide-react';
import { AccountService } from '@/services/AccountService';
import { BankReconciliationService } from '@/services/BankReconciliationService';
import { TreasuryConfigService } from '@/services/TreasuryConfigService';
import type { Account, BankReconciliationBatch, BankStatementLine } from '@/types/treasury';
import ImportStatementModal from './ImportStatementModal';
import ManualMatchModal from './ManualMatchModal';
import { toast } from 'sonner';
import { formatUserName } from '@/utils/formatUserName';
import clsx from 'clsx';

const fmtBob = (n: number) => new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(n);

const STATUS_META: Record<BankReconciliationBatch['status'], { label: string; color: string; icon: React.ReactNode }> = {
    DRAFT: { label: 'Borrador', color: 'amber', icon: <Clock size={11} /> },
    PARTIAL: { label: 'Parcial', color: 'cyan', icon: <AlertCircle size={11} /> },
    COMPLETE: { label: 'Completo', color: 'emerald', icon: <CheckCircle2 size={11} /> },
};

const ensureDate = (d: unknown): Date | null => {
    if (!d) return null;
    if (d instanceof Date) return d;
    const maybe = d as { toDate?: () => Date };
    if (typeof maybe.toDate === 'function') return maybe.toDate();
    if (typeof d === 'string' || typeof d === 'number') return new Date(d);
    return null;
};

export default function BankReconciliationView() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [batches, setBatches] = useState<BankReconciliationBatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [showImport, setShowImport] = useState(false);
    const [openBatch, setOpenBatch] = useState<BankReconciliationBatch | null>(null);
    const [manualMatch, setManualMatch] = useState<{ batchId: string; lineIndex: number; line: BankStatementLine } | null>(null);
    const [staleDays, setStaleDays] = useState<number | null>(null);
    const [staleLimit, setStaleLimit] = useState(7);

    // Cargar cuentas BANK/WALLET
    useEffect(() => {
        AccountService.list({ includeInactive: false })
            .then(list => {
                const filtered = list.filter(a => a.type === 'BANK' || a.type === 'WALLET');
                setAccounts(filtered);
                if (filtered.length > 0 && !selectedAccountId) setSelectedAccountId(filtered[0].id!);
            })
            .catch(e => toast.error('Error: ' + (e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadBatches = useCallback(async () => {
        if (!selectedAccountId) { setBatches([]); setLoading(false); return; }
        setLoading(true);
        try {
            const list = await BankReconciliationService.listBatches(selectedAccountId);
            setBatches(list);
        } catch (e) {
            toast.error('Error: ' + (e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [selectedAccountId]);

    useEffect(() => { loadBatches(); }, [loadBatches]);

    // Alerta de días sin conciliar
    useEffect(() => {
        TreasuryConfigService.get().then(cfg => setStaleLimit(cfg.autoReconcileWithinDays || 7)).catch(() => {});
    }, []);

    useEffect(() => {
        if (batches.length === 0) { setStaleDays(null); return; }
        const last = batches.reduce((a, b) => {
            const da = ensureDate(a.createdAt)?.getTime() ?? 0;
            const db2 = ensureDate(b.createdAt)?.getTime() ?? 0;
            return db2 > da ? b : a;
        });
        const lastDate = ensureDate(last.createdAt);
        if (!lastDate) { setStaleDays(null); return; }
        const days = Math.floor((Date.now() - lastDate.getTime()) / 86_400_000);
        setStaleDays(days);
    }, [batches]);

    const selectedAccount = useMemo(() => accounts.find(a => a.id === selectedAccountId) || null, [accounts, selectedAccountId]);

    if (openBatch) {
        return (
            <BatchDetail
                batch={openBatch}
                onBack={() => { setOpenBatch(null); loadBatches(); }}
                onManualMatch={(lineIndex, line) => setManualMatch({ batchId: openBatch.id!, lineIndex, line })}
                manualMatch={manualMatch}
                onCloseManualMatch={() => setManualMatch(null)}
                onMatched={async () => {
                    setManualMatch(null);
                    // Recargar batch
                    const all = await BankReconciliationService.listBatches(openBatch.accountId);
                    const fresh = all.find(b => b.id === openBatch.id);
                    if (fresh) setOpenBatch(fresh);
                }}
            />
        );
    }

    return (
        <div className="space-y-4">
            {staleDays !== null && staleDays >= staleLimit && (
                <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-2xl">
                    <TriangleAlert size={18} className="text-amber-500 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[11px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest">
                            Conciliación pendiente — {staleDays} días sin verificar
                        </p>
                        <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
                            La última conciliación registrada tiene {staleDays} días. Se recomienda conciliar cada {staleLimit} días para detectar diferencias a tiempo.
                        </p>
                    </div>
                </div>
            )}
            <div className="flex items-end justify-between gap-3 flex-wrap">
                <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Cuenta</label>
                    <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}
                        className="block px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm font-bold min-w-64 outline-none focus:border-yellow-500 transition">
                        {accounts.length === 0 && <option value="">Sin cuentas BANK/WALLET</option>}
                        {accounts.map(a => (
                            <option key={a.id} value={a.id}>
                                {a.name} ({a.type === 'BANK' ? 'Banco' : 'Billetera'})
                            </option>
                        ))}
                    </select>
                </div>
                <button onClick={() => setShowImport(true)} disabled={!selectedAccount}
                    className={clsx(
                        'inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition active:scale-95 shadow-sm',
                        selectedAccount ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed'
                    )}>
                    <FileUp size={12} /> Importar extracto
                </button>
            </div>

            {loading ? (
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 italic py-12 text-center">Cargando…</div>
            ) : batches.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/40 p-12 text-center">
                    <ScrollText size={28} className="mx-auto text-slate-400 mb-3" />
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {selectedAccount ? 'No hay auditorías registradas. Importa un extracto para comenzar.' : 'Selecciona una cuenta para comenzar.'}
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60">
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-[#111827]">
                            <tr className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                                <th className="text-left px-4 py-3">Período</th>
                                <th className="text-left px-4 py-3">Estado</th>
                                <th className="text-right px-4 py-3">Movimientos</th>
                                <th className="text-right px-4 py-3">Encontrados</th>
                                <th className="text-left px-4 py-3">Creado</th>
                                <th className="text-left px-4 py-3">Por</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {batches.map(b => {
                                const meta = STATUS_META[b.status];
                                const from = ensureDate(b.statementPeriodFrom);
                                const to = ensureDate(b.statementPeriodTo);
                                const created = ensureDate(b.createdAt);
                                const pct = b.totalLines > 0 ? Math.round((b.matchedCount / b.totalLines) * 100) : 0;
                                return (
                                    <tr key={b.id} className="border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition">
                                        <td className="px-4 py-3 tabular-nums text-[10px] font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                            {from?.toLocaleDateString('es-BO')} → {to?.toLocaleDateString('es-BO')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={clsx('inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-[0.15em]',
                                                `bg-${meta.color}-500/10 text-${meta.color}-700 dark:text-${meta.color}-400`
                                            )}>
                                                {meta.icon} {meta.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-black tabular-nums text-slate-900 dark:text-white">{b.totalLines}</td>
                                        <td className="px-4 py-3 text-right font-black tabular-nums text-slate-900 dark:text-white">
                                            {b.matchedCount}/{b.totalLines} <span className="text-slate-400 text-[10px]">({pct}%)</span>
                                        </td>
                                        <td className="px-4 py-3 tabular-nums text-[10px] font-bold text-slate-500 whitespace-nowrap">
                                            {created?.toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400">{formatUserName(b.createdByName || b.createdBy)}</td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => setOpenBatch(b)}
                                                className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase tracking-[0.15em] text-blue-600 dark:text-yellow-500 hover:underline">
                                                Auditar <ChevronRight size={11} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {selectedAccount && (
                <ImportStatementModal
                    isOpen={showImport}
                    onClose={() => setShowImport(false)}
                    account={selectedAccount}
                    onImported={loadBatches}
                />
            )}
        </div>
    );
}

// ============================================================================
// Drilldown
// ============================================================================
function BatchDetail({
    batch, onBack, onManualMatch, manualMatch, onCloseManualMatch, onMatched,
}: {
    batch: BankReconciliationBatch;
    onBack: () => void;
    onManualMatch: (lineIndex: number, line: BankStatementLine) => void;
    manualMatch: { batchId: string; lineIndex: number; line: BankStatementLine } | null;
    onCloseManualMatch: () => void;
    onMatched: () => void;
}) {
    const meta = STATUS_META[batch.status];
    const from = ensureDate(batch.statementPeriodFrom);
    const to = ensureDate(batch.statementPeriodTo);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <button onClick={onBack}
                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 hover:text-slate-900 dark:hover:text-white transition">
                    <ChevronLeft size={14} /> Volver
                </button>
                <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">{batch.accountName}</span>
                    <span className={clsx('inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-[0.15em]',
                        `bg-${meta.color}-500/10 text-${meta.color}-700 dark:text-${meta.color}-400`
                    )}>
                        {meta.icon} {meta.label}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60 p-4">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 font-black">Período</p>
                    <p className="tabular-nums font-bold text-xs text-slate-700 dark:text-slate-300 mt-1">{from?.toLocaleDateString('es-BO')} → {to?.toLocaleDateString('es-BO')}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60 p-4">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 font-black">Movimientos</p>
                    <p className="font-black text-2xl tabular-nums tracking-tighter text-slate-900 dark:text-white mt-1">{batch.totalLines}</p>
                </div>
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400 font-black">Encontrados</p>
                    <p className="font-black text-2xl tabular-nums tracking-tighter text-emerald-700 dark:text-emerald-400 mt-1">{batch.matchedCount}</p>
                </div>
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400 font-black">No registrados</p>
                    <p className="font-black text-2xl tabular-nums tracking-tighter text-amber-700 dark:text-amber-400 mt-1">{batch.unmatchedCount}</p>
                </div>
            </div>

            {batch.notes && (
                <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#111827]/40 p-3 text-[11px] italic text-slate-500 dark:text-slate-400">
                    {batch.notes}
                </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/60">
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-[#111827]">
                        <tr className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                            <th className="text-left px-4 py-3">Fecha</th>
                            <th className="text-left px-4 py-3">Dir</th>
                            <th className="text-right px-4 py-3">Monto</th>
                            <th className="text-left px-4 py-3">Descripción</th>
                            <th className="text-left px-4 py-3">Ref</th>
                            <th className="text-left px-4 py-3">Estado</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {batch.statementLines.map((line, i) => {
                            const lineDate = line.date instanceof Date ? line.date : new Date(line.date);
                            return (
                                <tr key={i} className={clsx('border-t border-slate-100 dark:border-white/5',
                                    line.matched ? 'bg-emerald-500/5' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                                )}>
                                    <td className="px-4 py-3 tabular-nums text-[10px] font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{lineDate.toLocaleDateString('es-BO')}</td>
                                    <td className="px-4 py-3">
                                        <span className={clsx('text-[10px] font-black uppercase tracking-wider',
                                            line.direction === 'DEBIT' ? 'text-emerald-600' : 'text-rose-600'
                                        )}>{line.direction}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-black tabular-nums tracking-tighter text-slate-900 dark:text-white">{fmtBob(line.amount)}</td>
                                    <td className="px-4 py-3 truncate max-w-xs text-slate-700 dark:text-slate-300">{line.description}</td>
                                    <td className="px-4 py-3 tabular-nums text-[10px] font-bold text-slate-500">{line.bankRef}</td>
                                    <td className="px-4 py-3">
                                        {line.matched ? (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-600">
                                                <CheckCircle2 size={11} /> Vinculado
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-600">
                                                <AlertCircle size={11} /> No registrado
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {!line.matched && (
                                            <button onClick={() => onManualMatch(i, line)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] font-black uppercase tracking-[0.15em] active:scale-95 transition shadow-sm">
                                                <Link2 size={10} /> Vincular
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {manualMatch && (
                <ManualMatchModal
                    isOpen={true}
                    onClose={onCloseManualMatch}
                    batchId={manualMatch.batchId}
                    lineIndex={manualMatch.lineIndex}
                    line={manualMatch.line}
                    accountId={batch.accountId}
                    onMatched={onMatched}
                />
            )}
        </div>
    );
}
