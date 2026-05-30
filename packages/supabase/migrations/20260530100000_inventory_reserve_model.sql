-- =============================================
-- INVENTORY RESERVE-MODEL ENGINE (Spec C)
--
-- Inverts the old "decrement stock immediately" model. Under the new model
-- a confirmed order RESERVES stock; only orders that have actually left the
-- shelf (in_transit / delivered / completed) reduce physical stock.
--
--   inv_phase(status) → 'RESERVED' | 'FULFILLED' | 'CLOSED'
--   inv_apply(order_id, items, status, sign, tenant_id)
--                                  applies one order's effect with a sign
--   inv_order_changed()            reverse-old / apply-new trigger fn
--   recompute_inventory(tenant)    rebuild reserved_quantity from orders
--   zero_oversold(tenant)          top on-hand up to reserved for oversold rows
--
-- Open-box: items with `is_open_box=true` draw from a separate
-- `open_box_quantity` pile while the order is active (RESERVED or FULFILLED)
-- and are net-neutral on stock/reserved.
--
-- IMPORTANT: this migration also runs a one-time DATA CORRECTION. Mono's
-- previous create_order_atomic eagerly decremented stock when a confirmed
-- order was inserted. Under the new model that decrement is wrong — only
-- FULFILLED orders own physical stock. We add back the stock that was
-- pre-deducted for currently-confirmed orders, then recompute reserved.
-- =============================================

-- ─── 1. Schema columns ───────────────────────────────────────────────────────

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS open_box_quantity INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.product_variants
    ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.product_variants
    ADD COLUMN IF NOT EXISTS open_box_quantity INTEGER NOT NULL DEFAULT 0;

