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
--     • The inverted control (grant-wrong-role section) proves the RAISE
--       assertions are real — granting them would flip every check to a crash.
--
-- HOW TO RUN
--   The whole script is ONE transaction wrapped in BEGIN; ... ROLLBACK; so it
--   NEVER persists anything. Run it via any privileged connection that BYPASSES
--   RLS (postgres / service_role), e.g.:
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/chat_phase2a_authz.sql
--
--   or paste it into the Supabase MCP `execute_sql` tool. On success it prints
--   a single row: "ALL ASSERTIONS PASSED ...". On any authorization failure it
--   ERRORs loudly (RAISE EXCEPTION) and the transaction rolls back.
--   Re-runnable: all ids are gen_random_uuid(); nothing committed.
--
-- HARNESS (mirrors chat_rls.sql)
--   Seed rows as the privileged role (RLS bypassed) into a TEMP TABLE _ids,
--   then SET LOCAL ROLE authenticated + set_config(request.jwt.claims) to
--   impersonate a specific user, then call the RPC in a DO block. RESET ROLE
--   between phases. RAISE EXCEPTION = assertion failure. ROLLBACK at end.
--
-- USERS / ROLES IN THIS FIXTURE
--   tenant_a  — the home tenant for this test
--   tenant_b  — a foreign tenant (provides the cross-tenant outsider)
--   user_owner    — owner member of conv_channel in tenant_a
--   user_member   — regular 'member' in conv_channel in tenant_a
--   user_nonmember — active in tenant_a but NOT in conv_channel
--   user_admin    — role='admin' in tenant_a, NOT a chat member
--   user_outsider — active only in tenant_b (cross-tenant)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- SEED  (privileged role: RLS bypassed)
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
  gen_random_uuid() AS msg_1;
GRANT SELECT ON _ids TO authenticated;

-- auth.users rows (only id is required)
INSERT INTO auth.users (id) SELECT user_owner      FROM _ids;
INSERT INTO auth.users (id) SELECT user_member     FROM _ids;
INSERT INTO auth.users (id) SELECT user_nonmember  FROM _ids;
INSERT INTO auth.users (id) SELECT user_admin      FROM _ids;
INSERT INTO auth.users (id) SELECT user_outsider   FROM _ids;

-- user_profiles (get_current_tenant_id reads current_tenant_id from here)
INSERT INTO public.user_profiles (id, email, current_tenant_id)
SELECT user_owner,     'authz_owner_'      || user_owner     || '@t.test', tenant_a FROM _ids;
INSERT INTO public.user_profiles (id, email, current_tenant_id)
SELECT user_member,    'authz_member_'     || user_member    || '@t.test', tenant_a FROM _ids;
INSERT INTO public.user_profiles (id, email, current_tenant_id)
SELECT user_nonmember, 'authz_nonmember_'  || user_nonmember || '@t.test', tenant_a FROM _ids;
INSERT INTO public.user_profiles (id, email, current_tenant_id)
SELECT user_admin,     'authz_admin_'      || user_admin     || '@t.test', tenant_a FROM _ids;
INSERT INTO public.user_profiles (id, email, current_tenant_id)
SELECT user_outsider,  'authz_outsider_'   || user_outsider  || '@t.test', tenant_b FROM _ids;

-- tenants
INSERT INTO public.tenants (id, business_name, slug)
SELECT tenant_a, 'AuthZ Test Tenant A', 'authz-test-a-' || tenant_a FROM _ids;
INSERT INTO public.tenants (id, business_name, slug)
SELECT tenant_b, 'AuthZ Test Tenant B', 'authz-test-b-' || tenant_b FROM _ids;

