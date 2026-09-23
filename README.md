# RentIt Backend

API REST para el alquiler de propiedades entre particulares: solicitud y aprobación de reservas por
parte del propietario, contratos firmados digitalmente (checkbox + OTP por email), verificaciones de
check-in/check-out con fotos, pagos con Stripe Connect (alquiler + depósito de garantía) y disputas
resueltas por un administrador.

## Stack

- Node.js + Express 5, ES Modules
- PostgreSQL (`pg`), sesiones en `express-session` + `connect-pg-simple`
- Zod para validación de entrada
- Stripe Connect Express (pagos y depósitos)
- Firebase Storage (imágenes de propiedades, fotos de verificación, PDFs de contrato)
- Jest + Supertest (tests)

## Requisitos

- Node.js 20+
- PostgreSQL 13+ (usa `gen_random_uuid()` y `EXCLUDE USING gist`, requiere las extensiones
  `pgcrypto` y `btree_gist`, que el propio script de schema crea si no existen)
- Una cuenta de Stripe (modo test sirve) con Connect habilitado
- Un proyecto de Firebase con Storage en plan Blaze

## Configuración

1. Copia `.env.example` a `.env` y rellena los valores:

   ```
   cp .env.example .env
   ```

   - `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME`: conexión a Postgres.
   - `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` / `FIREBASE_STORAGE_BUCKET`:
     credenciales de una service account de Firebase con acceso a Storage.
   - `SMTP_*`: servidor usado para enviar los OTP de firma de contrato.
   - `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `PLATFORM_FEE_PERCENT`: configuración de Stripe Connect.
   - `SESSION_SECRET`: cualquier cadena aleatoria larga.

2. Instala las dependencias:

   ```
   npm install
   ```

3. Aplica el schema a tu base de datos:

   ```
   npm run migrate
   ```

   Esto ejecuta [db/schema.sql](db/schema.sql), que usa `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`,
   así que es seguro volver a ejecutarlo tras añadir columnas nuevas. No hay migraciones versionadas: el
   script completo es la única fuente de verdad del schema.

4. Arranca el servidor:

   ```
   npm run dev    # con reinicio automático
   npm start      # modo normal
   ```

   La API queda disponible en `http://localhost:3000/api/v1`.

## Webhooks de Stripe

`POST /api/v1/payments/webhook` necesita el body crudo para verificar la firma (por eso está montado
antes de `express.json()` en [src/app.js](src/app.js)). En desarrollo, reenvía los eventos con la Stripe CLI:

```
stripe listen --forward-to localhost:3000/api/v1/payments/webhook
```

y usa el `whsec_...` que te da como `STRIPE_WEBHOOK_SECRET`.

## Documentación de la API

Con el servidor arrancado, la documentación interactiva (OpenAPI/Swagger) está en:

```
http://localhost:3000/api/v1/docs
```

El spec vive en [src/docs/openapi.js](src/docs/openapi.js).

## Tests

```
npm test         # una pasada
npm run test:watch
```

Los tests son unitarios: mockean `db.query` y los servicios externos (Stripe, Firebase) con
`jest.unstable_mockModule`, por lo que no necesitan una base de datos real. Viven en [test/unit](test/unit).

## Flujo general

1. Un usuario se registra (`POST /auth/register`) y puede publicar propiedades (`POST /properties`).
2. Otro usuario solicita una reserva (`POST /reservations`); queda `pending` hasta que el propietario
   la acepta o rechaza (`PATCH /reservations/:id/accept|reject`). Solo una reserva `confirmed` bloquea
   el calendario; al confirmar una, las demás solicitudes pendientes que se solapaban se rechazan solas.
3. Con la reserva `confirmed`, se firma el contrato de alquiler (`POST /reservations/:id/contracts` tipo
   `rental`, luego `POST /contracts/:id/otp` + `POST /contracts/:id/sign` por cada parte) y se paga
   (`POST /reservations/:id/payments`): el alquiler se cobra y transfiere al propietario de inmediato
   (menos la comisión de la plataforma), el depósito solo se autoriza.
4. Al inicio y devolución se registran verificaciones con fotos (`POST /reservations/:id/verifications`
   tipo `check_in`/`check_out`); crear la de `check_out` marca la reserva como `completed`.
5. Ya con el check-out hecho, el propietario captura o libera el depósito
   (`POST /payments/:id/capture-deposit|release-deposit`). Si surge un desacuerdo, cualquiera de las
   partes puede abrir una disputa (`POST /reservations/:id/disputes`), que resuelve un admin
   (`PATCH /disputes/:id/resolve`), pudiendo capturar o liberar el depósito como parte de la resolución.
6. Cancelar una reserva `confirmed` que ya tenía pago (`PATCH /reservations/:id/cancel`) reembolsa el
   alquiler cobrado y cancela la autorización del depósito automáticamente.


