-- Atomic price changes for the bulk price action and its undo.
--
-- WHY
--   bulkChangePrice ran three client writes (price, clear compare-at price, price
--   history). A failure after the first left a "was" price at or below the new
--   price on the storefront, or a price change with no history; the undo fired
--   one request per product. set_product_prices does the whole change in one
--   transaction.
--
-- SECURITY INVOKER: RLS and column grants still apply. The caller needs
-- products.manage on the store of every product (the same permission the bulk
-- action is gated on in the page).

-- p_changes: [{ "id": uuid, "price": whole number > 0,
--               "set_compare_at": bool, "compare_at_price": whole number >= 0 | null }]
-- When set_compare_at is false the compare-at price is left alone; when true it
-- is set to compare_at_price (null clears it).
CREATE OR REPLACE FUNCTION public.set_product_prices(
    p_changes jsonb,
    p_reason  text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
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

    FOR v_change IN
        SELECT c.id, c.price, coalesce(c.set_compare_at, false) AS set_compare_at, c.compare_at_price
          FROM jsonb_to_recordset(p_changes) AS c(
              id uuid, price numeric, set_compare_at boolean, compare_at_price numeric
          )
    LOOP
        IF v_change.id IS NULL
           OR v_change.price IS NULL OR v_change.price <= 0 OR v_change.price <> trunc(v_change.price)
           OR (v_change.compare_at_price IS NOT NULL
               AND (v_change.compare_at_price < 0 OR v_change.compare_at_price <> trunc(v_change.compare_at_price)))
        THEN
            RAISE EXCEPTION 'every change needs a product and a whole-number price above zero' USING ERRCODE = '22023';
        END IF;

        SELECT tenant_id, price INTO v_tenant, v_old
          FROM public.products WHERE id = v_change.id FOR UPDATE;
        IF v_tenant IS NULL OR NOT public.has_tenant_permission(v_tenant, 'products.manage') THEN
            RAISE EXCEPTION 'product not found or not allowed' USING ERRCODE = '42501';
        END IF;

        UPDATE public.products
           SET price            = v_change.price,
               compare_at_price = CASE WHEN v_change.set_compare_at THEN v_change.compare_at_price ELSE compare_at_price END
         WHERE id = v_change.id;

        IF v_old IS DISTINCT FROM v_change.price THEN
            INSERT INTO public.product_price_history (product_id, tenant_id, old_price, new_price, changed_by, reason)
            VALUES (v_change.id, v_tenant, v_old, v_change.price, auth.uid()::text, p_reason);
        END IF;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_product_prices(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_prices(jsonb, text) TO authenticated;
