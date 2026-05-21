/**
 * DenominationsInput — input grid para denominaciones BOB.
 * Usado en apertura/cierre de sesión.
 */
'use client';
import React from 'react';
import { BOB_DENOMINATIONS, calculateDenominationsTotal, type CashDenominations } from '@/types/treasury';
import { Banknote, Coins } from 'lucide-react';
import clsx from 'clsx';

interface Props {
    value: CashDenominations;
    onChange: (next: CashDenominations) => void;
    disabled?: boolean;
    label?: string;
}

export default function DenominationsInput({ value, onChange, disabled, label }: Props) {
    const total = calculateDenominationsTotal(value);

    const setQty = (denom: number, qty: number) => {
        const next: CashDenominations = { ...value };
        if (qty <= 0) delete next[String(denom)];
        else next[String(denom)] = qty;
        onChange(next);
    };

    const billes = BOB_DENOMINATIONS.filter(d => d >= 10);
    const monedas = BOB_DENOMINATIONS.filter(d => d < 10);

    return (
        <div className="space-y-4">
            {label && (
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{label}</p>
            )}

            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Banknote size={14} className="text-slate-400" />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Billetes</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {billes.map(d => (
                        <DenomCell key={d} denom={d} qty={value[String(d)] || 0} onChange={(q) => setQty(d, q)} disabled={disabled} />
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <Coins size={14} className="text-slate-400" />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Monedas</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {monedas.map(d => (
                        <DenomCell key={d} denom={d} qty={value[String(d)] || 0} onChange={(q) => setQty(d, q)} disabled={disabled} />
                    ))}
                </div>
            </div>

            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">Total efectivo</span>
                <span className="text-2xl font-black tracking-tighter text-amber-700 dark:text-amber-400 tabular-nums">
                    Bs. {total.toFixed(2)}
                </span>
            </div>
        </div>
    );
}

function DenomCell({ denom, qty, onChange, disabled }: { denom: number; qty: number; onChange: (q: number) => void; disabled?: boolean }) {
    const subtotal = denom * qty;
    return (
        <div className={clsx(
            'rounded-xl border px-3 py-2.5 transition-colors',
            qty > 0 ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5'
        )}>
            <div className="text-[10px] font-black tabular-nums text-slate-700 dark:text-slate-300 uppercase tracking-wider">Bs. {denom}</div>
            <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={qty || ''}
                onChange={(e) => {
                    const v = parseInt(e.target.value);
                    onChange(isNaN(v) || v < 0 ? 0 : v);
                }}
                disabled={disabled}
                placeholder="0"
                className="w-full bg-transparent text-lg font-black tracking-tighter text-slate-900 dark:text-white outline-none focus:bg-amber-500/10 px-1 py-0.5 rounded-xl tabular-nums"
            />
            {qty > 0 && (
                <div className="text-[9px] font-bold tabular-nums text-amber-600 dark:text-amber-400 uppercase tracking-wider">= {subtotal.toFixed(2)}</div>
            )}
        </div>
    );
}
