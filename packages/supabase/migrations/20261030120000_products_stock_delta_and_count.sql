-- Products page: stock writes that cannot overwrite order movements
-- (audit PR-D2, PR-D4, P-E1).
--
-- The editor, quick adjust, supplies and QC screens wrote stock_quantity as an
-- absolute value computed from a list loaded up to 10 minutes earlier. Orders
-- that shipped in between (inv_apply decrements stock) were silently undone.
--
-- 1. adjust_product_stock: add or remove units (restock, damage, supply use).
--    The change is applied to the row's current value under the row lock.
-- 2. set_counted_stock: the merchant counted the shelf; stock becomes that
--    number, and the difference from the current value is what gets logged.
-- Both need products.edit (employees restock; Ali 2026-10-30), write
-- inventory_history (who/why) and inventory_ledger (delta), and return the new
-- stock.
-- 3. zero_oversold is removed: it set stock to the reserved count without
--    anyone counting, which left oversold products at 0 available and invented
--    stock. The Count stock screen replaces it.

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
    p_product_id uuid,
    p_delta      integer,
    p_reason     text,
    p_variant_id uuid DEFAULT NULL,
    p_notes      text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_tenant uuid;
    v_before integer;
    v_after  integer;
BEGIN
    IF p_delta IS NULL OR p_delta = 0 THEN
        RAISE EXCEPTION 'delta must be a non-zero whole number' USING ERRCODE = '22023';
    END IF;
    IF coalesce(btrim(p_reason), '') = '' THEN
        RAISE EXCEPTION 'reason is required' USING ERRCODE = '22023';
    END IF;

    SELECT tenant_id INTO v_tenant FROM public.products WHERE id = p_product_id;
    IF v_tenant IS NULL OR NOT public.has_tenant_permission(v_tenant, 'products.edit') THEN
        RAISE EXCEPTION 'not allowed to change this product''s stock' USING ERRCODE = '42501';
    END IF;

    IF p_variant_id IS NULL THEN
        UPDATE public.products
           SET stock_quantity = stock_quantity + p_delta
         WHERE id = p_product_id
        RETURNING stock_quantity - p_delta, stock_quantity INTO v_before, v_after;
    ELSE
        UPDATE public.product_variants
           SET stock_quantity = stock_quantity + p_delta
         WHERE id = p_variant_id AND product_id = p_product_id AND tenant_id = v_tenant
        RETURNING stock_quantity - p_delta, stock_quantity INTO v_before, v_after;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'variant not found on this product' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    INSERT INTO public.inventory_history (product_id, tenant_id, change_type, quantity_change, quantity_before, quantity_after, notes, changed_by)
    VALUES (p_product_id, v_tenant, p_reason, p_delta, v_before, v_after, p_notes, auth.uid()::text);

    INSERT INTO public.inventory_ledger (tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (v_tenant, p_product_id, p_variant_id, NULL, 0, p_delta, 0, 'manual:' || p_reason);

    RETURN v_after;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_counted_stock(
    p_product_id uuid,
    p_counted    integer,
    p_variant_id uuid DEFAULT NULL,
    p_notes      text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_tenant uuid;
    v_before integer;
BEGIN
    IF p_counted IS NULL OR p_counted < 0 THEN
        RAISE EXCEPTION 'counted stock must be zero or more' USING ERRCODE = '22023';
    END IF;

    SELECT tenant_id INTO v_tenant FROM public.products WHERE id = p_product_id;
    IF v_tenant IS NULL OR NOT public.has_tenant_permission(v_tenant, 'products.edit') THEN
        RAISE EXCEPTION 'not allowed to change this product''s stock' USING ERRCODE = '42501';
    END IF;

    -- Lock the row so the logged difference is against the value being replaced.
    IF p_variant_id IS NULL THEN
        SELECT stock_quantity INTO v_before FROM public.products WHERE id = p_product_id FOR UPDATE;
        IF v_before = p_counted THEN RETURN p_counted; END IF;
        UPDATE public.products SET stock_quantity = p_counted WHERE id = p_product_id;
    ELSE
        SELECT stock_quantity INTO v_before FROM public.product_variants
         WHERE id = p_variant_id AND product_id = p_product_id AND tenant_id = v_tenant FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'variant not found on this product' USING ERRCODE = 'P0002';
        END IF;
        IF v_before = p_counted THEN RETURN p_counted; END IF;
        UPDATE public.product_variants SET stock_quantity = p_counted WHERE id = p_variant_id;
    END IF;

    INSERT INTO public.inventory_history (product_id, tenant_id, change_type, quantity_change, quantity_before, quantity_after, notes, changed_by)
    VALUES (p_product_id, v_tenant, 'count', p_counted - v_before, v_before, p_counted, p_notes, auth.uid()::text);

    INSERT INTO public.inventory_ledger (tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (v_tenant, p_product_id, p_variant_id, NULL, 0, p_counted - v_before, 0, 'manual:count');

    RETURN p_counted;
END;
$function$;

REVOKE ALL ON FUNCTION public.adjust_product_stock(uuid, integer, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_counted_stock(uuid, integer, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, integer, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_counted_stock(uuid, integer, uuid, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.zero_oversold(uuid);
