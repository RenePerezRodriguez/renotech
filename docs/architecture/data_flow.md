# 🔄 Flujo de Datos y Ciclo de Vida: Renotech

Este documento detalla el comportamiento dinámico del sistema. Define cómo interactúan las colecciones durante las operaciones críticas del negocio.

---

## 🚦 1. Ciclo de Venta (POS Flow)

Cuando un vendedor presiona "Finalizar Venta", el sistema ejecuta una **Transacción Atómica (ACID)**:

1.  **Validación de Existencia**: Verifica stock en `productos` de la sucursal actual.
2.  **Deducción de Stock**: Resta `quantity` en `productos`.
3.  **Escritura de Kardex**: Crea un registro en `movimientos` con:
    *   `previousStock`: El valor antes del cambio.
    *   `currentStock`: El nuevo valor resultante tras la operación.
4.  **Persistencia de Venta**: 
    *   Crea el documento maestro en `ventas`.
    *   Crea N documentos de línea en la sub-colección `ventas/{id}/items`.
5.  **Entrada de Efectivo**: 
    *   Busca el `arqueos_caja.id` activo para el usuario.
    *   Crea un `INGRESO` en `movimientos_caja` vinculado a dicho arqueo.

---

## 📦 1.1 Ciclo de Venta de Kits (Descuento en Cascada)

Si el producto vendido tiene TIPO `KIT` en el Catálogo Maestro:

1.  **Identificación de Componentes**: El sistema lee la lista `kitItems` (masterId + qty).
2.  **Deducción Atómica**: En la misma transacción de venta, descuenta el stock de **N** productos individuales en la sucursal.
3.  **Kardex Múltiple**: Genera un registro de `movimientos` por cada componente del kit, vinculados al mismo `referenceId` de la venta.

---

## 🏷️ 1.2 Ciclo de Descuentos (Discount Application Flow)

Cuando un operador aplica un descuento a un producto en el carrito POS:

### Paso 1: Aplicación en Carrito (Zustand)
1.  **Trigger**: Operador presiona el ícono de Tag (🏷️) en el CartItem y selecciona tipo: `PERCENTAGE` o `FIXED_PRICE`.
2.  **Validación Local**: 
    *   Porcentaje: debe estar entre 1-100%.
    *   Precio fijo: debe ser menor al precio base del producto.
3.  **Store Update**: `usePosStore.applyDiscount()` calcula el `fixedPrice` resultante y almacena metadata en `CartItem.discount`:
    *   `{ type, value, originalPrice, appliedBy, appliedByEmail, appliedAt }`.
4.  **Recálculo**: El total del carrito se recalcula automáticamente con el nuevo `fixedPrice`.

### Paso 2: Auditoría Condicional
1.  **Evaluación de Umbral**: Si el descuento supera el 20% o el precio final es menor al 70% del original:
    *   Se genera una `alertas_auditoria` tipo `DISCOUNT_OVERRIDE` con severidad `HIGH`.
    *   Metadata incluye: `productId`, `productCode`, `discountType`, `discountValue`, `originalPrice`, `finalPrice`.
2.  **Descuentos menores**: Se genera alerta con severidad `MEDIUM` para trazabilidad.

### Paso 3: Persistencia en Venta
1.  **Mapeo**: `SalesLogic.mapCartToSaleItems()` extrae `discountType`, `discountValue`, `originalPrice`, `discountAppliedBy` del `CartItem.discount` y los embebe en el `SaleItem`.
2.  **Escritura**: `SaleService.createSale()` persiste los campos de descuento en la sub-colección `ventas/{saleId}/items`.
3.  **Inmutabilidad**: Una vez persistida la venta, el descuento es parte del registro histórico.

### Paso 4: Reversión (Pre-Venta)
1.  **Acción**: Operador presiona ✕ junto al badge de descuento en el carrito.
2.  **Store Update**: `usePosStore.removeDiscount()` elimina `discount` y `fixedPrice` del CartItem.
3.  **Recálculo**: El precio revierte al original y el total se actualiza.

