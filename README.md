# Renotech — Sistema ERP y Punto de Venta (POS)

Renotech es una plataforma de software empresarial (ERP) y punto de venta (POS) premium de alto rendimiento, diseñada con una estética stealth-industrial y acentos dorado-amarillos. Está optimizada para la gestión de catálogo de repuestos, control de inventario multi-sucursal, arqueos de caja, ventas de kits y facturación en tiempo real.

---

## 🛠️ Stack Tecnológico

* **Frontend**: [Next.js](https://nextjs.org/) (v16.2.4, App Router) & React 19
* **Base de Datos**: Firebase Firestore (NoSQL)
* **Backend y Autenticación**: Firebase Auth y Next.js API Routes (Serverless)
* **Servicios de Backend / Admin**: Firebase Admin SDK (para scripts y automatizaciones)
* **Estilos**: Tailwind CSS (v4) con diseño premium adaptivo e interactivo
* **Generación de Reportes**: `@react-pdf/renderer` para arqueos de caja y comprobantes
* **Soporte Offline / PWA**: `@ducanh2912/next-pwa` para resiliencia de datos en sucursales
* **Pruebas**: Playwright (E2E) y Vitest (Pruebas unitarias)
* **Despliegue**: Firebase App Hosting (integrado con Cloud Run y Cloud Build)

---

## 📂 Estructura del Proyecto

```text
├── .agent/              # Workflows e instrucciones de agentes AI
├── .github/             # Plantillas de GitHub para Issues y Pull Requests
├── docs/                # Documentación de arquitectura, flujos de datos y guías locales
├── public/              # Recursos estáticos y manifiesto PWA
├── scripts/             # Scripts de administración, BigQuery y migraciones
│   └── migrations/      # Scripts críticos de carga de inventario (No borrar)
└── src/
    ├── app/             # Rutas y páginas de Next.js (App Router)
    ├── components/      # Componentes UI reutilizables de la línea industrial
    ├── contexts/        # Estados y contextos globales de React
    ├── hooks/           # Hooks personalizados (PWA, red, consultas)
    ├── lib/             # Clientes de Firebase, BigQuery y utilidades
    ├── logic/           # Reglas de negocio y lógica de cálculo (precios, kits)
    ├── services/        # Servicios de Firestore con transaccionalidad atómica
    ├── store/           # Stores globales de Zustand (POS, compras, etc.)
    └── utils/           # Ayudantes auxiliares y parseadores
```

---

## 🧱 Arquitectura de Inventario y Base de Datos

Para garantizar la integridad física de los datos y evitar condiciones de carrera, el inventario implementa las siguientes reglas críticas:

1. **Unicidad de Códigos Maestros**: Gestionada a través de la colección transaccional `unique_codes/{codigo}`.
2. **IDs Locales Determinísticos**: Cada producto de una sucursal tiene un ID estructurado como `"${sucursalId}_${masterId}"`. Nunca se deben usar identificadores aleatorios en la colección de sucursales.
3. **Consistencia Transaccional**: Toda alteración de stock, venta o traspaso debe procesarse de forma atómica en una transacción de Firestore, realizando la carga de datos (`transaction.get`) en la primera fase de la transacción (Fase de Lecturas) antes de escribir.

---

## 🚀 Instalación y Desarrollo Local

### Requisitos previos
* Node.js >= 18.x
* Cuenta y proyecto configurado en Firebase Console

### Pasos
1. Clonar el repositorio.
2. Configurar las variables de entorno en un archivo `.env.local` en la raíz del proyecto:
   ```env
   FIREBASE_SERVICE_ACCOUNT_KEY='{...json...}'
   NEXT_PUBLIC_FIREBASE_API_KEY="..."
   # ... otras variables necesarias
   ```
3. Instalar las dependencias:
   ```bash
   npm install
   ```
4. Iniciar el servidor de desarrollo:
   ```bash
   npm run dev
   ```
5. Acceder a [http://localhost:3000](http://localhost:3000).

---

## 🧪 Pruebas y Construcción

* **Compilar para producción**:
  ```bash
  npm run build
  ```
* **Ejecutar pruebas unitarias**:
  ```bash
  npm run test
  ```
* **Ejecutar pruebas E2E (Playwright)**:
  ```bash
  npm run test:e2e
  ```

---

## 🔒 Licencia y Propiedad
Este software es propiedad intelectual y comercial privada de **Renotech**. Todos los derechos reservados. Queda prohibida la reproducción, distribución o modificación no autorizada de este código fuente.
