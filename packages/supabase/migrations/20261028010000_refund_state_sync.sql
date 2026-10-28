-- =============================================
-- REFUNDS: the database keeps an original order's refund state in step
-- with its refund orders (RTN).
--
-- Before this, nothing in the app set orders.refund_status: since the
-- late-May cutover every refunded original still read "none", so refunded
-- sales were counted as genuine sales and paid as commission.
--
-- refresh_original_refund_state(original) recomputes, from the original's
-- refund orders in the SAME tenant:
--   * refund_status: 'pending' while any refund order is still open,
--     else 'refunded' when every unit bought has been refunded, 'partial'
--     when some have, 'none' when none have (failed refunds count nothing);
--   * refunded_amount: whole IQD paid back for items (before the pickup fee
--     kept), summed over completed refunds;
--   * refunded_at: when the latest completed refund reached the customer.
-- What a refund covered comes from after_sale_items (per original line);
-- refund orders created before that table carry no rows there, and for
-- those the refund order's own items and price are used.
--
-- Money layout of a refund order: price = minus the items refunded,
-- delivery_fee = the pickup fee kept, so the customer receives
-- -(price + delivery_fee). The old flow stored price already net of the fee
-- (price = -(items - fee)) while also keeping the fee in delivery_fee, which
-- counts the fee twice; those rows are rewritten to the one layout below
-- (approved by Ali 2026-10-28).
--
-- The three columns are owned by this function. A BEFORE UPDATE guard
-- keeps them unchanged unless the write comes from here, so an app save
-- that spreads a whole order can't overwrite them.
-- =============================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS refunded_amount integer NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0);

GRANT SELECT (refunded_amount) ON public.orders TO authenticated;

-- Old refund orders stored net of the fee: put the fee back into price.
-- Only rows whose numbers prove that layout (fee - price = items) are
-- touched; irregular rows are left for a person to read. This corrects
-- history, so the order triggers (updated_at, version, notifications,
-- loyalty, trust, inventory) stay out of it: updated_at is when the
-- customer was paid and must not move.
ALTER TABLE public.orders DISABLE TRIGGER USER;
UPDATE public.orders o
   SET price = o.price - o.delivery_fee
 WHERE o.is_return
   AND o.deleted_at IS NULL
   AND coalesce(o.delivery_fee, 0) > 0
   AND o.price < 0
   AND -o.price + o.delivery_fee = (
       SELECT coalesce(sum((i->>'price')::numeric * (i->>'quantity')::numeric), 0)
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) i)
   AND NOT EXISTS (SELECT 1 FROM public.after_sale_items a WHERE a.order_id = o.id);
