# 🛡️ Infraestructura y Seguridad: Renotech

Este documento detalla la capa de protección y el rendimiento subyacente del sistema. Es la "Sala de Máquinas" que garantiza que los datos estén seguros y las consultas sean instantáneas.

---

## 1. Arquitectura de Almacenamiento (Firebase Storage)

Los archivos binarios se organizan para evitar colisiones y facilitar limpiezas automáticas.

| Carpeta | Contenido | Regla de Acceso |
| :--- | :--- | :--- |
| `/products/{masterId}/` | Imágenes del repuesto y PDFs técnicos. | Lectura-Pública / Escritura-Admin. |
| `/clients/{clientId}/` | Documentos del NIT o contratos de crédito. | Solo Gerencia y Admin. |
| `/backups/` | Exportaciones mensuales en JSON/CSV. | Solo Administrador Global. |
| `/temp/` | Archivos temporales de importación Excel. | Auto-limpieza cada 24h. |

---

## 2. Requerimientos de Indexación (Performance Logic)

Para que el BI y los filtros de sucursal funcionen a velocidad luz, Firestore requiere los siguientes **Índices Compuestos**:

1.  **Colección `ventas`**:
    *   `branchId` (ASC) + `fecha` (DESC). *Para el histórico de ventas local.*
    *   `status` (ASC) + `fecha` (DESC). *Para reportes de auditoría de anulaciones.*
2.  **Colección `movimientos`**:
    *   `productId` (ASC) + `date` (DESC). *Para el Kardex rápido por producto.*
    *   `branchId` (ASC) + `date` (DESC). *Para el flujo de stock diario por sucursal.*
3.  **Colección `catalogo_maestro`**:
    *   `categoriaId` (ASC) + `nombre` (ASC). *Para la navegación por categorías.*

---

## 3. Política de Seguridad "Zero-Trust" (Firestore Rules)

El corazón de la seguridad de Renotech es el **Aislamiento por `branchId`**:

*   **Identidad**: Cada solicitud `request.auth.token` debe contener el `branchId` del usuario.
*   **Regla Global de Operación**: 
    ```javascript
    match /productos/{product} {
      allow read, write: if request.auth.token.branchId == resource.data.branchId 
                         || request.auth.token.role == 'GERENTE';
    }
    ```
*   **Aislamiento de Caja**: Solo el usuario que abrió el turno (`arqueos_caja.userId`) puede registrar movimientos en su propia sesión.

---

## 4. Estrategia de Respaldo y Recuperación (DRP)

1.  **Backup Diario**: Exportación automática de las 17 colecciones a un bucket de Storage externo.
2.  **Admin Logs Inmutables**: Los registros en `admin_logs` y `movimientos` (Kardex) no tienen método `delete` expuesto en la API, protegiendo contra manipulaciones malintencionadas.

---

## 🔒 5. Eventos de Alarma (Alerta de Auditoría)

El sistema genera documentos en `alertas_auditoria` de forma automática ante los siguientes disparadores:

1.  **Discrepancia de Stock**: Si un ajuste manual (`AJUSTE`) supera el 10% del stock total del producto. (Gravedad: ALTA).
2.  **Discrepancia en Transferencia**: Si `receivedQuantity ≠ quantity` en recepción de traspaso. (Gravedad: MEDIA).
    *   Se genera automáticamente con `discrepancyReason` ingresado.
    *   Notifica al Gerente General para auditoría.
3.  **Cierre de Caja Inconsistente**: Si el `startAmount` + `movements` no coincide con el `endAmount` declarado por más de Bs. 50. (Gravedad: MEDIA).
4.  **Acceso de Rol Inválido**: Intentos de escritura en el Catálogo Maestro desde un usuario con rol `VENDEDOR`. (Gravedad: CRÍTICA).
5.  **Stock Crítico**: Cuando un producto llega a 0 en una sucursal con alta demanda histórica. (Gravedad: BAJA).
6.  **Transferencia Expirada**: Cuando una transferencia permanece en estado `PENDING` o `APPROVED` por más de 7 días (configurable en `config_global`). (Gravedad: MEDIA).
    *   Campo: `stockTransfers.expiresAt` vs `now()`.
    *   Acción recomendada: Revisar y cancelar o reactivar.
7.  **Descuento Excesivo** (`DISCOUNT_OVERRIDE`): Cuando un operador aplica un descuento que supera el 20% del precio base o reduce el precio final por debajo del 70% del original. (Gravedad: ALTA).
    *   Metadata: `{ productId, productCode, discountType, discountValue, originalPrice, finalPrice }`.
    *   Generado automáticamente desde `PosCart` via `AuditAlertService.createAlert()`.
    *   Descuentos menores al umbral generan alerta con severidad `MEDIUM` para trazabilidad.

---

## ☁️ 6. Programación y Automatización (On-Demand / Cloud Functions)

Las siguientes tareas pesadas se ejecutan bajo demanda desde el panel administrativo. En una fase futura, pueden migrarse a Cloud Functions para automatización completa:

1.  **Recálculo ABC**: Se ejecuta desde el panel de Configuración vía `InventoryService.recalculateABC(branchId)`. Analiza los últimos 30 días de movimientos y actualiza `abcClassLocal`.
2.  **Snapshots Diarios**: Se generan on-demand desde la pestaña de Mantenimiento vía `MaintenanceService` / `StatisticsService`.
3.  **Limpieza de Storage**: Pendiente de migración a Cron Job automático. Actualmente se realiza manualmente desde `/temp/`.
4.  **Validación de Transferencias Expiradas**: Se ejecuta diariamente (idealmente vía Cloud Scheduler). 
    *   Busca `stockTransfers` donde `status IN (PENDING, APPROVED)` y `expiresAt < now()`.
    *   Genera automáticamente alertas en `alertas_auditoria`.
    *   Recomendación para Gerencia: Revisar y decidir si cancelar o extender.

> **Nota de Evolución**: Para Cloud Functions, implementar:
> - Trigger Firestore `onCreate` en `ventas` para el ABC incremental.
> - Cloud Scheduler cron job (`0 2 * * *`) para snapshots nocturnos.
> - Cloud Scheduler cron job (`0 3 * * *`) para validación de transferencias expiradas.
> - Firestore Trigger `onChange` en `stockTransfers` para generar alertas de discrepancia automáticamente.
> - **Validador de Descuentos**: Trigger `onCreate` en `ventas/{id}/items` que detecte `discountValue` y valide contra `config_global.maxDiscountPercentage`. Si excede, auto-crear `alertas_auditoria` como segundo nivel de protección (server-side).

---

## 📡 7. Resiliencia Offline (Cola de Ventas)

El POS implementa una estrategia de resiliencia ante pérdida de conexión:

1.  **Almacenamiento**: `localStorage` bajo clave `renotech_offline_queue`. NO es una colección de Firestore.
2.  **Auto-Sincronización**: Hook `useOfflineQueue` escucha evento `online` del navegador + polling cada 60 segundos.
3.  **Reintentos**: Máximo 5 intentos por venta encolada. Tras agotar reintentos, se descarta (dato stale).
4.  **Riesgo Aceptado**: Pérdida de datos si usuario limpia `localStorage` antes de reconectar. Es un trade-off aceptable vs. no poder vender offline.
5.  **Patrón**: Eventual Consistency — prioriza disponibilidad del POS sobre consistencia inmediata.
6.  **Evolución futura**: Migrar a IndexedDB para mayor capacidad y persistencia, o a colección `offline_queue` en Firestore para redundancia cloud.
