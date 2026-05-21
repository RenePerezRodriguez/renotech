---
description: Linea Grafica Renotech - Suite Pro v4.0 (Industrial Premium)
---

Este workflow define las reglas visuales críticas para mantener la **consistencia sistémica** en el ecosistema Renotech. Basado en la identidad "Technical Commander" (Suite Pro).

> [!IMPORTANT]
> **Punto de Control de Componentes**: Antes de crear o modificar cualquier componente de interfaz, la IA debe validar que el diseño respeta al 100% las definiciones de **Impacto en UI y Componentes** en `docs/architecture/ui_impact_and_components.md`.

## Estética Central
**Industrial Premium (Suite Pro v4.0)**: Estética de alta densidad técnica. Prioriza superficies sólidas de alto contraste (`midnight-navy` / `black`) y bordes de precisión ultra-finos. Inspirado en terminales de control industrial modernas (Zero-Glass strategy).

## 1. Paleta de Colores y Superficies (v4.0)

| Elemento | Color (Tailwind/Hex) | Aplicación |
| :--- | :--- | :--- |
| **Accent Primary** | `blue-500` / `blue-600` | Enlaces técnicos, indicadores de sistema, acentos en tablas. |
| **Action Primary** | `yellow-500` / `black` | Botones de registro/guardado (Contraste Máximo). |
| **Solid Base** | `bg-slate-50 dark:bg-[#020617]` | Fondo de página principal (Solid Deep Navy). |
| **Header Banner** | `bg-slate-900 dark:bg-[#111827]` | Cabeceras de página y modales (Surface Top). |
| **Audit Table Head**| `bg-slate-50 dark:bg-[#111827]` | Encabezados de tabla (Solid Type). |
| **Precision Borders**| `border-slate-200 dark:border-white/10` | Definición de contenedores y campos. |

## 2. Radios de Borde (v4.0 Precision)

- **Main Containers**: `rounded-3xl` (Consistencia en dashboards).
- **Toolbars & Footer**: `rounded-2xl` o `rounded-[20px]` (Densidad técnica).
- **Secondary Modals**: `rounded-3xl` (Solid frames).
- **Inputs & Micro-buttons**: `rounded-xl` (Control táctico).

## 3. Tipografía de Auditoría

1. **Labels Operativas**:
   - Clases: `text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500`
   - Uso: Cabeceras de tabla, etiquetas de filtros, metadatos de auditoría.

2. **Dato Maestro**:
   - Clases: `text-xs font-bold uppercase text-slate-900 dark:text-white`
   - Uso: Nombres de clientes, productos, y entidades principales.

3. **Valores Financieros**:
   - Clases: `tabular-nums font-black text-2xl tracking-tighter`
   - Uso: KPIs centrales y totales de venta.

## 4. Estructuras de Control (Layout v4.0)

### Audit Footer (Technical Parity & "Ventas" Standard)
- **Estructura**: Un bloque unificado `p-4 border-t border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-[#111827]/40 flex flex-col sm:flex-row items-center justify-between gap-4`.
- **Lado Izquierdo (Status)**: 
  - Cápsula de registros: `px-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl shadow-sm`.
  - Texto de auditoría: `text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] opacity-40` (Label: "Auditoría en Tiempo Real").
- **Centro (Control)**: 
  - Selector de densidad: `h-9 bg-white dark:bg-white/5 border-2 border-yellow-500/20 transition-all rounded-xl pl-4 pr-10 text-[10px] font-black uppercase shadow-sm`.
- **Lado Derecho (Navegación)**:
  - Botón Anterior: Estilo Ghost (Borde `slate-200`).
  - Indicador de página: Cápsula amarilla `bg-yellow-500/5 border-yellow-500/10 text-yellow-600`.
  - Botón Siguiente: Estilo Sólido (`bg-slate-900` o `bg-yellow-500`).
- **ELIMINACIÓN**: Queda prohibido el uso de banners externos de auditoría con el icono `Activity` gigante en el pie de página. Todo debe estar integrado en la barra funcional de la tabla.

### High-Density Toolbar
- Contenedor unificado `rounded-[20px] p-1 border`.
- Altura controlada `h-11` para inputs principales.
- Botones de acción rápida `h-9 w-9` (Limpiar, Filtros).

### High-Density Grid (POS Style)
- **Cards**: `rounded-2xl` con bordes de precisión `border-slate-100 dark:border-white/5`.
- **Filtros (Pills)**: `rounded-xl px-4 py-2 text-[10px] font-black uppercase transition-all active:scale-95`.
- **Precio**: `tabular-nums font-black text-lg tracking-tighter`.

## 5. Reglas "Industrial Premium"

1. **No al "Diseño Boludo"**: Evitar espaciados exagerados; la información debe ser densa y escaneable.
2. **Jerarquía Sólida**: Los encabezados deben ser oscuros (`bg-black/40`) y el contenido claro, creando un "techo" visual claro para cada sección.
3. **Audit Readiness**: Todo cambio de estado debe tener una micro-animación (ej. `animate-pulse` en status de sincronización).
4. **Mobile First Density**: En mobile, usar cards compactas `rounded-2xl` con tipografía `text-sm font-bold`.
5. **Zero-Glass Strategy**: En modo oscuro, evitar el uso de `backdrop-blur` en componentes operativos para mantener la legibilidad de "Terminal de Datos".