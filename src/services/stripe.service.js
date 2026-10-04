import { getStripeClient } from '../config/stripe.config.js';

const toCents = (amount) => Math.round(Number(amount) * 100);

// Destination charges: el dueño solo necesita la config "recipient"
export async function createConnectAccount(email) {
    const stripe = getStripeClient();
    const account = await stripe.v2.core.accounts.create({
        contact_email: email,
        dashboard: 'express',
        identity: { country: 'es' },
        defaults: {
            currency: 'eur',
            responsibilities: { fees_collector: 'application', losses_collector: 'application' },
        },
        configuration: {
            recipient: {
                capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
            },
        },
    });
    return account.id;
}

export async function createOnboardingLink(accountId) {
    const stripe = getStripeClient();
    const link = await stripe.v2.core.accountLinks.create({
        account: accountId,
        use_case: {
            type: 'account_onboarding',
            account_onboarding: {
                configurations: ['recipient'],
                refresh_url: `${process.env.CLIENT_URL}/stripe/onboarding/refresh`,
                return_url: `${process.env.CLIENT_URL}/stripe/onboarding/complete`,
            },
        },
    });
    return link.url;
}

const OUTSTANDING = ['currently_due', 'past_due'];

// Mismos campos que v1 para el frontend
export async function getAccountStatus(accountId) {
    const stripe = getStripeClient();
    const account = await stripe.v2.core.accounts.retrieve(accountId, {
        include: ['configuration.recipient', 'requirements'],
    });
    const balance = account.configuration?.recipient?.capabilities?.stripe_balance;
    const pendingUserAction = (account.requirements?.entries ?? []).some(
        (entry) => entry.awaiting_action_from === 'user' && OUTSTANDING.includes(entry.minimum_deadline?.status)
    );
    return {
        chargesEnabled: balance?.stripe_transfers?.status === 'active',
        payoutsEnabled: balance?.payouts?.status === 'active',
        detailsSubmitted: !pendingUserAction,
    };
}

// Pagina de pago de Stripe (Checkout) para el alquiler
// Destination charge: va al dueño menos la comision
// setup_future_usage guarda la tarjeta para retener despues la fianza
export async function createRentCheckoutSession({
    reservationId,
    itemTitle,
    nights,
    rentAmount,
    depositAmount,
    feePercent,
    ownerStripeAccountId,
    guestEmail,
}) {
    const stripe = getStripeClient();
    const amountInCents = toCents(rentAmount);
    const reservationUrl = `${process.env.CLIENT_URL}/reservations/${reservationId}`;

    return stripe.checkout.sessions.create({
        mode: 'payment',
        locale: 'es',
        customer_creation: 'always',
        customer_email: guestEmail,
        line_items: [
            {
                quantity: 1,
                price_data: {
                    currency: 'eur',
                    unit_amount: amountInCents,
                    product_data: {
                        name: `Alquiler: ${itemTitle}`,
                        description: `${nights} ${nights === 1 ? 'día' : 'días'} de alquiler en RentIt`,
                    },
                },
            },
        ],
        payment_intent_data: {
            application_fee_amount: Math.round((amountInCents * feePercent) / 100),
            transfer_data: { destination: ownerStripeAccountId },
            setup_future_usage: 'off_session',
            metadata: { reservationId, type: 'rent' },
        },
        custom_text: {
            submit: {
                message: `Además se retendrá una fianza de ${Number(depositAmount).toFixed(2)} € en esta tarjeta. No se cobra: se libera tras la devolución si el objeto está bien.`,
            },
        },
        metadata: { reservationId },
        success_url: `${reservationUrl}?payment=success`,
        cancel_url: `${reservationUrl}?payment=cancelled`,
    });
}

export async function retrieveCheckoutSession(sessionId) {
    const stripe = getStripeClient();
    return stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
}

// Fianza: solo se autoriza (captura manual) con la tarjeta guardada en el Checkout
// idempotencyKey evita retenerla dos veces si webhook y frontend llegan a la vez
export async function createDepositHold({ amount, ownerStripeAccountId, reservationId, customerId, paymentMethodId, idempotencyKey }) {
    const stripe = getStripeClient();
    return stripe.paymentIntents.create(
        {
            amount: toCents(amount),
            currency: 'eur',
            capture_method: 'manual',
            customer: customerId,
            payment_method: paymentMethodId,
            off_session: true,
            confirm: true,
            transfer_data: { destination: ownerStripeAccountId },
            metadata: { reservationId, type: 'deposit' },
        },
        { idempotencyKey }
    );
}

export async function captureDeposit(paymentIntentId, amountToCapture) {
    const stripe = getStripeClient();
    const params = {};
    if (amountToCapture != null) params.amount_to_capture = toCents(amountToCapture);
    return stripe.paymentIntents.capture(paymentIntentId, params);
}

export async function cancelDeposit(paymentIntentId) {
    const stripe = getStripeClient();
    return stripe.paymentIntents.cancel(paymentIntentId);
}

export async function refundRentPayment(paymentIntentId) {
    const stripe = getStripeClient();
    return stripe.refunds.create({ payment_intent: paymentIntentId });
}

export function constructWebhookEvent(rawBody, signature) {
    const stripe = getStripeClient();
    return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}
