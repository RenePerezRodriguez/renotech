# Módulo Cotizaciones

## ¿Qué es una cotización?

Una cotización es un presupuesto o proforma que se entrega al cliente antes de confirmar la venta. **No descuenta stock ni registra ninguna venta** — es solo una propuesta de precio con validez temporal. Si el cliente acepta, se convierte en venta con un clic y recién ahí el stock se descuenta.

## Cómo crear una cotización

1. Ve a **Cotizaciones → Nueva Cotización** desde el menú lateral, o accede directamente desde `/cotizaciones/nueva`.
2. **Busca y agrega productos**: usa la barra de búsqueda (nombre o código). Haz clic en el producto para agregarlo al panel derecho. Puedes ajustar cantidades y aplicar descuentos por línea.
3. **Selecciona el cliente**: es obligatorio. Búscalo por nombre o carnet en el botón "Seleccionar Cliente".
4. **Configura la cotización**:
   - **Días de validez**: cuántos días tiene vigencia (ej: 7, 15, 30 días). Obligatorio.
   - **Modo C/F o S/F**: con factura o sin factura — cambia los precios si el producto tiene precios diferenciados.
   - **Notas**: observaciones opcionales que aparecen en la proforma impresa.
5. **Generar**: presiona "Generar Cotización" o usa `F8`. El sistema imprime la proforma automáticamente (PDF) y guarda la cotización en el historial.

## Convertir una cotización en venta

1. Ve al historial de cotizaciones (menú lateral → **Cotizaciones**).
2. Abre la cotización que el cliente aceptó.
3. Haz clic en **"Convertir a Venta"** — los productos pasan al Punto de Venta automáticamente con los mismos precios y cantidades.
4. Completa el pago en el POS normalmente.

## Estados de una cotización

- **PENDING**: en espera de respuesta del cliente
- **CONVERTED**: ya fue convertida en venta
- **CANCELLED**: anulada manualmente (no puede revertirse)
- **EXPIRED**: la fecha de validez pasó sin convertirse

## Funciones adicionales

- **Imprimir / reimprimir**: desde el historial puedes imprimir cualquier cotización nuevamente.
- **Descarga CSV**: exporta el historial de cotizaciones a hoja de cálculo.
- **Filtros**: filtra por estado (pendiente, convertida, vencida, cancelada) y por fecha.
- **Offline**: puedes crear cotizaciones sin conexión — se guardan localmente y se sincronizan al reconectarse.

## Atajos de teclado

- `F2` — enfocar barra de búsqueda de productos
- `F8` — generar/guardar la cotización
- `Escape` — limpiar búsqueda

## ¿Qué puede consultar el asistente aquí?

El asistente puede responder:
- "¿Cuántas cotizaciones tengo pendientes?" → lista cotizaciones con estado PENDING
- "¿Cuáles cotizaciones están por vencer?" → cotizaciones cuya fecha de validez está próxima
- "¿Cuántas cotizaciones se convirtieron en venta este mes?" → conteo de conversiones
- "¿Cuál es la tasa de conversión de cotizaciones?" → convertidas vs. total del período
- "Muéstrame las cotizaciones de [cliente]" → historial por cliente

## Restricciones de rol

- **VENDEDOR**: puede crear cotizaciones y ver las de su sucursal.
- **ENCARGADO** y **GERENTE**: acceso completo incluyendo anulación y vista de todas las sucursales.
