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

    const url = await resolvePublicUrl(blob, bucket, path);

    return { url, path };
}

// Los buckets creados con Uniform Bucket-Level Access (default en proyectos GCP recientes) no admiten
// ACLs por objeto, asi que makePublic() falla; en ese caso usamos una URL firmada de larga duracion
async function resolvePublicUrl(blob, bucket, path) {
    try {
        await blob.makePublic();
        return `https://storage.googleapis.com/${bucket.name}/${path}`;
    } catch (error) {
        const [signedUrl] = await blob.getSignedUrl({ action: 'read', expires: '01-01-2100' });
        return signedUrl;
    }
}

// Reutilizado por item_images y, mas adelante, por verification_photos
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
