# 🏗️ Arquitectura de Datos Renotech (Industrial Master)

Este documento es la **Especificación Técnica Definitiva** de la base de datos de Renotech. Define cada colección, campo y regla de integridad para garantizar un sistema de grado industrial.

---

## 1. Núcleo de Inventario (Ficha Única)

### 1.1 Colección: `catalogo_maestro`
**Propósito**: Identidad global del repuesto (Datos immutables por sucursal).
*   `id`: string (Identificador único de sistema)
*   `codigo`: string (Código interno de negocio - ej: `REN-001`)
*   `nombre`: string (Nombre descriptivo completo)
*   `marca`: string (Fabricante del repuesto)
*   `categoriaId`: string (Referencia a `categorias.id`)
*   `codigoOE`: string (Original Equipment code)
*   `codigoFabrica`: string (Código del fabricante de la pieza)
*   `origen`: string (País de procedencia)
*   `imagenUrls`: string[] (Array de links a imágenes en Storage)
*   `descripcion`: string (Texto largo con detalles técnicos)
*   **Finanzas Maestro**:
    *   `precioDefault`: number (Precio sugerido base en Bs)
    *   `precioUSD`: number (Precio base en Dólares para protección cambiaria)
    *   `costoBase`: number (Costo de compra referencial)
*   **Inteligencia**:
    *   `searchTags`: string[] (Alias: ["Shock", "Amortiguador"])
    *   `type`: "PRODUCT" | "KIT" (Si es KIT, usa `kitItems`)
    *   `kitItems`: { masterId: string, qty: number }[]
    *   `abcClassGlobal`: "A" | "B" | "C" (Clasificación por volumen de ventas nacional)
*   **Logística Avanzada**:
    *   `uomConversion`: { fromUnit: string, toUnit: string, factor: number }[] (Ej: 1 CJA -> 12 UND)
    *   `demandForecast`: number (Proyección de pedidos mensual)
    *   `returnRate`: number (% de devoluciones registradas)
*   `createdAt`: timestamp
*   `updatedAt`: timestamp

### 1.2 Colección: `productos` (Existencias Reales)
**Propósito**: Inventario físico y precios locales por sucursal.
*   `id`: string (Auto-ID)
*   `masterId`: string (Referencia obligatoria a `catalogo_maestro.id`)
*   `branchId`: string (Referencia obligatoria a `branches.id`)
*   **Stock**:
    *   `stock`: number (Cantidad física actual)
    *   `minStock`: number (Punto de reorden / alerta)
    *   `lastStockTake`: timestamp (Fecha del último inventario físico)
*   **Logística**:
    *   `ubicacionFisica`: string (Eje: "Pasillo 4, Rack B-3")
*   **Precios Locales**:
    *   `precioOverride`: number | null (Si existe, ignora el `precioDefault`)
    *   `precioMayorista`: number | null
    *   `precioMecanico`: number | null
*   **Estado**:
    *   `abcClassLocal`: "A" | "B" | "C" (Rotación específica de esta sucursal)
    *   `isActive`: boolean (Soft-delete)

### 1.3 Colección: `categorias` (Taxonomía)
*   `id`: string
*   `nombre`: string
*   `parentCategoryId`: string | null (Para navegación jerárquica: Motor -> Inyección)
*   `descripcion`: string
*   `createdAt`: timestamp

### 1.4 Colección: `marcas` (Fabricantes)
*   `id`: string
*   `nombre`: string (Eje: Toyota, Bosch, KYB)
*   `logoUrl`: string
*   `descripcion`: string
*   `active`: boolean

---

## 2. Ventas y Transacciones (Escalabilidad Total)

### 2.1 Colección: `ventas` (Cabecera)
*   `id`: string
*   `fecha`: timestamp
*   `clienteId`: string (Ref a `clientes.id`)
*   `branchId`: string (Ref a `branches.id`)
*   `usuarioId`: string (Ref a `users.id`)
*   `metodoPago`: "EFECTIVO" | "TARJETA" | "QR" | "CREDITO" | "MIXTO" | "CUOTAS"
*   `subtotal`: number
*   `tax`: number
*   `total`: number
*   `itemCount`: number
*   `status`: "COMPLETED" | "VOIDED"
*   `isConvertedFromQuote`: boolean
*   `quoteId`: string | null (Link a cotización origen)
*   **Pago Dividido (MIXTO)**:
    *   `splitCash`: number | null (Porción en efectivo)
    *   `splitQR`: number | null (Porción en QR)
