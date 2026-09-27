import { z } from 'zod';

const baseItemSchema = z.object({
    title: z.string().min(3, 'Title must be at least 3 characters long').max(150),
    description: z.string().max(2000).optional(),
    pricePerDay: z.number().positive('Price per day must be greater than 0'),
    depositAmount: z.number().positive('Deposit must be greater than 0'),
    category: z.string().min(1, 'Category is required').max(50),
});

export const createItemSchema = baseItemSchema.refine(
    (data) => data.depositAmount >= data.pricePerDay * 3 && data.depositAmount <= data.pricePerDay * 365,
    { message: 'Deposit must be between 3 and 365 times the price per day', path: ['depositAmount'] }
);

export const updateItemSchema = baseItemSchema.partial();
