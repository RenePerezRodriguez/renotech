import { Timestamp, FieldValue } from 'firebase/firestore';

// Re-export del modelo Caja + Tesorería v2
export * from './treasury';

export interface MasterProduct {
    id?: string;
    codigo: string;          // Código interno (ej: REN-001)
    nombre: string;          // Nombre descriptivo
    marcaId: string;         // Referencia a Brand.id
    categoriaId: string;     // Referencia a Category.id
    isActive?: boolean;      // Soft delete flag
    codigoOE?: string;       // Original Equipment
    codigoFabrica?: string;  // Código del fabricante
    origen?: string;         // País de procedencia (Japón, etc.)
    imagenUrls: string[];    // Array de imágenes en Storage
    descripcion?: string;
    precioDefault: number;   // Precio sugerido base
    precioSinFactura?: number; // Precio sin factura (si difiere del default)
    precioConFactura?: number; // Precio con factura (si difiere del default)
    precioUSD: number;       // Precio base en USD
    costoBase: number;       // Costo referencial global
    searchTags: string[];    // Tags para búsqueda rápida
    type: 'PRODUCT' | 'KIT';
    kitItems?: { masterId: string, qty: number }[];
    abcClassGlobal?: 'A' | 'B' | 'C';
    maintenanceMonths?: number; // Added for CRM (Phase 7 Architecture)
    unidad?: string;            // Unit of Measure (PZA, CAJA, etc)
    // Intelligence Logística (Phase 8 Architecture - schema:30)
    uomConversion?: { fromUnit: string, toUnit: string, factor: number }; 
    demandForecast?: number;
    returnRate?: number;
    createdAt: Date | Timestamp | FieldValue;
    updatedAt: Date | Timestamp | FieldValue;
    importBatchId?: string; // Trazabilidad de importación masiva
}

export interface Brand {
    id?: string;
    nombre: string;
    logoUrl?: string;
    descripcion?: string;    // Architecture: database_schema.md marcas
    active?: boolean;
    createdAt?: Timestamp | Date | FieldValue;
    updatedAt?: Timestamp | Date | FieldValue;
}

export interface Origin {
    id?: string;
    nombre: string;
    descripcion?: string;
    createdAt?: Timestamp | Date | FieldValue;
    updatedAt?: Timestamp | Date | FieldValue;
}

export interface Product {
    id: string;              // Cambiado a requerido para consistencia en UI
    masterId: string;        // Referencia obligatoria a MasterProduct.id
    branchId: string;        // Referencia obligatoria a Branch.id
    stock: number;
    minStock: number;
    ubicacionFisica?: string; // Ej: Pasillo 4, Rack B
    precioOverride?: number;  // Si existe, reemplaza al precioDefault del maestro
    precioMayorista?: number;
    precioMecanico?: number;
    isActive: boolean;
    lastStockTake?: Date | Timestamp | FieldValue;
    lastSaleAt?: Date | Timestamp | FieldValue; // Tracked for dead stock detection
    // Campos heredados/denormalizados para compatibilidad UI (Hidratación)
    codigo: string;
    nombre: string;
    marca: string;
    categoria: string;
    imagenUrl?: string;
    costo: number;
    precio: number;
    precioConFactura: number;
    precioSinFactura: number;
    branchName?: string;
    isLocal?: boolean;
    isHQVirtual?: boolean;
    stockHQ?: number;
    updatedAt?: Date | Timestamp | FieldValue; 
    createdAt?: Date | Timestamp | FieldValue;
    // Campos técnicos del Maestro (Hidratación opcional)
    marcaId?: string;
    categoriaId?: string;
    codigoOE?: string;
    codigoFabrica?: string;
    origen?: string;
    descripcion?: string;
    precioVenta?: number; // Alias for price normalization
    abcClassLocal?: 'A' | 'B' | 'C';
    unidad?: string;      // Denormalized from Master
    barcode?: string;     // EAN/UPC logic
    supplierId?: string;  // Primary supplier reference
    importBatchId?: string; // Trazabilidad de importación masiva locales
}

export interface FailedImportItem extends Partial<Product> {
    error: string;
    row?: number;
}

export type ImportItem = Partial<Product> & { 
    [key: string]: string | number | boolean | undefined;
    marcaId?: string;
    categoriaId?: string;
};

