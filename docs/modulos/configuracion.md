# Módulo Configuración — Ajustes del Sistema

## ¿Qué es el módulo de Configuración?

Hub central de ajustes del sistema. Permite al gerente configurar la identidad comercial del negocio, el tipo de cambio monetario y ejecutar operaciones de mantenimiento. Está dividido en tres pestañas y permite configurar globalmente o por sucursal específica.

Acceso: menú **Configuración → Ajustes** (ruta `/configuracion`, rol GERENTE).

---

## Selector de sucursal

En la parte superior aparece un selector (solo para gerentes con acceso multi-sucursal) para elegir entre:
- **Configuración Global**: aplica a todas las sucursales por defecto
- **Sucursal específica**: sobrescribe los datos para esa sede en particular

---

## Pestaña Identidad

Datos de la empresa que aparecen en **facturas, recibos, PDF y proformas**:

| Campo | Descripción |
|---|---|
| Nombre Comercial | Nombre de la sucursal o empresa que aparece en documentos |
| NIT / ID Fiscal | Número de identificación tributaria |
| Dirección Completa | Ubicación física de la sede |
| Ciudad / País | Ej: Sucre, Bolivia |
| Teléfono | Número de contacto principal |
| Correo Electrónico | Email de contacto |
| Sitio Web | URL de la empresa |

Es importante mantener el NIT actualizado para la validez de los comprobantes fiscales.

---

## Pestaña Finanzas

### Tipo de Cambio USD → BOB
Configura la tasa de conversión de dólares a bolivianos usada en ventas y reportes:

- **Modo Manual**: se ingresa el valor directamente
- **Modo Automático (BCB)**: se sincroniza con el Banco Central de Bolivia al iniciar sesión

El botón **"Sincronizar BCB"** actualiza el tipo de cambio en tiempo real desde la fuente oficial (bcb.gob.bo).

### Cuentas bancarias y QR
Las cuentas bancarias y la imagen QR para recibos se administran desde el módulo **Tesorería** (pestaña Configuración). Este panel solo muestra el enlace directo.

---

## Pestaña Mantenimiento

### Aplicación PWA
Permite instalar Renotech como aplicación nativa en el dispositivo (Android, Windows, iOS). Solo aparece si el navegador soporta instalación PWA.

### Cierre Administrativo (Snapshots)
Genera un **snapshot de cierre del día**: consolida ventas, costos y márgenes del día para el historial de auditoría y análisis en BigQuery. Es una acción inmutable — no se puede deshacer. Recomendado ejecutarse al final del día.

### Backup de Continuidad
Disponible solo desde HQ. Exporta todas las colecciones del sistema (catálogo, ventas, clientes, etc.) en formato JSON. Recomendado realizarlo semanalmente.

### Zona de Peligro — Purga de Base de Datos
**Solo HQ, solo GERENTE.** Borra permanentemente todo el catálogo, ventas e historial operativo. Los usuarios y la configuración básica se conservan. Requiere confirmar escribiendo la frase **"BORRAR TODO"**. Esta acción es irreversible.

---

## Guardar cambios

El botón **"Sincronizar Configuración"** en la parte inferior guarda todos los cambios de la pestaña activa. Los cambios aplican de inmediato para la sucursal seleccionada.

---

## Sub-páginas de Configuración

- **`/configuracion/sucursales`** — Gestión de sedes (crear, editar, activar/desactivar). Ver doc: sucursales.md
- **`/configuracion/actualizar-precios`** — Actualización masiva de precios del catálogo
- **`/usuarios`** — Gestión de usuarios y accesos. Ver doc: usuarios.md

---

## Restricciones

- Solo el rol **GERENTE** accede a este módulo
- La purga de base de datos requiere estar en HQ y confirmación explícita
- Los backups y cierres administrativos solo pueden hacerse desde HQ
- Los cambios de tipo de cambio aplican a todas las sucursales simultáneamente
