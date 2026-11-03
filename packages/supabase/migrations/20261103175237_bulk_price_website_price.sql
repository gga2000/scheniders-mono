-- Products page, round 37: a bulk price change can also move each product's
-- own website price, so the store does not keep selling at the old one.
-- Each change may carry set_website (boolean) and website_price (whole IQD
-- above zero, or null for "same as the price"); undo sends the old value back.
-- Unchanged otherwise.
CREATE OR REPLACE FUNCTION public.set_product_prices(p_changes jsonb, p_reason text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_change  record;
    v_tenant  uuid;
    v_old     numeric;
    v_count   integer := 0;
BEGIN
    IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) = 0 THEN
        RAISE EXCEPTION 'nothing to change' USING ERRCODE = '22023';
    END IF;
    IF coalesce(btrim(p_reason), '') = '' THEN
        RAISE EXCEPTION 'reason is required' USING ERRCODE = '22023';
    END IF;

    -- Read by log_product_price_change(); lasts until this transaction ends.
    PERFORM set_config('app.price_change_reason', p_reason, true);

    FOR v_change IN
        SELECT c.id, c.price, c.expected_price,
               coalesce(c.set_compare_at, false) AS set_compare_at, c.compare_at_price,
               coalesce(c.set_website, false) AS set_website, c.website_price
          FROM jsonb_to_recordset(p_changes) AS c(
              id uuid, price numeric, expected_price numeric, set_compare_at boolean, compare_at_price numeric,
              set_website boolean, website_price numeric
          )
         ORDER BY c.id
    LOOP
        IF v_change.id IS NULL
           OR v_change.price IS NULL OR v_change.price <= 0 OR v_change.price <> trunc(v_change.price)
           OR (v_change.compare_at_price IS NOT NULL
               AND (v_change.compare_at_price < 0 OR v_change.compare_at_price <> trunc(v_change.compare_at_price)))
           OR (v_change.website_price IS NOT NULL
               AND (v_change.website_price <= 0 OR v_change.website_price <> trunc(v_change.website_price)))
        THEN
            RAISE EXCEPTION 'every change needs a product and a whole-number price above zero' USING ERRCODE = '22023';
        END IF;

        SELECT tenant_id, price INTO v_tenant, v_old
          FROM public.products WHERE id = v_change.id FOR UPDATE;
        IF v_tenant IS NULL OR NOT public.has_tenant_permission(v_tenant, 'products.manage') THEN
            RAISE EXCEPTION 'product not found or not allowed' USING ERRCODE = '42501';
        END IF;
        IF v_change.expected_price IS NOT NULL AND v_old IS DISTINCT FROM v_change.expected_price THEN
            RAISE EXCEPTION 'the price changed since this action; nothing was undone' USING ERRCODE = '40001';
        END IF;

        UPDATE public.products
           SET price            = v_change.price,
               compare_at_price = CASE WHEN v_change.set_compare_at THEN v_change.compare_at_price ELSE compare_at_price END,
               website_price    = CASE WHEN v_change.set_website THEN v_change.website_price ELSE website_price END
         WHERE id = v_change.id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$function$;
