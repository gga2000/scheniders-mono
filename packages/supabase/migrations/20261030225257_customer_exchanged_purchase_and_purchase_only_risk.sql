-- Customers R5-01 + R4-02 (Ali, 2026-10-30):
-- * An exchanged purchase stays a purchase. Staff marked delivered originals
--   "rejected" after making an exchange or return for them, which made paying
--   customers look like refusers and dropped them from spend. The facts now
--   treat such an original as delivered, and a trigger stops new ones.
-- * Severe risk is a refused or unanswered purchase only: a refused return
--   pickup no longer counts, and a refund on a refused purchase is not counted
--   again as a minor signal.
--
-- The matview is swapped by rename (mv_customer_metrics_prev is dropped later
-- from the SQL editor); customer_aggregates is re-pointed in the same
-- transaction.

CREATE OR REPLACE VIEW public.customer_order_facts AS
WITH src AS (
    SELECT
        o.*,
        orig.id     AS orig_id,
        orig.order_id AS orig_order_id,
        orig.price  AS orig_price,
        -- An exchanged purchase stays a purchase: staff used to mark the
        -- delivered original "rejected" (or cancelled / no answer) once an
        -- exchange or return was made for it. The customer paid and kept an
        -- item, so it counts as delivered.
        CASE
            WHEN NOT COALESCE(o.is_return, false)
                 AND o.status::text IN ('rejected', 'no_response', 'cancelled')
                 AND o.delivered_at IS NOT NULL
                 AND EXISTS (SELECT 1 FROM public.orders c
                              WHERE c.original_order_id = o.id
                                AND c.tenant_id = o.tenant_id
                                AND c.deleted_at IS NULL)
                THEN 'delivered'
            ELSE o.status::text
        END AS eff_status,
        -- Same rule for the purchase an after-sale row points at (that row is
        -- itself the exchange or return).
        CASE
            WHEN orig.status::text IN ('rejected', 'no_response', 'cancelled')
                 AND orig.delivered_at IS NOT NULL
                 AND NOT COALESCE(orig.is_return, false)
                THEN 'delivered'
            ELSE orig.status::text
        END AS orig_eff_status
    FROM public.orders o
    LEFT JOIN public.orders orig
           ON orig.id = o.original_order_id
          AND orig.tenant_id = o.tenant_id
          AND orig.deleted_at IS NULL
          AND NOT COALESCE(orig.is_test, false)
    WHERE o.phone IS NOT NULL
      AND o.deleted_at IS NULL
      AND NOT COALESCE(o.is_archived, false)
      AND NOT COALESCE(o.is_test, false)
      AND o.status::text <> 'pending_checkout'
      AND public.normalize_phone_for_search(o.phone) <> ''
),
f AS (
    SELECT
        s.tenant_id,
        public.normalize_phone_for_search(s.phone)                 AS norm_phone,
        s.id,
        public.order_base_id(COALESCE(s.orig_order_id, s.order_id)) AS base_id,
        s.created_at,
        s.eff_status                                               AS status,
        COALESCE(s.is_return, false)                               AS is_return,
        s.customer_name,
        s.city,
        s.governorate_code,
        s.secondary_phone,
        s.address_details,
        s.price,
        s.items,
        s.orig_id,
        s.orig_price,
        s.orig_eff_status,
        (s.eff_status = 'refund_delivered'
            OR s.refunded_at IS NOT NULL
            OR s.refund_status::text IN ('pending', 'refunded'))  AS is_refund_signal,
        -- Severe risk is a refused or unanswered purchase. A refused return
        -- pickup is not the customer refusing to pay.
        (NOT COALESCE(s.is_return, false)
            AND s.eff_status IN ('rejected', 'no_response'))       AS is_severe
    FROM src s
)
SELECT
    f.tenant_id,
    f.norm_phone,
    f.id,
    f.base_id,
    f.created_at,
    f.status,
    f.is_return,
    f.customer_name,
    f.city,
    f.governorate_code,
    f.secondary_phone,
    f.address_details,
    -- One delivery per purchase: a split order (LF-123-1, LF-123-2) delivered
    -- in two parcels is one delivered order, not two.
    (NOT f.is_return AND f.orig_id IS NULL
        AND f.status IN ('completed', 'delivered')
        AND row_number() OVER (
            PARTITION BY f.tenant_id, f.norm_phone, f.base_id,
                         (NOT f.is_return AND f.orig_id IS NULL AND f.status IN ('completed', 'delivered'))
            ORDER BY f.created_at, f.id) = 1)                      AS is_delivered,
    CASE
        WHEN NOT f.is_return AND f.status IN ('completed', 'delivered') AND f.orig_id IS NULL
            THEN COALESCE(f.price, 0)
        WHEN NOT f.is_return AND f.status IN ('completed', 'delivered')
             AND f.orig_eff_status IN ('completed', 'delivered')
            THEN greatest(COALESCE(f.price, 0), -abs(COALESCE(f.orig_price, 0)))
        WHEN f.is_return AND f.status = 'refund_delivered'
             AND f.orig_eff_status IN ('completed', 'delivered')
            THEN -least(abs(COALESCE(f.price, 0)), abs(COALESCE(f.orig_price, 0)))
        ELSE 0
    END                                                            AS spend_delta,
    f.is_refund_signal,
    CASE
        WHEN NOT f.is_return AND f.orig_id IS NULL
             AND f.status IN ('completed', 'delivered')
             AND jsonb_typeof(f.items) = 'array'
            THEN (SELECT COALESCE(sum((e ->> 'quantity')::numeric), 0) FROM jsonb_array_elements(f.items) e)
        ELSE 0
    END                                                            AS delivered_items,
    f.is_severe,
    -- A refund is a minor signal, once per purchase, and not on top of a
    -- purchase that already counts as severe.
    (f.is_refund_signal
        AND NOT bool_or(f.is_severe) OVER (PARTITION BY f.tenant_id, f.norm_phone, f.base_id)) AS is_minor_refund
