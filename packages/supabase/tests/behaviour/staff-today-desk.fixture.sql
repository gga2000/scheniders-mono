-- Throwaway Postgres 16 database for the staff console's Today desk
-- (20261116125015_staff_today_desk): the transfer-payments database (shops,
-- plans, subscriptions, wallets, the lock and the receipt requests) plus the
-- owner's phone and the support conversations, shaped like live
-- (information_schema, 2026-11-16). Tables carry only what the function reads.
-- NEVER run this against Supabase: it creates roles and an auth stub.

\ir topup.fixture.sql

ALTER TABLE public.tenants ADD COLUMN contact_phone text;

CREATE TABLE public.support_cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    status text NOT NULL,
    waiting_since timestamptz,
    last_message_at timestamptz NOT NULL DEFAULT now(),
    last_message_preview text
);

-- Stand-ins with the live signatures, so the migration can be created. run.sh
-- then puts the newest real definitions on top (staff-today-desk.functions).
CREATE FUNCTION public.tenant_billing_lock(_tenant_id uuid)
RETURNS TABLE (reason text, since timestamptz)
LANGUAGE sql STABLE
AS $$ SELECT NULL::text, NULL::timestamptz WHERE false $$;
CREATE FUNCTION public.billing_lock_snapshot(_tenant_id uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$ SELECT NULL::jsonb $$;
CREATE FUNCTION public.subscription_price_iqd(_tenant_id uuid, _plan public.plan_tier) RETURNS numeric
LANGUAGE sql STABLE AS $$ SELECT NULL::numeric $$;
