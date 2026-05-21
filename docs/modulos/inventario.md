# Módulo Inventario — Gestión de Stock y Catálogo

## ¿Qué es el módulo de Inventario?

El módulo de Inventario es la fuente de verdad del stock de la empresa. Muestra todos los productos del catálogo maestro con sus existencias actuales, precios, stock mínimo y ubicación física. Desde aquí se consulta disponibilidad, se registran productos nuevos, se hacen ajustes y se accede al Kardex de cada producto.

## KPIs de cabecera

- **Activos totales**: total de productos con stock mayor a cero en la sucursal
- **Patrimonio**: valor total del inventario (stock × costo de cada producto)
- **Stock crítico**: productos por debajo de su stock mínimo configurado
- **Quiebres**: productos con stock en cero (sin existencias)

## Cómo consultar el stock de un producto

1. Usa la barra de búsqueda para encontrar el producto por **nombre, código, código de fábrica, OEM, marca o categoría**.
2. La tabla muestra el stock actual:
   - **Rojo**: sin stock (quiebre)
   - **Ámbar**: por debajo del stock mínimo (alerta)
   - **Verde**: stock normal
3. Haz clic en el código del producto para ir a su **Kardex**: historial completo de entradas, salidas, ajustes y transferencias con fechas y responsables.

## Filtros disponibles

- **Búsqueda de texto**: nombre, código, OEM, marca, categoría
- **Estado**: Todos / Con stock / Sin stock / Stock bajo
- **Categoría**: filtrar por categoría de producto
- **Sucursal**: en vista consolidada, comparar stock entre sucursales

## Cómo registrar un nuevo producto (solo GERENTE)

Solo el gerente puede crear productos. El producto se crea en el **catálogo maestro** y queda disponible para todas las sucursales.

1. Haz clic en **"Nuevo Activo"** en la esquina superior derecha.
2. Completa los datos básicos:
   - **Nombre** y **código** (o lo genera automáticamente)
   - **Categoría**, **unidad de medida** (pieza, litro, kg, etc.), **marca** y **país de origen**
3. Ingresa **código de fábrica** y **código OEM** si existen — son clave para encontrar el producto en el POS.
4. Define los precios: **costo de compra**, **precio con factura**, **precio sin factura**, **precio mayorista**.
5. Ingresa el **stock inicial** (unidades disponibles ahora) y el **stock mínimo** (umbral de alerta).
6. Guarda. El sistema registra el primer asiento en el Kardex automáticamente.

## Kardex de producto

El Kardex es el historial contable del stock de un producto. Muestra cada movimiento con:
- Fecha y hora
- Tipo de movimiento (venta, compra, ajuste, transferencia enviada/recibida)
- Cantidad entrada o salida
- Stock resultante
- Responsable

Acceso: clic en el código del producto en la tabla de inventario.

## Ajuste de stock

Si el conteo físico difiere del sistema, el gerente puede registrar un **ajuste de inventario**: positivo (ingresa mercancía) o negativo (retira). El ajuste queda en el Kardex con nota justificativa.

## Exportar

El botón **"Exportar"** descarga el inventario completo en Excel: todos los productos con stock, precios, costo, mínimo y categoría.

## ¿Qué puede consultar el asistente?

**Tiempo real (Firestore):**
- "¿Cuánto stock hay de [producto]?" → `get_product_stock` (stock de un producto específico)
- "¿Qué productos están agotados?" → `get_low_stock_products` (stock bajo o en cero)
- "¿Qué hace falta comprar?" → `get_low_stock_products`
- "¿Cuántos productos tenemos?" → `get_product_counts`

**Análisis histórico (SQL):**
- "¿Cuáles son los 10 productos más vendidos este mes?" → `run_sql` sobre `v_ventas_items` con GROUP BY product_name
- "¿Cuál es el margen promedio del catálogo?" → `run_sql` sobre `v_catalogo` con precio vs costo
- "Productos sin ventas en los últimos 90 días" → `run_sql` cruzando `v_catalogo` y `v_ventas_items`
- "¿Cuántas unidades de [producto] se vendieron este trimestre?" → `run_sql` filtrando por product_name

## Restricciones de rol

- **VENDEDOR / ENCARGADO**: puede consultar stock y ver el Kardex. No puede crear ni editar productos.
- **GERENTE**: acceso completo — crear, editar, ajustar stock y exportar. Solo puede crear productos en la sucursal HQ.
