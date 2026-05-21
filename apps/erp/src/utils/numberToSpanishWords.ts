/**
 * Conversor de números a letras en español para moneda (Bolivianos)
 * Ejemplo: 580 -> "QUINIENTOS OCHENTA 00/100 BOLIVIANOS"
 */

const Unidades = (num: number): string => {
    switch (num) {
        case 1: return "UN";
        case 2: return "DOS";
        case 3: return "TRES";
        case 4: return "CUATRO";
        case 5: return "CINCO";
        case 6: return "SEIS";
        case 7: return "SIETE";
        case 8: return "OCHO";
        case 9: return "NUEVE";
    }
    return "";
};

const Decenas = (num: number): string => {
    const decena = Math.floor(num / 10);
    const unidad = num - (decena * 10);

    switch (decena) {
        case 1:
            switch (unidad) {
                case 0: return "DIEZ";
                case 1: return "ONCE";
                case 2: return "DOCE";
                case 3: return "TRECE";
                case 4: return "CATORCE";
                case 5: return "QUINCE";
                default: return "DIECI" + Unidades(unidad);
            }
        case 2:
            if (unidad === 0) return "VEINTE";
            return "VEINTI" + Unidades(unidad);
        case 3: return DecenasY("TREINTA", unidad);
        case 4: return DecenasY("CUARENTA", unidad);
        case 5: return DecenasY("CINCUENTA", unidad);
        case 6: return DecenasY("SESENTA", unidad);
        case 7: return DecenasY("SETENTA", unidad);
        case 8: return DecenasY("OCHENTA", unidad);
        case 9: return DecenasY("NOVENTA", unidad);
        case 0: return Unidades(unidad);
    }
    return "";
};

const DecenasY = (strSin: string, numUnidad: number): string => {
    if (numUnidad > 0) return strSin + " Y " + Unidades(numUnidad);
    return strSin;
};

const Centenas = (num: number): string => {
    const centenas = Math.floor(num / 100);
    const decenas = num - (centenas * 100);

    switch (centenas) {
        case 1:
            if (decenas > 0) return "CIENTO " + Decenas(decenas);
            return "CIEN";
        case 2: return "DOSCIENTOS " + Decenas(decenas);
        case 3: return "TRESCIENTOS " + Decenas(decenas);
        case 4: return "CUATROCIENTOS " + Decenas(decenas);
        case 5: return "QUINIENTOS " + Decenas(decenas);
        case 6: return "SEISCIENTOS " + Decenas(decenas);
        case 7: return "SETECIENTOS " + Decenas(decenas);
        case 8: return "OCHOCIENTOS " + Decenas(decenas);
        case 9: return "NOVECIENTOS " + Decenas(decenas);
    }
    return Decenas(decenas);
};

const Seccion = (num: number, divisor: number, strSingular: string, strPlural: string): string => {
    const cientos = Math.floor(num / divisor);

    if (cientos > 0) {
        if (cientos > 1) {
            return Centenas(cientos).trim() + " " + strPlural;
        }
        return strSingular;
    }

    return "";
};

const Miles = (num: number): string => {
    const divisor = 1000;
    const resto = num - (Math.floor(num / divisor) * divisor);

    const strMiles = Seccion(num, divisor, "MIL", "MIL");
    const strCentenas = Centenas(resto);

    if (strMiles === "") return strCentenas;
    return (strMiles + " " + strCentenas).trim();
};

const Millones = (num: number): string => {
    const divisor = 1000000;
    const resto = num - (Math.floor(num / divisor) * divisor);

    const strMillones = Seccion(num, divisor, "UN MILLON", "MILLONES");
    const strMiles = Miles(resto);

    if (strMillones === "") return strMiles;
    return (strMillones + " " + strMiles).trim();
};

export const numberToSpanishWords = (num: number): string => {
    if (num === 0) return "CERO";
    
    const data = {
        numero: num,
        enteros: Math.floor(num),
        centavos: Math.round(((num - Math.floor(num)) * 100)),
        letrasCentavos: "",
        letrasMoneda: "BOLIVIANOS"
    };

    if (data.centavos < 10) {
        data.letrasCentavos = "0" + data.centavos;
    } else {
        data.letrasCentavos = data.centavos.toString();
    }

    if (data.enteros === 0) {
        return `CERO ${data.letrasCentavos}/100 ${data.letrasMoneda}`;
    }

    const letras = Millones(data.enteros);
    return `${letras} ${data.letrasCentavos}/100 ${data.letrasMoneda}`.toUpperCase();
};
