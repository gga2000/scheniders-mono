-- Products audit r33 S2: stock and price history can no longer be written by hand.
--
-- Both tables let any member with products.edit INSERT rows directly, so a
-- crafted request could add a fake "price was 5,000" or "+50 received" line.
--
-- inventory_history: every real writer is already a SECURITY DEFINER function
-- (adjust_product_stock, set_counted_stock, set_counted_open_box), so the
-- INSERT policy and grant are simply removed.
--
-- product_price_history: rows now come from a trigger on products.price, so
-- they always match the real change. A caller that wants its own reason
-- (set_product_prices, bulk and undo) sets app.price_change_reason for its
-- transaction; everything else is logged as "Manual price update".
-- changed_by stores the member's display name (the editor chart shows it).

CREATE OR REPLACE FUNCTION public.log_product_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_by text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.price IS NULL OR NEW.price <= 0 THEN
            RETURN NULL;
        END IF;
    ELSIF OLD.price IS NOT DISTINCT FROM NEW.price OR NEW.price IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT coalesce(nullif(btrim(up.display_name), ''), up.email)
      INTO v_by
      FROM public.user_profiles up
     WHERE up.id = auth.uid();

    INSERT INTO public.product_price_history (product_id, tenant_id, old_price, new_price, changed_by, reason)
    VALUES (
        NEW.id,
        NEW.tenant_id,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.price END,
        NEW.price,
        v_by,
        CASE
            WHEN TG_OP = 'INSERT' THEN 'Initial price'
            ELSE coalesce(nullif(current_setting('app.price_change_reason', true), ''), 'Manual price update')
        END
    );
    RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_product_price_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS log_product_price_change ON public.products;
CREATE TRIGGER log_product_price_change
    AFTER INSERT OR UPDATE OF price ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.log_product_price_change();

-- Same body as before, minus its own history INSERT (the trigger writes it)
-- and plus the reason hand-off to the trigger.
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
               coalesce(c.set_compare_at, false) AS set_compare_at, c.compare_at_price
          FROM jsonb_to_recordset(p_changes) AS c(
              id uuid, price numeric, expected_price numeric, set_compare_at boolean, compare_at_price numeric
          )
         ORDER BY c.id
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
        IF v_change.expected_price IS NOT NULL AND v_old IS DISTINCT FROM v_change.expected_price THEN
            RAISE EXCEPTION 'the price changed since this action; nothing was undone' USING ERRCODE = '40001';
        END IF;

        UPDATE public.products
           SET price            = v_change.price,
               compare_at_price = CASE WHEN v_change.set_compare_at THEN v_change.compare_at_price ELSE compare_at_price END
         WHERE id = v_change.id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$function$;

DROP POLICY IF EXISTS inventory_history_insert ON public.inventory_history;
DROP POLICY IF EXISTS product_price_history_insert ON public.product_price_history;
REVOKE INSERT ON public.inventory_history, public.product_price_history FROM authenticated, anon;
