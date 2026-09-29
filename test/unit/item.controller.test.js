import { jest } from '@jest/globals';

const queryMock = jest.fn();
jest.unstable_mockModule('../../src/db/index.js', () => ({ db: { query: queryMock } }));

const { createItem, updateItem, listItems } = await import('../../src/controllers/item.controller.js');
const { listItemsQuerySchema } = await import('../../src/schemas/item.schema.js');

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

describe('listItems', () => {
    it('lists every active item when no coordinates are sent', async () => {
        queryMock.mockResolvedValueOnce({ rows: [{ id: 'item-1' }] });
        const res = mockRes();

        await listItems({ query: {} }, res, jest.fn());

        expect(queryMock).toHaveBeenCalledWith(expect.not.stringContaining('distance_km'));
        expect(res.json).toHaveBeenCalledWith([{ id: 'item-1' }]);
    });

    it('filters by distance to the owner with the default 5 km radius', async () => {
        queryMock.mockResolvedValueOnce({ rows: [{ id: 'item-1', distance_km: '1.20' }] });
        const res = mockRes();

        await listItems({ query: { lat: '40.4168', lng: '-3.7038' } }, res, jest.fn());

        const [sql, params] = queryMock.mock.calls[0];
        expect(sql).toContain('distance_km <= $3');
        expect(params).toEqual([40.4168, -3.7038, 5]);
        expect(res.json).toHaveBeenCalledWith([{ id: 'item-1', distance_km: '1.20' }]);
    });
});

describe('listItemsQuerySchema', () => {
    it('rejects a latitude without longitude', () => {
        expect(listItemsQuerySchema.safeParse({ lat: '40.4' }).success).toBe(false);
    });

    it('rejects coordinates out of range', () => {
        expect(listItemsQuerySchema.safeParse({ lat: '95', lng: '0' }).success).toBe(false);
    });

    it('accepts coordinates with a custom radius', () => {
        expect(listItemsQuerySchema.safeParse({ lat: '40.4', lng: '-3.7', radiusKm: '10' }).success).toBe(true);
    });
});
