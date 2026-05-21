# Módulo Punto de Venta (POS)

## ¿Qué es el Punto de Venta?

El Punto de Venta es el módulo para registrar ventas en tiempo real. Permite buscar productos, armar el carrito, seleccionar el cliente, elegir el método de pago y confirmar la venta. Al confirmar, el sistema descuenta stock, actualiza la caja, registra en el Kardex y genera el ticket automáticamente.

## Cómo registrar una venta (contado)

1. **Buscar el producto**: escribe el nombre, código interno, código de fábrica o escanea el código de barras en la barra de búsqueda. Atajo: `F3` para enfocar el buscador.
2. **Agregar al carrito**: haz clic en el producto. Puedes hacer clic varias veces para aumentar la cantidad, o cambiarla directamente en el carrito.
3. **Ajustar cantidades y descuentos**: en el carrito puedes editar la cantidad de cada línea, aplicar un descuento por ítem (porcentaje o monto fijo) o eliminar un producto con la X.
4. **Seleccionar cliente** (opcional): si el cliente está registrado, búscalo para asociar la venta a su historial. Para ventas ocasionales puedes omitirlo.
5. **Método de pago**: elige **Efectivo**, **QR** o **Mixto** (parte efectivo + parte QR). En efectivo, ingresa el monto recibido para que el sistema calcule el vuelto.
6. **Confirmar**: presiona el botón de cobro o usa `F9` desde el teclado.

## Cómo registrar una venta a crédito (cuotas)

1. Agrega los productos al carrito normalmente.
2. **Debes seleccionar el cliente** — el crédito requiere un cliente registrado con crédito habilitado y saldo disponible.
3. En método de pago, elige **Crédito**.
4. Selecciona el número de cuotas (1 a 12). El sistema calcula el monto por cuota y las fechas automáticamente.
5. Opcionalmente registra un **adelanto** si el cliente paga algo ahora — ese monto se descuenta del total a financiar.
6. Confirma. Las cuotas quedan registradas en el módulo de Créditos.

## Atajos de teclado

- `F3` — enfocar barra de búsqueda de productos
- `F9` — confirmar y cobrar la venta
- `2x` (prefijo numérico) — escribir `2` antes de buscar agrega 2 unidades del producto directamente al carrito

## Prefijo de cantidad

Escribe un número (ej: `3`) antes de buscar un producto para agregar esa cantidad de una vez. El indicador amarillo `3x` aparece en la barra de búsqueda cuando el prefijo está activo.

## Escaneo de código de barras / QR

El ícono de QR en la barra de búsqueda abre el escáner de cámara. También funciona con lectores físicos de código de barras conectados al equipo — el foco en el buscador captura el escaneo automáticamente.

## Descuentos

Puedes aplicar descuentos por línea de producto directamente en el carrito. El descuento puede ser un porcentaje o un monto fijo en Bs. El total se recalcula en tiempo real.

## ¿Qué pasa al confirmar una venta?

- El stock de cada producto se descuenta automáticamente
- Se registra un movimiento en el Kardex de cada producto
- El monto ingresa a la caja activa del turno
- Se genera el ticket/recibo de la venta
- La venta aparece en el historial del módulo Ventas

## ¿Qué datos puede consultar el asistente aquí?

El asistente puede responder preguntas como:
- "¿Cuánto vendimos hoy / ayer / esta semana?" → resumen de ventas del período
- "¿Cuáles son los productos más vendidos?" → top 5 por cantidad (últimos 7 días)
- "¿Cuántas ventas en efectivo vs QR tuvimos este mes?" → desglose por método de pago vía SQL
- "¿Hay stock de [producto]?" → stock actual en tiempo real
- "¿Cuánto vendimos en crédito vs contado?" → consulta SQL sobre v_ventas

## Restricciones de rol

- **VENDEDOR**: puede registrar ventas normalmente. No puede ver datos de otras sucursales ni reportes financieros.
- **ENCARGADO** y **GERENTE**: igual acceso al POS, con visibilidad adicional de reportes según su rol.
