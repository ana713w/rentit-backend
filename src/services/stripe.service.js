import { getStripeClient } from '../config/stripe.config.js';

const toCents = (amount) => Math.round(Number(amount) * 100);

// Accounts v2: los cobros son destination charges sin on_behalf_of, asi que el dueño solo necesita
// la configuracion "recipient" (recibir transferencias); la plataforma es el merchant of record
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

// Se mantienen los nombres de campo de v1 para no romper el frontend
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
