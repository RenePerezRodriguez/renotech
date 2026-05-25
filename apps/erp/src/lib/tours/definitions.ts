/**
 * Definiciones de tours guiados para Renotech POS.
 * Cada tour tiene pasos, ruta inicial, roles permitidos y opciones de ramificación.
 */

export interface TourBranch {
  label: string;
  tourId: string;
}

export interface TourStep {
  title: string;
  description: string;
  /** CSS selector del elemento a destacar. Omitir = popover centrado */
  element?: string;
  /** Ruta a la que navegar ANTES de mostrar este paso */
  route?: string;
  side?: 'top' | 'bottom' | 'left' | 'right' | 'over';
  /** Texto para narración de voz (TTS). Si omitido, usa description sin HTML */
  narration?: string;
  /** Opciones de ramificación mostradas en este paso */
  branch?: TourBranch[];
  align?: 'start' | 'center' | 'end';
}

export interface TourDefinition {
  id: string;
  title: string;
  description: string;
  /** Ruta inicial del tour */
  startRoute: string;
  estimatedMinutes: number;
  /** Si undefined = disponible para todos */
  allowedRoles?: string[];
  steps: TourStep[];
}

// ─────────────────────────────────────────────────────────────────────────────
// TOURS
// ─────────────────────────────────────────────────────────────────────────────

