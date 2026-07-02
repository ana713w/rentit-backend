import { randomUUID } from 'crypto';
import { getBucket } from '../config/firebase.config.js';

async function uploadBuffer(buffer, folder, filename, contentType) {
    const bucket = getBucket();
    const path = `${folder}/${randomUUID()}-${filename}`;
    const blob = bucket.file(path);

    await new Promise((resolve, reject) => {
        const stream = blob.createWriteStream({ metadata: { contentType } });
        stream.on('error', reject);
        stream.on('finish', resolve);
        stream.end(buffer);
    });

    await blob.makePublic();

    return {
        url: `https://storage.googleapis.com/${bucket.name}/${path}`,
        path,
    };
}

// Reutilizado por property_images y, mas adelante, por verification_photos
export function uploadImage(file, folder) {
    return uploadBuffer(file.buffer, folder, file.originalname, file.mimetype);
}

// Reutilizado por contracts (PDFs generados en el servidor)
export function uploadDocument(buffer, folder, filename) {
    return uploadBuffer(buffer, folder, filename, 'application/pdf');
}

export async function deleteFile(path) {
    await getBucket().file(path).delete({ ignoreNotFound: true });
}
