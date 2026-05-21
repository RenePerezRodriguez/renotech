import { NextResponse } from 'next/server';

/**
 * GET /api/exchange-rate
 * Obtiene el valor referencial del dólar (BCB) mediante scraping.
 * Fallback: exchangerate-api.com (tasa oficial, no referencial).
 * Cache: 4 horas (el BCB actualiza una vez al día).
 */

let cache: { compra: number; venta: number; timestamp: number } | null = null;
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 horas

async function fetchFromBCB(): Promise<{ compra: number; venta: number } | null> {
    try {
        const res = await fetch('https://www.bcb.gob.bo', {
            headers: { 'User-Agent': 'Renotech-POS/1.0' },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return null;
        const html = await res.text();

        // Buscar la sección "valor referencial del dólar"
        const section = html.match(/valor\s+referencial\s+del\s+d[oó]lar[\s\S]{0,2000}/i);
        if (!section) return null;

        // Extraer valores: "Compra" seguido de bcb-val con número, luego "Venta"
        const compraMatch = section[0].match(/compra[\s\S]{0,300}?bcb-val[^>]*>\s*([\d]+[,.][\d]+)/i);
        const ventaMatch = section[0].match(/venta[\s\S]{0,300}?bcb-val[^>]*>\s*([\d]+[,.][\d]+)/i);

        if (!compraMatch || !ventaMatch) return null;

        const compra = parseFloat(compraMatch[1].replace(',', '.'));
        const venta = parseFloat(ventaMatch[1].replace(',', '.'));

        if (isNaN(compra) || isNaN(venta) || compra < 1 || venta < 1) return null;
        return { compra, venta };
    } catch {
        return null;
    }
}

async function fetchFromExchangeRateAPI(): Promise<{ compra: number; venta: number } | null> {
    try {
        const API_KEY = 'af6f0b4de605f3925cb78727';
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/pair/USD/BOB`, {
            signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.result === 'success' && typeof data.conversion_rate === 'number') {
            return { compra: data.conversion_rate, venta: data.conversion_rate };
        }
        return null;
    } catch {
        return null;
    }
}

export async function GET() {
    // Servir desde cache si es válido
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
        return NextResponse.json({
            compra: cache.compra,
            venta: cache.venta,
            source: 'cache',
        });
    }

    // Primario: BCB (valor referencial real del mercado)
    const bcb = await fetchFromBCB();
    if (bcb) {
        cache = { ...bcb, timestamp: Date.now() };
        return NextResponse.json({ ...bcb, source: 'BCB' });
    }

    // Fallback: exchangerate-api (tasa oficial)
    const api = await fetchFromExchangeRateAPI();
    if (api) {
        cache = { ...api, timestamp: Date.now() };
        return NextResponse.json({ ...api, source: 'exchangerate-api' });
    }

    // Último recurso: cache expirado o hardcoded
    if (cache) {
        return NextResponse.json({
            compra: cache.compra,
            venta: cache.venta,
            source: 'stale-cache',
        });
    }

    return NextResponse.json({ compra: 9.11, venta: 9.30, source: 'hardcoded' });
}