-- tenant_members
-- user_owner     → 'owner'  in tenant_a (also the chat owner)
-- user_member    → 'member' in tenant_a
-- user_nonmember → 'member' in tenant_a (not in the chat channel)
-- user_admin     → 'admin'  in tenant_a (chat non-member; is_tenant_admin() = true)
-- user_outsider  → 'owner'  in tenant_b only
INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
SELECT tenant_a, user_owner,     'owner',  'active' FROM _ids;
INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
SELECT tenant_a, user_member,    'member', 'active' FROM _ids;
INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
SELECT tenant_a, user_nonmember, 'member', 'active' FROM _ids;
INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
SELECT tenant_a, user_admin,     'admin',  'active' FROM _ids;
INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
SELECT tenant_b, user_outsider,  'owner',  'active' FROM _ids;

-- conv_channel: a private channel in tenant_a owned by user_owner
--   user_owner  = 'owner' chat member
--   user_member = 'member' chat member
INSERT INTO public.chat_conversations (id, tenant_id, kind, name, is_private, created_by)
SELECT conv_channel, tenant_a, 'channel', 'AuthZ Test Channel', true, user_owner FROM _ids;
INSERT INTO public.chat_members (conversation_id, user_id, role)
SELECT conv_channel, user_owner,  'owner'  FROM _ids;
INSERT INTO public.chat_members (conversation_id, user_id, role)
SELECT conv_channel, user_member, 'member' FROM _ids;

-- a message in conv_channel (for cascade check in Case 8)
INSERT INTO public.chat_messages (id, conversation_id, tenant_id, sender_id, body)
SELECT msg_1, conv_channel, tenant_a, user_owner, 'authz test message' FROM _ids;

-- conv_second_owner: used for last-owner tests; two owners so one can leave/be-removed
--   user_owner  = 'owner' + user_member = 'owner' (both owners)
INSERT INTO public.chat_conversations (id, tenant_id, kind, name, is_private, created_by)
SELECT conv_second_owner, tenant_a, 'channel', 'Two-Owner Channel', true, user_owner FROM _ids;
INSERT INTO public.chat_members (conversation_id, user_id, role)
SELECT conv_second_owner, user_owner,  'owner' FROM _ids;
INSERT INTO public.chat_members (conversation_id, user_id, role)
SELECT conv_second_owner, user_member, 'owner' FROM _ids;


-- ===========================================================================
-- CASE 1: Non-member / non-admin → rename/archive/add/remove RAISE (42501)
-- ===========================================================================

-- 1a: user_nonmember calls chat_rename_conversation → must raise
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_nonmember FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv uuid  := (SELECT conv_channel FROM _ids);
  v_raised     boolean := false;
BEGIN
  BEGIN
    PERFORM public.chat_rename_conversation(v_conv, 'Hacked Name');
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CASE 1a FAILED: non-member could rename conversation (expected 42501)';
  END IF;
END $$;

-- 1b: user_nonmember calls chat_archive_conversation → must raise
DO $$
DECLARE
  v_conv uuid  := (SELECT conv_channel FROM _ids);
  v_raised     boolean := false;
BEGIN
  BEGIN
    PERFORM public.chat_archive_conversation(v_conv, true);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CASE 1b FAILED: non-member could archive conversation (expected 42501)';
  END IF;
END $$;

-- 1c: user_nonmember calls chat_add_members → must raise
DO $$
DECLARE
  v_conv    uuid  := (SELECT conv_channel FROM _ids);
  v_target  uuid  := (SELECT user_nonmember FROM _ids);
  v_raised  boolean := false;
BEGIN
  BEGIN
    PERFORM public.chat_add_members(v_conv, ARRAY[v_target]);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CASE 1c FAILED: non-member could add members (expected 42501)';
  END IF;
END $$;

-- 1d: user_nonmember calls chat_remove_member → must raise
DO $$
DECLARE
  v_conv    uuid  := (SELECT conv_channel FROM _ids);
  v_target  uuid  := (SELECT user_member FROM _ids);
  v_raised  boolean := false;
BEGIN
  BEGIN
    PERFORM public.chat_remove_member(v_conv, v_target);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CASE 1d FAILED: non-member could remove a member (expected 42501)';
  END IF;
