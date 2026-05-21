# 🎨 Impacto en UI y Componentes: Renotech

Este documento detalla cómo la nueva arquitectura "Ficha Única + Existencia" cambia el comportamiento de las pantallas principales del sistema.

---

## 📅 1. Vista de Inventario (InventoryTable / ProductGrid)

**Cambio Crítico: El "Virtual Join"**
Antes, cada fila de la tabla era un documento independiente. Ahora, para renderizar la tabla de inventario, el sistema debe realizar una unión en tiempo real (o hidratación):

1. **Carga de Datos**: El hook `useProducts` carga la colección `productos` de la sucursal.
2. **Hidratación de Metadata**: Cruza el `masterId` con una caché local del `catalogo_maestro`.
3. **Visualización**: El usuario ve `nombre`, `marca` y `codigo` (del Maestro) junto a `stock` y `precio` (de la Sucursal).

---

## 🛒 2. Punto de Venta (POS / Cart)

**Búsqueda Global e Inteligente**
* **Selector**: La búsqueda ahora se realiza sobre el `catalogo_maestro` (usando `searchTags`).
* **Validación de Stock**: Al seleccionar un producto del Maestro, el sistema verifica inmediatamente el documento de `productos` de la sucursal actual para mostrar el stock disponible.
* **Multidivisa**: El widget de "Total" ahora muestra una conversión dinámica a USD basada en la `config_global.exchangeRate`.
* **Modo Cotización**: Productos con stock 0 se agregan al carrito en modo cotización (proforma). Badge "Solo Cotización" visible en amarillo.

### 2.1 Sistema de Descuentos en POS

**Aplicación Inline por Producto**
* **Trigger**: Ícono de Tag (🏷️) en cada CartItem del carrito.
* **Popover Inline**: Se despliega debajo del producto con:
    * Toggle `%` / `Bs.` para seleccionar tipo de descuento.
    * Input numérico con soporte Enter (aplicar) / Escape (cancelar).
    * Botón "Aplicar" con estilo Industrial Premium (`bg-yellow-500 text-black`).
* **Indicadores Visuales en CartItem**:
    * Precio original tachado (`line-through`) cuando hay descuento activo.
    * Badge azul con porcentaje o monto del descuento.
    * Botón ✕ para remover descuento.
* **Auditoría**: Toast informativo al aplicar + alerta automática a gerencia si umbral excedido.

### 2.2 Cola Offline e Indicador de Conexión

**Resiliencia de Ventas**
* **Indicador en Header del Carrito**:
    * Badge `Offline` (amarillo, ícono WifiOff) cuando `navigator.onLine === false`.
    * Badge `Online` (azul, ícono Wifi) cuando hay ventas pendientes en cola.
    * Botón "N en cola" clickeable para forzar sincronización manual.
* **Flujo Offline**: Si `processSale()` falla por red, la venta se encola en localStorage y el carrito se limpia con toast warning.
* **Auto-Sync**: Al reconectar, el hook `useOfflineQueue` sincroniza automáticamente las ventas pendientes.

### 2.3 Atajos de Teclado (KeyboardGuide)

**Componente Flotante de Ayuda**
* **Ubicación**: Botón flotante bottom-right (icono `⌨` en amarillo).
* **Toggle**: F1 abre/cierra el modal de guía.
* **Contenido**: Lista de atajos con tecla (`<kbd>`) + descripción + área de aplicación.
* **Atajos documentados**: F1 (guía), F3 (buscar), F9 (cobrar), Esc (cerrar/limpiar), 3* (cantidad).
* **Diseño**: Industrial Premium — header `bg-slate-900`, `rounded-2xl`, labels `font-black tracking-[0.2em]`.

---

## 🎨 2.4 Sistema de Diseño Industrial Premium (Suite Pro v4.0)

**Línea Gráfica Unificada** (Referencia: `.agent/workflows/graphic-line.md`)

Todos los componentes POS siguen las siguientes constantes visuales:

| Token | Valor Light | Valor Dark |
| :--- | :--- | :--- |
| Accent Primary | `blue-500` | `blue-600` |
| Action Primary | `yellow-500 / text-black` | `yellow-500 / text-black` |
| Solid Base | `bg-slate-50` | `bg-[#020617]` |
| Header Banner | `bg-slate-900` | `bg-[#111827]` |
| Precision Borders | `border-slate-200` | `border-white/10` |
| Cards POS | `rounded-2xl` | `rounded-2xl` |

