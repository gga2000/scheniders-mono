-- Throwaway Postgres 16 database with the orders columns that
-- orders_refuse_shipped_trash reads (live types, 2026-11-15).
-- NEVER run this against Supabase.

CREATE TABLE public.orders (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    order_id text NOT NULL,
    status text NOT NULL DEFAULT 'new',
    deleted_at timestamptz,
    guide_practice boolean NOT NULL DEFAULT false
);
