# Módulo Pedidos — Solicitudes de Reabastecimiento Entre Sucursales

## ¿Qué es el módulo de Pedidos?

El módulo de Pedidos gestiona las solicitudes de reabastecimiento de mercancía entre sucursales. Una sucursal que necesita productos los solicita a otra (generalmente Casa Matriz) mediante un pedido. El pedido es revisado y, si se aprueba, se despacha como un Envío que el solicitante confirma al recibirlo.

> **Diferencia clave**: un **pedido** es la solicitud; el **envío** es el despacho físico. Son dos módulos distintos pero relacionados.

## Vistas del módulo

- **Emitidos**: pedidos que creó esta sucursal (solicitudes que hizo)
- **Entrantes**: pedidos que otras sucursales hicieron a esta sucursal (que esta sucursal debe despachar)

## Estados de un pedido

| Estado | Descripción |
|--------|-------------|
| **Borrador** | Creado pero no enviado. Aún editable. |
| **Vigente** | Enviado y en espera de despacho. No editable. |
| **Despachado** | La otra sucursal lo despachó como envío. |
| **Cancelado** | Pedido anulado (requiere aprobación del gerente HQ). |

## Cómo crear un pedido

1. Haz clic en **"Nuevo Pedido"**.
2. Selecciona la **sucursal destino** (a quién le pides).
3. Agrega los productos y cantidades que necesitas.
4. Opcionalmente ingresa una **fecha requerida** y una **nota de urgencia**.
5. Guarda como **Borrador** para revisarlo, o **Valida** para enviarlo directamente.

Al validar el pedido queda en estado **Vigente** y la sucursal destino puede verlo en su pestaña de Entrantes.

## Flujo completo de un pedido

1. Sucursal A crea pedido (Borrador → Vigente)
2. Sucursal B ve el pedido en Entrantes → lo despacha como **Envío**
3. Sucursal A ve el envío en el módulo de Envíos → lo confirma al recibirlo
4. El stock de Sucursal A se actualiza automáticamente

## Cancelar un pedido

Un pedido **Vigente** puede solicitarse cancelar. La cancelación final requiere aprobación del gerente HQ. El pedido en **Borrador** se puede eliminar directamente.

## ¿Qué puede consultar el asistente?

**Tiempo real (Firestore):**
- "¿Tengo pedidos pendientes?" → `get_pending_orders` (borrador + vigente)
- "¿Qué pedidos llegaron sin despachar?" → `get_pending_orders` (direction: entrantes, status: vigente)
- "¿Hay pedidos en borrador?" → `get_pending_orders` (status: borrador)
- "¿Cuántos pedidos tenemos pendientes de despacho?" → `get_pending_orders`

**Análisis histórico (SQL):**
- Los pedidos no están actualmente en BigQuery — consultar con `get_pending_orders` para datos en tiempo real.

## Restricciones de rol

- **VENDEDOR / ENCARGADO**: puede crear, ver y gestionar pedidos de su sucursal.
- **GERENTE HQ**: además puede ver todos los pedidos entrantes a Casa Matriz y aprobar cancelaciones.
