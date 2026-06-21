import express from "express";
import morgan from "morgan";
import { corsMiddleware } from "./config/cors.config.js";
import routes from "./config/routes.config.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import createError from "http-errors";
import { loadSession } from "./config/session.config.js";
import { loadSessionUser } from "./middlewares/auth.middleware.js";


const app = express();

/* Middlewares */
app.use(corsMiddleware);
app.use(express.json());
app.use(morgan("dev"));
app.use(loadSession);
app.use(loadSessionUser);

/* API Routes Configuration */
app.use("/api/v1", routes);
app.use((req, res, next) => next(createError(404, 'Endpoint not found')));

app.use(errorHandler);

export default app;
