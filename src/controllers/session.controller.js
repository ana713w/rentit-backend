import bcrypt from 'bcrypt';
import createError from 'http-errors';
import { db } from '../db/index.js';

export async function login(req, res, next) {
    try {
        const { email, password } = req.body;

        const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = rows[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return next(createError(401, 'Invalid credentials'));
        }

        req.session.userId = user.id;

        const { rows: adminRows } = await db.query('SELECT 1 FROM admins WHERE user_id = $1', [user.id]);

        const { password_hash, stripe_account_id, ...safeUser } = user;
        res.json({ ...safeUser, isAdmin: adminRows.length > 0 });
    } catch (error) {
        next(error);
    }
}

export function logout(req, res, next) {
    req.session.destroy((error) => {
        if (error) return next(error);
        res.status(204).send();
    });
}
