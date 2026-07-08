import createError from 'http-errors';
import { db } from '../db/index.js';

export async function createProperty(req, res, next) {
    try {
        const { title, description, address, latitude, longitude, pricePerDay, depositAmount, propertyType } = req.body;

        const { rows } = await db.query(
            `INSERT INTO properties (owner_id, title, description, address, latitude, longitude, price_per_day, deposit_amount, property_type)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING *`,
            [req.user.id, title, description ?? null, address, latitude ?? null, longitude ?? null, pricePerDay, depositAmount, propertyType]
        );

        res.status(201).json(rows[0]);
    } catch (error) {
        next(error);
    }
}

export async function listProperties(req, res, next) {
    try {
        const { rows } = await db.query(
            'SELECT * FROM properties WHERE is_active = true ORDER BY created_at DESC'
        );
        res.json(rows);
    } catch (error) {
        next(error);
    }
}

export async function getProperty(req, res, next) {
    try {
        const { rows } = await db.query('SELECT * FROM properties WHERE id = $1', [req.params.id]);
        if (!rows[0]) return next(createError(404, 'Propiedad no encontrada'));
        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
}

export async function findOwnedProperty(id, userId) {
    const { rows } = await db.query('SELECT * FROM properties WHERE id = $1', [id]);
    const property = rows[0];
    if (!property) throw createError(404, 'Propiedad no encontrada');
    if (property.owner_id !== userId) throw createError(403, 'No puedes modificar una propiedad que no es tuya');
    return property;
}

export async function updateProperty(req, res, next) {
    try {
        const property = await findOwnedProperty(req.params.id, req.user.id);

        const {
            title = property.title,
            description = property.description,
            address = property.address,
            latitude = property.latitude,
            longitude = property.longitude,
            pricePerDay = property.price_per_day,
            depositAmount = property.deposit_amount,
            propertyType = property.property_type,
        } = req.body;

        const { rows } = await db.query(
            `UPDATE properties
             SET title = $1, description = $2, address = $3, latitude = $4, longitude = $5,
                 price_per_day = $6, deposit_amount = $7, property_type = $8, updated_at = NOW()
             WHERE id = $9
             RETURNING *`,
            [title, description, address, latitude, longitude, pricePerDay, depositAmount, propertyType, property.id]
        );

        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
}

export async function deactivateProperty(req, res, next) {
    try {
        const property = await findOwnedProperty(req.params.id, req.user.id);
        await db.query('UPDATE properties SET is_active = false, updated_at = NOW() WHERE id = $1', [property.id]);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
}