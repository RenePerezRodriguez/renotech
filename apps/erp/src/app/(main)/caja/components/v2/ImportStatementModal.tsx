/**
 * ImportStatementModal — pegar/CSV extracto bancario para crear batch + auto-match.
 * Formato esperado por línea: fecha;monto;dirección;descripción;ref
 *  - fecha: YYYY-MM-DD o DD/MM/YYYY
 *  - monto: número (positivo)
 *  - dirección: DEBIT (entrada al banco) | CREDIT (salida del banco)
 *  - descripción: texto libre
 *  - ref: referencia bancaria
 * Separadores tolerados: ; o tab.
 */
'use client';
import React, { useState, useMemo } from 'react';
import { X, FileUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { BankReconciliationService } from '@/services/BankReconciliationService';
import { useAuth } from '@/contexts/AuthContext';
import type { Account, BankStatementLine, JournalDirection } from '@/types/treasury';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/common/dialogs';
import clsx from 'clsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    account: Account;
    onImported?: (result: { batchId: string; matchedCount: number; unmatchedCount: number }) => void;
}

interface ParsedLine {
    raw: string;
    line?: Omit<BankStatementLine, 'matched' | 'matchedJournalEntryId'>;
    error?: string;
}

const parseDate = (s: string): Date | null => {
    s = s.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(s + 'T00:00:00');
        return isNaN(d.getTime()) ? null : d;
    }
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
        const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
};

const parseLines = (text: string): ParsedLine[] => {
    return text.split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'))
        .map(raw => {
            const parts = raw.split(/[;\t]/).map(p => p.trim());
            if (parts.length < 5) return { raw, error: `Esperadas 5 columnas, ${parts.length} encontradas` };
            const [dateStr, amountStr, dirStr, description, bankRef] = parts;
            const date = parseDate(dateStr);
            if (!date) return { raw, error: `Fecha inválida: ${dateStr}` };
            const amount = Number(amountStr.replace(',', '.'));
            if (!isFinite(amount) || amount <= 0) return { raw, error: `Monto inválido: ${amountStr}` };
            const dir = dirStr.toUpperCase();
            if (dir !== 'DEBIT' && dir !== 'CREDIT') return { raw, error: `Dirección inválida: ${dirStr} (DEBIT|CREDIT)` };
            if (!bankRef) return { raw, error: 'Falta referencia bancaria' };
            return {
                raw,
                line: { date, amount, direction: dir as JournalDirection, description, bankRef },
            };
        });
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ImportStatementModal({ isOpen, onClose, account, onImported }: Props) {
    const { user, userName } = useAuth();
    const [text, setText] = useState('');
    const [periodFrom, setPeriodFrom] = useState(todayISO());
    const [periodTo, setPeriodTo] = useState(todayISO());
    const [notes, setNotes] = useState('');
    const [importing, setImporting] = useState(false);

    const parsed = useMemo(() => parseLines(text), [text]);
    const validCount = parsed.filter(p => p.line).length;
    const errorCount = parsed.filter(p => p.error).length;

    if (!isOpen) return null;

    const handleImport = async () => {
        if (!user) return;
        if (validCount === 0) { toast.error('No hay movimientos válidos'); return; }
        if (errorCount > 0) {
            const ok = await confirmDialog({
                title: 'Líneas con error',
                message: `Hay ${errorCount} movimientos con error que se omitirán. ¿Continuar?`,
                variant: 'warning',
                confirmText: 'Continuar',
            });
            if (!ok) return;
        }

        setImporting(true);
        try {
            const result = await BankReconciliationService.importStatement({
                accountId: account.id!,
                accountName: account.name,
                statementPeriodFrom: new Date(periodFrom + 'T00:00:00'),
                statementPeriodTo: new Date(periodTo + 'T23:59:59'),
                lines: parsed.filter(p => p.line).map(p => p.line!),
                gerente: { uid: user.uid, name: userName || user.email || 'Gerente' },
                notes,
            });
            toast.success(`Importado: ${result.matchedCount}/${result.matchedCount + result.unmatchedCount} vinculados`);
            onImported?.(result);
            onClose();
            setText('');
            setNotes('');
        } catch (e) {
            toast.error('Error: ' + (e as Error).message);
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/60 dark:bg-black/80 p-4">
            <div className="bg-white dark:bg-[#020617] w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/10 bg-slate-900 dark:bg-[#111827]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-yellow-500 flex items-center justify-center text-black">
                            <FileUp size={18} />
                        </div>
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Importar extracto bancario</h3>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-white/50 mt-0.5">{account.name} · {account.type}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/70 transition"><X size={16} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Período desde</label>
                            <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm font-bold outline-none focus:border-yellow-500 transition" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Período hasta</label>
                            <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm font-bold outline-none focus:border-yellow-500 transition" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                            Movimientos del extracto
                        </label>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Un movimiento por línea: <code className="bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded font-mono normal-case">fecha;monto;DEBIT|CREDIT;descripción;ref</code>
                            <br /><span className="normal-case font-normal">DEBIT = entrada al banco · CREDIT = salida del banco</span>
                        </p>
                        <textarea value={text} onChange={e => setText(e.target.value)}
                            placeholder={'2026-04-15;1500.00;DEBIT;Depósito sucursal A;OP-12345\n2026-04-16;320.50;CREDIT;Pago proveedor X;TRF-98765'}
                            className="w-full h-48 px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs font-mono outline-none focus:border-yellow-500 transition"
                        />
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] font-black uppercase tracking-wider">
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                                <CheckCircle2 size={11} /> {validCount} válidos
                            </span>
                            {errorCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-amber-600">
                                    <AlertTriangle size={11} /> {errorCount} con error
                                </span>
                            )}
                        </div>
                        {errorCount > 0 && (
                            <details className="mt-2">
                                <summary className="text-[10px] font-black uppercase tracking-wider cursor-pointer text-amber-600">Ver errores</summary>
                                <ul className="mt-2 space-y-0.5 text-[10px] font-mono max-h-24 overflow-y-auto bg-amber-500/5 p-3 rounded-xl border border-amber-500/20">
                                    {parsed.filter(p => p.error).map((p, i) => (
                                        <li key={i} className="text-amber-700 dark:text-amber-400">
                                            <span className="opacity-60">{p.raw.slice(0, 60)}</span> → {p.error}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Notas (opcional)</label>
                        <input value={notes} onChange={e => setNotes(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm font-bold outline-none focus:border-yellow-500 transition" />
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20">
                    <button onClick={onClose} disabled={importing}
                        className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-95">
                        Cancelar
                    </button>
                    <button onClick={handleImport} disabled={importing || validCount === 0}
                        className={clsx(
                            'inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition active:scale-95 shadow-sm',
                            importing || validCount === 0 ? 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed' : 'bg-yellow-500 hover:bg-yellow-400 text-black'
                        )}>
                        <FileUp size={12} />
                        {importing ? 'Importando…' : `Importar ${validCount} movimientos`}
                    </button>
                </div>
            </div>
        </div>
    );
}
