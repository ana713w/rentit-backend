import createError from 'http-errors';
import { db } from '../db/index.js';
import {
    createConnectAccount,
    createOnboardingLink,
    getAccountStatus,
    createRentPaymentIntent,
    createDepositPaymentIntent,
    captureDeposit,
    cancelDeposit,
    refundRentPayment,
    constructWebhookEvent,
} from '../services/stripe.service.js';

const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT || 10);

export async function startOnboarding(req, res, next) {
    try {
        let accountId = req.user.stripe_account_id;
        if (!accountId) {
            accountId = await createConnectAccount(req.user.email);
            await db.query('UPDATE users SET stripe_account_id = $1 WHERE id = $2', [accountId, req.user.id]);
        }

        const url = await createOnboardingLink(accountId);
        res.json({ url });
    } catch (error) {
        next(error);
    }
}

export async function getOnboardingStatus(req, res, next) {
    try {
        if (!req.user.stripe_account_id) {
            return res.json({ onboarded: false, chargesEnabled: false, payoutsEnabled: false });
        }
        const status = await getAccountStatus(req.user.stripe_account_id);
        res.json({ onboarded: true, ...status });
    } catch (error) {
        next(error);
    }
}

async function loadReservationForPayment(reservationId) {
    const { rows } = await db.query(
        `SELECT r.id, r.status, r.guest_id, r.price_per_day, r.deposit_amount,
                to_char(lower(r.date_range), 'YYYY-MM-DD') AS start_date,
                to_char(upper(r.date_range), 'YYYY-MM-DD') AS end_date,
                p.owner_id, u.stripe_account_id AS owner_stripe_account_id
         FROM reservations r
         JOIN properties p ON p.id = r.property_id
         JOIN users u ON u.id = p.owner_id
         WHERE r.id = $1`,
        [reservationId]
    );
    const reservation = rows[0];
    if (!reservation) throw createError(404, 'Reservation not found');
    return reservation;
}