*   **Cuotas (CUOTAS)**:
    *   `installments`: number | null (Número de cuotas: 2, 3, 4, 6)
    *   `installmentAmount`: number | null (Monto por cuota)

### 2.2 Sub-colección: `ventas/{saleId}/items`
**Propósito**: Detalle de cada venta (Sub-colección para evitar límites de 1MB).
*   `masterId`: string (Link al Maestro)
*   `productName`: string (Copiado para histórico)
*   `qty`: number (Cantidad vendida)
*   `unitPrice`: number (Precio al momento de la venta)
*   `subtotal`: number
*   `costAtSale`: number (Costo del producto al momento de vender para calcular utilidad real)
*   `isVoided`: boolean
*   **Descuentos** (opcionales, presentes cuando se aplicó descuento):
    *   `discountType`: "PERCENTAGE" | "FIXED_PRICE" (Tipo de descuento aplicado)
    *   `discountValue`: number (Porcentaje o precio fijo según tipo)
    *   `originalPrice`: number (Precio unitario antes del descuento)
    *   `discountAppliedBy`: string (UID del usuario que aplicó el descuento)

---

## 3. Logística y Traspasos

### 3.1 Colección: `cotizaciones` (Presupuestos)
*   `id`: string
*   `fecha`: timestamp
*   `clienteId`: string
*   `branchId`: string
*   `usuarioId`: string
*   `total`: number
*   `validUntil`: timestamp
*   `status`: "PENDING" | "CONVERTED" | "EXPIRED" | "CANCELLED"
*   `notes`: string

### 3.2 Sub-colección: `cotizaciones/{quoteId}/items`
*   `masterId`: string
*   `productName`: string
*   `qty`: number
*   `unitPrice`: number
*   `subtotal`: number

### 3.3 Colección: `stockTransfers` (Cabecera)
*   `id`: string
*   `fromBranchId`: string (ID sucursal origen)
*   `fromBranchName`: string
*   `toBranchId`: string (ID sucursal destino)
*   `toBranchName`: string **(Snapshot inmutable del nombre de sucursal destino al momento de creation - preserva historicidad)**
*   `status`: "PENDING" | "APPROVED" | "COMPLETED" | "CANCELLED"
*   **Transaccionalidad**:
    *   `requestedBy`: string (Auth UID)
    *   `requestedAt`: timestamp
    *   `approvedBy`: string | null (Autoriza la salida de stock)
    *   `approvedAt`: timestamp | null
    *   `completedBy`: string | null (Usuario que marca como recibido en destino)
    *   `completedAt`: timestamp | null
*   **Control de Integridad**:
    *   `lastModifiedBy`: string (Último usuario que editó)
    *   `lastModifiedAt`: timestamp
*   `notes`: string
*   **Auditoría en Tránsito**:
    *   `isAdjusted`: boolean (Indica si hubo cambios en cantidad durante tránsito)
    *   `isUndone`: boolean (Indica si la recepción fue revertida: verdadero tras `undoReceive()`)
    *   `rejectionReason`: string | null (Motivo si status es CANCELLED)
    *   `expiresAt`: timestamp (Transferencia auto-expira si no se recibe en X días: default 7 días)

### 3.4 Sub-colección: `stockTransfers/{transferId}/items`
*   `productId`: string (ID de producto en sucursal origen)
*   `masterId`: string (Ref a `catalogo_maestro.id` - OBLIGATORIO para Kardex en destino)
*   `productCode`: string
*   `productName`: string
*   `quantity`: number (Cantidad actual/enviada)
*   `originalQuantity`: number (Cantidad solicitada inicialmente)
*   **Recepción y Discrepancias**:
    *   `receivedQuantity`: number | null (Cantidad física recibida en destino)
    *   `discrepancyReason`: string | null (Motivo de diferencia si receivedQuantity ≠ quantity)
*   `costo`: number (Costo unitario del producto al momento del traspaso)

---

## 4. Compras y Abastecimiento

### 4.1 Colección: `compras` (Cabecera)
*   `id`: string
*   `supplierId`: string
*   `supplierName`: string
*   `date`: timestamp
*   `total`: number
*   `branchId`: string
*   `status`: "RECEIVED"
*   `notes`: string
*   `usuarioId`: string
*   `usuarioNombre`: string

### 4.2 Sub-colección: `compras/{purchaseId}/items`
*   `productId`: string (Ref a `productos.id`)
*   `productName`: string
*   `quantity`: number
*   `cost`: number (Costo unitario pactado)
*   `subtotal`: number

