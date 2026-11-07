-- Tenant isolation round 1: every caller check means "an ACTIVE member of the
-- row's store, with an active profile" (= get_user_tenant_ids()).
--
-- Before this, some checks read raw rows instead:
--   * chat_is_member / chat owner branch / chat search + unread: a chat_members
--     row was enough, so a removed member kept reading the store's chat.
--   * till_live_session: an open till session was enough, so a removed or
--     deactivated cashier kept pulling customers and sales.
--   * store config RPCs: tenant_members.status only, so a deactivated admin
--     (user_profiles.is_active = false) could still publish the live store.
-- Also: error texts no longer echo another store's tenant id, check_till_pin
-- is internal only (PIN guessing), the cart-recovery money figure follows the
-- store role, and anon can no longer call search_orders.

-- 1. Chat --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_is_member(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM public.chat_members m
          JOIN public.chat_conversations c ON c.id = m.conversation_id
         WHERE m.conversation_id = p_conversation_id
           AND m.user_id = auth.uid()
           AND c.tenant_id IN (SELECT public.get_user_tenant_ids())
    );
$function$;

CREATE OR REPLACE FUNCTION public.chat_is_conversation_admin(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.chat_conversations c
        WHERE c.id = p_conversation_id
          AND (
              public.is_tenant_admin(c.tenant_id)
              OR (
                  c.tenant_id IN (SELECT public.get_user_tenant_ids())
                  AND EXISTS (
                      SELECT 1 FROM public.chat_members m
                      WHERE m.conversation_id = c.id AND m.user_id = auth.uid() AND m.role = 'owner'
                  )
              )
          )
    );
$function$;

