/** Sugerencias de preguntas rápidas según rol del usuario. */

export interface ChatSuggestion {
  label: string;
  message: string;
  icon: string;
}

const VENDEDOR_SUGGESTIONS: ChatSuggestion[] = [
  { label: 'Stock disponible', message: '¿Cuánto stock tenemos de los productos más vendidos?', icon: '📦' },
  { label: 'Ventas de hoy', message: '¿Cuánto hemos vendido hoy?', icon: '💰' },
  { label: 'Precio de producto', message: '¿Cuánto cuesta el producto más vendido?', icon: '🏷️' },
  { label: 'Caja activa', message: '¿Cuál es el estado de la caja hoy?', icon: '🧾' },
  { label: 'Cómo registrar venta', message: '¿Cómo registro una venta en el sistema?', icon: '🆘' },
  { label: 'Envíos pendientes', message: '¿Hay envíos pendientes de recibir?', icon: '🚚' },
];

const GERENTE_SUGGESTIONS: ChatSuggestion[] = [
  { label: 'Ventas esta semana', message: '¿Cómo van las ventas esta semana?', icon: '📊' },
  { label: 'Top productos', message: '¿Cuáles son los productos más vendidos?', icon: '🏆' },
  { label: 'Stock crítico', message: '¿Qué productos tienen stock bajo?', icon: '⚠️' },
  { label: 'Balance sucursales', message: '¿Cómo están las ventas por sucursal?', icon: '🏢' },
  { label: 'Clientes con deuda', message: '¿Cuántos clientes tienen crédito pendiente?', icon: '👥' },
  { label: 'Reporte del día', message: 'Dame un resumen del día de hoy.', icon: '📋' },
];

const ENCARGADO_SUGGESTIONS: ChatSuggestion[] = [
  { label: 'Stock bajo', message: '¿Qué productos tienen stock bajo en mi sucursal?', icon: '⚠️' },
  { label: 'Ventas del día', message: '¿Cuánto vendimos hoy en mi sucursal?', icon: '💰' },
  { label: 'Envíos pendientes', message: '¿Hay envíos pendientes de procesar?', icon: '🚚' },
  { label: 'Resumen semanal', message: '¿Cómo vamos esta semana comparado con la anterior?', icon: '📈' },
];

const DEFAULT_SUGGESTIONS: ChatSuggestion[] = [
  { label: 'Stock disponible', message: '¿Cuánto stock tenemos disponible?', icon: '📦' },
  { label: 'Ventas de hoy', message: '¿Cuánto hemos vendido hoy?', icon: '💰' },
  { label: 'Ayuda con el sistema', message: '¿Qué módulos tiene el sistema?', icon: '🆘' },
  { label: 'Estado de caja', message: '¿Cuál es el estado de la caja?', icon: '🧾' },
];

export function getSuggestions(role: string | null): ChatSuggestion[] {
  if (role === 'GERENTE') return GERENTE_SUGGESTIONS;
  if (role === 'VENDEDOR') return VENDEDOR_SUGGESTIONS;
  if (role === 'ENCARGADO') return ENCARGADO_SUGGESTIONS;
  return DEFAULT_SUGGESTIONS;
}
