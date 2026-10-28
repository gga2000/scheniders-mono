-- =============================================================================
-- Phase 2A conversation-management authorization fixture  (SECURITY GATE)
-- =============================================================================
--
-- WHAT THIS PROVES
--   The eight SECURITY DEFINER RPCs added by migration
--   20260621110000_chat_conversation_management.sql enforce their own
--   authorization logic correctly:
--     • Non-members and regular members cannot manage conversations.
--     • Owners and tenant-admins (role='admin' in tenant_members) can.
--     • create_group / chat_add_members silently skip cross-tenant user ids.
--     • The last owner cannot leave or be removed.
--     • Only owners can delete; delete cascades members + messages.
--     • The inverted control proves the RAISE assertions are real.
--
-- HOW TO RUN
--   ONE transaction wrapped in BEGIN; ... ROLLBACK; — NEVER persists anything.
--   Run via a privileged connection that BYPASSES RLS (postgres / service_role):
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/chat_phase2a_authz.sql
--
--   or paste into the Supabase MCP `execute_sql` tool. On success it returns one
--   row "ALL ASSERTIONS PASSED ...". On any authorization failure it ERRORs
--   loudly (RAISE EXCEPTION) and the transaction rolls back.
--
-- HARNESS NOTE (important)
--   We impersonate users with SET LOCAL ROLE authenticated + set_config of
--   request.jwt.claims so the RPCs see the right auth.uid(). But POST-CONDITION
--   READS must NOT run under that impersonated role: a tenant-admin (or anyone)
--   who is not a chat member cannot SELECT a PRIVATE conversation/its members
--   under RLS, which would make a successful mutation *look* like a no-op. So all
--   verification reads go through pg_temp.* SECURITY DEFINER helpers that bypass
--   RLS — they observe the true persisted state regardless of the calling role.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- SEED  (privileged role: RLS bypassed). tenants BEFORE user_profiles because
-- user_profiles.current_tenant_id has a FK to tenants(id).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _ids ON COMMIT DROP AS
SELECT
  gen_random_uuid() AS tenant_a,
  gen_random_uuid() AS tenant_b,
  gen_random_uuid() AS user_owner,
  gen_random_uuid() AS user_member,
  gen_random_uuid() AS user_nonmember,
  gen_random_uuid() AS user_admin,
  gen_random_uuid() AS user_outsider,
  gen_random_uuid() AS conv_channel,
  gen_random_uuid() AS conv_second_owner,
  gen_random_uuid() AS conv_inversion,
  gen_random_uuid() AS msg_1;
GRANT SELECT ON _ids TO authenticated;

INSERT INTO auth.users (id) SELECT user_owner     FROM _ids;
INSERT INTO auth.users (id) SELECT user_member    FROM _ids;
INSERT INTO auth.users (id) SELECT user_nonmember FROM _ids;
INSERT INTO auth.users (id) SELECT user_admin     FROM _ids;
INSERT INTO auth.users (id) SELECT user_outsider  FROM _ids;

INSERT INTO public.tenants (id, business_name, slug)
SELECT tenant_a, 'AuthZ Test Tenant A', 'authz-test-a-' || tenant_a FROM _ids;
INSERT INTO public.tenants (id, business_name, slug)
SELECT tenant_b, 'AuthZ Test Tenant B', 'authz-test-b-' || tenant_b FROM _ids;

INSERT INTO public.user_profiles (id, email, current_tenant_id)
SELECT user_owner,     'authz_owner_'     || user_owner     || '@t.test', tenant_a FROM _ids;
INSERT INTO public.user_profiles (id, email, current_tenant_id)
SELECT user_member,    'authz_member_'    || user_member    || '@t.test', tenant_a FROM _ids;
INSERT INTO public.user_profiles (id, email, current_tenant_id)
SELECT user_nonmember, 'authz_nonmember_' || user_nonmember || '@t.test', tenant_a FROM _ids;
INSERT INTO public.user_profiles (id, email, current_tenant_id)
SELECT user_admin,     'authz_admin_'     || user_admin     || '@t.test', tenant_a FROM _ids;
INSERT INTO public.user_profiles (id, email, current_tenant_id)
SELECT user_outsider,  'authz_outsider_'  || user_outsider  || '@t.test', tenant_b FROM _ids;

