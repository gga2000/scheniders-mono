-- Throwaway Postgres database shaped like the live objects the storefront's
-- public counts read and write (B9 step 2): shops, orders with the columns
-- the counts use and the trigger that moves updated_at on every change,
-- tenant_public_stats and the refresh jobs' state table. Copied from live
-- (2026-11-22).
-- NEVER run this against Supabase.

CREATE TABLE public.tenants (
    id uuid PRIMARY KEY
);

CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id),
    phone text,
    status text NOT NULL DEFAULT 'pending',
    governorate_code text,
    validated_governorate_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    is_test boolean DEFAULT false,
    take_kind text
);
CREATE INDEX idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX idx_orders_tenant_updated_at ON public.orders (tenant_id, updated_at DESC);

-- As live: trg_orders_updated_at.
CREATE FUNCTION public.set_orders_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_orders_updated_at();

CREATE TABLE public.tenant_public_stats (
    tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    completed_orders integer NOT NULL DEFAULT 0,
    customers integer NOT NULL DEFAULT 0,
    governorates_served integer NOT NULL DEFAULT 0,
    first_order_at timestamptz,
    refreshed_at timestamptz NOT NULL DEFAULT now(),
    orders_7d integer NOT NULL DEFAULT 0
);

CREATE TABLE public.cron_refresh_state (
    job text PRIMARY KEY,
    fingerprint bigint NOT NULL,
    refreshed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.cron_refresh_state (job, fingerprint) VALUES ('tenant_public_stats', 1), ('customer_aggregates', 1);

-- As live (20260101000000_base_schema.sql), so the migrations under test can
-- run their first refresh; public-stats.functions loads the newest copy on top.
CREATE OR REPLACE FUNCTION public.normalize_phone(input_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
    clean_phone TEXT;
BEGIN
    clean_phone := translate(input_phone, '٠١٢٣٤٥٦٧٨٩', '0123456789');
    clean_phone := translate(clean_phone, '۰۱۲۳۴۵۶۷۸۹', '0123456789');
    clean_phone := regexp_replace(clean_phone, '\D', '', 'g');
    IF clean_phone LIKE '964%' THEN
        clean_phone := substring(clean_phone FROM 4);
    END IF;
    IF clean_phone LIKE '0%' THEN
        clean_phone := substring(clean_phone FROM 2);
    END IF;
    RETURN clean_phone;
END;
$function$;

