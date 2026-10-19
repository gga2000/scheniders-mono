-- =============================================
-- Admin merchant detail dialog — Sprint 2 enhancements
-- Adds: 'limited' tenant status, subscription auto_renew,
--       tenant restrictions, admin_watchlist
-- =============================================

-- 1. Add 'limited' to tenant_status enum (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'public.tenant_status'::regtype
          AND enumlabel = 'limited'
    ) THEN
        ALTER TYPE public.tenant_status ADD VALUE 'limited';
    END IF;
END$$;

-- 2. auto_renew on subscriptions (defaults true so existing rows behave unchanged)
ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. restrictions JSONB on tenants for soft-pause / limited state
--    Schema: { paused_until, paused_at, paused_by, reason, blocks: { new_orders, ... } }
ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS restrictions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 4. Per-admin watchlist (replaces local zustand-only starring)
CREATE TABLE IF NOT EXISTS public.admin_watchlist (
    admin_user_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (admin_user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_watchlist_admin
    ON public.admin_watchlist(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_watchlist_tenant
    ON public.admin_watchlist(tenant_id);

-- RLS for admin_watchlist: server-side admin client bypasses RLS;
-- restrictive policy keeps it locked from anon/authenticated by default.
ALTER TABLE public.admin_watchlist ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'admin_watchlist'
          AND policyname = 'admin_watchlist_no_anon'
    ) THEN
        CREATE POLICY admin_watchlist_no_anon
            ON public.admin_watchlist
            FOR ALL
            TO authenticated
            USING (false);
    END IF;
END$$;;