FROM f;

REVOKE ALL ON public.customer_order_facts FROM PUBLIC, anon, authenticated;

ALTER MATERIALIZED VIEW public.mv_customer_metrics RENAME TO mv_customer_metrics_prev;
ALTER INDEX public.uq_mv_customer_metrics_tenant_phone RENAME TO uq_mv_customer_metrics_prev_tenant_phone;
ALTER INDEX public.idx_mv_customer_metrics_tenant_last_order RENAME TO idx_mv_customer_metrics_prev_tenant_last_order;
ALTER INDEX public.idx_mv_customer_metrics_phone RENAME TO idx_mv_customer_metrics_prev_phone;

CREATE MATERIALIZED VIEW public.mv_customer_metrics AS
WITH latest AS (
    SELECT DISTINCT ON (f.tenant_id, f.norm_phone)
        f.tenant_id,
        f.norm_phone,
        f.id               AS last_order_id,
        f.status           AS last_order_status,
        f.customer_name    AS latest_name,
        f.city             AS latest_city,
        f.governorate_code AS latest_governorate,
        f.secondary_phone  AS latest_secondary_phone,
        f.address_details  AS latest_address_details
    FROM public.customer_order_facts f
    WHERE NOT f.is_return
    ORDER BY f.tenant_id, f.norm_phone, f.created_at DESC
)
SELECT
    f.norm_phone AS customer_phone,
    f.tenant_id,
    l.latest_name,
    l.latest_city,
    l.latest_governorate,
    count(DISTINCT f.base_id) FILTER (WHERE NOT f.is_return)        AS total_orders,
    COALESCE(sum(f.spend_delta), 0)                                 AS total_spent,
    max(f.created_at) FILTER (WHERE NOT f.is_return)                AS last_order_date,
    min(f.created_at) FILTER (WHERE NOT f.is_return)                AS first_order_date,
    COALESCE(sum(f.delivered_items), 0)                             AS total_items,
    l.last_order_id,
    l.last_order_status,
    l.latest_secondary_phone,
    l.latest_address_details,
    count(*) FILTER (WHERE f.is_delivered)                          AS completed_count,
    count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled')   AS cancelled_count,
    count(*) FILTER (WHERE NOT f.is_return AND f.status = 'no_response') AS no_response_count,
    count(*) FILTER (WHERE NOT f.is_return AND f.status = 'rejected')    AS rejected_count,
    count(*) FILTER (WHERE f.is_return OR f.status = 'return_pending')   AS returned_count,
    count(DISTINCT f.base_id) FILTER (WHERE f.is_refund_signal)     AS refund_count,
    count(*) FILTER (WHERE f.is_severe) AS severe_count,
    count(*) FILTER (WHERE f.is_severe
                       AND f.created_at >= now() - interval '6 months') AS recent_severe_count,
    count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled')
      + count(DISTINCT f.base_id) FILTER (WHERE f.is_minor_refund) AS moderate_count,
    count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled'
                       AND f.created_at >= now() - interval '6 months')
      + count(DISTINCT f.base_id) FILTER (WHERE f.is_minor_refund
                       AND f.created_at >= now() - interval '6 months') AS recent_moderate_count
