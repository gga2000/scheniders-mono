-- Throwaway Postgres 16 database for paying us by transfer (Fermi B3,
-- 20261116062511_fermi_qi_transfer_payments): the billing-lock database (the
-- wallet, the lock and the credit that settles it) plus the receipt requests,
-- the shop's notifications and the staff settings, shaped like live
-- (information_schema, 2026-11-16).
-- NEVER run this against Supabase: it creates roles and an auth stub.

\ir billing-lock.fixture.sql

ALTER TABLE public.tenants
    ADD COLUMN display_id bigint,
    ADD COLUMN business_name text NOT NULL DEFAULT 'Shop';

CREATE TABLE auth.users (id uuid PRIMARY KEY);

-- As 20261110000111_wallet_topup_requests (+ r10's unique receipt path).
CREATE TABLE public.wallet_topup_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    requested_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    amount_iqd integer NOT NULL CHECK (amount_iqd BETWEEN 1000 AND 10000000),
    method text NOT NULL CHECK (method IN ('zain_cash', 'qi_card')),
    receipt_path text NOT NULL UNIQUE CHECK (receipt_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    outcome text CHECK (outcome IN ('approved', 'rejected')),
    CHECK ((decided_at IS NULL) = (outcome IS NULL)),
    CHECK (split_part(receipt_path, '/', 1) = tenant_id::text)
);
ALTER TABLE public.wallet_topup_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_topup_requests_select ON public.wallet_topup_requests
    FOR SELECT TO authenticated USING ((SELECT public.is_tenant_admin(tenant_id)));
CREATE POLICY wallet_topup_requests_insert ON public.wallet_topup_requests
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.is_tenant_admin(tenant_id)) AND requested_by = (SELECT auth.uid())
                AND decided_at IS NULL AND decided_by IS NULL AND outcome IS NULL);
GRANT SELECT ON public.wallet_topup_requests TO authenticated;
GRANT INSERT (tenant_id, amount_iqd, method, receipt_path) ON public.wallet_topup_requests TO authenticated;
GRANT ALL ON public.wallet_topup_requests TO service_role;

CREATE TABLE public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid,
    type text NOT NULL,
    category text,
    audience text,
    recipient_id uuid,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    priority text,
    group_key text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Before the migration: one receipt approved and one refused under the old
-- rules (no credited amount, no number, no reason).
INSERT INTO public.tenants (id, plan, status, trial_ends_at, display_id, business_name) VALUES
  ('30000000-0000-4000-8000-0000000000a0', 'starter', 'active', now() - interval '60 days', 100900, 'Old Shop');
INSERT INTO auth.users (id) VALUES ('31000000-0000-4000-8000-000000000001');
INSERT INTO public.wallet_topup_requests
    (tenant_id, requested_by, amount_iqd, method, receipt_path, created_at, decided_at, outcome) VALUES
  ('30000000-0000-4000-8000-0000000000a0', '31000000-0000-4000-8000-000000000001', 25000, 'qi_card',
   '30000000-0000-4000-8000-0000000000a0/40000000-0000-4000-8000-000000000001.jpg',
   now() - interval '10 days', now() - interval '9 days', 'approved'),
  ('30000000-0000-4000-8000-0000000000a0', '31000000-0000-4000-8000-000000000001', 5000, 'zain_cash',
   '30000000-0000-4000-8000-0000000000a0/40000000-0000-4000-8000-000000000002.jpg',
   now() - interval '8 days', now() - interval '8 days', 'rejected');
