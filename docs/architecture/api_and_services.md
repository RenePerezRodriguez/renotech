# 🗺️ Mapa de Servicios y API: Renotech

Este documento mapea la lógica del código (Frontend) con la nueva estructura de datos (Backend). Define qué servicios son responsables de cada colección y cómo interactúan entre sí.

---

## 🛠️ 1. Servicios de Dominio (Core Services)

### 1.1 `MasterCatalogService`
Responsable de la colección `catalogo_maestro`.
*   `getAll()`: Obtiene la lista completa de productos (Fichas Únicas).
*   `getById(id)`: Obtiene el detalle técnico.
*   `create(productData)`: Crea un nuevo producto global.

### 1.2 `InventoryService`
Responsable de la colección `productos` (Stock Local).
*   `getByBranch(branchId)`: Obtiene el stock disponible en una sucursal específica.
*   `adjustStock(productId, qty, reason)`: Realiza un ajuste manual y dispara el **Kardex**.
*   `updateLocation(productId, rack)`: Cambia la ubicación física en almacén.

### 1.3 `CrossBranchInventoryService`
Responsable de la búsqueda federada nacional.
*   `getGlobalProductStock(masterId)`: Consulta en paralelo todas las sucursales para un mismo ítem.
*   `getBranchStocks(masterId)`: Retorna un desglose de existencias por nodo.

### 1.4 `SaleService`
Responsable de `ventas` e `items_venta`.
*   `createSale(sale, branchId, adminInfo?, cashMovement?, splitCashMovements?, installments?)`: Orquesta la venta completa en una transacción Firestore con 3 fases (ALL READS → VALIDATION → ALL WRITES).
    *   **Parámetros extendidos**:
        *   `splitCashMovements?: { cash: CashMovement; qr: CashMovement }` — Para ventas MIXTO, genera 2 movimientos de caja separados.
        *   `installments?: number` — Para ventas CUOTAS, genera N documentos en `cuentas_corrientes`.
    *   **MIXTO**: Guarda `splitCash` y `splitQR` en la cabecera. Crea 2 `movimientos_caja`.
    *   **CUOTAS**: Crea N documentos en `cuentas_corrientes` con cuotas mensuales. Incrementa `saldoDeudor` del cliente.
*   `voidSale(saleId)`: Anula la venta y revierte el stock (vía Kardex).

### 1.5 `InstallmentService`
Responsable de la colección `cuentas_corrientes` (cuotas individuales).
*   `getByBranch(branchId?)`: Obtiene todas las cuotas de una sucursal, ordenadas por fecha de vencimiento.
*   `getByClient(clientId)`: Obtiene las cuotas de un cliente específico.
*   `registerPayment(installmentId, amount, method, userId, userName, branchId, notes)`: Cobra una cuota (parcial o total). En una transacción atómica:
    *   Actualiza `remainingBalance` y `status` de la cuota.
    *   Reduce `saldoDeudor` y `balance` del cliente.
    *   Genera `INGRESO` en `movimientos_caja` con categoría `COBRO_CUOTA`.
    *   Registra entrada en `logs_auditoria`.
*   `markOverdue(branchId?)`: Escanea cuotas PENDING con `dueDate < hoy` y las marca como `OVERDUE`.

### 1.5 Descuentos (Integrado en `usePosStore` + `AuditAlertService`)
No es un servicio separado; la lógica de descuentos vive en el store de POS y se audita via alertas.
*   `usePosStore.applyDiscount(productId, type, value, userId, userEmail)`: Aplica descuento porcentual o precio fijo al CartItem. Calcula `fixedPrice` y almacena metadata de descuento (`type`, `value`, `originalPrice`, `appliedBy`, `appliedAt`).
*   `usePosStore.removeDiscount(productId)`: Elimina el descuento y revierte al precio original.
*   `SalesLogic.mapCartToSaleItems()`: Propaga `discountType`, `discountValue`, `originalPrice`, `discountAppliedBy` del carrito al SaleItem para persistencia en Firestore.
*   **Auditoría**: Si el descuento supera 20% o el precio final es menor al 70% del original, `PosCart` genera automáticamente una `alertas_auditoria` tipo `DISCOUNT_OVERRIDE` con severidad `HIGH` via `AuditAlertService.createAlert()`.

---

## 🚛 2. Logística y Suministro (Supply Chain)

### 2.1 `StockTransferService`
*   `createTransfer(data)`: Inicia un traspaso entre sucursales. **Requiere rol**: GERENTE o superior.
    *   Parámetros: `fromBranchId`, `toBranchId`, `items[]` (con masterId, productId, quantity).
    *   Establece automáticamente: `expiresAt = requestedAt + config_global.transferExpirationDays`.
    *   Retorna: transferencia en estado `PENDING` (sin descuento de stock).
*   `approveTransfer(transferId)`: Autoriza la salida de mercadería. **Requiere rol**: GERENTE de sucursal de origen o SUPER_ADMIN.
    *   **Transacción Atómica**: Descuenta stock en origen, crea Kardex TRASP_SALIDA, cambia a APPROVED.
    *   **También establece**: `expiresAt = requestedAt + 7 días` (configurable vía `config_global.transferExpirationDays`).
    *   Validación: Stock debe existir y `productId` + `masterId` válidos en sucursal origen; si no, retorna error.