export interface Client {
    id?: string;
    razonSocial: string;
    nit?: string;
    tipo?: 'PARTICULAR' | 'EMPRESA';
    telefono?: string;
    email?: string;
    direccion?: string;
    notas?: string;
    branchId?: string;
    balance?: number;          // AR (Accounts Receivable) tracking
    lineaDeCredito?: number;   // Límite de crédito asignado (Architecture: database_schema.md clientes)
    saldoDeudor?: number;      // Deuda pendiente sincronizada con cuentas_corrientes
    abcClass?: 'A' | 'B' | 'C'; // Clasificación por valor de cliente
    isActive: boolean;         // Soft-Delete (Phase 8)
}


export interface CartItem {
    product: Product;
    quantity: number;
    priceMode: 'CON_FACTURA' | 'SIN_FACTURA'; // Per-item price mode
    fixedPrice?: number; // Optional price override (e.g. from quotation)
    quotationPriceConFactura?: number;
    quotationPriceSinFactura?: number;
    discount?: {
        type: 'PERCENTAGE' | 'FIXED_PRICE';
        value: number; // % off or absolute Bs price
        originalPrice: number;
        appliedBy: string;
        appliedByEmail: string;
        appliedAt: string; // ISO string
    };
    /** Solicitud de descuento pendiente de aprobación del gerente */
    pendingDiscount?: {
        approvalId: string;
        type: 'PERCENTAGE' | 'FIXED_PRICE';
        value: number;
        requestedAt: string;
    };
}

export interface SaleItem {
    id?: string;
    productId: string;
    productCode?: string;
    productName: string;
    productCodigoFabrica?: string;
    productCodigoOE?: string;
    productMarca?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    costAtSale?: number;     // Hydrated server-side in SaleService.createSale (FIFO Architecture)
    isVoided?: boolean;
    returnedQuantity?: number;
    discountType?: 'PERCENTAGE' | 'FIXED_PRICE';
    discountValue?: number;
    originalPrice?: number;
    discountAppliedBy?: string;
}

export interface Sale {
    id?: string;
    cliente: Client;
    items?: SaleItem[];
    total: number;
    fecha: Date;
    metodoPago: 'EFECTIVO' | 'QR' | 'CREDITO' | 'MIXTO' | 'CUOTAS';
    subtotal: number;
    tax?: number;
    itemCount?: number;
    status: 'COMPLETED' | 'VOIDED';
    usuarioId?: string;
    usuarioEmail?: string;
    usuarioNombre?: string; // Add Display Name
    voidReason?: string;
    voidedAt?: Timestamp;
    voidedBy?: string;
    amountReceived?: number;
    change?: number;
    branchId: string; // Mandatory for data isolation
    // Split Payment (MIXTO)
    splitCash?: number;
    splitQR?: number;
    // Installments (CUOTAS)
    installments?: number;
    installmentAmount?: number;
    adelanto?: number; // Down payment amount (cash/QR paid at sale time)
}

export interface SuspendedSale {
    id: string;
    cart: CartItem[];
    client: Client | null;
    date: Date;
    total: number;
}


export interface CashShift {
    id?: string;
    userId: string; // DEPRECATED: kept for backwards compat. Prefer openedByUserId.
    userName: string;
    openedByUserId?: string; // User who opened the shift (only one allowed per branch)
    openedByUserName?: string;
    startDate: Date;
    endDate?: Date;
    startAmount: number;
    endAmount?: number;
    expectedAmount?: number; // Server-side expected cash based on audited movements
    calculatedAmount?: number; // System calculated total
    difference?: number; // endAmount - calculatedAmount
    status: 'OPEN' | 'CLOSED';
    notes?: string;
    branchId: string; // Mandatory for data isolation
    branchName?: string; // Denormalized for display in consolidated views
    // Premium Audit Fields
    denominations?: Record<string, number>;
    declaredEfectivo?: number;
    declaredQR?: number;
    declaredTransferencia?: number;
    systemEfectivo?: number;
    systemQR?: number;
    systemTransferencia?: number;
    differenceEfectivo?: number;
    differenceQR?: number;
    differenceTransferencia?: number;
    // Reapertura
    reopenedAt?: Date | Timestamp | FieldValue;
    reopenedBy?: string;
    reopenedByName?: string;
    reopenReason?: string;
    // Alertas operativas
    longShiftAlertSent?: boolean;
}

export interface CashMovement {
    id?: string;
    shiftId: string;
    type: 'INGRESO' | 'EGRESO';
    amount: number;
    reason: string;
    date: Date | Timestamp | FieldValue;
    userId: string;
    branchId?: string; // Optional for manual movements, usually linked to shift
    paymentMethod?: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA' | 'MIXTO'; // Track specific source
    category?: string; // e.g. "PAGO_PROVEEDOR", "SERVICIOS", etc.
    referenceId?: string; // Link to Sale, Transfer, or Purchase ID
    // Conciliación bancaria (solo para QR / TRANSFERENCIA)
    reconciledAt?: Date | Timestamp | FieldValue;
    reconciledBy?: string;
    reconciledByName?: string;
    reconciledRef?: string; // referencia bancaria o de la app QR
}

