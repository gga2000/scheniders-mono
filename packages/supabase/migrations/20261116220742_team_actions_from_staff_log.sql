-- Team page: "Actions" counts what staff did (audit, round 3).
--
-- admin_team_counts counted total_actions from admin_employee_tracking, a
-- table nothing writes, so every member of staff showed 0 actions. What staff
-- do is kept in admin_activity_logs: one row per step, under the signed-in
-- staff member's id (lib/activity-logger.ts and the staff money functions).
-- total_actions now counts those rows.
--
-- Two kinds of row are not that person's own step and are left out:
--   mention_in_note   is written under the colleague a note names, not the writer;
--   support_view_end  closes a look-as-the-merchant visit already counted once.
-- Same columns, same types. admin_employee_tracking stays as it is.

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
           c.waiting
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
        -- The staff log, as the Team member page lists it.
        SELECT count(*) AS total_actions
        FROM public.admin_activity_logs lg
        WHERE lg.admin_user_id = a.user_id
          AND lg.action NOT IN ('mention_in_note', 'support_view_end')
    ) t
    CROSS JOIN LATERAL (
        -- Earned: every row. Waiting: earned and not paid yet.
        SELECT coalesce(sum(cm.amount_earned), 0)::bigint AS earned,
               coalesce(sum(cm.amount_earned) FILTER (WHERE cm.status <> 'paid'), 0)::bigint AS waiting
        FROM public.admin_employee_commissions cm
        WHERE cm.admin_user_id = a.user_id
    ) c;
$$;

REVOKE ALL ON FUNCTION public.admin_team_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_team_counts() TO service_role;
