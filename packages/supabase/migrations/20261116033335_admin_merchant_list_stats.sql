-- =============================================================================
-- Admin console: merchant list and team numbers are counted in the database
-- =============================================================================
-- Admin audit 2026-11-16, round 1, the rest of finding 2.
--
-- The Merchants list read the orders, wallet lines and usage rows of the shops
-- on the page and counted them in JavaScript. The API returns at most 1,000
-- rows, so a page of busy shops would show too few orders, a wrong "last
-- active" and a short sparkline, with no sign of it. Days were cut on the
-- server's UTC clock, deleted rows and abandoned checkouts counted as orders,
-- and every wallet charge (test reversals included) was added up as revenue.
-- The Team page counted leads, actions and commissions the same way, and it
-- counted unfinished draft leads that the Leads numbers page leaves out.
--
-- The page header added up 30 days of charges the same way, for every shop.
--
-- The words mean what 20261116013246_admin_console_stats.sql says they mean:
-- real order, fees, Baghdad days. "Last 30 days" is today and the 29 Baghdad
-- days before it. A locked shop is reported as locked (tenant_billing_lock),
-- so the list can stop calling it Trial or Active.
--
-- Read-only. Service role only.
-- =============================================================================

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
    LEFT JOIN LATERAL public.tenant_billing_lock(i.tenant_id) bl ON true;
$$;

COMMENT ON FUNCTION public.admin_merchant_list_stats(uuid[], timestamptz) IS
    'Per-shop numbers for the staff console''s Merchants list: real orders and fees over the last 30 Baghdad days, last order, last wallet line, newest usage row and the billing lock. Service role only.';

-- -----------------------------------------------------------------------------
-- Merchants page header: our fees over the same 30 days, for a set of shops.
-- -----------------------------------------------------------------------------
-- One number, because a function that returns rows is cut at 1,000 rows by the
-- API like any table. The window is the one admin_merchant_list_stats uses; the
-- behaviour test holds the two to the same answer.
CREATE OR REPLACE FUNCTION public.admin_fees_30d(_tenant_ids uuid[], _now timestamptz DEFAULT now())
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT coalesce(sum(f.amount_iqd), 0)::bigint
    FROM public.admin_income_facts f
    CROSS JOIN (SELECT (_now AT TIME ZONE 'Asia/Baghdad')::date AS today) c
    WHERE f.tenant_id = ANY (_tenant_ids)
      AND f.kind <> 'other'
      AND f.created_at >= ((c.today - 29)::timestamp AT TIME ZONE 'Asia/Baghdad')
      AND f.created_at < ((c.today + 1)::timestamp AT TIME ZONE 'Asia/Baghdad');
$$;

COMMENT ON FUNCTION public.admin_fees_30d(uuid[], timestamptz) IS
    'Our fees (monthly fee, delivered orders, messages) from a set of shops over the last 30 Baghdad days. Service role only.';

-- -----------------------------------------------------------------------------
-- Team page: one row of counts per member of staff.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_team_counts()
RETURNS TABLE (
    user_id uuid,
    leads_added bigint,
    leads_converted bigint,
    stores_built bigint,
    total_actions bigint,
    commission_earned bigint,
    commission_pending bigint
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT a.user_id,
           l.leads_added,
           l.leads_converted,
           l.stores_built,
           t.total_actions,
           c.earned,
           c.pending
    FROM public.admin_users a
    CROSS JOIN LATERAL (
        -- A lead belongs to the person who added it and to the person it is assigned to.
        -- A draft is an unfinished lead: it is not counted, as on the Leads numbers page.
        SELECT count(*) FILTER (WHERE ld.created_by = a.user_id) AS leads_added,
               count(*) FILTER (WHERE ld.status = 'converted') AS leads_converted,
               count(*) FILTER (WHERE ld.prospect_tenant_id IS NOT NULL) AS stores_built
        FROM public.leads ld
        WHERE NOT ld.is_draft
          AND (ld.created_by = a.user_id OR ld.assigned_to = a.user_id)
    ) l
    CROSS JOIN LATERAL (
        SELECT count(*) AS total_actions
        FROM public.admin_employee_tracking tr
        WHERE tr.admin_user_id = a.user_id
    ) t
    CROSS JOIN LATERAL (
        SELECT coalesce(sum(cm.amount_earned) FILTER (WHERE cm.status = 'paid'), 0)::bigint AS earned,
               coalesce(sum(cm.amount_earned) FILTER (WHERE cm.status = 'pending'), 0)::bigint AS pending
        FROM public.admin_employee_commissions cm
        WHERE cm.admin_user_id = a.user_id
    ) c;
$$;

COMMENT ON FUNCTION public.admin_team_counts() IS
    'Leads, actions and commissions counted per member of staff for the staff console''s Team page. Service role only.';

REVOKE ALL ON FUNCTION public.admin_merchant_list_stats(uuid[], timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_fees_30d(uuid[], timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_team_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merchant_list_stats(uuid[], timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_fees_30d(uuid[], timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_team_counts() TO service_role;
