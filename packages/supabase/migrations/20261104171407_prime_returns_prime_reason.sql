-- The returns tab's reasons now also use Prime's own words: Prime's webhook
-- saves a return reason per parcel (prime_shipments.return_reason). The
-- reason the store's team recorded when it rejected the order still comes
-- first; Prime's reason fills in for parcels the team has not filed yet.
--
-- Same signature, rows and grants as 20261104020419; SECURITY INVOKER, so a
-- member reads only their own tenant's rows (RLS on prime_shipments and
-- orders); p_tenant_id only narrows to the store in view.

CREATE OR REPLACE FUNCTION public.prime_returns_groups(p_tenant_id UUID)
RETURNS TABLE (
    shipment_status TEXT,
    step_code       TEXT,
    cancelled       BOOLEAN,
    resent          BOOLEAN,
    governorate     TEXT,
    reason          TEXT,
    changed_day     TEXT,
    parcels         INTEGER
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
           count(*)::INTEGER
    FROM public.prime_shipments s
    JOIN public.orders o ON o.id = s.order_id AND o.tenant_id = s.tenant_id
    WHERE s.tenant_id = p_tenant_id
      AND COALESCE(s.status_changed_at, s.sent_at) >= now() - INTERVAL '60 days'
    GROUP BY 1, 2, 3, 4, 5, 6, 7;
$$;

REVOKE ALL ON FUNCTION public.prime_returns_groups(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prime_returns_groups(UUID) TO authenticated;
