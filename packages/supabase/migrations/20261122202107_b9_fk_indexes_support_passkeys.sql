-- B9: the foreign keys added since part 1 (20261116111147) that have no
-- covering index get one, as part 1 did for the other 131 (Supabase lint
-- 0001). Deleting a user, an admin or a support case checks each referencing
-- table; without the index that check reads the whole table. All five tables
-- are empty today, so this costs nothing now and keeps those deletes cheap as
-- support sessions, notes and passkey sign-ins pile up.
CREATE INDEX IF NOT EXISTS idx_support_case_notes_case_id_tenant_id_fk ON public.support_case_notes (case_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_notices_created_by_fk ON public.support_notices (created_by);
CREATE INDEX IF NOT EXISTS idx_support_notices_ended_by_fk ON public.support_notices (ended_by);
CREATE INDEX IF NOT EXISTS idx_support_view_sessions_admin_id_fk ON public.support_view_sessions (admin_id);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_user_id_fk ON public.passkey_challenges (user_id);