export interface OperationalExpense {
    id?: string;
    branchId: string;
    date: Date | Timestamp | FieldValue;
    amount: number;
    category: 'ALQUILER' | 'SERVICIOS' | 'TRANSPORTE' | 'ALIMENTACION' | 'LIMPIEZA' | 'MARKETING' | 'MANTENIMIENTO' | 'SUELDOS' | 'IMPUESTOS' | 'OTROS';
    description: string;
    supplierName?: string;
    receiptNumber?: string;
    receiptUrl?: string;          // URL de comprobante en Storage
    paymentMethod?: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
    bankRef?: string;             // Número de referencia bancaria para QR/Transferencia
    cashMovementId?: string;      // Si generó un EGRESO en caja, su id
    counterpartyId?: string;      // ID de la contraparte (proveedor, transportista, etc.)
    counterpartyType?: 'SUPPLIER' | 'TRANSPORT' | 'OTHER';
    userId: string;
    userName: string;
    status: 'ACTIVE' | 'VOIDED' | 'PENDING_APPROVAL' | 'REJECTED';
    voidedAt?: Date | Timestamp | FieldValue;
    voidedBy?: string;
    voidReason?: string;
    // Workflow de aprobación (CAJERO solicita > umbral)
    approvedAt?: Date | Timestamp | FieldValue;
    approvedBy?: string;
    approvedByName?: string;
    rejectedAt?: Date | Timestamp | FieldValue;
    rejectedBy?: string;
    rejectedByName?: string;
    rejectionReason?: string;
    createdAt?: Date | Timestamp | FieldValue;
}

export interface Installment {
    id: string;
    clientId: string;
    clientName: string;
    saleId: string;
    totalAmount: number;
    saleTotal: number;
    adelanto?: number;
    productsSummary: string;
    installmentNumber: number;
    installmentsTotal: number;
    amount: number;
    remainingBalance: number;
    lateFee?: number;
    dueDate: Timestamp;
    status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
    branchId: string;
    createdAt: Timestamp;
    paidAt?: Timestamp;
    payments?: InstallmentPayment[];
}

export interface InstallmentPayment {
    id?: string;
    amount: number;
    method: 'EFECTIVO' | 'QR';
    date: Timestamp;
    userId: string;
    userName: string;
    notes?: string;
}

export interface InstallmentPaymentHistory extends InstallmentPayment {
    installmentId: string;
    installmentNumber: number;
    saleId: string;
    remainingAfter: number;
}

export interface AuditAlertMetadata {
    shiftId?: string;
    differenceEfectivo?: number;
    differenceQR?: number;
    endAmount?: number;
    [key: string]: unknown;
}

export interface AuditAlert {
    id: string;
    type: 'CASH_DISCREPANCY' | 'SECURITY' | 'INVENTORY_THRESHOLD' | 'DISCOUNT_OVERRIDE' | 'TRANSFER_DISCREPANCY' | 'TRANSFER_DISCREPANCY_RESOLVED' | 'SHIFT_OPEN_TOO_LONG' | 'EXPENSE_DUPLICATE' | 'EXPENSE_LARGE' | 'ENVIO_CANCEL_APPROVED' | 'ENVIO_CANCEL_REJECTED' | 'FLETE_POR_PAGAR';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    branchId: string;
    userId: string;
    userName?: string;
    message: string;
    metadata: AuditAlertMetadata;
    isRead: boolean;
    createdAt: Timestamp | Date | FieldValue;
    // Resolución (cerrada por gerencia con nota)
    resolved?: boolean;
    resolvedBy?: string;
    resolvedByName?: string;
    resolvedAt?: Timestamp | Date | FieldValue;
    resolutionNote?: string;
}

export interface Supplier {
    id?: string;
    razonSocial: string; // Company Name
    nit?: string;
    contacto?: string; // Contact Person
    telefono?: string;
    email?: string;
    direccion?: string;
    pais?: string;
    ciudad?: string;
    estado?: string;
    branchId?: string; // Specific branch for this supplier
    isActive: boolean; // Added for Soft-Delete (Phase 8)
    createdAt?: Timestamp | Date | FieldValue;
    updatedAt?: Timestamp | Date | FieldValue;
}

