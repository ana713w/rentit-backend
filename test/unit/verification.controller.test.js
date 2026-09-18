import { jest } from '@jest/globals';

const queryMock = jest.fn();
jest.unstable_mockModule('../../src/db/index.js', () => ({ db: { query: queryMock } }));
jest.unstable_mockModule('../../src/services/storage.service.js', () => ({
    uploadImage: jest.fn(),
    deleteFile: jest.fn(),
}));

const { createVerification } = await import('../../src/controllers/verification.controller.js');

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => {
    queryMock.mockReset();
});

describe('createVerification', () => {
    it('marks the reservation as completed when the check-out verification is created', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [{ id: 'res-1', status: 'confirmed', guest_id: 'guest-1', owner_id: 'owner-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'checkin-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'verif-1', reservation_id: 'res-1', verification_type: 'check_out' }] })
            .mockResolvedValueOnce({ rows: [] });

        const req = { params: { id: 'res-1' }, body: { verificationType: 'check_out' }, user: { id: 'guest-1' } };
        const res = mockRes();
        const next = jest.fn();

        await createVerification(req, res, next);

        expect(queryMock).toHaveBeenLastCalledWith(expect.stringContaining("status = 'completed'"), ['res-1']);
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('does not touch the reservation status for a check-in verification', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [{ id: 'res-1', status: 'confirmed', guest_id: 'guest-1', owner_id: 'owner-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'verif-1', reservation_id: 'res-1', verification_type: 'check_in' }] });

        const req = { params: { id: 'res-1' }, body: { verificationType: 'check_in' }, user: { id: 'guest-1' } };
        const res = mockRes();
        const next = jest.fn();

        await createVerification(req, res, next);

        expect(queryMock).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(201);
    });
});
