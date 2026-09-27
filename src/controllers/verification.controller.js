import createError from 'http-errors';
import { db } from '../db/index.js';
import { uploadImage, deleteFile } from '../services/storage.service.js';

async function loadReservationForVerification(reservationId) {
    const { rows } = await db.query(
        `SELECT r.id, r.status, r.guest_id, i.owner_id
         FROM reservations r JOIN items i ON i.id = r.item_id
         WHERE r.id = $1`,
        [reservationId]
    );
    const reservation = rows[0];
    if (!reservation) throw createError(404, 'Reservation not found');
    return reservation;
}

async function findVerificationForUser(verificationId, userId) {
    const { rows } = await db.query(
        `SELECT v.*, r.guest_id, i.owner_id
         FROM verifications v
         JOIN reservations r ON r.id = v.reservation_id
         JOIN items i ON i.id = r.item_id
         WHERE v.id = $1`,
        [verificationId]
    );
    const verification = rows[0];
    if (!verification) throw createError(404, 'Verification not found');
    if (verification.guest_id !== userId && verification.owner_id !== userId) {
        throw createError(403, 'You are not part of this reservation');
    }
    return verification;
}

export async function createVerification(req, res, next) {
    try {
        const { verificationType, notes } = req.body;
        const reservation = await loadReservationForVerification(req.params.id);

        if (reservation.guest_id !== req.user.id && reservation.owner_id !== req.user.id) {
            return next(createError(403, 'You are not part of this reservation'));
        }
        if (!['confirmed', 'completed'].includes(reservation.status)) {
            return next(createError(400, 'The reservation must be confirmed before creating a verification'));
        }

        if (verificationType === 'check_out') {
            const { rows: checkInRows } = await db.query(
                `SELECT id FROM verifications WHERE reservation_id = $1 AND verification_type = 'check_in'`,
                [reservation.id]
            );
            if (checkInRows.length === 0) {
                return next(createError(400, 'The check-in verification must exist before creating the check-out one'));
            }
        }

        const { rows } = await db.query(
            `INSERT INTO verifications (reservation_id, verification_type, notes)
             VALUES ($1, $2, $3)
             ON CONFLICT (reservation_id, verification_type) DO NOTHING
             RETURNING *`,
            [reservation.id, verificationType, notes ?? null]
        );

        if (rows.length === 0) {
            return next(createError(409, 'This verification already exists for this reservation'));
        }

        if (verificationType === 'check_out') {
            await db.query(
                `UPDATE reservations SET status = 'completed', updated_at = NOW() WHERE id = $1 AND status = 'confirmed'`,
                [reservation.id]
            );
        }

        res.status(201).json(rows[0]);
    } catch (error) {
        next(error);
    }
}

export async function listReservationVerifications(req, res, next) {
    try {
        const reservation = await loadReservationForVerification(req.params.id);
        if (reservation.guest_id !== req.user.id && reservation.owner_id !== req.user.id) {
            return next(createError(403, 'You are not part of this reservation'));
        }

        const { rows } = await db.query(
            'SELECT * FROM verifications WHERE reservation_id = $1 ORDER BY created_at',
            [reservation.id]
        );
        res.json(rows);
    } catch (error) {
        next(error);
    }
}

export async function getVerification(req, res, next) {
    try {
        const verification = await findVerificationForUser(req.params.id, req.user.id);
        res.json(verification);
    } catch (error) {
        next(error);
    }
}

export async function updateVerificationNotes(req, res, next) {
    try {
        const verification = await findVerificationForUser(req.params.id, req.user.id);
        const { notes } = req.body;

        const { rows } = await db.query(
            'UPDATE verifications SET notes = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [notes ?? null, verification.id]
        );
        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
}

export async function listVerificationPhotos(req, res, next) {
    try {
        const verification = await findVerificationForUser(req.params.id, req.user.id);
        const { rows } = await db.query(
            'SELECT * FROM verification_photos WHERE verification_id = $1 ORDER BY created_at',
            [verification.id]
        );
        res.json(rows);
    } catch (error) {
        next(error);
    }
}

export async function uploadVerificationPhotos(req, res, next) {
    try {
        const verification = await findVerificationForUser(req.params.id, req.user.id);

        if (!req.files || req.files.length === 0) {
            return next(createError(400, 'At least one photo is required'));
        }

        const uploads = await Promise.all(
            req.files.map((file) => uploadImage(file, `verifications/${verification.id}`))
        );

        const inserted = [];
        for (const { url, path } of uploads) {
            const { rows } = await db.query(
                `INSERT INTO verification_photos (verification_id, uploaded_by, url, storage_path)
                 VALUES ($1,$2,$3,$4)
                 RETURNING *`,
                [verification.id, req.user.id, url, path]
            );
            inserted.push(rows[0]);
        }

        res.status(201).json(inserted);
    } catch (error) {
        next(error);
    }
}

async function findOwnPhoto(photoId, verificationId, userId) {
    const { rows } = await db.query(
        'SELECT * FROM verification_photos WHERE id = $1 AND verification_id = $2',
        [photoId, verificationId]
    );
    const photo = rows[0];
    if (!photo) throw createError(404, 'Photo not found');
    if (photo.uploaded_by !== userId) throw createError(403, 'You can only delete your own photos');
    return photo;
}

export async function deleteVerificationPhoto(req, res, next) {
    try {
        const verification = await findVerificationForUser(req.params.id, req.user.id);
        const photo = await findOwnPhoto(req.params.photoId, verification.id, req.user.id);

        await deleteFile(photo.storage_path);
        await db.query('DELETE FROM verification_photos WHERE id = $1', [photo.id]);

        res.status(204).send();
    } catch (error) {
        next(error);
    }
}
