# Módulo Ventas — Historial y Auditoría

## ¿Qué es el módulo de Ventas?

El módulo de Ventas muestra el **historial completo de todas las transacciones** registradas en el Punto de Venta. Permite buscar, filtrar, ver el detalle de cada venta, imprimir tickets, exportar a CSV y (para el gerente) anular ventas.

No se registran ventas desde aquí — las ventas se crean en el Punto de Venta. Este módulo es de consulta y auditoría.

## KPIs de cabecera

Al entrar al módulo se muestran 4 indicadores del período seleccionado:
- **Facturación Bruta**: suma total de ventas válidas en el rango de fechas
- **Transacciones OK**: cantidad de ventas válidas
- **Tickets Anulados**: cantidad de ventas anuladas en el período
- **Ticket Promedio**: monto promedio por venta

## Filtros disponibles

- **Búsqueda de texto**: por nombre de cliente, NIT o ID de la venta
- **Estado**: Todas / Válidas / Anuladas
- **Auditor/Cajero**: filtra por el usuario que registró la venta
- **Rango de fechas**: selecciona inicio y fin del período (por defecto: hoy)
- **Sucursal** (solo vista consolidada GERENTE): filtra por sucursal específica

## Ver el detalle de una venta

Haz clic en cualquier fila de la tabla para ver:
- Lista de productos con cantidades, precios unitarios y subtotales
- Método de pago (efectivo, QR, crédito, mixto)
- Cliente asociado (si aplica)
- Cajero que registró la venta
- Fecha y hora exacta
- Botón para reimprimir el ticket

## Exportar

El botón **"Exportar CSV"** descarga el historial completo del rango de fechas activo. El archivo incluye todas las columnas visibles: ID, cliente, fecha, total, método de pago, cajero, estado.

## Anular una venta (solo GERENTE)

Solo el rol GERENTE puede anular ventas:
1. Encuentra la venta usando los filtros
2. Haz clic en la venta para ver su detalle
3. Presiona **"Anular Venta"** (visible solo para gerentes)
4. Escribe el motivo de la anulación — queda registrado permanentemente
5. El stock de cada producto se devuelve automáticamente
6. El movimiento aparece como "Anulación de Venta" en el Kardex de cada producto

La anulación no puede deshacerse.

## ¿Qué puede consultar el asistente?

El asistente tiene herramientas completas para este módulo:

**Tiempo real (Firestore):**
- "¿Cuánto vendimos hoy?" → `get_daily_sales_summary`
- "¿Cómo van las ventas esta semana?" → `get_weekly_sales`
- "¿Cuáles son los productos más vendidos?" → `get_top_products`
- "¿Cómo están las sucursales este mes?" → `compare_branches_sales`

**Análisis histórico (SQL):**
- "Ventas de enero a marzo" → `run_sql` sobre `v_ventas`
- "Ventas en efectivo vs QR este mes" → `run_sql` agrupado por `payment_method`
- "Ticket promedio por día de la semana" → `run_sql` con `DAYOFWEEK`
- "Top 10 clientes por monto este trimestre" → `run_sql` sobre `v_ventas`
- "Comparativa de ventas mes a mes en el año" → `run_sql` con `FORMAT_DATE`

## Restricciones de rol

- **VENDEDOR**: ve solo las ventas de su sucursal. No puede anular.
- **ENCARGADO**: ve todas las ventas de su sucursal. No puede anular.
- **GERENTE**: puede ver todas las sucursales (vista consolidada), anular ventas y ver comparativas entre sucursales.