CREATE OR REPLACE FUNCTION public.chat_search_messages(p_query text, p_limit integer DEFAULT 30)
 RETURNS TABLE(message_id uuid, conversation_id uuid, conversation_name text, conversation_kind text, sender_id uuid, body text, snippet text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_q tsquery;
BEGIN
    IF coalesce(btrim(p_query), '') = '' THEN RETURN; END IF;
    v_q := websearch_to_tsquery('simple', p_query);
    IF v_q IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT
        m.id, m.conversation_id, c.name, c.kind, m.sender_id, m.body,
        ts_headline('simple', m.body, v_q,
            'StartSel=«,StopSel=»,MaxFragments=1,MaxWords=12,MinWords=4,ShortWord=0'),
        m.created_at
    FROM public.chat_messages m
    JOIN public.chat_conversations c ON c.id = m.conversation_id
    WHERE m.deleted_at IS NULL
      AND to_tsvector('simple', m.body) @@ v_q
      AND c.tenant_id IN (SELECT public.get_user_tenant_ids())
      AND m.conversation_id IN (
          SELECT cm.conversation_id FROM public.chat_members cm WHERE cm.user_id = auth.uid()
      )
    ORDER BY ts_rank(to_tsvector('simple', m.body), v_q) DESC, m.created_at DESC
    LIMIT least(coalesce(p_limit, 30), 50);
END; $function$;

CREATE OR REPLACE FUNCTION public.chat_unread_counts()
 RETURNS TABLE(conversation_id uuid, unread integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT m.conversation_id, COUNT(msg.id)::int AS unread
    FROM public.chat_members m
    JOIN public.chat_conversations c
        ON c.id = m.conversation_id
       AND c.tenant_id IN (SELECT public.get_user_tenant_ids())
    LEFT JOIN public.chat_messages msg
        ON msg.conversation_id = m.conversation_id
       AND msg.deleted_at IS NULL
       AND msg.sender_id <> m.user_id
       AND msg.created_at > m.last_read_at
    WHERE m.user_id = auth.uid()
    GROUP BY m.conversation_id;
$function$;

-- 2. Shop Till ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.till_live_session(p_session_id uuid)
 RETURNS till_sessions
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v public.till_sessions%ROWTYPE;
    v_lock integer;
BEGIN
    SELECT * INTO v FROM public.till_sessions
     WHERE id = p_session_id AND opened_by = auth.uid() AND ended_at IS NULL
       AND tenant_id IN (SELECT public.get_user_tenant_ids());
    IF NOT FOUND THEN
        RAISE EXCEPTION 'till_locked' USING ERRCODE = '42501';
    END IF;
    SELECT lock_after_minutes INTO v_lock FROM public.till_settings WHERE tenant_id = v.tenant_id;
    IF v.last_seen_at < now() - make_interval(mins => COALESCE(v_lock, 2)) THEN
        RAISE EXCEPTION 'till_locked' USING ERRCODE = '42501';
    END IF;
    RETURN v;
END;
$function$;

-- PIN checks happen inside till_unlock / till_approve (SECURITY DEFINER, run
-- as owner). Called directly, any member could try every PIN of any other
-- member of the same store.
REVOKE EXECUTE ON FUNCTION public.check_till_pin(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- 3. Store config: active member with an active profile ----------------------
CREATE OR REPLACE FUNCTION public.aggregate_experiment_stats(p_tenant_id uuid, p_experiment_id text)
 RETURNS TABLE(arm_id text, visitors bigint, add_to_cart bigint, checkout_start bigint, orders bigint, revenue_iqd numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        e.arm_id,
        count(DISTINCT e.visitor_key)::bigint AS visitors,
        count(*) FILTER (WHERE e.event_type = 'add_to_cart')::bigint AS add_to_cart,
        count(*) FILTER (WHERE e.event_type = 'checkout_start')::bigint AS checkout_start,
        count(*) FILTER (WHERE e.event_type = 'order')::bigint AS orders,
        COALESCE(sum(e.revenue_iqd) FILTER (WHERE e.event_type = 'order'), 0)::numeric AS revenue_iqd
    FROM public.store_config_experiment_events e
    WHERE e.tenant_id = p_tenant_id
      AND e.experiment_id = p_experiment_id
    GROUP BY e.arm_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_store_config_v2_draft(p_tenant_id uuid, p_config jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_seeded boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_config IS NULL
     OR jsonb_typeof(p_config) <> 'object'
     OR (p_config->>'schema_version') <> '2' THEN
    RAISE EXCEPTION 'invalid config' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('store_config_' || p_tenant_id::text));

  UPDATE public.tenants
     SET store_config_v2_draft = p_config,
         updated_at = now()
   WHERE id = p_tenant_id
     AND store_config_v2 IS NULL
     AND store_config_v2_draft IS NULL;

  v_seeded := FOUND;
  RETURN v_seeded;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_store_config_v2_patch(p_tenant_id uuid, p_is_draft boolean, p_path text[], p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Writing the published config is publishing: same bar as
  -- publish_store_config_v2. NULL is treated as live, as the branch below does.
  IF p_is_draft IS NOT TRUE AND NOT public.is_tenant_admin(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden: live store config writes require a tenant admin'
      USING ERRCODE = '42501';
  END IF;
  IF array_length(p_path, 1) IS NULL THEN
    RAISE EXCEPTION 'empty path';
  END IF;

  IF p_path[1] NOT IN (
    'brand_kit', 'pages', 'globals', 'experiments', 'segments',
    'schedules', 'default_locale', 'enabled_locales', 'commerce', 'custom_css'
  ) THEN
    RAISE EXCEPTION 'path root "%" is not editable', p_path[1]
      USING ERRCODE = '22023';
  END IF;
  IF array_length(p_path, 1) > 64 THEN
    RAISE EXCEPTION 'patch path too deep' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(p_value) > 524288 THEN
    RAISE EXCEPTION 'patch value too large' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('store_config_' || p_tenant_id::text));

  IF p_is_draft THEN
    UPDATE public.tenants
       SET store_config_v2_draft = jsonb_set(
             COALESCE(store_config_v2_draft, store_config_v2, '{}'::jsonb),
             p_path, p_value, true),
           updated_at = now()
     WHERE id = p_tenant_id;
  ELSE
    UPDATE public.tenants
       SET store_config_v2 = jsonb_set(
             COALESCE(store_config_v2, '{}'::jsonb),
             p_path, p_value, true),
           updated_at = now()
     WHERE id = p_tenant_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.publish_store_config_v2(p_tenant_id uuid, p_config jsonb, p_diff_summary jsonb DEFAULT NULL::jsonb, p_expected_rev bigint DEFAULT NULL::bigint)
 RETURNS store_config_versions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_author text;
  v_row    public.store_config_versions;
  v_rev    bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- is_tenant_admin: active admin membership AND active profile.
  IF p_tenant_id IS NULL OR NOT public.is_tenant_admin(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden: publishing requires an admin role'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_config) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid store_config_v2 (must be a json object)';
  END IF;
  IF (p_config->>'schema_version')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'invalid store_config_v2 (schema_version must be 2)';
  END IF;

  IF pg_column_size(p_config) > 2097152 THEN
    RAISE EXCEPTION 'store_config_v2 too large' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_config) AS k
    WHERE k NOT IN (
      'schema_version', 'brand_kit', 'pages', 'globals', 'experiments',
      'segments', 'schedules', 'default_locale', 'enabled_locales',
      'commerce', 'custom_css', 'redirects', 'custom_pages'
    )
  ) THEN
    RAISE EXCEPTION 'store_config_v2 has unknown top-level keys'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('store_config_' || p_tenant_id::text));

  IF p_expected_rev IS NOT NULL THEN
    SELECT store_config_rev INTO v_rev FROM public.tenants WHERE id = p_tenant_id;
    IF v_rev IS DISTINCT FROM p_expected_rev THEN
      RAISE EXCEPTION 'config_conflict' USING ERRCODE = '40001';
    END IF;
  END IF;

  SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email)
    INTO v_author
    FROM auth.users WHERE id = v_uid;

  UPDATE public.tenants
     SET store_config_v2 = p_config,
         store_config_v2_draft = NULL,
         config_version = 2,
         store_config_rev = store_config_rev + 1,
         updated_at = now()
   WHERE id = p_tenant_id;

  INSERT INTO public.store_config_versions (tenant_id, label, is_named, config, created_by, author_name, diff_summary)
  VALUES (p_tenant_id, NULL, false, p_config, v_uid, v_author, p_diff_summary)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- 4. Error texts must not echo another store's ids ---------------------------
CREATE OR REPLACE FUNCTION public.order_status_history_tenant_from_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_order_tenant uuid;
BEGIN
    SELECT o.tenant_id INTO v_order_tenant
    FROM public.orders o
    WHERE o.id = NEW.order_id;

    IF v_order_tenant IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := v_order_tenant;
    ELSIF NEW.tenant_id <> v_order_tenant THEN
        RAISE EXCEPTION 'order_status_history.tenant_id does not match its order'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.whatsapp_logs_tenant_from_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_order_tenant uuid;
BEGIN
    IF NEW.order_uuid IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT o.tenant_id INTO v_order_tenant
    FROM public.orders o
    WHERE o.id = NEW.order_uuid;

    IF v_order_tenant IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := v_order_tenant;
    ELSIF NEW.tenant_id <> v_order_tenant THEN
        RAISE EXCEPTION 'whatsapp_logs.tenant_id does not match its order'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$function$;

-- process_return / undo_return: read (and lock) the order only inside the
-- caller's store; a foreign order id now looks exactly like a missing one.
-- Bodies are long, so patch the two exact fragments and fail loudly if the
-- live body drifted.
DO $patch$
DECLARE
    f text;
    v_def text;
    v_new text;
BEGIN
    FOREACH f IN ARRAY ARRAY['public.process_return(uuid,uuid,text,text,text,jsonb)', 'public.undo_return(uuid,uuid)'] LOOP
        v_def := pg_get_functiondef(f::regprocedure);
        v_new := replace(v_def,
            'FROM public.orders WHERE id = _order_id',
            'FROM public.orders WHERE id = _order_id AND tenant_id = _tenant_id');
        v_new := replace(v_new,
            'RAISE EXCEPTION ''tenant mismatch: caller=% order=%'', _tenant_id, v_order_tenant;',
            'RAISE EXCEPTION ''order not found in this store'' USING ERRCODE = ''P0002'';');
        IF v_new = v_def
           OR position('AND tenant_id = _tenant_id' IN v_new) = 0
           OR position('tenant mismatch' IN v_new) > 0 THEN
            RAISE EXCEPTION 'patch target drifted for %', f;
        END IF;
        EXECUTE v_new;
    END LOOP;
END
$patch$;

-- 5. Cart-recovery money figure follows the store role, not the global one ---
DO $patch$
DECLARE
    v_def text := pg_get_functiondef('public.get_abandoned_cart_recovery(uuid,integer)'::regprocedure);
    v_new text;
BEGIN
    v_new := regexp_replace(v_def,
        'EXISTS\s*\(\s*SELECT 1 FROM public\.user_profiles up\s+WHERE up\.id = auth\.uid\(\) AND up\.role IN \(''admin'', ''super_admin''\)\)',
        'public.is_tenant_admin(_tenant_id)');
    IF v_new = v_def THEN
        RAISE EXCEPTION 'patch target drifted for get_abandoned_cart_recovery';
    END IF;
    EXECUTE v_new;
END
$patch$;

-- 6. anon never searches orders ----------------------------------------------
DO $revoke$
DECLARE r regprocedure;
BEGIN
    FOR r IN SELECT p.oid::regprocedure FROM pg_proc p
              WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'search_orders' LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r);
    END LOOP;
END
$revoke$;

-- 7. Team membership: only the server (service role) adds or moves members ----
-- A store admin could INSERT (or UPDATE user_id/tenant_id on) a tenant_members
-- row for ANY user id, e.g. another store's employee, then read that person's
-- profile (email, current store) through team_read_profiles. The app adds
-- members only through server routes (create-user, invite, sign-in
-- provisioning, access requests) with the service role; the browser only
-- changes a member's role (edit-user-modal).
REVOKE INSERT, UPDATE ON public.tenant_members FROM anon, authenticated;
-- Column grants survive a table-level REVOKE, so clear those too.
REVOKE INSERT (id, tenant_id, user_id, role, invited_by, invited_at, joined_at, status),
       UPDATE (id, tenant_id, user_id, role, invited_by, invited_at, joined_at, status)
    ON public.tenant_members FROM anon, authenticated;
GRANT UPDATE (role) ON public.tenant_members TO authenticated;
ALTER POLICY tenant_admin_insert_members ON public.tenant_members WITH CHECK (false);

-- 8. Order chat threads must belong to the order's store --------------------
-- The insert path had no check: a store could open the (unique) chat thread of
-- another store's order, squatting it and probing order ids.
CREATE OR REPLACE FUNCTION public.chat_conversations_guard_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NEW.order_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.orders o WHERE o.id = NEW.order_id AND o.tenant_id = NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'order not found in this store' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.chat_conversations_guard_insert() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_chat_conversations_guard_insert
    BEFORE INSERT ON public.chat_conversations
    FOR EACH ROW EXECUTE FUNCTION public.chat_conversations_guard_insert();

-- 9. Policies that read raw rows instead of active membership ----------------
ALTER POLICY "Tenant members can read their experiment events" ON public.store_config_experiment_events
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
ALTER POLICY "Tenant members can manage their schedules" ON public.store_config_schedules
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
    WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));
