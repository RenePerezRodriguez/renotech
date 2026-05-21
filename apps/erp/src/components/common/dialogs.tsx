'use client';

/**
 * Sistema de diálogos imperativo para reemplazar window.confirm / window.prompt / window.alert.
 * Uso:
 *   const ok = await confirmDialog({ title: '...', message: '...', variant: 'danger' });
 *   const reason = await promptDialog({ title: '...', label: '...', minLength: 5 });
 *   await alertDialog({ title: '...', message: '...' });
 *
 * Montar <DialogHost /> una sola vez en el layout raíz.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Info, AlertOctagon, MessageSquare } from 'lucide-react';
import IndustrialModal, { IndustrialTheme } from '@/components/common/IndustrialModal';
import clsx from 'clsx';

type Variant = 'danger' | 'warning' | 'info';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: Variant;
}

interface PromptOptions {
    title: string;
    label: string;
    placeholder?: string;
    defaultValue?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: Variant;
    minLength?: number;
    multiline?: boolean;
}

interface AlertOptions {
    title: string;
    message: string;
    confirmText?: string;
    variant?: Variant;
}

type Pending =
    | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
    | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }
    | { kind: 'alert'; opts: AlertOptions; resolve: () => void };

type Listener = (p: Pending | null) => void;

const listeners = new Set<Listener>();
let current: Pending | null = null;

function emit(p: Pending | null) {
    current = p;
    listeners.forEach((l) => l(p));
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
        emit({ kind: 'confirm', opts, resolve });
    });
}

export function promptDialog(opts: PromptOptions): Promise<string | null> {
    return new Promise((resolve) => {
        emit({ kind: 'prompt', opts, resolve });
    });
}

export function alertDialog(opts: AlertOptions): Promise<void> {
    return new Promise((resolve) => {
        emit({ kind: 'alert', opts, resolve });
    });
}

const variantConfig: Record<Variant, { theme: IndustrialTheme; icon: React.ReactNode; button: string }> = {
    danger: {
        theme: 'carbon',
        icon: <AlertOctagon size={24} />,
        button: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/20',
    },
    warning: {
        theme: 'stealth',
        icon: <AlertTriangle size={24} />,
        button: 'bg-yellow-500 hover:bg-yellow-400 text-slate-950 shadow-yellow-500/20',
    },
    info: {
        theme: 'cobalt',
        icon: <Info size={24} />,
        button: 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-500/20',
    },
};

export function DialogHost() {
    const [pending, setPending] = useState<Pending | null>(current);
    const [inputValue, setInputValue] = useState('');
    const [touched, setTouched] = useState(false);

    useEffect(() => {
        const l: Listener = (p) => {
            setPending(p);
            if (p?.kind === 'prompt') {
                setInputValue(p.opts.defaultValue ?? '');
            } else {
                setInputValue('');
            }
            setTouched(false);
        };
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    }, []);

    if (!pending) return null;

    const variant: Variant =
        pending.kind === 'confirm' ? (pending.opts.variant ?? 'danger') :
        pending.kind === 'prompt' ? (pending.opts.variant ?? 'info') :
        (pending.opts.variant ?? 'info');
    const cfg = variantConfig[variant];

    const close = (result: boolean | string | null | void) => {
        if (pending.kind === 'confirm') pending.resolve(result === true);
        else if (pending.kind === 'prompt') pending.resolve(typeof result === 'string' ? result : null);
        else pending.resolve();
        emit(null);
    };

    const minLen = pending.kind === 'prompt' ? (pending.opts.minLength ?? 0) : 0;
    const promptValid = pending.kind !== 'prompt' || inputValue.trim().length >= minLen;

    const title = pending.opts.title;
    const subtitle =
        pending.kind === 'prompt' ? 'Información requerida' :
        pending.kind === 'alert' ? 'Aviso del sistema' :
        'Confirmación de seguridad';
    const confirmText =
        pending.opts.confirmText ??
        (pending.kind === 'alert' ? 'Entendido' : 'Confirmar');
    const cancelText =
        pending.kind !== 'alert'
            ? (pending.opts as ConfirmOptions | PromptOptions).cancelText ?? 'Cancelar'
            : '';

    const headerIcon = pending.kind === 'prompt' ? <MessageSquare size={24} /> : cfg.icon;

    return (
        <IndustrialModal
            isOpen
            onClose={() => close(pending.kind === 'prompt' ? null : false)}
            title={title}
            subtitle={subtitle}
            icon={headerIcon}
            theme={cfg.theme}
            maxWidth="max-w-md"
        >
            <div className="flex flex-col items-center text-center space-y-6 pt-2">
                <div
                    className={clsx(
                        'w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl relative',
                        variant === 'danger'
                            ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                            : variant === 'warning'
                                ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
                                : 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20',
                    )}
                >
                    <div className="absolute inset-0 rounded-3xl animate-pulse opacity-20 bg-current"></div>
                    {headerIcon}
                </div>

                {pending.kind === 'prompt' ? (
                    <div className="w-full space-y-3 px-2 text-left">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {pending.opts.label}
                            {minLen > 0 && (
                                <span className="ml-2 text-slate-400 normal-case font-semibold tracking-normal">
                                    (mínimo {minLen} caracteres)
                                </span>
                            )}
                        </label>
                        {pending.opts.multiline ? (
                            <textarea
                                autoFocus
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onBlur={() => setTouched(true)}
                                placeholder={pending.opts.placeholder ?? ''}
                                rows={3}
                                className="w-full rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-4 py-3 text-sm text-slate-900 dark:text-white outline-none focus:border-cyan-500/50 transition-colors resize-none"
                            />
                        ) : (
                            <input
                                autoFocus
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onBlur={() => setTouched(true)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && promptValid) close(inputValue.trim());
                                }}
                                placeholder={pending.opts.placeholder ?? ''}
                                className="w-full h-12 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-4 text-sm text-slate-900 dark:text-white outline-none focus:border-cyan-500/50 transition-colors"
                            />
                        )}
                        {touched && !promptValid && (
                            <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">
                                Mínimo {minLen} caracteres requeridos
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3 px-4">
                        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest leading-tight">
                            {pending.opts.message}
                        </h3>
                    </div>
                )}

                <div className="flex gap-3 w-full pt-4">
                    {pending.kind !== 'alert' && (
                        <button
                            onClick={() => close(pending.kind === 'prompt' ? null : false)}
                            className="flex-1 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-black uppercase text-[10px] tracking-widest border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-all active:scale-95"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        autoFocus={pending.kind !== 'prompt'}
                        onClick={() => {
                            if (pending.kind === 'prompt') {
                                if (!promptValid) {
                                    setTouched(true);
                                    return;
                                }
                                close(inputValue.trim());
                            } else if (pending.kind === 'alert') {
                                close();
                            } else {
                                close(true);
                            }
                        }}
                        disabled={pending.kind === 'prompt' && !promptValid && touched}
                        className={clsx(
                            'flex-[1.5] h-12 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-30 shadow-xl border border-white/10',
                            cfg.button,
                        )}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </IndustrialModal>
    );
}
