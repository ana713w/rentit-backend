import express from "express";
import morgan from "morgan";
import { corsMiddleware } from "./config/cors.config.js";
import routes from "./config/routes.config.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import createError from "http-errors";
import { loadSession } from "./config/session.config.js";
import { loadSessionUser } from "./middlewares/auth.middleware.js";
import { handleStripeWebhook } from "./controllers/payment.controller.js";


const app = express();

/* El webhook de Stripe necesita el body crudo para verificar la firma, antes de express.json() */
app.post('/api/v1/payments/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

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
