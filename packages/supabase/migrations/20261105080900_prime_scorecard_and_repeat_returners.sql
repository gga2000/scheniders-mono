-- Prime page scorecard and repeat returners.
--
-- 1. prime_returns_groups() gains deliver_hours: the hours from handing the
--    parcel to Prime (sent_at) to Prime's last move (status_changed_at),
--    summed per group, so the page can show hours to deliver for the
--    delivered groups and the average days per governorate. Other columns,
--    rows and grants are unchanged; an old client that reads only the old
--    columns keeps working. The return type changes, so the function is
--    dropped and made again inside this one migration.
-- 2. prime_repeat_returners() lists the store's customers (by phone) whose
--    parcels came back 2 or more times in the last 60 days, for the
--    Returns tab's link to Shield.
--
-- Both SECURITY INVOKER: a member reads only their own tenant's rows (RLS on
-- prime_shipments and orders); p_tenant_id only narrows to the store in view.

DROP FUNCTION IF EXISTS public.prime_returns_groups(UUID);

CREATE FUNCTION public.prime_returns_groups(p_tenant_id UUID)
RETURNS TABLE (
    shipment_status TEXT,
    step_code       TEXT,
    cancelled       BOOLEAN,
    resent          BOOLEAN,
    governorate     TEXT,
    reason          TEXT,
    changed_day     TEXT,
    parcels         INTEGER,
    deliver_hours   DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT s.shipment_status,
           s.step_code,
           s.cancelled_at IS NOT NULL,
           s.resent_at IS NOT NULL,
           upper(COALESCE(NULLIF(btrim(o.validated_governorate_code), ''), NULLIF(btrim(o.governorate_code), ''))),
           COALESCE(CASE WHEN o.status = 'rejected' THEN NULLIF(btrim(o.rejection_reason), '') END, NULLIF(btrim(s.return_reason), '')),
           to_char(COALESCE(s.status_changed_at, s.sent_at) AT TIME ZONE 'Asia/Baghdad', 'YYYY-MM-DD'),
           count(*)::INTEGER,
           COALESCE(sum(GREATEST(EXTRACT(EPOCH FROM (s.status_changed_at - s.sent_at)) / 3600.0, 0)), 0)::DOUBLE PRECISION
    FROM public.prime_shipments s
    JOIN public.orders o ON o.id = s.order_id AND o.tenant_id = s.tenant_id
    WHERE s.tenant_id = p_tenant_id
      AND COALESCE(s.status_changed_at, s.sent_at) >= now() - INTERVAL '60 days'
    GROUP BY 1, 2, 3, 4, 5, 6, 7;
$$;

REVOKE ALL ON FUNCTION public.prime_returns_groups(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prime_returns_groups(UUID) TO authenticated;

CREATE FUNCTION public.prime_repeat_returners(p_tenant_id UUID)
RETURNS TABLE (
    phone         TEXT,
    customer_name TEXT,
    returned      INTEGER,
    last_day      TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT o.phone,
           (array_agg(o.customer_name ORDER BY s.sent_at DESC))[1],
           count(*)::INTEGER,
           to_char(max(COALESCE(s.status_changed_at, s.sent_at)) AT TIME ZONE 'Asia/Baghdad', 'YYYY-MM-DD')
    FROM public.prime_shipments s
    JOIN public.orders o ON o.id = s.order_id AND o.tenant_id = s.tenant_id
    WHERE s.tenant_id = p_tenant_id
      AND o.status IN ('rejected', 'return_pending')
      AND o.phone IS NOT NULL AND btrim(o.phone) <> ''
      AND COALESCE(s.status_changed_at, s.sent_at) >= now() - INTERVAL '60 days'
    GROUP BY o.phone
    HAVING count(*) >= 2
    ORDER BY count(*) DESC, max(COALESCE(s.status_changed_at, s.sent_at)) DESC
    LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.prime_repeat_returners(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prime_repeat_returners(UUID) TO authenticated;
