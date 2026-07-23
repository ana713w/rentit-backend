import { z } from 'zod';

export const createContractSchema = z.object({
    contractType: z.enum(['rental', 'return']),
});

export const signContractSchema = z.object({
    otp: z.string().regex(/^\d{6}$/, 'OTP must be a 6-digit code'),
    accepted: z.boolean().refine((v) => v === true, { message: 'You must accept the contract terms' }),
});
