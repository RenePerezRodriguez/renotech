# Módulo Proveedores — Empresas y Cuentas

## ¿Qué es el módulo de Proveedores?

El módulo de Proveedores gestiona el directorio de empresas que abastecen al negocio. Cada proveedor se organiza como una **empresa** que puede tener **múltiples cuentas** (distintos NIT, sucursales del proveedor, líneas de crédito separadas). Desde aquí se controlan las deudas pendientes con proveedores y los saldos a favor.

## Estructura: Empresa → Cuentas

- **Empresa**: la razón social del proveedor (ej: "Distribuidora ABC"). Agrupa todas las cuentas.
- **Cuenta de proveedor**: cada NIT o entidad específica dentro de la empresa. Una empresa puede tener varias cuentas si opera con varios NIT o condiciones de pago distintas.

## Información de cada empresa proveedora

- **Nombre**: razón social del proveedor
- **Logo**: opcional, se muestra en la tarjeta
- **Cuentas**: cantidad de cuentas activas asociadas
- **Saldo total**: suma de saldos de todas las cuentas activas
  - **Rojo (positivo)**: deuda pendiente de pago al proveedor
  - **Verde (negativo)**: saldo a favor (el proveedor nos debe)

## KPIs del módulo

- **Empresas**: total de proveedores registrados
- **Por Pagar**: suma total de deuda con todos los proveedores que tienen saldo positivo
- **A Favor**: suma de saldos favorables (proveedores que nos deben)
- **Devuelto**: total acumulado de devoluciones registradas

## Cómo registrar un nuevo proveedor (solo GERENTE)

1. Haz clic en **"Nueva Empresa"**.
2. Completa: nombre, logo (opcional).
3. Dentro de la empresa, agrega las **cuentas**: razón social, NIT, alias, condiciones de pago.
4. Guarda. El proveedor ya está disponible al crear compras.

## Cómo ver el detalle de un proveedor

Haz clic en cualquier tarjeta de empresa. El panel lateral muestra:
- Listado de cuentas con sus saldos individuales
- Historial de compras asociadas
- Historial de devoluciones
- Botón **"Pagar"** para registrar un pago al proveedor

También puedes hacer **clic derecho** sobre una tarjeta para acceder rápidamente a "Ver detalles", "Pagar" o "Editar".

## Cómo registrar un pago a proveedor

1. Haz clic en la tarjeta del proveedor.
2. En el panel lateral, selecciona la cuenta a pagar y haz clic en **"Pagar"**.
3. Ingresa el monto, el método de pago y el concepto.
4. Confirma. El saldo de la cuenta se actualiza inmediatamente.

## Filtros

- **Todas**: muestra todos los proveedores
- **Por pagar**: solo proveedores con deuda pendiente (saldo positivo)
- **A favor**: solo proveedores con saldo a tu favor

La barra de búsqueda filtra por nombre de empresa, NIT o alias de cuenta.

## Devoluciones

Desde el detalle de un proveedor puedes registrar **devoluciones de mercadería**. El sistema ajusta automáticamente el saldo de la cuenta correspondiente.

## ¿Qué puede consultar el asistente?

**Tiempo real (Firestore):**
- "¿Qué proveedores tenemos?" → `get_suppliers` (lista con saldos)
- "¿Cuánto le debemos a [proveedor]?" → `get_suppliers` con búsqueda por nombre
- "¿Qué proveedores tienen saldo por pagar?" → `get_suppliers` con filter: por_pagar
- "¿Cuántos proveedores hay?" → `get_entity_counts` (type: suppliers)
- "¿Cuáles son las últimas compras a [proveedor]?" → `get_recent_purchases`

## Restricciones de rol

- **VENDEDOR**: sin acceso al módulo de Proveedores.
- **ENCARGADO**: puede ver el directorio de proveedores. No puede crear ni editar.
- **GERENTE**: acceso completo — crear empresas y cuentas, editar, eliminar, registrar pagos y devoluciones.
