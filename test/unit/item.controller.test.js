import { jest } from '@jest/globals';

const queryMock = jest.fn();
jest.unstable_mockModule('../../src/db/index.js', () => ({ db: { query: queryMock } }));

const { createItem, updateItem } = await import('../../src/controllers/item.controller.js');

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => {
    queryMock.mockReset();
});

describe('createItem', () => {
    it('returns 400 when the database rejects an invalid deposit/price ratio', async () => {
        const error = new Error('check constraint violated');
        error.code = '23514';
        queryMock.mockRejectedValueOnce(error);

        const req = {
            body: { title: 'Taladro percutor', pricePerDay: 10, depositAmount: 5, category: 'tools' },
            user: { id: 'owner-1', address: 'Somewhere 123' },
        };
        const res = mockRes();
        const next = jest.fn();

        await createItem(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
        expect(queryMock).toHaveBeenCalledTimes(1);
    });

    it('returns 400 without touching the database when the owner has no address', async () => {
        const req = {
            body: { title: 'Taladro percutor', pricePerDay: 10, depositAmount: 30, category: 'tools' },
            user: { id: 'owner-1', address: null },
        };
        const res = mockRes();
        const next = jest.fn();

        await createItem(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
        expect(queryMock).not.toHaveBeenCalled();
    });
});

describe('updateItem', () => {
    it('rejects a partial update that breaks the deposit/price ratio against the stored item', async () => {
        queryMock.mockResolvedValueOnce({
            rows: [
                {
                    id: 'item-1',
                    owner_id: 'owner-1',
                    title: 'A',
                    description: null,
                    price_per_day: 100,
                    deposit_amount: 300,
                    category: 'tools',
                },
            ],
        });

        const req = { params: { id: 'item-1' }, user: { id: 'owner-1' }, body: { pricePerDay: 500 } };
        const res = mockRes();
        const next = jest.fn();

        await updateItem(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
        expect(queryMock).toHaveBeenCalledTimes(1);
    });
});
