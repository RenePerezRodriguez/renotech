import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { BranchService } from './BranchService';
import { AppConfig } from '@/types';
import type { Account } from '@/types/treasury';

const CONFIG_DOC_ID = 'general_settings';
const COLLECTION_NAME = 'config';

async function getAccountSafe(id?: string | null): Promise<Account | null> {
    if (!id) return null;
    try {
        const snap = await getDoc(doc(db, 'accounts', id));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() } as Account;
    } catch {
        return null;
    }
}

/** Busca la primera cuenta BANK activa asignada a una sucursal cuando no hay bankAccountId explícito. */
async function findBankAccountForBranch(branchId: string): Promise<Account | null> {
    try {
        const q = query(
            collection(db, 'accounts'),
            where('branchIds', 'array-contains', branchId),
            where('type', '==', 'BANK'),
            where('isActive', '==', true)
        );
        const snap = await getDocs(q);
        if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() } as Account;
        return null;
    } catch {
        return null;
    }
}

export const ConfigService = {
    // Get Config (Global or Branch specific)
    getConfig: async (branchId?: string): Promise<AppConfig | null> => {
        try {
            if (branchId) {
            const branch = await BranchService.getById(branchId);
            const globalConfig = await ConfigService.getGlobalConfig();

            if (branch) {
                // Resolución LIVE de datos bancarios: si la sucursal tiene un
                // bankAccountId / walletAccountId guardado, leemos los campos
                // directamente del documento `/accounts/{id}` para que cualquier
                // edición de la cuenta (número, titular, QR) se refleje en
                // recibos al instante, sin requerir re-guardar Caja → Ajustes.
                const recv = branch.config?.receiptDetails;
                const defaults = branch.config?.defaultAccounts;
                const bankId = recv?.bankAccountId || defaults?.TRANSFERENCIA || null;
                const walletId = recv?.walletAccountId || defaults?.QR || null;
                const [bankAccDirect, walletAcc] = await Promise.all([
                    getAccountSafe(bankId),
                    getAccountSafe(walletId),
                ]);
                // Si no hay ID explícito, auto-descubrir la primera cuenta BANK activa de la sucursal
                const bankAcc = bankAccDirect || (!bankId ? await findBankAccountForBranch(branchId) : null);
                // Fallback en cascada: live account → snapshot → globalConfig.
                // Usar account.name (nombre completo) como display primario, bankName como fallback.
                const bankName = bankAcc?.name || bankAcc?.bankName || recv?.bankName || globalConfig?.bankName || '';
                const accountNumber = bankAcc?.accountNumber || recv?.accountNumber || globalConfig?.accountNumber || '';
                const accountHolder = bankAcc?.accountHolder || recv?.accountHolder || globalConfig?.accountHolder || '';
                const accountType = bankAcc?.accountTypeLabel || recv?.accountTypeLabel || globalConfig?.accountType || '';
                const qrImageUrl = walletAcc?.qrImageUrl || bankAcc?.qrImageUrl || recv?.qrImageUrl || branch.qrImageUrl || globalConfig?.qrImageUrl || '';

                return {
                    ...globalConfig,
                    branchName: branch.name,
                    address: branch.address || globalConfig?.address || '',
                    phone: branch.phone || globalConfig?.phone || '',
                    email: branch.email || globalConfig?.email || '',
                    city: branch.city || globalConfig?.city || '',
                    currency: branch.config?.currency || globalConfig?.currency || 'BOB',
                    taxRate: branch.config?.taxRate ?? globalConfig?.taxRate ?? 0,
                    exchangeRate: globalConfig?.exchangeRate || 9.30, // BCB valor referencial venta
                    exchangeRateMode: globalConfig?.exchangeRateMode || 'MANUAL', // Phase 8
                    website: branch.website || globalConfig?.website || '',
                    nit: branch.nit || globalConfig?.nit || '',
                    bankName,
                    accountNumber,
                    accountHolder,
                    accountType,
                    qrImageUrl,
                } as AppConfig;
            }
        }
        return ConfigService.getGlobalConfig();
        } catch {
            return null;
        }
    },

    getGlobalConfig: async (): Promise<AppConfig | null> => {
        const docRef = doc(db, COLLECTION_NAME, CONFIG_DOC_ID);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
            return snapshot.data() as AppConfig;
        }
        return null;
    },

    // Save Config
    saveConfig: async (config: AppConfig, branchId?: string) => {
        if (branchId) {
            // Update branch metadata
            await BranchService.update(branchId, {
                name: config.branchName,
                address: config.address,
                phone: config.phone,
                email: config.email,
                city: config.city,
                website: config.website,
                nit: config.nit,
                qrImageUrl: config.qrImageUrl
            });

            // Update nested config fields separately to avoid losing other flags
            const docRef = doc(db, 'branches', branchId);
            await setDoc(docRef, {
                config: {
                    currency: config.currency,
                    taxRate: config.taxRate
                }
            }, { merge: true });

            // Exchange rate is global — always persist to global config doc
            if (config.exchangeRate || config.exchangeRateMode) {
                const globalRef = doc(db, COLLECTION_NAME, CONFIG_DOC_ID);
                await setDoc(globalRef, {
                    exchangeRate: config.exchangeRate,
                    exchangeRateMode: config.exchangeRateMode
                }, { merge: true });
            }
        } else {
            // Save global config
            const docRef = doc(db, COLLECTION_NAME, CONFIG_DOC_ID);
            await setDoc(docRef, config, { merge: true });

            // Sync contact/address fields to HQ branch so PDFs stay consistent
            try {
                const hqBranch = await BranchService.getHQ();
                if (hqBranch?.id) {
                    const syncData = {
                        address: config.address,
                        phone: config.phone,
                        email: config.email,
                        city: config.city,
                        website: config.website,
                        nit: config.nit,
                        qrImageUrl: config.qrImageUrl,
                    };
                    await BranchService.update(hqBranch.id, syncData);
                }
            } catch (syncError) {
                // HQ sync failed silently - non-critical
            }
        }
    }
};