---

## 📡 1.3 Ciclo de Sincronización Offline (Offline Queue)

Cuando el POS pierde conexión a Firebase durante una venta:

### Paso 1: Detección y Encolamiento
1.  **Trigger**: `processSale()` falla y `navigator.onLine === false`.
2.  **Fallback**: `PosCart.confirmCheckout()` construye el objeto `saleData` completo y lo encola via `enqueueOfflineSale()`.
3.  **Persistencia**: La venta se almacena en `localStorage` bajo la clave `renotech_offline_queue` como JSON serializado.
4.  **Estructura**: `{ id: UUID, saleData, branchId, adminInfo?, queuedAt: ISO, retries: 0 }`.
5.  **UX**: Se limpia el carrito y se muestra toast warning: "Sin conexión — Venta encolada".

### Paso 2: Indicador Visual
1.  **Badge en Header**: El carrito muestra indicador `Offline` (amarillo) o `Online` (azul) cuando hay cola pendiente.
2.  **Contador**: Botón "N en cola" visible y clickeable para forzar sincronización manual.

### Paso 3: Auto-Sincronización
1.  **Trigger 1**: Evento `online` del navegador (inmediato al reconectar).
2.  **Trigger 2**: Polling cada 60 segundos si `navigator.onLine === true`.
3.  **Proceso**: `syncQueue()` itera secuencialmente cada venta encolada:
    *   Llama a `SaleService.createSale()` para cada entrada.
    *   Éxito: elimina de la cola.
    *   Fallo: incrementa `retries` y mantiene en cola.

### Paso 4: Descarte por Agotamiento
1.  **Límite**: Después de 5 reintentos fallidos, la venta se descarta silenciosamente.
2.  **Justificación**: Datos stale (stock ya modificado, caja cerrada) comprometen la integridad.
3.  **Riesgo conocido**: Si el usuario limpia `localStorage` antes de reconectar, las ventas encoladas se pierden.

---

## 🚛 2. Ciclo de Traspaso (Inter-Branch)

El traspaso de mercadería es un proceso atómico de dos pasos para garantizar que el stock no "desaparezca" ni se duplique:

### Paso A: Solicitud y Autorización (Estado PENDING → APPROVED)
1.  **Transacción 1 - Creación (PENDING)**:
    *   Crea documento en `stockTransfers` con estado `PENDING`.
    *   Establece `expiresAt = requestedAt + config_global.transferExpirationDays` (default: 7 días).
    *   NO descuenta stock en origen todavía.
    *   Propósito: Registrar la intención de traspaso.
2.  **Autorización Gerencial (APPROVED)**:
    *   El Gerente de la sucursal de origen autoriza: `approveTransfer(transferId)`.
    *   **Transacción Atómica 2**: En una **misma transacción**:
        *   Descuenta `quantity` en `productos` (sucursal origen).
        *   Crea registro en `movimientos` TIPO "TRASP_SALIDA".
        *   Cambia estado a `APPROVED` con `approvedAt` y `approvedBy`.
    *   El stock entra en tránsito: está deducido de origen, no está en destino aún.

### Paso B: Recepción en Destino (Estado APPROVED → COMPLETED)
1.  **Validación en Destino**:
    *   El personal en destino confirma físicamente el conteo de productos recibidos.
    *   Ingresa `receivedQuantity` en cada línea de traspaso.
    *   Compara con `quantity` (cantidad esperada).
2.  **Comparación de Discrepancias**:
    *   Si `receivedQuantity == quantity`: Procede sin alertas.
    *   Si `receivedQuantity ≠ quantity`: 
        *   Marca `isAdjusted: true`.
        *   Obliga ingresar `discrepancyReason` (ej: "Falta 1 unidad", "Dañado en tránsito").
        *   Genera alerta en `alertas_auditoria` (Gravedad: MEDIA).
3.  **Transacción Atómica 3 - Recepción (COMPLETED)**:
    *   Suma `receivedQuantity` en `productos` (sucursal destino).
    *   Crea registro en `movimientos` TIPO "TRASP_ENTRADA" con `quantity = receivedQuantity`.
    *   Cambia estado a `COMPLETED` con `completedAt` y `completedBy`.
