import { ConfigService } from './ConfigService';

/**
 * CurrencyService (Industrial Master - Phase 8)
 * Gestiona el tipo de cambio real (Bs <-> USD) con lógica dual:
 * 1. MANUAL: Definido estáticamente por la administración.
 * 2. AUTO: Sincronizado con BCB valor referencial (venta).
 */
export const CurrencyService = {
    /**
     * Obtiene la tasa de cambio vigente.
     * Si el modo es AUTO y ha pasado cierto tiempo, intenta actualizarla.
     */
    async getExchangeRate(): Promise<number> {
        const config = await ConfigService.getGlobalConfig();
        if (!config) return 9.30; // Fallback referencial BCB

        if (config.exchangeRateMode === 'AUTO') {
            try {
                const latestRate = await this.fetchLatestRateFromAPI();
                if (latestRate && latestRate !== config.exchangeRate) {
                    await this.updateExchangeRate(latestRate, 'AUTO');
                    return latestRate;
                }
            } catch (error) {
                console.error('[CurrencyService] Error fetching rate, using manual fallback:', error);
            }
        }

        return config.exchangeRate || 9.30;
    },

    /**
     * Actualiza el tipo de cambio en la configuración global.
     */
    async updateExchangeRate(rate: number, mode: 'MANUAL' | 'AUTO'): Promise<void> {
        const config = await ConfigService.getGlobalConfig();
        if (!config) return;

        await ConfigService.saveConfig({
            ...config,
            exchangeRate: Number(rate.toFixed(2)),
            exchangeRateMode: mode,
            updatedAt: new Date()
        });
    },

    /**
     * Obtiene el valor referencial de venta del BCB via API interna.
     * Prioridad: BCB scraping → exchangerate-api → null.
     */
    async fetchLatestRateFromAPI(): Promise<number | null> {
        try {
            const res = await fetch('/api/exchange-rate');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (typeof data.venta === 'number' && data.venta > 1) {
                return data.venta;
            }
            return null;
        } catch (error) {
            console.error('[CurrencyService] API fetch failed:', error);
            return null;
        }
    }
};
