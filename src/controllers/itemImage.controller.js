import createError from 'http-errors';
import { db } from '../db/index.js';
import { findOwnedItem } from './item.controller.js';
import { uploadImage, deleteFile } from '../services/storage.service.js';

export async function listItemImages(req, res, next) {
    try {
        const { rows } = await db.query(
            'SELECT * FROM item_images WHERE item_id = $1 ORDER BY is_primary DESC, created_at ASC',
            [req.params.id]
        );
        res.json(rows);
    } catch (error) {
        next(error);
    }
}

export async function uploadItemImages(req, res, next) {
    try {
        const item = await findOwnedItem(req.params.id, req.user.id);

        if (!req.files || req.files.length === 0) {
            return next(createError(400, 'At least one image is required'));
        }

        const { rows: existing } = await db.query(
            'SELECT id FROM item_images WHERE item_id = $1 LIMIT 1',
            [item.id]
        );
        const hasImages = existing.length > 0;

        const uploads = await Promise.all(
            req.files.map((file) => uploadImage(file, `items/${item.id}`))
        );

        const inserted = [];
        for (const [index, { url, path }] of uploads.entries()) {
            const isPrimary = !hasImages && index === 0;
            const { rows } = await db.query(
                `INSERT INTO item_images (item_id, url, storage_path, is_primary)
                 VALUES ($1,$2,$3,$4)
                 RETURNING *`,
                [item.id, url, path, isPrimary]
            );
            inserted.push(rows[0]);
        }

        res.status(201).json(inserted);
    } catch (error) {
        next(error);
    }
}

async function findItemImage(itemId, imageId) {
    const { rows } = await db.query(
        'SELECT * FROM item_images WHERE id = $1 AND item_id = $2',
        [imageId, itemId]
    );
    if (!rows[0]) throw createError(404, 'Image not found');
    return rows[0];
}

export async function setPrimaryItemImage(req, res, next) {
    try {
        const item = await findOwnedItem(req.params.id, req.user.id);
        const image = await findItemImage(item.id, req.params.imageId);

        await db.query('UPDATE item_images SET is_primary = false WHERE item_id = $1', [item.id]);
        const { rows } = await db.query(
            'UPDATE item_images SET is_primary = true WHERE id = $1 RETURNING *',
            [image.id]
        );

        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
}

export async function deleteItemImage(req, res, next) {
    try {
        const item = await findOwnedItem(req.params.id, req.user.id);
        const image = await findItemImage(item.id, req.params.imageId);

        await deleteFile(image.storage_path);
        await db.query('DELETE FROM item_images WHERE id = $1', [image.id]);

        if (image.is_primary) {
            await db.query(
                `UPDATE item_images SET is_primary = true
                 WHERE id = (
                     SELECT id FROM item_images WHERE item_id = $1 ORDER BY created_at ASC LIMIT 1
                 )`,
                [item.id]
            );
        }

        res.status(204).send();
    } catch (error) {
        next(error);
    }
}
