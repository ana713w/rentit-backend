import { jest } from '@jest/globals';

const queryMock = jest.fn();
jest.unstable_mockModule('../../src/db/index.js', () => ({ db: { query: queryMock } }));

const { createProperty, updateProperty } = await import('../../src/controllers/property.controller.js');

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => {
    queryMock.mockReset();
});

describe('createProperty', () => {
    it('returns 400 when the database rejects an invalid deposit/price ratio', async () => {
        const error = new Error('check constraint violated');
        error.code = '23514';
        queryMock.mockRejectedValueOnce(error);

        const req = {
            body: { title: 'A house', address: 'Somewhere 123', pricePerDay: 10, depositAmount: 5, propertyType: 'house' },
            user: { id: 'owner-1' },
        };
        const res = mockRes();
        const next = jest.fn();

        await createProperty(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    });
});

describe('updateProperty', () => {
    it('rejects a partial update that breaks the deposit/price ratio against the stored property', async () => {
        queryMock.mockResolvedValueOnce({
            rows: [
                {
                    id: 'prop-1',
                    owner_id: 'owner-1',
                    title: 'A',
                    description: null,
                    address: 'B',
                    latitude: null,
                    longitude: null,
                    price_per_day: 100,
                    deposit_amount: 300,
                    property_type: 'house',
                },
            ],
        });

        const req = { params: { id: 'prop-1' }, user: { id: 'owner-1' }, body: { pricePerDay: 500 } };
        const res = mockRes();
        const next = jest.fn();

        await updateProperty(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
        expect(queryMock).toHaveBeenCalledTimes(1);
    });
});
