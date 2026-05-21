# Módulo Créditos — Gestión de Cuotas y Cobros

## ¿Qué es el módulo de Créditos?

El módulo de Créditos centraliza el seguimiento y cobro de todas las ventas realizadas a crédito. Muestra las cuotas pendientes agrupadas por cliente y venta, permite registrar pagos parciales o totales, y alerta automáticamente cuando hay cuotas vencidas.

## KPIs de cabecera

- **Total en Cuotas**: monto total pendiente de cobrar en todas las ventas a crédito activas
- **Créditos Vencidos**: número de créditos con al menos una cuota vencida (fecha límite superada)
- **Cobros del Día**: monto total recibido en abonos durante el día de hoy
- **Créditos Activos**: total de ventas a crédito con saldo pendiente

## Cómo cobrar una cuota

1. Busca al cliente por nombre o número de venta en la barra de búsqueda.
2. Localiza el crédito en la tabla y haz clic en **"Cobrar"** en la fila correspondiente.
3. En el modal de pago:
   - El sistema muestra el monto de la cuota pendiente (próxima cuota sin pagar).
   - Puedes ingresar un monto diferente si el cliente abona una cantidad parcial.
4. Confirma el pago. El sistema registra el abono, actualiza el saldo y genera un recibo imprimible.

## Filtros disponibles

- **Búsqueda de texto**: nombre del cliente o resumen de productos
- **Estado**: Todos / Pendientes / Vencidos / Pagados
- **Sucursal**: filtrar por sucursal (modo gerencia)
- **Cliente**: filtrar créditos de un cliente específico
- **Rango de fechas**: fecha de inicio y fin de la venta original
- **Orden**: más recientes, más antiguos, o por fecha de próximo vencimiento

## Estados de un crédito

- **Pendiente**: tiene cuotas sin vencer
- **Vencido**: tiene al menos una cuota cuya fecha límite ya pasó
- **Pagado**: todas las cuotas han sido cobradas — el crédito está cerrado

## Pago parcial

Si el cliente no puede pagar el monto exacto de la cuota, se puede registrar un abono parcial. El sistema distribuye el monto abonado contra la cuota más antigua sin pagar y actualiza el saldo restante automáticamente.

## Exportar

El botón **"Exportar CSV"** descarga todos los créditos visibles con los filtros activos: cliente, monto total, saldo pendiente, cuotas pagadas, cuotas pendientes y estado.

## ¿Qué puede consultar el asistente?

**Tiempo real (Firestore):**
- "¿Qué clientes tienen deuda?" → `get_client_credits` (lista con montos y estado)
- "¿Quiénes deben más?" → `get_client_credits` ordenado por saldo pendiente
- "¿Hay cuotas vencidas hoy?" → `get_client_credits` filtrando por estado OVERDUE

**Análisis histórico (SQL):**
- "¿Cuánto hemos cobrado en créditos este mes?" → `run_sql` sobre `v_ventas` filtrando `payment_method = 'credit'`
- "¿Cuál es el monto promedio de los créditos?" → `run_sql` con AVG sobre ventas a crédito
- "Ventas a crédito por sucursal en el trimestre" → `run_sql` con GROUP BY branch

## Restricciones de rol

- **VENDEDOR**: puede ver los créditos de su sucursal y registrar cobros. No puede ver otras sucursales.
- **ENCARGADO**: acceso completo a su sucursal, incluyendo exportación.
- **GERENTE**: vista consolidada de todas las sucursales, exportación global.
