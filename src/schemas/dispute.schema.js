import { z } from 'zod';

export const createDisputeSchema = z.object({
    reason: z.string().min(10, 'Reason must be at least 10 characters long').max(2000),
    requestedCaptureAmount: z.number().positive().optional(),
});

export const resolveDisputeSchema = z.object({
    resolution: z.string().min(10, 'Resolution must be at least 10 characters long').max(2000),
    depositAction: z.enum(['capture', 'release', 'none']).default('none'),
    captureAmount: z.number().positive().optional(),
});
