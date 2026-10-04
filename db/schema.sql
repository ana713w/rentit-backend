--PARA ACTUALIZAR -> psql -U postgres -f db/schema.sql

-- necesaria para EXCLUDE USING gist (uuid + rango de fechas)
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    address VARCHAR(255),
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    stripe_account_id VARCHAR(255), -- cuenta Stripe Connect del dueño
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    price_per_day NUMERIC(10,2) NOT NULL,
    deposit_amount NUMERIC(10,2) NOT NULL,
    category VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT deposit_between_3_and_365_days CHECK (
        deposit_amount >= price_per_day * 3 AND deposit_amount <= price_per_day * 365
    )
);

CREATE TABLE IF NOT EXISTS item_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    storage_path TEXT NOT NULL, 
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Solo una imagen "portada" por objeto
CREATE UNIQUE INDEX IF NOT EXISTS one_primary_image_per_item
    ON item_images (item_id) WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS item_blocked_dates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    date_range DATERANGE NOT NULL,
    reason VARCHAR(255),                        
    created_at TIMESTAMP DEFAULT NOW(),
    -- evita bloqueos solapados en el mismo objeto
    EXCLUDE USING gist (item_id WITH =, date_range WITH &&)
);

CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    guest_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date_range DATERANGE NOT NULL,
    price_per_day NUMERIC(10,2) NOT NULL,       
    deposit_amount NUMERIC(10,2) NOT NULL,      
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT valid_reservation_status CHECK (
        status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'completed')
    ),
    CONSTRAINT deposit_between_3_and_365_days CHECK (
        deposit_amount >= price_per_day * 3 AND deposit_amount <= price_per_day * 365
    ),
    -- solo las confirmadas bloquean el calendario
    EXCLUDE USING gist (item_id WITH =, date_range WITH &&) WHERE (status = 'confirmed')
);

-- hasta 2 contratos por reserva: 'rental' y 'return'
-- firma simple + OTP por email
CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    contract_type VARCHAR(20) NOT NULL,
    content_hash TEXT NOT NULL,          -- SHA-256 del texto del contrato
    document_url TEXT,                   -- PDF final, tras las dos firmas
    document_storage_path TEXT,
    guest_signed_at TIMESTAMP,
    guest_signature_ip VARCHAR(45),      
    guest_otp_hash TEXT,                 -- hash del OTP, se limpia al firmar
    guest_otp_expires_at TIMESTAMP,
    owner_signed_at TIMESTAMP,
    owner_signature_ip VARCHAR(45),
    owner_otp_hash TEXT,
    owner_otp_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT valid_contract_type CHECK (contract_type IN ('rental', 'return')),
    CONSTRAINT one_contract_per_type_per_reservation UNIQUE (reservation_id, contract_type)
);

-- una verificacion por reserva y etapa (check_in / check_out)
-- cada foto guarda quien la subio
CREATE TABLE IF NOT EXISTS verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    verification_type VARCHAR(20) NOT NULL,
    notes TEXT,                         
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT valid_verification_type CHECK (verification_type IN ('check_in', 'check_out')),
    CONSTRAINT one_verification_per_type_per_reservation UNIQUE (reservation_id, verification_type)
);

CREATE TABLE IF NOT EXISTS verification_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_id UUID NOT NULL REFERENCES verifications(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- un pago por reserva: alquiler con captura automatica
-- y deposito retenido hasta el check-out o una disputa
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL UNIQUE REFERENCES reservations(id) ON DELETE CASCADE,
    rent_amount NUMERIC(10,2) NOT NULL,
    deposit_amount NUMERIC(10,2) NOT NULL,
    platform_fee_amount NUMERIC(10,2) NOT NULL,
    checkout_session_id VARCHAR(255),   -- pagina de pago de Stripe; el intent del alquiler se conoce al completarla
    rent_payment_intent_id VARCHAR(255),
    rent_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    deposit_payment_intent_id VARCHAR(255),
    deposit_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    deposit_captured_amount NUMERIC(10,2), 
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT valid_rent_status CHECK (rent_status IN ('pending', 'succeeded', 'failed', 'refunded')),
    CONSTRAINT valid_deposit_status CHECK (
        deposit_status IN ('pending', 'authorized', 'captured', 'released', 'canceled', 'failed')
    )
);

-- bases de datos creadas antes del pago con Stripe Checkout
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_session_id VARCHAR(255);

-- la abre cualquiera de las partes y la resuelve un admin
-- la resolucion puede capturar o liberar el deposito
CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    raised_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    requested_capture_amount NUMERIC(10,2), 
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    resolution TEXT,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT valid_dispute_status CHECK (status IN ('open', 'under_review', 'resolved'))
);

-- Solo una disputa activa (no resuelta) a la vez por reserva
CREATE UNIQUE INDEX IF NOT EXISTS one_open_dispute_per_reservation
    ON disputes (reservation_id) WHERE status <> 'resolved';