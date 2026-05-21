# Política de Seguridad

## Reportar una vulnerabilidad

Si encuentras una vulnerabilidad de seguridad en el sistema ERP o Punto de Venta, **NO abras un issue público en GitHub**.

Envía un correo con los detalles a **<soporte@renotech.lat>** incluyendo:

- Descripción detallada del problema o fallo de seguridad.
- Pasos ordenados para reproducir la vulnerabilidad.
- Impacto potencial estimado sobre los datos o el inventario.

## Proceso de Resolución

1. **Confirmación**: Confirmaremos la recepción del reporte en un plazo máximo de 24 horas.
2. **Investigación**: Analizaremos y verificaremos el problema en entornos locales y de pruebas.
3. **Corrección**: Desarrollaremos y probaremos el parche o corrección correspondiente.
4. **Despliegue**: Aplicaremos la solución en la rama `desarrollo` y posteriormente en el entorno de producción (`produccion`).
5. **Notificación**: Informaremos al reportante sobre el estado de la resolución.

## Alcance

Esta política cubre las aplicaciones del repositorio, la configuración de reglas de Firestore (`firestore.rules`), almacenamiento de Firebase Storage, Next.js API Routes y el dominio de producción [sistema.renotech.lat](https://sistema.renotech.lat).
