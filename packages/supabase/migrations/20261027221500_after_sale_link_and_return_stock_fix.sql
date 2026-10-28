-- After-sale foundation, phase 1 (replacements/returns redesign, 2026-10-27).
-- 1. create_order_atomic writes is_replacement + original_order_id (same tenant
--    enforced). Since the atomic RPC landed it dropped both, so every RTN-/RPL-
--    order created after 2026-05-25 was saved unlinked from its original.
-- 2. orders.original_order_id: FK to orders + same-tenant trigger.
-- 3. Return orders (is_return) never move stock through the order trigger: their
--    items are coming back to us, not going out. An RTN order in in_transit used
--    to take -qty from stock (FULFILLED) and give it back at refund_delivered, so
--    returned goods never re-entered stock. Stock for returned goods moves only
--    when the item is received and inspected (process_return destinations).
-- 4. recompute_inventory ignores return orders for the same reason.
-- Data repairs (relinking orphans, RTN-3907-1's -1) ship separately after review.
SET LOCAL lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. create_order_atomic(jsonb, uuid)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb, _tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _source_code text; _next_sequence_number int4; _generated_order_id text; _result jsonb;
  _items_safe jsonb; _attention_safe jsonb; _idem text; _is_server boolean;
  _is_replacement boolean; _original_order_id uuid;
BEGIN
  -- PKG-02: every order belongs to a tenant, whoever the caller is. Without
  -- one the replay lookup and sequence_number would span all tenants.
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'create_order_atomic: tenant_id is required' USING ERRCODE = '22023';
  END IF;

  _is_server := coalesce(auth.role(), 'service_role') = 'service_role';
  IF NOT _is_server THEN
    IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
      RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Replay first, before any lock: a lost-response retry never queues.
  _idem := NULLIF(_order_data->>'idempotency_key', '');
  IF _idem IS NOT NULL THEN
    SELECT public.mask_order_margin(to_jsonb(orders.*), orders.tenant_id) INTO _result FROM public.orders
     WHERE idempotency_key = _idem AND tenant_id = _tenant_id
     LIMIT 1;
    IF _result IS NOT NULL THEN
      RETURN _result || jsonb_build_object('idempotent_replay', true);
    END IF;
  END IF;

  -- F-040: order numbers are the server's. Only the service role may pass one
  -- through (LightFunnels order names, server-built return/clone numbers).
  _generated_order_id := NULLIF(_order_data->>'order_id', '');
  IF _generated_order_id IS NOT NULL AND NOT _is_server THEN
    RAISE EXCEPTION 'order_id is assigned by the server' USING ERRCODE = '42501';
  END IF;

  -- F-041: per-tenant, not global. It serialises only this tenant's calls,
  -- for the per-tenant sequence_number below and the replay re-check.
  PERFORM pg_advisory_xact_lock(hashtextextended('create_order_atomic:' || _tenant_id::text, 0));

  IF _idem IS NOT NULL THEN
    SELECT public.mask_order_margin(to_jsonb(orders.*), orders.tenant_id) INTO _result FROM public.orders
     WHERE idempotency_key = _idem AND tenant_id = _tenant_id
     LIMIT 1;
    IF _result IS NOT NULL THEN
      RETURN _result || jsonb_build_object('idempotent_replay', true);
    END IF;
  END IF;

  IF _generated_order_id IS NULL THEN
    _source_code := CASE
      WHEN (_order_data->>'source') = 'whatsapp' THEN '1'
      WHEN (_order_data->>'source') = 'meta'     THEN '2'
      WHEN (_order_data->>'source') = 'tiktok'   THEN '3'
      ELSE '4'
    END;
    _generated_order_id := public.next_order_number(_source_code);
  END IF;
  _order_data := jsonb_set(_order_data, '{order_id}', to_jsonb(_generated_order_id));

  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO _next_sequence_number
    FROM public.orders WHERE tenant_id = _tenant_id;
  _order_data := jsonb_set(_order_data, '{sequence_number}', to_jsonb(_next_sequence_number));
  _order_data := _order_data - 'id' - 'created_at' - 'updated_at';

  -- After-sale link: a return or replacement must point at an order of this
  -- tenant. Both used to be dropped here, leaving RTN-/RPL- orders unlinked.
  -- A return is never a replacement: split_order_atomic builds its return
  -- order from to_jsonb(original), which carries the original's own flag.
  _is_replacement := COALESCE((_order_data->>'is_replacement')::boolean, false)
                     AND NOT COALESCE((_order_data->>'is_return')::boolean, false);
  _original_order_id := NULLIF(_order_data->>'original_order_id', '')::uuid;
  IF _original_order_id IS NOT NULL THEN
    PERFORM 1 FROM public.orders WHERE id = _original_order_id AND tenant_id = _tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'original order % is not an order of this tenant', _original_order_id USING ERRCODE = '23503';
    END IF;
  END IF;
  _items_safe := CASE WHEN jsonb_typeof(_order_data->'items') = 'array' THEN _order_data->'items' ELSE '[]'::jsonb END;
  _attention_safe := CASE WHEN jsonb_typeof(_order_data->'attention_reasons') = 'array' THEN _order_data->'attention_reasons' ELSE '[]'::jsonb END;

  INSERT INTO public.orders (
    order_id, sequence_number, customer_name, phone, secondary_phone, city, address_details,
    items, price, delivery_fee, discount_amount, priority, status, payment_status, is_return,
    is_shop_order, source, governorate_code, validated_governorate_code, notes, risk_metadata,
    needs_attention, attention_reasons, last_status_changed_by_name, last_status_changed_by_avatar,
    attribution, ad_channel, is_replacement, original_order_id,
    idempotency_key, tenant_id
  )
  SELECT
    _order_data->>'order_id', (_order_data->>'sequence_number')::int4,
    _order_data->>'customer_name', _order_data->>'phone', _order_data->>'secondary_phone',
    _order_data->>'city', _order_data->>'address_details', _items_safe,
    (_order_data->>'price')::numeric, COALESCE((_order_data->>'delivery_fee'), '0')::numeric,
    COALESCE(_order_data->>'discount_amount', '0')::numeric, COALESCE(_order_data->>'priority', 'normal'),
    COALESCE(_order_data->>'status', 'confirmed'), COALESCE(_order_data->>'payment_status', 'cod'),
    COALESCE((_order_data->>'is_return')::boolean, false), COALESCE((_order_data->>'is_shop_order')::boolean, false),
    COALESCE(_order_data->>'source', 'manual'), _order_data->>'governorate_code',
    _order_data->>'validated_governorate_code', _order_data->>'notes', _order_data->'risk_metadata',
    COALESCE((_order_data->>'needs_attention')::boolean, false),
    ARRAY(SELECT jsonb_array_elements_text(_attention_safe)),
    _order_data->>'last_status_changed_by_name', _order_data->>'last_status_changed_by_avatar',
    -- Guard the shape: a malformed payload must not abort an order creation.
    CASE WHEN jsonb_typeof(_order_data->'attribution') = 'object' THEN _order_data->'attribution' ELSE NULL END,
    NULLIF(_order_data->>'ad_channel', ''), _is_replacement, _original_order_id,
    _idem, _tenant_id
  RETURNING public.mask_order_margin(to_jsonb(orders.*), orders.tenant_id) INTO _result;
  RETURN _result;
END;
$function$;

-- Restate the live ACL (postgres, authenticated, service_role).
REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. original_order_id integrity
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
    ADD CONSTRAINT orders_original_order_id_fkey
    FOREIGN KEY (original_order_id) REFERENCES public.orders(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_original_order_id_fkey;

CREATE INDEX IF NOT EXISTS idx_orders_original_order_id
    ON public.orders(original_order_id) WHERE original_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.orders_original_same_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF new.original_order_id IS NULL THEN RETURN new; END IF;
    IF new.original_order_id = new.id THEN
        RAISE EXCEPTION 'an order cannot be its own original' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.orders WHERE id = new.original_order_id AND tenant_id = new.tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'original order % is not an order of this tenant', new.original_order_id
            USING ERRCODE = '23503';
    END IF;
    RETURN new;
END;
$function$;

REVOKE ALL ON FUNCTION public.orders_original_same_tenant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_original_same_tenant ON public.orders;
CREATE TRIGGER trg_orders_original_same_tenant
    BEFORE INSERT OR UPDATE OF original_order_id, tenant_id ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_original_same_tenant();

-- ---------------------------------------------------------------------------
-- 3. inv_order_changed: return orders carry incoming goods, never stock moves
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inv_order_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF tg_op = 'INSERT' THEN
        IF NOT COALESCE(new.is_return, false) THEN
            PERFORM public.inv_apply(new.id, new.items, new.status, 1, new.tenant_id);
        END IF;
        RETURN new;
    ELSIF tg_op = 'DELETE' THEN
        IF NOT COALESCE(old.is_return, false) THEN
            PERFORM public.inv_apply(NULL, old.items, old.status, -1, old.tenant_id);
        END IF;
        RETURN old;
    ELSIF tg_op = 'UPDATE' THEN
        IF old.status IS DISTINCT FROM new.status OR old.items IS DISTINCT FROM new.items
           OR old.is_return IS DISTINCT FROM new.is_return THEN
            IF NOT COALESCE(old.is_return, false) THEN
                PERFORM public.inv_apply(old.id, old.items, old.status, -1, old.tenant_id);
            END IF;
            IF NOT COALESCE(new.is_return, false) THEN
                PERFORM public.inv_apply(new.id, new.items, new.status,  1, new.tenant_id);
            END IF;
        END IF;
        RETURN new;
    END IF;
    RETURN NULL;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 4. recompute_inventory: return orders never reserve
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_inventory(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
       AND (p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids())) THEN
        RAISE EXCEPTION 'not a member of this tenant' USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL THEN
        UPDATE public.products         SET reserved_quantity = 0;
        UPDATE public.product_variants SET reserved_quantity = 0;
    ELSE
        UPDATE public.products         SET reserved_quantity = 0 WHERE tenant_id = p_tenant_id;
        UPDATE public.product_variants SET reserved_quantity = 0 WHERE tenant_id = p_tenant_id;
    END IF;

    UPDATE public.products p SET reserved_quantity = sub.qty
      FROM (
        SELECT (e->>'product_id')::uuid AS pid,
               SUM(round((e->>'quantity')::numeric)::integer) AS qty
          FROM public.orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) e
         WHERE o.status = 'confirmed'
           AND NOT COALESCE(o.is_return, false)
           AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
           AND nullif(e->>'variant_id','') IS NULL
           AND COALESCE((e->>'is_open_box')::boolean, false) = false
           AND nullif(e->>'product_id','') IS NOT NULL
           AND (e->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         GROUP BY 1
      ) sub
     WHERE p.id = sub.pid AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);

    UPDATE public.product_variants pv SET reserved_quantity = sub.qty
      FROM (
        SELECT (e->>'variant_id')::uuid AS vid,
               SUM(round((e->>'quantity')::numeric)::integer) AS qty
          FROM public.orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) e
         WHERE o.status = 'confirmed'
           AND NOT COALESCE(o.is_return, false)
           AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
           AND COALESCE((e->>'is_open_box')::boolean, false) = false
           AND nullif(e->>'variant_id','') IS NOT NULL
           AND (e->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         GROUP BY 1
      ) sub
     WHERE pv.id = sub.vid AND (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id);

    INSERT INTO public.inventory_ledger(tenant_id, product_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (p_tenant_id, NULL, NULL, 0, 0, 0, 'recompute:reserved');
END;
$function$;
