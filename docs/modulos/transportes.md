# Módulo Transportes — Directorio de Transportistas

## ¿Qué es el módulo de Transportes?

El módulo de Transportes es el directorio de empresas y personas que prestan servicios de transporte de mercancía entre sucursales. Un transportista registrado puede asignarse a un envío para registrar el costo del flete y llevar estadísticas de uso.

## Información de cada transportista

- **Razón social**: nombre de la empresa o persona
- **NIT**: número de identificación tributaria
- **Tipo de transporte**: terrestre, aéreo, moto, etc.
- **Teléfono**: contacto directo
- **Ubicación**: ciudad o zona de operación
- **Anotaciones**: notas adicionales (horarios, condiciones, etc.)

## Estadísticas de uso

Cada tarjeta de transportista muestra automáticamente:
- **Número de envíos** realizados con ese transportista
- **Costo total de fletes** acumulado
- **Último uso**: fecha del envío más reciente
- **Sucursales** en las que ha operado

Estas estadísticas se calculan en tiempo real cruzando los envíos registrados.

## Cómo registrar un transportista (solo GERENTE)

1. Haz clic en **"Nuevo Transporte"**.
2. Completa: razón social, NIT, tipo de transporte, teléfono, ubicación y anotaciones opcionales.
3. Guarda. El transportista ya está disponible para asignarse a futuros envíos.

## Cómo asignar un transportista a un envío

Al crear un envío desde el módulo de Envíos, hay un paso opcional para seleccionar el transportista y registrar el costo del flete (pagado o por pagar).

## Búsqueda y filtros

La barra de búsqueda filtra por razón social, NIT, tipo de transporte o ubicación en tiempo real.

## ¿Qué puede consultar el asistente?

**Tiempo real (Firestore):**
- "¿Qué transportistas tenemos?" → `get_transporters` (lista completa con contactos)
- "¿Cuál es el teléfono de [transportista]?" → `get_transporters` con búsqueda por nombre
- "¿Cuántos transportistas hay?" → `get_entity_counts` (type: transporters)
- "¿Qué transportistas de tipo terrestre tenemos?" → `get_transporters` con filtro por tipo

**Análisis histórico (SQL):**
- Los fletes de transportistas no están actualmente en BigQuery — usar `get_transporters` para datos en tiempo real.

## Restricciones de rol

- **VENDEDOR / ENCARGADO**: puede ver el directorio de transportistas. No puede crear ni editar.
- **GERENTE**: acceso completo — crear, editar y eliminar transportistas.
