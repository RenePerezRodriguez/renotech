# Módulo Usuarios — Gestión de Capital Humano

## ¿Qué es el módulo de Usuarios?

Panel de administración de accesos al sistema. Permite al gerente crear, modificar y controlar los perfiles de todos los colaboradores: cajeros, encargados de sucursal y otros gerentes. Incluye asignación de roles, sucursales y gestión de contraseñas.

Acceso: menú **Configuración → Usuarios** (ruta `/usuarios`, rol GERENTE).

---

## Roles disponibles

| Rol | Descripción |
|---|---|
| **GERENTE** | Acceso completo al sistema. Puede ver y gestionar todas las sucursales, aprobar operaciones, acceder a gerencia y estadísticas |
| **ENCARGADO** | Acceso a su sucursal asignada: ventas, caja, inventario, envíos y kardex. No accede a gerencia ni datos consolidados |
| **VENDEDOR** | Solo puede consultar stock y precios, registrar ventas en su turno. No ve datos financieros ni de otras sucursales |

---

## Indicadores (KPIs)

- **Efectivo Total**: número total de usuarios registrados en el sistema
- **Nivel Directivo**: usuarios con rol GERENTE
- **Fuerza Operativa**: usuarios activos (sin suspensión)
- **Accesos Revocados**: usuarios con acceso suspendido

---

## Tabla de usuarios

Columnas visibles:
- **Identidad**: nombre completo o email del colaborador
- **Email / Registro**: correo electrónico y fecha de creación del acceso
- **Rol asignado**: desplegable para cambiar el rol (no disponible para el propio usuario)
- **Sucursal**: sucursal a la que está asignado; "Acceso Total" si puede ver todas
- **Última sincronía**: fecha y hora del último inicio de sesión
- **Acciones**: restablecer contraseña, suspender/restaurar, eliminar

---

## Acciones disponibles

### Crear usuario (Alta de Usuario)
Registra un nuevo colaborador con: email, contraseña inicial, nombre, rol y sucursal. El acceso queda activo inmediatamente. La contraseña inicial debe ser comunicada al colaborador; puede cambiarla en su primer ingreso.

### Cambiar rol
Modifica el rol directamente desde el desplegable en la tabla. El cambio aplica en el próximo inicio de sesión del usuario.

### Asignar sucursal
Reasigna al usuario a otra sucursal desde el desplegable en la columna "Asignación de Unidad". Para gerentes, puede activarse "Acceso Total" para que vean todas las sucursales.

### Restablecer contraseña
Envía un correo de restablecimiento de contraseña al email del usuario vía Firebase Authentication. El usuario recibe el enlace y puede crear una nueva contraseña.

### Suspender / Restaurar acceso
Bloquea o reactiva el inicio de sesión sin eliminar el usuario. El colaborador suspendido recibe un error al intentar ingresar. Útil para bajas temporales o vacaciones.

### Eliminar usuario
Elimina el acceso de forma definitiva. No se puede eliminar el propio usuario activo. Esta acción es irreversible.

---

## Directivas de Rol (Roles Manager)

Disponible solo desde HQ. Permite configurar los permisos detallados de cada rol: qué módulos puede ver, qué acciones puede ejecutar, límites de descuento, etc. Accesible desde el botón "Directivas de Rol".

---

## Acceso multi-sucursal

La opción **"Acceso Total Activo"** (solo visible para GERENTE) permite que un usuario vea datos consolidados de todas las sucursales sin importar cuál tenga asignada. Los encargados y vendedores siempre están limitados a su sucursal.

---

## Restricciones

- El módulo solo es accesible para el rol **GERENTE**
- Un gerente no puede modificar ni eliminar su propia cuenta desde esta pantalla
- Desde sucursales de venta (no HQ) el acceso es en modo lectura
- La eliminación de usuarios es permanente y no tiene deshacer
