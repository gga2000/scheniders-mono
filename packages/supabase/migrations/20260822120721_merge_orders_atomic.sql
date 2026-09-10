-- COR-1 — atomic duplicate merge.
--
-- WHY
-- `mergeOrders` in the client performed three un-transactioned writes:
--   1. update the kept order with combined items + price
--   2. archive/reject the duplicate
--   3. insert two order_status_history rows
-- If (2) failed after (1) landed, the kept order already held the combined items
-- and revenue while the duplicate stayed ACTIVE — the same money and the same
-- stock counted twice across two live orders. (3) was unchecked entirely.
--
-- It also had two money/data defects:
--   * `discount_amount` was not combined, while `price` (which is net of the
--     discount) was. Editing the merged order later recomputes
--     `price = subtotal - discount_amount` and hands the archived order's
--     discount back to the customer.
--   * items were merged on `name` alone, so two different variants/SKUs sharing
--     a name were quantity-summed at whichever price happened to come first.
--
-- MONEY CONVENTION (canonical, verified against live data 2026-08-22, see
-- apps/platform/lib/order-money.ts): `price` is the line-item subtotal with the
-- discount ALREADY applied and delivery EXCLUDED. Therefore:
--   price          = keep.price + archive.price      (summing is correct)
--   discount_amount= keep.discount + archive.discount
--   delivery_fee   = greatest(keep, archive)         -- one shipment, one fee
--
-- DOWN MIGRATION
--   DROP FUNCTION IF EXISTS public.merge_orders_atomic(uuid, uuid, uuid);
-- and restore the previous client-side three-write path in use-order-crud.ts.

CREATE OR REPLACE FUNCTION public.merge_orders_atomic(
    _keep_order_id uuid,
    _archive_order_id uuid,
    _tenant_id uuid DEFAULT NULL::uuid,
    _changed_by text DEFAULT 'System'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _keep record;
    _archive record;
    _combined_items jsonb;
    _combined_price numeric;
    _combined_discount numeric;
    _combined_delivery numeric;
    _combined_notes text;
    _result jsonb;
BEGIN
    -- Same membership guard as split_order_atomic / create_order_atomic.
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;

    IF _keep_order_id = _archive_order_id THEN
        RAISE EXCEPTION 'Cannot merge an order into itself' USING ERRCODE = '22023';
    END IF;

    -- Lock BOTH rows up front, in a deterministic id order so two concurrent
    -- merges touching the same pair cannot deadlock.
    PERFORM 1 FROM public.orders
     WHERE id IN (_keep_order_id, _archive_order_id)
       AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
     ORDER BY id
       FOR UPDATE;

    SELECT * INTO _keep FROM public.orders
     WHERE id = _keep_order_id AND (_tenant_id IS NULL OR tenant_id = _tenant_id);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kept order not found in this tenant';
    END IF;

    SELECT * INTO _archive FROM public.orders
     WHERE id = _archive_order_id AND (_tenant_id IS NULL OR tenant_id = _tenant_id);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Duplicate order not found in this tenant';
    END IF;

    IF _archive.is_archived THEN
        RAISE EXCEPTION 'Duplicate order is already archived' USING ERRCODE = '22023';
    END IF;

    IF _keep.is_archived THEN
        RAISE EXCEPTION 'Kept order is archived - cannot merge into it' USING ERRCODE = '22023';
    END IF;

    -- Merge items on product_id -> sku -> name (name alone conflated variants),
    -- summing quantities and preserving the kept order's items first.
    WITH src AS (
        SELECT i.value AS item, 0 AS side, i.ordinality AS pos
          FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(_keep.items) = 'array' THEN _keep.items ELSE '[]'::jsonb END
               ) WITH ORDINALITY AS i(value, ordinality)
        UNION ALL
        SELECT i.value, 1, i.ordinality
          FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(_archive.items) = 'array' THEN _archive.items ELSE '[]'::jsonb END
               ) WITH ORDINALITY AS i(value, ordinality)
    ), keyed AS (
        SELECT coalesce(item->>'product_id', item->>'sku', item->>'name') AS merge_key,
               item, side, pos,
               coalesce(NULLIF(item->>'quantity','')::numeric, 1) AS qty
          FROM src
    ), agg AS (
        SELECT merge_key,
               min(side * 100000 + pos) AS sort_key,
               sum(qty) AS total_qty,
               (array_agg(item ORDER BY side, pos))[1] AS base_item
          FROM keyed
         GROUP BY merge_key
    )
    SELECT coalesce(
             jsonb_agg(jsonb_set(base_item, '{quantity}', to_jsonb(total_qty)) ORDER BY sort_key),
             '[]'::jsonb)
      INTO _combined_items
      FROM agg;

    -- Canonical money aggregation (see header).
    _combined_price    := coalesce(_keep.price, 0) + coalesce(_archive.price, 0);
    _combined_discount := coalesce(_keep.discount_amount, 0) + coalesce(_archive.discount_amount, 0);
    _combined_delivery := greatest(coalesce(_keep.delivery_fee, 0), coalesce(_archive.delivery_fee, 0));

    _combined_notes := NULLIF(
        concat_ws(' | ', NULLIF(_keep.notes, ''), NULLIF(_archive.notes, '')), '');

    UPDATE public.orders
       SET items           = _combined_items,
           price           = _combined_price,
           discount_amount = _combined_discount,
           delivery_fee    = _combined_delivery,
           notes           = coalesce(_combined_notes, _keep.notes)
     WHERE id = _keep_order_id;

    UPDATE public.orders
       SET is_archived      = true,
           status           = 'rejected',
           rejection_reason = 'duplicate_merged',
           notes            = trim(concat('[مدمج مع #', _keep.order_id, '] ', coalesce(_archive.notes, '')))
     WHERE id = _archive_order_id;

    INSERT INTO public.order_status_history
        (order_id, changed_by, from_status, to_status, notes, tenant_id)
    VALUES
        (_keep_order_id, _changed_by, _keep.status, _keep.status,
         concat('Merged with #', _archive.order_id), _keep.tenant_id),
        (_archive_order_id, _changed_by, _archive.status, 'rejected',
         concat('Merged into #', _keep.order_id), _archive.tenant_id);

    SELECT to_jsonb(o.*) INTO _result FROM public.orders o WHERE o.id = _keep_order_id;
    RETURN _result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_orders_atomic(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_orders_atomic(uuid, uuid, uuid, text) TO authenticated, service_role;

-- ── Follow-up (same round): two defects found in self-review ─────────────────
-- 1. `REVOKE ... FROM anon` above is a NO-OP: the grant that matters is the
--    implicit PUBLIC one (`proacl` showed `=X/postgres`), which anon inherits.
--    Revoke from PUBLIC instead. The in-function tenant guard already blocks
--    anon, but EXECUTE should not be handed out in the first place.
-- 2. Only the duplicate was checked for `is_archived`. A reversed concurrent
--    merge could fold combined revenue into an already-archived/rejected kept
--    order. Guard the kept side too.
