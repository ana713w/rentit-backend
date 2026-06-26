import { z } from 'zod';

const basePropertySchema = z.object({
    title: z.string().min(3, 'Title must be at least 3 characters long').max(150),
    description: z.string().max(2000).optional(),
    address: z.string().min(5, 'Address is required').max(255),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    pricePerDay: z.number().positive('Price per day must be greater than 0'),
    depositAmount: z.number().positive('Deposit must be greater than 0'),
    propertyType: z.string().min(1, 'Property type is required').max(50),
});

export const createPropertySchema = basePropertySchema.refine(
    (data) => data.depositAmount >= data.pricePerDay * 3 && data.depositAmount <= data.pricePerDay * 365,
    { message: 'Deposit must be between 3 and 365 times the price per day', path: ['depositAmount'] }
);

export const updatePropertySchema = basePropertySchema.partial();