-- tenant_members.role uses the live vocabulary (tenant_members_role_check:
-- admin | employee | viewer). Only user_admin is a tenant admin: the chat owner
-- is a plain employee, so CASE 3 proves conversation ownership (not a tenant
-- role) is what lets them manage it. The outsider administers ANOTHER tenant,
-- so CASE 5 proves an admin elsewhere is still skipped as cross-tenant.
-- chat_members.role below is a different column ('owner' | 'member').
INSERT INTO public.tenant_members (tenant_id, user_id, role, status) SELECT tenant_a, user_owner,     'employee', 'active' FROM _ids;
INSERT INTO public.tenant_members (tenant_id, user_id, role, status) SELECT tenant_a, user_member,    'employee', 'active' FROM _ids;
INSERT INTO public.tenant_members (tenant_id, user_id, role, status) SELECT tenant_a, user_nonmember, 'employee', 'active' FROM _ids;
INSERT INTO public.tenant_members (tenant_id, user_id, role, status) SELECT tenant_a, user_admin,     'admin',    'active' FROM _ids;
INSERT INTO public.tenant_members (tenant_id, user_id, role, status) SELECT tenant_b, user_outsider,  'admin',    'active' FROM _ids;

-- conv_channel: private channel in tenant_a; user_owner=owner, user_member=member
INSERT INTO public.chat_conversations (id, tenant_id, kind, name, is_private, created_by)
SELECT conv_channel, tenant_a, 'channel', 'AuthZ Test Channel', true, user_owner FROM _ids;
INSERT INTO public.chat_members (conversation_id, user_id, role) SELECT conv_channel, user_owner,  'owner'  FROM _ids;
INSERT INTO public.chat_members (conversation_id, user_id, role) SELECT conv_channel, user_member, 'member' FROM _ids;
INSERT INTO public.chat_messages (id, conversation_id, tenant_id, sender_id, body)
SELECT msg_1, conv_channel, tenant_a, user_owner, 'authz test message' FROM _ids;

-- conv_second_owner: two owners (for non-last-owner leave)
INSERT INTO public.chat_conversations (id, tenant_id, kind, name, is_private, created_by)
SELECT conv_second_owner, tenant_a, 'channel', 'Two-Owner Channel', true, user_owner FROM _ids;
INSERT INTO public.chat_members (conversation_id, user_id, role) SELECT conv_second_owner, user_owner,  'owner' FROM _ids;
INSERT INTO public.chat_members (conversation_id, user_id, role) SELECT conv_second_owner, user_member, 'owner' FROM _ids;

-- conv_inversion: owned by user_nonmember (for the inverted control)
INSERT INTO public.chat_conversations (id, tenant_id, kind, name, is_private, created_by)
SELECT conv_inversion, tenant_a, 'channel', 'Inversion Channel', true, user_nonmember FROM _ids;
INSERT INTO public.chat_members (conversation_id, user_id, role) SELECT conv_inversion, user_nonmember, 'owner' FROM _ids;

-- ---------------------------------------------------------------------------
-- RLS-bypassing read helpers for post-condition verification.
-- SECURITY DEFINER so the assert observes true persisted state irrespective of
-- the impersonated role (a non-member admin cannot SELECT a private row directly).
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.f_name(p uuid) RETURNS text
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT name FROM public.chat_conversations WHERE id = p $$;
CREATE FUNCTION pg_temp.f_archived(p uuid) RETURNS timestamptz
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT archived_at FROM public.chat_conversations WHERE id = p $$;
CREATE FUNCTION pg_temp.f_conv_exists(p uuid) RETURNS int
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT count(*)::int FROM public.chat_conversations WHERE id = p $$;
CREATE FUNCTION pg_temp.f_member_count(p uuid, u uuid) RETURNS int
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT count(*)::int FROM public.chat_members WHERE conversation_id = p AND user_id = u $$;
CREATE FUNCTION pg_temp.f_msg_count(p uuid) RETURNS int
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT count(*)::int FROM public.chat_messages WHERE conversation_id = p $$;


