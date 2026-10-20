-- activity_logs becomes append-only for signed-in users, and each user can
-- only write rows about themselves (launch verdict item 5, 2026-10-19).
--
-- WHY
-- activity_logs is the attendance and work record that payroll reads
-- (apps/platform/hooks/use-salaries.ts), that staff metrics and goals read
-- (use-employee-metrics, goal-tracking) and that the dashboard uses for staff
-- attribution (get_dashboard_metrics). 20261019100100_tenant_admin_only_writes
-- limited the payroll tables to tenant admins, but left this table on the
-- tenant-only rule:
--   tenant_isolation_insert  WITH CHECK tenant_id IN get_user_tenant_ids()
--   tenant_isolation_update  USING/CHECK the same
--   tenant_isolation_delete  USING the same
-- So any member could delete or rewrite their own (or a colleague's) history,
-- and insert rows under another user's user_id, which feed straight into pay.
--
-- WHAT THIS CHANGES
--   * INSERT also requires user_id = auth.uid(). The only app writer,
--     lib/activity-logger.ts, already sets user_id from the caller's session.
--     Live 2026-10-19: all 7,698 rows have a user_id that is a member of the
--     row's tenant.
--   * UPDATE and DELETE are revoked from authenticated, and their policies
--     now match no row, so restoring a grant later does not reopen them. No
--     app code updates or deletes these rows. The service role (retention,
--     support) is unaffected.
--   * anon loses every privilege it held on the table (it held all of them;
--     RLS was the only thing stopping it). SELECT stays as it was for members.

ALTER POLICY tenant_isolation_insert ON public.activity_logs
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND user_id = (SELECT auth.uid())
    );

ALTER POLICY tenant_isolation_update ON public.activity_logs
    USING (false)
    WITH CHECK (false);

ALTER POLICY tenant_isolation_delete ON public.activity_logs
    USING (false);

REVOKE ALL ON public.activity_logs FROM PUBLIC, anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.activity_logs FROM authenticated;
