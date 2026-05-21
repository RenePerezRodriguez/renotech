# 💻 Estándares de Código y Estructura: Renotech

Este documento define la **Arquitectura de Software** del frontend de Renotech. El objetivo es mantener una base de código modular, testeable y de alto rendimiento.

---

## 1. Organización de Carpetas (`src/`)

Para la Ficha Única, adoptaremos una estructura de **Capas de Responsabilidad**:

| Carpeta | Responsabilidad | Regla de Oro |
| :--- | :--- | :--- |
| `src/app` | Rutas y Páginas (Next.js). | Mantener las páginas delgadas (solo composición). |
| `src/components` | UI Reutilizable (Botones, Tablas, Modales). | Sin lógica de Firebase. Solo Props. |
| `src/services` | Comunicación con Firestore (API). | Solo Promesas/Async. Sin estado de React. |
| `src/hooks` | Orquestación de Datos y Efectos. | Centralizar la lógica de carga y suscripción. |
| `src/store` | Estado Global Ligero (Zustand). | Solo datos volátiles (Carrito, Filtros). |
| `src/logic` | **[NUEVO]** Matemática de Negocio Pura. | Funciones puras (Cálculo de IVA, Totals, ABC). |
| `src/types` | Definición de Interfaces (TypeScript). | Centralización absoluta de Types. |
| `src/utils` | Librerías de terceros y configuración. | Cero lógica de negocio. |
| `src/config` | Configuración de UI (Menú, rutas). | Solo mapas estáticos. |
| `src/contexts` | Proveedores React (Auth, Branch, Theme). | Wrapping de estado global vía Context API. |

---

## 2. Convenciones de Nomenclatura (Strict Naming)

* **Componentes**: PascalCase (`ProductCard.tsx`).
* **Hooks**: camelCase con prefijo 'use' (`useInventory.ts`).
* **Servicios**: PascalCase finalizando en 'Service' (`ProductService.ts`).
* **Interfaces**: PascalCase sin prefijo 'I' (`MasterProduct`).
* **Variables de Entorno**: UPPER_SNAKE_CASE (`NEXT_PUBLIC_FIREBASE_API_KEY`).
* **Archivos de Lógica**: camelCase funcional (`pricing.ts`).

---

## 3. Patrón de Servicios (Clean API)

Cada servicio debe seguir el patrón de **Objeto de Dominio**. No se permite lógica de interfaz (toasts, redirects) dentro de los servicios.

```typescript
// Ejemplo de patrón en ProductService.ts
export const ProductService = {
    async getMasterProduct(id: string): Promise<MasterProduct>;
    async getStoreStock(masterId: string, branchId: string): Promise<ProductStock>;
}
```

---

## 3. Estado Global (Zustand Strategy)

Dividiremos los "Mega-Stores" en tiendas de responsabilidad única:

1. **`usePosStore`**: Solo maneja el Carrito activo en el punto de venta.
2. **`useUIStore`**: Notificaciones, Modales globales y Temas.
3. **`useAuthStore`**: Datos del usuario logueado y su permiso de sucursal.

**Regla**: Si un cálculo (ej: `total * 0.13`) se repite en dos lugares, **DEBE** ir a `src/logic/pricing.ts`, no al Store.

---

## 4. Tipado Estricto (TypeScript Forever)

* **Evitar `any`**: El uso de `any` está prohibido en la arquitectura Maestra.
* **Enums para Estados**: Usar Enums o Literales de Cadenas para estados (Status: 'PENDING' | 'PAID').
* **Utility Types**: Usar `Pick`, `Omit` y `Partial` para evitar duplicar interfaces de base de datos en la UI.

---

## 5. El Hook de Datos Maestro (`useDataHydration`)

La arquitectura Maestra introduce el concepto de **Hidratación en el Hook**:

```typescript
export function useInventory(branchId: string) {
    // 1. Carga Stocks de la sucursal
    // 2. Carga Metadata del Catálogo Maestro
    // 3. Retorna un objeto "Aumentado" con ambos datos.
}
```

---

## 6. Manejo de Errores y Feedback

* **Capas de Error**:
    1. *Servicio*: Lanza el error original de Firebase.
    2. *Hook*: Captura el error y lo guarda en un estado `error`.
    3. *UI*: Muestra un `Toaster` informativo o un `Error Boundary`.

---

## 7. Performance (Memoization)

* Usar `useMemo` para la transformación de listas pesadas (ej: filtros de inventario).
* Usar `useCallback` para funciones pasadas a componentes hijos complejos para evitar re-renderizados innecesarios en el POS.

---

## 🚨 8. Estandarización de Errores (System Error Codes)

Para soporte técnico rápido, los errores deben seguir este formato:

* `E-AUTH-001`: Error de branchId no autorizado.
* `E-INV-002`: Stock insuficiente para transacción atómica.
* `E-POS-003`: Arqueo de caja cerrado o no encontrado.
* `E-TRSF-004`: Intento de recepción de traspaso ya procesado.
* `E-DIS-001`: Descuento no autorizado (rol sin permisos).
* `E-DIS-002`: Descuento excede el umbral máximo permitido.
* `E-OFQ-001`: Cola offline corrupta o no deserializable.

---

## ⌨️ 9. Atajos de Teclado (Keyboard Shortcuts)

El POS implementa atajos globales via `useEffect` + `keydown` listeners:

| Tecla | Acción | Componente | Contexto |
| :--- | :--- | :--- | :--- |
| `F1` | Abrir/cerrar guía de atajos | `KeyboardGuide.tsx` | Global POS |
| `F3` | Enfocar búsqueda de productos | `ProductGrid.tsx` | Global POS |
| `F9` | Iniciar checkout (Cobrar) | `PosCart.tsx` | Carrito con items |
| `Esc` | Cerrar modal activo / Vaciar carrito | `PosCart.tsx` | Context-aware |
| `3*` | Prefijo de cantidad (ej: `3*COD001`) | `ProductGrid.tsx` | Campo de búsqueda |

**Reglas de Implementación**:
* `preventDefault()` obligatorio para evitar comportamiento nativo del navegador.
* Los atajos NO se activan cuando un `<input>` tiene el foco (excepto F-keys y Esc).
* Componente `KeyboardGuide.tsx`: Modal flotante bottom-right con trigger visual.

---

## 📡 10. Arquitectura Offline-First (Cola de Resiliencia)

El POS soporta ventas en modo offline mediante el hook `useOfflineQueue`:

* **Almacenamiento**: `localStorage` bajo clave `renotech_offline_queue`.
* **Estructura**: Array de `QueuedSale` con UUID, datos de venta, timestamp y contador de reintentos.
* **Sincronización**: Automática al reconectar (evento `online`) + polling cada 60s.
* **Reintentos**: Máximo 5 por venta, luego se descarta (stale data).
* **Patrón**: Eventual consistency — prioriza disponibilidad del POS sobre consistencia inmediata.
* **Integración**: `PosCart.confirmCheckout()` detecta fallo de red y desvía a `enqueueOfflineSale()`.
* **Indicador visual**: Badge Online/Offline + contador de cola en header del carrito.