-- ===========================================================================
-- CASE 1: Non-member / non-admin → rename/archive/add/remove RAISE (42501)
-- ===========================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_nonmember FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); r boolean := false;
BEGIN BEGIN PERFORM public.chat_rename_conversation(v, 'Hacked'); EXCEPTION WHEN SQLSTATE '42501' THEN r := true; END;
IF NOT r THEN RAISE EXCEPTION 'CASE 1a FAILED: non-member could rename'; END IF; END $$;
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); r boolean := false;
BEGIN BEGIN PERFORM public.chat_archive_conversation(v, true); EXCEPTION WHEN SQLSTATE '42501' THEN r := true; END;
IF NOT r THEN RAISE EXCEPTION 'CASE 1b FAILED: non-member could archive'; END IF; END $$;
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); t uuid := (SELECT user_nonmember FROM _ids); r boolean := false;
BEGIN BEGIN PERFORM public.chat_add_members(v, ARRAY[t]); EXCEPTION WHEN SQLSTATE '42501' THEN r := true; END;
IF NOT r THEN RAISE EXCEPTION 'CASE 1c FAILED: non-member could add members'; END IF; END $$;
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); t uuid := (SELECT user_member FROM _ids); r boolean := false;
BEGIN BEGIN PERFORM public.chat_remove_member(v, t); EXCEPTION WHEN SQLSTATE '42501' THEN r := true; END;
IF NOT r THEN RAISE EXCEPTION 'CASE 1d FAILED: non-member could remove a member'; END IF; END $$;
RESET ROLE;

-- ===========================================================================
-- CASE 2: Regular member (non-owner, non-admin) → those RAISE
-- ===========================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_member FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); r boolean := false;
BEGIN BEGIN PERFORM public.chat_rename_conversation(v, 'Hacked'); EXCEPTION WHEN SQLSTATE '42501' THEN r := true; END;
IF NOT r THEN RAISE EXCEPTION 'CASE 2a FAILED: member could rename'; END IF; END $$;
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); r boolean := false;
BEGIN BEGIN PERFORM public.chat_archive_conversation(v, true); EXCEPTION WHEN SQLSTATE '42501' THEN r := true; END;
IF NOT r THEN RAISE EXCEPTION 'CASE 2b FAILED: member could archive'; END IF; END $$;
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); t uuid := (SELECT user_nonmember FROM _ids); r boolean := false;
BEGIN BEGIN PERFORM public.chat_add_members(v, ARRAY[t]); EXCEPTION WHEN SQLSTATE '42501' THEN r := true; END;
IF NOT r THEN RAISE EXCEPTION 'CASE 2c FAILED: member could add members'; END IF; END $$;
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); t uuid := (SELECT user_member FROM _ids); r boolean := false;
BEGIN BEGIN PERFORM public.chat_remove_member(v, t); EXCEPTION WHEN SQLSTATE '42501' THEN r := true; END;
IF NOT r THEN RAISE EXCEPTION 'CASE 2d FAILED: member could remove a member'; END IF; END $$;
RESET ROLE;

-- ===========================================================================
-- CASE 3: Owner → rename/archive/add/remove SUCCEED (verified via DEFINER reads)
-- ===========================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_owner FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); t uuid := (SELECT user_nonmember FROM _ids);
BEGIN
  PERFORM public.chat_rename_conversation(v, 'Renamed By Owner', 'new topic');
  IF pg_temp.f_name(v) <> 'Renamed By Owner' THEN RAISE EXCEPTION 'CASE 3a FAILED: rename did not persist (got %)', pg_temp.f_name(v); END IF;
  PERFORM public.chat_archive_conversation(v, true);
  IF pg_temp.f_archived(v) IS NULL THEN RAISE EXCEPTION 'CASE 3b FAILED: archive did not set archived_at'; END IF;
  PERFORM public.chat_archive_conversation(v, false);
  IF pg_temp.f_archived(v) IS NOT NULL THEN RAISE EXCEPTION 'CASE 3b FAILED: unarchive did not clear archived_at'; END IF;
  PERFORM public.chat_add_members(v, ARRAY[t]);
  IF pg_temp.f_member_count(v, t) <> 1 THEN RAISE EXCEPTION 'CASE 3c FAILED: add_members did not insert'; END IF;
  PERFORM public.chat_remove_member(v, t);
  IF pg_temp.f_member_count(v, t) <> 0 THEN RAISE EXCEPTION 'CASE 3d FAILED: remove_member did not delete'; END IF;
