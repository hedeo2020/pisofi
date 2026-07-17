CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    email text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'operator', 'viewer')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);

CREATE TABLE devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    name text NOT NULL,
    secret_hash text NOT NULL,
    pulse_value integer NOT NULL CHECK (pulse_value > 0),
    last_seen_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

CREATE TABLE device_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    device_id uuid NOT NULL REFERENCES devices(id),
    event_id text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('heartbeat', 'coin_pulse', 'bill_pulse', 'status')),
    payload jsonb NOT NULL DEFAULT '{}',
    occurred_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (device_id, event_id)
);

CREATE TABLE credit_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    device_id uuid NOT NULL REFERENCES devices(id),
    event_id uuid REFERENCES device_events(id),
    amount integer NOT NULL,
    reason text NOT NULL CHECK (reason IN ('coin', 'bill', 'voucher_purchase', 'refund', 'adjustment')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vouchers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    device_id uuid NOT NULL REFERENCES devices(id),
    code_hash text NOT NULL UNIQUE,
    price integer NOT NULL CHECK (price > 0),
    duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
    redeemed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_intents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    device_id uuid NOT NULL REFERENCES devices(id),
    method text NOT NULL CHECK (method IN ('gcash', 'maya', 'qrph')),
    provider text NOT NULL,
    provider_payment_id text NOT NULL,
    amount integer NOT NULL CHECK (amount > 0),
    currency char(3) NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
    duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
    status text NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded')),
    checkout_url text,
    qr_code_body text,
    voucher_id uuid REFERENCES vouchers(id),
    paid_at timestamptz,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_payment_id)
);

CREATE TABLE payment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_intent_id uuid NOT NULL REFERENCES payment_intents(id),
    provider text NOT NULL,
    provider_event_id text NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_event_id)
);

CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    device_id uuid NOT NULL REFERENCES devices(id),
    voucher_id uuid REFERENCES vouchers(id),
    client_mac macaddr NOT NULL,
    started_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL CHECK (expires_at > started_at),
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_active_device_idx ON sessions (device_id, expires_at) WHERE ended_at IS NULL;
CREATE INDEX device_events_received_idx ON device_events (device_id, received_at DESC);
CREATE INDEX payment_intents_tenant_created_idx ON payment_intents (tenant_id, created_at DESC);
CREATE INDEX payment_intents_pending_idx ON payment_intents (expires_at) WHERE status = 'pending';

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
