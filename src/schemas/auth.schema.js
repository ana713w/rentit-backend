import { z } from 'zod';

// Direccion de recogida y devolucion
const address = z.string().trim().min(5, 'Address must be at least 5 characters long').max(255);
const addressFields = {
    address: address.optional(),
    // null borra la ubicacion guardada
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
};

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
    // obligatorios: el telefono y la direccion se comparten al aceptar una reserva
    phone: z
        .string()
        .trim()
        .min(1, 'Phone is required')
        .max(30, 'Phone must be at most 30 characters')
        .regex(/^\+?[0-9\s()-]{6,}$/, 'Invalid phone number'),
    ...addressFields,
    address,
});

export const updateMeSchema = z.object({
    fullName: z
        .string()
        .min(1, 'Full name is required')
        .max(150, 'Full name must be at most 150 characters')
        .optional(),
    phone: z
        .string()
        .max(30, 'Phone must be at most 30 characters')
        .optional(),
    ...addressFields,
});

export const loginSchema = z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(1, 'Password is required'),
});
