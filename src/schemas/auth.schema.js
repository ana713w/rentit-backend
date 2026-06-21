import { z } from 'zod';

export const registerSchema = z.object({
    email: z
        .string()
        .email('Invalid email')
        .max(255, 'Email must be at most 255 characters'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters long')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
    fullName: z
        .string()
        .min(1, 'Full name is required')
        .max(150, 'Full name must be at most 150 characters'),
    phone: z
        .string()
        .max(30, 'Phone must be at most 30 characters')
        .optional(),
});

export const loginSchema = z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(1, 'Password is required'),
});
