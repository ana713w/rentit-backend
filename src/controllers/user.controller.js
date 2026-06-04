import bcrypt from 'bcrypt';
import createError from 'http-errors';
import { db } from '../db/index.js';

const PASSWORD_SALT_ROUNDS = 12;

export async function register(req, res, next) {
    try {
        const { email, password, fullName, phone } = req.body;

        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return next(createError(409, 'El email ya está registrado'));
        }

        const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

        const { rows } = await db.query(
            `INSERT INTO users (email, password_hash, full_name, phone)
             VALUES ($1, $2, $3, $4)
             RETURNING id, email, full_name, phone, created_at`,
            [email, passwordHash, fullName, phone ?? null]
        );

        res.status(201).json(rows[0]);
    } catch (error) {
        next(error);
    }
}
