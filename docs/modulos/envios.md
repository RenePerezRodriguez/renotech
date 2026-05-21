# Módulo Envíos — Transferencias de Stock Entre Sucursales

## ¿Qué es el módulo de Envíos?

El módulo de Envíos gestiona el movimiento físico de mercancía entre sucursales. Un envío transfiere unidades de stock: al crearlo, el stock **sale** de la sucursal origen inmediatamente y queda en estado "en tránsito" hasta que la sucursal destino lo **confirma al recibirlo**, momento en que el stock se acredita en destino.

> **Diferencia con Pedidos**: el Pedido es la solicitud; el Envío es el despacho físico. Un pedido aprobado genera un envío.

## Vistas del módulo

- **Salientes**: envíos que esta sucursal está despachando o ya despachó
- **Entrantes**: envíos que otras sucursales mandaron y que esta sucursal debe confirmar

## Estados de un envío

| Estado | Descripción |
|--------|-------------|
| **En preparación** | Creado, stock ya descontado de origen. Aún no salió físicamente. |
| **En tránsito** | Marcado como despachado. Esperando confirmación en destino. |
| **Recibido** | La sucursal destino confirmó la recepción. Stock acreditado. |
| **Cancelado (devolución)** | Envío cancelado y stock devuelto al origen. |
| **Cancelado (pérdida)** | Cancelado sin devolución de stock (mercancía perdida o robada). |

## Cómo crear un envío directo

1. Haz clic en **"Envío directo"** en la esquina superior derecha.
2. Selecciona la **sucursal destino**.
3. Agrega los productos y la **cantidad a transferir**. El sistema verifica que haya stock disponible.
4. Opcionalmente asigna un **transportista** y el **costo del flete** (pagado o por pagar).
5. Confirma. El stock sale de tu sucursal inmediatamente.

## Cómo confirmar un envío entrante

1. Ve a la pestaña **Entrantes**.
2. Busca el envío en estado "En tránsito".
3. Haz clic para abrirlo y revisa los ítems.
4. Confirma la recepción. Si hay diferencias (cantidad recibida ≠ enviada), registra la **discrepancia** con nota justificativa.
5. El stock se acredita en tu sucursal automáticamente.

## Discrepancias

Si al recibir un envío las cantidades no coinciden, el sistema registra una discrepancia. El gerente puede **aprobarla** (acepta la diferencia) o **rechazarla** (el envío vuelve a revisión). Las discrepancias quedan visibles con un badge de alerta en la lista.

## Fletes y transporte

Los fletes son los costos de transporte de los envíos. Pueden ser:
- **Pagados**: ya se pagó al despachar
- **Por pagar**: se abona al recibir en destino

Desde el botón **"Fletes"** en el header del módulo puedes ver el historial de costos de transporte.

## Envío vinculado a pedido

Si una sucursal hizo un **Pedido** y fue aprobado, el envío se crea automáticamente vinculado al código del pedido. En la lista aparece el ID del pedido relacionado.

## ¿Qué puede consultar el asistente?

**Tiempo real (Firestore):**
- "¿Qué envíos tengo pendientes de recibir?" → `get_pending_transfers` (direction: incoming)
- "¿Qué envíos salieron sin confirmar?" → `get_pending_transfers` (direction: outgoing)
- "¿Hay envíos en tránsito?" → `get_pending_transfers`

**Análisis histórico (SQL):**
- Los envíos no están actualmente en BigQuery — usar `get_pending_transfers` para datos en tiempo real.

## Restricciones de rol

- **VENDEDOR / ENCARGADO**: puede crear envíos, ver salientes e entrantes de su sucursal, y confirmar recepciones.
- **GERENTE**: además puede ver todas las sucursales en modo consolidado, gestionar discrepancias y cancelar envíos con devolución o pérdida.
