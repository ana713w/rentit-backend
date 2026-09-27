import createError from 'http-errors';
import { db } from '../db/index.js';
import { applyDepositResolution } from './payment.controller.js';

async function loadReservationForDispute(reservationId) {
    const { rows } = await db.query(
        `SELECT r.id, r.guest_id, i.owner_id
         FROM reservations r JOIN items i ON i.id = r.item_id
         WHERE r.id = $1`,
        [reservationId]
    );
    const reservation = rows[0];
    if (!reservation) throw createError(404, 'Reservation not found');
    return reservation;
}

export async function createDispute(req, res, next) {
    try {
        const { reason, requestedCaptureAmount } = req.body;
        const reservation = await loadReservationForDispute(req.params.id);

        if (reservation.guest_id !== req.user.id && reservation.owner_id !== req.user.id) {
            return next(createError(403, 'You are not part of this reservation'));
        }

        const { rows } = await db.query(
            `INSERT INTO disputes (reservation_id, raised_by, reason, requested_capture_amount)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [reservation.id, req.user.id, reason, requestedCaptureAmount ?? null]
        );

        res.status(201).json(rows[0]);
    } catch (error) {
        if (error.code === '23505') { // unique_violation: ya hay una disputa abierta para esta reserva
            return next(createError(409, 'There is already an open dispute for this reservation'));
        }
        next(error);
    }
}

export async function listReservationDisputes(req, res, next) {
    try {
        const reservation = await loadReservationForDispute(req.params.id);
        if (reservation.guest_id !== req.user.id && reservation.owner_id !== req.user.id) {
            return next(createError(403, 'You are not part of this reservation'));
        }

        const { rows } = await db.query(
            'SELECT * FROM disputes WHERE reservation_id = $1 ORDER BY created_at DESC',
            [reservation.id]
        );
        res.json(rows);
    } catch (error) {
        next(error);
    }
}

export async function listAllDisputes(req, res, next) {
    try {
        const { rows } = await db.query('SELECT * FROM disputes ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        next(error);
    }
}

async function findDisputeWithParties(disputeId) {
    const { rows } = await db.query(
        `SELECT d.*, r.guest_id, i.owner_id
         FROM disputes d
         JOIN reservations r ON r.id = d.reservation_id
         JOIN items i ON i.id = r.item_id
         WHERE d.id = $1`,
        [disputeId]
    );
    const dispute = rows[0];
    if (!dispute) throw createError(404, 'Dispute not found');
    return dispute;
}

export async function getDispute(req, res, next) {
    try {
        const dispute = await findDisputeWithParties(req.params.id);
        const isParty = dispute.guest_id === req.user.id || dispute.owner_id === req.user.id;

        if (!isParty) {
            const { rows } = await db.query('SELECT 1 FROM admins WHERE user_id = $1', [req.user.id]);
            if (rows.length === 0) return next(createError(403, 'You cannot view this dispute'));
        }

        res.json(dispute);
    } catch (error) {
        next(error);
    }
}

export async function startReview(req, res, next) {
    try {
        const dispute = await findDisputeWithParties(req.params.id);
        if (dispute.status !== 'open') {
            return next(createError(409, 'Only open disputes can be moved to review'));
        }

        const { rows } = await db.query(
            `UPDATE disputes SET status = 'under_review', updated_at = NOW() WHERE id = $1 RETURNING *`,
            [dispute.id]
        );
        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
}

export async function resolveDispute(req, res, next) {
    try {
        const { resolution, depositAction, captureAmount } = req.body;
        const dispute = await findDisputeWithParties(req.params.id);

        if (dispute.status === 'resolved') {
            return next(createError(409, 'This dispute is already resolved'));
        }

        if (depositAction !== 'none') {
            const { rows: paymentRows } = await db.query(
                'SELECT * FROM payments WHERE reservation_id = $1',
                [dispute.reservation_id]
            );
            const payment = paymentRows[0];
            if (!payment) return next(createError(400, 'This reservation has no payment to resolve'));

            await applyDepositResolution(payment, { action: depositAction, amountToCapture: captureAmount });
        }

        const { rows } = await db.query(
            `UPDATE disputes
             SET status = 'resolved', resolution = $1, resolved_by = $2, resolved_at = NOW(), updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [resolution, req.user.id, dispute.id]
        );

        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
}
