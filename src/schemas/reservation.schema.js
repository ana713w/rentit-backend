import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

export const createReservationSchema = z.object({
    propertyId: z.string().uuid(),
    startDate: isoDate,
    endDate: isoDate,
}).refine((data) => data.startDate < data.endDate, {
    message: 'endDate must be after startDate',
    path: ['endDate'],
});
