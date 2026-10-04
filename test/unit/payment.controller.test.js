import { jest } from '@jest/globals';

const queryMock = jest.fn();
jest.unstable_mockModule('../../src/db/index.js', () => ({ db: { query: queryMock } }));

const stripeMocks = {
    createConnectAccount: jest.fn(),
    createOnboardingLink: jest.fn(),
    getAccountStatus: jest.fn(),
    createRentCheckoutSession: jest.fn(),
    retrieveCheckoutSession: jest.fn(),
    createDepositHold: jest.fn(),
    captureDeposit: jest.fn(),
    cancelDeposit: jest.fn(),
    refundRentPayment: jest.fn(),
    constructWebhookEvent: jest.fn(),
};
jest.unstable_mockModule('../../src/services/stripe.service.js', () => stripeMocks);

const {
    cancelPaymentsForReservation,
    captureDepositAmount,
    releaseDeposit,
    getReservationPayment,
    createReservationPayment,
} = await import('../../src/controllers/payment.controller.js');

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => {
    queryMock.mockReset();
    Object.values(stripeMocks).forEach((fn) => fn.mockReset());
});

describe('cancelPaymentsForReservation', () => {
    it('does nothing when there is no payment for the reservation', async () => {
        queryMock.mockResolvedValueOnce({ rows: [] });

        await cancelPaymentsForReservation('res-1');

        expect(stripeMocks.refundRentPayment).not.toHaveBeenCalled();
        expect(stripeMocks.cancelDeposit).not.toHaveBeenCalled();
    });

    it('refunds the rent and cancels the deposit when both are still active', async () => {
        queryMock.mockResolvedValueOnce({
            rows: [
                {
                    id: 'pay-1',
                    rent_status: 'succeeded',
                    rent_payment_intent_id: 'pi_rent',
                    deposit_status: 'authorized',
                    deposit_payment_intent_id: 'pi_deposit',
                },
            ],
        });
        queryMock.mockResolvedValue({ rows: [] });

        await cancelPaymentsForReservation('res-1');

        expect(stripeMocks.refundRentPayment).toHaveBeenCalledWith('pi_rent');
        expect(stripeMocks.cancelDeposit).toHaveBeenCalledWith('pi_deposit');
        expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("rent_status = 'refunded'"), ['pay-1']);
        expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("deposit_status = 'canceled'"), ['pay-1']);
    });

    it('leaves rent and deposit untouched when they are not in a cancellable state', async () => {
        queryMock.mockResolvedValueOnce({
            rows: [{ id: 'pay-1', rent_status: 'pending', deposit_status: 'pending' }],
        });

        await cancelPaymentsForReservation('res-1');

        expect(stripeMocks.refundRentPayment).not.toHaveBeenCalled();
        expect(stripeMocks.cancelDeposit).not.toHaveBeenCalled();
    });
});

