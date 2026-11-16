-- Fermi B11: the guide's «أول طلب» stage has the merchant order from their
-- own store. The guide opens the store in draft view, so that order is a test
-- (is_test, source storefront): no WhatsApp to the customer, no fee, no trial
-- count, left out of the numbers. When the stage ends, those test orders go
-- with the practice orders: cancelled, which gives their stock back as for
-- any cancelled order, and moved to the bin.
--
--   guide_end_practice_orders(_tenant_id, _store_orders_since)
--     replaces the 1-argument version; without a time it does what it did.
--     With one, it also ends the shop's own test orders from its storefront
--     made since then that have not shipped.

DROP FUNCTION public.guide_end_practice_orders(uuid);

CREATE FUNCTION public.guide_end_practice_orders(_tenant_id uuid, _store_orders_since timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_practice integer;
    v_store integer := 0;
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_tenant_admin(_tenant_id) THEN
        RAISE EXCEPTION 'only the shop owner can end the practice orders' USING ERRCODE = '42501';
    END IF;
    UPDATE public.orders
       SET status = 'cancelled', deleted_at = now(), last_status_changed_by_name = 'دليلك'
     WHERE tenant_id = _tenant_id AND guide_practice AND deleted_at IS NULL;
    GET DIAGNOSTICS v_practice = ROW_COUNT;

    IF _store_orders_since IS NOT NULL THEN
        -- A shipped order is never binned (orders_refuse_shipped_trash); the
        -- merchant handles one of those like any other order.
        UPDATE public.orders
           SET status = 'cancelled', deleted_at = now(), last_status_changed_by_name = 'دليلك'
         WHERE tenant_id = _tenant_id
           AND is_test IS TRUE
           AND NOT guide_practice
           AND source = 'storefront'
           AND created_at >= _store_orders_since
           AND deleted_at IS NULL
           AND status IN ('new', 'contacted', 'confirmed', 'no_response', 'cancelled');
        GET DIAGNOSTICS v_store = ROW_COUNT;
    END IF;
    RETURN v_practice + v_store;
END;
$$;

REVOKE ALL ON FUNCTION public.guide_end_practice_orders(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guide_end_practice_orders(uuid, timestamptz) TO authenticated;
