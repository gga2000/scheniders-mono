-- Tenant-scoped stock writes in the inventory functions (finding F-001, P0).
--
-- WHAT IT FIXES
--   process_return, undo_return and inv_apply (fired by trg_inv_order_changed
--   on public.orders) are SECURITY DEFINER and owned by postgres, so RLS does
--   not apply inside them. They updated products / product_variants
--   `WHERE id = <id>` with ids taken from the caller's jsonb (process_return),
--   from inventory_ledger (undo_return) or from orders.items (inv_apply), with
--   no tenant predicate. Any tenant member could zero, inflate or reserve
--   another tenant's stock: pass a victim product id to process_return, or
--   write an order (PostgREST INSERT/UPDATE, create_order_atomic, the platform
--   createOrderForTenant path, storefront checkout) whose items name a victim
--   product. A negative item quantity made inv_apply ADD stock.
--
-- WHAT CHANGES
--   1. inv_apply: every UPDATE is `AND tenant_id = p_tenant_id`; the ledger row
--      is written only when a row of that tenant was actually moved; quantities
--      <= 0 are skipped (the old `= 0` let a negative quantity add stock).
--   2. process_return: each destination's product / variant must belong to
--      _tenant_id, else 42501 and the whole call (status change included)
--      rolls back; the UPDATEs also carry the tenant predicate.
--   3. undo_return: only reverses this tenant's ledger rows, and only moves
--      this tenant's products / variants.
--   4. New BEFORE INSERT OR UPDATE OF items, tenant_id trigger on orders
--      (tg_orders_items_tenant_guard): rejects an item whose product_id or
--      variant_id is a row of another tenant, and a negative quantity. This is
--      the single choke point for every order writer, including both
--      create_order_atomic overloads (their bodies are unchanged).
--
--   Signatures, return types and grants are unchanged; bodies start from the
--   live pg_get_functiondef on sduvpgqwhxragxtxztur (read 2026-10-20).
--
-- LIVE DATA CHECK (SELECT only, 2026-10-20): 0 order items reference another
-- tenant's product or variant, 0 have a negative quantity, 0 inventory_ledger
-- rows disagree with their product's tenant. No existing row trips the guard.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_orders_items_tenant_guard ON public.orders;
--   DROP FUNCTION IF EXISTS public.tg_orders_items_tenant_guard();
--   then re-run the previous bodies of inv_apply / process_return /
--   undo_return (pg_get_functiondef output recorded in
--   packages/supabase/tests/cross_tenant_stock_local_fixture.sql).