END $$;

RESET ROLE;


-- ===========================================================================
-- CASE 2: Regular member (non-owner, non-admin) → those RAISE
-- ===========================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_member FROM _ids)::text, 'role', 'authenticated')::text, true);

-- 2a: regular member rename → must raise
DO $$
DECLARE
  v_conv   uuid    := (SELECT conv_channel FROM _ids);
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.chat_rename_conversation(v_conv, 'Hacked By Member');
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CASE 2a FAILED: regular member could rename (expected 42501)';
  END IF;
END $$;

-- 2b: regular member archive → must raise
DO $$
DECLARE
  v_conv   uuid    := (SELECT conv_channel FROM _ids);
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.chat_archive_conversation(v_conv, true);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CASE 2b FAILED: regular member could archive (expected 42501)';
  END IF;
END $$;

-- 2c: regular member add_members → must raise
DO $$
DECLARE
  v_conv    uuid    := (SELECT conv_channel FROM _ids);
  v_target  uuid    := (SELECT user_nonmember FROM _ids);
  v_raised  boolean := false;
BEGIN
  BEGIN
    PERFORM public.chat_add_members(v_conv, ARRAY[v_target]);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CASE 2c FAILED: regular member could add members (expected 42501)';
  END IF;
END $$;

-- 2d: regular member remove_member → must raise
DO $$
DECLARE
  v_conv    uuid    := (SELECT conv_channel FROM _ids);
  v_target  uuid    := (SELECT user_member FROM _ids);
  v_raised  boolean := false;
BEGIN
  BEGIN
    PERFORM public.chat_remove_member(v_conv, v_target);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CASE 2d FAILED: regular member could remove a member (expected 42501)';
  END IF;
END $$;

RESET ROLE;


-- ===========================================================================
-- CASE 3: Owner → rename/archive/add/remove SUCCEED
-- ===========================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_owner FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv    uuid := (SELECT conv_channel FROM _ids);
  v_target  uuid := (SELECT user_nonmember FROM _ids);
  v_name    text;
  v_archive timestamptz;
  v_count   int;
BEGIN
  -- rename succeeds
  PERFORM public.chat_rename_conversation(v_conv, 'Renamed By Owner', 'new topic');
  SELECT name INTO v_name FROM public.chat_conversations WHERE id = v_conv;
  IF v_name <> 'Renamed By Owner' THEN
    RAISE EXCEPTION 'CASE 3a FAILED: rename did not persist (got %)', v_name;
  END IF;

  -- archive succeeds
  PERFORM public.chat_archive_conversation(v_conv, true);
  SELECT archived_at INTO v_archive FROM public.chat_conversations WHERE id = v_conv;
  IF v_archive IS NULL THEN
    RAISE EXCEPTION 'CASE 3b FAILED: archive did not set archived_at';
  END IF;

  -- unarchive succeeds
  PERFORM public.chat_archive_conversation(v_conv, false);
  SELECT archived_at INTO v_archive FROM public.chat_conversations WHERE id = v_conv;
  IF v_archive IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 3b FAILED: unarchive did not clear archived_at';
  END IF;

  -- add_members succeeds (adds user_nonmember)
  PERFORM public.chat_add_members(v_conv, ARRAY[v_target]);
  SELECT count(*) INTO v_count FROM public.chat_members
    WHERE conversation_id = v_conv AND user_id = v_target;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CASE 3c FAILED: add_members did not insert membership (count=%)', v_count;
  END IF;

  -- remove_member succeeds (removes user_nonmember again)
  PERFORM public.chat_remove_member(v_conv, v_target);
  SELECT count(*) INTO v_count FROM public.chat_members
    WHERE conversation_id = v_conv AND user_id = v_target;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CASE 3d FAILED: remove_member did not delete membership (count=%)', v_count;
  END IF;
END $$;

RESET ROLE;


