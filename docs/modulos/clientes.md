# Módulo Clientes — Directorio de Socios

## ¿Qué es el módulo de Clientes?

El módulo de Clientes gestiona la base de compradores del negocio. Un cliente registrado puede **comprar a crédito**, tiene historial de compras trazable y puede tener un límite de crédito configurado. También permite registrar empresas (entidades jurídicas) con NIT.

## KPIs de cabecera

- **Población de Socios**: total de clientes registrados
- **Entidades Jurídicas**: clientes de tipo empresa (con NIT)
- **Sujetos Particulares**: clientes individuales
- **Índice de Actividad**: porcentaje de clientes activos

## Cómo registrar un nuevo cliente

1. Haz clic en **"Vincular Nuevo Socio"** en la esquina superior derecha.
2. Completa los datos:
   - **Nombre / Razón Social**: nombre completo o nombre de la empresa
   - **Tipo**: Particular o Empresa
   - **NIT / Carnet**: número de identificación tributaria o carnet de identidad
   - **Teléfono**: número de contacto
   - **Dirección**: opcional
   - **Email**: opcional
3. Si el cliente comprará a crédito, activa la opción **"Habilitar Crédito"** y define el **límite de crédito** (monto máximo en deuda permitido simultáneamente).
4. Guarda. El cliente ya puede asociarse a ventas en el POS.

## Ver el historial de un cliente

1. Busca al cliente por nombre, razón social o carnet en la barra de búsqueda.
2. Haz clic en su fila para abrir su perfil.
3. El perfil muestra:
   - **Historial de compras**: todas las ventas asociadas al cliente, con fechas y montos
   - **Deuda total**: suma de créditos pendientes
   - **Límite disponible**: cuánto crédito adicional puede tomar
   - **Cuotas pendientes**: las cuotas vencidas aparecen en rojo
4. Desde el perfil puedes registrar un **abono** directo a su deuda.

## Crédito de clientes

- El límite de crédito es configurable por cliente.
- Si la deuda del cliente supera su límite, el POS bloquea nuevas ventas a crédito para ese cliente.
- Las cuotas se gestionan en el módulo de **Créditos** — ahí se ve el plan de pagos completo y se registran los abonos.
- Un cliente **moroso** (con cuotas vencidas) genera una alerta automática en el POS al seleccionarlo.

## Filtros disponibles

- **Búsqueda de texto**: nombre, razón social, NIT o CI
- **Clasificación**: Todos / Particulares / Empresas
- **Estado**: Activos / Inactivos

## Exportar

El botón **"Exportar Inteligencia"** descarga el directorio completo en CSV con todos los campos del cliente.

## ¿Qué puede consultar el asistente?

**Tiempo real (Firestore):**
- "¿Cuántos clientes tenemos?" → `get_entity_counts`
- "¿Qué clientes tienen deuda?" → `get_client_credits` (lista con montos)
- "¿Quiénes deben más?" → `get_client_credits` ordenado por deuda

**Análisis histórico (SQL):**
- "¿Cuántos clientes se registraron este mes?" → `run_sql` sobre `v_clientes`
- "¿Qué clientes compraron más en el trimestre?" → `run_sql` sobre `v_ventas` agrupado por `client_name`
- "¿Cuál es el monto promedio de compra por cliente?" → `run_sql` con AVG
- "Clientes sin compras en los últimos 60 días" → `run_sql` cruzando `v_clientes` y `v_ventas`

## Restricciones de rol

- **VENDEDOR**: puede ver la lista de clientes y su historial básico. No puede editar límites de crédito.
- **ENCARGADO**: puede crear y editar clientes, configurar crédito.
- **GERENTE**: acceso completo incluyendo exportación y desactivación de clientes.