-- ─── 2. Inventory ledger ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    product_id      UUID REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id      UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    order_id        UUID REFERENCES public.orders(id)   ON DELETE SET NULL,
    delta_reserved  INTEGER NOT NULL DEFAULT 0,
    delta_stock     INTEGER NOT NULL DEFAULT 0,
    delta_open_box  INTEGER NOT NULL DEFAULT 0,
    reason          TEXT    NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_ledger_tenant  ON public.inventory_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_product ON public.inventory_ledger(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_variant ON public.inventory_ledger(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_order   ON public.inventory_ledger(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_created ON public.inventory_ledger(created_at DESC);

ALTER TABLE public.inventory_ledger ENABLE ROW LEVEL SECURITY;

-- Tenant members read their own ledger; writes are SECURITY DEFINER only.
DROP POLICY IF EXISTS inventory_ledger_read ON public.inventory_ledger;
CREATE POLICY inventory_ledger_read ON public.inventory_ledger
    FOR SELECT TO authenticated
    USING (
        tenant_id = public.get_current_tenant_id()
        OR tenant_id IS NULL  -- system-wide rows (recompute markers)
    );

-- ─── 3. inv_phase ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inv_phase(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_status = 'confirmed'                              THEN 'RESERVED'
    WHEN p_status IN ('in_transit','delivered','completed')  THEN 'FULFILLED'
    ELSE 'CLOSED'
  END;
$$;

-- ─── 4. inv_apply ────────────────────────────────────────────────────────────
--
-- Apply one order's stock effect with a sign: +1 = apply, -1 = reverse.
--
-- For each item in p_items:
--   * If it has a variant_id  → effect on product_variants
--     Else if it has a product_id → effect on products
--     Else: skipped (unlinked items have no inventory effect)
--
-- Phase rules (same for products and variants):
--   * Open-box item (is_open_box=true): open_box_quantity -= sign*qty
--                                       (only while RESERVED or FULFILLED)
--   * RESERVED:  reserved_quantity += sign*qty
--   * FULFILLED: stock_quantity    -= sign*qty
--   * CLOSED:    no effect
--
-- Every adjustment writes an inventory_ledger row tagged with p_tenant_id.

CREATE OR REPLACE FUNCTION public.inv_apply(
    p_order_id  uuid,
    p_items     jsonb,
    p_status    text,
    p_sign      integer,
    p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_phase text := public.inv_phase(p_status);
    v_item  jsonb;
    v_pid   uuid;
    v_vid   uuid;
    v_qty   integer;
    v_is_ob boolean;
BEGIN
    IF v_phase = 'CLOSED' THEN
        RETURN;
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RETURN;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := COALESCE(round((v_item->>'quantity')::numeric)::integer, 0);
        IF v_qty = 0 THEN
            CONTINUE;
        END IF;
        v_is_ob := COALESCE((v_item->>'is_open_box')::boolean, false);

        -- Resolve target: variant takes precedence over product
        v_vid := NULL;
        v_pid := NULL;
        IF nullif(v_item->>'variant_id','') IS NOT NULL
           AND (v_item->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            v_vid := (v_item->>'variant_id')::uuid;
        ELSIF nullif(v_item->>'product_id','') IS NOT NULL
              AND (v_item->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            v_pid := (v_item->>'product_id')::uuid;
        ELSE
            CONTINUE;  -- unlinked item: no inventory effect
        END IF;

        IF v_is_ob THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants
                   SET open_box_quantity = COALESCE(open_box_quantity,0) - p_sign * v_qty
                 WHERE id = v_vid;
            ELSE
                UPDATE public.products
                   SET open_box_quantity = COALESCE(open_box_quantity,0) - p_sign * v_qty
                 WHERE id = v_pid;
            END IF;
            INSERT INTO public.inventory_ledger(
                tenant_id, product_id, variant_id, order_id,
                delta_reserved, delta_stock, delta_open_box, reason
            ) VALUES (
                p_tenant_id, v_pid, v_vid, p_order_id,
                0, 0, -(p_sign * v_qty),
                'trigger:OPEN_BOX:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END)
            );

        ELSIF v_phase = 'RESERVED' THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants
                   SET reserved_quantity = COALESCE(reserved_quantity,0) + p_sign * v_qty
                 WHERE id = v_vid;
            ELSE
                UPDATE public.products
                   SET reserved_quantity = COALESCE(reserved_quantity,0) + p_sign * v_qty
                 WHERE id = v_pid;
            END IF;
            INSERT INTO public.inventory_ledger(
                tenant_id, product_id, variant_id, order_id,
                delta_reserved, delta_stock, delta_open_box, reason
            ) VALUES (
                p_tenant_id, v_pid, v_vid, p_order_id,
                p_sign * v_qty, 0, 0,
                'trigger:RESERVED:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END)
            );

        ELSIF v_phase = 'FULFILLED' THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants
                   SET stock_quantity = COALESCE(stock_quantity,0) - p_sign * v_qty
                 WHERE id = v_vid;
            ELSE
                UPDATE public.products
                   SET stock_quantity = COALESCE(stock_quantity,0) - p_sign * v_qty
                 WHERE id = v_pid;
            END IF;
            INSERT INTO public.inventory_ledger(
                tenant_id, product_id, variant_id, order_id,
                delta_reserved, delta_stock, delta_open_box, reason
            ) VALUES (
                p_tenant_id, v_pid, v_vid, p_order_id,
                0, -(p_sign * v_qty), 0,
                'trigger:FULFILLED:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END)
            );
        END IF;
    END LOOP;
END;
$$;

-- ─── 5. recompute_inventory ──────────────────────────────────────────────────
--
-- Deterministically rebuild reserved_quantity from currently-RESERVED orders.
-- Optional p_tenant_id scopes to one tenant; NULL recomputes all tenants
-- (admin-only super action). Does NOT touch stock_quantity or open_box_quantity
-- (those have no ground truth to recompute — they're physical piles).
-- Open-box order lines are excluded — they draw from open_box_quantity, not
-- reserved_quantity.

CREATE OR REPLACE FUNCTION public.recompute_inventory(p_tenant_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Reset reserved for the scoped tenant (or all)
    IF p_tenant_id IS NULL THEN
        UPDATE public.products         SET reserved_quantity = 0;
        UPDATE public.product_variants SET reserved_quantity = 0;
    ELSE
        UPDATE public.products
           SET reserved_quantity = 0
         WHERE tenant_id = p_tenant_id;
        UPDATE public.product_variants
           SET reserved_quantity = 0
         WHERE tenant_id = p_tenant_id;
    END IF;

    -- Rebuild from confirmed orders (RESERVED phase), products path
    UPDATE public.products p
       SET reserved_quantity = sub.qty
      FROM (
        SELECT (e->>'product_id')::uuid AS pid,
               SUM(round((e->>'quantity')::numeric)::integer) AS qty
          FROM public.orders o
          CROSS JOIN LATERAL jsonb_array_elements(o.items) e
         WHERE o.status = 'confirmed'
           AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
           AND nullif(e->>'variant_id','') IS NULL  -- variants handled below
           AND COALESCE((e->>'is_open_box')::boolean, false) = false
           AND nullif(e->>'product_id','') IS NOT NULL
           AND (e->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         GROUP BY 1
      ) sub
     WHERE p.id = sub.pid
       AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);

    -- Variants path
    UPDATE public.product_variants pv
       SET reserved_quantity = sub.qty
      FROM (
        SELECT (e->>'variant_id')::uuid AS vid,
               SUM(round((e->>'quantity')::numeric)::integer) AS qty
          FROM public.orders o
          CROSS JOIN LATERAL jsonb_array_elements(o.items) e
         WHERE o.status = 'confirmed'
           AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
           AND COALESCE((e->>'is_open_box')::boolean, false) = false
           AND nullif(e->>'variant_id','') IS NOT NULL
           AND (e->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         GROUP BY 1
      ) sub
     WHERE pv.id = sub.vid
       AND (p_tenant_id IS NULL OR pv.tenant_id = p_tenant_id);

    INSERT INTO public.inventory_ledger(tenant_id, product_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (p_tenant_id, NULL, NULL, 0, 0, 0, 'recompute:reserved');
END;
$$;

-- ─── 6. zero_oversold ────────────────────────────────────────────────────────
--
-- Top on-hand up to reserved for any product/variant where reserved > on-hand,
-- so oversold becomes 0. Supplies are untouched. Optional p_tenant_id scopes.

CREATE OR REPLACE FUNCTION public.zero_oversold(p_tenant_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.products
       SET stock_quantity = reserved_quantity
     WHERE NOT is_supply
       AND reserved_quantity > stock_quantity
       AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

    UPDATE public.product_variants
       SET stock_quantity = reserved_quantity
     WHERE reserved_quantity > stock_quantity
       AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

    INSERT INTO public.inventory_ledger(tenant_id, product_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
    VALUES (p_tenant_id, NULL, NULL, 0, 0, 0, 'zero_oversold');
END;
$$;

-- ─── 7. One-time data correction ─────────────────────────────────────────────
--
-- Under the old model, create_order_atomic decremented stock_quantity at the
-- moment a confirmed order was inserted. Under the reserve-model, confirmed
-- orders DO NOT decrement stock_quantity — they only fill reserved_quantity.
-- So for every currently-confirmed order, the matching stock_quantity is
-- under-counted by exactly the order's items. Add it back.
--
-- Open-box items don't apply (the old model never had them; nothing to undo).
-- Variants currently have 0 rows in the catalog, but we handle them for
-- forward-compat in case any exist now or are inserted before the trigger
-- becomes effective.

UPDATE public.products p
   SET stock_quantity = p.stock_quantity + sub.qty
  FROM (
    SELECT (e->>'product_id')::uuid AS pid,
           SUM(round((e->>'quantity')::numeric)::integer) AS qty
      FROM public.orders o
      CROSS JOIN LATERAL jsonb_array_elements(o.items) e
     WHERE o.status = 'confirmed'
       AND nullif(e->>'variant_id','') IS NULL
       AND nullif(e->>'product_id','') IS NOT NULL
       AND (e->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     GROUP BY 1
  ) sub
 WHERE p.id = sub.pid;

UPDATE public.product_variants pv
   SET stock_quantity = pv.stock_quantity + sub.qty
  FROM (
    SELECT (e->>'variant_id')::uuid AS vid,
           SUM(round((e->>'quantity')::numeric)::integer) AS qty
      FROM public.orders o
      CROSS JOIN LATERAL jsonb_array_elements(o.items) e
     WHERE o.status = 'confirmed'
       AND nullif(e->>'variant_id','') IS NOT NULL
       AND (e->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     GROUP BY 1
  ) sub
 WHERE pv.id = sub.vid;

INSERT INTO public.inventory_ledger(tenant_id, product_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
VALUES (NULL, NULL, NULL, 0, 0, 0, 'data_migration:restock_confirmed_orders');

-- ─── 8. Populate reserved_quantity from current orders ───────────────────────

SELECT public.recompute_inventory(NULL);

-- ─── 9. Replace create_order_atomic to skip manual stock decrement ───────────
--
-- The trigger now owns reserved/stock math. The only change vs. the previous
-- version of this function is the removal of the per-item UPDATE loop at the
-- bottom (former Step 7). Everything else — advisory lock, ID generation,
-- sequence number, INSERT — is preserved verbatim.

CREATE OR REPLACE FUNCTION create_order_atomic(_order_data jsonb, _tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _source_code text;
    _date_str text;
    _prefix text;
    _count int4;
    _next_sequence_number int4;
    _generated_order_id text;
    _result jsonb;
    _advisory_lock_id bigint;
BEGIN
    _source_code := CASE WHEN (_order_data->>'source') = 'whatsapp' THEN '1'
                         WHEN (_order_data->>'source') = 'meta'     THEN '2'
                         WHEN (_order_data->>'source') = 'tiktok'   THEN '3'
                         ELSE '4' END;

    _date_str := to_char(current_date, 'YYMMDD');
    _prefix   := _source_code || _date_str;

    _advisory_lock_id := hashtext('create_order_lock')::bigint;
    PERFORM pg_advisory_xact_lock(_advisory_lock_id);

    _generated_order_id := _order_data->>'order_id';
    IF _generated_order_id IS NULL OR _generated_order_id = '' THEN
        SELECT COALESCE(
            MAX(
                NULLIF(regexp_replace(SUBSTRING(order_id FROM length(_prefix) + 1), '\D', '', 'g'), '')::int
            ), 0
        ) INTO _count
        FROM public.orders
        WHERE order_id LIKE (_prefix || '%')
          AND created_at >= current_date
          AND (_tenant_id IS NULL OR tenant_id = _tenant_id);

        _generated_order_id := _prefix || lpad((_count + 1)::text, 3, '0');
        _order_data := jsonb_set(_order_data, '{order_id}', to_jsonb(_generated_order_id));
    END IF;

    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO _next_sequence_number
    FROM public.orders
    WHERE (_tenant_id IS NULL OR tenant_id = _tenant_id);

    _order_data := jsonb_set(_order_data, '{sequence_number}', to_jsonb(_next_sequence_number));
    _order_data := _order_data - 'id' - 'created_at' - 'updated_at';

    INSERT INTO public.orders (
        order_id, sequence_number, customer_name, phone, secondary_phone, city, address_details,
        items, price, delivery_fee, discount_amount, priority, status,
        payment_status, is_return, is_shop_order, source, governorate_code, validated_governorate_code,
        notes, risk_metadata, needs_attention, attention_reasons,
        last_status_changed_by_name, last_status_changed_by_avatar,
        tenant_id
    )
    SELECT
        _order_data->>'order_id',
        (_order_data->>'sequence_number')::int4,
        _order_data->>'customer_name',
        _order_data->>'phone',
        _order_data->>'secondary_phone',
        _order_data->>'city',
        _order_data->>'address_details',
        COALESCE(_order_data->'items', '[]'::jsonb),
        (_order_data->>'price')::numeric,
        COALESCE((_order_data->>'delivery_fee'), '0')::numeric,
        COALESCE(_order_data->>'discount_amount', '0')::numeric,
        COALESCE(_order_data->>'priority', 'normal'),
        COALESCE(_order_data->>'status', 'confirmed'),
        COALESCE(_order_data->>'payment_status', 'cod'),
        COALESCE((_order_data->>'is_return')::boolean, false),
        COALESCE((_order_data->>'is_shop_order')::boolean, false),
        COALESCE(_order_data->>'source', 'manual'),
        _order_data->>'governorate_code',
        _order_data->>'validated_governorate_code',
        _order_data->>'notes',
        _order_data->'risk_metadata',
        COALESCE((_order_data->>'needs_attention')::boolean, false),
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(_order_data->'attention_reasons', '[]'::jsonb))),
        _order_data->>'last_status_changed_by_name',
        _order_data->>'last_status_changed_by_avatar',
        _tenant_id
    RETURNING to_jsonb(orders.*) INTO _result;

    -- Reserved/stock math is now owned by trg_inv_order_changed on the orders
    -- table. The previous per-item UPDATE loop has been removed to avoid double
    -- counting.

    RETURN _result;
END;
$$;

-- ─── 10. Trigger function + binding ──────────────────────────────────────────
--
-- AFTER trigger so the orders row exists when inv_apply writes ledger rows
-- referencing order_id. DELETE path passes NULL for order_id because the row
-- is gone by the time an AFTER DELETE fires (FK insert would fail otherwise).

CREATE OR REPLACE FUNCTION public.inv_order_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF tg_op = 'INSERT' THEN
        PERFORM public.inv_apply(new.id, new.items, new.status, 1, new.tenant_id);
        RETURN new;
    ELSIF tg_op = 'DELETE' THEN
        PERFORM public.inv_apply(NULL, old.items, old.status, -1, old.tenant_id);
        RETURN old;
    ELSIF tg_op = 'UPDATE' THEN
        IF old.status IS DISTINCT FROM new.status
           OR old.items  IS DISTINCT FROM new.items THEN
            PERFORM public.inv_apply(old.id, old.items, old.status, -1, old.tenant_id);
            PERFORM public.inv_apply(new.id, new.items, new.status,  1, new.tenant_id);
        END IF;
        RETURN new;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_inv_order_changed ON public.orders;
CREATE TRIGGER trg_inv_order_changed
    AFTER INSERT OR UPDATE OR DELETE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.inv_order_changed();

-- ─── 11. Permissions ─────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.recompute_inventory(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.zero_oversold(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_inventory(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zero_oversold(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
