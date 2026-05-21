import { db } from '@/lib/firebase';
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    getDoc, 
    doc, 
    serverTimestamp, 
    updateDoc, 
    setDoc,
    limit
} from 'firebase/firestore';
import { MasterProduct } from '@/types';
import { generateSearchTags } from '@/logic/search';

const MASTER_COLLECTION = 'catalogo_maestro';

/**
 * MasterCatalogService
 * Responsable de la Ficha Única Nacional de repuestos.
 * Datos inmutables por sucursal y metadata global.
 */
export const MasterCatalogService = {
    /**
     * Obtiene todos los productos del catálogo maestro.
     */
    async getAll(): Promise<MasterProduct[]> {
        const q = query(collection(db, MASTER_COLLECTION));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MasterProduct));
    },

    /**
     * Obtiene un producto maestro por su ID.
     */
    async getById(id: string): Promise<MasterProduct | null> {
        const docRef = doc(db, MASTER_COLLECTION, id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return null;
        return { id: docSnap.id, ...docSnap.data() } as MasterProduct;
    },

    /**
     * Busca un producto maestro por su código interno.
     */
    async getByCode(code: string): Promise<MasterProduct | null> {
        const q = query(
            collection(db, MASTER_COLLECTION),
            where('codigo', '==', code.trim().toUpperCase()),
            limit(1)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MasterProduct;
    },

    /**
     * Crea una nueva Ficha Única en el catálogo maestro.
     * Solo permitido para Sede Central (HQ).
     */
    async create(data: Partial<MasterProduct>, isHQ: boolean = false): Promise<string> {
        if (!isHQ) {
            throw new Error('E-SEC-003: La creación de fichas maestras está restringida a la Sede Central.');
        }
        const masterRef = doc(collection(db, MASTER_COLLECTION));
        const searchTags = generateSearchTags(data);
        await setDoc(masterRef, {
            ...data,
            searchTags,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return masterRef.id;
    },

    /**
     * Actualiza la metadata global de un producto.
     * Solo permitido para Sede Central (HQ).
     */
    async update(id: string, data: Partial<MasterProduct>, isHQ: boolean = false): Promise<void> {
        if (!isHQ) {
            throw new Error('E-SEC-004: La edición del catálogo maestro está restringida a la Sede Central.');
        }
        const docRef = doc(db, MASTER_COLLECTION, id);
        const searchTags = generateSearchTags(data);
        await updateDoc(docRef, {
            ...data,
            searchTags,
            updatedAt: serverTimestamp()
        });
    },

    /**
     * Búsqueda avanzada por Alias/Tags (Architecture: database_schema.md L26)
     */
    async search(term: string): Promise<MasterProduct[]> {
        const t = term.trim().toLowerCase();
        const q = query(
            collection(db, MASTER_COLLECTION),
            where('searchTags', 'array-contains', t)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MasterProduct));
    },

    /**
     * Borrado con Cascada Inversa (Architecture: database_schema.md L321)
     * Impide eliminar un producto maestro si existen existencias (vinculadas) en sucursales.
     */
    async deleteMasterProduct(id: string): Promise<void> {
        // 1. Verificar si existen productos vinculados en la colección 'productos'
        const q = query(collection(db, 'productos'), where('masterId', '==', id), limit(1));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            throw new Error('E-SYS-001: No se puede eliminar el producto maestro porque existen existencias vinculadas en sucursales.');
        }

        // 2. Proceder con el borrado (Soft Delete industrial recomendado)
        const docRef = doc(db, MASTER_COLLECTION, id);
        await updateDoc(docRef, { 
            status: 'DELETED', 
            deletedAt: serverTimestamp() 
        });
    },

    /**
     * Helper de Inteligencia Logística: Obtiene el factor de conversión UOM.
     * Architecture: database_schema.md L30
     */
    async getUomConversion(masterId: string): Promise<{ factor: number, from: string, to: string } | null> {
        const master = await this.getById(masterId);
        if (!master || !master.uomConversion) return null;
        return {
            factor: master.uomConversion.factor,
            from: master.uomConversion.fromUnit,
            to: master.uomConversion.toUnit
        };
    }
};
