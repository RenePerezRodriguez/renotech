import admin from 'firebase-admin';

/**
 * Lazy initialization of Firebase Admin
 * This prevents the build from crashing when FIREBASE_SERVICE_ACCOUNT_KEY is missing.
 */
const getAdminApp = () => {
    if (admin.apps.length > 0) return admin.apps[0];

    const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!key) {
        if (process.env.NODE_ENV === 'production') {
            console.warn("Firebase Admin: FIREBASE_SERVICE_ACCOUNT_KEY is missing in production.");
        }
        return null;
    }

    try {
        const serviceAccount = JSON.parse(key);
        return admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    } catch (error) {
        console.error("Firebase Admin Initialization Error:", error);
        return null;
    }
};

export const getAdminAuth = () => {
    const app = getAdminApp();
    if (!app) throw new Error("Firebase Admin not initialized. Check FIREBASE_SERVICE_ACCOUNT_KEY.");
    return admin.auth(app);
};

export const getAdminDb = () => {
    const app = getAdminApp();
    if (!app) throw new Error("Firebase Admin not initialized. Check FIREBASE_SERVICE_ACCOUNT_KEY.");
    return admin.firestore(app);
};

/**
 * Proxy objects for Auth and Firestore to maintain backward compatibility
 * and provide all methods lazily.
 * The `as unknown as` casts are intentional: Proxy get() receives string | symbol,
 * and Firebase Admin SDK types don't expose a generic index signature.
 */
export const adminAuth = new Proxy({} as admin.auth.Auth, {
    get: (target, prop) => {
        const auth = getAdminAuth();
        // SAFE: Proxy pattern for lazy init — prop is always a valid method/property name
        const value = (auth as unknown as Record<string | symbol, unknown>)[prop];
        return typeof value === 'function' ? value.bind(auth) : value;
    }
});

export const adminDb = new Proxy({} as admin.firestore.Firestore, {
    get: (target, prop) => {
        const db = getAdminDb();
        // SAFE: Proxy pattern for lazy init — prop is always a valid method/property name
        const value = (db as unknown as Record<string | symbol, unknown>)[prop];
        return typeof value === 'function' ? value.bind(db) : value;
    }
});
