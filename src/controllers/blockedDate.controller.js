import createError from 'http-errors';
import { db } from '../db/index.js';
import { findOwnedProperty } from './property.controller.js';

export async function listBlockedDates(req, res, next) {
    try {
        const { rows } = await db.query(
            `SELECT id, property_id, to_char(lower(date_range), 'YYYY-MM-DD') AS start_date, to_char(upper(date_range), 'YYYY-MM-DD') AS end_date, reason, created_at
             FROM property_blocked_dates
             WHERE property_id = $1
             ORDER BY date_range`,
            [req.params.id]
        );
        res.json(rows);
    } catch (error) {
        next(error);
    }
}

export async function createBlockedDate(req, res, next) {
    try {
        const property = await findOwnedProperty(req.params.id, req.user.id);
        const { startDate, endDate, reason } = req.body;

        const { rows: reserved } = await db.query(
            `SELECT id FROM reservations
             WHERE property_id = $1 AND status = 'confirmed' AND date_range && daterange($2::date, $3::date, '[)')`,
            [property.id, startDate, endDate]
        );
        if (reserved.length > 0) {
            return next(createError(409, 'There is a confirmed reservation in that date range, cancel it before blocking these dates'));
        }

        const { rows } = await db.query(
            `INSERT INTO property_blocked_dates (property_id, date_range, reason)
             VALUES ($1, daterange($2::date, $3::date, '[)'), $4)
             RETURNING id, property_id, to_char(lower(date_range), 'YYYY-MM-DD') AS start_date, to_char(upper(date_range), 'YYYY-MM-DD') AS end_date, reason, created_at`,
            [property.id, startDate, endDate, reason ?? null]
        );

        res.status(201).json(rows[0]);
    } catch (error) {
        if (error.code === '23P01') { // exclusion_violation del EXCLUDE USING gist
            return next(createError(409, 'These dates overlap with an existing block'));
        }
        next(error);
    }
}

export async function deleteBlockedDate(req, res, next) {
    try {
        const property = await findOwnedProperty(req.params.id, req.user.id);
        const { rows } = await db.query(
            'DELETE FROM property_blocked_dates WHERE id = $1 AND property_id = $2 RETURNING id',
            [req.params.blockId, property.id]
        );
        if (!rows[0]) return next(createError(404, 'Blocked date range not found'));
        res.status(204).send();
    } catch (error) {
        next(error);
    }
}