export const TOUR_DEFINITIONS: Record<string, TourDefinition> = {

  // ── Inicio / Dashboard ──────────────────────────────────────────────────────
  'inicio-dashboard': {
    id: 'inicio-dashboard',
    title: 'Conoce el panel de inicio',
    description: 'Entiende de un vistazo las métricas clave del negocio y cómo navegar el sistema.',
    startRoute: '/inicio',
    estimatedMinutes: 2,
    steps: [
      {
        title: '¡Bienvenido a Renotech!',
        description: 'Este es tu <strong>panel de inicio</strong>. Muestra un resumen completo del negocio: ventas del día, stock crítico, posición financiera y actividad reciente. Es la primera pantalla que ves al entrar.',
        route: '/inicio',
        element: '[data-tour="inicio-header"]',
        narration: 'Bienvenido a Renotech. El panel de inicio muestra el resumen completo del negocio.',
        side: 'bottom',
      },
      {
        title: 'Métricas del día',
        description: 'Los tres indicadores muestran: <strong>ingresos del día</strong>, <strong>productos en catálogo</strong> y <strong>alertas de stock bajo</strong>. Se actualizan en tiempo real con cada venta.',
        element: '[data-tour="inicio-kpis"]',
        narration: 'Los indicadores del día se actualizan en tiempo real con cada venta registrada.',
        side: 'bottom',
      },
      {
        title: 'Posición financiera',
        description: 'Muestra el saldo en bóveda, el total por pagar a proveedores y el saldo a favor de la sucursal. Si eres GERENTE, ves el consolidado de todas las sucursales.',
        element: '[data-tour="inicio-financial"]',
        narration: 'La posición financiera consolida bóveda, cuentas por pagar y saldo a favor.',
        side: 'bottom',
      },
      {
        title: 'Tendencia operativa',
        description: 'El gráfico <strong>Últimos 7 Días</strong> muestra la evolución de ventas día a día. Úsalo para identificar los días de mayor actividad y planificar el personal.',
        element: '[data-tour="inicio-chart"]',
        narration: 'El gráfico de tendencia muestra la evolución de ventas de los últimos 7 días.',
        side: 'bottom',
      },
      {
        title: 'Actividad reciente',
        description: 'Las últimas ventas registradas en tiempo real. Cada fila muestra el cliente, la hora y el monto. Haz clic en <strong>"Ver Todo"</strong> para ir al historial completo de ventas.',
        element: '[data-tour="inicio-activity"]',
        narration: 'La actividad reciente muestra las últimas ventas en tiempo real.',
        side: 'left',
      },
      {
        title: 'Buscador global',
        description: 'El botón <strong>BUSCAR</strong> (o <kbd>Ctrl+K</kbd>) en la barra superior te permite encontrar cualquier producto al instante: por nombre, código, código de fábrica, OEM o marca.',
        element: 'button[title*="Buscar"]',
        narration: 'El buscador global encuentra productos por cualquier campo instantáneamente.',
        side: 'bottom',
      },
      {
        title: 'Tu perfil y sucursal',
        description: 'En la esquina superior derecha ves tu nombre, rol y la <strong>sucursal activa</strong>. Si tienes acceso a varias sucursales, puedes cambiar entre ellas desde ahí.',
        element: '[data-tour="header-user"]',
        narration: 'Tu perfil y sucursal activa aparecen en la esquina superior derecha.',
        side: 'bottom',
      },
    ],
  },

  // ── Punto de Venta ──────────────────────────────────────────────────────────
  'pos-nueva-venta': {
    id: 'pos-nueva-venta',
    title: 'Cómo registrar una venta',
    description: 'Aprende a registrar una venta desde el Punto de Venta.',
    startRoute: '/punto-de-venta',
    estimatedMinutes: 3,
    steps: [
      {
        title: '¡Bienvenido al Punto de Venta!',
        description: 'Este módulo te permite registrar ventas rápidamente. Te guiaré paso a paso. ¿Qué tipo de venta quieres aprender?',
        narration: 'Bienvenido al Punto de Venta. Te guiaré para registrar tu primera venta.',
        branch: [
          { label: 'Venta en efectivo / QR', tourId: 'pos-venta-contado' },
          { label: 'Venta a crédito (cuotas)', tourId: 'pos-venta-credito' },
        ],
      },
    ],
  },

  'pos-venta-contado': {
    id: 'pos-venta-contado',
    title: 'Venta al contado (efectivo o QR)',
    description: 'Registra una venta pagada en efectivo o QR.',
    startRoute: '/punto-de-venta',
    estimatedMinutes: 3,
    steps: [
      {
        title: 'Buscar producto',
        description: 'Usa la <strong>barra de búsqueda</strong> para encontrar el producto. Escribe el nombre, código, código de fábrica o escanea el código de barras. También puedes presionar <kbd>F3</kbd>.',
        element: '[data-tour="pos-search"]',
        narration: 'Usa la barra de búsqueda para encontrar el producto. Puedes escribir el nombre o escanear el código de barras.',
        side: 'bottom',
      },
      {
        title: 'Agregar al carrito',
        description: 'Haz clic en el producto para <strong>agregarlo al carrito</strong>. Si necesitas más de una unidad, puedes hacer clic varias veces o cambiar la cantidad en el carrito.',
        element: '[data-tour="pos-products"]',
        narration: 'Haz clic en el producto para agregarlo al carrito.',
        side: 'right',
      },
      {
        title: 'Revisar el carrito',
        description: 'El carrito muestra los productos seleccionados con precio y subtotal. Puedes <strong>cambiar cantidades</strong>, aplicar descuentos por línea o eliminar productos con la X.',
        element: '[data-tour="pos-cart"]',
        narration: 'Revisa el carrito. Puedes ajustar cantidades y aplicar descuentos.',
        side: 'left',
      },
      {
        title: 'Seleccionar cliente (opcional)',
        description: 'Si el cliente está registrado, búscalo para asociar la venta a su historial. Para ventas ocasionales puedes omitir este paso.',
        element: '[data-tour="pos-client"]',
        narration: 'Busca el cliente si está registrado, o déjalo en blanco para venta ocasional.',
        side: 'top',
      },
      {
        title: 'Elegir método de pago',
        description: 'Elige el método de pago para esta venta: <strong>Efectivo</strong>, <strong>QR</strong>, <strong>Mixto</strong> o <strong>Cuotas</strong>. Cada opción activa los campos correspondientes en la pantalla de cobro.',
        element: '[data-tour="pos-payment"]',
        narration: 'Selecciona el método de pago antes de cobrar.',
        side: 'top',
      },
      {
        title: 'Método de pago y cobro',
        description: 'Presiona <strong>Cobrar (F9)</strong>. Se abre la pantalla de confirmación donde revisas el total y terminas la venta. Si elegiste efectivo, ingresa el monto recibido para calcular el vuelto.',
        element: '[data-tour="pos-checkout"]',
        narration: 'Presiona Cobrar para abrir la confirmación y completar la venta.',
        side: 'top',
      },
      {
        title: '¡Venta registrada!',
        description: 'Al confirmar, el sistema descuenta el stock, registra en el Kardex, genera el comprobante y actualiza la caja automáticamente. El cliente queda asociado si lo seleccionaste. <br><br>💡 <em>Atajo: <kbd>F9</kbd> abre el cobro desde el teclado.</em>',
        element: '[data-tour="pos-checkout"]',
        narration: 'Al confirmar, el sistema registra todo: stock, kardex, caja y comprobante.',
        side: 'top',
      },
    ],
  },

  'pos-venta-credito': {
    id: 'pos-venta-credito',
    title: 'Venta a crédito (cuotas)',
    description: 'Registra una venta en cuotas para clientes con crédito aprobado.',
    startRoute: '/punto-de-venta',
    estimatedMinutes: 4,
    steps: [
      {
        title: 'Agrega los productos',
        description: 'Primero agrega los productos al carrito normalmente usando la barra de búsqueda. El proceso es igual que una venta normal hasta el paso de pago.',
        element: '[data-tour="pos-search"]',
        narration: 'Primero busca y agrega los productos al carrito.',
        side: 'bottom',
      },
      {
        title: 'Seleccionar el cliente',
        description: 'Para una venta a crédito, <strong>debes seleccionar el cliente</strong>. Búscalo por nombre o carnet. El cliente debe tener crédito habilitado y saldo disponible.',
        element: '[data-tour="pos-client"]',
        narration: 'Selecciona al cliente. Debe tener crédito aprobado disponible.',
        side: 'top',
      },
      {
        title: 'Elegir "Cuotas" en el método de pago',
        description: 'Antes de cobrar, selecciona la opción <strong>Cuotas</strong> en el método de pago. Esto activa el cálculo de cuotas y te permite ingresar un adelanto si el cliente lo da.',
        element: '[data-tour="pos-payment"]',
        narration: 'Elige Cuotas en el método de pago para continuar con una venta a crédito.',
        side: 'top',
      },
      {
        title: 'Elegir "Cuotas" y adelanto',
        description: 'Presiona <strong>Cobrar</strong>. En la pantalla de confirmación selecciona <strong>"Cuotas"</strong> y el número (1–12). El sistema calcula el monto por cuota automáticamente. Si el cliente da un adelanto, regístralo ahí mismo.',
        element: '[data-tour="pos-checkout"]',
        narration: 'Presiona Cobrar, elige Cuotas y el número. El adelanto también se registra ahí.',
        side: 'top',
      },
      {
        title: 'Confirmar la venta',
        description: 'Al confirmar, el sistema registra la venta y crea las cuotas en <strong>Créditos</strong>. El cliente puede ver su plan de pagos desde el módulo de Créditos.',
        element: '[data-tour="pos-checkout"]',
        narration: 'Confirma. El sistema crea las cuotas automáticamente en el módulo de créditos.',
        side: 'top',
      },
    ],
  },

  // ── Caja ───────────────────────────────────────────────────────────────────
  'caja-abrir-sesion': {
    id: 'caja-abrir-sesion',
    title: 'Abrir sesión de caja',
    description: 'Inicia tu turno de trabajo con el saldo inicial correcto.',
    startRoute: '/caja',
    estimatedMinutes: 2,
    steps: [
      {
        title: 'Módulo de Caja',
        description: 'Aquí gestionas tu turno: <strong>abrir sesión</strong>, registrar gastos e ingresos, y <strong>cerrar con arqueo</strong>. Solo puedes tener una sesión activa a la vez.',
        route: '/caja',
        element: '[data-tour="caja-tabs"]',
        narration: 'Bienvenido al módulo de caja. Aquí gestionas todas las operaciones de tu turno.',
        side: 'bottom',
      },
      {
        title: 'Abrir nueva sesión',
        description: 'Haz clic en <strong>"Abrir Sesión"</strong>. Se abrirá el formulario donde ingresas el saldo con que comienzas.',
        element: '[data-tour="caja-open"]',
        narration: 'Haz clic en Abrir Sesión para iniciar tu turno.',
        side: 'bottom',
      },
      {
        title: 'Ingresar saldo inicial',
        description: 'Cuenta el efectivo físico con el que empiezas y escríbelo. Este es tu <strong>fondo de caja</strong>. Sé preciso: el arqueo final se comparará contra este monto.',
        element: '[data-tour="caja-tabs"]',
        narration: 'Ingresa el efectivo físico con el que empiezas el turno.',
        side: 'bottom',
      },
      {
        title: '¡Sesión abierta!',
        description: 'Tu sesión está activa. El sistema registra cada venta, gasto y cobro. Al terminar tu turno usa <strong>"Cerrar Sesión"</strong> para el arqueo. <br><br>💡 <em>Solo puede haber una sesión activa por cajero.</em>',
        element: '[data-tour="caja-session-info"]',
        narration: 'Sesión abierta. El sistema ahora registra todas las operaciones de tu turno.',
        side: 'bottom',
      },
    ],
  },

  'caja-cerrar-sesion': {
    id: 'caja-cerrar-sesion',
    title: 'Cerrar sesión y arqueo',
    description: 'Cierra tu turno y cuadra el efectivo correctamente.',
    startRoute: '/caja',
    estimatedMinutes: 4,
    steps: [
      {
        title: 'Ver tu sesión activa',
        description: 'Tu sesión activa muestra el <strong>saldo inicial</strong>, total de ingresos del turno, egresos y el saldo esperado actual. Revísalo antes de cerrar.',
        route: '/caja',
        element: '[data-tour="caja-session-info"]',
        narration: 'Tu sesión activa aparece en la parte superior con el resumen del turno.',
        side: 'bottom',
      },
      {
        title: 'Iniciar cierre',
        description: 'Haz clic en <strong>"Cerrar Sesión"</strong>. Se abrirá el formulario de arqueo donde contarás el efectivo físico.',
        element: '[data-tour="caja-close-btn"]',
        narration: 'Haz clic en Cerrar Sesión para iniciar el arqueo.',
        side: 'left',
      },
      {
        title: 'Contar el efectivo',
        description: 'Cuenta físicamente el dinero en caja: billetes y monedas. Ingresa cada denominación. El sistema suma el total real automáticamente.',
        element: '[data-tour="caja-close-btn"]',
        narration: 'Cuenta el efectivo físico. Ingresa cada denominación de billetes y monedas.',
        side: 'left',
      },
      {
        title: 'Revisar diferencias',
        description: 'El sistema compara tu efectivo contado vs lo esperado. Si hay diferencia, escribe una <strong>nota justificativa</strong>. Las diferencias quedan registradas y visibles para el gerente.',
        element: '[data-tour="caja-session-info"]',
        narration: 'Revisa si hay diferencias y justifícalas con una nota.',
        side: 'bottom',
      },
      {
        title: '¡Sesión cerrada!',
        description: 'El cierre queda registrado con la diferencia y tu nota. Tu gerente puede ver el <strong>resumen completo del turno</strong> desde el módulo de Gerencia.',
        element: '[data-tour="caja-session-info"]',
        narration: 'Sesión cerrada. El gerente puede ver el resumen completo.',
        side: 'bottom',
      },
    ],
  },

  'caja-registrar-gasto': {
    id: 'caja-registrar-gasto',
    title: 'Registrar un gasto durante el turno',
    description: 'Registra egresos operativos que ocurren durante tu turno de caja.',
    startRoute: '/caja',
    estimatedMinutes: 2,
    steps: [
      {
        title: '¿Qué es un gasto de caja?',
        description: 'Un gasto es cualquier salida de efectivo durante tu turno: compra de insumos, pago de servicios, propinas, etc. Debe quedar registrado para que el arqueo cuadre.',
        route: '/caja',
        narration: 'Un gasto es cualquier salida de efectivo que ocurre durante tu turno.',
      },
      {
        title: 'Ir a la pestaña de Gastos',
        description: 'Con tu sesión abierta, busca la pestaña o botón <strong>"Nuevo Gasto"</strong> en la barra superior o dentro del módulo de caja.',
        element: '[data-tour="caja-tabs"]',
        narration: 'Con tu sesión abierta, ve a la opción de Nuevo Gasto.',
        side: 'bottom',
      },
      {
        title: 'Completar el gasto',
        description: 'Ingresa: <strong>monto</strong>, <strong>concepto</strong> (qué se compró o pagó) y <strong>categoría</strong>. Si supera el límite configurado, quedará pendiente de aprobación del gerente.',
        element: '[data-tour="caja-tabs"]',
        narration: 'Ingresa el monto, concepto y categoría del gasto.',
        side: 'bottom',
      },
      {
        title: 'Gasto registrado',
        description: 'El gasto se descuenta del efectivo esperado en tu sesión. Al cerrar caja, aparecerá en el detalle de egresos del turno. <br><br>💡 <em>Gastos grandes requieren aprobación del gerente antes de ejecutarse.</em>',
        element: '[data-tour="caja-session-info"]',
        narration: 'El gasto queda registrado y se descuenta del efectivo del turno.',
        side: 'bottom',
      },
    ],
  },

  // ── Inventario ─────────────────────────────────────────────────────────────
  'inventario-consultar-stock': {
    id: 'inventario-consultar-stock',
    title: 'Consultar stock de productos',
    description: 'Verifica el stock disponible de cualquier producto.',
    startRoute: '/inventario',
    estimatedMinutes: 2,
    steps: [
      {
        title: 'Módulo de Inventario',
        description: 'Aquí ves <strong>todos los productos</strong> con su stock, precios, alertas y ubicación. Los indicadores superiores muestran: total de activos, patrimonio, stock crítico y quiebres.',
        route: '/inventario',
        element: '[data-tour="inventario-kpis"]',
        narration: 'El módulo de inventario muestra todos los productos y su estado de stock.',
        side: 'bottom',
      },
      {
        title: 'Buscar un producto',
        description: 'Usa la barra de búsqueda para encontrar el producto por <strong>nombre, código, código de fábrica, OEM, marca o categoría</strong>.',
        element: '[data-tour="inventario-search"]',
        narration: 'Busca el producto por nombre, código o cualquier campo.',
        side: 'bottom',
      },
      {
        title: 'Filtrar por estado',
        description: 'Usa los filtros para ver solo activos, stock bajo, agotados o rotación lenta. Cambia la sede si tienes acceso consolidado.',
        element: '[data-tour="inventario-search"]',
        narration: 'Filtra el inventario por estado, categoría y sede.',
        side: 'bottom',
      },
      {
        title: 'Interpretar el stock',
        description: 'La tabla muestra el stock actual. Si el número está en <span style="color:#ef4444;font-weight:bold">rojo</span> = sin stock. En <span style="color:#f59e0b;font-weight:bold">ámbar</span> = por debajo del mínimo. En verde = normal.',
        element: '[data-tour="inventario-table"]',
        narration: 'El color del stock indica su estado: rojo sin stock, ámbar bajo mínimo, verde normal.',
        side: 'top',
      },
      {
        title: 'Ver el Kardex',
        description: 'Haz clic en el código de un producto para ir a su <strong>Kardex</strong>: historial completo de entradas, salidas, ajustes y transferencias con fechas y responsables.',
        element: '[data-tour="inventario-table"]',
        narration: 'Haz clic en el código del producto para ver su historial completo en el Kardex.',
        side: 'top',
      },
    ],
  },

  'inventario-ajuste-stock': {
    id: 'inventario-ajuste-stock',
    title: 'Ajustar el stock de un producto',
    description: 'Corrige el stock cuando hay diferencia entre el sistema y el físico.',
    startRoute: '/inventario',
    estimatedMinutes: 3,
    steps: [
      {
        title: '¿Cuándo hacer un ajuste?',
        description: 'Un ajuste corrige el stock cuando hay diferencia entre lo que dice el sistema y lo que hay físicamente. Puede ser por <strong>merma, error de conteo o producto dañado</strong>.',
        route: '/inventario',
        narration: 'Un ajuste corrige diferencias entre el stock del sistema y el físico.',
      },
      {
        title: 'Buscar el producto',
        description: 'Encuentra el producto en la tabla de inventario usando la barra de búsqueda.',
        element: '[data-tour="inventario-search"]',
        narration: 'Busca el producto que necesitas ajustar.',
        side: 'bottom',
      },
      {
        title: 'Abrir el ajuste',
        description: 'Haz clic en el ícono de <strong>ajuste</strong> (columna de acciones) o en el botón "Ajustar Stock". Se abrirá un modal.',
        element: '[data-tour="inventario-table"]',
        narration: 'Haz clic en el ícono de ajuste en la columna de acciones.',
        side: 'top',
      },
      {
        title: 'Ingresar el ajuste',
        description: 'Escribe la <strong>cantidad a ajustar</strong>: positiva (+) para agregar stock, negativa (-) para reducirlo. Incluye siempre un <strong>motivo</strong>: conteo físico, producto dañado, etc.',
        element: '[data-tour="inventario-table"]',
        narration: 'Ingresa la cantidad y el motivo del ajuste.',
        side: 'top',
      },
      {
        title: 'Ajuste registrado',
        description: 'El ajuste se registra en el <strong>Kardex</strong> con tu nombre, la fecha y el motivo. El gerente puede ver y revertir ajustes desde el Kardex si fue un error.',
        element: '[data-tour="inventario-table"]',
        narration: 'El ajuste queda registrado en el Kardex con trazabilidad completa.',
        side: 'top',
      },
    ],
  },

  'inventario-nuevo-producto': {
    id: 'inventario-nuevo-producto',
    title: 'Registrar un nuevo producto',
    description: 'Agrega un producto al catálogo maestro del sistema.',
    startRoute: '/inventario',
    estimatedMinutes: 4,
    allowedRoles: ['GERENTE'],
    steps: [
      {
        title: 'Nuevo producto (solo Gerente)',
        description: 'Solo el gerente puede crear nuevos productos. Al crearlo, queda en el <strong>catálogo maestro</strong> y todas las sucursales pueden tenerlo en stock.',
        route: '/inventario',
        narration: 'Solo el gerente puede crear productos en el catálogo maestro.',
      },
      {
        title: 'Botón Nuevo Activo',
        description: 'Haz clic en <strong>"Nuevo Activo"</strong> en la esquina superior derecha.',
        element: '[data-tour="inventario-new-btn"]',
        narration: 'Haz clic en Nuevo Activo para abrir el formulario.',
        side: 'bottom',
      },
      {
        title: 'Datos básicos',
        description: 'Completa: <strong>nombre</strong>, <strong>código</strong> (o el sistema lo genera), <strong>categoría</strong>, <strong>unidad de medida</strong> (pieza, litro, kg…), <strong>marca</strong> y <strong>país de origen</strong>.',
        narration: 'Completa el nombre, código, categoría, unidad y marca.',
      },
      {
        title: 'Códigos alternativos',
        description: 'Ingresa el <strong>código de fábrica</strong> y el <strong>código OEM</strong> si existen. Son clave para encontrar el producto al buscar en el POS o buscador global.',
        narration: 'Ingresa el código de fábrica y OEM para facilitar la búsqueda.',
      },
      {
        title: 'Precios y costo',
        description: 'Ingresa el <strong>costo de compra</strong>, <strong>precio con factura</strong>, <strong>precio sin factura</strong> y <strong>precio mayorista</strong>. El sistema calculará márgenes.',
        narration: 'Ingresa el costo y los diferentes precios de venta.',
      },
      {
        title: 'Stock inicial y mínimo',
        description: 'Ingresa el <strong>stock inicial</strong> (unidades que tienes ahora) y el <strong>stock mínimo</strong> (nivel de alerta). El sistema crea el primer movimiento en el Kardex automáticamente.',
        narration: 'Define el stock inicial y el stock mínimo para alertas.',
      },
      {
        title: '¡Producto creado!',
        description: 'El producto queda en el catálogo maestro. Puedes venderlo desde el POS, transferirlo a otras sucursales y rastrear su historial en el Kardex.',
        narration: 'Producto creado. Ya está disponible para venta y transferencias.',
      },
    ],
  },

  // ── Kardex ─────────────────────────────────────────────────────────────────
  'kardex-historial': {
    id: 'kardex-historial',
    title: 'Leer el Kardex de un producto',
    description: 'Entiende el historial de movimientos y la evolución de stock.',
    startRoute: '/kardex',
    estimatedMinutes: 3,
    steps: [
      {
        title: '¿Qué es el Kardex?',
        description: 'El Kardex es el <strong>historial completo</strong> de todo lo que pasó con el stock de un producto: cada venta, compra, ajuste, transferencia y devolución, con fecha y responsable.',
        route: '/kardex',
        element: '[data-tour="kardex-search"]',
        narration: 'El Kardex registra cada movimiento de stock: entradas, salidas, ajustes y transferencias.',
        side: 'bottom',
      },
      {
        title: 'Buscar un producto',
        description: 'Escribe el nombre o código en el buscador. También puedes llegar aquí desde <strong>Inventario → clic en el código</strong> de cualquier producto. Usa los filtros de estado para ver solo los agotados o con stock bajo.',
        element: '[data-tour="kardex-filters"]',
        narration: 'Busca por nombre o código, o filtra por estado de stock.',
        side: 'bottom',
      },
      {
        title: 'Selecciona un producto',
        description: 'Haz clic en cualquier tarjeta para abrir su <strong>historial completo de movimientos</strong>. En la siguiente pantalla verás KPIs, gráfico de evolución y la tabla de movimientos.',
        element: '[data-tour="kardex-grid"]',
        narration: 'Haz clic en un producto para ver su historial detallado.',
        side: 'top',
      },
      {
        title: 'Indicadores (KPIs)',
        description: 'Los 4 indicadores muestran: <strong>stock actual</strong> (rojo si está bajo mínimo), <strong>valuación</strong> (costo × stock, solo gerente), <strong>entradas del período</strong> y <strong>salidas del período</strong>.',
        element: '[data-tour="kardex-kpis"]',
        narration: 'Los KPIs muestran el stock actual, valuación y movimientos del período.',
        side: 'bottom',
      },
      {
        title: 'Gráfico de evolución',
        description: 'Muestra cómo cambió el stock en el tiempo. La <strong>línea roja punteada</strong> es el mínimo configurado. Pasa el cursor sobre un punto para ver fecha, tipo de movimiento y cantidad.',
        element: '[data-tour="kardex-chart"]',
        narration: 'El gráfico muestra la evolución del stock. La línea roja es el mínimo.',
        side: 'bottom',
      },
      {
        title: 'Tabla, filtros y exportación',
        description: 'Cada fila tiene un color: <span style="color:#10b981;font-weight:bold">verde</span> = entradas, <span style="color:#ef4444;font-weight:bold">rojo</span> = salidas, <span style="color:#8b5cf6;font-weight:bold">violeta</span> = ajustes. Filtra por <strong>fecha</strong>, <strong>tipo</strong>, <strong>responsable</strong> o <strong>dirección</strong>. Exporta a <strong>Excel o CSV</strong>.',
        element: '[data-tour="kardex-table"]',
        narration: 'Filtra movimientos por fecha, tipo o responsable. Exporta a Excel o CSV.',
        side: 'top',
      },
    ],
  },

  // ── Ventas ─────────────────────────────────────────────────────────────────
  'ventas-ver-historial': {
    id: 'ventas-ver-historial',
    title: 'Ver historial de ventas',
    description: 'Consulta el detalle de ventas por fecha, cajero o producto.',
    startRoute: '/ventas',
    estimatedMinutes: 2,
    steps: [
      {
        title: 'Módulo de Ventas',
        description: 'Aquí ves el <strong>historial completo de ventas</strong>: tickets, montos, métodos de pago, cajero y fecha. Puedes filtrar, buscar y exportar.',
        route: '/ventas',
        element: '[data-tour="ventas-filters"]',
        narration: 'El módulo de ventas muestra el historial completo de todas las ventas.',
        side: 'bottom',
      },
      {
        title: 'Filtrar por fecha',
        description: 'Usa el selector de fecha para ver ventas de un día, semana o rango personalizado. Por defecto muestra <strong>el día de hoy</strong>.',
        element: '[data-tour="ventas-filters"]',
        narration: 'Filtra por fecha para ver ventas de un período específico.',
        side: 'bottom',
      },
      {
        title: 'Ver detalle de una venta',
        description: 'Haz clic en cualquier venta para ver el <strong>detalle completo</strong>: productos, cantidades, precios, descuentos y método de pago. También puedes imprimir el ticket.',
        element: '[data-tour="ventas-table"]',
        narration: 'Haz clic en una venta para ver todos sus detalles e imprimir el ticket.',
        side: 'top',
      },
      {
        title: 'Exportar',
        description: 'Usa el botón <strong>"Exportar CSV"</strong> para descargar el historial filtrado en el rango de fechas seleccionado. Útil para contabilidad e informes.',
        element: '[data-tour="ventas-export"]',
        narration: 'Exporta el historial filtrado a CSV para contabilidad e informes.',
        side: 'bottom',
      },
    ],
  },

  'ventas-anular-venta': {
    id: 'ventas-anular-venta',
    title: 'Anular una venta',
    description: 'Cancela una venta registrada y devuelve el stock automáticamente.',
    startRoute: '/ventas',
    estimatedMinutes: 2,
    allowedRoles: ['GERENTE'],
    steps: [
      {
        title: 'Anulación de ventas',
        description: 'Solo el <strong>gerente</strong> puede anular ventas. Al anular, el stock se devuelve automáticamente y el movimiento queda en el Kardex como "Anulación de Venta".',
        route: '/ventas',
        narration: 'Solo el gerente puede anular ventas. El stock se devuelve automáticamente.',
      },
      {
        title: 'Encontrar la venta',
        description: 'Busca la venta por fecha, cajero o número de ticket usando los filtros. Haz clic en la venta para ver su detalle.',
        element: '[data-tour="ventas-filters"]',
        narration: 'Filtra y encuentra la venta que deseas anular.',
        side: 'bottom',
      },
      {
        title: 'Botón Anular',
        description: 'Dentro del detalle de la venta, aparece el botón <strong>"Anular Venta"</strong>. Solo está visible para el gerente.',
        element: '[data-tour="ventas-table"]',
        narration: 'Dentro del detalle encontrarás el botón Anular Venta.',
        side: 'top',
      },
      {
        title: 'Confirmar y justificar',
        description: 'Escribe el <strong>motivo de la anulación</strong>. El sistema registra quién anuló, cuándo y por qué. Este registro es permanente y no puede borrarse.',
        narration: 'Ingresa el motivo. La anulación queda registrada permanentemente.',
      },
      {
        title: 'Stock devuelto',
        description: 'El stock de cada producto de la venta anulada se devuelve automáticamente. Verás el movimiento de tipo <strong>"Anulación"</strong> en el Kardex de cada producto.',
        narration: 'El stock se devuelve automáticamente. El Kardex registra la anulación.',
      },
    ],
  },

  // ── Envíos ─────────────────────────────────────────────────────────────────
  'envios-crear-envio': {
    id: 'envios-crear-envio',
    title: 'Crear un envío entre sucursales',
    description: 'Transfiere productos de tu sucursal a otra.',
    startRoute: '/envios',
    estimatedMinutes: 4,
    steps: [
      {
        title: 'Módulo de Envíos',
        description: 'Los envíos son <strong>transferencias de stock</strong> entre sucursales. <strong>Salientes</strong> son los que tu sucursal despacha; <strong>Entrantes</strong>, los que debes confirmar al recibir.',
        route: '/envios',
        element: '[data-tour="envios-tabs"]',
        narration: 'Los envíos transfieren stock entre sucursales. Salientes los que despachas, entrantes los que recibes.',
        side: 'bottom',
      },
      {
        title: 'Nuevo envío',
        description: 'Haz clic en <strong>"Envío directo"</strong>. Selecciona la sucursal de <strong>destino</strong>.',
        element: '[data-tour="envios-new-btn"]',
        narration: 'Crea un nuevo envío y selecciona la sucursal de destino.',
        side: 'bottom',
      },
      {
        title: 'Agregar productos',
        description: 'Busca los productos y escribe la <strong>cantidad a transferir</strong>. El sistema verifica que tengas ese stock disponible en tu sucursal.',
        narration: 'Agrega los productos y las cantidades a transferir.',
      },
      {
        title: 'Asignar transporte (opcional)',
        description: 'Si el envío usa transportista externo, selecciónalo y agrega el <strong>costo del flete</strong> si aplica.',
        narration: 'Asigna el transportista y el costo del flete si corresponde.',
      },
      {
        title: 'Confirmar envío',
        description: 'Al confirmar, el stock <strong>sale de tu sucursal</strong> inmediatamente. El envío queda en estado <strong>"En Preparación"</strong>. La sucursal destino ve el envío pendiente de recepción.',
        narration: 'Confirma. El stock sale de tu sucursal y la otra sucursal puede recibirlo.',
      },
      {
        title: 'Seguimiento',
        description: 'Puedes ver el estado en todo momento: <strong>Preparación → En tránsito → Recibido</strong>. Si hay discrepancias al recibir, se registran automáticamente.',
        element: '[data-tour="envios-list"]',
        narration: 'Sigue el estado del envío hasta que sea confirmado como recibido.',
        side: 'top',
      },
    ],
  },

  'envios-recibir-envio': {
    id: 'envios-recibir-envio',
    title: 'Recibir un envío en tu sucursal',
    description: 'Confirma la recepción de productos enviados desde otra sucursal.',
    startRoute: '/envios',
    estimatedMinutes: 3,
    steps: [
      {
        title: 'Envíos recibidos',
        description: 'Cuando otra sucursal te envía productos, aparecen en tu módulo de Envíos en la pestaña <strong>"Recibidos"</strong> o <strong>"Pendientes de recepción"</strong>.',
        route: '/envios',
        narration: 'Los envíos que te llegan aparecen en la pestaña de recibidos.',
      },
      {
        title: 'Abrir el envío',
        description: 'Haz clic en el envío pendiente para ver su detalle: qué productos vienen, qué sucursal lo envió y el transportista.',
        element: '[data-tour="envios-list"]',
        narration: 'Haz clic en el envío pendiente para ver su detalle.',
        side: 'top',
      },
      {
        title: 'Verificar físicamente',
        description: '<strong>Antes de confirmar</strong>, cuenta físicamente los productos recibidos. Si la cantidad recibida es diferente a la enviada, puedes anotarlo.',
        element: '[data-tour="envios-list"]',
        narration: 'Cuenta físicamente los productos antes de confirmar la recepción.',
        side: 'top',
      },
      {
        title: 'Confirmar recepción',
        description: 'Ingresa las <strong>cantidades realmente recibidas</strong>. Si hay diferencia con lo enviado, queda registrada como <strong>discrepancia</strong> para revisión del gerente.',
        narration: 'Confirma las cantidades recibidas. Las diferencias quedan registradas.',
      },
      {
        title: 'Stock ingresado',
        description: 'El stock entra a tu sucursal automáticamente. El Kardex registra la recepción como <strong>"Recepción TRF"</strong>. La sucursal origen ve el envío como completado.',
        narration: 'El stock ingresa a tu sucursal. El Kardex registra la recepción de transferencia.',
      },
    ],
  },

  // ── Compras ────────────────────────────────────────────────────────────────
  'compras-nueva-compra': {
    id: 'compras-nueva-compra',
    title: 'Registrar una compra a proveedor',
    description: 'Ingresa una compra de mercadería al sistema.',
    startRoute: '/compras/nueva',
    estimatedMinutes: 4,
    steps: [
      {
        title: 'Nueva compra',
        description: 'Aquí registras compras de productos a proveedores. El sistema actualiza el stock y el Kardex automáticamente al confirmar. A la izquierda está el carrito y a la derecha la grilla de productos.',
        route: '/compras/nueva',
        narration: 'En este módulo registras compras a proveedores.',
      },
      {
        title: 'Seleccionar proveedor',
        description: 'Busca y selecciona el <strong>proveedor</strong> y la fecha de la compra. Si el proveedor no existe, primero créalo en el módulo de <strong>Proveedores</strong>.',
        element: '[data-tour="compras-supplier"]',
        side: 'right',
        narration: 'Selecciona el proveedor. Si no existe, créalo en el módulo de Proveedores.',
      },
      {
        title: 'Agregar productos',
        description: 'Busca cada producto por nombre o código. Haz clic para agregarlo al carrito. Luego ajusta la <strong>cantidad</strong> y el <strong>costo unitario</strong> en el carrito.',
        element: '[data-tour="compras-search"]',
        side: 'left',
        narration: 'Busca los productos y agrégalos al carrito con sus cantidades y costos.',
      },
      {
        title: 'Método de pago',
        description: 'Elige cómo se paga esta compra: <strong>Efectivo</strong>, <strong>Transferencia</strong>, <strong>QR</strong> o <strong>Crédito al proveedor</strong>. Si es crédito, define la fecha de vencimiento.',
        element: '[data-tour="compras-payment"]',
        side: 'right',
        narration: 'Elige el método de pago. Si es crédito al proveedor, define la fecha de vencimiento.',
      },
      {
        title: 'Registrar entrada',
        description: 'Al confirmar, el stock aumenta en el Kardex con tipo <strong>"Reposición"</strong> y el costo unitario queda registrado. Puedes ver el historial en el módulo de Compras.',
        element: '[data-tour="compras-confirm"]',
        side: 'top',
        narration: 'Confirma la compra. El stock y el Kardex se actualizan automáticamente.',
      },
    ],
  },

  // ── Clientes ───────────────────────────────────────────────────────────────
  'clientes-nuevo-cliente': {
    id: 'clientes-nuevo-cliente',
    title: 'Registrar un nuevo cliente',
    description: 'Agrega un cliente al sistema para ventas a crédito e historial.',
    startRoute: '/clientes',
    estimatedMinutes: 3,
    steps: [
      {
        title: 'Módulo de Clientes',
        description: 'Aquí gestionas tu base de clientes. Un cliente registrado puede <strong>comprar a crédito</strong>, tiene historial de compras y puede recibir precios especiales.',
        route: '/clientes',
        element: '[data-tour="clientes-table"]',
        narration: 'El módulo de clientes gestiona tu base de compradores.',
        side: 'top',
      },
      {
        title: 'Nuevo cliente',
        description: 'Haz clic en <strong>"Vincular Nuevo Socio"</strong>. Completa sus datos: nombre completo, carnet de identidad, teléfono y dirección.',
        element: '[data-tour="clientes-new-btn"]',
        narration: 'Crea un nuevo cliente con sus datos básicos.',
        side: 'bottom',
      },
      {
        title: 'Configurar crédito (opcional)',
        description: 'Si el cliente comprará a crédito, activa esa opción y define el <strong>límite de crédito</strong> (monto máximo en deuda permitido).',
        narration: 'Si el cliente comprará a crédito, configura su límite.',
      },
      {
        title: '¡Cliente registrado!',
        description: 'Ya puede comprar en el POS. Su historial, deuda y cuotas pendientes se ven en el módulo de <strong>Créditos</strong>.',
        narration: 'Cliente registrado. Su historial y créditos se ven en el módulo de Créditos.',
      },
    ],
  },

  'clientes-historial': {
    id: 'clientes-historial',
    title: 'Ver el historial de un cliente',
    description: 'Consulta compras, deuda y cuotas pendientes de un cliente.',
    startRoute: '/clientes',
    estimatedMinutes: 2,
    steps: [
      {
        title: 'Buscar el cliente',
        description: 'Busca por nombre, razón social o carnet de identidad. El listado se filtra en tiempo real.',
        element: '[data-tour="clientes-search"]',
        narration: 'Busca el cliente por nombre o carnet.',
        side: 'bottom',
      },
      {
        title: 'Seleccionar el cliente',
        description: 'Haz clic en la fila del cliente para ver su <strong>perfil completo</strong>: historial de compras, deuda total, límite de crédito disponible y cuotas pendientes.',
        element: '[data-tour="clientes-table"]',
        narration: 'Haz clic en el cliente para ver su perfil completo.',
        side: 'top',
      },
      {
        title: 'Cuotas pendientes',
        description: 'En el perfil del cliente, las cuotas vencidas aparecen en <span style="color:#ef4444;font-weight:bold">rojo</span>. Puedes registrar un abono desde ahí mismo o desde el módulo de <strong>Créditos</strong>.',
        narration: 'Las cuotas vencidas aparecen en rojo. Puedes cobrar desde el perfil o desde Créditos.',
      },
    ],
  },

  // ── Créditos ───────────────────────────────────────────────────────────────
  'creditos-gestionar': {
    id: 'creditos-gestionar',
    title: 'Gestionar créditos y cobrar cuotas',
    description: 'Ve las cuotas pendientes y registra pagos de clientes.',
    startRoute: '/creditos',
    estimatedMinutes: 3,
    steps: [
      {
        title: 'Módulo de Créditos',
        description: 'Aquí ves todas las <strong>ventas a crédito activas</strong>: cliente, deuda total, saldo pendiente, próximo vencimiento y estado. Las filas en rojo tienen cuotas vencidas.',
        element: '[data-tour="creditos-table"]',
        narration: 'El módulo de créditos muestra todas las ventas a crédito y sus cuotas.',
        side: 'top',
      },
      {
        title: 'Filtrar la cartera',
        description: 'Usa los filtros para ver solo cuotas <strong>vencidas</strong>, de un cliente específico, o por rango de fechas. Ordena por vencimiento para priorizar los cobros del día.',
        element: '[data-tour="creditos-filters"]',
        narration: 'Filtra por estado vencida, cliente o fecha para priorizar cobros.',
        side: 'bottom',
      },
      {
        title: 'Registrar un cobro',
        description: 'Presiona <strong>"Cobrar"</strong> en la fila del cliente. Aparece el detalle de la próxima cuota: monto, fecha de vencimiento y días de atraso. Elige el método de pago y confirma.',
        element: '[data-tour="creditos-cobrar"]',
        narration: 'Presiona Cobrar para registrar el pago de la próxima cuota.',
        side: 'left',
      },
      {
        title: 'Pago parcial',
        description: 'Si el cliente paga solo una parte, puedes ingresar el <strong>monto parcial</strong>. El saldo restante queda pendiente en la misma cuota.',
        narration: 'Puedes registrar pagos parciales. El saldo restante queda pendiente.',
      },
      {
        title: 'Historial y detalles',
        description: 'El botón <strong>"Detalles"</strong> muestra el plan de cuotas completo y el historial de todos los pagos registrados con fecha, monto y responsable.',
        element: '[data-tour="creditos-table"]',
        narration: 'El botón Detalles muestra el plan completo y el historial de pagos.',
        side: 'top',
      },
    ],
  },

  // ── Estadísticas ───────────────────────────────────────────────────────────
  'estadisticas-dashboard': {
    id: 'estadisticas-dashboard',
    title: 'Usar el panel de estadísticas',
    description: 'Analiza ventas, rendimiento por sucursal y tendencias del negocio.',
    startRoute: '/estadisticas',
    estimatedMinutes: 3,
    allowedRoles: ['GERENTE'],
    steps: [
      {
        title: 'Cinco módulos de análisis',
        description: 'El panel tiene <strong>5 pestañas</strong>: Asistente IA (análisis en lenguaje natural), Rotación de Inventario, Ventas por Período, Top Productos y Top Clientes. Haz clic en cada pestaña para cambiar el análisis.',
        route: '/estadisticas',
        element: '[data-tour="estadisticas-tabs"]',
        narration: 'Cinco pestañas de análisis: Asistente IA, Rotación, Ventas, Top Productos y Top Clientes.',
        side: 'bottom',
      },
      {
        title: 'Filtro por sucursal',
        description: 'El selector de la derecha te permite analizar <strong>una sucursal específica, todas consolidadas</strong> o usar la selección global del header. Todos los tabs respetan este filtro.',
        element: '[data-tour="estadisticas-branch"]',
        narration: 'Filtra por sucursal específica, todas consolidadas o la selección global.',
        side: 'bottom',
      },
      {
        title: 'Asistente IA — tu analista',
        description: 'El <strong>Asistente IA</strong> responde preguntas sobre ventas, márgenes, productos y clientes en lenguaje natural. Consulta datos reales de tu negocio directamente desde aquí.',
        element: '[data-tour="estadisticas-asistente"]',
        narration: 'El Asistente IA analiza tus datos y responde en lenguaje natural.',
        side: 'top',
      },
      {
        title: 'Consultas rápidas predefinidas',
        description: 'Los chips te dan análisis con un clic: <strong>ventas de la semana, top 5 productos, historial mensual, clientes frecuentes, margen de los últimos 90 días</strong> y más. Ideal para el seguimiento diario.',
        element: '[data-tour="estadisticas-chips"]',
        narration: 'Los chips ejecutan análisis frecuentes con un solo clic.',
        side: 'top',
      },
      {
        title: 'Haz tu propia pregunta',
        description: 'Escribe cualquier consulta en lenguaje natural. Ejemplos: <em>"¿Cuánto vendí en enero comparado con febrero?"</em>, <em>"¿Cuál es el margen por categoría de producto?"</em>, <em>"¿Qué proveedor concentra más compras?"</em>',
        element: '[data-tour="estadisticas-input"]',
        narration: 'Escribe cualquier pregunta de negocio y el asistente la responde con datos reales.',
        side: 'top',
      },
    ],
  },

  // ── Tesorería ──────────────────────────────────────────────────────────────
  'tesoreria-overview': {
    id: 'tesoreria-overview',
    title: 'Gestionar cuentas en Tesorería',
    description: 'Administra cuentas bancarias, caja fuerte y transferencias internas.',
    startRoute: '/tesoreria',
    estimatedMinutes: 3,
    allowedRoles: ['GERENTE'],
    steps: [
      {
        title: 'Módulo de Tesorería',
        description: 'Tesorería (solo gerente) centraliza el <strong>control de todas las cuentas</strong> del negocio: cuentas bancarias, caja fuerte y flujo de efectivo.',
        route: '/tesoreria',
        element: '[data-tour="tesoreria-tabs"]',
        narration: 'Tesorería centraliza el control de todas las cuentas del negocio.',
        side: 'bottom',
      },
      {
        title: 'Ver saldos de cuentas',
        description: 'Cada cuenta muestra su <strong>saldo actual</strong>, el banco o entidad, y el historial de movimientos. Haz clic en una cuenta para ver todos sus movimientos.',
        element: '[data-tour="tesoreria-accounts"]',
        narration: 'Cada cuenta muestra su saldo actual. Haz clic para ver el historial.',
        side: 'top',
      },
      {
        title: 'Registrar transferencias',
        description: 'Para mover dinero entre cuentas (ej: de caja a banco), ve a la pestaña <strong>"Transferencias"</strong> y usa <strong>"Nueva Transferencia"</strong>. Ingresa origen, destino, monto y concepto.',
        element: '[data-tour="tesoreria-tabs"]',
        narration: 'En la pestaña Transferencias puedes mover dinero entre cuentas.',
        side: 'bottom',
      },
      {
        title: 'Conciliación bancaria',
        description: 'En la pestaña <strong>"Conciliación"</strong> importas el estado de cuenta bancario (Excel) y el sistema cruza automáticamente cada línea con los asientos registrados. Las líneas no matcheadas requieren acción manual.',
        element: '[data-tour="tesoreria-tabs"]',
        narration: 'Importa el extracto bancario y concilia con los asientos del sistema.',
        side: 'bottom',
      },
      {
        title: 'Configuración',
        description: 'En <strong>"Configuración"</strong> defines las cuentas por defecto para cada método de pago, límites de gasto del cajero, umbrales de alerta y políticas de conciliación.',
        element: '[data-tour="tesoreria-tabs"]',
        narration: 'Configura cuentas por defecto, límites y alertas del módulo.',
        side: 'bottom',
      },
    ],
  },

  // ── Proveedores ────────────────────────────────────────────────────────────
  'proveedores-nuevo': {
    id: 'proveedores-nuevo',
    title: 'Registrar un proveedor',
    description: 'Agrega un proveedor para asociarlo a compras y garantías.',
    startRoute: '/proveedores',
    estimatedMinutes: 2,
    steps: [
      {
        title: 'Directorio de proveedores',
        description: 'Cada tarjeta representa una <strong>empresa proveedora</strong>. Muestra el nombre, cuántas cuentas tiene y el <strong>saldo total</strong>: rojo = deuda pendiente, verde = saldo a favor.',
        route: '/proveedores',
        element: '[data-tour="proveedores-grid"]',
        narration: 'Cada tarjeta es un proveedor con su saldo actual.',
        side: 'top',
      },
      {
        title: 'Filtrar proveedores',
        description: 'Usa los filtros para ver solo <strong>proveedores con saldo por pagar</strong> o <strong>a tu favor</strong>. La barra de búsqueda filtra por nombre, NIT o razón social.',
        element: '[data-tour="proveedores-tabs"]',
        narration: 'Filtra por estado de saldo o busca por nombre o NIT.',
        side: 'bottom',
      },
      {
        title: 'Ver detalle del proveedor',
        description: 'Haz clic en cualquier tarjeta para ver el <strong>detalle de cuentas</strong>, historial de compras, devoluciones y el botón de pago. También puedes hacer <strong>clic derecho</strong> para acceder a las acciones rápidas.',
        element: '[data-tour="proveedores-grid"]',
        narration: 'Haz clic en una tarjeta para ver cuentas, historial y pagar.',
        side: 'top',
      },
      {
        title: 'Registrar una empresa (GERENTE)',
        description: 'Haz clic en <strong>"Nueva Empresa"</strong> para agregar un nuevo proveedor. Completa razón social, NIT, teléfono y condiciones de pago. Dentro de la empresa puedes agregar <strong>múltiples cuentas</strong> (distintos NIT, sucursales, etc.).',
        element: '[data-tour="proveedores-new-btn"]',
        narration: 'Nueva Empresa crea un proveedor con todas sus cuentas asociadas.',
        side: 'bottom',
      },
    ],
  },

  // ── Pedidos ────────────────────────────────────────────────────────────────
  'pedidos-nuevo': {
    id: 'pedidos-nuevo',
    title: 'Crear un pedido interno',
    description: 'Solicita productos a Casa Matriz cuando necesitas reabastecerte.',
    startRoute: '/pedidos',
    estimatedMinutes: 3,
    steps: [
      {
        title: '¿Qué es un pedido?',
        description: 'Un pedido es una <strong>solicitud de reabastecimiento</strong> entre sucursales. La pestaña <strong>Emitidos</strong> muestra los pedidos que hiciste tú; <strong>Entrantes</strong>, los que debes despachar.',
        route: '/pedidos',
        element: '[data-tour="pedidos-tabs"]',
        narration: 'Un pedido es una solicitud de reabastecimiento a otra sucursal.',
        side: 'bottom',
      },
      {
        title: 'Crear un nuevo pedido',
        description: 'Haz clic en <strong>"Nuevo Pedido"</strong>. Selecciona los productos que necesitas, la cantidad solicitada y la fecha requerida. Puedes agregar una nota de urgencia.',
        element: '[data-tour="pedidos-new-btn"]',
        narration: 'Haz clic en Nuevo Pedido para iniciar la solicitud.',
        side: 'bottom',
      },
      {
        title: 'Seguimiento de estados',
        description: 'El pedido pasa por: <strong>Borrador → Vigente → Despachado</strong>. Mientras está en borrador puedes editarlo. Al validarlo queda vigente y la otra sucursal debe despacharlo.',
        element: '[data-tour="pedidos-list"]',
        narration: 'Sigue el estado de cada pedido desde la lista.',
        side: 'top',
      },
      {
        title: 'Recibir el pedido',
        description: 'Cuando la otra sucursal despacha el pedido, llega como un <strong>Envío</strong> a tu módulo de Envíos. Confírmalo desde ahí para que el stock se actualice automáticamente.',
        element: '[data-tour="pedidos-list"]',
        narration: 'El pedido despachado llega como un envío. Confírmalo en el módulo de Envíos.',
        side: 'top',
      },
    ],
  },

  // ── Transportes ───────────────────────────────────────────────────────────
  'transportes-directorio': {
    id: 'transportes-directorio',
    title: 'Directorio de transportistas',
    description: 'Consulta y gestiona los transportistas para envíos entre sucursales.',
    startRoute: '/transportes',
    estimatedMinutes: 2,
    steps: [
      {
        title: 'Módulo de Transportes',
        description: 'Aquí se registran los <strong>transportistas externos</strong> que mueven mercancía entre sucursales. Cada uno tiene datos de contacto, tipo de transporte y su historial de fletes.',
        route: '/transportes',
        element: '[data-tour="transportes-search"]',
        narration: 'El módulo de transportes gestiona los transportistas para envíos.',
        side: 'bottom',
      },
      {
        title: 'Directorio de transportistas',
        description: 'Cada tarjeta muestra la <strong>razón social, NIT, tipo de transporte, teléfono</strong> y estadísticas de uso: cuántos envíos realizó y el costo total de fletes acumulado.',
        element: '[data-tour="transportes-grid"]',
        narration: 'Cada tarjeta muestra el transportista con su historial de envíos y costos.',
        side: 'top',
      },
      {
        title: 'Registrar un transportista',
        description: 'El GERENTE puede agregar nuevos transportistas con <strong>"Nuevo Transporte"</strong>. Al asignar un transportista a un envío, sus estadísticas de uso se actualizan automáticamente.',
        element: '[data-tour="transportes-new-btn"]',
        narration: 'El gerente puede registrar nuevos transportistas desde aquí.',
        side: 'bottom',
      },
    ],
  },

  // ── Auditoría ──────────────────────────────────────────────────────────────
  'auditoria-consultar': {
    id: 'auditoria-consultar',
    title: 'Usar el registro de auditoría',
    description: 'Consulta el historial de acciones del sistema para control y seguridad.',
    startRoute: '/auditoria',
    estimatedMinutes: 2,
    allowedRoles: ['GERENTE'],
    steps: [
      {
        title: 'Consola de Auditoría',
        description: 'Panel exclusivo para el gerente. Los <strong>4 KPIs superiores</strong> muestran de un vistazo: alertas no leídas, discrepancias activas, total de logs del sistema y sucursales monitoreadas.',
        route: '/auditoria',
        element: '[data-tour="auditoria-kpis"]',
        narration: 'Los KPIs muestran alertas no leídas, discrepancias activas y logs totales.',
        side: 'bottom',
      },
      {
        title: 'Cinco vistas de trazabilidad',
        description: 'Las tabs organizan los datos por categoría: <strong>Alertas</strong> (anomalías del sistema), <strong>Logs</strong> (acciones de usuarios), <strong>Discrepancias</strong> (diferencias de traspaso o caja), <strong>Kardex</strong> (todos los movimientos) y <strong>Caja</strong> (sesiones de cajero).',
        element: '[data-tour="auditoria-tabs"]',
        narration: 'Cinco tabs: Alertas, Logs, Discrepancias, Kardex y Caja.',
        side: 'bottom',
      },
      {
        title: 'Filtros de búsqueda',
        description: 'Filtra por <strong>sucursal, usuario, tipo de acción, severidad y rango de fechas</strong>. Guarda tus filtros favoritos como "Vistas guardadas" para reutilizarlos. Ejemplo: "discrepancias de caja de la semana pasada en sucursal Norte".',
        element: '[data-tour="auditoria-filters"]',
        narration: 'Filtra por sucursal, usuario, acción o fechas. Guarda vistas para reusarlas.',
        side: 'bottom',
      },
      {
        title: 'Tabla de registros y exportación',
        description: 'Haz clic en cualquier fila para ver el <strong>detalle completo</strong>: valores anteriores vs nuevos, metadatos y usuario responsable. Usa <strong>"Exportar Reporte"</strong> en la cabecera para descargar el registro filtrado a CSV.',
        element: '[data-tour="auditoria-table"]',
        narration: 'Haz clic en una fila para ver el detalle completo. Exporta a CSV para auditorías externas.',
        side: 'top',
      },
    ],
  },

  // ── Gerencia ───────────────────────────────────────────────────────────────
  'gerencia-dashboard': {
    id: 'gerencia-dashboard',
    title: 'Panel de Gerencia',
    description: 'Gestiona aprobaciones, políticas y control de todas las sucursales.',
    startRoute: '/gerencia',
    estimatedMinutes: 3,
    allowedRoles: ['GERENTE'],
    steps: [
      {
        title: 'Centro de Gerencia',
        description: 'Panel exclusivo para gerentes. Aquí apruebas <strong>gastos, devoluciones y descuentos</strong> que requieren autorización, y revisas discrepancias de caja de todas las sucursales.',
        route: '/gerencia',
        element: '[data-tour="gerencia-header"]',
        narration: 'El centro de gerencia te da control total sobre las operaciones de todas las sucursales.',
        side: 'bottom',
      },
      {
        title: 'Alertas pendientes',
        description: 'Los chips de colores muestran cuántas aprobaciones están pendientes por categoría. <span style="color:#ef4444;font-weight:bold">Rojo</span> = urgente. Haz clic en uno para ir directo a esa sección.',
        element: '[data-tour="gerencia-banner"]',
        narration: 'Los chips muestran las aprobaciones pendientes por categoría.',
        side: 'bottom',
      },
      {
        title: 'Aprobar o rechazar',
        description: 'Selecciona una pestaña para ver las solicitudes. Por cada una puedes <strong>aprobar o rechazar</strong> con una nota. El empleado ve la decisión en tiempo real y todo queda en auditoría.',
        element: '[data-tour="gerencia-tabs"]',
        narration: 'Aprueba o rechaza operaciones. El empleado ve la decisión en tiempo real.',
        side: 'bottom',
      },
      {
        title: 'Políticas de la empresa',
        description: 'En la pestaña <strong>"Políticas"</strong> configuras los límites: monto máximo de descuento sin aprobación, límite de gasto por categoría, etc. Los cambios aplican a todas las sucursales.',
        element: '[data-tour="gerencia-tab-content"]',
        narration: 'En Políticas configuras los límites operativos de cada sucursal.',
        side: 'top',
      },
    ],
  },

  // ── Configuración ──────────────────────────────────────────────────────────
  'configuracion-general': {
    id: 'configuracion-general',
    title: 'Configuración del Sistema',
    description: 'Ajusta los datos de identidad, finanzas y mantenimiento del negocio.',
    startRoute: '/configuracion',
    estimatedMinutes: 2,
    allowedRoles: ['GERENTE'],
    steps: [
      {
        title: 'Configuración General',
        description: 'Este panel tiene <strong>tres secciones</strong>: <strong>Identidad</strong> (razón social y contacto), <strong>Finanzas</strong> (tipo de cambio) y <strong>Mantenimiento</strong> (snapshots, backup y purga). Puedes configurar globalmente o por sucursal usando el selector superior.',
        route: '/configuracion',
        element: '[data-tour="config-tabs"]',
        narration: 'Tres secciones: identidad comercial, finanzas y mantenimiento del sistema.',
        side: 'bottom',
      },
      {
        title: 'Identidad Comercial',
        description: 'Aquí configuras los datos que aparecen en <strong>facturas, recibos y PDF</strong>: razón social, NIT o ID fiscal, dirección, teléfono, email y sitio web. Mantén estos datos actualizados para que tus documentos sean válidos.',
        element: '[data-tour="config-identity"]',
        narration: 'Razón social, NIT, dirección y contacto. Estos datos aparecen en todos los documentos oficiales.',
        side: 'bottom',
      },
      {
        title: 'Tipo de Cambio',
        description: 'En la pestaña <strong>Finanzas</strong> configuras el tipo de cambio USD→BOB. Puedes ingresarlo manualmente o sincronizarlo automáticamente con el <strong>Banco Central de Bolivia (BCB)</strong> con un clic.',
        element: '[data-tour="config-tabs"]',
        narration: 'El tipo de cambio se usa en todas las ventas y reportes. Puedes sincronizarlo con el BCB.',
        side: 'bottom',
      },
      {
        title: 'Guardar cambios',
        description: 'El botón <strong>"Sincronizar Configuración"</strong> guarda los cambios de la pestaña activa. Los cambios aplican de inmediato para todos los usuarios de la sucursal seleccionada.',
        element: '[data-tour="config-save"]',
        narration: 'Sincronizar guarda los cambios y los aplica de inmediato en toda la sucursal.',
        side: 'top',
      },
    ],
  },

  // ── Usuarios ───────────────────────────────────────────────────────────────
  'usuarios-gestion': {
    id: 'usuarios-gestion',
    title: 'Gestión de Usuarios',
    description: 'Administra los accesos, roles y permisos de todos los colaboradores del sistema.',
    startRoute: '/usuarios',
    estimatedMinutes: 2,
    allowedRoles: ['GERENTE'],
    steps: [
      {
        title: 'Panel de Usuarios',
        description: 'Aquí controlas quién tiene acceso al sistema y con qué permisos. Puedes ver todos los usuarios, su rol asignado, la sucursal en la que operan y si están activos o suspendidos.',
        route: '/usuarios',
        element: '[data-tour="usuarios-kpis"]',
        narration: 'Panel de control de accesos. Muestra cuántos usuarios hay por rol y estado.',
        side: 'bottom',
      },
      {
        title: 'Búsqueda y filtros',
        description: 'Usa la barra de búsqueda para encontrar un usuario por nombre o email. El filtro de <strong>Rol</strong> te permite ver solo gerentes, encargados o vendedores.',
        element: '[data-tour="usuarios-filters"]',
        narration: 'Busca por nombre, email o filtra por rol.',
        side: 'bottom',
      },
      {
        title: 'Tabla de usuarios',
        description: 'Cada fila muestra el usuario con su <strong>rol actual</strong>, la <strong>sucursal asignada</strong> y la fecha de su último ingreso. Los usuarios suspendidos aparecen atenuados.',
        element: '[data-tour="usuarios-table"]',
        narration: 'La tabla lista todos los usuarios con rol, sucursal y estado de actividad.',
        side: 'top',
      },
      {
        title: 'Acciones por usuario',
        description: 'Por cada fila puedes: <strong>restablecer contraseña</strong> (envía email al usuario), <strong>suspender o restaurar acceso</strong>, y <strong>eliminar</strong> el usuario definitivamente. No puedes modificar tu propia cuenta.',
        element: '[data-tour="usuarios-acciones"]',
        narration: 'Restablece contraseña, suspende o elimina usuarios desde los botones de acción.',
        side: 'left',
      },
      {
        title: 'Crear nuevo usuario',
        description: 'Con <strong>"Alta de Usuario"</strong> registras un nuevo colaborador: email, contraseña inicial, nombre, rol y sucursal. El acceso queda activo de inmediato. Puedes asignar acceso a todas las sucursales si el rol lo permite.',
        element: '[data-tour="usuarios-nuevo-btn"]',
        narration: 'Alta de Usuario crea un acceso nuevo. El colaborador puede entrar al sistema de inmediato.',
        side: 'bottom',
      },
    ],
  },

  // ── Sucursales ─────────────────────────────────────────────────────────────
  'sucursales-gestion': {
    id: 'sucursales-gestion',
    title: 'Gestión de Sucursales',
    description: 'Crea y administra las sedes de tu negocio desde la Casa Matriz.',
    startRoute: '/configuracion/sucursales',
    estimatedMinutes: 2,
    allowedRoles: ['GERENTE'],
    steps: [
      {
        title: 'Panel de Sucursales',
        description: 'Aquí administras todas las <strong>sedes de tu negocio</strong>. Solo la Casa Matriz (HQ) puede crear, editar o desactivar sucursales. El botón <strong>"Nueva Sucursal"</strong> aparece solo cuando estás en HQ.',
        route: '/configuracion/sucursales',
        element: '[data-tour="sucursales-header"]',
        narration: 'Desde aquí administras todas las sedes del negocio.',
        side: 'bottom',
      },
      {
        title: 'Lista de sucursales',
        description: 'Cada tarjeta representa una sucursal. El <strong>punto verde</strong> indica que está activa; rojo si está inactiva. La insignia <strong>Sede Matriz</strong> marca la sucursal principal.',
        element: '[data-tour="sucursales-grid"]',
        narration: 'Cada tarjeta es una sucursal. El punto de color muestra si está activa.',
        side: 'top',
      },
      {
        title: 'Datos de la sucursal',
        description: 'Cada tarjeta muestra el <strong>nombre, dirección y teléfono</strong> de la sede. Haz clic en <strong>"Configuración"</strong> para editar los datos o cambiar el estado.',
        element: '[data-tour="sucursales-card"]',
        narration: 'La tarjeta muestra nombre, dirección y teléfono de cada sede.',
        side: 'bottom',
      },
      {
        title: 'Acciones por sucursal',
        description: 'Desde los botones de acción puedes: <strong>editar</strong> los datos, <strong>activar o desactivar</strong> la sede (excepto la HQ), y <strong>eliminar</strong> sucursales sin movimientos registrados.',
        element: '[data-tour="sucursales-actions"]',
        narration: 'Puedes editar, activar, desactivar o eliminar una sucursal desde aquí.',
        side: 'top',
      },
      {
        title: 'Crear nueva sucursal',
        description: 'Con el botón <strong>"Nueva Sucursal"</strong> abres el formulario para registrar una nueva sede: nombre, dirección, teléfono y tipo. El sistema asigna el código automáticamente.',
        element: '[data-tour="sucursales-nueva-btn"]',
        narration: 'El botón Nueva Sucursal abre el formulario de registro. El código lo asigna el sistema.',
        side: 'bottom',
      },
    ],
  },

  // ── Cotizaciones ───────────────────────────────────────────────────────────
  'cotizaciones-nueva': {
    id: 'cotizaciones-nueva',
    title: 'Crear una cotización',
    description: 'Genera un presupuesto para un cliente sin afectar el stock.',
    startRoute: '/cotizaciones/nueva',
    estimatedMinutes: 3,
    steps: [
      {
        title: 'Nueva Cotización',
        description: 'Una cotización es un <strong>presupuesto</strong>. No descuenta stock ni registra venta. Si el cliente acepta, la conviertes en venta con un clic y el stock se descuenta en ese momento.',
        element: '[data-tour="quot-products"]',
        narration: 'Una cotización es un presupuesto. No afecta el stock hasta convertirla en venta.',
        side: 'right',
      },
      {
        title: 'Buscar y agregar productos',
        description: 'Busca por nombre o código en la barra superior. Haz clic en cualquier producto para agregarlo a la cotización. Puedes aplicar <strong>descuentos por línea</strong> en el panel derecho.',
        element: '[data-tour="quot-search"]',
        narration: 'Busca y agrega los productos que necesitas cotizar.',
        side: 'bottom',
      },
      {
        title: 'Cliente y configuración',
        description: 'Selecciona el cliente (requerido), define los <strong>días de validez</strong> de la cotización, elige modo <strong>C/F</strong> (con factura) o <strong>S/F</strong> (sin factura), y agrega notas opcionales.',
        element: '[data-tour="quot-client"]',
        narration: 'Selecciona el cliente, la validez y el modo de facturación.',
        side: 'left',
      },
      {
        title: 'Generar cotización',
        description: 'Presiona <strong>Generar Cotización</strong> (o <kbd>F8</kbd>). El sistema imprime la proforma automáticamente y guarda la cotización en el historial. También puedes guardar offline si no hay conexión.',
        element: '[data-tour="quot-save"]',
        narration: 'Presiona Generar Cotización. El sistema imprime la proforma automáticamente.',
        side: 'top',
      },
      {
        title: 'Convertir a venta',
        description: 'Cuando el cliente acepta, ve al <strong>historial de cotizaciones</strong> (menú lateral → Cotizaciones), abre la proforma y haz clic en <strong>"Convertir a Venta"</strong>. Los productos pasan al POS automáticamente con los mismos precios.',
        narration: 'Si el cliente acepta, convierte la cotización en venta desde el historial con un clic.',
      },
    ],
  },

  'cotizaciones-historial': {
    id: 'cotizaciones-historial',
    title: 'Historial de cotizaciones',
    description: 'Revisa cotizaciones, ajusta filtros y crea nuevas proformas desde el historial.',
    startRoute: '/cotizaciones',
    estimatedMinutes: 3,
    steps: [
      {
        title: 'Módulo de Cotizaciones',
        description: 'Aquí ves el historial completo de cotizaciones y proformas. Puedes buscar, filtrar, exportar y generar nuevas proformas desde este panel.',
        route: '/cotizaciones',
        element: '[data-tour="cotizaciones-kpis"]',
        narration: 'Este es el historial de cotizaciones. Desde aquí puedes ver proformas, buscar y filtrar registros.',
        side: 'bottom',
      },
      {
        title: 'Buscar y filtrar',
        description: 'Usa el buscador y los filtros de fecha, estado, sede y vendedor para encontrar la cotización que necesitas de forma rápida.',
        element: '[data-tour="cotizaciones-filters"]',
        narration: 'Aquí puedes buscar y filtrar cotizaciones por fecha, estado y más.',
        side: 'bottom',
      },
      {
        title: 'Crear nueva proforma',
        description: 'Usa el botón <strong>"Nueva Proforma"</strong> para abrir el formulario de cotización. Es el punto de partida para generar un presupuesto sin afectar stock.',
        element: 'button[data-tour="cotizaciones-new-btn"]',
        narration: 'Presiona Nueva Proforma para crear una cotización nueva.',
        side: 'bottom',
      },
      {
        title: 'Abrir el formulario de cotización',
        description: 'Ahora estás en el formulario donde eliges productos, seleccionas cliente y generas la proforma. Busca el producto que quieres cotizar.',
        route: '/cotizaciones/nueva',
        element: '[data-tour="quot-search"]',
        narration: 'Busca el producto que quieres cotizar en el formulario de creación.',
        side: 'bottom',
      },
      {
        title: 'Seleccionar cliente y configuración',
        description: 'Elige al cliente y define la validez, modo C/F o S/F, y notas de la cotización antes de generar el documento.',
        element: '[data-tour="quot-client"]',
        narration: 'Selecciona al cliente y ajusta la configuración de la cotización.',
        side: 'left',
      },
      {
        title: 'Generar la cotización',
        description: 'Presiona <strong>Generar Cotización</strong> para guardar la proforma. Si estás offline, el sistema la guarda localmente y la sincroniza después.',
        element: '[data-tour="quot-save"]',
        narration: 'Presiona Generar Cotización para guardar la proforma.',
        side: 'top',
      },
      {
        title: 'Convertir a venta',
        description: 'Si el cliente acepta la cotización, vuelve al historial, abre el documento y usa <strong>"Convertir a Venta"</strong> para llevarlo al POS.',
        narration: 'Si la cotización es aceptada, conviértela en venta desde el historial.',
        side: 'top',
      },
    ],
  },

  // ── Onboarding completo (22 módulos) ────────────────────────────────────────
  'onboarding-completo': {
    id: 'onboarding-completo',
    title: 'Recorrido completo del sistema',
    description: 'Conoce todos los módulos de Renotech en una sola guía interactiva.',
    startRoute: '/perfil',
    estimatedMinutes: 8,
    steps: [
      {
        title: 'Tu perfil',
        description: 'Empieza aquí. Agrega tu <strong>foto</strong> y verifica tu nombre y datos de contacto. El sistema personaliza tus reportes y vistas con esta información.',
        narration: 'Tu perfil personaliza el sistema. Agrega tu foto y verifica tu nombre.',
      },
      {
        title: 'Panel de inicio',
        description: 'El <strong>dashboard</strong> muestra un resumen completo en tiempo real: ventas del día, stock crítico, posición financiera y actividad reciente. Es tu punto de partida cada vez que entras.',
        route: '/inicio',
        narration: 'El panel de inicio muestra el resumen del negocio en tiempo real.',
      },
      {
        title: 'Punto de Venta',
        description: 'El corazón del sistema. Aquí <strong>registras las ventas</strong>: busca el producto, agrégalo al carrito, aplica descuentos y cobra. Soporta pagos mixtos (efectivo + transferencia + crédito).',
        route: '/punto-de-venta',
        narration: 'El punto de venta es donde registras cada venta.',
      },
      {
        title: 'Ventas',
        description: 'Historial completo de todas las ventas realizadas. Puedes <strong>anular</strong> una venta, reimprimir el comprobante y ver el detalle de cada transacción.',
        route: '/ventas',
        narration: 'En Ventas consultas el historial y puedes anular o reimprimir comprobantes.',
      },
      {
        title: 'Inventario',
        description: 'Consulta el <strong>stock de cada sucursal</strong>, ajusta cantidades, añade nuevos productos al catálogo e importa masivamente desde Excel. Muestra alertas de stock bajo.',
        route: '/inventario',
        narration: 'El inventario muestra el stock de cada sucursal y permite ajustes.',
      },
      {
        title: 'Kardex',
        description: 'Registro cronológico de todos los <strong>movimientos de stock</strong>: entradas, salidas, ajustes y traspasos. Permite auditar cualquier cambio en el inventario.',
        route: '/kardex',
        narration: 'El kardex registra todos los movimientos de inventario.',
      },
      {
        title: 'Caja',
        description: 'Gestiona tu <strong>turno de caja</strong>: abre la sesión con un fondo inicial, registra gastos operativos y cierra el turno con el arqueo. El sistema compara lo declarado con los registros automáticamente.',
        route: '/caja',
        narration: 'En Caja abres y cierras tu turno y registras los gastos del día.',
      },
      {
        title: 'Pedidos',
        description: 'Gestiona los <strong>traspasos de mercancía entre sucursales</strong>. El encargado origen crea el pedido, lo empaca y lo despacha. El encargado destino lo recibe y confirma.',
        route: '/pedidos',
        narration: 'Pedidos gestiona los traspasos de mercancía entre sucursales.',
      },
      {
        title: 'Envíos',
        description: 'Seguimiento y despacho de los pedidos en tránsito. Muestra el estado de cada envío: <strong>pendiente, en camino o entregado</strong>. Incluye el transportista asignado.',
        route: '/envios',
        narration: 'Envíos hace el seguimiento de los pedidos en tránsito.',
      },
      {
        title: 'Clientes',
        description: 'El <strong>CRM</strong> del sistema. Registra clientes, consulta su historial de compras, gestiona créditos asignados y programa recordatorios de seguimiento.',
        route: '/clientes',
        narration: 'El módulo de Clientes es el CRM con historial y créditos.',
      },
      {
        title: 'Créditos',
        description: 'Gestiona los <strong>créditos otorgados a clientes</strong>: saldos pendientes, cuotas, abonos y cuentas en mora. Genera el estado de cuenta y los recordatorios de cobro.',
        route: '/creditos',
        narration: 'En Créditos gestionas las cuentas por cobrar a clientes.',
      },
      {
        title: 'Cotizaciones',
        description: 'Genera <strong>proformas y presupuestos en PDF</strong> para clientes. Una cotización aprobada se puede convertir directamente en venta con un solo clic.',
        route: '/cotizaciones',
        narration: 'Las cotizaciones generan proformas que se convierten en ventas.',
      },
      {
        title: 'Proveedores',
        description: 'Directorio de <strong>empresas proveedoras</strong>. Muestra el saldo de cada cuenta (deuda o a favor), historial de compras y los datos de contacto para reposición.',
        route: '/proveedores',
        narration: 'El directorio de proveedores muestra saldos y datos de contacto.',
      },
      {
        title: 'Compras',
        description: 'Registro de <strong>órdenes de compra</strong> a proveedores. Al recibir la mercancía, el sistema actualiza automáticamente el stock y la cuenta corriente del proveedor.',
        route: '/compras',
        narration: 'Las compras registran órdenes a proveedores y actualizan el stock.',
      },
      {
        title: 'Tesorería',
        description: 'Módulo exclusivo del gerente. Centraliza el <strong>control de cuentas bancarias y caja fuerte</strong>, transferencias internas, conciliación bancaria y configuración de alertas financieras.',
        route: '/tesoreria',
        narration: 'Tesorería centraliza el control de cuentas bancarias y caja fuerte.',
      },
      {
        title: 'Transportes',
        description: 'Gestiona el directorio de <strong>transportistas</strong> disponibles para los envíos entre sucursales: nombre, vehículo, zona de cobertura y tarifa.',
        route: '/transportes',
        narration: 'Transportes gestiona el directorio de transportistas para los envíos.',
      },
      {
        title: 'Auditoría',
        description: 'Panel de <strong>alertas y logs de eventos</strong> del sistema. Detecta discrepancias en caja, anulaciones inusuales, accesos fuera de horario y otros indicadores de riesgo.',
        route: '/auditoria',
        narration: 'Auditoría muestra alertas y logs de eventos para detectar anomalías.',
      },
      {
        title: 'Estadísticas',
        description: 'Reportes avanzados conectados a <strong>BigQuery</strong>: evolución de ventas, ranking de productos, análisis por sucursal y tendencias de inventario. Exportable a Excel.',
        route: '/estadisticas',
        narration: 'Estadísticas ofrece reportes avanzados conectados a BigQuery.',
      },
      {
        title: 'Gerencia',
        description: 'Panel de aprobaciones para la <strong>casa matriz</strong>: aprueba o rechaza descuentos fuera de política, ajustes de inventario cuantiosos y solicitudes de crédito especial.',
        route: '/gerencia',
        narration: 'Gerencia centraliza las aprobaciones y decisiones de la casa matriz.',
      },
      {
        title: 'Sucursales',
        description: 'Alta, baja y configuración de <strong>sedes</strong>. Define el tipo (MATRIZ o VENTA), dirección, responsable y los umbrales de stock y caja que aplican a cada sucursal.',
        route: '/configuracion/sucursales',
        narration: 'Sucursales gestiona el alta y configuración de cada sede.',
      },
      {
        title: 'Usuarios',
        description: 'Alta y baja de <strong>colaboradores</strong>. Asigna roles (GERENTE, ENCARGADO, VENDEDOR), vincula cada usuario a su sucursal y suspende accesos cuando sea necesario.',
        route: '/usuarios',
        narration: 'Usuarios gestiona los colaboradores, roles y accesos al sistema.',
      },
      {
        title: 'Configuración',
        description: 'Personaliza el sistema: <strong>identidad comercial</strong> (logo, nombre, RUC), tipo de cambio, mantenimiento programado y preferencias generales de la plataforma.',
        route: '/configuracion',
        narration: 'Configuración define la identidad comercial y las preferencias del sistema.',
      },
      {
        title: '¡Listo! Ya conoces Renotech',
        description: 'Has recorrido todos los módulos. Usa el botón <strong>?</strong> en cada página para ver la guía detallada de ese módulo. El asistente de IA también puede lanzar cualquier tour — solo escríbele.',
        narration: 'Has completado el recorrido. Usa el botón de ayuda en cada módulo para profundizar.',
      },
    ],
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// Mapeo módulo → tourId principal (sugerencia automática desde el chat)
// ─────────────────────────────────────────────────────────────────────────────
export const MODULE_TO_TOUR: Record<string, string> = {
  'onboarding':      'onboarding-completo',
  'recorrido':       'onboarding-completo',
  'tour inicial':    'onboarding-completo',
  'curso inicial':   'onboarding-completo',
  'inicio':          'inicio-dashboard',
  'dashboard':       'inicio-dashboard',
  'pos':             'pos-nueva-venta',
  'punto-de-venta':  'pos-nueva-venta',
  'venta':           'pos-nueva-venta',
  'ventas':          'ventas-ver-historial',
  'caja':            'caja-abrir-sesion',
  'inventario':      'inventario-consultar-stock',
  'stock':           'inventario-consultar-stock',
  'ajuste':          'inventario-ajuste-stock',
  'kardex':          'kardex-historial',
  'historial':       'kardex-historial',
  'envios':          'envios-crear-envio',
  'envío':           'envios-crear-envio',
  'recibir':         'envios-recibir-envio',
  'pedidos':         'pedidos-nuevo',
  'compras':         'compras-nueva-compra',
  'clientes':        'clientes-nuevo-cliente',
  'créditos':        'creditos-gestionar',
  'creditos':        'creditos-gestionar',
  'cuotas':          'creditos-gestionar',
  'estadisticas':    'estadisticas-dashboard',
  'estadísticas':    'estadisticas-dashboard',
  'tesoreria':       'tesoreria-overview',
  'tesorería':       'tesoreria-overview',
  'proveedores':     'proveedores-nuevo',
  'gerencia':        'gerencia-dashboard',
  'cotizaciones':    'cotizaciones-historial',
  'auditoria':       'auditoria-consultar',
  'auditoría':       'auditoria-consultar',
  'configuracion':   'configuracion-general',
  'configuración':   'configuracion-general',
  'config':          'configuracion-general',
  'ajustes':         'configuracion-general',
  'usuarios':        'usuarios-gestion',
  'usuario':         'usuarios-gestion',
  'colaboradores':   'usuarios-gestion',
  'accesos':         'usuarios-gestion',
  'sucursales':      'sucursales-gestion',
  'sucursal':        'sucursales-gestion',
  'sedes':           'sucursales-gestion',
};

export function getTourById(id: string): TourDefinition | undefined {
  return TOUR_DEFINITIONS[id];
}

export function getToursForRole(role: string | null): TourDefinition[] {
  return Object.values(TOUR_DEFINITIONS).filter(
    (t) => !t.allowedRoles || (role && t.allowedRoles.includes(role))
  );
}
