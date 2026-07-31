import { z } from 'zod';

export const createVerificationSchema = z.object({
    verificationType: z.enum(['check_in', 'check_out']),
    notes: z.string().max(2000).optional(),
});

export const updateNotesSchema = z.object({
    notes: z.string().max(2000).optional(),
});
