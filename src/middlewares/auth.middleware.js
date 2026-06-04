import createError from "http-errors";
import { db } from "../db/index.js";

export async function loadSessionUser(req, res, next) {
  const { userId } = req.session;

  if (!userId) {
    req.user = undefined;
    return next();
  }

  try {
    const { rows } = await db.query(
      "SELECT id, email, full_name, phone FROM users WHERE id = $1",
      [userId]
    );
    req.user = rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

export function isAuthenticated(req, res, next) {
  if (req.user) {
    next();
  } else {
    next(createError(401, "Unauthorized, missing credentials"));
  }
}
