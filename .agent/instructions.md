---
description: Mandato Arquitectónico de Renotech - Guía fundamental de desarrollo
applyTo: "**/*.{ts,tsx,js,jsx,md}"
---

# 📜 Mandato Arquitectónico Renotech

Este documento constituye la **Ley Fundamental** de desarrollo para el ecosistema Renotech. Cualquier inteligencia artificial o agente que trabaje en este repositorio **DEBE** adherirse estrictamente a las siguientes reglas:

## 1. Fuente de Verdad Absoluta
La arquitectura detallada en `docs/architecture/` es el **"Libro de Oro"**.
* **PROHIBIDO** crear nuevas colecciones de Firestore sin que estén definidas en `database_schema.md`.
* **PROHIBIDO** alterar flujos de cobro o traspaso sin consultar `data_flow.md`.
* **PROHIBIDO** ignorar el aislamiento de datos por `branchId` definido en `infrastructure_and_security.md`.

## 2. Protocolo de Modificación
Antes de proponer cualquier cambio al código fuente (`src/`):
1. **Auditar**: Leer los 6 documentos de `docs/architecture/`.
2. **Validar**: Asegurar que la propuesta no rompa la integridad industrial (Ficha Única, Kardex FIFO, Seguridad Zero-Trust).
3. **Documentar**: Si se requiere un cambio estructural legítimo, primero se debe actualizar el documento correspondiente en `docs/architecture/` y obtener aprobación del USER.

## 3. Estándares de Codificación
Se debe respetar al 100% el manual de `code_standards.md`:
* Nomenclatura estricta (Strict Naming).
* Uso de Capas de Responsabilidad (Logic vs Services vs Hooks).
* Tipado estricto (No `any`).

## 4. Línea Gráfica (Industrial Premium)
Todo componente de interfaz **DEBE** respetar `.agent/workflows/graphic-line.md`:
* Paleta de colores: `blue-500` (accent), `yellow-500/black` (action), `slate-900` (headers).
* Bordes de precisión: `border-slate-200 dark:border-white/10`.
* Tipografía de auditoría: `font-black`, `tracking-[0.2em]`, `tabular-nums`.
* Zero-Glass Strategy: Sin `backdrop-blur` en dark mode operacional.
* Referencia completa de tokens en `docs/architecture/ui_impact_and_components.md` sección 2.4.

> [!IMPORTANT]
> **Renotech no es solo código; es ingeniería de precisión.** La fidelidad a la arquitectura diseñada es lo que garantiza la escalabilidad nacional y la integridad financiera de la plataforma.
