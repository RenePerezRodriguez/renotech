// Utility for parsing product names

const vehicleKeywords = [
  'RENAULT', 'NISSAN', 'MAZDA', 'FORD', 'PEUGEOT', 'CITROEN', 'FIAT', 'JEEP', 'SUZUKI', 'CHERY', 
  'AUDI', 'HAVAL', 'HYUNDAI', 'KIA', 'VOLKSWAGEN', 'CHEVROLET', 'TOYOTA', 'MITSUBISHI', 'LAND ROVER', 'JAGUAR',
  'DUSTER', 'SANDERO', 'LOGAN', 'STEPWAY', 'STEAPWAY', 'KANGOO', 'KANGO', 'CLIO', 'SYMBOL', 'CAPTUR',
  'OROCH', 'KWID', 'MEGANE', 'LAGUNA', 'SCIENIC', 'SCENIC', 'KOLEOS', 'RANGER', 'ESCAPE', 'TERRANO', 
  'CX5', 'CX3', 'BT-50', 'BT50', 'FOCUS', 'ALASKAN', 'MASTER', 'TRAFIC',
  'K4M', 'K7M', 'F4R', 'H4M', 'B4D',
  '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
];

/**
 * Parses a product name to extract technical descriptions, vehicle compatibility,
 * and clean up abbreviations in parentheses.
 * 
 * @param originalName The raw name from Excel (often in 'DESCRIPCION' column)
 * @param existingDesc Any existing description to append to
 * @returns { baseName: string, newDesc: string }
 */
export function parseProductName(originalName: string, existingDesc: string = ''): { baseName: string, newDesc: string } {
    let baseName = (originalName || '').trim();
    const newDescParts: string[] = [];

    // 1. Extraer TODOS los paréntesis (incluyendo L, R, LH, RH)
    const parenRegex = /\((.*?)\)/g;
    let match;
    while ((match = parenRegex.exec(baseName)) !== null) {
        if (match[1] && match[1].trim()) {
            let pContent = match[1].trim();
            // Transformar abreviaturas comunes
            const upper = pContent.toUpperCase();
            if (upper === 'L') pContent = 'Izquierdo';
            else if (upper === 'R') pContent = 'Derecho';
            else if (upper === 'LH') pContent = 'Lado Izquierdo';
            else if (upper === 'RH') pContent = 'Lado Derecho';
            
            newDescParts.push(pContent);
        }
    }
    // Remover paréntesis del nombre base
    baseName = baseName.replace(parenRegex, '').trim();

    // 2. Buscar palabras clave (marcas/modelos/motores)
    let earliestIndex = -1;
    const wordRegex = /[A-Z0-9\-/]+/gi;
    let wordMatch;
    
    // Reset regex index for safety
    wordRegex.lastIndex = 0;
    while ((wordMatch = wordRegex.exec(baseName)) !== null) {
        const fullMatch = wordMatch[0].toUpperCase();
        const subWords = fullMatch.split(/[-/]/);
        const hasKeyword = subWords.some(sw => {
            const cleanSw = sw.replace(/[^A-Z0-9]/g, '');
            return cleanSw.length > 1 && vehicleKeywords.includes(cleanSw);
        });

        if (hasKeyword) {
            const matchIndex = wordMatch.index;
            // No cortamos si la palabra clave es literalmente la primera palabra corta
            if (matchIndex > 1 && (earliestIndex === -1 || matchIndex < earliestIndex)) {
                earliestIndex = matchIndex;
            }
        }
    }

    if (earliestIndex !== -1 && earliestIndex > 2) {
        const extractedDesc = baseName.substring(earliestIndex).trim();
        baseName = baseName.substring(0, earliestIndex).trim();
        newDescParts.push(extractedDesc.replace(/^[-/\s]+/, '').trim());
    }

    // 3. Limpieza final del baseName
    baseName = baseName.replace(/[-/\s]+$/, '').trim();
    baseName = baseName.replace(/\s+/g, ' '); 

    // 4. Limpieza final de la Descripción
    let finalDesc = newDescParts.filter(p => p).join(', ');
    finalDesc = finalDesc.replace(/\s+/g, ' ').replace(/, \s*,/g, ',').trim();

    let combinedDesc = existingDesc || '';
    if (finalDesc) {
        if (combinedDesc && !combinedDesc.includes(finalDesc)) {
            // Check if we already have compatibility section
            if (!combinedDesc.includes('Compatibilidad:')) {
                combinedDesc = `${combinedDesc}\n\nCompatibilidad: ${finalDesc}`.trim();
            } else {
                combinedDesc = `${combinedDesc}, ${finalDesc}`.trim();
            }
        } else if (!combinedDesc) {
            combinedDesc = finalDesc;
        }
    }

    return { baseName, newDesc: combinedDesc };
}