---

## 5. Auditoría Industrial (Kardex)

### 5.1 Colección: `movimientos`
**Propósito**: Rastreabilidad absoluta de cada unidad.
*   `id`: string
*   `date`: timestamp
*   `productId`: string (Ref a `productos.id` [Sucursal])
*   `masterId`: string (Ref a `catalogo_maestro.id`)
*   `branchId`: string (Ref a `branches.id`)
*   `type`: "ENTRADA" | "SALIDA" | "AJUSTE" | "TRASP_SALIDA" | "TRASP_ENTRADA" | "TRASP_REVERSAL" | "ANULACION" | "GARANTIA_SALIDA" | "GARANTIA_ENTRADA" | "AJUSTE_MASIVO"
*   `quantity`: number (Positivo o negativo)
*   **Balance**:
    *   `previousStock`: number (Stock antes de la operación)
    *   `currentStock`: number (Stock resultante tras la operación)
*   `referenceId`: string (ID de la venta/traspaso/compra originaria)
*   `unitCost`: number (Costo unitario al momento del movimiento - FIFO)
*   `userId`: string (Ref a `users.id`)

---

## 6. Finanzas y Caja

### 6.1 Colección: `turnos_caja` (Sesiones de Caja)
*   `id`: string
*   `userId`: string
*   `branchId`: string
*   `startDate`: timestamp
*   `endDate`: timestamp | null
*   `status`: "OPEN" | "CLOSED"
*   `startAmount`: number
*   `endAmount`: number (Declarado por usuario)
*   `systemAmount`: number (Calculado por sistema)

### 6.2 Colección: `movimientos_caja` (Libro Diario)
*   `id`: string
*   `shiftId`: string (Ref a `arqueos_caja.id`)
*   `branchId`: string
*   `userId`: string
*   `type`: "INGRESO" | "EGRESO"
*   `amount`: number
*   `reason`: string
*   `paymentMethod`: "EFECTIVO" | "TARJETA" | "QR"
*   `referenceId`: string (Link a Venta o Gasto)

### 6.3 Colección: `cuentas_corrientes` (Cartera por Cuota)
**Propósito**: Cada documento representa UNA cuota individual de un plan de cuotas.
*   `id`: string
*   `clientId`: string (Ref a `clientes.id`)
*   `saleId`: string (Ref a `ventas.id`)
*   `branchId`: string (Ref a `branches.id`)
*   `totalAmount`: number (Total de la venta original)
*   `installmentNumber`: number (1, 2, 3... N)
*   `installmentsTotal`: number (N total de cuotas)
*   `amount`: number (Monto de esta cuota)
*   `remainingBalance`: number (Saldo pendiente de esta cuota, inicia = amount)
*   `dueDate`: timestamp (Fecha de vencimiento: fecha_venta + N meses)
*   `status`: "PENDING" | "PAID" | "OVERDUE"
*   `paidAt`: timestamp | null (Fecha de pago completo)
*   `createdAt`: timestamp

**Nota**: El antiguo modelo de sub-colección `abonos` fue reemplazado por este esquema donde cada cuota es un documento independiente. Los cobros se registran actualizando `remainingBalance` y generando un `movimientos_caja` TIPO "INGRESO" con categoría "COBRO_CUOTA".

---

## 7. Seguridad y Personas (RBAC)

### 7.1 Colección: `users`
*   `id`: string (Firebase Auth ID)
*   `email`: string
*   `displayName`: string
*   `roleId`: string (Ref a `roles.id`)
*   `branchId`: string (Ref a `branches.id`)
*   `status`: "ACTIVE" | "SUSPENDED"

### 7.2 Colección: `roles`
*   `id`: string (Eje: "GERENTE", "VENDEDOR")
*   `name`: string
*   `permissions`: string[] (Array de SLUGs de acceso)
*   `isSystem`: boolean

### 7.3 Colección: `clientes`
*   `id`: string
*   `razonSocial`: string
*   `nit`: string
*   `email`: string
*   `telefono`: string
*   `lineaDeCredito`: number
*   `saldoDeudor`: number (Sincronizado con AR/AP)
*   `abcClass`: "A" | "B" | "C"

### 7.4 Colección: `proveedores`
*   `id`: string
*   `nombre`: string
*   `contacto`: string
*   `nit`: string
*   `telefono`: string
*   `email`: string

