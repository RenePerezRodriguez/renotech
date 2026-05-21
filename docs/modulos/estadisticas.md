# Módulo Estadísticas — Inteligencia de Negocio

## ¿Qué es el módulo de Estadísticas?

El módulo de Estadísticas (llamado "Inteligencia de Negocio" en la UI) es el **centro de análisis** del sistema. Disponible exclusivamente desde la sucursal HQ para roles GERENTE. Combina un asistente de IA conversacional con cuatro paneles de análisis estructurados: rotación de inventario, ventas por período, top productos y top clientes.

Acceso: menú **Control y Auditoría → Estadísticas** (hqOnly, GERENTE).

---

## Selector de sucursal

En la parte superior derecha hay un selector independiente del filtro global del header:

- **Usar selección global**: hereda la sucursal activa en el header
- **Todas las sucursales**: vista consolidada con datos de todas las sedes
- **Sucursal específica**: filtra todos los análisis a esa sede

El selector afecta a todas las pestañas simultáneamente.

---

## Tab 1 — Asistente IA

Interfaz de chat que responde preguntas de negocio en lenguaje natural usando datos reales de BigQuery y Firestore.

### Consultas rápidas (chips predefinidos)

8 análisis con un solo clic:

| Chip | Análisis |
|---|---|
| Ventas esta semana | Total vendido + margen de utilidad de los últimos 7 días |
| Top 5 productos del mes | Ranking por cantidad vendida en el mes actual |
| Ventas por mes (histórico) | Ingresos mensuales históricos en gráfico de barras |
| Clientes frecuentes | Top 5 por gasto total y número de compras |
| Margen últimos 90 días | Comparativa con los 90 días anteriores |
| Stock crítico | Productos agotados o bajo mínimo más urgentes |
| Compras por proveedor | Tabla de gasto total por empresa proveedora |
| Rotación de inventario | Semáforo de productos en verde, amarillo y rojo |

### Consultas libres

Escribe cualquier pregunta. El asistente usa SQL en BigQuery para responder con datos tabulares o textuales. Ejemplos:

- "¿Cuánto vendí en enero comparado con febrero?"
- "¿Cuál es el margen promedio por categoría de producto?"
- "¿Qué vendedor generó más ingresos este trimestre?"
- "¿Cuántas unidades del producto X salieron en los últimos 30 días?"
- "¿Qué proveedor concentra más compras en valor?"

### Exportación

Las respuestas en formato tabla tienen un botón **"Exportar CSV"** para descargar el resultado.

---

## Tab 2 — Rotación de Inventario

Análisis de qué tan rápido se vende cada producto. Clasifica en semáforo:

- **Verde (Alta)**: productos que rotan bien — se venden frecuentemente
- **Amarillo (Media)**: rotación moderada
- **Rojo (Baja)**: productos lentos — candidatos a liquidar o no reponer

### Filtros disponibles

- Rango de fechas: presets de 1 mes, 3 meses, 6 meses, 1 año
- Semáforo: filtrar por categoría de rotación
- Proveedor: filtrar por empresa proveedora
- Rango de rotación y días en inventario
- Búsqueda por nombre de producto

Incluye paginación (25 por página) y botón de descarga.

---

## Tab 3 — Ventas por Período

Análisis de ingresos agrupados por períodos de tiempo con gráfico de barras.

### Configuración

- **Granularidad**: Diario, Semanal o Mensual
- **Período rápido**: Hoy, Semana, Mes, Trimestre, Año
- **Rango personalizado**: fechas desde/hasta
- **Filtros adicionales**: ingreso mínimo/máximo por período, número mínimo de ventas, margen mínimo, excluir períodos sin ventas

### Métricas por período

- Ingresos totales (Bs)
- Número de transacciones
- Margen de utilidad (%)
- Período con mejor desempeño resaltado

El color de las barras del gráfico indica el margen: verde ≥30%, amarillo ≥15%, rojo <15%.

Incluye paginación y exportación CSV.

---

## Tab 4 — Top Productos

Ranking de los productos más vendidos en el período seleccionado.

### Configuración

- **Período**: días hacia atrás (por defecto 30)
- **Top N**: 10, 20, 50, 100 o todos
- **Filtros**: cantidad mínima vendida, rango de ingresos, número mínimo de ventas
- **Ordenación**: por cantidad (desc/asc), ingresos, ticket promedio, número de ventas

### Métricas por producto

- Unidades vendidas totales
- Ingresos generados (Bs)
- Precio promedio de venta
- Número de transacciones donde apareció

Incluye paginación (25 por página) y exportación.

---

## Tab 5 — Top Clientes

Ranking de clientes por gasto total en el período seleccionado.

### Configuración

- **Período**: días hacia atrás (por defecto 90)
- **Tipo de cliente**: PARTICULAR, EMPRESA o todos
- **Filtros**: rango de gasto total, número mínimo de compras
- **Top N**: selector
- **Ordenación**: por gasto total, número de transacciones, ticket promedio, ticket máximo

### Métricas por cliente

- Gasto total en el período (Bs)
- Número de transacciones
- Ticket promedio
- Ticket máximo (compra más grande)

Incluye paginación y exportación.

---

## Fuentes de datos

| Tab | Fuente |
|---|---|
| Asistente IA | BigQuery (historial completo) + Firestore (stock en tiempo real) |
| Rotación de Inventario | Firestore (movimientos + catálogo) |
| Ventas por Período | Firestore (colección ventas) |
| Top Productos | Firestore (ítems de venta) |
| Top Clientes | Firestore (ventas agrupadas por cliente) |

---

## Restricciones de acceso

- Solo accesible para rol **GERENTE**
- Solo disponible desde la sucursal **HQ (Casa Matriz)**
- El rol ENCARGADO puede ver el selector de sucursal pero no accede al módulo completo

---

## Consultas con el asistente de chat (fuera del tab IA)

El asistente del chat global puede responder preguntas analíticas usando `run_sql`:

- `run_sql` → análisis histórico en BigQuery (ventas, productos, clientes, comparativas)

Tablas disponibles en BigQuery:
- `v_ventas` — ventas con totales, método de pago, estado
- `v_ventas_items` — líneas de venta con producto, cantidad y precio
- `v_catalogo` — catálogo maestro con precios y costos
- `v_clientes` — directorio de clientes

Ejemplos de preguntas al chat global:
- "¿Cuál fue el mes con más ventas este año?" → `run_sql`
- "Dame el top 10 de productos por ingresos del último trimestre" → `run_sql`
- "¿Cuántos clientes nuevos hubo en mayo?" → `run_sql`