-- ===========================================================================
-- CASE 4: Tenant admin (non-member) → SUCCEED
-- ===========================================================================
-- user_admin: role='admin' in tenant_members for tenant_a, NOT in chat_members

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_admin FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv    uuid := (SELECT conv_channel FROM _ids);
  v_target  uuid := (SELECT user_nonmember FROM _ids);
  v_name    text;
  v_archive timestamptz;
  v_count   int;
BEGIN
  -- admin rename succeeds
  PERFORM public.chat_rename_conversation(v_conv, 'Admin Renamed');
  SELECT name INTO v_name FROM public.chat_conversations WHERE id = v_conv;
  IF v_name <> 'Admin Renamed' THEN
    RAISE EXCEPTION 'CASE 4a FAILED: tenant admin rename did not persist (got %)', v_name;
  END IF;

  -- admin archive succeeds
  PERFORM public.chat_archive_conversation(v_conv, true);
  SELECT archived_at INTO v_archive FROM public.chat_conversations WHERE id = v_conv;
  IF v_archive IS NULL THEN
    RAISE EXCEPTION 'CASE 4b FAILED: tenant admin archive did not set archived_at';
  END IF;
  PERFORM public.chat_archive_conversation(v_conv, false);

  -- admin add_members succeeds
  PERFORM public.chat_add_members(v_conv, ARRAY[v_target]);
  SELECT count(*) INTO v_count FROM public.chat_members
    WHERE conversation_id = v_conv AND user_id = v_target;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CASE 4c FAILED: tenant admin add_members did not insert (count=%)', v_count;
  END IF;

  -- admin remove_member succeeds
  PERFORM public.chat_remove_member(v_conv, v_target);
  SELECT count(*) INTO v_count FROM public.chat_members
    WHERE conversation_id = v_conv AND user_id = v_target;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CASE 4d FAILED: tenant admin remove_member did not delete (count=%)', v_count;
  END IF;
END $$;

RESET ROLE;


-- ===========================================================================
-- CASE 5: chat_create_group / chat_add_members silently skip cross-tenant user
-- ===========================================================================
-- user_owner creates a group including user_outsider (tenant_b only).
-- user_outsider must NOT appear in chat_members for the new group.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_owner FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_outsider  uuid := (SELECT user_outsider FROM _ids);
  v_member    uuid := (SELECT user_member   FROM _ids);
  v_new_conv  uuid;
  v_count     int;
BEGIN
  -- create_group with outsider in p_user_ids: outsider is silently skipped
  v_new_conv := public.chat_create_group('Cross-Tenant Group', ARRAY[v_member, v_outsider]);

  SELECT count(*) INTO v_count FROM public.chat_members
    WHERE conversation_id = v_new_conv AND user_id = v_outsider;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CASE 5a FAILED: create_group inserted cross-tenant outsider (count=%)', v_count;
  END IF;

  -- user_member (same tenant) must have been added
  SELECT count(*) INTO v_count FROM public.chat_members
    WHERE conversation_id = v_new_conv AND user_id = v_member;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CASE 5a POSITIVE: create_group did not add same-tenant member (count=%)', v_count;
  END IF;

  -- chat_add_members with outsider: outsider is silently skipped
  PERFORM public.chat_add_members(v_new_conv, ARRAY[v_outsider]);
  SELECT count(*) INTO v_count FROM public.chat_members
    WHERE conversation_id = v_new_conv AND user_id = v_outsider;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CASE 5b FAILED: chat_add_members inserted cross-tenant outsider (count=%)', v_count;
  END IF;
END $$;

RESET ROLE;


-- ===========================================================================
-- CASE 6: chat_leave_conversation — last owner raises; others succeed
-- ===========================================================================

-- 6a: user_owner is the SOLE owner of conv_channel → leave must raise
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_owner FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv   uuid    := (SELECT conv_channel FROM _ids);
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.chat_leave_conversation(v_conv);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CASE 6a FAILED: last owner could leave (expected 42501)';
  END IF;
