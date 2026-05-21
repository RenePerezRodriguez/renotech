/**
 * TreasuryConfigService — configuración global de tesorería.
 * Doc único: treasury_config/global
 */
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { TreasuryConfig } from '@/types/treasury';
import { logAdminAction } from '@/lib/audit';

const DOC_PATH = ['treasury_config', 'global'] as const;

const DEFAULTS: TreasuryConfig = {
    id: 'global',
    cashierExpenseLimit: 100,
    cashierManualEgresoLimit: 100,
    discrepancyTolerance: 1,
    discrepancyMedium: 20,
    discrepancyHigh: 100,
    sessionAlertHours: 8,
    sessionForceCloseHours: 24,
    requireBankRefForDigital: false,
    requireExpenseReceipt: false,
    autoReconcileWithinDays: 7,
};

let cache: TreasuryConfig | null = null;
let cacheAt = 0;
const CACHE_TTL = 60_000; // 60s

export const TreasuryConfigService = {
    async get(force = false): Promise<TreasuryConfig> {
        if (!force && cache && (Date.now() - cacheAt) < CACHE_TTL) return cache;
        const snap = await getDoc(doc(db, ...DOC_PATH));
        if (!snap.exists()) {
            // Auto-seed con defaults — solo GERENTE puede escribir (rules);
            // cajeros caen al fallback in-memory sin error pero LOGUEAMOS la causa
            // para que el gerente sepa que falta crear la config.
            try {
                await setDoc(doc(db, ...DOC_PATH), { ...DEFAULTS, updatedAt: serverTimestamp() });
            } catch (e) {
                // permission-denied esperado para no-gerentes; otros errores también son tolerados
                // pero los reportamos para diagnóstico.
                const code = (e as { code?: string }).code;
                if (code !== 'permission-denied') {
                    console.warn('[TreasuryConfig] seed fallido (no-gerente o sin red):', code || e);
                }
            }
            cache = { ...DEFAULTS };
        } else {
            cache = { id: 'global', ...DEFAULTS, ...snap.data() } as TreasuryConfig;
        }
        cacheAt = Date.now();
        return cache;
    },

    async update(patch: Partial<TreasuryConfig>, gerente: { uid: string; name: string }): Promise<void> {
        const clean: Partial<TreasuryConfig> = { ...patch };
        delete clean.id;
        // Sanitizar: límites no negativos, umbrales coherentes
        if (clean.cashierExpenseLimit != null && clean.cashierExpenseLimit < 0) throw new Error('Límite no puede ser negativo');
        if (clean.cashierManualEgresoLimit != null && clean.cashierManualEgresoLimit < 0) throw new Error('Límite no puede ser negativo');
        if (clean.discrepancyTolerance != null && clean.discrepancyTolerance < 0) throw new Error('Tolerancia no puede ser negativa');
        if (clean.discrepancyMedium != null && clean.discrepancyTolerance != null && clean.discrepancyMedium < clean.discrepancyTolerance) {
            throw new Error('Umbral medio debe ser >= tolerancia');
        }
        if (clean.discrepancyHigh != null && clean.discrepancyMedium != null && clean.discrepancyHigh < clean.discrepancyMedium) {
            throw new Error('Umbral alto debe ser >= umbral medio');
        }
        await setDoc(doc(db, ...DOC_PATH), {
            ...clean,
            updatedAt: serverTimestamp(),
            updatedBy: gerente.uid,
        }, { merge: true });
        cache = null;

        await logAdminAction(gerente.uid, gerente.name, 'UPDATE_TREASURY_CONFIG', 'global', 'HQ',
            `Config actualizada: ${Object.keys(clean).join(', ')}`);
    },

    /** Limpia caché (útil tras updates externos) */
    invalidate() { cache = null; cacheAt = 0; },
};