// ─── Empresas y Cuentas (NUEVO) ─────────────────────────────────
// Empresa: agrupador comercial global. NO contiene datos fiscales.
export interface Empresa {
    id?: string;
    nombre: string;             // "GLOBALVOL PARTS"
    notas?: string;
    logoUrl?: string;           // Firebase Storage URL
    isActive: boolean;
    // Métricas denormalizadas (recalculables, opcionales)
    cuentaCount?: number;
    saldoTotal?: number;        // suma de saldos en BOB
    createdAt?: Timestamp | Date | FieldValue;
    updatedAt?: Timestamp | Date | FieldValue;
}

// SupplierAccount: la cuenta real con NIT, dirección, saldo, etc.
// Pertenece a una Empresa. Es lo que se selecciona al hacer una compra/pago.
export interface SupplierAccount {
    id?: string;
    empresaId: string;
    empresaNombre: string;      // denormalizado para listas/búsqueda
    alias?: string;             // "GLOBALVOL NIT-A", "Sucursal Cobija"
    razonSocial: string;        // razón social fiscal de esta cuenta
    nit?: string;
    contacto?: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    pais?: string;
    ciudad?: string;
    estado?: string;
    saldo?: number;             // BOB. Positivo = nosotros le debemos. Negativo = ellos nos deben.
    branchId?: string;          // null/undefined = global (todas las sucursales)
    tipo?: 'PROVEEDOR' | 'CLIENTE' | 'AMBOS'; // por compatibilidad. Default PROVEEDOR.
    isDefault?: boolean;        // cuenta por defecto al elegir esta empresa
    isActive: boolean;
    createdAt?: Timestamp | Date | FieldValue;
    updatedAt?: Timestamp | Date | FieldValue;
}

export interface Transport {
    id?: string;
    tipoTransporte: string;   // Terrestre, Aéreo, Marítimo, Encomienda, etc.
    razonSocial: string;       // Nombre / Razón Social
    telefono?: string;
    nit?: string;
    ubicacion?: string;
    anotaciones?: string;      // Notas de servicio (opcional)
    branchId?: string;
    isActive: boolean;
    createdAt?: Timestamp | Date | FieldValue;
    updatedAt?: Timestamp | Date | FieldValue;
}

export interface Category {
    id?: string;
    nombre: string;
    description?: string;     // Added for Technical Hierarchy (Phase 8 Architecture)
    parentCategoryId?: string; // For Nested Categories (Motor -> Injection)
    createdAt?: Timestamp | Date | FieldValue;
    updatedAt?: Timestamp | Date | FieldValue;
}

export interface PurchaseItem {
    id?: string;
    productId: string;
    productCode?: string;
    productName: string;
    quantity: number;
    cost: number; // Unit Cost
    subtotal?: number;
    returnedQuantity?: number;
    unit?: string; // e.g. "CAJA", "PACK"
}

export interface Purchase {
    id?: string;
    supplierId: string;
    supplierName: string;
    date: Date | Timestamp | FieldValue;
    items?: PurchaseItem[];
    itemCount?: number;
    total: number;
    status: 'RECEIVED' | 'PENDING' | 'PARTIALLY_RETURNED' | 'RETURNED';
    notes?: string;
    branchId: string; // Mandatory for data isolation
    usuarioId?: string;
    usuarioEmail?: string;
    usuarioNombre?: string;
    /** Método de pago de la compra: EFECTIVO descuenta caja; TRANSFERENCIA/QR no toca caja; CREDITO suma al saldo del proveedor */
    paymentMethod?: 'EFECTIVO' | 'TRANSFERENCIA' | 'QR' | 'CREDITO';
    /** Referencia bancaria o número de comprobante (para TRANSFERENCIA/QR) */
    paymentReference?: string;
    /** Fecha de vencimiento (solo CREDITO) */
    dueDate?: Date | Timestamp | FieldValue;
    /** Si generó un movimiento de caja, su id */
    cashMovementId?: string;
}

export interface InventoryMovement {
    id?: string;
    productId: string;       // Ref a Product.id (Sucursal)
    masterId: string;        // Ref a MasterProduct.id (Global)
    type: 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'TRASP_SALIDA' | 'TRASP_ENTRADA' | 'TRASP_REVERSAL' | 'ANULACION' | 'GARANTIA_SALIDA' | 'GARANTIA_ENTRADA' | 'AJUSTE_MASIVO' | 'CARGA_INICIAL' | 'REPOSICION';
    quantity: number;
    currentStock: number;
    previousStock: number;
    unitCost?: number;        // Costo al momento del movimiento (FIFO tracking)
    referenceId?: string;
    reason: string;
    date: Date | Timestamp | FieldValue;
    userId?: string;
    branchId: string;
    userEmail?: string;
    userName?: string;
    notes?: string;
    createdAt?: Date | Timestamp | FieldValue;
    updatedAt?: Date | Timestamp | FieldValue;
}

