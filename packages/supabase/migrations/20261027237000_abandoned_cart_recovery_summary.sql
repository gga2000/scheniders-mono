-- get_abandoned_cart_recovery: the numbers behind the recovery strip on the
-- orders Abandoned tab, for one tenant, over carts abandoned in the last
-- _days days (abandoned_cart_at). Reads trashed rows too (auto-removed carts),
-- so it is SECURITY DEFINER with the same tenant-membership guard as
-- get_orders_aggregates. recovered_iqd is null for callers without
-- VIEW_FINANCIALS (SEC-D2, same rule as get_dashboard_metrics: admin and
-- super_admin only), so the UI shows the mask, never a zero.
--
-- Shape:
--   open, open_stale (older than 3 days)       still in Abandoned
--   recovered, recovered_completed,
--   recovered_iqd                              staff took the cart (contacted);
--                                              completed = delivered/completed,
--                                              iqd = their price
--   returned                                   customer came back and ordered
--   removed { junk_phone, junk_location,
--             already_ordered, expired }       trashed by the system
--   by_staff [{ name, recovered }]             contacted, per staff name
--   rate                                       (recovered + returned) * 100 /
--                                              real carts: not junk, not a late
--                                              duplicate of an order
--                                              (already_ordered), and a returned
--                                              cart counted once (by its order)

CREATE OR REPLACE FUNCTION public.get_abandoned_cart_recovery(_tenant_id uuid, _days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _since timestamptz := now() - make_interval(days => greatest(coalesce(_days, 30), 1));
    _can_see_money boolean := coalesce(auth.role(), 'service_role') = 'service_role'
        OR EXISTS (SELECT 1 FROM public.user_profiles up
                    WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin'));
    _result jsonb;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
        END IF;
    END IF;

    WITH carts AS (
        SELECT o.status, o.price, o.deleted_at, o.is_archived, o.abandoned_cart_at,
               o.abandoned_cart_outcome AS outcome, o.abandoned_cart_resolved_by_name AS by_name
          FROM public.orders o
         WHERE o.tenant_id = _tenant_id
           AND o.abandoned_cart_at >= _since
    ), live AS (
        SELECT * FROM carts WHERE deleted_at IS NULL
    ), totals AS (
        SELECT
            (SELECT count(*) FROM live WHERE status = 'pending_checkout' AND NOT is_archived)              AS open,
            (SELECT count(*) FROM live WHERE status = 'pending_checkout' AND NOT is_archived
                                         AND abandoned_cart_at < now() - interval '3 days')             AS open_stale,
            (SELECT count(*) FROM live WHERE status <> 'pending_checkout' AND outcome = 'contacted')       AS recovered,
            (SELECT count(*) FROM live WHERE outcome = 'contacted' AND status IN ('delivered','completed')) AS recovered_completed,
            (SELECT coalesce(sum(price), 0) FROM live
              WHERE outcome = 'contacted' AND status IN ('delivered','completed'))                         AS recovered_iqd,
            (SELECT count(*) FROM live WHERE status <> 'pending_checkout' AND outcome = 'returned')        AS returned,
            (SELECT count(*) FROM carts
              WHERE outcome IS DISTINCT FROM 'junk_phone'
                AND outcome IS DISTINCT FROM 'junk_location'
                AND outcome IS DISTINCT FROM 'already_ordered'
                AND NOT (deleted_at IS NOT NULL AND outcome = 'returned'))                                 AS real_carts
    )
    SELECT jsonb_build_object(
        'days', greatest(coalesce(_days, 30), 1),
        'open', t.open,
        'open_stale', t.open_stale,
        'recovered', t.recovered,
        'recovered_completed', t.recovered_completed,
        'recovered_iqd', CASE WHEN _can_see_money THEN t.recovered_iqd END,
        'returned', t.returned,
        'removed', jsonb_build_object(
            'junk_phone',      (SELECT count(*) FROM carts WHERE deleted_at IS NOT NULL AND outcome = 'junk_phone'),
            'junk_location',   (SELECT count(*) FROM carts WHERE deleted_at IS NOT NULL AND outcome = 'junk_location'),
            'already_ordered', (SELECT count(*) FROM carts WHERE deleted_at IS NOT NULL AND outcome = 'already_ordered'),
            'expired',         (SELECT count(*) FROM carts WHERE deleted_at IS NOT NULL AND outcome = 'expired')),
        'by_staff', coalesce((
            SELECT jsonb_agg(jsonb_build_object('name', s.name, 'recovered', s.n) ORDER BY s.n DESC, s.name)
              FROM (SELECT coalesce(nullif(trim(by_name), ''), '—') AS name, count(*) AS n
                      FROM live WHERE status <> 'pending_checkout' AND outcome = 'contacted'
                     GROUP BY 1) s), '[]'::jsonb),
        'rate', CASE WHEN t.real_carts > 0
                     THEN round((t.recovered + t.returned)::numeric * 100 / t.real_carts, 1)
                     ELSE 0 END
    ) INTO _result
    FROM totals t;

    RETURN _result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_abandoned_cart_recovery(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_abandoned_cart_recovery(uuid, integer) TO authenticated, service_role;
