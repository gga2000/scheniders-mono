-- Throwaway Postgres 16 database for Handled today under the staff console's
-- Today desk (20261116130612_staff_today_handled): the Today desk database
-- plus the receipt decisions, the staff names, the support replies and the
-- staff activity log, shaped like live (information_schema, 2026-11-16).
-- Tables carry only what the function reads.
-- NEVER run this against Supabase: it creates roles and an auth stub.

\ir staff-today-desk.fixture.sql

ALTER TABLE public.wallet_topup_requests
    ADD COLUMN credited_iqd integer,
    ADD COLUMN reject_reason text;

ALTER TABLE public.support_cases ADD COLUMN reason text;

CREATE TABLE public.admin_users (
    user_id uuid PRIMARY KEY,
    admin_role text NOT NULL DEFAULT 'support_staff',
    is_active boolean NOT NULL DEFAULT true,
    display_name text,
    email text
);

CREATE TABLE public.support_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id uuid NOT NULL REFERENCES public.support_cases (id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL,
    sender_kind text NOT NULL CHECK (sender_kind IN ('merchant', 'staff', 'system')),
    sender_id uuid,
    sender_name text,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