**Tipografía Operativa**:
* Labels: `text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500`
* Dato Maestro: `text-xs font-bold uppercase text-slate-900 dark:text-white`
* Valores Financieros: `tabular-nums font-black text-lg tracking-tighter`
* POS Pills: `rounded-xl px-4 py-2 text-[10px] font-black uppercase`

**Anti-Patrones Prohibidos (Diseño Boludo)**:
* No `backdrop-blur` en dark mode operacionales (Zero-Glass Strategy).
* No espaciado exagerado — dense y scannable.
* No mezclar paletas (teal/emerald/amber inconsistentes → usar blue/yellow/slate).

---

## 🛠️ 3. Modal de Detalle de Producto (ProductDetailModal)

El modal ahora se divide en tres pestañas lógicas:

1. **Pestaña: Ficha Técnica**: Datos globales del Maestro (solo editables por ADMIN/GERENTE).
2. **Pestaña: Existencias**: Datos locales (Stock, Precio local, Ubicación). Es editable por el encargado de sucursal.
3. **Pestaña: Historial (Kardex)**: Lista de movimientos consumida directamente de la colección `movimientos` filtrada por `productId`.

---

## 🚛 4. Panel de Transferencias

**Inteligencia de Origen-Destino**
* Al crear una transferencia, el selector sugerirá productos que tengan stock positivo en la sucursal de origen pero stock bajo (`minStock`) en la sucursal de destino.
* **Tracking Visual**: Se añade una barra de progreso que lee el `status` de la transferencia (PENDING -> SENT -> RECEIVED).

---

## 🛒 5. Métodos de Pago Extendidos en POS (PosCart)

### 5.1 Selector de Método
Grid de 4 botones en la zona de checkout del carrito:
* **Efectivo** — Flujo estándar con vuelto.
* **QR** — Flujo directo sin vuelto.
* **Mixto** — Divide el pago entre Efectivo y QR.
* **Cuotas** — Plan de cuotas (2, 3, 4, 6 meses).

### 5.2 UI de Pago Mixto (MIXTO)
Al seleccionar "Mixto":
* Aparecen 2 inputs inline: `splitCash` y `splitQR`.
* Auto-cálculo: al escribir en uno, el otro se ajusta para completar el total.
* Validación: `splitCash + splitQR === total`.

### 5.3 UI de Cuotas (CUOTAS)
Al seleccionar "Cuotas":
* Selector de plan: botones `2x`, `3x`, `4x`, `6x`.
* Preview: tabla compacta con fechas de vencimiento y monto por cuota.
* Requisito: Cliente seleccionado con línea de crédito.

---

## 💰 6. Módulo de Cuentas Corrientes (`/cuentas-corrientes`)

**Propósito**: Control centralizado de cartera de cuotas pendientes.

### 6.1 KPIs (4x Grid)
| KPI | Color | Icono |
| :--- | :--- | :--- |
| Pendiente (Bs.) | `amber` | `Clock` |
| Vencido (Bs.) | `red` | `AlertTriangle` |
| Cobrado (Bs.) | `blue` | `CheckCircle2` |
| Cartera Total (Bs.) | `gold` (highlight) | `Banknote` |

### 6.2 Tabla de Cuotas
* **Columnas**: Cliente, Cuota (N/Total), Monto, Restante, Vencimiento, Estado, Acciones.
* **Status Badges**: `Pendiente` (yellow), `Vencida` (rose), `Pagada` (blue).
* **Fila vencida**: Fondo `bg-rose-50/30 dark:bg-rose-950/10`.
* **Acción**: Botón "Cobrar" (`bg-yellow-500 text-black`).
* **Responsive**: Desktop = tabla, Mobile = cards compactas.

### 6.3 Modal de Cobro (IndustrialModal)
* Tema: `stealth`.
* Selector de método: 3 botones (Efectivo/Tarjeta/QR).
* Input de monto pre-llenado con `remainingBalance`.
* Notas opcionales.
* Acción: `InstallmentService.registerPayment()` → actualiza cuota, cliente, caja y auditoría en transacción atómica.