function countNights(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

export async function createReservationPayment(req, res, next) {
    try {
        const reservation = await loadReservationForPayment(req.params.id);

        if (reservation.guest_id !== req.user.id) {
            return next(createError(403, 'Only the guest can pay for this reservation'));
        }
        if (reservation.status !== 'confirmed') {
            return next(createError(400, 'The reservation must be confirmed before paying'));
        }
        if (!reservation.owner_stripe_account_id) {
            return next(createError(400, 'The owner has not completed payment onboarding yet'));
        }

        const { rows: existing } = await db.query('SELECT id FROM payments WHERE reservation_id = $1', [reservation.id]);
        if (existing.length > 0) {
            return next(createError(409, 'A payment already exists for this reservation'));
        }

        const rentAmount = Number(reservation.price_per_day) * countNights(reservation.start_date, reservation.end_date);
        const platformFeeAmount = Math.round(rentAmount * PLATFORM_FEE_PERCENT) / 100;

        const rentIntent = await createRentPaymentIntent({
            amount: rentAmount,
            ownerStripeAccountId: reservation.owner_stripe_account_id,
            feePercent: PLATFORM_FEE_PERCENT,
            reservationId: reservation.id,
        });
        const depositIntent = await createDepositPaymentIntent({
            amount: reservation.deposit_amount,
            ownerStripeAccountId: reservation.owner_stripe_account_id,
            reservationId: reservation.id,
        });

        const { rows } = await db.query(
            `INSERT INTO payments (reservation_id, rent_amount, deposit_amount, platform_fee_amount,
                                    rent_payment_intent_id, deposit_payment_intent_id)
             VALUES ($1,$2,$3,$4,$5,$6)
             RETURNING *`,
            [reservation.id, rentAmount, reservation.deposit_amount, platformFeeAmount, rentIntent.id, depositIntent.id]
        );

        res.status(201).json({
            ...rows[0],
            rentClientSecret: rentIntent.client_secret,
            depositClientSecret: depositIntent.client_secret,
        });
    } catch (error) {
        next(error);
    }
}

export async function getReservationPayment(req, res, next) {
    try {
        const reservation = await loadReservationForPayment(req.params.id);
        if (reservation.guest_id !== req.user.id && reservation.owner_id !== req.user.id) {
            return next(createError(403, 'You are not part of this reservation'));
        }

        const { rows } = await db.query('SELECT * FROM payments WHERE reservation_id = $1', [reservation.id]);
        if (!rows[0]) return next(createError(404, 'No payment found for this reservation'));
        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
}

async function findPaymentForOwner(paymentId, userId) {
    const { rows } = await db.query(
        `SELECT pay.*, p.owner_id
         FROM payments pay
         JOIN reservations r ON r.id = pay.reservation_id
         JOIN properties p ON p.id = r.property_id
         WHERE pay.id = $1`,
        [paymentId]
    );
    const payment = rows[0];
    if (!payment) throw createError(404, 'Payment not found');
    if (payment.owner_id !== userId) throw createError(403, 'Only the property owner can manage this deposit');
    return payment;
}

// Llamado desde reservation.controller.js al cancelar una reserva 'confirmed' con pago:
// reembolsa el alquiler ya cobrado y cancela el deposito si seguia solo autorizado
export async function cancelPaymentsForReservation(reservationId) {
    const { rows } = await db.query('SELECT * FROM payments WHERE reservation_id = $1', [reservationId]);
    const payment = rows[0];
    if (!payment) return;

    if (payment.rent_status === 'succeeded') {
        await refundRentPayment(payment.rent_payment_intent_id);
        await db.query(`UPDATE payments SET rent_status = 'refunded', updated_at = NOW() WHERE id = $1`, [payment.id]);
    }

    if (payment.deposit_status === 'authorized') {
        await cancelDeposit(payment.deposit_payment_intent_id);
        await db.query(`UPDATE payments SET deposit_status = 'canceled', updated_at = NOW() WHERE id = $1`, [payment.id]);
    }
}

async function ensureCheckOutHappened(reservationId) {
    const { rows } = await db.query(
        `SELECT id FROM verifications WHERE reservation_id = $1 AND verification_type = 'check_out'`,
        [reservationId]
    );
    if (rows.length === 0) {
        throw createError(409, 'A check-out verification is required before managing the deposit');
    }
}

// Reutilizado por disputes: al resolver una disputa (Modulo 10), el admin puede decidir
// capturar (total o parcial) o liberar el deposito, con la misma logica que estos endpoints
export async function applyDepositResolution(payment, { action, amountToCapture }) {
    if (payment.deposit_status !== 'authorized') {
        throw createError(409, 'The deposit is not in a resolvable state');
    }

    if (action === 'capture') {
        const captured = await captureDeposit(payment.deposit_payment_intent_id, amountToCapture);
        const capturedAmount = captured.amount_received / 100;
        const { rows } = await db.query(
            `UPDATE payments SET deposit_status = 'captured', deposit_captured_amount = $1, updated_at = NOW()
             WHERE id = $2 RETURNING *`,
            [capturedAmount, payment.id]
        );
        return rows[0];
    }

    if (action === 'release') {
        await cancelDeposit(payment.deposit_payment_intent_id);
        const { rows } = await db.query(
            `UPDATE payments SET deposit_status = 'released', updated_at = NOW() WHERE id = $1 RETURNING *`,
            [payment.id]
        );
        return rows[0];
    }

    throw createError(400, 'Invalid deposit action');
}

export async function captureDepositAmount(req, res, next) {
    try {
        const payment = await findPaymentForOwner(req.params.id, req.user.id);
        await ensureCheckOutHappened(payment.reservation_id);
        const updated = await applyDepositResolution(payment, {
            action: 'capture',
            amountToCapture: req.body.amountToCapture,
        });
        res.json(updated);
    } catch (error) {
        next(error);
    }
}

export async function releaseDeposit(req, res, next) {
    try {
        const payment = await findPaymentForOwner(req.params.id, req.user.id);
        await ensureCheckOutHappened(payment.reservation_id);
        const updated = await applyDepositResolution(payment, { action: 'release' });
        res.json(updated);
    } catch (error) {
        next(error);
    }
}

export async function handleStripeWebhook(req, res, next) {
    let event;
    try {
        event = constructWebhookEvent(req.body, req.headers['stripe-signature']);
    } catch (error) {
        return res.status(400).send('Webhook signature verification failed');
    }

    try {
        const intent = event.data.object;
        const { type } = intent.metadata || {};

        if (event.type === 'payment_intent.succeeded' && type === 'rent') {
            await db.query(
                `UPDATE payments SET rent_status = 'succeeded', updated_at = NOW() WHERE rent_payment_intent_id = $1`,
                [intent.id]
            );
        } else if (event.type === 'payment_intent.payment_failed' && type === 'rent') {
            await db.query(
                `UPDATE payments SET rent_status = 'failed', updated_at = NOW() WHERE rent_payment_intent_id = $1`,
                [intent.id]
            );
        } else if (event.type === 'payment_intent.amount_capturable_updated' && type === 'deposit') {
            await db.query(
                `UPDATE payments SET deposit_status = 'authorized', updated_at = NOW() WHERE deposit_payment_intent_id = $1`,
                [intent.id]
            );
        } else if (event.type === 'payment_intent.payment_failed' && type === 'deposit') {
            await db.query(
                `UPDATE payments SET deposit_status = 'failed', updated_at = NOW() WHERE deposit_payment_intent_id = $1`,
                [intent.id]
            );
        }

        res.json({ received: true });
    } catch (error) {
        next(error);
    }
}
