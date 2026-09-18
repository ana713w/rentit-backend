import { jest } from '@jest/globals';

const queryMock = jest.fn();
jest.unstable_mockModule('../../src/db/index.js', () => ({ db: { query: queryMock } }));

const cancelPaymentsForReservationMock = jest.fn();
jest.unstable_mockModule('../../src/controllers/payment.controller.js', () => ({
    cancelPaymentsForReservation: cancelPaymentsForReservationMock,
}));

const { cancelReservation } = await import('../../src/controllers/reservation.controller.js');

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => {
    queryMock.mockReset();
    cancelPaymentsForReservationMock.mockReset();
});

describe('cancelReservation', () => {
    it('cancels payments when a confirmed reservation is cancelled', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [{ id: 'res-1', guest_id: 'guest-1', owner_id: 'owner-1', status: 'confirmed' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'res-1', status: 'cancelled' }] });

        const req = { params: { id: 'res-1' }, user: { id: 'guest-1' } };
        const res = mockRes();
        const next = jest.fn();

        await cancelReservation(req, res, next);

        expect(cancelPaymentsForReservationMock).toHaveBeenCalledWith('res-1');
        expect(res.json).toHaveBeenCalledWith({ id: 'res-1', status: 'cancelled' });
    });

    it('does not touch payments when cancelling a still-pending reservation', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [{ id: 'res-1', guest_id: 'guest-1', owner_id: 'owner-1', status: 'pending' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'res-1', status: 'cancelled' }] });

        const req = { params: { id: 'res-1' }, user: { id: 'guest-1' } };
        const res = mockRes();
        const next = jest.fn();

        await cancelReservation(req, res, next);

        expect(cancelPaymentsForReservationMock).not.toHaveBeenCalled();
    });

    it('rejects cancelling a reservation that already finished', async () => {
        queryMock.mockResolvedValueOnce({
            rows: [{ id: 'res-1', guest_id: 'guest-1', owner_id: 'owner-1', status: 'completed' }],
        });

        const req = { params: { id: 'res-1' }, user: { id: 'guest-1' } };
        const res = mockRes();
        const next = jest.fn();

        await cancelReservation(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
        expect(cancelPaymentsForReservationMock).not.toHaveBeenCalled();
    });
});