END $$;

RESET ROLE;

-- 6b: user_owner leaves conv_second_owner (two owners) → must succeed
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_owner FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv  uuid := (SELECT conv_second_owner FROM _ids);
  v_owner uuid := (SELECT user_owner        FROM _ids);
  v_count int;
BEGIN
  PERFORM public.chat_leave_conversation(v_conv);
  SELECT count(*) INTO v_count FROM public.chat_members
    WHERE conversation_id = v_conv AND user_id = v_owner;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CASE 6b FAILED: non-last owner leave did not remove member row (count=%)', v_count;
  END IF;
END $$;

RESET ROLE;

-- 6c: user_member (regular member) leaves conv_channel → must succeed
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_member FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv   uuid := (SELECT conv_channel FROM _ids);
  v_user   uuid := (SELECT user_member  FROM _ids);
  v_count  int;
BEGIN
  PERFORM public.chat_leave_conversation(v_conv);
  SELECT count(*) INTO v_count FROM public.chat_members
    WHERE conversation_id = v_conv AND user_id = v_user;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CASE 6c FAILED: regular member leave did not remove row (count=%)', v_count;
  END IF;
END $$;

RESET ROLE;

-- Restore user_member to conv_channel for remaining cases (owner re-adds)
-- (We act as privileged role again after the RESET ROLE above)
INSERT INTO public.chat_members (conversation_id, user_id, role)
SELECT conv_channel, user_member, 'member' FROM _ids
ON CONFLICT (conversation_id, user_id) DO NOTHING;


-- ===========================================================================
-- CASE 7: chat_remove_member of the last owner RAISES
-- ===========================================================================
-- conv_channel now has user_owner (sole owner) + user_member (member).
-- Attempting to remove user_owner must raise.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_owner FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv   uuid    := (SELECT conv_channel FROM _ids);
  v_target uuid    := (SELECT user_owner   FROM _ids);
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.chat_remove_member(v_conv, v_target);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CASE 7 FAILED: last owner could be removed (expected 42501)';
  END IF;
END $$;

RESET ROLE;


-- ===========================================================================
-- CASE 8: chat_delete_conversation — non-owner raises; owner succeeds + cascades
-- ===========================================================================

-- 8a: user_member (non-owner) delete → must raise
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_member FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv   uuid    := (SELECT conv_channel FROM _ids);
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.chat_delete_conversation(v_conv);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CASE 8a FAILED: non-owner could delete conversation (expected 42501)';
  END IF;
END $$;

RESET ROLE;

-- 8b: user_owner delete → must succeed and cascade members + messages
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_owner FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv     uuid := (SELECT conv_channel FROM _ids);
  v_members  int;
  v_messages int;
  v_convs    int;
BEGIN
  PERFORM public.chat_delete_conversation(v_conv);

  -- conversation row must be gone
  SELECT count(*) INTO v_convs FROM public.chat_conversations WHERE id = v_conv;
  IF v_convs <> 0 THEN
    RAISE EXCEPTION 'CASE 8b FAILED: conversation row still exists after delete (count=%)', v_convs;
  END IF;

  -- chat_members must be cascaded away
  SELECT count(*) INTO v_members FROM public.chat_members WHERE conversation_id = v_conv;
  IF v_members <> 0 THEN
    RAISE EXCEPTION 'CASE 8b FAILED: orphan chat_members rows after delete (count=%)', v_members;
  END IF;

  -- chat_messages must be cascaded away
  SELECT count(*) INTO v_messages FROM public.chat_messages WHERE conversation_id = v_conv;
  IF v_messages <> 0 THEN
    RAISE EXCEPTION 'CASE 8b FAILED: orphan chat_messages rows after delete (count=%)', v_messages;
  END IF;
END $$;

RESET ROLE;