describe('deposit capture/release requires a check-out verification', () => {
    it('rejects capture-deposit when no check_out verification exists', async () => {
        queryMock.mockResolvedValueOnce({ rows: [{ id: 'pay-1', reservation_id: 'res-1', owner_id: 'owner-1' }] });
        queryMock.mockResolvedValueOnce({ rows: [] });

        const req = { params: { id: 'pay-1' }, user: { id: 'owner-1' }, body: {} };
        const res = mockRes();
        const next = jest.fn();

        await captureDepositAmount(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
        expect(stripeMocks.captureDeposit).not.toHaveBeenCalled();
    });

    it('rejects release-deposit when no check_out verification exists', async () => {
        queryMock.mockResolvedValueOnce({ rows: [{ id: 'pay-1', reservation_id: 'res-1', owner_id: 'owner-1' }] });
        queryMock.mockResolvedValueOnce({ rows: [] });

        const req = { params: { id: 'pay-1' }, user: { id: 'owner-1' }, body: {} };
        const res = mockRes();
        const next = jest.fn();

        await releaseDeposit(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
        expect(stripeMocks.cancelDeposit).not.toHaveBeenCalled();
    });
});


describe('Stripe Checkout', () => {
    const reservation = {
        id: 'res-1',
        status: 'confirmed',
        guest_id: 'guest-1',
        owner_id: 'owner-1',
        owner_stripe_account_id: 'acct_owner',
        item_title: 'Taladro',
        price_per_day: '10.00',
        deposit_amount: '50.00',
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
    };
    const pendingPayment = {
        id: 'pay-1',
        reservation_id: 'res-1',
        checkout_session_id: 'cs_1',
        rent_status: 'pending',
        deposit_status: 'pending',
        deposit_amount: '50.00',
    };
    const paidSession = {
        status: 'complete',
        payment_status: 'paid',
        customer: 'cus_1',
        payment_intent: { id: 'pi_rent', payment_method: 'pm_card' },
    };

    const getAsGuest = async () => {
        const res = mockRes();
        const next = jest.fn();
        await getReservationPayment({ params: { id: 'res-1' }, user: { id: 'guest-1' } }, res, next);
        return { res, next };
    };

    it('creates a Checkout session and returns its URL', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [reservation] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [pendingPayment] });
        stripeMocks.createRentCheckoutSession.mockResolvedValueOnce({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' });

        const res = mockRes();
        await createReservationPayment({ params: { id: 'res-1' }, user: { id: 'guest-1', email: 'g@x.com' } }, res, jest.fn());

        expect(stripeMocks.createRentCheckoutSession).toHaveBeenCalledWith(
            expect.objectContaining({ rentAmount: 30, depositAmount: '50.00', guestEmail: 'g@x.com' })
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ checkoutUrl: 'https://checkout.stripe.com/c/cs_1' }));
    });

    it('reuses the Checkout session while it is still open', async () => {
        queryMock.mockResolvedValueOnce({ rows: [reservation] }).mockResolvedValueOnce({ rows: [pendingPayment] });
        stripeMocks.retrieveCheckoutSession.mockResolvedValueOnce({ status: 'open', url: 'https://checkout.stripe.com/c/cs_1' });

        const res = mockRes();
        await createReservationPayment({ params: { id: 'res-1' }, user: { id: 'guest-1' } }, res, jest.fn());

        expect(stripeMocks.createRentCheckoutSession).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ checkoutUrl: 'https://checkout.stripe.com/c/cs_1' }));
    });

    it('on return from Stripe marks the rent paid and holds the deposit on the same card', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [reservation] })
            .mockResolvedValueOnce({ rows: [pendingPayment] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ ...pendingPayment, rent_status: 'succeeded' }] })
            .mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_owner' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ ...pendingPayment, rent_status: 'succeeded', deposit_status: 'authorized' }] });
        stripeMocks.retrieveCheckoutSession.mockResolvedValueOnce(paidSession);
        stripeMocks.createDepositHold.mockResolvedValueOnce({ id: 'pi_deposit', status: 'requires_capture' });

        const { res } = await getAsGuest();

        expect(stripeMocks.createDepositHold).toHaveBeenCalledWith(
            expect.objectContaining({ customerId: 'cus_1', paymentMethodId: 'pm_card', idempotencyKey: 'deposit-hold-pay-1' })
        );
        expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('SET deposit_status = $1'), ['authorized', 'pi_deposit', 'pay-1']);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ rent_status: 'succeeded', deposit_status: 'authorized' }));
    });

    it('marks the deposit as failed when the card is declined for the hold', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [reservation] })
            .mockResolvedValueOnce({ rows: [pendingPayment] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ ...pendingPayment, rent_status: 'succeeded' }] })
            .mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_owner' }] })
            .mockResolvedValue({ rows: [{ ...pendingPayment, rent_status: 'succeeded', deposit_status: 'failed' }] });
        stripeMocks.retrieveCheckoutSession.mockResolvedValueOnce(paidSession);
        stripeMocks.createDepositHold.mockRejectedValueOnce({ type: 'StripeCardError', payment_intent: { id: 'pi_deposit' } });

        await getAsGuest();

        expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('SET deposit_status = $1'), ['failed', 'pi_deposit', 'pay-1']);
    });

    it('does nothing while the Checkout has not been paid', async () => {
        queryMock.mockResolvedValueOnce({ rows: [reservation] }).mockResolvedValueOnce({ rows: [pendingPayment] });
        stripeMocks.retrieveCheckoutSession.mockResolvedValueOnce({ status: 'open', payment_status: 'unpaid' });

        const { res } = await getAsGuest();

        expect(stripeMocks.createDepositHold).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(pendingPayment);
    });
});
