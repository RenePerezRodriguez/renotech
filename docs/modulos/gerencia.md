# Módulo Gerencia — Centro de Gerencia

## ¿Qué es el Centro de Gerencia?

Panel exclusivo para el rol **GERENTE** (solo desde la sucursal HQ). Centraliza todas las aprobaciones pendientes, gestión de discrepancias, políticas operativas y configuración de turnos remotos de todas las sucursales.

Acceso: menú **Control y Auditoría → Gerencia** (hqOnly, GERENTE).

---

## Panel de alertas pendientes (PendingBanner)

En la parte superior hay chips de colores que muestran el conteo en tiempo real de aprobaciones pendientes por categoría:

| Chip | Categoría | Color |
|---|---|---|
| Gastos | Gastos operativos sobre el umbral | Ámbar |
| Devoluciones | Anulaciones de venta que requieren autorización | Azul |
| Descuentos | Descuentos que superan el límite configurado | Morado |
| Cancelaciones | Pedidos y envíos con solicitud de cancelación activa | Rosa |
| Discrepancias | Diferencias de stock en recepciones de traspasos | Rosa |

Haz clic en un chip para navegar directamente a esa pestaña.

---

## Pestañas disponibles

### Gastos (approvals)
Lista de gastos operativos en estado **PENDING_APPROVAL** — creados por cajeros cuando el monto supera el umbral configurado en Políticas. Por cada gasto puedes:
- **Aprobar**: el gasto se registra y descuenta del balance de caja
- **Rechazar**: el gasto se cancela con una nota de rechazo visible al solicitante

### Devoluciones (voidApprovals)
Solicitudes de anulación de venta que el vendedor no puede procesar directamente. Muestra el motivo, el monto y el vendedor que solicitó la anulación. Aprobar anula la venta y devuelve el stock.

### Descuentos (discountApprovals)
Descuentos aplicados en punto de venta que superaron el porcentaje permitido al vendedor. Aprobación en línea — el vendedor ve la respuesta al instante.

### Cancelaciones
Solicitudes de cancelación activas para:
- **Pedidos de traspaso**: órdenes entre sucursales que aún no se despacharon
- **Envíos en tránsito**: cancelaciones de envíos ya en camino (requiere coordinación con transporte)

### Discrepancias
Diferencias de cantidad detectadas al recibir un traspaso (lo que llegó ≠ lo que se despachó). El gerente decide si ajustar el stock del origen o aceptar la diferencia.

### Turnos remotos (remoteShifts)
Control de sesiones de caja abiertas en sucursales remotas. Permite cerrar sesiones de cajeros que dejaron caja abierta sin completar el arqueo.

### Políticas
Configura los límites operativos de todas las sucursales:
- Monto máximo de gasto sin aprobación gerencial
- Porcentaje máximo de descuento que puede aplicar un vendedor sin aprobación
- Límites por categoría de gasto

### Información
Resumen del sistema, versión, sucursales activas y estadísticas generales de configuración.

---

## Flujo típico de aprobación

1. Un cajero crea un gasto mayor al umbral → aparece en el chip **Gastos** con el contador
2. El gerente abre la pestaña Gastos → ve la solicitud con detalle (monto, categoría, descripción, solicitante)
3. Aprueba o rechaza con nota → el sistema registra la decisión y notifica al cajero en tiempo real
4. Todo queda en el historial de auditoría con trazabilidad completa

---

## Restricciones de acceso

- Solo accesible para rol **GERENTE**
- Solo disponible desde la sucursal **HQ (Casa Matriz)**
- Los encargados de sucursal no tienen acceso a este módulo
- Las decisiones de aprobación quedan registradas con nombre, hora y sucursal del gerente

---

## Datos en tiempo real

El módulo usa suscripciones en tiempo real (Firestore onSnapshot) para los contadores del PendingBanner. Los números se actualizan sin recargar la página cuando llegan nuevas solicitudes o cuando se procesan las existentes.
