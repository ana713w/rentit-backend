--PARA ACTUALIZAR -> psql -U postgres -f db/schema.sql

-- gen_random_uuid() es nativo desde Postgres 13; esta extension es solo un respaldo si tu version es mas vieja
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,                          -- SUPUESTO: nullable, sin límite estricto
    address VARCHAR(255) NOT NULL,
    latitude NUMERIC(9,6),                      -- SUPUESTO: nullable, precisión de 6 decimales
    longitude NUMERIC(9,6),                     -- SUPUESTO: nullable
    price_per_day NUMERIC(10,2) NOT NULL,
    deposit_amount NUMERIC(10,2) NOT NULL,
    property_type VARCHAR(50) NOT NULL,         -- SUPUESTO: varchar libre, el ERD no especifica un enum cerrado
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT deposit_between_3_and_365_days CHECK (
        deposit_amount >= price_per_day * 3 AND deposit_amount <= price_per_day * 365
    )
);