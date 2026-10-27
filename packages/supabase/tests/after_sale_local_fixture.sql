-- =============================================================================
-- Local fixture for after_sale.sql (replacements / refunds foundation)
-- =============================================================================
--
-- LOCAL THROWAWAY POSTGRES ONLY. Never run against Supabase.
--
-- Builds on cross_tenant_stock_local_fixture.sql and adds the columns and
-- helpers the after-sale migrations touch: orders.is_replacement /
-- original_order_id, tenants.settings / slug, product and variant prices,
-- and stubs for next_order_number and mask_order_margin (both live functions
-- whose behaviour after_sale.sql does not depend on).
--
-- HOW TO RUN (see after_sale.sql)
-- =============================================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS is_replacement boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS original_order_id uuid;
ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS settings jsonb,
    ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price numeric;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS price numeric;

CREATE SEQUENCE IF NOT EXISTS public._fixture_order_no;
CREATE OR REPLACE FUNCTION public.next_order_number(p_source text) RETURNS text
LANGUAGE sql AS $$ SELECT p_source || nextval('public._fixture_order_no')::text $$;
CREATE OR REPLACE FUNCTION public.mask_order_margin(_row jsonb, _tenant_id uuid) RETURNS jsonb
LANGUAGE sql AS $$ SELECT _row $$;
