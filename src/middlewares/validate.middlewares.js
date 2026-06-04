import { z } from 'zod';

export function validate(schema, source = 'body') {
    return (req, res, next) => {
        const result = schema.safeParse(req[source]);
        if (!result.success) {
            const errores = result.error.flatten().fieldErrors;
            return res.status(400).json({
                error: 'Validation error',
                details: errores
            });
        }
        next();
    };
}
