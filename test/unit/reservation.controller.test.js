import { jest } from '@jest/globals';

const queryMock = jest.fn();
jest.unstable_mockModule('../../src/db/index.js', () => ({ db: { query: queryMock } }));

const cancelPaymentsForReservationMock = jest.fn();
jest.unstable_mockModule('../../src/controllers/payment.controller.js', () => ({
    cancelPaymentsForReservation: cancelPaymentsForReservationMock,
}));

const { cancelReservation, getReservation } = await import('../../src/controllers/reservation.controller.js');
const { createReservationSchema, MAX_RENTAL_DAYS } = await import('../../src/schemas/reservation.schema.js');

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

describe('getReservation', () => {
    const base = { id: 'res-1', guest_id: 'guest-1', owner_id: 'owner-1' };

    it('shares the owner contact and pickup address with the guest once confirmed', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [{ ...base, status: 'confirmed' }] })
            .mockResolvedValueOnce({ rows: [{ full_name: 'Marta Ruiz', email: 'marta@example.com', phone: '600', address: 'Calle Mayor 1' }] });
        const res = mockRes();

        await getReservation({ params: { id: 'res-1' }, user: { id: 'guest-1' } }, res, jest.fn());

        expect(queryMock.mock.calls[1][1]).toEqual(['owner-1']);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            counterpart: { role: 'owner', fullName: 'Marta Ruiz', email: 'marta@example.com', phone: '600', pickupAddress: 'Calle Mayor 1' },
        }));
    });

    it('shares the guest contact (without address) with the owner', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [{ ...base, status: 'completed' }] })
            .mockResolvedValueOnce({ rows: [{ full_name: 'Javier López', email: 'javier@example.com', phone: '611', address: 'Otra calle 2' }] });
        const res = mockRes();

        await getReservation({ params: { id: 'res-1' }, user: { id: 'owner-1' } }, res, jest.fn());

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            counterpart: expect.objectContaining({ role: 'guest', fullName: 'Javier López', pickupAddress: null }),
        }));
    });

    it('does not share contact data while the reservation is pending', async () => {
        queryMock.mockResolvedValueOnce({ rows: [{ ...base, status: 'pending' }] });
        const res = mockRes();

        await getReservation({ params: { id: 'res-1' }, user: { id: 'guest-1' } }, res, jest.fn());

        expect(queryMock).toHaveBeenCalledTimes(1);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ counterpart: null }));
    });
});

describe('createReservationSchema', () => {
    const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
    const itemId = '3f0c1a2b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

    it('accepts a rental of up to MAX_RENTAL_DAYS days', () => {
        expect(createReservationSchema.safeParse({ itemId, startDate: iso(2), endDate: iso(2 + MAX_RENTAL_DAYS) }).success).toBe(true);
    });

    it('rejects rentals longer than the deposit can be held', () => {
        const result = createReservationSchema.safeParse({ itemId, startDate: iso(2), endDate: iso(3 + MAX_RENTAL_DAYS) });
        expect(result.success).toBe(false);
        expect(result.error.flatten().fieldErrors.endDate).toBeDefined();
    });

    it('rejects a start date in the past', () => {
        const result = createReservationSchema.safeParse({ itemId, startDate: iso(-2), endDate: iso(1) });
        expect(result.success).toBe(false);
        expect(result.error.flatten().fieldErrors.startDate).toBeDefined();
    });
});
