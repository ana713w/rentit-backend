import { randomInt } from 'crypto';
import bcrypt from 'bcrypt';
import createError from 'http-errors';
import { db } from '../db/index.js';
import { uploadDocument } from '../services/storage.service.js';
import { sendOtpEmail } from '../services/email.service.js';
import { buildContractText, hashContent, generateContractPdf } from '../services/contract.service.js';

const OTP_EXPIRATION_MINUTES = 10;

function sanitizeContract(contract) {
    const { guest_otp_hash, owner_otp_hash, guest_id, owner_id, role, ...rest } = contract;
    return rest;
}

async function loadReservationForContract(reservationId) {
    const { rows } = await db.query(
        `SELECT r.id, r.status, r.guest_id, to_char(lower(r.date_range), 'YYYY-MM-DD') AS start_date, to_char(upper(r.date_range), 'YYYY-MM-DD') AS end_date,
                r.price_per_day, r.deposit_amount,
                i.title AS item_title, i.owner_id, o.address AS pickup_address
         FROM reservations r
         JOIN items i ON i.id = r.item_id
         JOIN users o ON o.id = i.owner_id
         WHERE r.id = $1`,
        [reservationId]
    );
    const reservation = rows[0];
    if (!reservation) throw createError(404, 'Reservation not found');
    return reservation;
}

async function loadParties(reservation) {
    const { rows } = await db.query(
        'SELECT id, full_name, email, phone FROM users WHERE id = ANY($1::uuid[])',
        [[reservation.guest_id, reservation.owner_id]]
    );
    const guest = rows.find((u) => u.id === reservation.guest_id);
    const owner = rows.find((u) => u.id === reservation.owner_id);
    return { guest, owner };
}

async function findContractForUser(contractId, userId) {
    const { rows } = await db.query(
        `SELECT c.*, r.guest_id, i.owner_id
         FROM contracts c
         JOIN reservations r ON r.id = c.reservation_id
         JOIN items i ON i.id = r.item_id
         WHERE c.id = $1`,
        [contractId]
    );
    const contract = rows[0];
    if (!contract) throw createError(404, 'Contract not found');

    const role = contract.guest_id === userId ? 'guest' : contract.owner_id === userId ? 'owner' : null;
    if (!role) throw createError(403, 'You are not part of this contract');

    return { ...contract, role };
}

async function finalizeContract(contract) {
    const reservation = await loadReservationForContract(contract.reservation_id);
    const { guest, owner } = await loadParties(reservation);

    const text = buildContractText({ contractType: contract.contract_type, reservation, guest, owner });
    const pdfBuffer = await generateContractPdf({ text, contract, guest, owner });
    const { url, path } = await uploadDocument(pdfBuffer, `contracts/${reservation.id}`, `${contract.contract_type}.pdf`);

    const { rows } = await db.query(
        `UPDATE contracts SET document_url = $1, document_storage_path = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [url, path, contract.id]
    );
    return rows[0];
}

export async function createContract(req, res, next) {
    try {
        const { contractType } = req.body;
        const reservation = await loadReservationForContract(req.params.id);

        if (reservation.guest_id !== req.user.id && reservation.owner_id !== req.user.id) {
            return next(createError(403, 'You are not part of this reservation'));
        }
        if (!['confirmed', 'completed'].includes(reservation.status)) {
            return next(createError(400, 'The reservation must be confirmed before creating a contract'));
        }

        if (contractType === 'return') {
            const { rows: rentalRows } = await db.query(
                `SELECT * FROM contracts WHERE reservation_id = $1 AND contract_type = 'rental'`,
                [reservation.id]
            );
            const rental = rentalRows[0];
            if (!rental || !rental.guest_signed_at || !rental.owner_signed_at) {
                return next(createError(400, 'The rental contract must be fully signed before creating the return act'));
            }
        }

        const { guest, owner } = await loadParties(reservation);
        const text = buildContractText({ contractType, reservation, guest, owner });
        const contentHash = hashContent(text);

        const { rows } = await db.query(
            `INSERT INTO contracts (reservation_id, contract_type, content_hash)
             VALUES ($1, $2, $3)
             ON CONFLICT (reservation_id, contract_type) DO NOTHING
             RETURNING *`,
            [reservation.id, contractType, contentHash]
        );

        if (rows.length === 0) {
            return next(createError(409, 'This contract already exists for this reservation'));
        }

        res.status(201).json(sanitizeContract(rows[0]));
    } catch (error) {
        next(error);
    }
}

export async function listReservationContracts(req, res, next) {
    try {
        const reservation = await loadReservationForContract(req.params.id);
        if (reservation.guest_id !== req.user.id && reservation.owner_id !== req.user.id) {
            return next(createError(403, 'You are not part of this reservation'));
        }

        const { rows } = await db.query(
            'SELECT * FROM contracts WHERE reservation_id = $1 ORDER BY created_at',
            [reservation.id]
        );
        res.json(rows.map(sanitizeContract));
    } catch (error) {
        next(error);
    }
}

export async function getContract(req, res, next) {
    try {
        const contract = await findContractForUser(req.params.id, req.user.id);
        res.json(sanitizeContract(contract));
    } catch (error) {
        next(error);
    }
}

export async function requestOtp(req, res, next) {
    try {
        const contract = await findContractForUser(req.params.id, req.user.id);
        const { role } = contract;

        if (contract[`${role}_signed_at`]) {
            return next(createError(409, 'You already signed this contract'));
        }

        const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
        const otpHash = await bcrypt.hash(code, 10);
        const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);

        await db.query(
            `UPDATE contracts SET ${role}_otp_hash = $1, ${role}_otp_expires_at = $2, updated_at = NOW() WHERE id = $3`,
            [otpHash, expiresAt, contract.id]
        );

        await sendOtpEmail(req.user.email, code);

        res.status(204).send();
    } catch (error) {
        next(error);
    }
}

export async function signContract(req, res, next) {
    try {
        const { otp } = req.body;
        const contract = await findContractForUser(req.params.id, req.user.id);
        const { role } = contract;

        if (contract[`${role}_signed_at`]) {
            // ambas firmas quedaron registradas pero un intento anterior de generar el PDF fallo (ej. Firebase caido)
            if (contract.guest_signed_at && contract.owner_signed_at && !contract.document_url) {
                return res.json(sanitizeContract(await finalizeContract(contract)));
            }
            return next(createError(409, 'You already signed this contract'));
        }

        const otpHash = contract[`${role}_otp_hash`];
        const expiresAt = contract[`${role}_otp_expires_at`];
        if (!otpHash || !expiresAt || new Date(expiresAt) < new Date()) {
            return next(createError(400, 'Request a new verification code'));
        }
        if (!(await bcrypt.compare(otp, otpHash))) {
            return next(createError(400, 'Invalid verification code'));
        }

        const { rows } = await db.query(
            `UPDATE contracts
             SET ${role}_signed_at = NOW(), ${role}_signature_ip = $1,
                 ${role}_otp_hash = NULL, ${role}_otp_expires_at = NULL, updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [req.ip, contract.id]
        );
        let updated = rows[0];

        if (updated.guest_signed_at && updated.owner_signed_at) {
            updated = await finalizeContract(updated);
        }

        res.json(sanitizeContract(updated));
    } catch (error) {
        next(error);
    }
}