4.  **Cierre de Traspaso**:
    *   Si hubo diferencia, el sistema genera un `movimientos` TIPO "AJUSTE" automáticamente en destino para reconciliar.

### Paso C: Reversa de Recepción (Opcional - undoReceive)
1.  **Escenario**: Se detecta un error después de haber recibido la transferencia.
2.  **Reversión Atómica (Transacción 4)**:
    *   Marca transferencia: `isUndone: true`.
    *   Resta el stock agregado en destino: `productos` decrementa por `receivedQuantity`.
    *   Crea `movimientos` TIPO "TRASP_REVERSAL" por el monto revertido (documenta explícitamente la reversa).
    *   Estado vuelve a `APPROVED` (listo para recibir de nuevo).
3.  **Restablecimiento**:
    *   El stock regresa al tránsito (deducido en origen, no en destino).
    *   Se puede repetir la recepción.

### Paso D: Cancelación (PENDING o APPROVED → CANCELLED)
1.  **Si status es PENDING**: Solo requiere confirmación, no hay stock modificado.
2.  **Si status es APPROVED**: 
    *   Reversa la deducción en origen: suma `quantity` a `productos`.
    *   Crea `movimientos` TIPO "ENTRADA" para restaurar stock.
    *   Obliga escribir `rejectionReason` (ej: "Cancelado por cambio de requisitos").
3.  **Genera alerta**: `alertas_auditoria` para auditoría de cancelaciones.

---

## 🔧 3. Ajustes de Inventario y Auditoría

Para corregir discrepancias físicas sin afectar la caja:

1.  **Capa de Motivo**: Obligatorio un `reason` descriptivo.
2.  **Transacción de Ajuste**: 
    *   Actualiza el `stock` en `productos`.
    *   Registra `movimientos` TIPO "AJUSTE" con `quantity` positiva (sobrante) o negativa (faltante).
3.  **Alerta de Discrepancia**: Si el ajuste supera un umbral del 10% del stock real, se dispara una `alertas_auditoria` automática para Gerencia.

---

## ❌ 4. Anulaciones Parciales (Partial Void)

Si un cliente devuelve solo 1 item de una venta de 5:

1.  **Marcado de Item**: Se cambia `isVoided: true` en el documento específico de la sub-colección `ventas/{id}/items`.
2.  **Re-cálculo de Cabecera**: Se descuenta el `subtotal` del item del `total` de la `venta` maestra.
3.  **Reversión en Kardex**: Se genera una `ENTRADA` en `movimientos` vinculada al producto devuelto.
5.  **Egreso de Caja**: Se genera un `EGRESO` en `movimientos_caja` para devolver el dinero al cliente.

---

## 💰 5. Ciclo de Cobranza (Cartera y Cuotas)

### 5.1 Venta a Crédito (CREDITO)
Para ventas realizadas a crédito simple:
1.  **Generación de Deuda**: El sistema incrementa `saldoDeudor` del cliente.
2.  **Registro de Abono**: Vía `AbonoModal` en el módulo de Clientes.
3.  **Entrada a Caja**: Se dispara un `INGRESO` en `movimientos_caja` categoría `ABONO_CLIENTE`.

### 5.2 Pago Mixto (MIXTO)
Cuando el cliente divide el pago entre Efectivo y QR:
1.  **Validación**: `splitCash + splitQR === sale.total` (verificado en POS).
2.  **Dos Movimientos de Caja**: Se crean 2 documentos separados en `movimientos_caja`:
    *   Uno con `paymentMethod: "EFECTIVO"` por `splitCash`.
    *   Uno con `paymentMethod: "QR"` por `splitQR`.
3.  **Cabecera de Venta**: Se guardan `splitCash` y `splitQR` como campos auditables.