FROM public.customer_order_facts f
JOIN latest l ON l.tenant_id = f.tenant_id AND l.norm_phone = f.norm_phone
GROUP BY f.tenant_id, f.norm_phone, l.latest_name, l.latest_city, l.latest_governorate,
         l.last_order_id, l.last_order_status, l.latest_secondary_phone, l.latest_address_details;

CREATE UNIQUE INDEX uq_mv_customer_metrics_tenant_phone ON public.mv_customer_metrics (tenant_id, customer_phone);
CREATE INDEX idx_mv_customer_metrics_tenant_last_order ON public.mv_customer_metrics (tenant_id, last_order_date DESC);
CREATE INDEX idx_mv_customer_metrics_phone ON public.mv_customer_metrics (customer_phone);

REVOKE ALL ON public.mv_customer_metrics FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.customer_aggregates AS
SELECT customer_phone, tenant_id, latest_name, latest_city, latest_governorate,
       total_orders, total_spent, last_order_date, first_order_date, total_items,
       last_order_id, last_order_status, latest_secondary_phone, latest_address_details,
       completed_count, cancelled_count, no_response_count, rejected_count,
       returned_count, refund_count
FROM public.mv_customer_metrics
WHERE tenant_id IN (SELECT public.get_user_tenant_ids());