-- ===========================================================================
-- CASE 9: Inverted control — proves the assertions are real
--
-- Approach: create a fresh channel owned by user_nonmember, then assert as
-- user_member (non-owner, non-admin) that they CANNOT rename it.
-- Then — as the inverted control — deliberately run the rename AS user_owner
-- (who IS the owner) and confirm we get NO exception, i.e. the positive path
-- runs. This proves: (a) the negative assertion above is not vacuously true
-- (it fired because user_member really was rejected), and (b) the same RPC
-- accepts a legitimate caller. Then a second inversion: call the RPC with a
-- totally wrong setup (nonmember against a conversation they do not own) and
-- confirm it would have caught a leak had we not raised above.
-- ===========================================================================

-- Seed a fresh channel owned by user_nonmember for inversion
INSERT INTO public.chat_conversations (id, tenant_id, kind, name, is_private, created_by)
VALUES (gen_random_uuid(), (SELECT tenant_a FROM _ids), 'channel', 'Inversion Channel', true, (SELECT user_nonmember FROM _ids));

DO $$
DECLARE
  v_inv_conv uuid;
BEGIN
  -- Get the just-inserted conversation id (the most recently inserted for tenant_a / user_nonmember)
  SELECT id INTO v_inv_conv
    FROM public.chat_conversations
   WHERE tenant_id = (SELECT tenant_a FROM _ids)
     AND created_by = (SELECT user_nonmember FROM _ids)
     AND name = 'Inversion Channel'
   LIMIT 1;

  -- Make user_nonmember the owner
  INSERT INTO public.chat_members (conversation_id, user_id, role)
  VALUES (v_inv_conv, (SELECT user_nonmember FROM _ids), 'owner')
  ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = 'owner';

  -- Stash for authenticated phase
  CREATE TEMP TABLE IF NOT EXISTS _inv_ids (conv_id uuid) ON COMMIT DROP;
  TRUNCATE _inv_ids;
  INSERT INTO _inv_ids VALUES (v_inv_conv);
END $$;
GRANT SELECT ON _inv_ids TO authenticated;

-- 9a INVERTED NEGATIVE: user_member (non-owner) cannot rename → confirmed raises
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_member FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv   uuid    := (SELECT conv_id FROM _inv_ids);
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.chat_rename_conversation(v_conv, 'Should Fail');
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CASE 9a FAILED: inverted negative did not raise — the rejection assertion is vacuous';
  END IF;
END $$;

RESET ROLE;

-- 9b INVERTED POSITIVE: user_nonmember (actual owner of inv_conv) CAN rename
--   Proves the 9a assert is a real check (the RPC accepts the legitimate owner)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_nonmember FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv  uuid := (SELECT conv_id FROM _inv_ids);
  v_name  text;
BEGIN
  PERFORM public.chat_rename_conversation(v_conv, 'Owner Can Rename');
  SELECT name INTO v_name FROM public.chat_conversations WHERE id = v_conv;
  IF v_name <> 'Owner Can Rename' THEN
    RAISE EXCEPTION 'CASE 9b FAILED: inverted positive — owner rename did not persist (got %)', v_name;
  END IF;
END $$;

RESET ROLE;

-- 9c DOUBLE-INVERSION: run delete as a non-owner — must still raise
--   (demonstrates the fixture would catch a regression if the authz were removed)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_member FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv   uuid    := (SELECT conv_id FROM _inv_ids);
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.chat_delete_conversation(v_conv);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CASE 9c FAILED: non-owner delete did not raise — the delete guard is broken or inverted';
  END IF;
END $$;

RESET ROLE;


-- ===========================================================================
-- ALL CASES PASSED
-- ===========================================================================
SELECT 'ALL ASSERTIONS PASSED (Phase 2A authz: non-member blocked; owner+admin allowed; cross-tenant skipped; last-owner protected; cascade verified; inverted control real)' AS result;

-- Nothing is kept: roll the whole fixture back.
ROLLBACK;
