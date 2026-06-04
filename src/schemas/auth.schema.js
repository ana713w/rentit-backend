import { z } from 'zod';

export const registerSchema = z.object({
    email: z
        .string()
        .email('El email no es válido')
        .max(255, 'El email debe tener máximo 255 caracteres'),
    password: z
        .string()
        .min(8, 'La contraseña debe tener al menos 8 caracteres')
        .regex(/[A-Z]/, 'La contraseña debe contener al menos una mayúscula')
        .regex(/[0-9]/, 'La contraseña debe contener al menos un número'),
    fullName: z
        .string()
        .min(1, 'El nombre completo es obligatorio')
        .max(150, 'El nombre completo debe tener máximo 150 caracteres'),
    phone: z
        .string()
        .max(30, 'El teléfono debe tener máximo 30 caracteres')
        .optional(),
});

export const loginSchema = z.object({
    email: z.string().email('El email no es válido'),
    password: z.string().min(1, 'La contraseña es obligatoria'),
});
