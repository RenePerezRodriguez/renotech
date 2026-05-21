# Módulo Caja — Operación Diaria del Cajero

## ¿Qué es el módulo de Caja?

El módulo de Caja gestiona el ciclo completo de un turno de cajero: apertura con saldo inicial, registro de gastos e ingresos durante el turno, y cierre con arqueo final. También incluye vista de Bóveda, cuentas bancarias y wallets digitales, transferencias entre cuentas, y (solo para gerentes) supervisión de sesiones activas e historial de cierres.

## Pestañas del módulo

- **Mi Caja**: vista del cajero — apertura, operación y cierre de su sesión personal
- **Bóveda**: resguardo de excedentes de efectivo de la sucursal
- **Bancos / Wallet**: saldos y movimientos de cuentas bancarias y billeteras digitales (QR)
- **Transferencias**: historial de movimientos entre cuentas (caja, bóveda, banco)
- **Sesiones activas** *(solo GERENTE)*: todas las cajas abiertas en este momento por sucursal y cajero
- **Historial**: sesiones cerradas con discrepancias, totales y método de cierre
- **Ajustes**: cuentas por defecto para QR, transferencias y datos del recibo

## Cómo abrir sesión de caja

1. Entra al módulo de **Caja** → pestaña **Mi Caja**.
2. Si no hay sesión activa, aparece el botón **"Abrir Sesión"**.
3. Cuenta el efectivo físico con el que empiezas el turno e ingrésalo como saldo inicial.
4. Confirma. La sesión queda activa y el sistema empieza a registrar todas las operaciones.

> Solo puede haber una sesión activa por cajero a la vez.

## Cómo cerrar sesión y hacer el arqueo

1. En la pestaña **Mi Caja**, tu sesión activa muestra saldo inicial, ingresos del turno, egresos y saldo esperado.
2. Haz clic en **"Cerrar Sesión"**.
3. Cuenta físicamente el dinero en caja, ingresando cada denominación de billetes y monedas.
4. El sistema calcula el total real y lo compara con lo esperado.
5. Si hay diferencia, escribe una nota justificativa.
6. Confirma el cierre. El resumen queda disponible para el gerente en el historial.

## Gastos e ingresos durante el turno

Desde la sesión activa (Mi Caja) puedes registrar:
- **Gastos**: salida de efectivo (alquiler, suministros, transporte). También se pueden registrar desde el botón "Nuevo Gasto" en el header del sistema.
- **Ingresos extra**: entradas de efectivo no relacionadas a ventas (préstamo, reposición).

Cada movimiento queda vinculado a la sesión y afecta el saldo esperado al cierre.

## Bóveda

La bóveda es el resguardo de excedentes de la sucursal. Se puede:
- Ver el saldo actual y el historial de movimientos
- Transferir efectivo desde la caja a la bóveda (para guardar excedentes)
- Transferir desde la bóveda hacia el banco o hacia otra cuenta

## Force-close (solo GERENTE)

Si un cajero olvida cerrar su sesión, el gerente puede hacer un **cierre forzado** desde la pestaña "Sesiones activas". Queda registrado como "force-close" en el historial.

## ¿Qué puede consultar el asistente?

**Tiempo real (Firestore):**
- "¿Está abierta la caja?" → `get_cash_status` (sesión activa, saldo, ingresos/egresos del día)
- "¿Cuánto hay en caja?" → `get_cash_status`
- "¿Quién tiene caja abierta?" → `get_cash_status`

**Análisis histórico (SQL):**
- "¿Cuántas sesiones se cerraron este mes?" → `run_sql` sobre historial de sesiones
- "¿Cuál fue la diferencia promedio en los arqueos del trimestre?" → `run_sql` con AVG de discrepancias
- "Sesiones con diferencia mayor a X en el último mes" → `run_sql` filtrando por discrepancia

## Restricciones de rol

- **VENDEDOR / ENCARGADO**: acceso a Mi Caja (su sesión), Bóveda, Bancos, Transferencias, Historial propio y Ajustes.
- **GERENTE**: además puede ver Sesiones activas de todos los cajeros y hacer force-close. Ve el historial de todas las sucursales en vista consolidada.
