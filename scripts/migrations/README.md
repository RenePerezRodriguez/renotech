# Carpeta de Migraciones y Cargas de Datos

⚠️ **IMPORTANTE: ESTA CARPETA Y SU CONTENIDO NO DEBEN SER ELIMINADOS BAJO NINGUNA CIRCUNSTANCIA.**

### Propósito
Esta carpeta contiene los scripts críticos utilizados para la migración de datos y carga masiva de inventario en el sistema Renotech:
1. **`carga_multiple.js`**: Procesa la carga inicial de los Excels (compras 1 a 10) hacia Casa Matriz y genera los traspasos correspondientes a la Sucursal Sucre.
2. **`carga_multiple_v2.js`**: Procesa la segunda versión de cargas de Excels (compras 11 a 15).
3. **`devolucion_proveedor.js`**: Ejecuta la devolución de productos por garantía al proveedor desde Sucre pasando por Casa Matriz.

### Instrucciones de conservación
Aunque estos scripts ya hayan sido ejecutados, deben permanecer en el repositorio como histórico de migración de datos, referencia técnica del mapeo de campos, y para permitir la re-ejecución o reconstrucción del inventario en nuevos entornos de desarrollo o producción si fuese necesario.