### 7.5 Colección: `alertas_auditoria`
*   `id`: string
*   `fecha`: timestamp
*   `type`: "STOCK_LOW" | "CASH_DISCREPANCY" | "UNAUTHORIZED_ACCESS" | "DISCOUNT_OVERRIDE"
*   `severity`: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
*   `message`: string
*   `isResolved`: boolean
*   `metadata`: object (Datos contextuales del evento, estructura varía por tipo)
    *   Para `DISCOUNT_OVERRIDE`: `{ productId, productCode, discountType, discountValue, originalPrice, finalPrice }`

---

## 8. Configuración y Metas

### 8.1 Colección: `resumenes_diarios` (Snapshots)
*   `id`: string (Eje: `2026-04-02_branchId`)
*   `date`: string (`YYYY-MM-DD`)
*   `branchId`: string
*   `totalRevenue`: number
*   `totalCost`: number
*   `totalMargin`: number
*   `saleCount`: number

### 8.2 Colección: `recordatorios_cliente` (CRM)
*   `id`: string
*   `clientId`: string
*   `masterId`: string
*   `scheduledDate`: timestamp
*   `status`: "PENDING" | "COMPLETED"
*   `type`: "MANTENIMIENTO" | "CONTACTO"

### 8.3 Colección: `ventas_perdidas` (Costo de Oportunidad)
*   `id`: string
*   `masterId`: string
*   `branchId`: string
*   `qty`: number
*   `reason`: "PRICE" | "STOCK" | "BRAND"
*   `date`: timestamp

---

## ⚙️ 9. Configuración Global

### 8.1 Colección: `config_global`
*   `id`: "current_config"
*   **Moneda**:
    *   `exchangeRate`: number (Tasa de cambio Bs -> USD)
    *   `lastExchangeUpdate`: timestamp
*   **Facturación**:
    *   `ivaPercentage`: number (Eje: 13)
    *   `invoiceLegend`: string
*   **Límites**:
    *   `maxDiscountPercentage`: number
*   **Logística y Transferencias**:
    *   `transferExpirationDays`: number (Días después de los cuales una transferencia en PENDING/APPROVED genera alerta - default: 7)

---

### 9.1 Almacenamiento Local: `renotech_offline_queue` (localStorage)
**Propósito**: Cola de ventas offline cuando no hay conexión a Firestore. NO es una colección Firestore.
*   **Clave**: `renotech_offline_queue` en `localStorage`
*   **Estructura** (JSON serializado):
    *   `id`: string (UUID generado con `crypto.randomUUID()`)
    *   `saleData`: Omit<Sale, 'id'> (Datos completos de la venta)
    *   `branchId`: string
    *   `adminInfo`: { uid, email } | undefined
    *   `queuedAt`: string (ISO timestamp)
    *   `retries`: number (Máximo 5 intentos, luego se descarta)
*   **Ciclo de vida**: Encolado offline → auto-sincronizado via `useOfflineQueue` hook → eliminado tras éxito
*   **Riesgo**: Pérdida de datos si el usuario limpia localStorage antes de reconectar

---

### 🛡️ Integridad Referencial
1.  **Cascada Inversa**: No se puede eliminar un `catalogo_maestro` si existen `productos` (Existencias) vinculados.
2.  **Kardex Síncrono**: Cada actualización del campo `stock` en `productos` **OBLIGATORIAMENTE** dispara una escritura atómica en `movimientos`.
3.  **Cierre de Caja**: No se permite cerrar una caja si hay una `venta` pendiente de procesar en el mismo hardware/sesión.
4.  **Trazabilidad FIFO**: Cada `movimiento` debe registrar el `unitCost` en el momento de la acción para asegurar que los reportes de margen sean históricos y no dependan del costo actual.
5.  **Descuentos Auditados**: Toda aplicación de descuento que supere el 20% o reduzca el precio a menos del 70% del original genera automáticamente una `alertas_auditoria` tipo `DISCOUNT_OVERRIDE` con severidad `HIGH`.

---

## 🔍 10. Búsqueda Federada Nacional

Para que el Gerente General pueda ver el stock de un repuesto en toda la red de sucursales:

1.  **Punto de Entrada**: La búsqueda se realiza sobre `catalogo_maestro`.
2.  **Agregación en Caliente**: Al seleccionar un ítem del Maestro, el sistema lanza una consulta paralela a la colección `productos` filtrando solo por `masterId`.
3.  **Visualización**: Se muestra una lista desplegable con el stock actual de cada `branchId` existente para dicho repuesto.
