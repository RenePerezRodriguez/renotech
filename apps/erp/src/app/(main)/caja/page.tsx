'use client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import CajaOfflineView from './components/CajaOfflineView';

/**
 * Caja v2 — Operación diaria del cajero.
 *  · Mi Caja: vista del cajero (apertura, ventas, gastos, cierre).
 *  · Sesiones activas (gerente): supervisión.
 *  · Historial (gerente): cierres pasados.
 *
 * La gestión de cuentas, transferencias, conciliación y configuración
 * vive en /tesoreria (solo gerencia).
 */
import React, { useState } from 'react';
import { Banknote, Wallet, Users, History, Info, Lock, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import ModuleHeader from '@/components/common/ModuleHeader';
import MyCashSessionView from './components/v2/MyCashSessionView';
import VaultView from './components/v2/VaultView';
import OpenSessionsView from './components/v2/OpenSessionsView';
import SessionHistoryView from './components/v2/SessionHistoryView';
import AccountsView from './components/v2/AccountsView';
import TransfersView from './components/v2/TransfersView';
import CajaSettingsView from './components/v2/CajaSettingsView';
import clsx from 'clsx';

type Tab = 'MY_CASH' | 'VAULT' | 'DIGITAL_ACCOUNTS' | 'TRANSFERS' | 'OPEN_SESSIONS' | 'HISTORY' | 'SETTINGS';

const TAB_HELP: Record<Tab, { title: string; body: string }> = {
    MY_CASH: {
        title: 'Tu sesión de caja',
        body: 'Aquí abres tu sesión declarando el efectivo inicial, registras gastos y, al cerrar, declaras el efectivo final. El sistema compara contra lo esperado (ventas + gastos) y reporta cualquier discrepancia.',
    },
    VAULT: {
        title: 'Bóveda de la sucursal',
        body: 'Resguardo de excedentes de efectivo. Aquí puedes ver el saldo, historial de movimientos y realizar transferencias entre la caja y la bóveda.',
    },
    DIGITAL_ACCOUNTS: {
        title: 'Cuentas Bancarias y Wallets',
        body: 'Aquí puedes visualizar los saldos y el historial de movimientos de las cuentas de banco y billeteras digitales (QR).',
    },
    TRANSFERS: {
        title: 'Transferencias',
        body: 'Historial de movimientos entre cuentas. Puedes transferir efectivo de la caja o bóveda hacia el banco, o entre otras cuentas.',
    },
    OPEN_SESSIONS: {
        title: 'Sesiones activas',
        body: 'Vista de gerencia: todas las cajas abiertas en este momento (por sucursal, cajero y antigüedad). Permite force-close si un cajero olvidó cerrar.',
    },
    HISTORY: {
        title: 'Historial de sesiones',
        body: 'Sesiones cerradas con su discrepancia, total declarado vs esperado y método (cierre normal, force-close, reapertura). Filtros por cajero, sucursal y rango de fechas.',
    },
    SETTINGS: {
        title: 'Ajustes de Caja',
        body: 'Selecciona las cuentas por defecto que esta sucursal usará para recibir pagos por QR, transferencias y la información que se imprimirá en los recibos.',
    },
};

export default function CajaPage() {
    const { isOnline } = useNetworkStatus();
    const { user, userName, role } = useAuth();
    const { currentBranch, isConsolidatedView } = useBranch();
    const isGerente = role === 'GERENTE';
    const [tab, setTab] = useState<Tab>('MY_CASH');

    if (!isOnline) return <CajaOfflineView />;

    if (!user) {
        return <div className="p-6 text-sm text-slate-500">Inicia sesión para acceder a Caja.</div>;
    }

    if (isConsolidatedView) {
        return (
            <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827]/40 p-12 text-center space-y-3 mt-6">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Selecciona una sucursal</div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 max-w-md mx-auto">
                    Caja opera por sucursal específica. Cambia el selector del header de “Todas las sucursales” a una en concreto para abrir o ver tu sesión.
                </p>
            </div>
        );
    }

    const tabs: { id: Tab; label: string; icon: React.ReactNode; show: boolean }[] = [
        { id: 'MY_CASH', label: 'Mi Caja', icon: <Wallet size={14} />, show: true },
        { id: 'VAULT', label: 'Bóveda', icon: <Lock size={14} />, show: true },
        { id: 'DIGITAL_ACCOUNTS', label: 'Bancos / Wallet', icon: <Banknote size={14} />, show: true },
        { id: 'TRANSFERS', label: 'Transferencias', icon: <History size={14} />, show: true },
        { id: 'OPEN_SESSIONS', label: 'Sesiones activas', icon: <Users size={14} />, show: isGerente },
        // OBS-03: historial y ajustes son solo para gerencia
        { id: 'HISTORY', label: 'Historial', icon: <History size={14} />, show: isGerente },
        { id: 'SETTINGS', label: 'Ajustes', icon: <Settings size={14} />, show: isGerente },
    ];

    const help = TAB_HELP[tab];

    return (
        <div className="space-y-6">
            <ModuleHeader
                title="Caja"
                subtitle="Apertura, cierre y operación diaria del cajero"
                icon={Banknote}
            />

            <div data-tour="caja-tabs" className="flex p-1.5 bg-slate-100 dark:bg-[#111827] rounded-2xl w-full max-w-full sm:w-fit sm:shrink-0 border border-slate-200 dark:border-white/10 overflow-x-auto scrollbar-none">
                {tabs.filter(t => t.show).map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={clsx(
                            'flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] transition-all whitespace-nowrap active:scale-95',
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

            {tab === 'MY_CASH' && (
                <MyCashSessionView
                    cashierId={user.uid}
                    cashierName={userName || user.email || 'Cajero'}
                    cashierRole={role || undefined}
                    branchId={currentBranch?.id || null}
                    isGerente={isGerente}
                />
            )}

            {tab === 'VAULT' && <VaultView />}
            {tab === 'DIGITAL_ACCOUNTS' && <AccountsView hideCashDrawers={true} />}
            {tab === 'TRANSFERS' && <TransfersView />}

            {tab === 'OPEN_SESSIONS' && isGerente && <OpenSessionsView />}
            {tab === 'HISTORY' && <SessionHistoryView />}
            {tab === 'SETTINGS' && <CajaSettingsView />}
        </div>
    );
}