// ===== RBAC TYPES =====

export interface Role {
    id?: string;
    name: string;           // "Cajero", "Almacenero", etc.
    description?: string;
    allowedRoutes: string[]; // ["/pos", "/cash", "/sales"]
    /**
     * Permisos granulares concedidos por este rol (sistema RBAC v2).
     * Strings del catálogo `PERMISSIONS` en `src/lib/permissions.ts`.
     * Para roles del sistema este campo se ignora a favor de
     * `DEFAULT_ROLE_PERMISSIONS` en código (fuente de verdad).
     */
    permissions?: string[];
    isSystem: boolean;       // true = GERENTE (immutable)
    createdAt?: Timestamp | FieldValue;
    createdBy?: string;
}

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    role: string; // Dynamic role ID from Firestore roles collection
    createdAt: Timestamp | FieldValue;
    lastLogin: Timestamp | FieldValue;
    disabled?: boolean;
    // Multi-branch fields
    branchId?: string;
    branchName?: string;
    canAccessAllBranches?: boolean; // Only for HQ admins
}

export interface QuotationItem {
    id?: string;
    productId: string;
    productCode?: string;
    productName: string;
    productCodigoFabrica?: string; // Persist factory code
    productCodigoOE?: string;      // Persist OE code
    productMarca?: string;         // Persist Brand
    quantity: number;
    unitPrice: number;
    priceMode: 'CON_FACTURA' | 'SIN_FACTURA';
    priceSinFactura?: number;
    priceConFactura?: number;
    subtotal: number;
    isVoided?: boolean;
}

export interface Quotation {
    id?: string;
    cliente: Client;
    items?: QuotationItem[];
    total: number;
    subtotal: number;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED';
    validUntil: Date | Timestamp | FieldValue;
    fecha: Date | Timestamp | FieldValue;
    isTaxed?: boolean;
    usuarioId?: string;
    usuarioEmail?: string;
    usuarioNombre?: string;
    notes?: string;
    branchId: string;
}

// ===== MULTI-BRANCH TYPES =====

export interface Branch {
    id?: string;
    name: string;           // "Central", "Sucursal Norte"
    code: string;           // "HQ", "NORTE", "SUR"
    address?: string;
    phone?: string;
    city?: string;
    email?: string;
    website?: string;
    nit?: string;
    logoUrl?: string;
    qrImageUrl?: string;
    isHQ: boolean;          // true = sede central
    /** Operativa de la sucursal: VENTA = punto de venta (caja diaria); MATRIZ = administrativa (compras/banco, sin caja física obligatoria) */
    tipo?: 'VENTA' | 'MATRIZ';
    status: 'ACTIVE' | 'INACTIVE';
    createdAt?: Timestamp | FieldValue;
    config?: {
        canReceiveTransfers: boolean;
        canRequestTransfers: boolean;
        currency?: string;
        taxRate?: number;
        defaultAccounts?: {
            QR?: string | null;
            TRANSFERENCIA?: string | null;
        };
        receiptDetails?: {
            bankAccountId?: string | null;
            walletAccountId?: string | null;
            bankName?: string;
            accountNumber?: string;
            accountHolder?: string;
            accountTypeLabel?: string;
            qrImageUrl?: string;
        };
    };
}

export interface StockTransferItem {
    id?: string;
    productId: string;
    masterId: string; // Identidad global inmutable
    productName: string;
    productCode?: string;
    quantity: number; // En PENDING: Solicitada. En COMPLETED: Realmente recibida.
    costo?: number; 
    originalQuantity?: number; 
    shippedQuantity?: number;  // Cantidad que salió del origen (para histórico)
    receivedQuantity?: number; // Cantidad final recibida (para auditoría de discrepancias)
    discrepancyReason?: string;
    targetProductId?: string;  // ID del producto en la sucursal destino
    availableStock?: number; 
}

