-- Staff tables: no browser rights (staff console audit, round 3, item 12).
--
-- Seven staff tables kept every table right for anon and authenticated, the
-- Supabase default for a new table: the staff log, staff notes, the watch
-- list, commissions and their rules, badges, and the old tracking table. Row
-- security already answers "false" to both roles on each of them, so nothing
-- leaks today; this takes the rights away as well, so a policy changed by
-- mistake cannot open them. The staff console reads and writes them with the
-- service role only, which keeps its rights.
--
-- Left as they are: admin_users and support_view_sessions, where a signed-in
-- person may read their own row and nothing else.

REVOKE ALL ON TABLE
    public.admin_activity_logs,
    public.admin_notes,
    public.admin_watchlist,
    public.admin_commission_config,
    public.admin_employee_commissions,
    public.admin_employee_achievements,
    public.admin_employee_tracking
FROM PUBLIC, anon, authenticated;
