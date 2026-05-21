# Guía de Contribución

Guía para desarrolladores autorizados en el proyecto ERP Renotech.

## Requisitos Previos

- Node.js >= 18.x
- npm >= 9.x
- Archivo `.env.local` configurado en la raíz con las credenciales de Firebase.

## Configuración del Entorno de Desarrollo

1. Clonar el repositorio y acceder a la carpeta del proyecto:

   ```bash
   cd renotech
   ```

2. Instalar las dependencias del proyecto:

   ```bash
   npm install
   ```

3. Iniciar el servidor de desarrollo local:

   ```bash
   npm run dev
   ```

## Flujo de Trabajo con Git

1. **Creación de Ramas**: Crea siempre una rama a partir de `desarrollo` (rama principal para integraciones):

   ```bash
   git checkout desarrollo
   git pull origin desarrollo
   git checkout -b feat/nombre-caracteristica  # O bien: fix/descripcion-error
   ```
2. **Hacer Commits**: Sigue la especificación de Conventional Commits para escribir los mensajes de commit:
   - `feat: ...` para nuevas funcionalidades.
   - `fix: ...` para corrección de errores.
   - `chore: ...` para actualizaciones de dependencias o tareas de mantenimiento.
   - `docs: ...` para modificaciones en la documentación.
3. **Validación Local**: Ejecuta la compilación y los tests antes de enviar tus cambios:
   - Construcción del proyecto: `npm run build`
   - Pruebas unitarias: `npm run test`
   - Pruebas E2E: `npm run test:e2e`
4. **Abrir Pull Request**: Abre el Pull Request hacia la rama `desarrollo`. Espera a que pasen las validaciones y a recibir la revisión por parte del propietario del repositorio.

## Estándares de Código y Base de Datos

- **TypeScript**: Está prohibido el uso del tipo `any`. Define tipos e interfaces explícitos para todas las funciones, props y datos de Firestore en `src/types/`.
- **Imports**: Utiliza el alias `@/` para importar archivos dentro de la carpeta `src/` (por ejemplo, `import { InventoryService } from '@/services/InventoryService'`).
- **Arquitectura de Capas**: Respeta la separación de responsabilidades:
  - Rutas y lógica de rutas en `src/app/`.
  - Componentes visuales sin lógica de Firebase en `src/components/`.
  - Consultas y persistencia en `src/services/`.
  - Lógica matemática o de cálculo pura en `src/logic/`.
- **Transacciones de Firestore (Crítico)**:
  - Todas las operaciones concurrentes que involucren inventarios, arqueos de caja o traspasos deben ejecutarse dentro de transacciones atómicas.
  - Respeta el orden de ejecución de la API de Firestore: **todas las lecturas (`transaction.get`) deben realizarse al inicio, antes de realizar cualquier escritura (`transaction.set` o `transaction.update`)**.
  - Evita las consultas no transaccionales dentro de bucles o en la mitad de una transacción.
  - Utiliza identificadores determinísticos de la forma `${branchId}_${masterId}` para productos locales, evitando IDs aleatorios autogenerados.
