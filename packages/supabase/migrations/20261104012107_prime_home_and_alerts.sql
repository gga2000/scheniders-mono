-- Prime on the home page and in the notifications feed.
--
-- 1. prime_shipments.payment_id: the Prime payment that paid the store for a
--    delivered parcel (set from Prime's payment manifests by the Prime cron).
--    NULL on a delivered parcel = Prime still holds its cash.
-- 2. prime_connections.last_payment_id / daily_sent_on: what the Prime cron
--    already announced, so a payment or the evening summary is announced once.
-- 3. prime_home_groups(): the last 60 days of Prime parcels, grouped by what
--    the home tiles need. The parcel's state (delivered, coming back…) is read
--    from status + step in the app (lib/prime/track), so the rule lives in one
--    place; this only counts and sums. SECURITY INVOKER: RLS on
--    prime_shipments and orders keeps it to the caller's own stores.
-- 4. notification_feed: a 'prime' filter (the Prime chip in the feed).

ALTER TABLE public.prime_shipments ADD COLUMN IF NOT EXISTS payment_id BIGINT;
COMMENT ON COLUMN public.prime_shipments.payment_id IS
    'Prime payment movement that paid this parcel (merchant-payment-receipts id); NULL while Prime holds its cash.';

ALTER TABLE public.prime_connections ADD COLUMN IF NOT EXISTS last_payment_id BIGINT;
ALTER TABLE public.prime_connections ADD COLUMN IF NOT EXISTS daily_sent_on DATE;
COMMENT ON COLUMN public.prime_connections.last_payment_id IS
    'Newest Prime payment the cron has seen; newer ones are announced and their parcels marked paid.';
COMMENT ON COLUMN public.prime_connections.daily_sent_on IS
    'Baghdad day the evening Prime summary last went out.';

CREATE OR REPLACE FUNCTION public.prime_home_groups(p_tenant_id UUID)
RETURNS TABLE (
    shipment_status TEXT,
    step_code       TEXT,
    cancelled       BOOLEAN,
    paid            BOOLEAN,
    order_open      BOOLEAN,
    sent_day        TEXT,
    changed_day     TEXT,
    parcels         INTEGER,
    collect         BIGINT,
    fees            BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT s.shipment_status,
           s.step_code,
           s.cancelled_at IS NOT NULL,
           s.payment_id IS NOT NULL,
           o.status IN ('confirmed', 'in_transit'),
           to_char(s.sent_at AT TIME ZONE 'Asia/Baghdad', 'YYYY-MM-DD'),
           to_char(COALESCE(s.status_changed_at, s.sent_at) AT TIME ZONE 'Asia/Baghdad', 'YYYY-MM-DD'),
           count(*)::INTEGER,
           COALESCE(sum(s.receipt_amount_iqd), 0)::BIGINT,
           COALESCE(sum(s.shipment_charge), 0)::BIGINT
    FROM public.prime_shipments s
    JOIN public.orders o ON o.id = s.order_id AND o.tenant_id = s.tenant_id
    WHERE s.tenant_id = p_tenant_id
      AND s.sent_at >= now() - INTERVAL '60 days'
    GROUP BY 1, 2, 3, 4, 5, 6, 7;
$$;

REVOKE ALL ON FUNCTION public.prime_home_groups(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prime_home_groups(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.notification_feed(
    p_limit  INTEGER     DEFAULT 50,
    p_before TIMESTAMPTZ DEFAULT NULL,
    p_filter TEXT        DEFAULT 'all'
)
RETURNS TABLE (
    id           UUID,
    type         TEXT,
    category     TEXT,
    actor_name   TEXT,
    actor_avatar TEXT,
    entity_type  TEXT,
    entity_id    UUID,
    entity_label TEXT,
    payload      JSONB,
    priority     TEXT,
    group_key    TEXT,
    created_at   TIMESTAMPTZ,
    is_read      BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_tenants UUID[];
    v_cleared TIMESTAMPTZ;
    v_read    TIMESTAMPTZ;
BEGIN
    IF v_uid IS NULL THEN RETURN; END IF;

    SELECT array_agg(t) INTO v_tenants FROM public.get_user_tenant_ids() t;
    IF v_tenants IS NULL THEN RETURN; END IF;

    SELECT f.cleared_before, f.read_before INTO v_cleared, v_read
    FROM public.notification_feed_state f WHERE f.user_id = v_uid;

    RETURN QUERY
    SELECT n.id, n.type, n.category, n.actor_name, n.actor_avatar,
           n.entity_type, n.entity_id, n.entity_label, n.payload,
           n.priority, n.group_key, n.created_at,
           (
               (v_read IS NOT NULL AND n.created_at <= v_read)
               OR EXISTS (
                   SELECT 1 FROM public.notification_user_state s
                   WHERE s.notification_id = n.id AND s.user_id = v_uid
                     AND s.read_at IS NOT NULL)
           ) AS is_read
    FROM public.notifications n
    WHERE n.tenant_id = ANY (v_tenants)
      AND (n.audience = 'tenant' OR n.recipient_id = v_uid)
      AND (v_cleared IS NULL OR n.created_at > v_cleared)
      AND (p_before IS NULL OR n.created_at < p_before)
      AND NOT EXISTS (
              SELECT 1 FROM public.notification_user_state s
              WHERE s.notification_id = n.id AND s.user_id = v_uid
                AND s.dismissed_at IS NOT NULL)
      AND NOT EXISTS (
              SELECT 1 FROM public.notification_mutes m
              WHERE m.user_id = v_uid
                AND m.entity_type = n.entity_type
                AND m.entity_id = n.entity_id
                AND n.created_at > m.created_at)
      AND (
            p_filter = 'all'
        OR (p_filter = 'mentions' AND n.category = 'chat')
        OR (p_filter = 'prime' AND n.type LIKE 'prime.%')
        OR (p_filter = 'unread' AND NOT (
                (v_read IS NOT NULL AND n.created_at <= v_read)
                OR EXISTS (
                    SELECT 1 FROM public.notification_user_state s
                    WHERE s.notification_id = n.id AND s.user_id = v_uid
                      AND s.read_at IS NOT NULL)))
      )
    ORDER BY n.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.notification_feed(INTEGER, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_feed(INTEGER, TIMESTAMPTZ, TEXT) TO authenticated;
