import { getStripeClient } from '../config/stripe.config.js';

const toCents = (amount) => Math.round(Number(amount) * 100);

export async function createConnectAccount(email) {
    const stripe = getStripeClient();
    const account = await stripe.accounts.create({
        type: 'express',
        email,
        capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
        },
    });
    return account.id;
}

export async function createOnboardingLink(accountId) {
    const stripe = getStripeClient();
    const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${process.env.CLIENT_URL}/stripe/onboarding/refresh`,
        return_url: `${process.env.CLIENT_URL}/stripe/onboarding/complete`,
        type: 'account_onboarding',
    });
    return link.url;
}

export async function getAccountStatus(accountId) {
    const stripe = getStripeClient();
    const account = await stripe.accounts.retrieve(accountId);
    return {
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
    };
}

// Se cobra al completo y se transfiere al dueño de inmediato, descontando la comision de la plataforma
export async function createRentPaymentIntent({ amount, ownerStripeAccountId, feePercent, reservationId }) {
    const stripe = getStripeClient();
    const amountInCents = toCents(amount);
    const applicationFeeAmount = Math.round((amountInCents * feePercent) / 100);

    return stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'eur',
        capture_method: 'automatic',
        application_fee_amount: applicationFeeAmount,
        transfer_data: { destination: ownerStripeAccountId },
        metadata: { reservationId, type: 'rent' },
    });
}

// Se autoriza (retiene) pero NO se cobra hasta que se capture explicitamente, total o parcialmente
export async function createDepositPaymentIntent({ amount, ownerStripeAccountId, reservationId }) {
    const stripe = getStripeClient();
    return stripe.paymentIntents.create({
        amount: toCents(amount),
        currency: 'eur',
        capture_method: 'manual',
        transfer_data: { destination: ownerStripeAccountId },
        metadata: { reservationId, type: 'deposit' },
    });
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
