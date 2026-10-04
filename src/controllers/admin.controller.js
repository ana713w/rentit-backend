import createHttpError from "http-errors";
import { db } from "../db/index.js";

export async function promoteToAdmin(req, res, next) {
    try {
        const { email } = req.body;

        // busca el usuario por email, sin distinguir mayusculas
        const user = await db.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [email]);
        if (user.rows.length === 0) {
            return next(createHttpError(404, "User not found"));
        }
        const userId = user.rows[0].id;

        const { rows } = await db.query("SELECT * FROM admins WHERE user_id = $1", [userId]);
        if (rows.length > 0) {
            return next(createHttpError(400, "User is already an admin"));
        }

        await db.query("INSERT INTO admins (user_id) VALUES ($1)", [userId]);

        res.status(201).json({ message: "User promoted to admin successfully" });

    } catch (error) {
        next(error);
    }
}
