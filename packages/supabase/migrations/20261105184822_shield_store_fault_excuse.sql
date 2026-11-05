-- Shield "our fault" switch (Ali, 2026-11-05): when staff cancel or reject an
-- order because of the store or the courier, they can mark it so the customer
-- loses no Trust points. Old orders can be marked (or unmarked) later from the
-- Shield report.
--
-- orders.shield_excused: true = this order never counts against the customer,
-- in this store or in the network. A new status clears it, so a later real
-- refusal on the same order counts again.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shield_excused boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.shield_excused IS
    'Shield: staff marked this cancel/reject as the store''s or courier''s fault, so it costs the customer no Trust points. Cleared on any status change.';

-- ---------------------------------------------------------------- clear on status change
CREATE OR REPLACE FUNCTION shield.orders_clear_excused_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.shield_excused := false;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION shield.orders_clear_excused_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_shield_clear_excused ON public.orders;
CREATE TRIGGER trg_orders_shield_clear_excused
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION shield.orders_clear_excused_trigger();

-- ---------------------------------------------------------------- sync: excused rows never count
CREATE OR REPLACE FUNCTION shield.sync_phone(p_tenant_id uuid, p_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    norm text := public.normalize_phone_for_search(p_phone);
    k bytea;
BEGIN
    IF p_tenant_id IS NULL OR norm IS NULL OR length(norm) <> 10 THEN RETURN; END IF;
    k := shield.phone_key(norm);

    WITH rows AS (
        SELECT f.base_id, f.created_at, f.status, f.is_delivered, o.shield_excused,
               COALESCE(rr.label_ar, o.rejection_reason) AS reason
          FROM public.customer_order_facts f
          JOIN public.orders o ON o.id = f.id
          LEFT JOIN public.order_reasons rr ON rr.id = o.reason_id AND rr.tenant_id = o.tenant_id
         WHERE f.tenant_id = p_tenant_id
           AND f.norm_phone = norm
           AND NOT f.is_return
    ), per_base AS (
        SELECT base_id,
               min(created_at) AS occurred_at,
               bool_or(is_delivered OR status IN ('completed', 'delivered')) AS delivered,
               -- Latest closed-unsold row decides the bad category; an excused
               -- row (store or courier fault) decides "not counted".
               (array_agg(CASE WHEN shield_excused THEN NULL ELSE shield.reason_category(status, reason) END
                          ORDER BY created_at DESC)
                    FILTER (WHERE status IN ('rejected', 'no_response', 'cancelled')))[1] AS category,
               bool_or(status IN ('rejected', 'no_response', 'cancelled')) AS closed_unsold,
               bool_and(status IN ('completed', 'delivered', 'rejected', 'no_response', 'cancelled',
                                   'returned', 'refunded', 'refund_delivered', 'return_pending')) AS finished
          FROM rows
         GROUP BY base_id
    ), wanted AS (
        SELECT base_id, occurred_at,
               CASE WHEN delivered THEN 'delivered' ELSE 'bad' END AS outcome,
               CASE WHEN delivered THEN NULL ELSE category END AS category
          FROM per_base
         WHERE delivered OR (finished AND closed_unsold AND category IS NOT NULL)
    ), del AS (
        DELETE FROM shield.events e
         WHERE e.tenant_id = p_tenant_id AND e.phone_key = k
           AND NOT EXISTS (SELECT 1 FROM wanted w WHERE w.base_id = e.base_id)
    )
    INSERT INTO shield.events AS e (tenant_id, base_id, phone_key, outcome, category, occurred_at, updated_at)
    SELECT p_tenant_id, w.base_id, k, w.outcome, w.category, w.occurred_at, now()
      FROM wanted w
    ON CONFLICT (tenant_id, base_id, phone_key) DO UPDATE
       SET outcome = EXCLUDED.outcome, category = EXCLUDED.category,
           occurred_at = EXCLUDED.occurred_at, updated_at = now()
     WHERE (e.outcome, e.category, e.occurred_at) IS DISTINCT FROM
           (EXCLUDED.outcome, EXCLUDED.category, EXCLUDED.occurred_at);
END;
$$;
REVOKE ALL ON FUNCTION shield.sync_phone(uuid, text) FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_shield_sync ON public.orders;
CREATE TRIGGER trg_orders_shield_sync
AFTER INSERT OR DELETE OR UPDATE OF status, phone, tenant_id, reason_id, rejection_reason,
    deleted_at, is_test, is_archived, is_return, original_order_id, delivered_at, shield_excused
ON public.orders
FOR EACH ROW EXECUTE FUNCTION shield.orders_sync_trigger();

-- ---------------------------------------------------------------- mark / unmark
-- Staff with orders.edit mark one cancelled, rejected or no-answer order of
-- their own store as (not) the store's fault.
CREATE OR REPLACE FUNCTION public.shield_set_excused(p_order_id uuid, p_excused boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_status text;
BEGIN
    IF NOT public.has_tenant_permission(v_tenant, 'orders.edit') THEN
        RAISE EXCEPTION 'shield_set_excused: not allowed' USING ERRCODE = '42501';
    END IF;
    SELECT o.status INTO v_status
      FROM public.orders o
     WHERE o.id = p_order_id AND o.tenant_id = v_tenant AND o.deleted_at IS NULL;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'shield_set_excused: order not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_status NOT IN ('rejected', 'cancelled', 'no_response') THEN
        RAISE EXCEPTION 'shield_set_excused: only cancelled, rejected or no-answer orders' USING ERRCODE = '22023';
    END IF;
    UPDATE public.orders SET shield_excused = p_excused
     WHERE id = p_order_id AND tenant_id = v_tenant AND shield_excused IS DISTINCT FROM p_excused;
END;
$$;
REVOKE ALL ON FUNCTION public.shield_set_excused(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shield_set_excused(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------- the report's list
-- This store's cancelled / rejected / no-answer orders for one customer that
-- cost (or would cost) Trust points, newest first, with whether staff marked
-- them as the store's fault.
CREATE OR REPLACE FUNCTION public.shield_own_bad_orders(p_phone text)
RETURNS TABLE (
    id uuid, sequence_number integer, created_at timestamptz, status text,
    reason text, points integer, excused boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_norm text := public.normalize_phone_for_search(p_phone);
BEGIN
    IF v_norm IS NULL OR length(v_norm) <> 10 THEN RETURN; END IF;
    RETURN QUERY
    SELECT o.id, o.sequence_number::integer, o.created_at, o.status::text,
           COALESCE(rr.label_ar, o.rejection_reason),
           shield.trust_penalty(shield.reason_category(o.status::text, COALESCE(rr.label_ar, o.rejection_reason))),
           o.shield_excused
      FROM public.orders o
      LEFT JOIN public.order_reasons rr ON rr.id = o.reason_id AND rr.tenant_id = o.tenant_id
     WHERE o.tenant_id = v_tenant
       AND o.deleted_at IS NULL
       AND NOT COALESCE(o.is_test, false)
       AND o.status IN ('rejected', 'cancelled', 'no_response')
       AND public.normalize_phone_for_search(o.phone) = v_norm
       AND (o.shield_excused
            OR shield.reason_category(o.status::text, COALESCE(rr.label_ar, o.rejection_reason)) IS NOT NULL)
     ORDER BY o.created_at DESC
     LIMIT 50;
END;
$$;
REVOKE ALL ON FUNCTION public.shield_own_bad_orders(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shield_own_bad_orders(text) TO authenticated;
