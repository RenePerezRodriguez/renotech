# Módulo Inicio — Panel de Control (Dashboard)

## ¿Qué es el panel de inicio?

El panel de inicio es la primera pantalla que ves al entrar al sistema. Muestra un resumen completo del estado del negocio en tiempo real: ventas del día, posición financiera, alertas de stock bajo, tendencia semanal y actividad reciente.

## Métricas del día (KPIs)

Los tres indicadores en la parte superior se actualizan automáticamente cada vez que se registra una venta:

- **Ingresos del Día**: suma total de ventas registradas hoy (en Bs.)
- **Stock Activo**: cantidad total de productos en el catálogo
- **Alertas de Inventario**: cantidad de productos que están por debajo de su stock mínimo

## Posición financiera

La sección de posición financiera consolida tres datos clave de la sucursal:

- **Bóveda**: saldo actual en caja (solo visible si hay una sesión de caja abierta)
- **Por Pagar**: total de deudas pendientes a proveedores
- **A Favor**: saldo a favor de la sucursal en cuentas por cobrar

Si el usuario tiene rol GERENTE y está en vista global, se muestra el consolidado de todas las sucursales.

## Gráfico de tendencia operativa

El gráfico "Últimos 7 Días" muestra la evolución de ventas día por día de la semana actual. Permite identificar los días de mayor actividad y comparar el rendimiento entre días. El eje vertical es el total en Bs. vendido ese día.

## Panel derecho

- **Ranking ABC**: distribución de productos según su contribución al ingreso (A = top 20%, B = siguiente 30%, C = restante 50%). Ayuda a priorizar qué productos mantener siempre en stock.
- **Recordatorios próximos**: alertas del CRM con seguimientos programados a clientes (citas, llamadas, vencimientos de crédito).
- **Actividad reciente**: últimas 5 ventas registradas con nombre del cliente, hora y monto.
- **Top productos**: los 5 productos más vendidos en los últimos 7 días por cantidad.

## Accesos rápidos

En la parte superior del panel hay botones de acceso rápido a los módulos más usados:

- **Nueva Venta** (amarillo) → abre el Punto de Venta directamente
- **Bóveda** → va al módulo de Caja
- **Inventario** → va al catálogo de productos
- **Compras** → va al módulo de compras a proveedores

El botón de **Bóveda** también muestra el saldo actual si hay caja abierta, o "Requiere Apertura" si no hay sesión activa.

## Buscador global

El botón **BUSCAR** en la barra superior (atajo: `Ctrl+K`) permite encontrar cualquier producto del catálogo en tiempo real. Busca por nombre, código interno, código de fábrica, número OEM y marca. Es accesible desde cualquier módulo del sistema.

## Diferencia por rol

- **VENDEDOR**: ve solo los datos de su sucursal. No tiene acceso a posición financiera detallada ni datos consolidados.
- **ENCARGADO**: ve todos los datos de su sucursal incluyendo posición financiera.
- **GERENTE**: puede activar la "Vista Global" para ver el consolidado de todas las sucursales a la vez.

## ¿Cómo consultar datos del dashboard con el asistente?

El asistente puede responder preguntas como:
- "¿Cuánto vendimos hoy?" → usa datos en tiempo real de ventas del día
- "¿Qué productos tienen stock bajo?" → lista productos bajo su mínimo
- "¿Cuál es el estado de la caja?" → muestra si hay sesión abierta y el saldo
- "¿Cuáles fueron los productos más vendidos esta semana?" → top productos por cantidad
- "Muéstrame las ventas de los últimos 7 días" → tendencia diaria con totales
