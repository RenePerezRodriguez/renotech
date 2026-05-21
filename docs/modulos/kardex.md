# Módulo Kardex — Historial de Movimientos de Stock

## ¿Qué es el Kardex?

El Kardex es el **registro contable de stock** de cada producto. Muestra cada movimiento que afectó las existencias: fecha, tipo, cantidad, stock resultante y responsable. Es la fuente de verdad para auditar, rastrear discrepancias y analizar la rotación de inventario.

Acceso: menú **Kardex** o haciendo clic en el código de cualquier producto en Inventario.

---

## Pantalla de búsqueda (lista de productos)

Al entrar al módulo aparece el catálogo completo con buscador y filtros de estado:

- **Buscador**: busca por nombre, código, código OEM, código de fábrica o marca. El atajo `/` enfoca el buscador desde el teclado.
- **Filtros de estado**:
  - **Todos**: todos los productos activos
  - **Alerta**: stock mayor a 0 pero por debajo del mínimo configurado (señal ámbar)
  - **Agotados**: stock = 0 (señal roja)
- **Filtros por marca y categoría**: chips seleccionables para acotar el catálogo
- **Ordenación**: por nombre, código, stock ascendente o stock descendente
- **Favoritos**: estrella en cada tarjeta para acceso rápido
- **Recientes**: los últimos 5 productos consultados aparecen destacados

---

## Pantalla de detalle (historial de un producto)

Al seleccionar un producto se abre su kardex individual con:

### KPIs superiores

Cuatro indicadores siempre visibles:

| KPI | Descripción | Visibilidad |
|---|---|---|
| Stock disponible | Unidades actuales. Rojo si está por debajo del mínimo. | Todos |
| Valuación actual | `costo × stock`. Costo promedio debajo. | Solo GERENTE |
| Entradas del período | Suma de unidades que ingresaron en el período filtrado. | Todos |
| Salidas del período | Suma de unidades que salieron en el período filtrado. | Todos |

### Alerta de tendencia

Si los últimos 10 movimientos son todos salidas o ajustes negativos, aparece un banner de advertencia sugiriendo reabastecimiento.

### Análisis del período (colapsable)

Desplegable con métricas calculadas sobre los movimientos del período:

- **Tipo más frecuente**: qué operación domina (venta, ajuste, etc.)
- **Costo Promedio Ponderado (CPP/WAP)**: promedio ponderado por cantidad de todas las entradas — solo GERENTE
- **Rotación mensual estimada**: proyección de unidades vendidas por mes basada en salidas del período
- **Balance neto**: entradas menos salidas del período

### Gráfico de evolución de stock

Gráfico de área que muestra cómo cambió el stock a lo largo del tiempo:

- Eje X: fechas de los movimientos
- Eje Y: stock resultante después de cada movimiento
- **Línea roja punteada**: stock mínimo configurado para el producto
- **Tooltip interactivo**: al pasar el cursor muestra fecha completa, tipo de movimiento, cantidad y nota

### Tabla de movimientos

Lista cronológica (más reciente primero) con todos los movimientos. Cada fila incluye:

- **Fecha y hora**
- **Tipo**: con badge de color (ver tipos abajo)
- **Detalle/Referencia**: motivo o nota del movimiento, con enlace a la transacción de origen
- **Entrada / Salida**: cantidad en la columna correspondiente
- **Costo unitario y valor del movimiento**: solo GERENTE
- **Responsable**: usuario que generó el movimiento
- **Stock resultante**: stock después del movimiento

**Colores de tipo de movimiento:**
- Verde (`#10b981`): entradas — ENTRADA, TRASP_ENTRADA, TRASP_REVERSAL, GARANTIA_ENTRADA, ANULACION, CARGA_INICIAL, REPOSICION
- Rojo (`#ef4444`): salidas — SALIDA, TRASP_SALIDA, GARANTIA_SALIDA
- Violeta (`#8b5cf6`): ajustes — AJUSTE, AJUSTE_MASIVO

**Badge "⚠ Disc."**: aparece en ajustes originados por discrepancias de traspaso (sobrante, faltante, merma).

**Reversión de ajustes** (solo GERENTE): los movimientos de tipo AJUSTE o AJUSTE_MASIVO tienen un botón de reversa que crea un movimiento inverso automáticamente con nota "Reversa de ajuste: [motivo original]".

---

## Tipos de movimiento

| Tipo interno | Etiqueta UI | Origen |
|---|---|---|
| CARGA_INICIAL | Carga Inicial | Creación del producto |
| REPOSICION | Reposición | Registro de compra |
| ENTRADA | Entrada Manual | Ajuste manual entrada |
| SALIDA | Salida Manual | Ajuste manual salida |
| AJUSTE | Ajuste de Stock | Ajuste GERENTE desde Inventario |
| AJUSTE_MASIVO | Ajuste Masivo | Ajuste masivo desde Inventario |
| TRASP_SALIDA | Despacho TRF | Envío entre sucursales |
| TRASP_ENTRADA | Recepción TRF | Recepción de envío |
| TRASP_REVERSAL | Reversa TRF | Reversa de transferencia |
| ANULACION | Anulación Venta | Venta anulada |
| GARANTIA_SALIDA | Garantía Salida | Producto enviado por garantía |
| GARANTIA_ENTRADA | Garantía Entrada | Producto devuelto por garantía |

---

## Filtros del historial

Panel colapsable con las siguientes opciones:

- **Desde / Hasta**: rango de fechas (zona horaria Bolivia UTC-4)
- **Tipo de movimiento**: dropdown con todos los tipos internos
- **Sucursal**: selector de sucursal (solo en vista consolidada GERENTE)
- **Dirección**:
  - Todas las direcciones
  - Solo entradas (suma stock)
  - Solo salidas (resta stock)
  - Solo ajustes manuales
  - Solo ajustes por discrepancia
- **Responsable**: filtro de texto por nombre de usuario

Un indicador "!" en el header del panel señala que hay filtros activos. El botón "Limpiar filtros" los resetea todos.

---

## Exportación

- **Excel (.xlsx)**: incluye coloreado de filas por tipo (verde entradas, rojo salidas), fila de totales y formato monetario en columnas de costo.
- **CSV (;)**: formato delimitado por punto y coma, con BOM UTF-8 para compatibilidad con Excel.

El nombre del archivo incluye el código del producto, los filtros activos y la fecha de exportación.

---

## Restricciones de rol

- **VENDEDOR / ENCARGADO**: puede buscar productos y ver el historial. No ve valuación, costo ni puede revertir ajustes.
- **GERENTE**: acceso completo — valuación, costo por movimiento, CPP, reversión de ajustes, exportación completa y vista consolidada multi-sucursal.

---

## Consultas de datos con el asistente

El asistente puede consultar:

- `get_product_stock` → stock actual de un producto específico en tiempo real
- `get_kardex_movements` → últimos movimientos de un producto con detalle de tipo, cantidad y fecha
- `run_sql` → análisis histórico: totales por período, productos más movidos, comparativas entre sucursales

Ejemplos de preguntas:
- "¿Cuántas unidades de aceite 10W40 se vendieron este mes?" → `run_sql`
- "¿Cuál fue el último movimiento del producto X?" → `get_kardex_movements`
- "¿Qué stock tiene el filtro de aceite Fram ahora?" → `get_product_stock`
- "¿Cuántos ajustes negativos hubo en enero?" → `run_sql`
