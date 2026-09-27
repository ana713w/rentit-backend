import bcrypt from 'bcrypt';
import createError from 'http-errors';
import { db } from '../db/index.js';

const PASSWORD_SALT_ROUNDS = 12;

export async function register(req, res, next) {
    try {
        const { email, password, fullName, phone, address, latitude, longitude } = req.body;

        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return next(createError(409, 'Email already registered'));
        }

        const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

        const { rows } = await db.query(
            `INSERT INTO users (email, password_hash, full_name, phone, address, latitude, longitude)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, email, full_name, phone, address, latitude, longitude, created_at`,
            [email, passwordHash, fullName, phone ?? null, address ?? null, latitude ?? null, longitude ?? null]
        );

        res.status(201).json(rows[0]);
    } catch (error) {
        next(error);
    }
}

export async function getMe(req, res, next) {
    try {
        const { rows } = await db.query('SELECT 1 FROM admins WHERE user_id = $1', [req.user.id]);
        const { stripe_account_id, ...safeUser } = req.user;
        res.json({ ...safeUser, isAdmin: rows.length > 0 });
    } catch (error) {
        next(error);
    }
}

export async function updateMe(req, res, next) {
    try {
        const {
            fullName = req.user.full_name,
            phone = req.user.phone,
            address = req.user.address,
            latitude = req.user.latitude,
            longitude = req.user.longitude,
        } = req.body;

        const { rows } = await db.query(
            `UPDATE users
             SET full_name = $1, phone = $2, address = $3, latitude = $4, longitude = $5, updated_at = NOW()
             WHERE id = $6
             RETURNING id, email, full_name, phone, address, latitude, longitude, created_at, updated_at`,
            [fullName, phone, address, latitude, longitude, req.user.id]
        );

        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
}