ALTER TABLE public.orders ENABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION public.refresh_original_refund_state(_original_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant      uuid;
    v_items       jsonb;
    v_bought      integer;
    v_open        boolean;
    v_refunded_q  integer;
    v_amount      integer;
    v_hist_at     timestamptz;
    v_upd_at      timestamptz;
    v_prev_at     timestamptz;
    v_at          timestamptz;
    v_status      public.refund_status;
BEGIN
    IF _original_id IS NULL THEN RETURN; END IF;

    SELECT tenant_id, items, refunded_at INTO v_tenant, v_items, v_prev_at
      FROM public.orders WHERE id = _original_id AND NOT is_return;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT COALESCE(SUM(GREATEST(0, round((i->>'quantity')::numeric))::integer), 0)
      INTO v_bought
      FROM jsonb_array_elements(COALESCE(v_items, '[]'::jsonb)) i;

    WITH refunds AS (
        SELECT r.id, r.status, r.price, r.items, r.updated_at
          FROM public.orders r
         WHERE r.original_order_id = _original_id
           AND r.tenant_id = v_tenant
           AND r.is_return
           AND r.deleted_at IS NULL
    ),
    per_refund AS (
        SELECT f.id, f.status, f.updated_at,
               COALESCE(
                   (SELECT SUM(a.qty) FROM public.after_sale_items a WHERE a.order_id = f.id AND a.tenant_id = v_tenant AND a.direction = 'back'),
                   (SELECT SUM(GREATEST(0, round((i->>'quantity')::numeric))::integer)
                      FROM jsonb_array_elements(COALESCE(f.items, '[]'::jsonb)) i)
               , 0) AS qty,
               COALESCE(
                   (SELECT SUM(a.amount) FROM public.after_sale_items a WHERE a.order_id = f.id AND a.tenant_id = v_tenant AND a.direction = 'back'),
                   greatest(0, round(-f.price))::integer
               ) AS amount
          FROM refunds f
    )
    SELECT
        bool_or(status NOT IN ('refund_delivered', 'refund_failed', 'rejected', 'cancelled')),
        COALESCE(SUM(qty)    FILTER (WHERE status = 'refund_delivered'), 0),
        COALESCE(SUM(amount) FILTER (WHERE status = 'refund_delivered'), 0),
        MAX((SELECT MAX(h.changed_at) FROM public.order_status_history h
              WHERE h.order_id = per_refund.id AND h.to_status = 'refund_delivered'))
            FILTER (WHERE status = 'refund_delivered'),
        MAX(updated_at) FILTER (WHERE status = 'refund_delivered')
      INTO v_open, v_refunded_q, v_amount, v_hist_at, v_upd_at
      FROM per_refund;

    -- When the customer was paid: the status history says so for refunds
    -- made in this app; imported rows carry no history, so a date already
    -- on the original wins over the refund order's last-edited time.
    v_at := COALESCE(v_hist_at, v_prev_at, v_upd_at);

    v_status := CASE
        WHEN COALESCE(v_open, false) THEN 'pending'
        WHEN v_refunded_q = 0 THEN 'none'
        WHEN v_refunded_q >= v_bought THEN 'refunded'
        ELSE 'partial'
    END;

    PERFORM set_config('app.refund_state_sync', 'on', true);
    UPDATE public.orders
       SET refund_status   = v_status,
           refunded_amount = v_amount,
           refunded_at     = CASE WHEN v_status IN ('refunded', 'partial') THEN v_at END
     WHERE id = _original_id
       AND (refund_status, refunded_amount, refunded_at)
           IS DISTINCT FROM (v_status, v_amount, CASE WHEN v_status IN ('refunded', 'partial') THEN v_at END);
    PERFORM set_config('app.refund_state_sync', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_original_refund_state(uuid) FROM PUBLIC, anon, authenticated;

-- Refund order changed → recompute its original (and its previous original
-- when the link itself moved).
CREATE OR REPLACE FUNCTION public.tg_orders_refund_state_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP <> 'DELETE' AND NEW.is_return THEN
        PERFORM public.refresh_original_refund_state(NEW.original_order_id);
    END IF;
    IF TG_OP <> 'INSERT' AND OLD.is_return
       AND (TG_OP = 'DELETE' OR OLD.original_order_id IS DISTINCT FROM NEW.original_order_id OR NOT NEW.is_return) THEN
        PERFORM public.refresh_original_refund_state(OLD.original_order_id);
    END IF;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_orders_refund_state_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_refund_state_sync ON public.orders;
CREATE TRIGGER trg_orders_refund_state_sync
    AFTER INSERT OR DELETE OR UPDATE OF status, original_order_id, is_return, deleted_at, price, items
    ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.tg_orders_refund_state_sync();

-- A refund's lines are written after the refund order itself; recompute
-- once they land.
CREATE OR REPLACE FUNCTION public.tg_after_sale_items_refund_state_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_child uuid := COALESCE(NEW.order_id, OLD.order_id);
BEGIN
    PERFORM public.refresh_original_refund_state(
        (SELECT original_order_id FROM public.orders WHERE id = v_child AND is_return));
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_after_sale_items_refund_state_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_after_sale_items_refund_state_sync ON public.after_sale_items;
CREATE TRIGGER trg_after_sale_items_refund_state_sync
    AFTER INSERT OR UPDATE OR DELETE ON public.after_sale_items
    FOR EACH ROW EXECUTE FUNCTION public.tg_after_sale_items_refund_state_sync();

-- Only the sync above may change the refund state columns.
CREATE OR REPLACE FUNCTION public.tg_orders_refund_state_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF COALESCE(current_setting('app.refund_state_sync', true), 'off') <> 'on' THEN
        NEW.refund_status   := OLD.refund_status;
        NEW.refunded_at     := OLD.refunded_at;
        NEW.refunded_amount := OLD.refunded_amount;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_refund_state_guard ON public.orders;
CREATE TRIGGER trg_orders_refund_state_guard
    BEFORE UPDATE OF refund_status, refunded_at, refunded_amount ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.tg_orders_refund_state_guard();

-- Backfill every original that has a linked refund order or already
-- carries a refund state, so today's rows read the same as rows written
-- from now on (an original marked pending with no refund order behind it
-- goes back to none).
SELECT public.refresh_original_refund_state(o.id)
  FROM public.orders o
 WHERE NOT o.is_return
   AND (o.refund_status <> 'none'
        OR EXISTS (SELECT 1 FROM public.orders r WHERE r.original_order_id = o.id AND r.is_return));

-- The courier instruction the old refund flow wrote into every refund
-- order's notes, kept as the store's setting (without the amount, which the
-- label now prints as the sum to hand over).
UPDATE public.tenants
   SET settings = jsonb_set(
           coalesce(settings, '{}'::jsonb),
           '{after_sale,refund_courier_note}',
           to_jsonb('استرجاع المنتج من الزبون والتأكد من سلامته وعدم تضرر زجاجة العطر او نقصانها، ووجود كارت الضمان، خلافه يمنع الاسترجاع من الزبون.'::text),
           true)
 WHERE slug = 'scheniders-iraq'
   AND coalesce(settings #>> '{after_sale,refund_courier_note}', '') = ''
   AND settings ? 'after_sale';
