-- The Today desk, the staff console's home page (board h1, h2, h3, h6, h7).
--
-- staff_today_desk lists the shops that need someone now, each shop once, in
-- the first group it fits:
--   money      a transfer receipt waiting for staff
--   locked     tenant_billing_lock says the shop is locked
--   lock_soon  its trial or paid month ends within 3 days and renewal will not
--              go through: the wallet holds less than renew_subscription_core
--              takes (subscription_price_iqd), or, for a trial, there is no
--              running subscription to renew at all
--   support    a conversation waiting on us
-- The demo store is never listed, and our own shops (plan internal) are never
-- billed, so they never lock. The console sorts and words the rows.
--
-- A read for the console's service role only.
--
-- Rollback: DROP FUNCTION public.staff_today_desk();

CREATE OR REPLACE FUNCTION public.staff_today_desk()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
WITH shop AS (
    SELECT t.id, t.display_id, t.business_name, t.status::text AS status, t.plan, t.contact_phone,
           t.trial_ends_at, coalesce(w.balance_iqd, 0) AS wallet_iqd
      FROM public.tenants t
      LEFT JOIN public.wallet w ON w.tenant_id = t.id
     WHERE NOT t.is_demo
),
newest_sub AS (
    SELECT DISTINCT ON (s.tenant_id) s.tenant_id, s.status::text AS status, s.current_period_end,
           coalesce(s.pending_plan, s.plan) AS plan
      FROM public.subscriptions s
     ORDER BY s.tenant_id, s.created_at DESC
),
money AS (
    SELECT r.tenant_id, min(r.created_at) AS at,
           jsonb_build_object('receipts', count(*),
                              'amount_iqd', (array_agg(r.amount_iqd ORDER BY r.created_at))[1]) AS detail
      FROM public.wallet_topup_requests r
     WHERE r.decided_at IS NULL
     GROUP BY r.tenant_id
),
locked AS (
    SELECT s.id AS tenant_id, l.since AS at,
           jsonb_build_object('reason', l.reason,
                              'orders_left', (public.billing_lock_snapshot(s.id) ->> 'orders_left')::integer) AS detail
      FROM shop s
     CROSS JOIN LATERAL public.tenant_billing_lock(s.id) l
),
due AS (
    SELECT s.id AS tenant_id, s.wallet_iqd,
           CASE WHEN s.status = 'trial' THEN 'trial_ends' ELSE 'month_ends' END AS reason,
           CASE WHEN s.status = 'trial' THEN s.trial_ends_at ELSE n.current_period_end END AS at,
           -- A trial with nothing to renew locks at its end whatever the wallet holds.
           s.status = 'trial' AND coalesce(n.status NOT IN ('trialing', 'active'), true) AS nothing_to_renew,
           coalesce(public.subscription_price_iqd(s.id, coalesce(n.plan, s.plan)), 0) AS price_iqd
      FROM shop s
      LEFT JOIN newest_sub n ON n.tenant_id = s.id
     WHERE s.plan IS DISTINCT FROM 'internal'
       AND (   (s.status = 'trial' AND s.trial_ends_at > now() AND s.trial_ends_at <= now() + interval '3 days')
            OR (s.status = 'active' AND n.status = 'active'
                AND n.current_period_end > now() AND n.current_period_end <= now() + interval '3 days'))
),
lock_soon AS (
    SELECT d.tenant_id, d.at,
           jsonb_build_object('reason', d.reason, 'price_iqd', d.price_iqd,
                              'short_iqd', greatest(d.price_iqd - d.wallet_iqd, 0),
                              'nothing_to_renew', d.nothing_to_renew) AS detail
      FROM due d
     WHERE d.nothing_to_renew OR (d.price_iqd > 0 AND d.wallet_iqd < d.price_iqd)
),
support AS (
    SELECT c.tenant_id, min(coalesce(c.waiting_since, c.last_message_at)) AS at,
           jsonb_build_object(
               'questions', count(*),
               'case_id', (array_agg(c.id ORDER BY coalesce(c.waiting_since, c.last_message_at)))[1],
               'preview', (array_agg(c.last_message_preview ORDER BY coalesce(c.waiting_since, c.last_message_at)))[1]
           ) AS detail
      FROM public.support_cases c
     WHERE c.status = 'waiting_us'
     GROUP BY c.tenant_id
),
waiting AS (
    SELECT 1 AS rank, 'money' AS grp, tenant_id, at, detail FROM money
    UNION ALL SELECT 2, 'locked', tenant_id, at, detail FROM locked
    UNION ALL SELECT 3, 'lock_soon', tenant_id, at, detail FROM lock_soon
    UNION ALL SELECT 4, 'support', tenant_id, at, detail FROM support
),
first_fit AS (
    SELECT DISTINCT ON (w.tenant_id) w.*
      FROM waiting w
     ORDER BY w.tenant_id, w.rank
)
SELECT jsonb_build_object('shops', coalesce(jsonb_agg(
           jsonb_build_object(
               'group', f.grp,
               'tenant_id', s.id,
               'display_id', s.display_id,
               'business_name', s.business_name,
               'status', s.status,
               'plan', s.plan,
               'contact_phone', s.contact_phone,
               'wallet_iqd', s.wallet_iqd,
               'at', f.at
           ) || f.detail
           ORDER BY f.rank, f.at, s.id), '[]'::jsonb))
  FROM first_fit f
  JOIN shop s ON s.id = f.tenant_id;
$$;
REVOKE ALL ON FUNCTION public.staff_today_desk() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_today_desk() TO service_role;
