import { normalizeText } from '@/utils/normalize';

/**
 * Auto-categorization utility for auto parts products.
 * Analyzes product names and assigns appropriate categories based on keyword patterns.
 */

// Category definitions with their associated keywords (expanded based on real product data)
const CATEGORY_KEYWORDS: Record<string, string[]> = {
    'Motor': [
        // Componentes internos
        'piston', 'pistón', 'anillo', 'biela', 'cigüeñal', 'ciguenal',
        'arbol de leva', 'arbol de levas', 'árbol de levas',
        'válvula', 'valvula', 'junta', 'empaque', 'culata', 'bloque',
        'camiseta', 'camisa', 'retenes', 'reten', 'retén', 'sello',
        'bomba de aceite', 'tapa de punterias', 'tapa punterías',
        'punteria', 'puntería', 'balancin', 'balancín', 'varilla',
        'tensor', 'cadena de tiempo', 'kit de motor', 'cadenero',
        'multiple', 'múltiple', 'escape', 'admision', 'admisión',
        'turbo', 'turbocompresor', 'intercooler', 'turbina',
        'volante de motor', 'volante motor', 'cremallera de motor',
        'tapa de valvula', 'tapa válvulas', 'tapa de cilindro',
        'damper', 'polea cigüeñal', 'polea ciguenal',
        // Encendido
        'bobina de encendido', 'bobina', 'bujia', 'bujía', 'bujías',
        'cable de bujia', 'cable bujía', 'cables de bujia',
        'distribuidor', 'rotor', 'platino', 'condensador encendido',
        'modulo de encendido', 'módulo encendido',
        // Carburación/Inyección
        'carburador', 'inyector', 'riel de inyectores', 'regulador de presion',
        'cuerpo de aceleracion', 'cuerpo aceleración', 'mariposa',
        'sensor map', 'sensor maf', 'sensor tps', 'sensor ckp', 'sensor cmp',
        'valvula iac', 'válvula iac'
    ],
    'Lubricantes': [
        'aceite', 'lubricante', 'grasa', 'aditivo', 'liquido', 'líquido',
        'refrigerante', 'anticongelante', 'coolant', 'atf', 'transmision automatica'
    ],
    'Suspensión': [
        'amortiguador', 'muelle', 'espiral', 'resorte', 'buje', 'bujes',
        'rotula', 'rótula', 'barra estabilizadora', 'estabilizador',
        'terminal', 'brazo de suspension', 'brazo suspension', 'brazo inferior', 'brazo superior',
        'horquilla', 'soporte de motor', 'base de amortiguador', 'base amortiguador',
        'tope', 'goma de suspension', 'fuelle', 'guardapolvo',
        'cremallera direccion', 'caja de direccion', 'caja direccion',
        'punta de eje', 'puntera', 'suspension', 'suspensión',
        'meseta', 'tijera', 'parrilla de suspension', 'parrilla suspension',
        'bieleta', 'link estabilizador', 'varilla estabilizadora',
        'silent block', 'silentblock', 'cauchos', 'caucho suspension'
    ],
    'Dirección': [
        'direccion', 'dirección', 'columna de direccion', 'columna direccion',
        'bomba de direccion', 'bomba direccion', 'bomba hidraulica',
        'caja de direccion', 'cremallera de direccion', 'cremallera direccion',
        'volante', 'timon', 'manguera de direccion', 'deposito direccion'
    ],
    'Frenos': [
        'pastilla', 'pastillas', 'freno', 'disco de freno', 'disco freno',
        'tambor', 'zapata', 'caliper', 'mordaza', 'pinza de freno',
        'cilindro de freno', 'cilindro maestro', 'bomba de freno',
        'manguera de freno', 'liquido de freno', 'líquido freno',
        'sensor abs', 'abs', 'servofreno', 'booster', 'pedal de freno',
        'campana', 'regulador de freno', 'cable de freno', 'freno de mano',
        'kit de freno', 'reparacion caliper', 'reparación mordaza'
    ],
    'Eléctrico': [
        'alternador', 'motor de arranque', 'arranque', 'marcha',
        'batería', 'bateria', 'bornes', 'terminal bateria',
        'fusible', 'caja de fusibles', 'portafusible',
        'relay', 'relé', 'relevador',
        'foco', 'bombillo', 'led', 'faro', 'farol', 'luz', 'lámpara', 'lampara',
        'direccional', 'stop', 'neblinero',
        'sensor', 'sensores', 'modulo', 'módulo', 'computadora', 'ecu', 'pcm',
        'tablero', 'cluster', 'velocimetro', 'velocímetro',
        'switch', 'interruptor', 'boton', 'botón',
        'encendedor', 'regulador de voltaje', 'regulador',
        'cable', 'cables', 'arnés', 'arnes', 'ramal', 'instalacion electrica',
        'conector', 'socket', 'ficha', 'enchufe',
        'electroventilador', 'ventilador electrico',
        'claxon', 'bocina', 'corneta', 'pito',
        'radio', 'pantalla', 'estereo', 'estéreo', 'parlante', 'altavoz',
        'camara', 'cámara', 'sensor retroceso', 'sensor reversa',
        'motor electrico', 'motor eléctrico', 'motor de ventana', 'elevador',
        'motor limpiaparabrisas', 'limpiaparabrisas', 'pluma', 'plumas', 'escobilla',
        'capuchon', 'capuchón', 'aislador', 'terminal electrico'
    ],
    'Refrigeración': [
        'radiador', 'termostato', 'bomba de agua', 'waterpump',
        'manguera de agua', 'manguera radiador', 'manguera refrigeracion',
        'deposito', 'depósito', 'tanque de agua', 'reservorio',
        'ventilador', 'aspas', 'fan clutch', 'embrague ventilador',
        'enfriador', 'cooler', 'enfriador de aceite',
        'tapa de radiador', 'tapa radiador', 'tapon radiador',
        'sensor de temperatura', 'bulbo', 'termocontacto', 'valvula termostatica'
    ],
    'Aire Acondicionado': [
        'aire acondicionado', 'a/c', 'ac', 'climatizador',
        'compresor de aire', 'compresor ac', 'compresor a/c',
        'condensador ac', 'condensador aire',
        'evaporador', 'evaporizer',
        'filtro de polen', 'filtro cabina', 'filtro de cabina', 'filtro habitaculo',
        'resistencia de blower', 'blower', 'soplador',
        'calefaccion', 'calefacción', 'calentador',
        'valvula expansion', 'válvula expansión', 'orificio',
        'manguera ac', 'manguera aire acondicionado', 'presostato'
    ],
    'Transmisión': [
        'caja de cambios', 'transmision', 'transmisión', 'caja automatica', 'caja manual',
        'embrague', 'clutch', 'disco de clutch', 'disco embrague',
        'plato de presion', 'plato presión', 'prensa',
        'collarin', 'collarín', 'balinera de clutch', 'rodamiento clutch',
        'sincronizador', 'sincro', 'kit sincronizador',
        'eje', 'flecha', 'semieje', 'palier',
        'diferencial', 'corona', 'piñón', 'pinon', 'satelite', 'satélite',
        'cardan', 'cardán', 'cruceta', 'yugo',
        'homocinética', 'homocinetica', 'junta homocinetica', 'junta homocinética',
        'tripoide', 'tripode', 'tulipan', 'tulipán',
        'guardapolvo transmision', 'fuelle transmision',
        'palanca de cambios', 'selector', 'varillaje',
        'convertidor', 'torque converter'
    ],
    'Carrocería': [
        'parachoques', 'defensa', 'bumper', 'paragolpes',
        'guardafango', 'guardabarro', 'fender', 'tapabarros', 'guardapolvo',
        'capó', 'capo', 'cofre', 'bonete',
        'puerta', 'compuerta', 'porton', 'portón',
        'espejo', 'retrovisor', 'mirror',
        'vidrio', 'cristal', 'parabrisas', 'parabrisa', 'windshield',
        'luneta', 'medallon', 'medallón',
        'manija', 'chapa', 'cerradura', 'seguro',
        'bisagra', 'gozne',
        'moldura', 'emblema', 'logo', 'insignia', 'letras',
        'spoiler', 'aleron', 'alerón',
        'tapa', 'cajuela', 'maletero', 'baul', 'baúl',
        'carroceria', 'carrocería', 'body',
        'estribo', 'pisa pie', 'pisapie',
        'rejilla', 'parrilla', 'grill', 'mascara', 'máscara'
    ],
    'Filtros': [
        'filtro de aceite', 'filtro aceite', 'oil filter',
        'filtro de aire', 'filtro aire', 'air filter', 'depurador',
        'filtro de combustible', 'filtro combustible', 'fuel filter',
        'filtro de gasolina', 'filtro gasolina',
        'filtro diesel', 'filtro de diesel', 'separador de agua',
        'filtro de polen', 'filtro cabina', 'filtro de cabina', 'cabin filter',
        'filtro hidraulico', 'filtro hidráulico',
        'filtro', 'elemento filtrante', 'cartucho filtro'
    ],
    'Combustible': [
        'bomba de gasolina', 'bomba gasolina', 'bomba combustible', 'fuel pump',
        'tanque de gasolina', 'tanque combustible', 'deposito combustible',
        'flotador', 'aforador', 'nivel combustible',
        'manguera combustible', 'linea de combustible', 'línea combustible',
        'regulador de presion', 'regulador presión combustible',
        'inyector', 'inyectores', 'tobera',
        'riel de inyectores', 'riel inyector', 'rampa inyectores',
        'valvula check', 'válvula check combustible',
        'tapa de gasolina', 'tapa tanque', 'tapon gasolina'
    ],
    'Ruedas': [
        'llanta', 'rin', 'aro', 'rueda', 'neumatico', 'neumático', 'caucho',
        'tapa de rin', 'tapacubo', 'copa',
        'tuerca de rueda', 'birlo', 'tornillo rueda',
        'esparrago', 'espárrago',
        'valvula de llanta', 'válvula neumático',
        'balanceador', 'contrapeso', 'plomo'
    ],
    'Correas': [
        'correa', 'banda', 'faja', 'belt',
        'correa de tiempo', 'banda de tiempo', 'timing belt',
        'correa de accesorios', 'banda de accesorios', 'serpentine',
        'correa de alternador', 'banda alternador',
        'correa de aire', 'banda aire acondicionado',
        'polea', 'tensor', 'tensioner', 'rodillo tensor',
        'kit de tiempo', 'kit distribucion', 'kit distribución'
    ],
    'Rodamientos': [
        'rodamiento', 'balinera', 'balero', 'cojinete', 'bearing',
        'rodamiento de rueda', 'rodamiento rueda', 'wheel bearing',
        'kit de rodamiento', 'kit rodamiento',
        'pista', 'race', 'jaula'
    ],
    'Escape': [
        'escape', 'mofle', 'silenciador', 'muffler',
        'catalizador', 'convertidor catalitico', 'convertidor catalítico',
        'resonador', 'tubo de escape', 'multiple de escape', 'múltiple escape',
        'empaque escape', 'junta escape', 'donut',
        'abrazadera escape', 'colgador escape', 'soporte escape',
        'sensor de oxigeno', 'sensor oxígeno', 'sonda lambda', 'o2 sensor'
    ],
    'Accesorios': [
        'accesorio', 'accesorios', 'adaptador', 'adaptadores',
        'soporte', 'base', 'bracket', 'montura',
        'abrazadera', 'clamp', 'grampa',
        'perno', 'tornillo', 'tuerca', 'arandela', 'hardware',
        'manguera', 'codo', 'conector', 'union', 'unión', 'tee',
        'protector', 'cobertor', 'cubierta', 'funda', 'cover',
        'kit', 'juego', 'set', 'surtido',
        'herramienta', 'tool', 'llave', 'extractor'
    ]
};

