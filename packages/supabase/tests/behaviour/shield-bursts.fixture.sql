-- Throwaway Postgres database shaped like the live objects the Shield burst
-- scan reads and writes (B9 step 2): stores, the Shield events ledger and the
-- held days. Columns, checks and the (tenant_id, updated_at) index copied from
-- live (2026-11-22).
-- NEVER run this against Supabase.

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY
);

CREATE SCHEMA shield;
CREATE TABLE shield.events (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    base_id text NOT NULL,
    phone_key bytea NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('delivered', 'bad')),
    category text,
    occurred_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, base_id, phone_key)
);
CREATE INDEX shield_events_tenant_updated_idx ON shield.events (tenant_id, updated_at DESC);
CREATE TABLE shield.holds (
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    day date NOT NULL,
    bad integer NOT NULL,
    usual numeric NOT NULL,
    status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released', 'blocked')),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    PRIMARY KEY (tenant_id, day)
);
