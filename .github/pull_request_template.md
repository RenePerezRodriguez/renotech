# Pull Request

## Descripción

Por favor describe brevemente los cambios introducidos y qué problema resuelven.

## Tipo de Cambio

- [ ] Corrección de error (bug fix)
- [ ] Nueva funcionalidad (feature)
- [ ] Refactorización o mejora de código
- [ ] Documentación
- [ ] Otro (especificar)

## Checklist Técnico

- [ ] **Compilación**: `npm run build` se ejecuta y completa sin errores locales.
- [ ] **Tipado TypeScript**: No se introdujo el tipo `any` y se definieron tipos e interfaces correspondientes.
- [ ] **Calidad**: Se han eliminado `console.log` o comentarios de depuración innecesarios.
- [ ] **Transacciones de Firestore**: Las lecturas transaccionales (`transaction.get`) están estrictamente separadas y agrupadas antes de cualquier escritura (`set`/`update`), evitando race conditions.
- [ ] **Identificadores**: Se utilizan IDs determinísticos (`branchId_masterId`) para productos de sucursal.
- [ ] **Pruebas**: Se han ejecutado y pasado las pruebas unitarias localmente (`npm run test`).
- [ ] **Línea Gráfica**: Los cambios en componentes visuales respetan la paleta de colores y el estilo del POS.
- [ ] **Soporte Offline / Atajos**: Se verificó el funcionamiento bajo `useOfflineQueue` y listeners de teclado (F-keys/Esc) si corresponde.