export interface StockTransfer {
    id?: string;
    type?: 'ENVIO' | 'PEDIDO';
    fromBranchId: string;
    fromBranchName: string;
    toBranchId: string;
    toBranchName: string;
    items?: StockTransferItem[];
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
    requestedBy: string;
    requestedByName?: string;
    requestedAt: Timestamp | FieldValue;
    approvedBy?: string;
    approvedByName?: string;
    approvedAt?: Timestamp | FieldValue;
    completedAt?: Timestamp | FieldValue;
    completedBy?: string;
    completedByName?: string;
    rejectedBy?: string;
    rejectedByName?: string;
    rejectedAt?: Timestamp | FieldValue;
    rejectionReason?: string;
    expiresAt?: Timestamp | Date | FieldValue;
    notes?: string;
    // Transport fields
    transportId?: string;
    transportMethod?: string;
    transportPaymentType?: 'POR_PAGAR' | 'PAGADO';
    transportCost?: number;
    itemCount?: number;
    totalUnits?: number;
    receivedUnits?: number; // Actual units received (may differ from totalUnits if adjusted)
    isAdjusted?: boolean; // Flag to indicate if the transfer was modified while in transit
    // Undo tracking
    isUndone?: boolean;
    undoneAt?: Timestamp | FieldValue;
    undoneBy?: string;
    undoneByName?: string;
}

export interface AdminLog {
    id: string;
    adminId: string;
    adminEmail: string;
    action: string;
    targetUid: string;
    branchId: string;
    details: string;
    timestamp: Timestamp | Date | FieldValue;
}

// GLOBAL CONFIG
export interface AppConfig {
    id?: string;
    branchName?: string;       // Dynamic for branch-specific config
    address: string;
    phone: string;
    email?: string;
    city?: string;
    website?: string;
    currency: string;          // Global or local currency (BOB, USD)
    exchangeRate: number;      // Tasa de cambio referencial BCB (ej: 9.30)
    exchangeRateMode: 'MANUAL' | 'AUTO'; // Added for Phase 8 Architecture
    taxRate: number;           // Ej: 0.13
    companyName: string;
    nit: string;
    whatsappSupport?: string;
    qrImageUrl?: string;
    bankName?: string;
    accountNumber?: string;
    accountType?: string;      // Caja Ahorro, Cuenta Corriente
    accountHolder?: string;
    // === Políticas operativas (Centro de Gerencia) ===
    allowRetroactiveSales?: boolean;        // Permite ventas con fecha anterior a hoy (TODOS los roles)
    allowRetroactivePurchases?: boolean;    // Permite compras con fecha anterior a hoy (TODOS los roles)
    allowRetroactiveExpenses?: boolean;     // Permite gastos con fecha anterior a hoy (TODOS los roles)
    discountApprovalThresholdPercent?: number; // % de descuento que requiere revisión GERENTE (default 15)
    updatedAt: Date | Timestamp | FieldValue;
}

// === Aprobaciones cross-shift (anulaci\u00f3n de ventas pasadas) ===
export interface PendingVoidApproval {
    id?: string;
    saleId: string;
    saleShortId: string;
    saleTotal: number;
    saleDate: Date | Timestamp | FieldValue;
    saleMethod: string;
    branchId: string;
    requestedBy: string;
    requestedByName: string;
    requestedAt: Date | Timestamp | FieldValue;
    reason: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    approvedBy?: string;
    approvedByName?: string;
    approvedAt?: Date | Timestamp | FieldValue;
    rejectionReason?: string;
}

// === Aprobación post-venta de descuentos altos ===
export interface PendingDiscountApproval {
    id?: string;
    saleId?: string;                 // si la venta ya fue cerrada al momento de revisar
    productId: string;
    productCode: string;
    productName: string;
    branchId: string;
    cashierId: string;
    cashierName: string;
    originalPrice: number;
    finalPrice: number;
    discountMode: 'PERCENTAGE' | 'FIXED_PRICE';
    discountValue: number;
    effectiveDiscountPct: number;
    thresholdPct: number;
    requestedAt: Date | Timestamp | FieldValue;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    resolvedBy?: string;
    resolvedByName?: string;
    resolvedAt?: Date | Timestamp | FieldValue;
    rejectionReason?: string;
}

// CRM - RECORDATORIOS DE CLIENTE
export interface ClientReminder {
    id?: string;
    clientId: string;
    clientName: string;
    clientPhone?: string;
    productId: string;
    productName: string;
    scheduledDate: Date | Timestamp | FieldValue;
    type: 'MAINTENANCE' | 'FOLLOW_UP';
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
    notes?: string;
    branchId: string;
    createdAt: Date | Timestamp | FieldValue;
}

// OPORTUNIDAD - VENTAS PERDIDAS
export interface LostSale {
    id?: string;
    masterId: string;
    productName: string;
    qty: number;
    reason: 'PRICE' | 'STOCK' | 'BRAND' | 'OTHER';
    notes?: string;
    branchId: string;
    userId: string;
    userName?: string;
    date: Date | Timestamp | FieldValue;
}