-- ---------------------------------------------------------------------------
-- 1. inv_apply
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inv_apply(p_order_id uuid, p_items jsonb, p_status text, p_sign integer, p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_phase text := public.inv_phase(p_status);
    v_item jsonb; v_pid uuid; v_vid uuid; v_qty integer; v_is_ob boolean;
BEGIN
    IF v_phase = 'CLOSED' THEN RETURN; END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RETURN; END IF;
    IF p_tenant_id IS NULL THEN RETURN; END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_qty := COALESCE(round((v_item->>'quantity')::numeric)::integer, 0);
        -- F-001: a negative quantity used to invert the movement (FULFILLED
        -- with -n added n to stock). Orders reject it now; skip it here too.
        IF v_qty <= 0 THEN CONTINUE; END IF;
        v_is_ob := COALESCE((v_item->>'is_open_box')::boolean, false);
        v_vid := NULL; v_pid := NULL;
        IF nullif(v_item->>'variant_id','') IS NOT NULL
           AND (v_item->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            v_vid := (v_item->>'variant_id')::uuid;
        ELSIF nullif(v_item->>'product_id','') IS NOT NULL
              AND (v_item->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            v_pid := (v_item->>'product_id')::uuid;
        ELSE CONTINUE; END IF;

        -- F-001: every UPDATE is scoped to the order's tenant, and the ledger
        -- row is written only when one of that tenant's rows moved.
        IF v_is_ob THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants SET open_box_quantity = COALESCE(open_box_quantity,0) - p_sign * v_qty
                 WHERE id = v_vid AND tenant_id = p_tenant_id;
            ELSE
                UPDATE public.products SET open_box_quantity = COALESCE(open_box_quantity,0) - p_sign * v_qty
                 WHERE id = v_pid AND tenant_id = p_tenant_id;
            END IF;
            IF NOT FOUND THEN CONTINUE; END IF;
            INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
            VALUES (p_tenant_id, v_pid, v_vid, p_order_id, 0, 0, -(p_sign * v_qty),
                    'trigger:OPEN_BOX:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END));
        ELSIF v_phase = 'RESERVED' THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants SET reserved_quantity = COALESCE(reserved_quantity,0) + p_sign * v_qty
                 WHERE id = v_vid AND tenant_id = p_tenant_id;
            ELSE
                UPDATE public.products SET reserved_quantity = COALESCE(reserved_quantity,0) + p_sign * v_qty
                 WHERE id = v_pid AND tenant_id = p_tenant_id;
            END IF;
            IF NOT FOUND THEN CONTINUE; END IF;
            INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
            VALUES (p_tenant_id, v_pid, v_vid, p_order_id, p_sign * v_qty, 0, 0,
                    'trigger:RESERVED:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END));
        ELSIF v_phase = 'FULFILLED' THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants SET stock_quantity = COALESCE(stock_quantity,0) - p_sign * v_qty
                 WHERE id = v_vid AND tenant_id = p_tenant_id;
            ELSE
                UPDATE public.products SET stock_quantity = COALESCE(stock_quantity,0) - p_sign * v_qty
                 WHERE id = v_pid AND tenant_id = p_tenant_id;
            END IF;
            IF NOT FOUND THEN CONTINUE; END IF;
            INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
            VALUES (p_tenant_id, v_pid, v_vid, p_order_id, 0, -(p_sign * v_qty), 0,
                    'trigger:FULFILLED:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END));
        END IF;
    END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.inv_apply(uuid, jsonb, text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inv_apply(uuid, jsonb, text, integer, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. process_return
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_return(_order_id uuid, _tenant_id uuid, _reason_label text, _changed_by_name text, _changed_by_avatar text, _destinations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_prev_status text;
    v_order_tenant uuid;
    d    jsonb;
    pid  uuid;
    vid  uuid;
    qty  integer;
    dest text;
BEGIN

    -- >>> SEC-4 GUARD
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: tenant membership required'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    -- <<< SEC-4 GUARD
    SELECT status, tenant_id INTO v_prev_status, v_order_tenant
      FROM public.orders WHERE id = _order_id;

    IF v_prev_status IS NULL THEN
        RAISE EXCEPTION 'order % not found', _order_id;
    END IF;

    IF v_order_tenant IS DISTINCT FROM _tenant_id THEN
        RAISE EXCEPTION 'tenant mismatch: caller=% order=%', _tenant_id, v_order_tenant;
    END IF;

    UPDATE public.orders
       SET status = 'rejected',
           rejection_reason = _reason_label,
           last_status_changed_by_name = _changed_by_name,
           last_status_changed_by_avatar = _changed_by_avatar,
           updated_at = now()
     WHERE id = _order_id;

    INSERT INTO public.order_status_history(order_id, from_status, to_status, changed_at, notes, changed_by, tenant_id)
    VALUES (_order_id, v_prev_status, 'rejected', now(), _reason_label, _changed_by_name, _tenant_id);

    IF _destinations IS NOT NULL AND jsonb_typeof(_destinations) = 'array' THEN
        FOR d IN SELECT value FROM jsonb_array_elements(_destinations)
        LOOP
            qty  := COALESCE(round((d->>'quantity')::numeric)::integer, 0);
            dest := d->>'dest';
            IF qty <= 0 THEN CONTINUE; END IF;

            vid := NULL; pid := NULL;
            IF nullif(d->>'variant_id','') IS NOT NULL
               AND (d->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
                vid := (d->>'variant_id')::uuid;
            ELSIF nullif(d->>'product_id','') IS NOT NULL
                  AND (d->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
                pid := (d->>'product_id')::uuid;
            ELSE
                CONTINUE;
            END IF;

            -- F-001: the goods being routed must be this tenant's. Raising
            -- rolls back the whole return, status change included.
            IF vid IS NOT NULL THEN
                PERFORM 1 FROM public.product_variants WHERE id = vid AND tenant_id = _tenant_id;
            ELSE
                PERFORM 1 FROM public.products WHERE id = pid AND tenant_id = _tenant_id;
            END IF;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'process_return: % % does not belong to tenant %',
                    CASE WHEN vid IS NOT NULL THEN 'variant' ELSE 'product' END,
                    coalesce(vid, pid), _tenant_id
                    USING ERRCODE = '42501';
            END IF;

            IF dest = 'write_off' THEN
                IF vid IS NOT NULL THEN
                    UPDATE public.product_variants SET stock_quantity = GREATEST(0, stock_quantity - qty)
                     WHERE id = vid AND tenant_id = _tenant_id;
                ELSE
                    UPDATE public.products         SET stock_quantity = GREATEST(0, stock_quantity - qty)
                     WHERE id = pid AND tenant_id = _tenant_id;
                END IF;
                INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
                VALUES (_tenant_id, pid, vid, _order_id, 0, -qty, 0, 'return:write_off');

            ELSIF dest = 'open_box' THEN
                IF vid IS NOT NULL THEN
                    UPDATE public.product_variants
                       SET stock_quantity    = GREATEST(0, stock_quantity - qty),
                           open_box_quantity = COALESCE(open_box_quantity,0) + qty
                     WHERE id = vid AND tenant_id = _tenant_id;
                ELSE
                    UPDATE public.products
                       SET stock_quantity    = GREATEST(0, stock_quantity - qty),
                           open_box_quantity = COALESCE(open_box_quantity,0) + qty
                     WHERE id = pid AND tenant_id = _tenant_id;
                END IF;
                INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
                VALUES (_tenant_id, pid, vid, _order_id, 0, -qty, qty, 'return:open_box');

            ELSE
                INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
                VALUES (_tenant_id, pid, vid, _order_id, 0, 0, 0, 'return:restock');
            END IF;
        END LOOP;
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_return(uuid, uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_return(uuid, uuid, text, text, text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. undo_return
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_return(_order_id uuid, _tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_prev_status text;
    v_order_tenant uuid;
    v_cutoff timestamptz;
    r RECORD;
BEGIN
    -- >>> SEC-4 GUARD
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: tenant membership required'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    -- <<< SEC-4 GUARD

    SELECT status, tenant_id INTO v_prev_status, v_order_tenant
      FROM public.orders WHERE id = _order_id;

    IF v_prev_status IS NULL THEN
        RAISE EXCEPTION 'order % not found', _order_id;
    END IF;

    IF v_order_tenant IS DISTINCT FROM _tenant_id THEN
        RAISE EXCEPTION 'tenant mismatch: caller=% order=%', _tenant_id, v_order_tenant;
    END IF;

    IF v_prev_status <> 'rejected' THEN
        RAISE EXCEPTION 'undo_return: order % is not in rejected state (status=%)', _order_id, v_prev_status;
    END IF;

    SELECT MAX(created_at) INTO v_cutoff
      FROM public.inventory_ledger
     WHERE order_id = _order_id
       AND tenant_id = _tenant_id
       AND reason LIKE 'return:%';

    IF v_cutoff IS NULL THEN
        UPDATE public.orders SET status = 'confirmed', rejection_reason = NULL, updated_at = now() WHERE id = _order_id;
        RETURN;
    END IF;

    FOR r IN
        SELECT product_id, variant_id, delta_stock, delta_open_box, reason
          FROM public.inventory_ledger
         WHERE order_id = _order_id
           AND tenant_id = _tenant_id
           AND reason LIKE 'return:%'
           AND created_at >= v_cutoff - INTERVAL '1 second'
    LOOP
        -- F-001: a ledger row written before this fix may name another
        -- tenant's product; never move it, and record nothing for it.
        IF r.variant_id IS NOT NULL THEN
            PERFORM 1 FROM public.product_variants WHERE id = r.variant_id AND tenant_id = _tenant_id;
            IF NOT FOUND THEN CONTINUE; END IF;
        ELSIF r.product_id IS NOT NULL THEN
            PERFORM 1 FROM public.products WHERE id = r.product_id AND tenant_id = _tenant_id;
            IF NOT FOUND THEN CONTINUE; END IF;
        END IF;

        IF r.reason = 'return:write_off' THEN
            IF r.variant_id IS NOT NULL THEN
                UPDATE public.product_variants SET stock_quantity = stock_quantity + (-r.delta_stock)
                 WHERE id = r.variant_id AND tenant_id = _tenant_id;
            ELSIF r.product_id IS NOT NULL THEN
                UPDATE public.products         SET stock_quantity = stock_quantity + (-r.delta_stock)
                 WHERE id = r.product_id AND tenant_id = _tenant_id;
            END IF;
        ELSIF r.reason = 'return:open_box' THEN
            IF r.variant_id IS NOT NULL THEN
                UPDATE public.product_variants
                   SET stock_quantity    = stock_quantity + (-r.delta_stock),
                       open_box_quantity = GREATEST(0, open_box_quantity - r.delta_open_box)
                 WHERE id = r.variant_id AND tenant_id = _tenant_id;
            ELSIF r.product_id IS NOT NULL THEN
                UPDATE public.products
                   SET stock_quantity    = stock_quantity + (-r.delta_stock),
                       open_box_quantity = GREATEST(0, open_box_quantity - r.delta_open_box)
                 WHERE id = r.product_id AND tenant_id = _tenant_id;
            END IF;
        END IF;

        INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
        VALUES (_tenant_id, r.product_id, r.variant_id, _order_id, 0, -r.delta_stock, -r.delta_open_box, 'undo_return:' || r.reason);
    END LOOP;

    UPDATE public.orders
       SET status = 'confirmed',
           rejection_reason = NULL,
           updated_at = now()
     WHERE id = _order_id;

    INSERT INTO public.order_status_history(order_id, from_status, to_status, changed_at, notes, changed_by, tenant_id)
    VALUES (_order_id, 'rejected', 'confirmed', now(), 'undo_return', NULL, _tenant_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.undo_return(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_return(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. orders.items guard — every writer of orders goes through it.
--    SECURITY DEFINER so it sees the other tenant's product (under the
--    caller's RLS a foreign product is invisible and would look "unknown").
--    Ids that match no row are left alone (deleted products in historical
--    orders, name-only legacy lines); the FK-less jsonb cannot do better and
--    inv_apply now ignores such ids.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_orders_items_tenant_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_item jsonb;
    v_qty numeric;
    v_owner uuid;
    v_found boolean;
BEGIN
    IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' THEN
        RETURN NEW;
    END IF;
    IF tg_op = 'UPDATE'
       AND NEW.items IS NOT DISTINCT FROM OLD.items
       AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id THEN
        RETURN NEW;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
        IF jsonb_typeof(v_item) <> 'object' THEN CONTINUE; END IF;

        -- Only a numeric quantity is judged here; anything else keeps its
        -- previous behaviour (inv_apply casts it the same way it always has).
        v_qty := CASE WHEN (v_item->>'quantity') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
                      THEN (v_item->>'quantity')::numeric END;
        IF v_qty < 0 THEN
            RAISE EXCEPTION 'order item quantity must not be negative (got %)', v_qty
                USING ERRCODE = '23514';
        END IF;

        IF (v_item->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            SELECT true, tenant_id INTO v_found, v_owner
              FROM public.product_variants WHERE id = (v_item->>'variant_id')::uuid;
            IF v_found AND v_owner IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'order item variant % belongs to another tenant', v_item->>'variant_id'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
        v_found := NULL;

        IF (v_item->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            SELECT true, tenant_id INTO v_found, v_owner
              FROM public.products WHERE id = (v_item->>'product_id')::uuid;
            IF v_found AND v_owner IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'order item product % belongs to another tenant', v_item->>'product_id'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
        v_found := NULL;
    END LOOP;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_orders_items_tenant_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_orders_items_tenant_guard() TO service_role;

DROP TRIGGER IF EXISTS trg_orders_items_tenant_guard ON public.orders;
CREATE TRIGGER trg_orders_items_tenant_guard
    BEFORE INSERT OR UPDATE OF items, tenant_id ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.tg_orders_items_tenant_guard();
