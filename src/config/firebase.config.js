import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

// Lazy a proposito: si se inicializa al importar el modulo, el servidor entero
// no arrancaria mientras las credenciales de Firebase (Modulo 4) no esten configuradas.
export function getBucket() {
    if (getApps().length === 0) {
        initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // en .env las nuevas lineas de la private key llegan como "\n" literal, hay que convertirlas
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        });
    }
    return getStorage().bucket();
}