// ANALITICA - SNAPSHOTS DIARIOS
export interface DailySnapshot {
    id?: string; // YYYY-MM-DD_branchId
    date: string; // YYYY-MM-DD
    branchId: string;
    branchName?: string;
    totalRevenue: number;
    totalCost: number;
    totalMargin: number;
    saleCount: number;
    avgTicket: number;
    topProducts?: { masterId: string, name: string, qty: number }[];
    updatedAt: Date | Timestamp | FieldValue;
}

// ============================================================================
// PEDIDOS & ENVÍOS — Sistema Inter-Sucursales (reemplaza StockTransfer)
// ============================================================================

export type PedidoStatus = 'borrador' | 'vigente' | 'despachado' | 'cancelado';
export type EnvioStatus = 'preparacion' | 'en_transito' | 'recibido' | 'cancelado_devolucion' | 'cancelado_perdida';
export type EnvioCancellationMode = 'devolucion' | 'perdida';

export interface PedidoItem {
    id?: string;
    productId: string;          // ID del producto en sucursal A (emisora)
    masterId: string;           // Identidad global inmutable
    productName: string;
    productCode?: string;
    quantity: number;           // Cantidad solicitada por A
    costo?: number;             // Costo referencial al momento del pedido
    notas?: string;             // Notas por ítem (ej: "marca X específicamente")
}

export interface Pedido {
    id?: string;                // Doc id Firestore (ej: "PED-0012")
    numero: number;             // Correlativo (12)
    codigo: string;             // "PED-0012"
    status: PedidoStatus;

    fromBranchId: string;       // Sucursal A (emisora del pedido)
    fromBranchName: string;
    toBranchId: string;         // Sucursal B (receptora del pedido / quien despacha)
    toBranchName: string;

    fechaRequerida: Timestamp | Date | FieldValue;  // Cuándo se necesita
    notas?: string;

    itemCount?: number;         // Denormalizado para listas
    totalUnits?: number;

    // Auditoría de ciclo de vida
    createdBy: string;
    createdByName: string;
    createdAt: Timestamp | FieldValue;
    updatedAt?: Timestamp | FieldValue;
    lastEditedBy?: string;      // Usado por lock optimista
    lastEditedByName?: string;
    lastEditedAt?: Timestamp | FieldValue;

    validatedBy?: string;
    validatedByName?: string;
    validatedAt?: Timestamp | FieldValue;

    // Desvalidación (GERENTE puede revertir si B aún no actuó)
    devalidatedBy?: string;
    devalidatedByName?: string;
    devalidatedAt?: Timestamp | FieldValue;

    // Cancelación con flujo de aprobación (GERENTE HQ aprueba)
    cancellationPending?: boolean;   // Flag para query eficiente de cola pendiente
    cancellationRequestedBy?: string;
    cancellationRequestedByName?: string;
    cancellationRequestedAt?: Timestamp | FieldValue;
    cancellationReason?: string;
    cancelledBy?: string;
    cancelledByName?: string;
    cancelledAt?: Timestamp | FieldValue;
    // Rechazo de cancelación (queda registro)
    cancellationRejectedBy?: string;
    cancellationRejectedByName?: string;
    cancellationRejectedAt?: Timestamp | FieldValue;
    cancellationRejectionReason?: string;

    // Vínculo con envío generado (1:1)
    envioId?: string;           // "ENV-0012" cuando B genera el envío
    despachadoAt?: Timestamp | FieldValue;
}

export interface EnvioItem {
    id?: string;
    productId: string;          // ID en sucursal B (despachadora)
    masterId: string;
    productName: string;
    productCode?: string;
    qtyPedida: number;          // Lo que A pidió originalmente (0 si es ítem extra)
    qtyEnviada: number;         // Lo que B realmente despacha
    qtyRecibida?: number;       // Lo que A confirma haber recibido
    costo?: number;
    esExtra: boolean;           // true si B agregó este ítem (no estaba en el pedido)
    discrepancyReason?: 'SOBRANTE' | 'FALTANTE' | 'DAÑADO' | 'OTRO';
    discrepancyNote?: string;
}

export type EnvioDiscrepancyStatus = 'pending' | 'approved' | 'rejected';

// Acción que el gerente decide aplicar al aprobar la discrepancia, por ítem.
//  - NO_AJUSTAR: no toca stock origen (deja el estado actual tal cual).
//  - DESCONTAR_ORIGEN: descuenta del origen el delta SOBRANTE (qtyRec - qtyEnv).
//  - DEVOLVER_ORIGEN: suma al origen el delta FALTANTE (qtyEnv - qtyRec) — la diferencia no se envió realmente.
//  - MERMA_ORIGEN: registra movimiento MERMA en origen por el delta FALTANTE/DAÑADO (no devuelve stock).
export type EnvioDiscrepancyItemAction = 'NO_AJUSTAR' | 'DESCONTAR_ORIGEN' | 'DEVOLVER_ORIGEN' | 'MERMA_ORIGEN';

