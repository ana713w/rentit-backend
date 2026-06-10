import createHttpError from "http-errors";
import { db } from "../db/index.js";

export async function promoteToAdmin(req, res, next) {
    try {
        const { userId } = req.body;

        // Check if the user exists
        const user = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (user.rows.length === 0) {
            return next(createHttpError(404, "User not found"));
        }

        const { rows } = await db.query("SELECT * FROM admins WHERE user_id = $1", [userId]);
        if (rows.length > 0) {
            return next(createHttpError(400, "User is already an admin"));
        }

        res.status(201).json({ message: "User promoted to admin successfully" });

    } catch (error) {
        next(error);
    }
}