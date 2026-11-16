-- Throwaway Postgres 16 database for the demo store reset's table list
-- (demo_store_sweep_tables, 20261116223123_demo_reset_keeps_staff_record.sql):
-- the roles, the store tables the sweep keeps, a few shop tables it empties,
-- and the staff tables it must leave alone. Shaped like live where the sweep
-- looks: a tenant_id column and the foreign keys between the tables.
-- NEVER run this against Supabase: it creates roles.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

CREATE SCHEMA shield;

-- The store and what stays with it.
CREATE TABLE public.tenants (id uuid PRIMARY KEY, is_demo boolean NOT NULL DEFAULT false);
CREATE TABLE public.tenant_members (tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE, user_id uuid NOT NULL);
CREATE TABLE public.user_permissions (tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE, user_id uuid NOT NULL);
CREATE TABLE public.merchant_guide_progress (tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE);

-- Shop data the reset empties: an order and its lines, a Shield row, a
-- support chat with its messages.
CREATE TABLE public.orders (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE);
CREATE TABLE public.order_items (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES public.orders (id)
);
CREATE TABLE shield.events (id bigserial PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE);
CREATE TABLE public.support_cases (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    PRIMARY KEY (id, tenant_id)
);
CREATE TABLE public.support_messages (
    id bigserial PRIMARY KEY,
    case_id uuid NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    FOREIGN KEY (case_id, tenant_id) REFERENCES public.support_cases (id, tenant_id) ON DELETE CASCADE
);

-- The staff's own record about the store, as live: the reset keeps these.
CREATE TABLE public.admin_activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid,
    action text NOT NULL,
    tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.admin_notes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE, content text NOT NULL);
CREATE TABLE public.admin_watchlist (tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE, admin_user_id uuid NOT NULL);
CREATE TABLE public.admin_employee_commissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL);
CREATE TABLE public.staff_shop_tags (tenant_id uuid PRIMARY KEY REFERENCES public.tenants (id) ON DELETE CASCADE, tags text[] NOT NULL);
CREATE TABLE public.staff_action_requests (request_id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE);
CREATE TABLE public.support_view_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE);