### 5.3 Venta en Cuotas (CUOTAS)
Cuando se vende a crédito con plan de cuotas:
1.  **Generación de N Cuotas**: `SaleService.createSale()` crea N documentos en `cuentas_corrientes`, cada uno con:
    *   `installmentNumber` (1..N), `installmentsTotal` (N), `amount`, `dueDate` (fecha + N meses).
    *   `status: "PENDING"`, `remainingBalance = amount`.
    *   La última cuota absorbe el residuo de redondeo.
2.  **Incremento de Deuda**: Se suma `expectedTotal` al `saldoDeudor` del cliente.
3.  **Cobro Individual**: Desde el módulo **Cuentas Corrientes** (`/cuentas-corrientes`):
    *   `InstallmentService.registerPayment()` actualiza `remainingBalance`, marca `PAID` si llega a 0.
    *   Genera un `INGRESO` en `movimientos_caja` con categoría `COBRO_CUOTA`.
    *   Reduce `saldoDeudor` y `balance` del cliente.
4.  **Vencimiento Automático**: `InstallmentService.markOverdue()` marca cuotas con `dueDate < hoy` como `OVERDUE`.

---

## 🛠️ 6. Ciclo de Reconciliación (Inventario Físico / Stocktake)

Proceso periódico para corregir el sistema vs la realidad:

1.  **Snapshot de Esperado**: El sistema congela el `stock` actual para comparación.
2.  **Conteo Real**: El personal ingresa la cantidad física encontrada en estante.
3.  **Ajuste Atómico**: 
    *   Si hay diferencia, se genera un `movimientos` TIPO "AJUSTE_MASIVO".
    *   El Kardex refleja el `previousStock` (sistema) y `currentStock` (resultado tras conteo real).

---

## 🛡️ 7. Ciclo de Garantías Técnicas

Cuando un producto se cambia por falla de fábrica (Sin costo):

1.  **Movimiento de Salida**: Se resta el repuesto nuevo con TIPO "GARANTIA_SALIDA".
2.  **Movimiento de Entrada**: Si el repuesto dañado se recupera para devolución al proveedor, se ingresa con TIPO "GARANTIA_ENTRADA" (Costo 0).
3.  **Observaciones**: Se vincula el `referenceId` a la venta original para trazabilidad de falla.

---

## 📈 8. Ciclo de Inteligencia BI (Background Tasks)

La analítica avanzada no se calcula en tiempo real para el usuario final (para no lentizar el sistema):

1.  **Cierre de Día**: 
    *   A medianoche, un proceso lee todas las `ventas` del día.
    *   Calcula utilidad neta (Total - CostoAtSale).
    *   Escribe el `resumenes_diarios` por sucursal.
2.  **Recálculo ABC**:
    *   Cada semana, el sistema analiza el volumen de movimientos en `ventas/{id}/items`.
    *   Actualiza el campo `abcClassGlobal` y `abcClassLocal`.
3.  **Recordatorios CRM**:
    *   Al finalizar una venta de productos marcados como "Mantenimiento", se agenda automáticamente un `recordatorios_cliente` para la fecha proyectada.

---

## 💱 9. Trigger de Re-cálculo de Divisa

Cuando se actualiza el `exchangeRate` en `config_global`:

1.  **Actualización de Catálogo**: No requiere re-escribir cada producto. El sistema de UI (Frontend) aplica la nueva tasa sobre el campo `precioUSD` del Maestro en tiempo real.
2.  **Histórico Preservado**: Las ventas pasadas NO se alteran; mantienen el tipo de cambio y el total en Bs capturado al momento de la transacción.

---

## 🛡️ 10. Reglas de Integridad de Borrado (Soft-Delete)

**NUNCA** se borran datos transaccionales.
*   **Productos**: Se marcan como `isActive: false`. No pueden ser vendidos pero permanecen en el historial.
*   **Ventas**: Se marcan como `status: VOIDED`. El sistema genera automáticamente un **Movimiento de Reversa** en el Kardex y en Caja.
*   **Usuarios**: Se mueven a `status: SUSPENDED`. No pueden entrar al sistema pero sus ventas pasadas conservan su `displayName`.