*   `receiveTransfer(transferId, receivedItems[])`: Confirma la entrada en destino. **Requiere rol**: GERENTE de sucursal destino o SUPER_ADMIN.
    *   Parámetros: Array de objetos con `productId`, `receivedQuantity`, `discrepancyReason` (si aplica).
    *   **Transacción Atómica**: Suma stock en destino, crea Kardex TRASP_ENTRADA, cambia a COMPLETED.
    *   Validación Integridad: Verifica `masterId` en cada item; rechaza si no existe o no coincide con `productId` origen.
    *   Validación Diferencias: Si `receivedQuantity ≠ quantity`, marca `isAdjusted: true`, genera alerta (Gravedad: MEDIA) y crea `movimientos` TIPO "AJUSTE" automáticamente.
*   `undoReceive(transferId)`: Revierte una recepción completada. **Requiere rol**: GERENTE destino o SUPER_ADMIN.
    *   Marca `isUndone: true`, resta stock de destino, vuelve a APPROVED.
*   `cancelTransfer(transferId, rejectionReason)`: Cancela una transferencia. **Requiere rol**: GERENTE de origen o SUPER_ADMIN.
    *   Si está en APPROVED: Reversa el descuento en origen.
    *   Genera alerta de auditoría.

### 2.2 `QuotationService`
*   `createQuotation(data)`: Registra presupuestos sin reserva de stock.
*   `convertToSale(quoteId)`: Transforma una cotización en venta real.

### 2.3 `PurchaseService`
*   `receivePurchase(data)`: Registra la entrada por compra a proveedor e incrementa stock masivamente.

---

## 🔄 3. Servicios de Soporte (System Services)

### 3.1 `CashService`
*   `openShift(userId, amount)`: Inicia una sesión de caja.
*   `closeShift(shiftId, finalAmount)`: Cierra la sesión y calcula discrepancias.

### 3.2 `AuditAlertService`
*   `logAction(action, targetId, details)`: Registra eventos en `audit_logs`.
*   `getKardex(productId)`: Historia de movimientos de una unidad específica.
*   `createAlert({ type, severity, branchId, userId, message, metadata })`: Crea alerta en `alertas_auditoria`. Tipos soportados: `STOCK_LOW`, `CASH_DISCREPANCY`, `UNAUTHORIZED_ACCESS`, `DISCOUNT_OVERRIDE`, `STOCK_CRITICAL`, `TRANSFER_EXPIRED`.

### 3.3 `useOfflineQueue` (Hook de Cola Offline)
Responsable de la resiliencia de ventas ante pérdida de conexión.
*   `enqueueOfflineSale(saleData, branchId, adminInfo?)`: Almacena la venta en `localStorage` bajo la clave `renotech_offline_queue` con UUID, timestamp y contador de reintentos.
*   `syncQueue()`: Itera las ventas encoladas y las procesa vía `SaleService.createSale()`. Máximo 5 reintentos por venta.
*   **Triggers automáticos**: Evento `online` del navegador (inmediato) + polling cada 60 segundos.
*   **Integración**: `PosCart.confirmCheckout()` detecta `!navigator.onLine` tras fallo de `processSale()` y desvía a `enqueueOfflineSale()`.

---

## ⚡ 4. Reglas de Inyección de Dependencias y Atomicidad

1.  **Validación Cruzada**: El `SaleService` NO puede completar una venta sin consultar primero al `InventoryService`.
2.  **Atomicidad Garantizada**: Todas las operaciones que afecten stock y caja deben ejecutarse mediante un **`runTransaction()` de Firestore** para evitar condiciones de carrera.
    *   **Para Traspasos Específicamente**:
        *   Transacción 1 (PENDING → APPROVED): Descuento en origen + Kardex TRASP_SALIDA.
        *   Transacción 2 (APPROVED → COMPLETED): Aumento en destino + Kardex TRASP_ENTRADA.
        *   Transacción 3 (Reversa con undoReceive): Restitución de stock + Kardex TRASP_SALIDA inverso.
    *   **Propósito**: Si una transacción falla, se revierte completamente; no hay estados intermedios corruptos.
3.  **Jerarquía de Datos**: Al cargar la UI del inventario, el sistema debe hacer un **Join Virtual** entre `productos` y `catalogo_maestro`.
4.  **Validación de Timeout**: Transferencias en estado PENDING por más de 7 días generan alerta automática.
5.  **Integridad Referencial** (Validaciones Obligatorias): 
    *   No se permite eliminar un `catalogo_maestro` si existen traspasos activos vinculados.
    *   El campo `masterId` en items de transferencia es obligatorio para asegurar trazabilidad.
    *   En `approveTransfer()`: Validar que `productId` existe en sucursal origen y tiene stock ≥ `quantity`.
    *   En `receiveTransfer()`: Validar que `masterId` coincide con el del `productId` en origen; si no, rechazar item.
    *   Validación de Expiración: Rechazar `receiveTransfer()` si `now() > expiresAt` (transferencia expirada).
6.  **Descuentos Controlados**: `applyDiscount()` calcula el precio final y lo almacena como `fixedPrice` en el CartItem. La validación de umbral (>20% o <70% precio original) se realiza en el componente `PosCart` antes de disparar la alerta.
7.  **Resiliencia Offline**: Las ventas fallidas por red se encolan en `localStorage` con reintentos automáticos. El sistema prioriza la disponibilidad del POS sobre la consistencia inmediata (eventual consistency).