CREATE OR REPLACE FUNCTION public.get_customer_reliability(p_phone text)
 RETURNS TABLE(customer_phone text, total_orders bigint, total_spent numeric, completed_count bigint, cancelled_count bigint, no_response_count bigint, rejected_count bigint, returned_count bigint, refund_count bigint, severe_count bigint, recent_severe_count bigint, moderate_count bigint, recent_moderate_count bigint, is_blacklisted boolean, value_tier text, risk_level text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    norm text := public.normalize_phone_for_search(
        translate(COALESCE(p_phone, ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'));
BEGIN
    IF norm = '' THEN RETURN; END IF;
    RETURN QUERY
    WITH sc AS (
        SELECT
            count(DISTINCT f.base_id) FILTER (WHERE NOT f.is_return)                    AS total_orders,
            COALESCE(sum(f.spend_delta), 0)                                             AS total_spent,
            count(*) FILTER (WHERE f.is_delivered)                                      AS completed_count,
            count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled')          AS cancelled_count,
            count(*) FILTER (WHERE NOT f.is_return AND f.status = 'no_response')        AS no_response_count,
            count(*) FILTER (WHERE NOT f.is_return AND f.status = 'rejected')           AS rejected_count,
            count(*) FILTER (WHERE f.is_return OR f.status = 'return_pending')          AS returned_count,
            count(DISTINCT f.base_id) FILTER (WHERE f.is_refund_signal)                 AS refund_count,
            count(*) FILTER (WHERE f.is_severe)             AS severe_count,
            count(*) FILTER (WHERE f.is_severe
                               AND f.created_at >= now() - interval '6 months')         AS recent_severe_count,
            count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled')
              + count(DISTINCT f.base_id) FILTER (WHERE f.is_minor_refund)             AS moderate_count,
            count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled'
                               AND f.created_at >= now() - interval '6 months')
              + count(DISTINCT f.base_id) FILTER (WHERE f.is_minor_refund
                               AND f.created_at >= now() - interval '6 months')         AS recent_moderate_count
        FROM customer_order_facts f
        WHERE f.tenant_id = v_tenant AND f.norm_phone = norm
    ),
    bl AS (
        SELECT EXISTS (
            SELECT 1 FROM blacklist b
             WHERE b.tenant_id = v_tenant AND normalize_phone_for_search(b.phone) = norm
        ) AS blocked
    )
    SELECT norm,
        sc.total_orders, sc.total_spent, sc.completed_count,
        sc.cancelled_count, sc.no_response_count, sc.rejected_count,
        sc.returned_count, sc.refund_count,
        sc.severe_count, sc.recent_severe_count, sc.moderate_count, sc.recent_moderate_count,
        bl.blocked,
        value_tier_calc(sc.completed_count::int),
        risk_level_calc(sc.severe_count::int, sc.recent_severe_count::int, sc.moderate_count::int, sc.recent_moderate_count::int, bl.blocked)
    FROM sc CROSS JOIN bl
    WHERE sc.total_orders > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cod_risk_signals(_tenant_id uuid, _phone text, _address text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    norm text := public.normalize_phone_for_search(COALESCE(_phone, ''));
    sc record;
    recent record;
    blocked boolean;
    lvl text;
    tier text;
    reasons text[] := ARRAY[]::text[];
    addr_len int := length(btrim(COALESCE(_address, '')));
BEGIN
    IF norm = '' THEN
        RETURN jsonb_build_object('level', 'low', 'reasons', reasons, 'total_orders', 0);
    END IF;

    SELECT
        count(DISTINCT f.base_id) FILTER (WHERE NOT f.is_return) AS total_orders,
        count(*) FILTER (WHERE f.is_delivered) AS completed_count,
        count(*) FILTER (WHERE f.is_severe) AS severe_count,
        count(*) FILTER (WHERE f.is_severe
                           AND f.created_at >= now() - interval '6 months') AS recent_severe_count,
        count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled')
          + count(DISTINCT f.base_id) FILTER (WHERE f.is_minor_refund) AS moderate_count,
        count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled'
                           AND f.created_at >= now() - interval '6 months')
          + count(DISTINCT f.base_id) FILTER (WHERE f.is_minor_refund
                           AND f.created_at >= now() - interval '6 months') AS recent_moderate_count
    INTO sc
    FROM public.customer_order_facts f
    WHERE f.tenant_id = _tenant_id
      AND f.norm_phone = norm;

    -- Open and very recent orders include checkouts still in progress.
    SELECT
        count(*) FILTER (WHERE o.created_at >= now() - interval '1 hour') AS last_hour,
        count(*) FILTER (WHERE o.status IN ('new','pending_checkout','contacted','confirmed')
                           AND o.created_at >= now() - interval '24 hours') AS open_day,
        (array_agg(o.id ORDER BY o.created_at DESC) FILTER (
            WHERE o.status IN ('new','pending_checkout','contacted','confirmed')
              AND o.created_at >= now() - interval '24 hours'))[1] AS latest_open_id
    INTO recent
    FROM public.orders o
    WHERE o.tenant_id = _tenant_id
      AND o.deleted_at IS NULL
      AND o.created_at >= now() - interval '24 hours'
      AND public.normalize_phone_for_search(o.phone) = norm;

    SELECT EXISTS (
        SELECT 1 FROM public.blacklist b
        WHERE b.tenant_id = _tenant_id
          AND public.normalize_phone_for_search(b.phone) = norm
    ) INTO blocked;

    lvl := public.risk_level_calc(sc.severe_count::int, sc.recent_severe_count::int, sc.moderate_count::int, sc.recent_moderate_count::int, blocked);
    tier := public.value_tier_calc(sc.completed_count::int);

    IF lvl IN ('high', 'blocked') THEN reasons := array_append(reasons, 'high_risk_customer'); END IF;
    IF recent.open_day > 0 THEN reasons := array_append(reasons, 'duplicate_order'); END IF;
    IF recent.last_hour >= 2 THEN reasons := array_append(reasons, 'order_velocity'); END IF;
    IF addr_len < 10 THEN reasons := array_append(reasons, 'address_incomplete'); END IF;

    RETURN jsonb_build_object(
        'level', lvl,
        'value_tier', tier,
        'is_blacklisted', blocked,
        'total_orders', sc.total_orders,
        'completed_count', sc.completed_count,
        'severe_count', sc.severe_count,
        'recent_severe_count', sc.recent_severe_count,
        'moderate_count', sc.moderate_count,
        'recent_moderate_count', sc.recent_moderate_count,
        'open_orders_24h', recent.open_day,
        'orders_last_hour', recent.last_hour,
        'duplicate_of_order_id', recent.latest_open_id,
        'address_length', addr_len,
        'reasons', to_jsonb(reasons)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.orders_guard_exchanged_original_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT COALESCE(OLD.is_return, false)
       AND OLD.status::text IN ('delivered', 'completed')
       AND NEW.status::text IN ('rejected', 'no_response', 'cancelled')
       AND EXISTS (SELECT 1 FROM public.orders c
                    WHERE c.original_order_id = OLD.id
                      AND c.tenant_id = OLD.tenant_id
                      AND c.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'This order was delivered and has an exchange or return. Keep it delivered and record the outcome on the exchange or return order.'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.orders_guard_exchanged_original_status() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER orders_guard_exchanged_original_status
    BEFORE UPDATE OF status ON public.orders
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.orders_guard_exchanged_original_status();