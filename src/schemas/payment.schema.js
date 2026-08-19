import { z } from 'zod';

export const captureDepositSchema = z.object({
    amountToCapture: z.number().positive().optional(),
});
