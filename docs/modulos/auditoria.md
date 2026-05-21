# Módulo Auditoría — Consola Maestra de Trazabilidad

## ¿Qué es el módulo de Auditoría?

La Auditoría es la **consola de control e integridad** del sistema, exclusiva para el rol GERENTE y solo accesible desde la sucursal HQ (Casa Matriz). Registra automáticamente cada acción relevante del sistema: quién hizo qué, cuándo y desde qué sucursal. Incluye alertas automáticas de anomalías, log de acciones de administradores, discrepancias de transferencias y caja, movimientos de kardex y sesiones de cajero.

Acceso: menú **Control y Auditoría → Auditoría** (solo GERENTE en HQ).

---

## KPIs de cabecera

Cuatro indicadores siempre visibles al ingresar:

| KPI | Descripción |
|---|---|
| Alertas no leídas | Alertas del sistema pendientes de revisión. Incluye críticas destacadas. |
| Discrepancias | Alertas de tipo TRANSFER_DISCREPANCY, EXPENSE_LARGE u otras discrepancias activas. |
| Logs Totales | Total de entradas en el log de acciones de administradores cargadas en la sesión. |
| Sucursales | Número de sucursales siendo monitoreadas. También muestra vistas guardadas activas. |

---

## Cinco pestañas de trazabilidad

### ALERTS — Alertas del sistema

Alertas automáticas generadas por el sistema cuando detecta anomalías:

**Tipos de alerta:**
- `CASH_DISCREPANCY` — Diferencia entre caja física y sistema al cerrar turno
- `SECURITY` — Eventos de seguridad (accesos, cambios de contraseña, roles)
- `INVENTORY_THRESHOLD` — Producto por debajo del stock mínimo configurado
- `DISCOUNT_OVERRIDE` — Descuento aplicado por encima del límite autorizado
- `TRANSFER_DISCREPANCY` — Unidades recibidas ≠ unidades enviadas en un traspaso
- `TRANSFER_DISCREPANCY_RESOLVED` — Discrepancia de traspaso resuelta
- `SHIFT_OPEN_TOO_LONG` — Turno de caja abierto más tiempo del esperado
- `EXPENSE_DUPLICATE` — Gasto registrado que parece duplicado
- `EXPENSE_LARGE` — Gasto por encima del umbral configurado
- `ENVIO_CANCEL_APPROVED` / `ENVIO_CANCEL_REJECTED` — Decisión sobre cancelación de envío
- `FLETE_POR_PAGAR` — Costo de flete pendiente de pago

**Severidades:** CRITICAL (rojo), HIGH (naranja), MEDIUM (amarillo), LOW (gris)

**Estados:** No leído (pendiente de revisión) / Leído

Haz clic en cualquier alerta para ver su detalle completo con metadatos específicos.

### LOGS — Registro de acciones de administradores

Historial de todas las acciones realizadas por usuarios con rol GERENTE o ENCARGADO:

Campos por registro:
- **Usuario (email)**: quién realizó la acción
- **Acción**: tipo de operación (CREATE_PRODUCT, EDIT_PRICE, DELETE_CLIENT, VIEW_AUDIT_LOGS, etc.)
- **Sucursal**: desde qué sucursal se realizó
- **Detalle**: descripción de la operación con contexto
- **Fecha y hora**: timestamp exacto

Filtros disponibles: por usuario (email), por tipo de acción, por sucursal, por rango de fechas.

### DISCREPANCIES — Discrepancias

Subconjunto de alertas que corresponden a diferencias detectadas:
- Diferencias en traspasos (unidades enviadas ≠ recibidas)
- Gastos inusualmente grandes
- Cualquier alerta con mensaje que contenga "discrepancia"

Mismos filtros de severidad y estado que ALERTS.

### KARDEX — Todos los movimientos de stock

Vista consolidada de los últimos 1,000 movimientos de inventario de todas las sucursales. Útil para detectar patrones de ajustes manuales sospechosos o actividad inusual.

Filtros: por sucursal, búsqueda por producto, tipo de movimiento o motivo.

### CAJA — Sesiones de cajero

Historial de las últimas 500 sesiones de caja abiertas/cerradas en todas las sucursales:
- Cajero responsable
- Sucursal
- Fecha y hora de apertura/cierre
- Saldo inicial y final declarados
- Estado de la sesión

---

## Filtros globales

Panel de filtros aplicable en todas las pestañas:

- **Sede/Sucursal**: filtrar por sucursal específica o todas
- **Búsqueda de texto**: filtra por mensaje, usuario, acción, producto o cajero según la pestaña activa
- **Rango de fechas**: desde/hasta (zona horaria Bolivia UTC-4)
- **Acción** (solo LOGS): tipo de operación específica
- **Usuario** (solo LOGS): filtro por email del administrador
- **Severidad** (ALERTS/DISCREPANCIES): CRITICAL, HIGH, MEDIUM, LOW
- **Estado** (ALERTS/DISCREPANCIES): Todos, Pendientes (no leídos), Leídos

### Vistas guardadas

Guarda cualquier combinación de filtros con un nombre para reutilizarlos rápidamente. Ejemplo: "Discrepancias críticas HQ esta semana". Las vistas se guardan localmente en el navegador.

---

## Exportación

El botón **"Exportar Reporte"** descarga en CSV el contenido de la pestaña activa con los filtros aplicados. Formato UTF-8 compatible con Excel. Útil para auditorías externas o informes periódicos de gerencia.

---

## Restricciones de acceso

- Solo accesible para rol **GERENTE**
- Solo disponible desde la sucursal **HQ (Casa Matriz)**
- Los usuarios ENCARGADO y VENDEDOR no tienen acceso a este módulo

---

## Consultas con el asistente

El asistente puede consultar datos de auditoría en tiempo real:

- `get_audit_alerts` → alertas activas, no leídas, críticas o por tipo
- `run_sql` → análisis histórico (solo si los datos están en BigQuery)

Ejemplos de preguntas:
- "¿Cuántas alertas críticas hay sin leer?" → `get_audit_alerts`
- "¿Hay discrepancias de caja pendientes?" → `get_audit_alerts` con type=CASH_DISCREPANCY
- "¿Qué alertas generó la sucursal Norte esta semana?" → `get_audit_alerts`
- "¿Quién hizo ajustes de stock ayer?" → el asistente puede guiarte a filtrar en LOGS
