-- Throwaway Postgres 16 database for the staff-only tables' browser rights
-- (20261116223436_staff_tables_no_browser_rights.sql and
-- 20261116225533_lead_and_seed_tables_no_browser_rights.sql): the staff,
-- lead and seed tables with every right granted to anon and authenticated,
-- as Supabase grants a new table; admin_users, which keeps its own-row read;
-- and industries, which keeps its public read.
-- NEVER run this against Supabase: it creates roles.

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

CREATE TABLE public.admin_activity_logs (id uuid PRIMARY KEY);
CREATE TABLE public.admin_notes (id uuid PRIMARY KEY);
CREATE TABLE public.admin_watchlist (id uuid PRIMARY KEY);
CREATE TABLE public.admin_commission_config (id uuid PRIMARY KEY);
CREATE TABLE public.admin_employee_commissions (id uuid PRIMARY KEY);
CREATE TABLE public.admin_employee_achievements (id uuid PRIMARY KEY);
CREATE TABLE public.admin_employee_tracking (id uuid PRIMARY KEY);
CREATE TABLE public.admin_users (user_id uuid PRIMARY KEY);
CREATE TABLE public.leads (id uuid PRIMARY KEY);
CREATE TABLE public.lead_activities (id uuid PRIMARY KEY);
CREATE TABLE public.lead_follow_ups (id uuid PRIMARY KEY);
CREATE TABLE public.lead_competitors (id uuid PRIMARY KEY);
CREATE TABLE public.lead_social_links (id uuid PRIMARY KEY);
CREATE TABLE public.whatsapp_outreach_templates (id uuid PRIMARY KEY);
CREATE TABLE public.order_generation_config (id uuid PRIMARY KEY);
CREATE TABLE public.seed_customers (id uuid PRIMARY KEY);
CREATE TABLE public.industries (id uuid PRIMARY KEY);

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
