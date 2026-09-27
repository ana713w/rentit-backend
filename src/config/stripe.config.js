import Stripe from 'stripe';

let stripeClient;

export function getStripeClient() {
    if (!stripeClient) {
        stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return stripeClient;
}
