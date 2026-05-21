'use client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { OfflineModuleGuard } from '@/components/common/OfflineModuleGuard';

/**
 * Tesorería v2 — Centro de control financiero (gerencia).
 *
 * Glosario rápido:
 *  · CASH_DRAWER (Cajón): efectivo físico de una sucursal.
 *  · BANK (Banco): cuenta bancaria de la empresa.
 *  · WALLET (Billetera): QR / monedero digital.
 *
 * Cada movimiento (venta, gasto, transferencia, conciliación) genera
 * un asiento en `journal_entries` que ajusta el saldo de la cuenta.
 */
import React, { useState } from 'react';
import { Wallet, LayoutGrid, ArrowLeftRight, ScrollText, Settings, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ModuleHeader from '@/components/common/ModuleHeader';
import AccountsView from '../caja/components/v2/AccountsView';
import TransfersView from '../caja/components/v2/TransfersView';
import BankReconciliationView from '../caja/components/v2/BankReconciliationView';
import TreasuryConfigView from '../caja/components/v2/TreasuryConfigView';
import clsx from 'clsx';

type Tab = 'ACCOUNTS' | 'TRANSFERS' | 'RECONCILIATION' | 'CONFIG';

const TAB_HELP: Record<Tab, { title: string; body: string }> = {
    ACCOUNTS: {
        title: '¿Qué son las cuentas?',
        body: 'Cada cuenta representa un contenedor real de dinero: un cajón físico de sucursal (CASH_DRAWER), una cuenta bancaria (BANK) o una billetera digital/QR (WALLET). El saldo se actualiza automáticamente con cada venta, gasto o transferencia.',
    },
    TRANSFERS: {
        title: '¿Qué son las transferencias?',
        body: 'Mueven dinero entre dos cuentas (ej. depositar el efectivo del cajón al banco). Generan dos asientos atómicos: un EGRESO en origen y un INGRESO en destino. Cross-branch soportado.',
    },
    RECONCILIATION: {
        title: '¿Qué es la conciliación bancaria?',
        body: 'Importa el extracto de tu banco (Excel) y el sistema cruza automáticamente cada línea con los asientos pendientes (mismo monto, fecha y dirección ±2 días). Las líneas no matcheadas requieren acción manual.',
    },
    CONFIG: {
        title: '¿Qué configuro aquí?',
        body: 'Límites de gasto del cajero, umbrales de discrepancia para alertas, horas máximas de sesión abierta, cuentas por defecto para cada método de pago y políticas de reconciliación.',
    },
};

export default function TesoreriaPage() {
    const { isOnline } = useNetworkStatus();
    const { user, role } = useAuth();
    const isGerente = role === 'GERENTE';
    const [tab, setTab] = useState<Tab>('ACCOUNTS');

    if (!isOnline) return <OfflineModuleGuard moduleName="Tesorería"><span/></OfflineModuleGuard>;

    if (!user) {
        return <div className="p-6 text-sm text-slate-500">Inicia sesión para acceder a Tesorería.</div>;
    }

    if (!isGerente) {
        return (
            <div className="p-6 text-sm text-slate-500">
                Tesorería es exclusiva de gerencia. La operación diaria está en{' '}
                <a href="/caja" className="text-blue-600 dark:text-yellow-500 underline font-bold">/caja</a>.
            </div>
        );
    }

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'ACCOUNTS', label: 'Cuentas', icon: <LayoutGrid size={14} /> },
        { id: 'TRANSFERS', label: 'Transferencias', icon: <ArrowLeftRight size={14} /> },
        { id: 'RECONCILIATION', label: 'Conciliación', icon: <ScrollText size={14} /> },
        { id: 'CONFIG', label: 'Configuración', icon: <Settings size={14} /> },
    ];

    const help = TAB_HELP[tab];

    return (
        <div className="space-y-6">
            <ModuleHeader
                title="Tesorería"
                subtitle="Cuentas · Transferencias · Conciliación · Configuración"
                icon={Wallet}
            />

            <div data-tour="tesoreria-tabs" className="flex p-1.5 bg-slate-100 dark:bg-[#111827] rounded-2xl w-fit shrink-0 border border-slate-200 dark:border-white/10 overflow-x-auto">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={clsx(
                            'flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap active:scale-95',
                            tab === t.id
                                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-yellow-500 shadow-sm'
                                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                        )}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/40 p-4 flex items-start gap-3">
                <div className="shrink-0 w-8 h-8 rounded-xl bg-blue-500/10 dark:bg-yellow-500/10 flex items-center justify-center">
                    <Info size={14} className="text-blue-600 dark:text-yellow-500" />
                </div>
                <div className="space-y-1">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        {help.title}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{help.body}</p>
                </div>
            </div>

            {tab === 'ACCOUNTS' && <AccountsView />}
            {tab === 'TRANSFERS' && <TransfersView />}
            {tab === 'RECONCILIATION' && <BankReconciliationView />}
            {tab === 'CONFIG' && <TreasuryConfigView />}
        </div>
    );
}