END $$;
RESET ROLE;

-- ===========================================================================
-- CASE 4: Tenant admin (role='admin', NOT a chat member) → SUCCEED
-- (this is exactly the case that needs the DEFINER reads — a non-member admin
--  cannot SELECT the private row directly under RLS)
-- ===========================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_admin FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); t uuid := (SELECT user_nonmember FROM _ids);
BEGIN
  PERFORM public.chat_rename_conversation(v, 'Admin Renamed');
  IF pg_temp.f_name(v) <> 'Admin Renamed' THEN RAISE EXCEPTION 'CASE 4a FAILED: admin rename did not persist (got %)', pg_temp.f_name(v); END IF;
  PERFORM public.chat_archive_conversation(v, true);
  IF pg_temp.f_archived(v) IS NULL THEN RAISE EXCEPTION 'CASE 4b FAILED: admin archive did not set archived_at'; END IF;
  PERFORM public.chat_archive_conversation(v, false);
  PERFORM public.chat_add_members(v, ARRAY[t]);
  IF pg_temp.f_member_count(v, t) <> 1 THEN RAISE EXCEPTION 'CASE 4c FAILED: admin add_members did not insert'; END IF;
  PERFORM public.chat_remove_member(v, t);
  IF pg_temp.f_member_count(v, t) <> 0 THEN RAISE EXCEPTION 'CASE 4d FAILED: admin remove_member did not delete'; END IF;
END $$;
RESET ROLE;

-- ===========================================================================
-- CASE 5: create_group / add_members silently skip a cross-tenant user
-- ===========================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_owner FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $$ DECLARE outsider uuid := (SELECT user_outsider FROM _ids); mem uuid := (SELECT user_member FROM _ids); nc uuid;
BEGIN
  nc := public.chat_create_group('Cross-Tenant Group', ARRAY[mem, outsider]);
  IF pg_temp.f_member_count(nc, outsider) <> 0 THEN RAISE EXCEPTION 'CASE 5a FAILED: create_group added cross-tenant outsider'; END IF;
  IF pg_temp.f_member_count(nc, mem) <> 1 THEN RAISE EXCEPTION 'CASE 5a FAILED: create_group did not add same-tenant member'; END IF;
  PERFORM public.chat_add_members(nc, ARRAY[outsider]);
  IF pg_temp.f_member_count(nc, outsider) <> 0 THEN RAISE EXCEPTION 'CASE 5b FAILED: add_members added cross-tenant outsider'; END IF;
END $$;
RESET ROLE;

-- ===========================================================================
-- CASE 6: leave — last owner RAISES; non-last owner + member SUCCEED
-- ===========================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_owner FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); r boolean := false;
BEGIN BEGIN PERFORM public.chat_leave_conversation(v); EXCEPTION WHEN SQLSTATE '42501' THEN r := true; END;
IF NOT r THEN RAISE EXCEPTION 'CASE 6a FAILED: last owner could leave'; END IF; END $$;
DO $$ DECLARE v uuid := (SELECT conv_second_owner FROM _ids); o uuid := (SELECT user_owner FROM _ids);
BEGIN PERFORM public.chat_leave_conversation(v);
IF pg_temp.f_member_count(v, o) <> 0 THEN RAISE EXCEPTION 'CASE 6b FAILED: non-last owner leave did not remove row'; END IF; END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_member FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); u uuid := (SELECT user_member FROM _ids);
BEGIN PERFORM public.chat_leave_conversation(v);
IF pg_temp.f_member_count(v, u) <> 0 THEN RAISE EXCEPTION 'CASE 6c FAILED: member leave did not remove row'; END IF; END $$;
RESET ROLE;
-- restore user_member to conv_channel for later cases
INSERT INTO public.chat_members (conversation_id, user_id, role)
SELECT conv_channel, user_member, 'member' FROM _ids ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- ===========================================================================
-- CASE 7: remove the last owner RAISES
-- ===========================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_owner FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); t uuid := (SELECT user_owner FROM _ids); r boolean := false;
BEGIN BEGIN PERFORM public.chat_remove_member(v, t); EXCEPTION WHEN SQLSTATE '42501' THEN r := true; END;
IF NOT r THEN RAISE EXCEPTION 'CASE 7 FAILED: last owner could be removed'; END IF; END $$;
RESET ROLE;