export interface Envio {
    id?: string;                // "ENV-0012" o "ENVD-0001" (envío directo)
    numero: number;             // Correlativo (heredado del pedido o del contador envioDirectoSeq)
    codigo: string;             // "ENV-0012" o "ENVD-0001"
    pedidoId?: string;          // "PED-0012" — opcional: ausente en envíos directos sin pedido
    isDirect?: boolean;         // true cuando se creó sin pedido origen
    status: EnvioStatus;

    fromBranchId: string;       // Sucursal B (despachadora)
    fromBranchName: string;
    toBranchId?: string;        // Sucursal A (receptora del envío) — solo si destino es sucursal
    toBranchName?: string;      // Nombre de la sucursal destino (solo si destino es sucursal)
    
    // Destino cliente (envíos directos a cliente externo)
    clientId?: string;          // ID del cliente destino (solo si destino es cliente)
    clientName?: string;        // Razón social del cliente (solo si destino es cliente)
    clientNit?: string;         // NIT del cliente (solo si destino es cliente)

    notas?: string;
    itemCount?: number;
    totalUnitsEnviadas?: number;
    totalUnitsRecibidas?: number;

    // Transporte (opcional)
    transportId?: string;
    transportMethod?: string;
    transportPaymentType?: 'POR_PAGAR' | 'PAGADO';
    transportCost?: number;
    transportPaymentMethod?: 'EFECTIVO' | 'QR' | 'TRANSFERENCIA';
    transportBankRef?: string;
    transportName?: string;       // Razón social del transportista (snapshot al momento de crear/editar)
    transportExpenseId?: string;  // ID del gasto operativo generado automáticamente
    /** Solo cuando transportPaymentType === 'POR_PAGAR': ID de la sucursal que debe pagar (normalmente la receptora). Para envíos a cliente este campo es null. */
    transportPaymentTarget?: string;

    // Auditoría
    createdBy: string;
    createdByName: string;
    createdAt: Timestamp | FieldValue;

    despachadoBy?: string;
    despachadoByName?: string;
    despachadoAt?: Timestamp | FieldValue;

    recibidoBy?: string;
    recibidoByName?: string;
    recibidoAt?: Timestamp | FieldValue;

    /** Marca envíos que pasaron a 'recibido' automáticamente (ej: cliente externo, sin confirmación interna). */
    autoReceivedReason?: 'CLIENTE_EXTERNO';

    // Edición durante en_transito (queda registrada)
    editedInTransit?: boolean;
    lastTransitEditAt?: Timestamp | FieldValue;
    lastTransitEditBy?: string;
    lastTransitEditByName?: string;

    // Edición de cabecera durante `preparacion` (queda registrada)
    lastHeaderEditAt?: Timestamp | FieldValue;
    lastHeaderEditBy?: string;
    lastHeaderEditByName?: string;

    hasDiscrepancy?: boolean;   // True si qtyRecibida != qtyEnviada en algún ítem

    // Resolución de discrepancia (gerencia)
    discrepancyStatus?: EnvioDiscrepancyStatus;          // pending al recibir con diff; approved/rejected tras revisión
    discrepancyResolvedBy?: string;
    discrepancyResolvedByName?: string;
    discrepancyResolvedAt?: Timestamp | FieldValue;
    discrepancyResolutionNote?: string;
    discrepancyAlertId?: string;                          // Alerta TRANSFER_DISCREPANCY asociada
    discrepancyItemActions?: Record<string, EnvioDiscrepancyItemAction>; // productId → acción aplicada al aprobar

    // Cancelación en tránsito (aprueba GERENTE HQ)
    cancellationPending?: boolean;
    cancellationMode?: EnvioCancellationMode;       // devolución: stock vuelve a B; pérdida: stock no vuelve
    cancellationRequestedBy?: string;
    cancellationRequestedByName?: string;
    cancellationRequestedAt?: Timestamp | FieldValue;
    cancellationReason?: string;
    cancelledBy?: string;
    cancelledByName?: string;
    cancelledAt?: Timestamp | FieldValue;
    cancellationRejectedBy?: string;
    cancellationRejectedByName?: string;
    cancellationRejectedAt?: Timestamp | FieldValue;
    cancellationRejectionReason?: string;
}

