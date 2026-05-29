import { db, storage } from '@/lib/firebase';
import { 
    collection, 
    doc, 
    serverTimestamp, 
    getDocs, 
    getDoc, 
    query, 
    runTransaction, 
    writeBatch, 
    where, 
    limit,
    orderBy,
    Timestamp,
    DocumentReference,
    DocumentData
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { logAdminAction } from '@/lib/audit';
import { Product, MasterProduct, InventoryMovement, FailedImportItem, ImportItem } from '@/types';
import { getBrandPrefix, generateProductCode } from '@/utils/productCodeGenerator';
import { MasterCatalogService } from './MasterCatalogService';
import { generateSearchTags } from '@/logic/search';
import { throwStandardError } from '@/utils/errorCodes';
import { midday, localDateStr } from '@/lib/utils';
const COLLECTION_NAME = 'productos'; // Inventario por sucursal
const MASTER_COLLECTION = 'catalogo_maestro'; 

/**
 * InventoryService
 * Responsable de la gestión de existencias físicas y precios por sucursal.
 * Implementa el "Virtual Join" con MasterCatalogService.
 */
export const InventoryService = {
    /**
     * Crea una existencia en sucursal (y la Ficha Única si no existe).
     * La creación de la Ficha Única (Master) está restringida a la Sede Central (HQ).
     */
    async createProduct(productData: Partial<Product>, branchId: string, isHQ: boolean = false): Promise<string> {
        const codeClean = (productData.codigo || '').trim().toUpperCase();
        if (!codeClean) throw new Error('Código de producto requerido');

        return await runTransaction(db, async (transaction) => {
            // 1. Detección de duplicado transaccional en unique_codes
            const uniqueCodeRef = doc(db, 'unique_codes', codeClean);
            const uniqueCodeSnap = await transaction.get(uniqueCodeRef);

            let masterId: string | null = null;
            if (uniqueCodeSnap.exists()) {
                masterId = uniqueCodeSnap.data().masterId;
            } else {
                // Fallback de migración progresiva oportunista (lazy migration)
                const existingMaster = await MasterCatalogService.getByCode(codeClean);
                if (existingMaster) {
                    masterId = existingMaster.id || null;
                    // Persistir la relación en unique_codes para futuras transacciones rápidas
                    transaction.set(uniqueCodeRef, { masterId });
                }
            }

            if (!masterId) {
                if (!isHQ) {
                    throw new Error('E-SEC-005: No se puede crear un producto nuevo desde una sucursal. El registro debe existir previamente en el Catálogo Maestro.');
                }
                // Crear nueva Ficha Única (Master)
                const masterRef = doc(collection(db, MASTER_COLLECTION));
                masterId = masterRef.id;
                // Integrar Auto-Tags (Industrial Search v4.0)
                const searchTags = generateSearchTags({
                    codigo: codeClean,
                    nombre: productData.nombre,
                    codigoOE: productData.codigoOE,
                    codigoFabrica: productData.codigoFabrica,
                    origen: productData.origen
                });

                transaction.set(masterRef, {
                    codigo: codeClean,
                    nombre: productData.nombre || '',
                    marcaId: productData.marcaId || productData.marca || '',
                    categoriaId: productData.categoriaId || productData.categoria || '',
                    codigoOE: productData.codigoOE || '',
                    codigoFabrica: productData.codigoFabrica || '',
                    origen: productData.origen || '',
                    unidad: productData.unidad || 'PZA',
                    imagenUrls: productData.imagenUrl ? [productData.imagenUrl] : [],
                    descripcion: productData.descripcion || '',
                    precioDefault: Number(productData.precioConFactura) || 0,
                    precioConFactura: Number(productData.precioConFactura) || 0,
                    precioSinFactura: Number(productData.precioSinFactura) || 0,
                    precioUSD: 0,
                    costoBase: Number(productData.costo) || 0,
                    searchTags,
                    type: 'PRODUCT',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });

                // Registrar en unique_codes transaccionalmente
                transaction.set(uniqueCodeRef, { masterId });
            }

            // 2. Crear Existencia en Sucursal usando ID Determinístico para evitar duplicados (Inmunidad Industrial)
            const deterministicId = `${branchId}_${masterId}`;
            const stockRef = doc(db, COLLECTION_NAME, deterministicId);
            transaction.set(stockRef, {
                masterId,
                branchId,
                stock: Number(productData.stock) || 0,
                minStock: Number(productData.minStock) || 0,
                isActive: true,
                ubicacionFisica: productData.ubicacionFisica || '',
                costo: Number(productData.costo) || 0,
                precioOverride: Number(productData.precioConFactura) || 0,
                precioSinFactura: Number(productData.precioSinFactura) || 0,
                precioMayorista: Number(productData.precioMayorista) || 0,
                barcode: productData.barcode || '',
                supplierId: productData.supplierId || '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            return stockRef.id;
        });
    },

    /**
     * Obtiene el inventario de una sucursal con Hidratación (Virtual Join).
     */
    async getBranchInventory(branchId?: string): Promise<Product[]> {
        let q = query(collection(db, COLLECTION_NAME));
        if (branchId) {
            q = query(q, where('branchId', '==', branchId));
        }
        const snapshot = await getDocs(q);
        const branchStocks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));

        // Get unique master IDs
        const masterIds = [...new Set(branchStocks.map(s => s.masterId))];
        
        // Fetch Master Data in chunks
        const masterDataMap = new Map<string, MasterProduct>();
        for (let i = 0; i < masterIds.length; i += 30) {
            const chunk = masterIds.slice(i, i + 30);
            const qm = query(collection(db, MASTER_COLLECTION), where('__name__', 'in', chunk));
            const masterSnap = await getDocs(qm);
            masterSnap.forEach(doc => masterDataMap.set(doc.id, { id: doc.id, ...doc.data() } as MasterProduct));
        }

        // Hydrate and Filter
        return branchStocks
            .filter(s => s.isActive !== false)
            .map(stock => {
                const master = masterDataMap.get(stock.masterId);
                return this.hydrateProduct(stock, master);
            });
    },

    /**
     * Helper para hidratar un producto de stock con su metadata del maestro.
     */
    hydrateProduct(stock: Product, master?: MasterProduct): Product {
        if (!master) {
            return {
                ...stock,
                codigo: 'S/N',
                nombre: 'Producto no vinculado',
                marca: '',
                categoria: '',
                imagenUrl: '',
                costo: stock.costo || 0,
                precio: stock.precioOverride || 0,
            } as Product;
        }

        return {
            ...stock,
            codigo: master.codigo || stock.codigo || 'S/N',
            nombre: master.nombre || stock.nombre || 'Sin nombre',
            marca: master.marcaId || stock.marca || '',
            categoria: master.categoriaId || stock.categoria || '',
            imagenUrl: master.imagenUrls?.[0] || stock.imagenUrl || '',
            origen: master.origen || stock.origen || '',
            codigoOE: master.codigoOE || stock.codigoOE || '',
            codigoFabrica: master.codigoFabrica || stock.codigoFabrica || '',
            descripcion: master.descripcion || stock.descripcion || '',
            unidad: master.unidad || stock.unidad || 'PZA',
            costo: stock.costo || master.costoBase || 0,
            precio: stock.precioOverride || master.precioDefault || 0,
            precioConFactura: stock.precioOverride || master.precioDefault || 0,
            precioSinFactura: stock.precioSinFactura ?? master.precioSinFactura ?? stock.precioOverride ?? master.precioDefault ?? 0,
            precioUSD: master.precioUSD || 0,
            lastSaleAt: stock.lastSaleAt
        } as Product;
    },

    /**
     * Alias para compatibilidad con ImportWizard (Suite Pro v4.0)
     */
    async getAllProducts(branchId: string): Promise<Product[]> {
        return this.getBranchInventory(branchId);
    },

    /**
     * Obtiene un producto por ID con hidratación atómica.
     */
    async getProductById(id: string): Promise<Product | null> {
        // Soporte para resolución de productos virtuales (Master -> Local Branch Initialization)
        if (id.startsWith('virtual-')) {
            const masterId = id.split('-')[1];
            const masterSnap = await getDoc(doc(db, MASTER_COLLECTION, masterId));
            
            if (!masterSnap.exists()) return null;
            
            // Retornar un producto "en blanco" para la sucursal pero con la data del maestro
            const masterData = { id: masterSnap.id, ...masterSnap.data() } as MasterProduct;
            return this.hydrateProduct({
                id, 
                masterId,
                stock: 0,
                minStock: 5,
                isActive: true,
                branchId: 'VIRTUAL' 
            } as Product, masterData);
        }

        const stockRef = doc(db, COLLECTION_NAME, id);
        const stockSnap = await getDoc(stockRef);
        
        if (!stockSnap.exists()) return null;
        
        const stockData = { id: stockSnap.id, ...stockSnap.data() } as Product;
        const masterSnap = await getDoc(doc(db, MASTER_COLLECTION, stockData.masterId));
        
        if (!masterSnap.exists()) return this.hydrateProduct(stockData);
        
        return this.hydrateProduct(stockData, { id: masterSnap.id, ...masterSnap.data() } as MasterProduct);
    },

    /**
     * Actualiza un producto en sucursal y su ficha única (Master) de forma atómica.
     * Solo la Sede Central (HQ) puede modificar campos maestros.
     */
    async updateProduct(id: string, productData: Partial<Product>, canEditMaster: boolean = false, branchId?: string): Promise<string> {
        return await runTransaction(db, async (transaction) => {
            const isVirtual = id.startsWith('virtual-');
            let stockRef: DocumentReference;
            let currentStockData: Product | null = null;
            let masterId: string;

            if (isVirtual) {
                if (!branchId) throw new Error("Branch ID is required to initialize a virtual product");
                masterId = id.split('-')[1];
                stockRef = doc(db, COLLECTION_NAME, `${branchId}_${masterId}`); // Deterministic ID for virtual conversion
            } else {
                stockRef = doc(db, COLLECTION_NAME, id);
                const stockSnap = await transaction.get(stockRef);
                if (!stockSnap.exists()) throw new Error("Producto no encontrado en inventario local");
                currentStockData = stockSnap.data() as Product;
                masterId = currentStockData.masterId;
            }

            const masterRef = doc(db, MASTER_COLLECTION, masterId);
            const masterSnap = await transaction.get(masterRef);
            if (!masterSnap.exists()) throw new Error("Producto maestro no encontrado");
            const masterData = masterSnap.data() as MasterProduct;

            let newCodeRef: DocumentReference | null = null;
            let newCodeSnap: any = null;
            const oldCode = (masterData.codigo || '').trim().toUpperCase();
            let newCode = '';

            if (canEditMaster && productData.codigo !== undefined) {
                newCode = productData.codigo.trim().toUpperCase();
                if (newCode && newCode !== oldCode) {
                    newCodeRef = doc(db, 'unique_codes', newCode);
                    newCodeSnap = await transaction.get(newCodeRef);
                }
            }

            // 1. Actualizar Master si es necesario (Solo HQ)
            if (canEditMaster) {
                if (newCodeRef && newCodeSnap) {
                    if (newCodeSnap.exists() && newCodeSnap.data().masterId !== masterId) {
                        throw new Error(`El código "${newCode}" ya está registrado para otro producto.`);
                    }
                    transaction.set(newCodeRef, { masterId });
                    if (oldCode) {
                        transaction.delete(doc(db, 'unique_codes', oldCode));
                    }
                }

                const searchTags = generateSearchTags({
                    codigo: productData.codigo || masterData.codigo,
                    nombre: productData.nombre || masterData.nombre,
                    codigoOE: productData.codigoOE || masterData.codigoOE,
                    codigoFabrica: productData.codigoFabrica || masterData.codigoFabrica,
                    origen: productData.origen || masterData.origen
                });

                transaction.update(masterRef, {
                    codigo: productData.codigo !== undefined ? newCode : masterData.codigo || '',
                    nombre: productData.nombre !== undefined ? productData.nombre : masterData.nombre || '',
                    marcaId: productData.marcaId || productData.marca || masterData.marcaId || '',
                    categoriaId: productData.categoriaId || productData.categoria || masterData.categoriaId || '',
                    codigoOE: productData.codigoOE !== undefined ? productData.codigoOE : masterData.codigoOE || '',
                    codigoFabrica: productData.codigoFabrica !== undefined ? productData.codigoFabrica : masterData.codigoFabrica || '',
                    origen: productData.origen !== undefined ? productData.origen : masterData.origen || '',
                    unidad: productData.unidad || masterData.unidad || 'PZA',
                    descripcion: productData.descripcion !== undefined ? productData.descripcion : masterData.descripcion || '',
                    precioDefault: Number(productData.precioConFactura) || masterData.precioDefault || 0,
                    precioConFactura: Number(productData.precioConFactura) || masterData.precioConFactura || masterData.precioDefault || 0,
                    precioSinFactura: Number(productData.precioSinFactura) || masterData.precioSinFactura || 0,
                    costoBase: Number(productData.costo) || masterData.costoBase || 0,
                    imagenUrls: productData.imagenUrl
                        ? [productData.imagenUrl]
                        : (masterData.imagenUrls || []),
                    searchTags,
                    updatedAt: serverTimestamp()
                });
            }

            // 2. Actualizar o Crear Stock Local
            // IMPORTANTE: el stock NO se modifica aquí en modo edición — solo vía adjustStock()
            const localData: Record<string, unknown> = {
                stock: isVirtual
                    ? (productData.stock !== undefined ? Number(productData.stock) : 0)
                    : (currentStockData?.stock || 0),
                minStock: productData.minStock !== undefined ? Number(productData.minStock) : (currentStockData?.minStock || 5),
                isActive: productData.isActive !== undefined ? productData.isActive : (currentStockData?.isActive ?? true),
                ubicacionFisica: productData.ubicacionFisica || currentStockData?.ubicacionFisica || '',
                costo: productData.costo !== undefined ? Number(productData.costo) : (currentStockData?.costo || 0),
                precioOverride: productData.precioConFactura !== undefined ? Number(productData.precioConFactura) : (currentStockData?.precioOverride || 0),
                precioConFactura: productData.precioConFactura !== undefined ? Number(productData.precioConFactura) : (currentStockData?.precioConFactura || 0),
                precioSinFactura: productData.precioSinFactura !== undefined ? Number(productData.precioSinFactura) : (currentStockData?.precioSinFactura || 0),
                precioMayorista: productData.precioMayorista !== undefined ? Number(productData.precioMayorista) : (currentStockData?.precioMayorista || 0),
                barcode: productData.barcode || currentStockData?.barcode || '',
                supplierId: productData.supplierId || currentStockData?.supplierId || '',
                updatedAt: serverTimestamp()
            };

            if (isVirtual) {
                // Denormalización crítica para Indexación Firestore (Industrial v4.0)
                localData.masterId = masterId;
                localData.branchId = branchId;
                localData.createdAt = serverTimestamp();
                localData.nombre = productData.nombre || masterData.nombre || 'Sin nombre';
                localData.codigo = productData.codigo || masterData.codigo || 'S/N';
                localData.marca = productData.marca || masterData.marcaId || '';
                localData.categoria = productData.categoria || masterData.categoriaId || '';
                
                transaction.set(stockRef, localData);
            } else {
                transaction.update(stockRef, localData);
            }

            return stockRef.id;
        });
    },


    /**
     * Ajuste de Stock (Manual) con Registro en Kardex.
     */
    async adjustStock(
        productId: string, 
        quantity: number, 
        type: 'ENTRADA' | 'SALIDA', 
        reason: string, 
        userId: string, 
        userName: string,
        branchId: string,
        referenceId?: string
    ): Promise<void> {
        if (!Number.isFinite(quantity) || quantity <= 0) {
            throwStandardError('INV_INVALID_ADJUSTMENT', 'La cantidad debe ser mayor a 0');
        }
        await runTransaction(db, async (transaction) => {
            const productRef = doc(db, COLLECTION_NAME, productId);
            const productSnap = await transaction.get(productRef);

            if (!productSnap.exists()) throwStandardError('INV_PRODUCT_NOT_FOUND', productId);
            const pData = productSnap.data();
            
            const currentStock = pData.stock || 0;
            let newStock = currentStock;

            if (type === 'ENTRADA') newStock += quantity;
            else {
                newStock -= quantity;
                if (newStock < 0) throwStandardError('INV_INSUFFICIENT_STOCK', pData.nombre || productId);
            }

            transaction.update(productRef, { stock: newStock, updatedAt: serverTimestamp() });

            // Audit Alert escalada por discrepancia de ajuste:
            //   >50% → HIGH, >30% → MEDIUM, >10% → LOW
            if (currentStock > 0) {
                const discrepancyPct = (quantity / currentStock) * 100;
                if (discrepancyPct > 10) {
                    const severity = discrepancyPct > 50 ? 'HIGH' : discrepancyPct > 30 ? 'MEDIUM' : 'LOW';
                    const alertRef = doc(collection(db, 'alertas_auditoria'));
                    transaction.set(alertRef, {
                        type: 'INVENTORY_THRESHOLD',
                        severity,
                        branchId,
                        userId,
                        message: `AJUSTE de stock con discrepancia ${discrepancyPct.toFixed(1)}% en "${pData.nombre || productId}". Stock Previo: ${currentStock}, Ajuste: ${quantity}`,
                        metadata: {
                            productId,
                            previousStock: currentStock,
                            newStock,
                            adjustmentQty: quantity,
                            discrepancyPct
                        },
                        isRead: false,
                        createdAt: serverTimestamp()
                    });
                }
            }

            // Kardex Movement
            const movRef = doc(collection(db, 'movimientos'));
            transaction.set(movRef, {
                productId,
                masterId: pData.masterId || null,
                type,
                quantity,
                currentStock: newStock,
                previousStock: currentStock,
                reason: `Ajuste: ${reason}`,
                referenceId: referenceId || null,
                date: serverTimestamp(),
                userId,
                userName,
                branchId,
                createdAt: serverTimestamp()
            });
        });
    },

    /**
     * Soft Delete Industrial (Global y local).
     * Solo permitido para la Sede Central (HQ).
     */
    async deleteProduct(id: string, adminInfo: { uid: string, email: string, branchId: string, isHQ: boolean }): Promise<void> {
        if (!adminInfo.isHQ) {
            throw new Error('E-SEC-002: El borrado global de productos está restringido a la Sede Central.');
        }
        let codigo = '';
        let masterId = '';
        
        // Handle Virtual Products (Not yet fully instantiated in the branch but existing in Master)
        if (id.startsWith('virtual-')) {
            const parts = id.split('-');
            masterId = parts[1]; // virtual-<masterId>-<branchId>
            const mRef = doc(db, MASTER_COLLECTION, masterId);
            const mSnap = await getDoc(mRef);
            if (!mSnap.exists()) throwStandardError('INV_PRODUCT_NOT_FOUND', id);
            codigo = mSnap.data().codigo || '';
        } else {
            const docRef = doc(db, COLLECTION_NAME, id);
            const productSnap = await getDoc(docRef);
            if (!productSnap.exists()) throwStandardError('INV_PRODUCT_NOT_FOUND', id);
            const pData = productSnap.data() as Product;
            codigo = pData.codigo || '';
            masterId = pData.masterId || '';
        }

        const batch = writeBatch(db);

        // 1. Desactivar en el Catálogo Maestro
        if (masterId) {
            batch.update(doc(db, MASTER_COLLECTION, masterId), {
                isActive: false,
                deletedAt: serverTimestamp(),
                deletedBy: adminInfo.uid
            });
        }

        // 2. Inactivar en todas las sucursales vinculadas a ese Master
        if (masterId) {
            const q = query(collection(db, COLLECTION_NAME), where('masterId', '==', masterId));
            
            const snapshot = await getDocs(q);
            snapshot.forEach((pDoc) => {
                batch.update(pDoc.ref, {
                    isActive: false,
                    deletedAt: serverTimestamp(),
                    deletedBy: adminInfo.uid
                });
            });
        }

        await batch.commit();
        await logAdminAction(adminInfo.uid, adminInfo.email, 'DELETE_PRODUCT_GLOBAL', id, adminInfo.branchId, `Baja del Sistema [${codigo || 'S/N'}]`);
    },

    async getDeletedProducts(): Promise<(Product & { deletedAt?: Timestamp; deletedBy?: string })[]> {
        const q = query(collection(db, COLLECTION_NAME), where('isActive', '==', false));
        const snapshot = await getDocs(q);
        if (snapshot.empty) return [];

        // Deduplicate by masterId, keep one product doc per master
        const seenMasterIds = new Set<string>();
        const uniqueDocs: (Product & { deletedAt?: Timestamp; deletedBy?: string })[] = [];
        snapshot.forEach((d) => {
            const data = d.data() as Product & { deletedAt?: Timestamp; deletedBy?: string };
            const mid = data.masterId;
            if (!mid || seenMasterIds.has(mid)) return;
            seenMasterIds.add(mid);
            uniqueDocs.push({ ...data, id: d.id });
        });

        // Hydrate master data (nombre, codigo, marca, categoria, imagenUrl)
        const masterIds = Array.from(seenMasterIds);
        const masterDataMap = new Map<string, MasterProduct & { deletedAt?: Timestamp; deletedBy?: string }>();
        for (let i = 0; i < masterIds.length; i += 30) {
            const chunk = masterIds.slice(i, i + 30);
            const qm = query(collection(db, MASTER_COLLECTION), where('__name__', 'in', chunk));
            const mSnap = await getDocs(qm);
            mSnap.forEach(md => masterDataMap.set(md.id, { id: md.id, ...md.data() } as MasterProduct & { deletedAt?: Timestamp; deletedBy?: string }));
        }

        return uniqueDocs.map((p) => {
            const master = masterDataMap.get(p.masterId);
            if (!master) return p;
            return {
                ...p,
                nombre: master.nombre ?? p.nombre,
                codigo: master.codigo ?? p.codigo,
                marca: (master.marcaId as string) ?? p.marca,
                categoria: (master.categoriaId as string) ?? p.categoria,
                imagenUrl: master.imagenUrls?.[0] ?? p.imagenUrl,
                deletedAt: master.deletedAt ?? p.deletedAt,
                deletedBy: master.deletedBy ?? p.deletedBy,
            };
        });
    },

    async restoreProduct(masterId: string, adminInfo: { uid: string; email: string; branchId: string; isHQ: boolean }): Promise<void> {
        if (!adminInfo.isHQ) {
            throw new Error('E-SEC-003: La restauración de productos está restringida a la Sede Central.');
        }

        const mRef = doc(db, MASTER_COLLECTION, masterId);
        const mSnap = await getDoc(mRef);
        if (!mSnap.exists()) throwStandardError('INV_PRODUCT_NOT_FOUND', masterId);
        const codigo = mSnap.data()?.codigo || '';

        const q = query(collection(db, COLLECTION_NAME), where('masterId', '==', masterId));
        const branchSnap = await getDocs(q);

        const batch = writeBatch(db);

        batch.update(mRef, {
            isActive: true,
            deletedAt: null,
            deletedBy: null,
        });

        branchSnap.forEach((d) => {
            batch.update(d.ref, {
                isActive: true,
                deletedAt: null,
                deletedBy: null,
            });
        });

        await batch.commit();
        await logAdminAction(adminInfo.uid, adminInfo.email, 'RESTORE_PRODUCT_GLOBAL', masterId, adminInfo.branchId, `Restauración de Producto [${codigo}]`);
    },

    // Utility methods
    async getNextBrandCode(brand: string): Promise<string> {
        const prefix = getBrandPrefix(brand);
        const q = query(
            collection(db, MASTER_COLLECTION),
            where('codigo', '>=', `${prefix}-`),
            where('codigo', '<=', `${prefix}-\uf8ff`)
        );
        const snapshot = await getDocs(q);
        const codes = snapshot.docs.map(doc => doc.data().codigo as string);
        
        let maxNumber = 0;
        const prefixPattern = new RegExp(`^${prefix}-(\\d+)$`);
        codes.forEach(code => {
            const match = code.match(prefixPattern);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNumber) maxNumber = num;
            }
        });

        return generateProductCode(brand, maxNumber + 1);
    },

    /**
     * Obtiene el historial de movimientos (Kardex) para un producto específico.
     * Soporta filtrado por productId (sucursal) o masterId (consolidado).
     * Limitado a los últimos 10 para rendimiento en modal.
     */
    async getKardex(
        productId: string,
        limitCount: number = 10,
        options?: { useMasterId?: boolean; masterId?: string }
    ): Promise<InventoryMovement[]> {
        const filterField = options?.useMasterId && options?.masterId ? 'masterId' : 'productId';
        const filterValue = options?.useMasterId && options?.masterId ? options.masterId : productId;

        const q = query(
            collection(db, 'movimientos'),
            where(filterField, '==', filterValue),
            orderBy('date', 'desc'),
            limit(limitCount)
        );
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: data.date instanceof Timestamp ? data.date.toDate() : new Date()
            } as InventoryMovement;
        });
    },

    /**
     * Motor de Inteligencia ABC (Architecture: data_flow.md L120)
     * Clasifica los productos por rotación (Volumen de ventas en los últimos 30 días).
     */
    async recalculateABC(branchId: string): Promise<void> {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // 1. Get all sales movements in the window
        const q = query(
            collection(db, 'movimientos'),
            where('branchId', '==', branchId),
            where('type', '==', 'SALIDA'),
            where('date', '>=', Timestamp.fromDate(thirtyDaysAgo))
        );
        
        const snapshot = await getDocs(q);
        const rotationMap: Record<string, number> = {};

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            // Filtrar estrictamente por ventas para no inflar rotación con mermas
            if (data.reason && data.reason.toLowerCase().includes('venta')) {
                const masterId = data.masterId;
                rotationMap[masterId] = (rotationMap[masterId] || 0) + Math.abs(data.quantity);
            }
        });

        // 2. Sort masters by rotation
        const sortedMasters = Object.entries(rotationMap)
            .sort(([, a], [, b]) => b - a);

        const totalCount = sortedMasters.length;
        if (totalCount === 0) return;

        // 3. Batch Update ABC Classes
        const batch = writeBatch(db);
        
        // Optimize: Load all products of the branch to match masterId -> productId
        const pQuery = query(collection(db, COLLECTION_NAME), where('branchId', '==', branchId));
        const pSnap = await getDocs(pQuery);
        const pMap: Record<string, string> = {}; // masterId -> productId
        pSnap.docs.forEach(d => { pMap[d.data().masterId] = d.id; });

        sortedMasters.forEach(([masterId], index) => {
            const percentile = (index + 1) / totalCount;
            let abcClass: 'A' | 'B' | 'C' = 'C';
            if (percentile <= 0.2) abcClass = 'A';
            else if (percentile <= 0.5) abcClass = 'B';

            const productId = pMap[masterId];
            if (productId) {
                const pRef = doc(db, COLLECTION_NAME, productId);
                batch.update(pRef, { abcClassLocal: abcClass, updatedAt: serverTimestamp() });
            }
        });

        await batch.commit();
    },

    /**
     * Búsqueda Federada Nacional (Architecture: services:23)
     * Obtiene el stock consolidado de todas las sucursales para un mismo Master ID.
     */
    async getGlobalProductStock(masterId: string): Promise<{ branchId: string, branchName: string, stock: number }[]> {
        const q = query(collection(db, COLLECTION_NAME), where('masterId', '==', masterId), where('isActive', '==', true));
        const snapshot = await getDocs(q);
        
        // Hidratación con nombres de sucursal
        const branchIds = [...new Set(snapshot.docs.map(doc => (doc.data() as Product).branchId))];
        const branchesMap = new Map<string, string>();
        
        if (branchIds.length > 0) {
            // Dividir en chunks si hay más de 30 sucursales
            for (let i = 0; i < branchIds.length; i += 30) {
                const chunk = branchIds.slice(i, i + 30);
                const bSnap = await getDocs(query(collection(db, 'branches'), where('__name__', 'in', chunk)));
                bSnap.docs.forEach(doc => branchesMap.set(doc.id, doc.data().name));
            }
        }

        return snapshot.docs.map(doc => {
            const data = doc.data() as Product;
            return {
                branchId: data.branchId,
                branchName: branchesMap.get(data.branchId) || 'Sucursal Desconocida',
                stock: data.stock || 0
            };
        });
    },

    /**
     * Motor de Reconciliación Masiva (Stocktake)
     * Realiza el ajuste físico vs sistema para una lista de productos.
     * Architecture: data_flow.md L90
     */
    async massiveStocktake(
        branchId: string,
        countList: { productId: string, physicalCount: number }[],
        userId: string,
        userName: string
    ): Promise<void> {
        await runTransaction(db, async (transaction) => {
            // 1. Todas las lecturas transaccionales en paralelo
            const reads = await Promise.all(countList.map(async (item) => {
                const productRef = doc(db, COLLECTION_NAME, item.productId);
                const snap = await transaction.get(productRef);
                return { item, productRef, snap };
            }));

            // 2. Todas las escrituras transaccionales
            for (const { item, productRef, snap } of reads) {
                if (!snap.exists()) continue;

                const pData = snap.data() as Product;
                const systemStock = pData.stock || 0;
                const physicalCount = Number(item.physicalCount);
                const difference = physicalCount - systemStock;

                // Solo actualizar si hay diferencia o para marcar la fecha de auditoría
                transaction.update(productRef, {
                    stock: physicalCount,
                    lastStockTake: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });

                if (difference !== 0) {
                    const movRef = doc(collection(db, 'movimientos'));
                    transaction.set(movRef, {
                        productId: item.productId,
                        masterId: pData.masterId,
                        branchId,
                        type: 'AJUSTE_MASIVO',
                        quantity: Math.abs(difference),
                        currentStock: physicalCount,
                        previousStock: systemStock,
                        reason: `Reconciliación Física (Audit: ${userName})`,
                        date: serverTimestamp(),
                        userId,
                        createdAt: serverTimestamp()
                    } as InventoryMovement);
                }
            }
        });
    },

    /**
     * Obtiene mapa de productos por código para validación rápida en importaciones.
     */
    async getProductMapForImport(branchId: string): Promise<Record<string, { id: string, codigo: string, price: number, cost: number }>> {
        const inventory = await this.getBranchInventory(branchId);
        const map: Record<string, { id: string, codigo: string, price: number, cost: number }> = {};
        
        inventory.forEach(p => {
            const data = { id: p.id, codigo: p.codigo, price: p.precioConFactura || 0, cost: p.costo || 0 };
            if (p.codigo) map[p.codigo.toUpperCase()] = data;
            if (p.codigoFabrica) map[p.codigoFabrica.toUpperCase()] = data;
            if (p.codigoOE) map[p.codigoOE.toUpperCase()] = data;
        });
        
        return map;
    },

    /**
     * Obtiene lista de todas las categorías únicas en uso en una sucursal.
     */
    async getUniqueCategories(branchId: string): Promise<string[]> {
        const q = query(collection(db, COLLECTION_NAME), where('branchId', '==', branchId), where('isActive', '==', true));
        const snap = await getDocs(q);
        const cats = new Set<string>();
        snap.docs.forEach(doc => {
            const data = doc.data();
            const categoryName = data.categoria || data.categoriaId;
            if (categoryName) cats.add(categoryName);
        });
        return Array.from(cats).sort();
    },

    /**
     * Valida si una categoría está siendo utilizada por algún producto.
     */
    async isCategoryInUse(categoryName: string): Promise<boolean> {
        const q1 = query(collection(db, COLLECTION_NAME), where('categoria', '==', categoryName), where('isActive', '==', true), limit(1));
        const snap1 = await getDocs(q1);
        if (!snap1.empty) return true;

        const q2 = query(collection(db, COLLECTION_NAME), where('categoriaId', '==', categoryName), where('isActive', '==', true), limit(1));
        const snap2 = await getDocs(q2);
        return !snap2.empty;
    },

    /**
     * Obtiene lista de todas las marcas únicas en uso en una sucursal.
     */
    async getUniqueBrands(branchId: string): Promise<string[]> {
        const q = query(collection(db, COLLECTION_NAME), where('branchId', '==', branchId), where('isActive', '==', true));
        const snap = await getDocs(q);
        const brands = new Set<string>();
        snap.docs.forEach(doc => {
            const data = doc.data();
            const brand = (data.marca || '').toString().trim();
            if (brand) brands.add(brand);
        });
        return Array.from(brands).sort();
    },

    /**
     * Valida si una marca está siendo utilizada por algún producto.
     */
    async isBrandInUse(brandName: string): Promise<boolean> {
        const q1 = query(collection(db, COLLECTION_NAME), where('marca', '==', brandName), where('isActive', '==', true), limit(1));
        const snap1 = await getDocs(q1);
        return !snap1.empty;
    },

    /**
     * Obtiene lista de todos los orígenes únicos en uso en una sucursal.
     */
    async getUniqueOrigins(branchId: string): Promise<string[]> {
        const q = query(collection(db, COLLECTION_NAME), where('branchId', '==', branchId), where('isActive', '==', true));
        const snap = await getDocs(q);
        const origins = new Set<string>();
        snap.docs.forEach(doc => {
            const data = doc.data();
            const origin = (data.origen || '').toString().trim();
            if (origin) origins.add(origin);
        });
        return Array.from(origins).sort();
    },

    /**
     * Valida si un origen está siendo utilizado por algún producto.
     */
    async isOriginInUse(originName: string): Promise<boolean> {
        const q1 = query(collection(db, COLLECTION_NAME), where('origen', '==', originName), where('isActive', '==', true), limit(1));
        const snap1 = await getDocs(q1);
        return !snap1.empty;
    },

    /**
     * Gestión de imágenes en Storage.
     */
    async uploadImage(file: Blob, fileName: string): Promise<string> {
        const storageRef = ref(storage, `products/${Date.now()}_${fileName}`);
        const snapshot = await uploadBytes(storageRef, file);
        return await getDownloadURL(snapshot.ref);
    },

    /**
     * Motor de Importación Masiva (Bulk Import).
     */
    async bulkImportProducts(
        products: ImportItem[], 
        branchId: string, 
        strategy: 'OVERWRITE' | 'UPDATE_STOCK_PRICE' | 'IGNORE' = 'UPDATE_STOCK_PRICE',
        onProgress?: (current: number, total: number) => void,
        isHQ: boolean = false,
        kardexOptions?: { operationDate?: string; reason?: string; userId?: string; userName?: string }
    ): Promise<{ created: number, updated: number, errors: number, failedItems: FailedImportItem[], batchId: string }> {
        const importBatchId = `batch_${Date.now()}`;
        let created = 0;
        let updated = 0;
        let errors = 0;
        const failedItems: FailedImportItem[] = [];
        // Si la fecha del kardex es HOY, usar serverTimestamp() para conservar hora real.
        const __todayStr = localDateStr();
        const kardexDate = () => (kardexOptions?.operationDate && kardexOptions.operationDate !== __todayStr)
            ? Timestamp.fromDate(midday(kardexOptions.operationDate))
            : serverTimestamp();

        // Limit chunk to 30 due to Firestore 'in' query limitation
        for (let i = 0; i < products.length; i += 30) {
            const chunk = products.slice(i, i + 30);
            const batch = writeBatch(db);

            // 1. Pre-fetch Masters by Code
            const codes = [...new Set(chunk.map(c => c.codigo).filter(Boolean))] as string[];
            const masterMap = new Map<string, MasterProduct>();
            if (codes.length > 0) {
                const qM = query(collection(db, MASTER_COLLECTION), where('codigo', 'in', codes));
                const snapM = await getDocs(qM);
                snapM.docs.forEach(d => {
                    const data = d.data() as MasterProduct;
                    masterMap.set(data.codigo || '', { id: d.id, ...data });
                });
            }

            // 2. Pre-fetch Local Stock by resolving Master IDs
            const localStockMap = new Map<string, { ref: DocumentReference, data: DocumentData }>();
            const existingMasterIds = [...new Set(chunk.map(c => masterMap.get(c.codigo || '')?.id).filter(Boolean))] as string[];
            
            if (existingMasterIds.length > 0) {
                const qLocal = query(collection(db, COLLECTION_NAME), where('branchId', '==', branchId), where('masterId', 'in', existingMasterIds));
                const localSnap = await getDocs(qLocal);
                localSnap.docs.forEach(d => {
                    localStockMap.set(d.data().masterId, { ref: d.ref, data: d.data() });
                });
            }

            for (const item of chunk) {
                try {
                    const masterId = masterMap.get(item.codigo || '')?.id;

                    if (!masterId) {
                        if (!isHQ) {
                            throw new Error('E-SEC-001: La creación de nuevos repuestos en el Catálogo Maestro está restringida a la Sede Central.');
                        }

                        // HQ: Crear nueva Ficha Única (Master) + Stock local
                        const masterRef = doc(collection(db, MASTER_COLLECTION));
                        const newMasterId = masterRef.id;
                        const searchTags = generateSearchTags({
                            codigo: item.codigo,
                            nombre: item.nombre,
                            codigoOE: item.codigoOE,
                            codigoFabrica: item.codigoFabrica,
                            origen: item.origen
                        });

                        batch.set(masterRef, {
                            codigo: item.codigo || '',
                            nombre: item.nombre || '',
                            marcaId: item.marca || '',
                            categoriaId: item.categoria || '',
                            codigoOE: item.codigoOE || '',
                            codigoFabrica: item.codigoFabrica || '',
                            origen: item.origen || '',
                            unidad: 'PZA',
                            imagenUrls: item.imagenUrl ? [item.imagenUrl] : [],
                            descripcion: item.descripcion || '',
                            precioDefault: Number(item.precioConFactura) || 0,
                            precioConFactura: Number(item.precioConFactura) || 0,
                            precioSinFactura: Number(item.precioSinFactura) || 0,
                            precioUSD: 0,
                            costoBase: Number(item.costo) || 0,
                            searchTags,
                            type: 'PRODUCT',
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                            importBatchId
                        });

                        // Crear stock con ID determinístico
                        const deterministicId = `${branchId}_${newMasterId}`;
                        const pRef = doc(db, COLLECTION_NAME, deterministicId);
                        batch.set(pRef, {
                            masterId: newMasterId,
                            branchId,
                            stock: Number(item.stock) || 0,
                            minStock: Number(item.minStock) || 5,
                            isActive: true,
                            costo: Number(item.costo) || 0,
                            precioOverride: Number(item.precioConFactura) || 0,
                            precioSinFactura: Number(item.precioSinFactura) || 0,
                            ubicacionFisica: item.ubicacionFisica || '',
                            nombre: (item.nombre || '') as string,
                            codigo: (item.codigo || '') as string,
                            marca: (item.marca || '') as string,
                            categoria: (item.categoria || '') as string,
                            createdAt: serverTimestamp(),
                            importBatchId
                        });

                        // Kardex: Carga Inicial para producto nuevo
                        if (kardexOptions) {
                            const movDate = kardexDate();
                            const movRef = doc(collection(db, 'movimientos'));
                            batch.set(movRef, {
                                productId: deterministicId,
                                masterId: newMasterId,
                                type: 'CARGA_INICIAL',
                                quantity: Number(item.stock) || 0,
                                currentStock: Number(item.stock) || 0,
                                previousStock: 0,
                                reason: kardexOptions.reason || 'Importación masiva',
                                referenceId: importBatchId,
                                date: movDate,
                                userId: kardexOptions.userId || null,
                                userName: kardexOptions.userName,
                                branchId,
                                createdAt: serverTimestamp()
                            });
                        }

                        created++;
                    } else {
                        // Solo actualizar metadata del maestro si es HQ
                        if (isHQ) {
                            const mRef = doc(db, MASTER_COLLECTION, masterId);
                            const masterUpdate: Record<string, unknown> = {
                                updatedAt: serverTimestamp(),
                                importBatchId
                            };
                            if (item.origen) masterUpdate.origen = String(item.origen);
                            if (item.marca) masterUpdate.marcaId = String(item.marca);
                            if (item.categoria) masterUpdate.categoriaId = String(item.categoria);
                            if (item.nombre) masterUpdate.nombre = String(item.nombre);
                            if (item.codigoFabrica) masterUpdate.codigoFabrica = String(item.codigoFabrica);
                            if (item.codigoOE) masterUpdate.codigoOE = String(item.codigoOE);
                            if (item.descripcion) masterUpdate.descripcion = String(item.descripcion);
                            if (item.costo) masterUpdate.costoBase = Number(item.costo);
                            if (item.precioConFactura) {
                                masterUpdate.precioDefault = Number(item.precioConFactura);
                                masterUpdate.precioConFactura = Number(item.precioConFactura);
                            }
                            if (item.precioSinFactura) masterUpdate.precioSinFactura = Number(item.precioSinFactura);
                            
                            batch.update(mRef, masterUpdate);
                        }

                        // Check if stock exists for this branch
                        const localStock = localStockMap.get(masterId);
                        
                        if (!localStock) {
                            created++;
                            const deterministicId = `${branchId}_${masterId}`;
                            const pRef = doc(db, COLLECTION_NAME, deterministicId);
                            batch.set(pRef, {
                                masterId,
                                branchId,
                                stock: Number(item.stock) || 0,
                                minStock: Number(item.minStock) || 5,
                                isActive: true,
                                costo: Number(item.costo) || 0,
                                precioOverride: Number(item.precioConFactura) || 0,
                                precioSinFactura: Number(item.precioSinFactura) || 0,
                                ubicacionFisica: item.ubicacionFisica || '',
                                nombre: (item.nombre || '') as string,
                                codigo: (item.codigo || '') as string,
                                marca: (item.marca || '') as string,
                                categoria: (item.categoria || '') as string,
                                createdAt: serverTimestamp(),
                                importBatchId
                            });

                            // Kardex: Carga Inicial para stock nuevo en sucursal
                            if (kardexOptions) {
                                const movDate = kardexDate();
                                const movRef = doc(collection(db, 'movimientos'));
                                batch.set(movRef, {
                                    productId: deterministicId,
                                    masterId,
                                    type: 'CARGA_INICIAL',
                                    quantity: Number(item.stock) || 0,
                                    currentStock: Number(item.stock) || 0,
                                    previousStock: 0,
                                    reason: kardexOptions.reason || 'Importación masiva',
                                    referenceId: importBatchId,
                                    date: movDate,
                                    userId: kardexOptions.userId || null,
                                    userName: kardexOptions.userName,
                                    branchId,
                                    createdAt: serverTimestamp()
                                });
                            }
                        } else {
                            // Strategy logic
                            if (strategy !== 'IGNORE') {
                                const pRef = localStock.ref;
                                const currentData = localStock.data;
                                const updateData: Partial<Product> = {
                                    updatedAt: serverTimestamp(),
                                    importBatchId
                                };
                                
                                if (strategy === 'OVERWRITE') {
                                    updateData.stock = item.stock !== undefined ? Number(item.stock) : currentData.stock;
                                    if (item.costo !== undefined) updateData.costo = Number(item.costo);
                                    if (item.precioConFactura !== undefined) updateData.precioOverride = Number(item.precioConFactura);
                                    if (item.precioSinFactura !== undefined) updateData.precioSinFactura = Number(item.precioSinFactura);
                                    if (item.precioMayorista !== undefined) updateData.precioMayorista = Number(item.precioMayorista);
                                    if (item.ubicacionFisica !== undefined) updateData.ubicacionFisica = item.ubicacionFisica;
                                    if (item.nombre !== undefined) updateData.nombre = item.nombre;
                                    if (item.codigo !== undefined) updateData.codigo = item.codigo;
                                    if (item.marca) updateData.marca = item.marca;
                                    if (item.categoria) updateData.categoria = item.categoria;
                                    if (item.barcode) updateData.barcode = item.barcode;
                                    if (item.supplierId) updateData.supplierId = item.supplierId;
                                    if (item.minStock !== undefined) updateData.minStock = Number(item.minStock);
                                } else if (strategy === 'UPDATE_STOCK_PRICE') {
                                    updateData.stock = (currentData.stock || 0) + (Number(item.stock) || 0);
                                    if (item.costo !== undefined) updateData.costo = Number(item.costo);
                                    if (item.precioConFactura !== undefined) updateData.precioOverride = Number(item.precioConFactura);
                                    if (item.precioSinFactura !== undefined) updateData.precioSinFactura = Number(item.precioSinFactura);
                                    if (item.precioMayorista !== undefined) updateData.precioMayorista = Number(item.precioMayorista);
                                    if (item.ubicacionFisica !== undefined) updateData.ubicacionFisica = item.ubicacionFisica;
                                    if (item.nombre !== undefined) updateData.nombre = item.nombre;
                                    if (item.barcode) updateData.barcode = item.barcode;
                                }
                                batch.update(pRef, updateData);

                                // Kardex: Reposición para producto existente
                                if (kardexOptions && (Number(item.stock) || 0) > 0) {
                                    const movDate = kardexDate();
                                    const prevStock = currentData.stock || 0;
                                    const newStock = updateData.stock ?? prevStock;
                                    const movRef = doc(collection(db, 'movimientos'));
                                    batch.set(movRef, {
                                        productId: localStock.ref.id,
                                        masterId,
                                        type: 'REPOSICION',
                                        quantity: Number(item.stock) || 0,
                                        currentStock: newStock,
                                        previousStock: prevStock,
                                        reason: kardexOptions.reason || 'Importación masiva',
                                        referenceId: importBatchId,
                                        date: movDate,
                                        userId: kardexOptions.userId || null,
                                        userName: kardexOptions.userName,
                                        branchId,
                                        createdAt: serverTimestamp()
                                    });
                                }

                                updated++;
                            }
                        }
                    }
                } catch (e) {
                    errors++;
                    failedItems.push({ ...item, error: String(e) });
                }
            }
            await batch.commit();
            if (onProgress) onProgress(Math.min(i + 30, products.length), products.length);
        }

        return { created, updated, errors, failedItems, batchId: importBatchId };
    },

    /**
     * Revierte una importación masiva por ID de batch.
     */
    async revertBatchImport(batchId: string, branchId: string): Promise<number> {
        const q = query(collection(db, COLLECTION_NAME), where('importBatchId', '==', batchId), where('branchId', '==', branchId));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.update(d.ref, { isActive: false, deletedAt: serverTimestamp() }));
        await batch.commit();
        return snap.size;
    }
};