-- ===========================================================================
-- CASE 8: delete — non-owner RAISES; owner SUCCEEDS + cascades
-- ===========================================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_member FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids); r boolean := false;
BEGIN BEGIN PERFORM public.chat_delete_conversation(v); EXCEPTION WHEN SQLSTATE '42501' THEN r := true; END;
IF NOT r THEN RAISE EXCEPTION 'CASE 8a FAILED: non-owner could delete'; END IF; END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_owner FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $$ DECLARE v uuid := (SELECT conv_channel FROM _ids);
BEGIN PERFORM public.chat_delete_conversation(v);
  IF pg_temp.f_conv_exists(v) <> 0 THEN RAISE EXCEPTION 'CASE 8b FAILED: conversation row still exists'; END IF;
  IF (SELECT count(*) FROM public.chat_members WHERE conversation_id = v) <> 0 THEN RAISE EXCEPTION 'CASE 8b FAILED: orphan chat_members'; END IF;
  IF pg_temp.f_msg_count(v) <> 0 THEN RAISE EXCEPTION 'CASE 8b FAILED: orphan chat_messages'; END IF;
END $$;
RESET ROLE;

-- ===========================================================================
-- CASE 9: inverted control — proves the assertions are real
-- ===========================================================================
-- 9a INVERTED NEGATIVE: user_member (non-owner) cannot rename conv_inversion
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_member FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $$ DECLARE v uuid := (SELECT conv_inversion FROM _ids); r boolean := false;
BEGIN BEGIN PERFORM public.chat_rename_conversation(v, 'Should Fail'); EXCEPTION WHEN SQLSTATE '42501' THEN r := true; END;
IF NOT r THEN RAISE EXCEPTION 'CASE 9a FAILED: inverted negative did not raise (assertion vacuous)'; END IF; END $$;
RESET ROLE;
-- 9b INVERTED POSITIVE: user_nonmember (the actual owner of conv_inversion) CAN rename
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_nonmember FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $$ DECLARE v uuid := (SELECT conv_inversion FROM _ids);
BEGIN PERFORM public.chat_rename_conversation(v, 'Owner Can Rename');
IF pg_temp.f_name(v) <> 'Owner Can Rename' THEN RAISE EXCEPTION 'CASE 9b FAILED: owner rename did not persist'; END IF; END $$;
RESET ROLE;
-- 9c DOUBLE-INVERSION: non-owner delete still raises
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT user_member FROM _ids)::text, 'role', 'authenticated')::text, true);
DO $$ DECLARE v uuid := (SELECT conv_inversion FROM _ids); r boolean := false;
BEGIN BEGIN PERFORM public.chat_delete_conversation(v); EXCEPTION WHEN SQLSTATE '42501' THEN r := true; END;
IF NOT r THEN RAISE EXCEPTION 'CASE 9c FAILED: non-owner delete did not raise'; END IF; END $$;
RESET ROLE;

-- ===========================================================================
SELECT 'ALL ASSERTIONS PASSED (Phase 2A authz: non-member blocked; owner+admin allowed; cross-tenant skipped; last-owner protected; cascade verified; inverted control real)' AS result;

ROLLBACK;
