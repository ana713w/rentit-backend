# RentIt - Backend

API de RentIt, una app para alquilar objetos entre particulares. Proyecto de TFM.

Hecho con Node.js, Express 5, PostgreSQL, Stripe Connect y Firebase Storage.

## Requisitos

- Node.js 20 o superior
- PostgreSQL 13 o superior
- Cuenta de Stripe en modo test y la Stripe CLI
- Proyecto de Firebase con Storage
- Un servidor SMTP para enviar los códigos de firma (por ejemplo Gmail con contraseña de aplicación)

## Instalación

```bash
npm install
cp .env.example .env
```

Rellena el `.env`. Las variables principales son:

- `DB_*`: datos de conexión a Postgres
- `FIREBASE_*`: sacados del JSON de la cuenta de servicio de Firebase
- `SMTP_*`: servidor de correo
- `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`
- `SESSION_SECRET`: cualquier texto largo
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`: el usuario administrador inicial

Crea la base de datos y las tablas:

```bash
psql -U postgres -c "CREATE DATABASE rentit_db"
psql -U postgres -d rentit_db -f db/schema.sql
```

Crea el administrador:

```bash
npm run seed
```

## Arrancar

```bash
npm run dev
```

La API queda en http://localhost:3000/api/v1 y la documentación Swagger en http://localhost:3000/api/v1/docs.

## Tests

```bash
npm test
```

## Cómo funciona un alquiler

1. El propietario publica un objeto y otro usuario pide alquilarlo.
2. El propietario acepta o rechaza la solicitud.
3. El día antes de la recogida se puede pagar (en la página de Stripe) y firmar el contrato de entrega.
4. Al entregar el objeto se hace el check-in con fotos.
5. Al devolverlo se firma el acta de devolución y se hace el check-out.
6. El propietario libera la fianza o cobra una parte si hay daños.

Si hay algún problema, cualquiera de los dos puede abrir una disputa y la resuelve un administrador.
