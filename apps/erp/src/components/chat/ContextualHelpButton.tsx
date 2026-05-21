'use client';

import { usePathname } from 'next/navigation';
import { HelpCircle } from 'lucide-react';
import { useChat } from '@/contexts/ChatContext';

// Maps each module route prefix → context message sent automatically when chat opens
const MODULE_CONTEXTS: Record<string, { label: string; message: string }> = {
  '/inventario':      { label: 'Inventario',       message: 'Estoy en el módulo de Inventario. ¿Qué puedo hacer aquí y cómo consulto el stock?' },
  '/ventas':          { label: 'Ventas',            message: 'Estoy en el módulo de Ventas. ¿Cómo veo el resumen de ventas de hoy?' },
  '/caja':            { label: 'Caja',              message: 'Estoy en el módulo de Caja y Tesorería. ¿Cómo abro o cierro una sesión de caja?' },
  '/tesoreria':       { label: 'Tesorería',         message: 'Estoy en el módulo de Tesorería. ¿Qué operaciones puedo hacer aquí?' },
  '/compras':         { label: 'Compras',           message: 'Estoy en el módulo de Compras. ¿Cómo registro una nueva compra a un proveedor?' },
  '/cotizaciones':    { label: 'Cotizaciones',      message: 'Estoy en el módulo de Cotizaciones. ¿Cómo creo una nueva cotización para un cliente?' },
  '/pedidos':         { label: 'Pedidos',           message: 'Estoy en el módulo de Pedidos. ¿Cómo creo un pedido entre sucursales?' },
  '/envios':          { label: 'Envíos',            message: 'Estoy en el módulo de Envíos. ¿Cómo gestiono envíos pendientes y recepciones?' },
  '/clientes':        { label: 'Clientes',          message: 'Estoy en el módulo de Clientes. ¿Cómo veo los créditos pendientes y saldos deudores?' },
  '/creditos':        { label: 'Créditos',          message: 'Estoy en el módulo de Créditos. ¿Cómo registro un pago de cuota?' },
  '/proveedores':     { label: 'Proveedores',       message: 'Estoy en el módulo de Proveedores. ¿Cómo veo el historial de compras a un proveedor?' },
  '/gerencia':        { label: 'Gerencia',          message: 'Estoy en el módulo de Gerencia. Dame un resumen del rendimiento de ventas por sucursal.' },
  '/estadisticas':    { label: 'Estadísticas',      message: 'Estoy en el módulo de Estadísticas. ¿Qué métricas clave debería revisar?' },
  '/kardex':          { label: 'Kardex',            message: 'Estoy viendo el Kardex de un producto. ¿Cómo interpreto los movimientos?' },
  '/punto-de-venta':  { label: 'Punto de venta',   message: 'Estoy en el Punto de Venta. ¿Cómo busco un producto rápidamente y aplico un descuento?' },
  '/usuarios':        { label: 'Usuarios',          message: 'Estoy en el módulo de Usuarios. ¿Cómo creo un usuario y le asigno un rol?' },
  '/auditoria':       { label: 'Auditoría',         message: 'Estoy en el módulo de Auditoría. ¿Qué alertas debería revisar primero?' },
  '/inicio':          { label: 'Dashboard',         message: 'Estoy en el Dashboard. Dame un resumen rápido del estado del sistema hoy.' },
};

function getContext(pathname: string) {
  for (const [prefix, ctx] of Object.entries(MODULE_CONTEXTS)) {
    if (pathname.startsWith(prefix)) return ctx;
  }
  return null;
}

export default function ContextualHelpButton() {
  const pathname = usePathname();
  const { openWithContext, isOpen } = useChat();
  const ctx = getContext(pathname);

  if (!ctx || isOpen) return null;

  return (
    <button
      onClick={() => openWithContext(ctx.message)}
      title={`Ayuda en ${ctx.label}`}
      aria-label={`Abrir asistente con ayuda de ${ctx.label}`}
      className="
        fixed bottom-20 right-6 z-[9996]
        w-9 h-9 rounded-full
        bg-white dark:bg-slate-800
        border border-slate-200 dark:border-slate-700
        shadow-md hover:shadow-lg
        flex items-center justify-center
        text-slate-500 dark:text-slate-400
        hover:text-indigo-600 dark:hover:text-indigo-400
        hover:border-indigo-300 dark:hover:border-indigo-700
        transition-all duration-150
        animate-in fade-in zoom-in-95 duration-200
      "
    >
      <HelpCircle size={16} strokeWidth={1.8} />
    </button>
  );
}
