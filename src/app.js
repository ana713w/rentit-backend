import express from "express";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { corsMiddleware } from "./config/cors.config.js";
import routes from "./config/routes.config.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import createError from "http-errors";
import { loadSession } from "./config/session.config.js";
import { loadSessionUser } from "./middlewares/auth.middleware.js";
import { handleStripeWebhook } from "./controllers/payment.controller.js";
import { openapiSpec } from "./docs/openapi.js";


const app = express();
app.set('trust proxy', 1);


/* Webhook de Stripe: necesita el body crudo */
app.post('/api/v1/payments/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

/* Middlewares */
app.use(corsMiddleware);
app.use(express.json());
app.use(morgan("dev"));
app.use(loadSession);
app.use(loadSessionUser);

/* Docs */
app.use("/api/v1/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

/* Rutas */
app.use("/api/v1", routes);
app.use((req, res, next) => next(createError(404, 'Endpoint not found')));

app.use(errorHandler);

export default app;
