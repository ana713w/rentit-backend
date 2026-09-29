import createError from 'http-errors';
import { db } from '../db/index.js';

export async function createItem(req, res, next) {
    try {
        // los objetos se recogen en la direccion del dueño, sin ella no hay donde ir a buscarlos
        if (!req.user.address) {
            return next(createError(400, 'Add your address to your profile before publishing items'));
        }

        const { title, description, pricePerDay, depositAmount, category } = req.body;

        const { rows } = await db.query(
            `INSERT INTO items (owner_id, title, description, price_per_day, deposit_amount, category)
             VALUES ($1,$2,$3,$4,$5,$6)
             RETURNING *`,
            [req.user.id, title, description ?? null, pricePerDay, depositAmount, category]
        );

        res.status(201).json(rows[0]);
    } catch (error) {
        if (error.code === '23514') { // check_violation: deposito fuera del rango 3-365x el precio/dia
            return next(createError(400, 'Deposit must be between 3 and 365 times the price per day'));
        }
        next(error);
    }
}

const DEFAULT_RADIUS_KM = 5;

export async function listItems(req, res, next) {
    try {
        const { lat, lng, radiusKm } = req.query;

        if (lat === undefined || lng === undefined) {
            const { rows } = await db.query(
                'SELECT * FROM items WHERE is_active = true ORDER BY created_at DESC'
            );
            return res.json(rows);
        }

        // busqueda por proximidad: distancia (Haversine) entre el punto pedido y la ubicacion del dueño,
        // que es donde se recoge el objeto; las coordenadas del dueño no se devuelven, solo la distancia
        const { rows } = await db.query(
            `SELECT * FROM (
                SELECT i.*, ROUND((6371 * 2 * ASIN(LEAST(1, SQRT(
                    POWER(SIN(RADIANS(u.latitude - $1::float8) / 2), 2) +
                    COS(RADIANS($1::float8)) * COS(RADIANS(u.latitude)) *
                    POWER(SIN(RADIANS(u.longitude - $2::float8) / 2), 2)
                ))))::numeric, 2) AS distance_km
                FROM items i
                JOIN users u ON u.id = i.owner_id
                WHERE i.is_active = true AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL
             ) nearby
             WHERE distance_km <= $3
             ORDER BY distance_km ASC, created_at DESC`,
            [Number(lat), Number(lng), Number(radiusKm ?? DEFAULT_RADIUS_KM)]
        );
        res.json(rows);
    } catch (error) {
        next(error);
    }
}

export async function getItem(req, res, next) {
    try {
        const { rows } = await db.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
        if (!rows[0]) return next(createError(404, 'Objeto no encontrado'));
        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
}

export async function findOwnedItem(id, userId) {
    const { rows } = await db.query('SELECT * FROM items WHERE id = $1', [id]);
    const item = rows[0];
    if (!item) throw createError(404, 'Objeto no encontrado');
    if (item.owner_id !== userId) throw createError(403, 'No puedes modificar un objeto que no es tuyo');
    return item;
}

export async function updateItem(req, res, next) {
    try {
        const item = await findOwnedItem(req.params.id, req.user.id);

        const {
            title = item.title,
            description = item.description,
            pricePerDay = item.price_per_day,
            depositAmount = item.deposit_amount,
            category = item.category,
        } = req.body;

        if (depositAmount < pricePerDay * 3 || depositAmount > pricePerDay * 365) {
            return next(createError(400, 'Deposit must be between 3 and 365 times the price per day'));
        }

        const { rows } = await db.query(
            `UPDATE items
             SET title = $1, description = $2, price_per_day = $3, deposit_amount = $4, category = $5, updated_at = NOW()
             WHERE id = $6
             RETURNING *`,
            [title, description, pricePerDay, depositAmount, category, item.id]
        );

        res.json(rows[0]);
    } catch (error) {
        if (error.code === '23514') {
            return next(createError(400, 'Deposit must be between 3 and 365 times the price per day'));
        }
        next(error);
    }
}

export async function deactivateItem(req, res, next) {
    try {
        const item = await findOwnedItem(req.params.id, req.user.id);
        await db.query('UPDATE items SET is_active = false, updated_at = NOW() WHERE id = $1', [item.id]);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
}