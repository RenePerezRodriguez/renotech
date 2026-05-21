'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ConfigService } from '@/services/ConfigService';
import { CurrencyService } from '@/services/CurrencyService';
import { AppConfig } from '@/types';
import { useBranch } from './BranchContext';
import { useAuth } from './AuthContext';

interface ConfigContextType {
    config: AppConfig | null;
    loading: boolean;
    refreshConfig: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType>({
    config: null,
    loading: true,
    refreshConfig: async () => {},
});

export const useConfig = () => useContext(ConfigContext);

export function ConfigProvider({ children }: { children: ReactNode }) {
    const { currentBranch, loading: branchLoading } = useBranch();
    const { user, loading: authLoading } = useAuth();
    const [config, setConfig] = useState<AppConfig | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshConfig = useCallback(async () => {
        if (branchLoading || authLoading) return;
        if (!user) { setLoading(false); return; }
        
        setLoading(true);
        try {
            const fetched = await ConfigService.getConfig(currentBranch?.id);
            if (fetched) {
                setConfig(fetched);
            }
        } catch (error) {
            console.error('Error fetching config:', error);
        } finally {
            setLoading(false);
        }
    }, [currentBranch?.id, branchLoading, authLoading, user]);

    useEffect(() => {
        refreshConfig();
    }, [refreshConfig]);

    // Auto-sync exchange rate from BCB when mode is AUTO
    useEffect(() => {
        if (!config || config.exchangeRateMode !== 'AUTO') return;

        let cancelled = false;
        CurrencyService.fetchLatestRateFromAPI().then(rate => {
            if (cancelled || !rate || rate === config.exchangeRate) return;
            CurrencyService.updateExchangeRate(rate, 'AUTO').then(() => {
                setConfig(prev => prev ? { ...prev, exchangeRate: rate } : prev);
            });
        });

        return () => { cancelled = true; };
    }, [config?.exchangeRateMode]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <ConfigContext.Provider value={{ config, loading, refreshConfig }}>
            {children}
        </ConfigContext.Provider>
    );
}
