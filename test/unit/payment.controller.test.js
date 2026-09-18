import { jest } from '@jest/globals';

const queryMock = jest.fn();
jest.unstable_mockModule('../../src/db/index.js', () => ({ db: { query: queryMock } }));

const stripeMocks = {
    createConnectAccount: jest.fn(),
    createOnboardingLink: jest.fn(),
    getAccountStatus: jest.fn(),
    createRentPaymentIntent: jest.fn(),
    createDepositPaymentIntent: jest.fn(),
    captureDeposit: jest.fn(),
    cancelDeposit: jest.fn(),
    refundRentPayment: jest.fn(),
    constructWebhookEvent: jest.fn(),
};
jest.unstable_mockModule('../../src/services/stripe.service.js', () => stripeMocks);

const { cancelPaymentsForReservation, captureDepositAmount, releaseDeposit } = await import(
    '../../src/controllers/payment.controller.js'
);

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
