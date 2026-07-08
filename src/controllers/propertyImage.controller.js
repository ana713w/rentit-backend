import createError from 'http-errors';
import { db } from '../db/index.js';
import { findOwnedProperty } from './property.controller.js';
import { uploadImage, deleteFile } from '../services/storage.service.js';

export async function listPropertyImages(req, res, next) {
    try {
        const { rows } = await db.query(
            'SELECT * FROM property_images WHERE property_id = $1 ORDER BY is_primary DESC, created_at ASC',
            [req.params.id]
        );
        res.json(rows);
    } catch (error) {
        next(error);
    }
}

export async function uploadPropertyImages(req, res, next) {
    try {
        const property = await findOwnedProperty(req.params.id, req.user.id);

        if (!req.files || req.files.length === 0) {
            return next(createError(400, 'At least one image is required'));
        }

        const { rows: existing } = await db.query(
            'SELECT id FROM property_images WHERE property_id = $1 LIMIT 1',
            [property.id]
        );
        const hasImages = existing.length > 0;

        const uploads = await Promise.all(
            req.files.map((file) => uploadImage(file, `properties/${property.id}`))
        );

        const inserted = [];
        for (const [index, { url, path }] of uploads.entries()) {
            const isPrimary = !hasImages && index === 0;
            const { rows } = await db.query(
                `INSERT INTO property_images (property_id, url, storage_path, is_primary)
                 VALUES ($1,$2,$3,$4)
                 RETURNING *`,
                [property.id, url, path, isPrimary]
            );
            inserted.push(rows[0]);
        }

        res.status(201).json(inserted);
    } catch (error) {
        next(error);
    }
}

async function findPropertyImage(propertyId, imageId) {
    const { rows } = await db.query(
        'SELECT * FROM property_images WHERE id = $1 AND property_id = $2',
        [imageId, propertyId]
    );
    if (!rows[0]) throw createError(404, 'Image not found');
    return rows[0];
}

export async function setPrimaryPropertyImage(req, res, next) {
    try {
        const property = await findOwnedProperty(req.params.id, req.user.id);
        const image = await findPropertyImage(property.id, req.params.imageId);

        await db.query('UPDATE property_images SET is_primary = false WHERE property_id = $1', [property.id]);
        const { rows } = await db.query(
            'UPDATE property_images SET is_primary = true WHERE id = $1 RETURNING *',
            [image.id]
        );

        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
}

export async function deletePropertyImage(req, res, next) {
    try {
        const property = await findOwnedProperty(req.params.id, req.user.id);
        const image = await findPropertyImage(property.id, req.params.imageId);

        await deleteFile(image.storage_path);
        await db.query('DELETE FROM property_images WHERE id = $1', [image.id]);

        if (image.is_primary) {
            await db.query(
                `UPDATE property_images SET is_primary = true
                 WHERE id = (
                     SELECT id FROM property_images WHERE property_id = $1 ORDER BY created_at ASC LIMIT 1
                 )`,
                [property.id]
            );
        }

        res.status(204).send();
    } catch (error) {
        next(error);
    }
}
