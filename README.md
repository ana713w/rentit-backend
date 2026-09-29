# RentIt Backend

API REST para el alquiler de objetos entre particulares: solicitud y aprobación de reservas por
parte del propietario, contratos firmados digitalmente (checkbox + OTP por email), verificaciones de
check-in/check-out con fotos, pagos con Stripe Connect (alquiler + depósito de garantía) y disputas
resueltas por un administrador.

## Stack

- Node.js + Express 5, ES Modules
- PostgreSQL (`pg`), sesiones en `express-session` + `connect-pg-simple`
- Zod para validación de entrada
- Stripe Connect Express (pagos y depósitos)
- Firebase Storage (imágenes de objetos, fotos de verificación, PDFs de contrato)
- Jest + Supertest (tests)

## Requisitos

- **Node.js 20+**
- **PostgreSQL 13+**: en Windows, el instalador oficial (https://www.postgresql.org/download/windows/)
  instala el servidor y `psql`. El schema usa `gen_random_uuid()` (incluido desde Postgres 13) y crea él
  mismo la extensión `btree_gist`.
- **Cuenta de Stripe** en modo test, con Connect habilitado, y la **Stripe CLI** para los webhooks
  (https://docs.stripe.com/stripe-cli).
- **Proyecto de Firebase** con Storage (plan Blaze) y una service account.
- **Servidor SMTP** para los OTP de firma de contrato (vale Gmail con contraseña de aplicación, o Mailtrap).

## Puesta en marcha

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar el `.env`

```bash
cp .env.example .env
```

| Variable | Qué poner |
| --- | --- |
| `PORT` | Puerto de la API (por defecto `3000`) |
| `CORS_ORIGINS` | URL del frontend, separadas por comas: `http://localhost:5173` |
| `CLIENT_URL` | URL del frontend, a la que vuelve Stripe tras el alta de cobros |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Conexión a Postgres (`localhost`, `5432`, `postgres`, tu contraseña, `rentit_db`) |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` / `FIREBASE_STORAGE_BUCKET` | Del JSON de la service account (Firebase → Configuración del proyecto → Cuentas de servicio → Generar clave privada). La `FIREBASE_PRIVATE_KEY` va entre comillas y con los `\n` tal cual |
| `SMTP_*` | Servidor de correo para los OTP |
| `STRIPE_SECRET_KEY` | `sk_test_...` (Stripe → Desarrolladores → Claves de API) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` que da `stripe listen` (paso 6) |
| `PLATFORM_FEE_PERCENT` | Comisión de la plataforma en % (por defecto `10`) |
| `MAX_RENTAL_DAYS` | Días máximos de un alquiler (por defecto `6`): Stripe solo retiene la fianza unos 7 días |
| `SESSION_SECRET` | Cualquier cadena aleatoria larga |
| `SESSION_SECURE` | `false` en local (`true` solo con HTTPS) |
| `SESSION_MAX_DAYS` | Días de sesión sin actividad antes de caducar |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Administrador que crea el seed (paso 4). La contraseña necesita 8+ caracteres, una mayúscula y un número |

### 3. Crear la base de datos y aplicar el schema

Con Postgres arrancado (en Windows se instala como servicio y arranca solo; si no, en *Servicios* →
`postgresql-x64-XX` → Iniciar):

```bash
psql -U postgres -c "CREATE DATABASE rentit_db"
psql -U postgres -d rentit_db -f db/schema.sql
```

Pide la contraseña del usuario `postgres` que elegiste al instalar. Si `psql` no se reconoce como
comando, añade `C:\Program Files\PostgreSQL\<versión>\bin` al `PATH` o usa la ruta completa.

Importante el `-d rentit_db`: sin él, las tablas se crean en la base de datos `postgres`.

[db/schema.sql](db/schema.sql) usa `CREATE TABLE IF NOT EXISTS`, así que se puede volver a ejecutar tras
añadir tablas nuevas. **No modifica tablas que ya existen**: si cambias columnas de una tabla existente,
haz el `ALTER TABLE` a mano o, con datos de prueba, borra y recrea la base de datos:

```bash
psql -U postgres -c "DROP DATABASE rentit_db"
psql -U postgres -c "CREATE DATABASE rentit_db"
psql -U postgres -d rentit_db -f db/schema.sql
```

La tabla `session` no está en el schema: la crea el backend al arrancar.

### 4. Crear el administrador

```bash
npm run seed
```

Crea el usuario de `ADMIN_EMAIL` / `ADMIN_PASSWORD` y lo marca como administrador
([db/seed-admin.js](db/seed-admin.js)). Se puede ejecutar varias veces: si el usuario ya existe no cambia
su contraseña, solo se asegura de que sea admin. Desde la app, ese admin puede promocionar a otros
usuarios (`POST /admin/promote`).

### 5. Arrancar el backend

```bash
npm run dev    # con reinicio automático al guardar
npm start      # modo normal
```

Debe aparecer `Application running at port 3000`.

### 6. Webhooks de Stripe (para que los pagos cambien de estado)

En otra terminal, con la Stripe CLI (la primera vez, `stripe login`):

```bash
stripe listen --forward-to localhost:3000/api/v1/payments/webhook
```

Copia el `whsec_...` que muestra en `STRIPE_WEBHOOK_SECRET` y reinicia el backend. Déjala abierta mientras
pruebas: sin ella los pagos se quedan en `pending`.

El webhook necesita el body crudo para verificar la firma, por eso está montado antes de
`express.json()` en [src/app.js](src/app.js).

### 7. Arrancar el frontend

En el repositorio `rentit-frontend`:

```bash
npm install
npm run dev
```

## URLs

| Qué | URL |
| --- | --- |
| API | http://localhost:3000/api/v1 |
| Comprobar que la API responde | http://localhost:3000/api/v1 → `{ "health": "ok" }` |
| Documentación (Swagger) | http://localhost:3000/api/v1/docs |
| Frontend | http://localhost:5173 |
| Webhook de Stripe | http://localhost:3000/api/v1/payments/webhook (solo lo llama la Stripe CLI) |

El spec de Swagger vive en [src/docs/openapi.js](src/docs/openapi.js).

## Problemas habituales

- **`password authentication failed for user "postgres"`**: `DB_PASSWORD` no coincide con la de tu Postgres.
- **`database "rentit_db" does not exist`**: falta el `CREATE DATABASE` del paso 3.
- **`relation "items" does not exist`**: no se aplicó el schema, o se aplicó sin `-d rentit_db`.
- **Error de CORS en el navegador**: abre el front en la misma URL que `CORS_ORIGINS` (`localhost`, no `127.0.0.1`).
- **El login funciona pero la siguiente petición da 401**: el front no está enviando la cookie
  (`credentials: 'include'`), o `SESSION_SECURE=true` sin HTTPS.
- **Los pagos se quedan en `pending`**: la Stripe CLI no está escuchando o el `STRIPE_WEBHOOK_SECRET` es de otra sesión.

## Tests

```
npm test         # una pasada
npm run test:watch
```

Los tests son unitarios: mockean `db.query` y los servicios externos (Stripe, Firebase) con
`jest.unstable_mockModule`, por lo que no necesitan una base de datos real. Viven en [test/unit](test/unit).

## Flujo general

1. Un usuario se registra (`POST /auth/register`), indica su dirección de recogida (en el registro o con
   `PATCH /auth/me`) y puede publicar objetos (`POST /items`).
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


