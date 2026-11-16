-- Handled today, under the Today desk (board h8): what staff dealt with since
-- Baghdad midnight, newest first, each with the time and who did it.
--   receipt  a transfer receipt approved or rejected (wallet_topup_requests)
--   reply    a support conversation staff answered (support_messages): one
--            row per conversation, at its last staff reply today
--   change   a change staff made to a shop (admin_activity_logs): money, free
--            days, store orders, unlock, plan, pause, hold, renewal, WhatsApp,
--            reached out, a call logged, solved. Looks, notes, exports, tags
--            and handing a shop to a colleague are not work done for a waiting
--            shop and are left out.
-- A row nobody signed (the system's own steps) is left out, and so is the demo
-- store: the list answers who did what. Names follow the shop timeline: the
-- staff member's name, else their email, else the label the log kept. The
-- console words each row.
--
-- A read for the console's service role only.
--
-- Rollback: DROP FUNCTION public.staff_today_handled(timestamptz);

CREATE OR REPLACE FUNCTION public.staff_today_handled(_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
WITH clock AS (
    SELECT date_trunc('day', _now AT TIME ZONE 'Asia/Baghdad') AT TIME ZONE 'Asia/Baghdad' AS today
),
staff AS (
    SELECT a.user_id, coalesce(nullif(btrim(a.display_name), ''), a.email) AS name
      FROM public.admin_users a
),
receipt AS (
    SELECT r.tenant_id, r.decided_at AS at, s.name AS who,
           jsonb_build_object('kind', 'receipt', 'outcome', r.outcome, 'amount_iqd', r.amount_iqd,
                              'credited_iqd', r.credited_iqd, 'reject_reason', r.reject_reason) AS detail
      FROM public.wallet_topup_requests r
     CROSS JOIN clock c
      LEFT JOIN staff s ON s.user_id = r.decided_by
     WHERE r.decided_at >= c.today AND r.decided_at <= _now
),
reply AS (
    SELECT DISTINCT ON (m.case_id)
           m.tenant_id, m.created_at AS at, coalesce(s.name, nullif(btrim(m.sender_name), '')) AS who,
           jsonb_build_object('kind', 'reply', 'case_id', m.case_id, 'reason', sc.reason) AS detail
      FROM public.support_messages m
     CROSS JOIN clock c
      JOIN public.support_cases sc ON sc.id = m.case_id
      LEFT JOIN staff s ON s.user_id = m.sender_id
     WHERE m.sender_kind = 'staff' AND m.created_at >= c.today AND m.created_at <= _now
     ORDER BY m.case_id, m.created_at DESC
),
change AS (
    SELECT l.tenant_id, l.created_at AS at,
           coalesce(s.name, l.actor_email, nullif(l.admin_label, 'system')) AS who,
           jsonb_build_object('kind', 'change', 'action', l.action, 'details', l.details) AS detail
      FROM public.admin_activity_logs l
     CROSS JOIN clock c
      LEFT JOIN staff s ON s.user_id = l.admin_user_id
     WHERE l.created_at >= c.today AND l.created_at <= _now
       AND l.tenant_id IS NOT NULL
       AND l.action IN ('top_up_wallet', 'top_up', 'extend_trial', 'extend_subscription', 'convert_trial',
                        'add_lock_orders', 'force_unlock', 'status_change', 'reactivate', 'suspend',
                        'pause_tenant', 'unpause_tenant', 'plan_change', 'change_plan', 'auto_renew_toggle',
                        'pause_whatsapp', 'resume_whatsapp', 'support_reached_out', 'support_task_logged',
                        'support_case_solved')
),
handled AS (
    SELECT * FROM receipt
    UNION ALL SELECT * FROM reply
    UNION ALL SELECT * FROM change
)
SELECT jsonb_build_object('handled', coalesce(jsonb_agg(
           jsonb_build_object(
               'tenant_id', t.id,
               'display_id', t.display_id,
               'business_name', t.business_name,
               'at', h.at,
               'who', h.who
           ) || h.detail
           ORDER BY h.at DESC, t.id), '[]'::jsonb))
  FROM handled h
  JOIN public.tenants t ON t.id = h.tenant_id
 WHERE NOT t.is_demo AND h.who IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.staff_today_handled(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_today_handled(timestamptz) TO service_role;
