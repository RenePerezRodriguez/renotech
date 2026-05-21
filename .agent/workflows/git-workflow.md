# 🔄 Flujo de Git y Despliegue en Renotech

Este documento define el flujo de trabajo con Git y Firebase App Hosting para el monorepo de Renotech. Todos los desarrolladores y agentes de IA deben seguir este flujo rigurosamente para evitar errores en producción.

---

## 1. Ramas Principales

*   **`develop` (Rama de Integración y Desarrollo Activo)**:
    *   Aquí es donde se realiza el trabajo diario, nuevas características, corrección de errores y refactorizaciones.
    *   Toda tarea o rama de feature debe integrarse primero en `develop`.
    *   **Despliegue**: Conectada al entorno de desarrollo/staging en Firebase App Hosting (permite probar cambios en vivo en una URL de pruebas antes de pasarlos a producción).

*   **`main` (Rama de Producción)**:
    *   Representa el código estable que está actualmente en producción.
    *   Solo recibe cambios provenientes de `develop` mediante fusiones (merges) controladas.
    *   **Despliegue**: Conectada al entorno de producción en Firebase App Hosting para los backends `renotech-web` y `renotech-erp`. Cualquier push a `main` desencadena un despliegue automático hacia los usuarios finales.

---

## 2. Flujo de Trabajo Paso a Paso

### Paso 1: Desarrollo en `develop`
1. Asegúrate de estar en la rama `develop` y tener los últimos cambios:
   ```bash
   git checkout develop
   git pull origin develop
   ```
2. Realiza tus cambios de código locales.
3. Asegúrate de que compila localmente sin errores:
   ```bash
   npm run build
   ```

### Paso 2: Commit y Subida a `develop`
1. Agrega tus archivos y crea el commit con un mensaje descriptivo:
   ```bash
   git add .
   git commit -m "feat(landing): implementar sección de servicios con diseño industrial premium"
   ```
2. Sube los cambios a GitHub:
   ```bash
   git push origin develop
   ```
3. Verifica en la consola de Firebase App Hosting que el build de desarrollo compile e instale correctamente.

### Paso 3: Paso a Producción (`main`)
Cuando una versión en `develop` sea completamente estable y haya sido validada por el usuario:
1. Cambia a la rama `main` y actualízala:
   ```bash
   git checkout main
   git pull origin main
   ```
2. Fusiona los cambios de `develop` en `main`:
   ```bash
   git merge develop
   ```
3. (Opcional) Crea una etiqueta (tag) de versión para llevar un control de releases:
   ```bash
   git tag -a v1.0.1 -m "Release v1.0.1: Añade sección de servicios en landing"
   ```
4. Sube los cambios y la etiqueta a GitHub:
   ```bash
   git push origin main --follow-tags
   ```
5. Firebase App Hosting detectará el push a `main` y desplegará de forma automática la nueva versión en producción para `renotech-web` y `renotech-erp`.

---

## 3. Reglas Críticas
*   **Prohibido hacer push directo a `main`**: Todo cambio debe pasar y probarse primero en `develop`.
*   **Mensajes de Commit Claros**: Utilizar prefijos convencionales (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
*   **Mantener el Historial Limpio**: Evitar subir archivos temporales, tokens, credenciales o carpetas compiladas (asegurar que el `.gitignore` esté actualizado).
