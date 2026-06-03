import expressSession from "express-session";
import connectPgSimple from "connect-pg-simple";
import { db } from "../db/index.js";

const PgSession = connectPgSimple(expressSession);

const sessionMaxDays = parseInt(process.env.SESSION_MAX_DAYS || "1");

export const loadSession = expressSession({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.SESSION_SECURE === "true",
    maxAge: sessionMaxDays * 24 * 60 * 60 * 1000,
  },
  store: new PgSession({
    pool: db,
    tableName: "session",
    createTableIfMissing: true,
  }),
});
