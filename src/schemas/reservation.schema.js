import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

// Stripe retiene la fianza unos 7 dias, eso limita la duracion
export const MAX_RENTAL_DAYS = Number(process.env.MAX_RENTAL_DAYS || 6);

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (start, end) => Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS);
const todayIso = () => new Date().toISOString().slice(0, 10);

export const createReservationSchema = z.object({
    itemId: z.string().uuid(),
    startDate: isoDate,
    endDate: isoDate,
}).refine((data) => data.startDate < data.endDate, {
    message: 'endDate must be after startDate',
    path: ['endDate'],
}).refine((data) => data.startDate >= todayIso(), {
    message: 'startDate cannot be in the past',
    path: ['startDate'],
}).refine((data) => daysBetween(data.startDate, data.endDate) <= MAX_RENTAL_DAYS, {
    message: `A rental can last at most ${MAX_RENTAL_DAYS} days (the deposit can only be held for about 7 days)`,
    path: ['endDate'],
});
