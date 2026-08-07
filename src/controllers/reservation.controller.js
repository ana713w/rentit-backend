import createError from 'http-errors';
import { db } from '../db/index.js';

const RESERVATION_COLUMNS = `
    id, property_id, guest_id, to_char(lower(date_range), 'YYYY-MM-DD') AS start_date, to_char(upper(date_range), 'YYYY-MM-DD') AS end_date,
    price_per_day, deposit_amount, status, created_at, updated_at
`;

async function hasDateConflict(propertyId, startDate, endDate) {
    const { rows: blocked } = await db.query(
        `SELECT id FROM property_blocked_dates
         WHERE property_id = $1 AND date_range && daterange($2::date, $3::date, '[)')`,
        [propertyId, startDate, endDate]
    );
    if (blocked.length > 0) return true;

    const { rows: reserved } = await db.query(
        `SELECT id FROM reservations
         WHERE property_id = $1 AND status = 'confirmed' AND date_range && daterange($2::date, $3::date, '[)')`,
        [propertyId, startDate, endDate]
    );
    return reserved.length > 0;
}

export async function createReservation(req, res, next) {
    try {
        const { propertyId, startDate, endDate } = req.body;

        const { rows: properties } = await db.query('SELECT * FROM properties WHERE id = $1', [propertyId]);
        const property = properties[0];
        if (!property) return next(createError(404, 'Property not found'));
        if (!property.is_active) return next(createError(400, 'This property is not available'));
        if (property.owner_id === req.user.id) {
            return next(createError(400, 'You cannot reserve your own property'));
        }
        if (await hasDateConflict(property.id, startDate, endDate)) {
            return next(createError(409, 'The property is not available on those dates'));
        }

        const { rows } = await db.query(
            `INSERT INTO reservations (property_id, guest_id, date_range, price_per_day, deposit_amount)
             VALUES ($1, $2, daterange($3::date, $4::date, '[)'), $5, $6)
             RETURNING ${RESERVATION_COLUMNS}`,
            [property.id, req.user.id, startDate, endDate, property.price_per_day, property.deposit_amount]
        );

        res.status(201).json(rows[0]);
    } catch (error) {
        if (error.code === '23P01') { // exclusion_violation: alguien confirmo esas fechas justo antes
            return next(createError(409, 'The property is not available on those dates'));
        }
        next(error);
    }
}

export async function listMyReservations(req, res, next) {
    try {
        const { rows } = await db.query(
            `SELECT ${RESERVATION_COLUMNS} FROM reservations WHERE guest_id = $1 ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json(rows);
    } catch (error) {
        next(error);
    }
}

export async function listOwnerReservations(req, res, next) {
    try {
        const { rows } = await db.query(
            `SELECT r.id, r.property_id, r.guest_id, to_char(lower(r.date_range), 'YYYY-MM-DD') AS start_date, to_char(upper(r.date_range), 'YYYY-MM-DD') AS end_date,
                    r.price_per_day, r.deposit_amount, r.status, r.created_at, r.updated_at
             FROM reservations r
             JOIN properties p ON p.id = r.property_id
             WHERE p.owner_id = $1
             ORDER BY r.created_at DESC`,
            [req.user.id]
        );
        res.json(rows);
    } catch (error) {
        next(error);
    }
}

async function findReservationWithOwner(id) {
    const { rows } = await db.query(
        `SELECT r.*, p.owner_id
         FROM reservations r JOIN properties p ON p.id = r.property_id
         WHERE r.id = $1`,
        [id]
    );
    if (!rows[0]) throw createError(404, 'Reservation not found');
    return rows[0];
}

export async function getReservation(req, res, next) {
    try {
        const reservation = await findReservationWithOwner(req.params.id);
        if (reservation.guest_id !== req.user.id && reservation.owner_id !== req.user.id) {
            return next(createError(403, 'You cannot view this reservation'));
        }
        res.json(reservation);
    } catch (error) {
        next(error);
    }
}

export async function acceptReservation(req, res, next) {
    try {
        const reservation = await findReservationWithOwner(req.params.id);
        if (reservation.owner_id !== req.user.id) {
            return next(createError(403, 'Only the property owner can accept this reservation'));
        }
        if (reservation.status !== 'pending') {
            return next(createError(409, 'Only pending reservations can be accepted'));
        }

        const { rows: conflicting } = await db.query(
            `SELECT id FROM reservations
             WHERE property_id = $1 AND status = 'confirmed' AND id <> $2 AND date_range && $3`,
            [reservation.property_id, reservation.id, reservation.date_range]
        );
        if (conflicting.length > 0) {
            return next(createError(409, 'These dates were already confirmed for another reservation'));
        }

        const { rows: blocked } = await db.query(
            `SELECT id FROM property_blocked_dates WHERE property_id = $1 AND date_range && $2`,
            [reservation.property_id, reservation.date_range]
        );
        if (blocked.length > 0) {
            return next(createError(409, 'The owner blocked these dates before this reservation was accepted'));
        }

        const { rows } = await db.query(
            `UPDATE reservations SET status = 'confirmed', updated_at = NOW()
             WHERE id = $1 RETURNING ${RESERVATION_COLUMNS}`,
            [reservation.id]
        );

        // al confirmar una, las demas solicitudes pendientes que se solapaban ya no tienen sentido
        await db.query(
            `UPDATE reservations SET status = 'rejected', updated_at = NOW()
             WHERE property_id = $1 AND status = 'pending' AND id <> $2 AND date_range && $3`,
            [reservation.property_id, reservation.id, reservation.date_range]
        );

        res.json(rows[0]);
    } catch (error) {
        if (error.code === '23P01') {
            return next(createError(409, 'These dates were already confirmed for another reservation'));
        }
        next(error);
    }
}

export async function rejectReservation(req, res, next) {
    try {
        const reservation = await findReservationWithOwner(req.params.id);
        if (reservation.owner_id !== req.user.id) {
            return next(createError(403, 'Only the property owner can reject this reservation'));
        }
        if (reservation.status !== 'pending') {
            return next(createError(409, 'Only pending reservations can be rejected'));
        }

        const { rows } = await db.query(
            `UPDATE reservations SET status = 'rejected', updated_at = NOW()
             WHERE id = $1 RETURNING ${RESERVATION_COLUMNS}`,
            [reservation.id]
        );
        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
}

export async function cancelReservation(req, res, next) {
    try {
        const reservation = await findReservationWithOwner(req.params.id);
        const isGuest = reservation.guest_id === req.user.id;
        const isOwner = reservation.owner_id === req.user.id;
        if (!isGuest && !isOwner) {
            return next(createError(403, 'You cannot cancel this reservation'));
        }
        if (!['pending', 'confirmed'].includes(reservation.status)) {
            return next(createError(409, 'This reservation cannot be cancelled'));
        }

        const { rows } = await db.query(
            `UPDATE reservations SET status = 'cancelled', updated_at = NOW()
             WHERE id = $1 RETURNING ${RESERVATION_COLUMNS}`,
            [reservation.id]
        );
        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
}
