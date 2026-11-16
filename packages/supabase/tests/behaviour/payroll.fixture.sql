-- Throwaway Postgres 16 database shaped like the live objects run_payroll and
-- void_payroll touch. Columns copied from the live project
-- (information_schema, 2026-11-14); tables carry only what the functions read.
-- NEVER run this against Supabase: it creates roles and an auth stub.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END;
$roles$;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

CREATE TABLE public.user_profiles (
    id uuid PRIMARY KEY,
    current_tenant_id uuid,
    is_active boolean DEFAULT true
);

CREATE TABLE public.tenant_members (
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE public.payroll_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    base_salary numeric NOT NULL DEFAULT 0,
    completed_orders_count integer NOT NULL DEFAULT 0,
    order_bonus numeric NOT NULL DEFAULT 0,
    performance_bonuses_total numeric NOT NULL DEFAULT 0,
    advances_deducted numeric NOT NULL DEFAULT 0,
    penalties_deducted numeric NOT NULL DEFAULT 0,
    absence_days integer NOT NULL DEFAULT 0,
    absence_deduction numeric NOT NULL DEFAULT 0,
    gross_salary numeric NOT NULL DEFAULT 0,
    net_salary numeric NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'paid',
    paid_at timestamptz,
    paid_by uuid,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    payment_method text DEFAULT 'cash',
    tenant_id uuid,
    amount_paid numeric,
    carried_in numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.salary_advances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL,
    amount numeric NOT NULL,
    reason text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    payroll_id uuid,
    is_deducted boolean NOT NULL DEFAULT false,
    tenant_id uuid,
    carried_from_payroll_id uuid
);

CREATE TABLE public.salary_penalties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL,
    amount numeric NOT NULL,
    reason text NOT NULL,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    payroll_id uuid,
    is_applied boolean NOT NULL DEFAULT false,
    tenant_id uuid
);

CREATE TABLE public.performance_bonuses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL,
    amount numeric NOT NULL,
    reason text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    payroll_id uuid,
    is_applied boolean NOT NULL DEFAULT false,
    tenant_id uuid,
    carried_from_payroll_id uuid
);

-- get_user_tenant_ids() also reads live look-only support sessions
-- (20261116112543_support_view_as); none exist here.
CREATE TABLE public.support_view_sessions (
    viewer_user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    ended_at timestamptz
);
