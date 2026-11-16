-- Throwaway Postgres 16 database for the calm wallet warning and the renewal
-- reminder (Fermi B3 part 2, 20261116064916_fermi_wallet_runway_and_renewal_reminder):
-- the billing-lock database (shops, plans, subscriptions, the wallet and its
-- ledger, the lock) plus the shop's notifications, shaped like live
-- (information_schema, 2026-11-16).
-- NEVER run this against Supabase: it creates roles and an auth stub.

\ir billing-lock.fixture.sql

CREATE TABLE public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    type text NOT NULL,
    category text NOT NULL,
    audience text NOT NULL CHECK (audience IN ('tenant', 'user')),
    recipient_id uuid,
    actor_name text,
    actor_avatar text,
    entity_type text,
    entity_id uuid,
    entity_label text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    group_key text,
    created_at timestamptz NOT NULL DEFAULT now()
);
