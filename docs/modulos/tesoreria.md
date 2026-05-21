# Módulo Tesorería — Control Financiero (solo Gerencia)

## ¿Qué es el módulo de Tesorería?

Tesorería es el centro de control financiero del negocio, exclusivo para el rol GERENTE. Centraliza la visión de todas las cuentas donde vive el dinero del negocio: cajones de efectivo físico, cuentas bancarias y billeteras digitales (QR). Permite registrar transferencias entre cuentas, conciliar extractos bancarios reales e importar estados de cuenta.

> **Importante**: Tesorería es para gerencia. El cajero opera su turno desde el módulo **Caja** (/caja).

## Tipos de cuentas

- **Cajón (CASH_DRAWER)**: efectivo físico de una sucursal. Puede ser de tipo POS (vinculado a sesiones de cajero) o Bóveda (resguardo de excedentes).
- **Banco (BANK)**: cuenta bancaria de la empresa. Muestra el saldo según los asientos registrados en el sistema.
- **Billetera / QR (WALLET)**: monedero digital o código QR para cobros. Ej: Tigo Money, QR de banco.

## Pestañas del módulo

### Cuentas
Vista de todas las cuentas activas con su saldo actual. Cada tarjeta muestra el tipo, nombre, banco/entidad y saldo. Al hacer clic en una cuenta se abre el historial de movimientos (asientos) asociados.

Desde esta pestaña el gerente puede:
- Crear nuevas cuentas bancarias o wallets
- Editar nombre, banco, número de cuenta
- Desactivar cuentas con saldo cero

### Transferencias
Mueve dinero entre dos cuentas del sistema: cajón → banco, banco → bóveda, etc. Cada transferencia genera dos asientos atómicos (EGRESO en origen, INGRESO en destino). Soporta transferencias entre sucursales.

Para registrar una transferencia:
1. Ir a la pestaña **Transferencias**
2. Clic en **"Nueva Transferencia"**
3. Seleccionar cuenta origen, cuenta destino, monto y concepto
4. Confirmar

### Conciliación bancaria
Importa el estado de cuenta bancario en formato Excel. El sistema cruza automáticamente cada línea del extracto con los asientos registrados (mismo monto, fecha y dirección, con tolerancia de ±2 días). Las líneas no matcheadas requieren acción manual: confirmar, crear asiento o marcar como error.

### Configuración
- Cuentas por defecto para cada método de pago (QR, transferencia, efectivo)
- Límites de gasto del cajero
- Umbrales de discrepancia para alertas de arqueo
- Horas máximas de sesión abierta antes de alerta

## ¿Qué puede consultar el asistente?

**Tiempo real (Firestore):**
- "¿Cuánto hay en el banco?" → `get_treasury_accounts` (tipo BANK)
- "¿Cuál es el saldo de la billetera QR?" → `get_treasury_accounts` (tipo WALLET)
- "¿Cuánto tenemos en todas las cuentas?" → `get_treasury_accounts` (consolidado)
- "¿Cuánto hay en la bóveda?" → `get_treasury_accounts` (tipo CASH_DRAWER)

**Análisis histórico (SQL):**
- "¿Cuántas transferencias se hicieron este mes?" → `run_sql` sobre journal_entries
- "¿Cuánto se depositó al banco en el trimestre?" → `run_sql` filtrando por tipo BANK y dirección DEBIT

## Restricciones de rol

- Solo el rol **GERENTE** puede acceder al módulo de Tesorería.
- Vendedores y Encargados son redirigidos al módulo de Caja para la operación diaria.
