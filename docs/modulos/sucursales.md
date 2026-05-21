# Módulo Sucursales — Gestión de Sedes

## ¿Qué es el módulo de Sucursales?

Panel de administración para registrar y gestionar las sedes físicas del negocio. Solo accesible para el rol **GERENTE** desde la **Casa Matriz (HQ)**. Las sucursales de tipo VENTA pueden ver la lista en modo lectura.

Acceso: menú **Configuración → Sucursales** (ruta `/configuracion/sucursales`).

---

## Tipos de sucursal

| Tipo | Descripción |
|---|---|
| **MATRIZ** | Casa Matriz (HQ). Solo puede haber una. Tiene permisos de administración total |
| **VENTA** | Sucursal operativa. Puede operar ventas, caja, inventario y envíos |

---

## Estructura de una sucursal

Cada sucursal tiene:
- **Nombre**: nombre comercial de la sede (normalizado automáticamente a mayúsculas iniciales)
- **Código**: asignado automáticamente por el sistema (HQ, S-001, S-002, etc.)
- **Dirección**: ubicación física
- **Teléfono**: número de contacto
- **Estado**: ACTIVE (activa) o INACTIVE (inactiva)
- **Tipo**: MATRIZ o VENTA

Al crear una sucursal, el sistema provisiona automáticamente sus cuentas de **Caja** y **Bóveda** en tesorería.

---

## Acciones disponibles (desde HQ)

### Crear sucursal
Abre el formulario de registro con: nombre, dirección, teléfono y tipo. El código lo asigna el sistema. Si es la primera sucursal del sistema, se crea automáticamente como MATRIZ.

### Editar sucursal
Modifica nombre, dirección, teléfono. Si se cambia el nombre, el sistema sincroniza los nombres de las cuentas de caja/bóveda asociadas.

### Activar / Desactivar
Cambia el estado de ACTIVE a INACTIVE o viceversa. **No se puede desactivar la Casa Matriz.** Las sucursales inactivas dejan de aparecer como opción de selección en operaciones.

### Eliminar
Solo disponible para sucursales sin movimientos registrados (sin productos asignados, sin ventas y sin usuarios activos). **No se puede eliminar la Casa Matriz.**

---

## Restricciones

- La **Casa Matriz (HQ)** no puede desactivarse ni eliminarse
- Solo el gerente desde HQ puede crear, editar o eliminar sucursales
- Los encargados y vendedores pueden ver la lista en modo lectura (sin acciones)
- No puede haber dos sucursales HQ simultáneamente

---

## Vista en modo lectura (desde sucursales de venta)

Cuando un encargado accede desde su sucursal, ve la lista completa pero sin botones de acción. Aparece un aviso azul indicando que los cambios solo pueden realizarse desde la Sede Central.

---

## Estado en tiempo real

El selector de sucursal en el header del sistema usa la lista de sucursales activas. Al crear o desactivar una sucursal, el cambio se refleja en tiempo real en el selector de todas las sesiones activas.
