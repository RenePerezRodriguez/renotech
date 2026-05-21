'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Receipt, Briefcase, Search } from 'lucide-react';
import CashWidget from './CashWidget';
import CommandCenter from './CommandCenter';
import UserProfileMenu from './UserProfileMenu';
import AuditNotifications from '../notifications/AuditNotifications';
import ExpenseFormModal from '../common/ExpenseFormModal';
import FullscreenControl from '../common/FullscreenControl';
import GlobalProductSearch from './GlobalProductSearch';
import TourButton from '@/components/chat/TourButton';
import { useAuth } from '@/contexts/AuthContext';

const ROUTE_TOURS: [string, string[]][] = [
  ['/inicio',         ['inicio-dashboard']],
  ['/punto-de-venta', ['pos-nueva-venta', 'pos-venta-contado', 'pos-venta-credito']],
  ['/caja',           ['caja-abrir-sesion', 'caja-cerrar-sesion']],
  ['/inventario',     ['inventario-consultar-stock', 'inventario-nuevo-producto']],
  ['/envios',         ['envios-crear-envio']],
  ['/ventas',         ['ventas-ver-historial', 'ventas-anular-venta']],
  ['/compras',        ['compras-nueva-compra']],
  ['/kardex',         ['kardex-historial']],
  ['/clientes',       ['clientes-nuevo-cliente', 'clientes-historial']],
  ['/creditos',       ['creditos-gestionar']],
  ['/tesoreria',      ['tesoreria-overview']],
  ['/pedidos',        ['pedidos-nuevo']],
  ['/transportes',    ['transportes-directorio']],
  ['/proveedores',    ['proveedores-nuevo']],
  ['/gerencia',       ['gerencia-dashboard']],
  ['/cotizaciones',   ['cotizaciones-nueva']],
  ['/auditoria',              ['auditoria-consultar']],
  ['/estadisticas',           ['estadisticas-dashboard']],
  ['/configuracion/sucursales', ['sucursales-gestion']],
  ['/configuracion',            ['configuracion-general']],
  ['/usuarios',                 ['usuarios-gestion']],
];

interface HeaderProps {
    onOpenMobileMenu: () => void;
}

export default function Header({ onOpenMobileMenu }: HeaderProps) {
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const { role } = useAuth();
    const pathname = usePathname();
    const isManager = role === 'GERENTE';

    const pageTourIds = ROUTE_TOURS.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? [];

    // Atajo global Ctrl+K / Cmd+K
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setShowSearch(v => !v);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    return (
        <>
        <header className="flex h-14 sm:h-16 shrink-0 items-center justify-between gap-2 px-3 sm:px-4 md:px-6 bg-white dark:bg-[#020617] border-b border-slate-100 dark:border-white/5 z-layout-header min-w-0 industrial-shadow">
            <div className="flex items-center gap-2 sm:gap-4 md:gap-6 min-w-0 flex-1">
                {/* Mobile Menu Button */}
                <button
                    type="button"
                    onClick={onOpenMobileMenu}
                    className="md:hidden p-2 -ml-1 shrink-0 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors"
                >
                    <Menu size={20} />
                </button>

                {/* Unified Branch + Role Selector */}
                <CommandCenter />
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
                {/* Gerencia Quick Access (GERENTE only) */}
                {isManager && (
                    <Link
                        href="/gerencia"
                        title="Centro de Gerencia"
                        className="inline-flex items-center gap-2 h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest border bg-yellow-500/10 text-yellow-700 border-yellow-500/30 hover:bg-yellow-500 hover:text-black dark:text-yellow-400 dark:border-yellow-500/20 transition-colors cursor-pointer whitespace-nowrap"
                    >
                        <Briefcase size={14} strokeWidth={2.5} />
                        <span className="hidden lg:inline">Gerencia</span>
                    </Link>
                )}

                {/* Quick Expense — opens the full modal in-place */}
                <button
                    onClick={() => setShowExpenseModal(true)}
                    className="hidden sm:inline-flex items-center gap-2 h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest border bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500 hover:text-white dark:text-amber-400 dark:border-amber-500/20 transition-colors cursor-pointer whitespace-nowrap"
                    title="Registrar un gasto operativo (alquiler, transporte, servicios, sueldos, etc.). Permite adjuntar comprobante y registrar gastos de fechas pasadas."
                >
                    <Receipt size={14} strokeWidth={2.5} />
                    <span className="hidden lg:inline">Nuevo Gasto</span>
                </button>

                <CashWidget />
                <AuditNotifications />

                {/* Buscador global de productos */}
                <button
                    onClick={() => setShowSearch(true)}
                    title="Buscar producto (Ctrl+K)"
                    className="flex items-center gap-2 h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest border bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                    <Search size={14} strokeWidth={2.5} />
                    <span className="hidden lg:inline">Buscar</span>
                    <kbd className="hidden xl:flex items-center gap-0.5 px-1 py-0.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded text-[8px] font-mono text-slate-300 dark:text-slate-600 ml-0.5">
                        ⌘K
                    </kbd>
                </button>

                <span className="hidden sm:inline-flex">
                    <TourButton tourIds={pageTourIds} />
                </span>

                <FullscreenControl />

                <div className="h-8 w-px bg-slate-100 dark:bg-white/5 hidden sm:block mx-0.5 shrink-0" />

                <UserProfileMenu />
            </div>
        </header>

        <ExpenseFormModal
            isOpen={showExpenseModal}
            onClose={() => setShowExpenseModal(false)}
        />

        <GlobalProductSearch isOpen={showSearch} onClose={() => setShowSearch(false)} />
        </>
    );
}
