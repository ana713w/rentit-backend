import { jest } from '@jest/globals';

const queryMock = jest.fn();
jest.unstable_mockModule('../../src/db/index.js', () => ({ db: { query: queryMock } }));

const { preparationOpensOn, ensurePreparationOpen } = await import('../../src/services/reservation-flow.service.js');

const isoInDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('payment window', () => {
    it('opens one day before pickup', () => {
        expect(preparationOpensOn('2026-10-10')).toBe('2026-10-09');
        expect(preparationOpensOn('2026-11-01')).toBe('2026-10-31');
    });

    it('rejects paying earlier than one day before pickup', () => {
        expect(() => ensurePreparationOpen(isoInDays(6))).toThrow(expect.objectContaining({ status: 409 }));
    });

    it('allows paying the day before and the day of pickup', () => {
        expect(() => ensurePreparationOpen(isoInDays(1))).not.toThrow();
        expect(() => ensurePreparationOpen(isoInDays(0))).not.toThrow();
    });
});