ALTER POLICY "Tenant members can insert versions" ON public.store_config_versions
    WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));
ALTER POLICY "Tenants can read their own version history" ON public.store_config_versions
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
ALTER POLICY "Tenant members can read their performance audits" ON public.store_performance_audits
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
ALTER POLICY "Tenant members can delete their presets" ON public.store_section_presets
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
ALTER POLICY "Tenant members can insert presets" ON public.store_section_presets
    WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));
ALTER POLICY "Tenant members can read their presets" ON public.store_section_presets
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
ALTER POLICY "Tenant members can update their presets" ON public.store_section_presets
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
    WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));
ALTER POLICY "Tenant members can read their visual baselines" ON public.store_visual_baselines
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
ALTER POLICY order_reasons_select ON public.order_reasons
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
ALTER POLICY order_reasons_write ON public.order_reasons
    USING (public.is_tenant_admin(tenant_id))
    WITH CHECK (public.is_tenant_admin(tenant_id));
-- current_tenant_id is a UI preference, not proof of membership.
ALTER POLICY inventory_ledger_read ON public.inventory_ledger
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
-- Platform-wide volumes are for platform staff, not every signed-in user.
ALTER POLICY system_health_checks_read ON public.system_health_checks
    USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = 'super_admin'));

-- 10. TRUNCATE ignores RLS: no API role needs it -----------------------------
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
