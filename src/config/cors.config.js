import cors from "cors";

const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim());

export const corsMiddleware = cors({
  origin: CORS_ORIGINS,
  credentials: true,
});
