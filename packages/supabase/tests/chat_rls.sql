-- =============================================================================
-- Team-chat cross-tenant RLS isolation fixture  (SECURITY GATE — P0)
-- =============================================================================
--
-- WHAT THIS PROVES
--   On the LIVE schema, a user in tenant B cannot read a private channel
--   conversation (or its messages) that lives in tenant A, while a member of
--   that conversation (userA, tenant A) CAN. The positive control rules out a
--   "deny everyone" false pass. It also exercises the Realtime authorization
--   predicate (`chat_is_member(chat_topic_conv_id(...))`) used by the
--   realtime.messages policies, asserting userB is denied and userA allowed on
--   the `chat:conv:<id>` topic.
--
-- HOW TO RUN
--   The whole script is ONE transaction wrapped in BEGIN; ... ROLLBACK; so it
--   NEVER persists anything. Run it via any privileged connection that BYPASSES
--   RLS (postgres / service_role), e.g.:
--
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/chat_rls.sql
--
--   or paste it into the Supabase MCP `execute_sql` tool. On success it prints
--   a single row: "ALL ASSERTIONS PASSED ...". On any RLS leak it ERRORs loudly
--   (RAISE EXCEPTION) and the transaction rolls back. Re-runnable: all ids are
--   generated with gen_random_uuid(); no hardcoded real ids; nothing committed.
--
-- WHY THE ROLE SWITCH
--   The privileged role bypasses RLS, so we seed all rows as that role first,
--   then `SET LOCAL ROLE authenticated` + set the JWT claims so auth.uid()
--   resolves to a specific user. RLS is only enforced under the authenticated
--   role. `RESET ROLE` returns to the privileged role for the next phase.
--
-- REALTIME AUTHZ NOTE (Task 6 Step 3)
--   Realtime broadcast/presence authorization is enforced by RLS policies on
--   realtime.messages (migration 20260620100200_chat_realtime_authorization.sql)
--   using the SAME chat_is_member() membership helper exercised below. A live
--   websocket subscribe/publish handshake can't be driven from SQL alone, so we
--   assert the underlying authorization predicate here; the fail-closed behavior
--   of the realtime policies was additionally confirmed by the Task 3 review.
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- SEED  (privileged role: RLS bypassed)
-- ----------------------------------------------------------------------------
-- Scratchpad of generated ids reused across the role-switched phases. It must
-- be readable by `authenticated` during the RLS phases, hence the GRANT below.
CREATE TEMP TABLE _ids ON COMMIT DROP AS
SELECT
  gen_random_uuid() AS tenant_a,
  gen_random_uuid() AS tenant_b,
  gen_random_uuid() AS user_a,
  gen_random_uuid() AS user_b,
  gen_random_uuid() AS conv_a,
  gen_random_uuid() AS msg_a;
GRANT SELECT ON _ids TO authenticated;

-- user_profiles.id FK-references auth.users(id); auth.users only requires id.
INSERT INTO auth.users (id) SELECT user_a FROM _ids;
INSERT INTO auth.users (id) SELECT user_b FROM _ids;

INSERT INTO public.user_profiles (id, email)
SELECT user_a, 'rls_test_user_a_' || user_a || '@example.test' FROM _ids;
INSERT INTO public.user_profiles (id, email)
SELECT user_b, 'rls_test_user_b_' || user_b || '@example.test' FROM _ids;

-- tenants require business_name + slug (slug unique -> embed the uuid).
INSERT INTO public.tenants (id, business_name, slug)
SELECT tenant_a, 'RLS Test Tenant A', 'rls-test-tenant-a-' || tenant_a FROM _ids;
INSERT INTO public.tenants (id, business_name, slug)
SELECT tenant_b, 'RLS Test Tenant B', 'rls-test-tenant-b-' || tenant_b FROM _ids;

-- get_user_tenant_ids() reads tenant_members WHERE user_id=auth.uid() AND status='active'.
-- userA active in tenant A; userB active in tenant B (disjoint).
INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
SELECT tenant_a, user_a, 'owner', 'active' FROM _ids;
INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
SELECT tenant_b, user_b, 'owner', 'active' FROM _ids;

-- Private channel in tenant A, created by userA; userA is the sole chat member.
INSERT INTO public.chat_conversations (id, tenant_id, kind, name, is_private, created_by)
SELECT conv_a, tenant_a, 'channel', 'Tenant A Private', true, user_a FROM _ids;
INSERT INTO public.chat_members (conversation_id, user_id, role)
SELECT conv_a, user_a, 'owner' FROM _ids;

-- One message authored by userA in conv A (seeded as privileged role).
INSERT INTO public.chat_messages (id, conversation_id, tenant_id, sender_id, body)
SELECT msg_a, conv_a, tenant_a, user_a, 'secret message in tenant A' FROM _ids;

-- ----------------------------------------------------------------------------
-- NEGATIVE  — userB (tenant B) must see NOTHING from tenant A's conversation
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_b FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv  uuid := (SELECT conv_a FROM _ids);
  v_msgs  int;
  v_convs int;
  v_rt    boolean;
BEGIN
  SELECT count(*) INTO v_msgs  FROM public.chat_messages      WHERE conversation_id = v_conv;
  SELECT count(*) INTO v_convs FROM public.chat_conversations WHERE id = v_conv;
  v_rt := public.chat_is_member(public.chat_topic_conv_id('chat:conv:' || v_conv));

  IF v_msgs  <> 0 THEN RAISE EXCEPTION 'RLS LEAK: userB read % message(s) in tenant A conversation (want 0)', v_msgs;  END IF;
  IF v_convs <> 0 THEN RAISE EXCEPTION 'RLS LEAK: userB read % tenant A conversation(s) (want 0)', v_convs;          END IF;
  IF v_rt         THEN RAISE EXCEPTION 'REALTIME LEAK: userB authorized on tenant A conv topic (want false)';        END IF;
END $$;

RESET ROLE;

-- ----------------------------------------------------------------------------
-- POSITIVE CONTROL  — userA (member) MUST see them (proves it isn't deny-all)
-- ----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT user_a FROM _ids)::text, 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_conv  uuid := (SELECT conv_a FROM _ids);
  v_msgs  int;
  v_convs int;
  v_rt    boolean;
BEGIN
  SELECT count(*) INTO v_msgs  FROM public.chat_messages      WHERE conversation_id = v_conv;
  SELECT count(*) INTO v_convs FROM public.chat_conversations WHERE id = v_conv;
  v_rt := public.chat_is_member(public.chat_topic_conv_id('chat:conv:' || v_conv));

  IF v_msgs  < 1 THEN RAISE EXCEPTION 'POSITIVE CONTROL FAILED: member userA read % message(s) (want >=1)', v_msgs;       END IF;
  IF v_convs < 1 THEN RAISE EXCEPTION 'POSITIVE CONTROL FAILED: member userA read % conversation(s) (want >=1)', v_convs; END IF;
  IF NOT v_rt    THEN RAISE EXCEPTION 'POSITIVE CONTROL FAILED: member userA NOT authorized on conv topic (want true)';   END IF;
END $$;

RESET ROLE;

SELECT 'ALL ASSERTIONS PASSED (cross-tenant read denied; member read+realtime allowed)' AS result;

-- Nothing is kept: roll the whole fixture back.
ROLLBACK;
