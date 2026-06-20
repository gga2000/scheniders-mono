-- =============================================
-- FEATURE: abandoned-cart WhatsApp recovery — abandoned_carts table
--
-- The storefront captures a cart (phone + items) when a customer reaches
-- checkout but doesn't complete the order. A later job (R2) messages them a
-- WhatsApp recovery nudge. Captured + swept by trusted server code (service
-- role); members read their own for the recovery dashboard. No anon access.
--
-- One live row per (tenant, phone): re-capture upserts; placing an order sets
-- recovered_at; the reminder sweep sets reminded_at.
-- =============================================

CREATE TABLE IF NOT EXISTS public.abandoned_carts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone        text NOT NULL,
    items        jsonb NOT NULL DEFAULT '[]'::jsonb,
    subtotal_iqd integer NOT NULL DEFAULT 0,
    governorate  text,
    locale       text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    reminded_at  timestamptz,
    recovered_at timestamptz,
    UNIQUE (tenant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_tenant
    ON public.abandoned_carts (tenant_id);
-- Sweep index: rows still eligible for a reminder (not yet reminded/recovered).
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_pending
    ON public.abandoned_carts (updated_at)
    WHERE reminded_at IS NULL AND recovered_at IS NULL;

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

-- Members read their tenant's carts (recovery dashboard). Writes are service-role
-- only (capture endpoint + reminder sweep), which bypasses RLS.
DROP POLICY IF EXISTS abandoned_carts_member_select ON public.abandoned_carts;
CREATE POLICY abandoned_carts_member_select ON public.abandoned_carts
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

NOTIFY pgrst, 'reload schema';
