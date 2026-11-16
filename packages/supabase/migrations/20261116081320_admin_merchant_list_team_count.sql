-- =============================================================================
-- Admin console: the Merchants list sends each shop's real team size
-- =============================================================================
-- Admin audit 2026-11-16.
--
-- The list's only team number was usage_tracking.team_members_count. That
-- column is written once, at sign-up, with 1, and nothing updates it. Live on
-- 16 Nov: a shop with 7 active members showed a team of 0, a shop with 2
-- showed 1. The console's sheet view and its compare view showed that number.
--
-- admin_merchant_list_stats now also returns team_members: the shop's active
-- members today, counted from tenant_members. The usage columns stay as they
-- are, for the usage month they describe.
--
-- A function cannot be replaced with another return type, so it is dropped and
-- created again in this one transaction. Read-only. Service role only.
-- =============================================================================

DROP FUNCTION public.admin_merchant_list_stats(uuid[], timestamptz);

CREATE OR REPLACE FUNCTION public.admin_merchant_list_stats(_tenant_ids uuid[], _now timestamptz DEFAULT now())
RETURNS TABLE (
    tenant_id uuid,
    orders_30d bigint,
    order_sparkline integer[],
    last_order_at timestamptz,
    fees_30d bigint,
    fees_today bigint,
    last_wallet_at timestamptz,
    usage_orders_count integer,
    usage_orders_charged integer,
    usage_team_members_count integer,
    team_members bigint,
    lock_reason text,
    lock_since timestamptz
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH ids AS (
        SELECT DISTINCT u.tenant_id FROM unnest(_tenant_ids) AS u (tenant_id)
    ),
    win AS (
        -- The 30 Baghdad days that end today, as instants, so the indexes on created_at are used.
        SELECT c.today,
               ((c.today - 29)::timestamp AT TIME ZONE 'Asia/Baghdad') AS from_ts,
               ((c.today + 1)::timestamp AT TIME ZONE 'Asia/Baghdad') AS to_ts
        FROM (SELECT (_now AT TIME ZONE 'Asia/Baghdad')::date AS today) c
    ),
    day_counts AS (
        SELECT f.tenant_id, f.created_local::date AS day, count(*)::integer AS n
        FROM public.admin_order_facts f
        CROSS JOIN win w
        WHERE f.tenant_id = ANY (_tenant_ids)
          AND f.created_at >= w.from_ts
          AND f.created_at < w.to_ts
        GROUP BY f.tenant_id, f.created_local::date
    ),
    spark AS (
        -- One number per day, oldest first, today last. A day with no order is a 0, not a gap.
        SELECT i.tenant_id,
               array_agg(coalesce(dc.n, 0) ORDER BY d.day) AS order_sparkline,
               coalesce(sum(dc.n), 0)::bigint AS orders_30d
        FROM ids i
        CROSS JOIN win w
        CROSS JOIN LATERAL generate_series(w.today - 29, w.today, interval '1 day') AS d (day)
        LEFT JOIN day_counts dc ON dc.tenant_id = i.tenant_id AND dc.day = d.day::date
        GROUP BY i.tenant_id
    ),
    fees AS (
        SELECT f.tenant_id,
               sum(f.amount_iqd)::bigint AS fees_30d,
               coalesce(sum(f.amount_iqd) FILTER (WHERE f.created_local::date = w.today), 0)::bigint AS fees_today
        FROM public.admin_income_facts f
        CROSS JOIN win w
        WHERE f.tenant_id = ANY (_tenant_ids)
          AND f.kind <> 'other'
          AND f.created_at >= w.from_ts
          AND f.created_at < w.to_ts
        GROUP BY f.tenant_id
    )
    SELECT i.tenant_id,
           s.orders_30d,
           s.order_sparkline,
           lo.last_order_at,
           coalesce(fe.fees_30d, 0),
           coalesce(fe.fees_today, 0),
           lw.last_wallet_at,
           us.orders_count,
           us.orders_charged,
           us.team_members_count,
           tm.team_members,
           bl.reason,
           bl.since
    FROM ids i
    JOIN spark s ON s.tenant_id = i.tenant_id
    LEFT JOIN fees fe ON fe.tenant_id = i.tenant_id
    LEFT JOIN LATERAL (
        SELECT max(f.created_at) AS last_order_at
        FROM public.admin_order_facts f
        WHERE f.tenant_id = i.tenant_id
    ) lo ON true
    LEFT JOIN LATERAL (
        SELECT max(wt.created_at) AS last_wallet_at
        FROM public.wallet_transactions wt
        WHERE wt.tenant_id = i.tenant_id
    ) lw ON true
    LEFT JOIN LATERAL (
        SELECT ut.orders_count, ut.orders_charged, ut.team_members_count
        FROM public.usage_tracking ut
        WHERE ut.tenant_id = i.tenant_id
        ORDER BY ut.year DESC, ut.month DESC
        LIMIT 1
    ) us ON true
    CROSS JOIN LATERAL (
        -- People who can sign in to the shop today. An invitation not yet accepted
        -- and a suspended member are not on the team.
        SELECT count(*) AS team_members
        FROM public.tenant_members m
        WHERE m.tenant_id = i.tenant_id
          AND m.status = 'active'
    ) tm
    LEFT JOIN LATERAL public.tenant_billing_lock(i.tenant_id) bl ON true;
$$;

COMMENT ON FUNCTION public.admin_merchant_list_stats(uuid[], timestamptz) IS
    'Per-shop numbers for the staff console''s Merchants list: real orders and fees over the last 30 Baghdad days, last order, last wallet line, newest usage row, active team members and the billing lock. Service role only.';

REVOKE ALL ON FUNCTION public.admin_merchant_list_stats(uuid[], timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merchant_list_stats(uuid[], timestamptz) TO service_role;