// Extended normalization for keyword matching (strips non-alphanumeric chars)
function normalizeForMatching(text: string): string {
    return normalizeText(text)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Attempts to auto-categorize a product based on its name.
 * Returns the detected category or an empty string if no match found.
 * 
 * @param productName - The name/description of the product
 * @returns The detected category or empty string
 */
export function autoCategorize(productName: string): string {
    if (!productName || typeof productName !== 'string') {
        return '';
    }

    const normalizedName = normalizeForMatching(productName);

    // Check each category's keywords - longer keywords first for better matching
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        // Sort keywords by length (descending) to match longer, more specific terms first
        const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);

        for (const keyword of sortedKeywords) {
            const normalizedKeyword = normalizeForMatching(keyword);

            // Check if the product name contains the keyword
            if (normalizedName.includes(normalizedKeyword)) {
                return category;
            }
        }
    }

    // No match found - return empty string (not 'Otros')
    return '';
}

/**
 * Batch categorization for multiple products
 * Useful for import operations
 */
export function autoCategorizeProducts(products: { nombre: string; categoria?: string }[]): void {
    for (const product of products) {
        // Only auto-categorize if no category is set
        if (!product.categoria || product.categoria === 'Otros' || product.categoria.trim() === '') {
            product.categoria = autoCategorize(product.nombre);
        }
    }
}
