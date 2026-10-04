import createError from 'http-errors';
import { db } from '../db/index.js';
import {
    createConnectAccount,
    createOnboardingLink,
    getAccountStatus,
    createRentCheckoutSession,
    retrieveCheckoutSession,
    createDepositHold,
    captureDeposit,
    cancelDeposit,
    refundRentPayment,
    constructWebhookEvent,
} from '../services/stripe.service.js';
import { ensurePreparationOpen } from '../services/reservation-flow.service.js';

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
        `SELECT r.id, r.status, r.guest_id, r.price_per_day, r.deposit_amount, i.title AS item_title,
                to_char(lower(r.date_range), 'YYYY-MM-DD') AS start_date,
                to_char(upper(r.date_range), 'YYYY-MM-DD') AS end_date,
                i.owner_id, u.stripe_account_id AS owner_stripe_account_id
         FROM reservations r
         JOIN items i ON i.id = r.item_id
         JOIN users u ON u.id = i.owner_id
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
        ensurePreparationOpen(reservation.start_date);

        const { rows: existing } = await db.query('SELECT * FROM payments WHERE reservation_id = $1', [reservation.id]);
        let payment = existing[0];

        if (payment?.checkout_session_id && payment.rent_status !== 'succeeded') {
            const session = await retrieveCheckoutSession(payment.checkout_session_id);
            // sigue abierta: se vuelve a la misma pagina de pago
            if (session.status === 'open') {
                return res.json({ ...payment, checkoutUrl: session.url });
            }
            if (session.status === 'complete') payment = await completeCheckout(payment);
        }
        if (payment?.rent_status === 'succeeded') {
            return next(createError(409, 'This reservation is already paid'));
        }

        const nights = countNights(reservation.start_date, reservation.end_date);
        const rentAmount = Number(reservation.price_per_day) * nights;
        const platformFeeAmount = Math.round(rentAmount * PLATFORM_FEE_PERCENT) / 100;

        const session = await createRentCheckoutSession({
            reservationId: reservation.id,
            itemTitle: reservation.item_title,
            nights,
            rentAmount,
            depositAmount: reservation.deposit_amount,
            feePercent: PLATFORM_FEE_PERCENT,
            ownerStripeAccountId: reservation.owner_stripe_account_id,
            guestEmail: req.user.email,
        });

        // sesion caducada o pago antiguo sin completar: se reinicia la misma fila
        const { rows } = payment
            ? await db.query(
                `UPDATE payments
                 SET checkout_session_id = $1, rent_amount = $2, deposit_amount = $3, platform_fee_amount = $4,
                     rent_payment_intent_id = NULL, deposit_payment_intent_id = NULL,
                     rent_status = 'pending', deposit_status = 'pending', updated_at = NOW()
                 WHERE id = $5 RETURNING *`,
                [session.id, rentAmount, reservation.deposit_amount, platformFeeAmount, payment.id]
            )
            : await db.query(
                `INSERT INTO payments (reservation_id, rent_amount, deposit_amount, platform_fee_amount, checkout_session_id)
                 VALUES ($1,$2,$3,$4,$5)
                 RETURNING *`,
                [reservation.id, rentAmount, reservation.deposit_amount, platformFeeAmount, session.id]
            );

        res.status(201).json({ ...rows[0], checkoutUrl: session.url });
    } catch (error) {
        next(error);
    }
}

async function findPaymentById(paymentId) {
    const { rows } = await db.query('SELECT * FROM payments WHERE id = $1', [paymentId]);
    return rows[0];
}

// Al volver del Checkout (GET) o con el webhook checkout.session.completed:
// marca el alquiler como cobrado y retiene la fianza con la misma tarjeta
async function completeCheckout(payment) {
    const session = await retrieveCheckoutSession(payment.checkout_session_id);
    if (session.payment_status !== 'paid') return payment;

    const rentIntent = session.payment_intent;
    await db.query(
        `UPDATE payments SET rent_status = 'succeeded', rent_payment_intent_id = $1, updated_at = NOW()
         WHERE id = $2 AND rent_status IN ('pending', 'failed')`,
        [rentIntent.id, payment.id]
    );

    const current = await findPaymentById(payment.id);
    if (current.deposit_status !== 'pending') return current;

    const { rows: ownerRows } = await db.query(
        `SELECT u.stripe_account_id
         FROM reservations r JOIN items i ON i.id = r.item_id JOIN users u ON u.id = i.owner_id
         WHERE r.id = $1`,
        [payment.reservation_id]
    );

    let depositIntentId = null;
    let depositStatus = 'failed';
    try {
        const hold = await createDepositHold({
            amount: current.deposit_amount,
            ownerStripeAccountId: ownerRows[0].stripe_account_id,
            reservationId: payment.reservation_id,
            customerId: session.customer,
            paymentMethodId: rentIntent.payment_method,
            idempotencyKey: `deposit-hold-${payment.id}`,
        });
        depositIntentId = hold.id;
        if (hold.status === 'requires_capture') depositStatus = 'authorized';
    } catch (error) {
        // tarjeta rechazada para la fianza: queda como failed
        if (error.type !== 'StripeCardError') throw error;
        depositIntentId = error.payment_intent?.id ?? null;
    }

    await db.query(
        `UPDATE payments SET deposit_status = $1, deposit_payment_intent_id = $2, updated_at = NOW()
         WHERE id = $3 AND deposit_status = 'pending'`,
        [depositStatus, depositIntentId, payment.id]
    );
    return findPaymentById(payment.id);
}

export async function getReservationPayment(req, res, next) {
    try {
        const reservation = await loadReservationForPayment(req.params.id);
        if (reservation.guest_id !== req.user.id && reservation.owner_id !== req.user.id) {
            return next(createError(403, 'You are not part of this reservation'));
        }

        const { rows } = await db.query('SELECT * FROM payments WHERE reservation_id = $1', [reservation.id]);
        let payment = rows[0];
        if (!payment) return next(createError(404, 'No payment found for this reservation'));

        // respaldo del webhook: al volver de Stripe se completa aqui
        if (payment.checkout_session_id && (payment.rent_status === 'pending' || payment.deposit_status === 'pending')) {
            payment = await completeCheckout(payment);
        }
        res.json(payment);
    } catch (error) {
        next(error);
    }
}

async function findPaymentForOwner(paymentId, userId) {
    const { rows } = await db.query(
        `SELECT pay.*, i.owner_id
         FROM payments pay
         JOIN reservations r ON r.id = pay.reservation_id
         JOIN items i ON i.id = r.item_id
         WHERE pay.id = $1`,
        [paymentId]
    );
    const payment = rows[0];
    if (!payment) throw createError(404, 'Payment not found');
    if (payment.owner_id !== userId) throw createError(403, 'Only the item owner can manage this deposit');
    return payment;
}

// Reembolsa el alquiler y cancela el deposito al cancelar una reserva confirmada
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

// Captura o libera el deposito, tambien se usa al resolver disputas
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

        if (event.type === 'checkout.session.completed') {
            const { rows } = await db.query('SELECT * FROM payments WHERE checkout_session_id = $1', [intent.id]);
            if (rows[0]) await completeCheckout(rows[0]);
        } else if (event.type === 'payment_intent.succeeded' && type === 'rent') {
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
        } else if (event.type === 'payment_intent.canceled' && type === 'deposit') {
            // retencion caducada en Stripe; si la liberamos nosotros ya esta en released/canceled
            await db.query(
                `UPDATE payments SET deposit_status = 'canceled', updated_at = NOW()
                 WHERE deposit_payment_intent_id = $1 AND deposit_status IN ('pending', 'authorized')`,
                [intent.id]
            );
        }

        res.json({ received: true });
    } catch (error) {
        next(error);
    }
}
