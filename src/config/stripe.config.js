import Stripe from 'stripe';

let stripeClient;

// Lazy, igual que Firebase/SMTP: no queremos que el servidor no arranque solo porque
// la clave de Stripe no este configurada todavia.
export function getStripeClient() {
    if (!stripeClient) {
        stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return stripeClient;
}
