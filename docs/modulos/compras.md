# Módulo Compras — Registro de Compras a Proveedores

## ¿Qué es el módulo de Compras?

El módulo de Compras registra las entradas de mercadería al negocio. Cada compra actualiza automáticamente el stock de la sucursal y genera un movimiento en el Kardex de cada producto con tipo **"Reposición"**.

## Información de cada compra

- **Proveedor**: empresa o persona que suministra la mercadería (seleccionado del directorio de Proveedores)
- **Fecha**: fecha de la compra (puede ser hoy o la fecha real de la factura)
- **Productos**: listado de ítems con cantidad y costo unitario
- **Total**: suma de (cantidad × costo) de todos los productos
- **Método de pago**: Efectivo, Transferencia, QR o Crédito al proveedor
- **Estado**: Recibida (stock ingresado) o Pendiente

## KPIs del módulo (vista principal)

- **Total invertido**: suma de todas las compras registradas en el período
- **Total compras**: número de compras registradas
- **Recibidas**: compras ya procesadas y con stock ingresado
- **Promedio por compra**: total invertido ÷ número de compras

## Cómo registrar una compra

1. Haz clic en **"Nueva Compra"** (botón en la barra superior).
2. **Selecciona el proveedor** en el panel izquierdo. Si no existe, primero créalo en el módulo de Proveedores.
3. Confirma o ajusta la **fecha** de la compra.
4. En el panel derecho, **busca los productos** por nombre o código y haz clic para agregarlos al carrito.
5. Ajusta la **cantidad** y el **costo unitario** de cada ítem en el carrito.
6. Elige el **método de pago**: Efectivo, Transferencia, QR o Crédito. Si hay crédito al proveedor, define la fecha de vencimiento.
7. Haz clic en **"Registrar Entrada"** para confirmar.

Al confirmar, el stock de cada producto aumenta en la sucursal y el Kardex registra la entrada como "Reposición".

## Métodos de pago en compras

- **Efectivo**: descuenta el monto de la caja abierta. Requiere caja con saldo suficiente.
- **Transferencia**: registra el número de transferencia o banco (obligatorio si está configurado).
- **QR**: registra el número de comprobante QR.
- **Crédito al proveedor**: suma el monto al saldo pendiente del proveedor. Define cuándo vence.

## Filtros y búsqueda

La vista principal permite filtrar por:
- Proveedor o código de producto (barra de búsqueda)
- **Estado**: Recibidas / Pendientes
- **Método de pago**: Efectivo, Transferencia, QR, Crédito
- **Rango de fechas**
- **Ordenar**: por fecha (más nuevo/viejo) o por total (mayor/menor)

## Efecto en el inventario

Cada compra registrada con estado "Recibida" aumenta el stock de los productos en la sucursal activa. El Kardex muestra cada entrada con tipo "Reposición" y el costo unitario pagado.

## ¿Qué puede consultar el asistente?

**Tiempo real (Firestore):**
- "¿Cuáles son las últimas compras?" → `get_recent_purchases`
- "¿Qué compramos esta semana?" → `get_recent_purchases` con limit
- "¿Cuántas compras hay pendientes?" → `get_recent_purchases` con status: PENDING
- "¿Cuántos proveedores tenemos?" → `get_entity_counts` (type: suppliers)

**Análisis histórico (SQL):**
- Las compras no están actualmente en BigQuery — usar `get_recent_purchases` para datos en tiempo real.

## Restricciones de rol

- **VENDEDOR**: no tiene acceso al módulo de Compras.
- **ENCARGADO**: puede ver y registrar compras de su sucursal.
- **GERENTE**: acceso completo — ver todas las sucursales, registrar y eliminar compras.
