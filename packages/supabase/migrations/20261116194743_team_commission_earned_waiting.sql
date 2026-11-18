-- Team page: commission numbers that add up (audit, round 3).
--
-- admin_team_counts answered commission_earned with only the PAID rows and
-- commission_pending with only the pending rows. The console shows
-- "Commission earned", "Commission waiting" and "Commission paid", the last
-- worked out as earned minus waiting. So a member of staff with 40,000 IQD
-- paid and 8,000 pending showed 40,000 earned and 32,000 paid, and an
-- approved commission (owed, not paid yet) was counted nowhere.
--
-- Every commission row is earned: pending, approved and paid are steps of its
-- payment. Now:
--   commission_earned  = every row;
--   commission_pending = the rows not paid yet (pending or approved), shown
--                        as "waiting";
-- so earned minus waiting is exactly what was paid. Same columns, same types.

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
        SELECT count(*) AS total_actions
        FROM public.admin_employee_tracking tr
        WHERE tr.admin_user_id = a.user_id
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
