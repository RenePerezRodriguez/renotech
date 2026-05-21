import { initializeApp, getApps, getApp } from "firebase/app";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
    projectId: 'renotech-cloud-app',
    appId: '1:280778292979:web:f6e8b6b5b4752e85ac0186',
    storageBucket: 'renotech-cloud-app.firebasestorage.app',
    apiKey: 'AIzaSyBzASLtm0RNmBDn02-8GR3eXjyRaVmLGE4',
    authDomain: 'renotech-cloud-app.firebaseapp.com',
    messagingSenderId: '280778292979',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Persistencia offline: cachea en IndexedDB, soporta múltiples pestañas.
// Los writes se encolan automáticamente sin red y sincronizan al reconectarse.
const db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
    }),
});

const auth    = getAuth(app);
const storage = getStorage(app);

export { app, db, auth, storage };
