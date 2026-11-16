-- Merchant support, wave 4: "view as merchant", look only.
--
-- A staff member opens the merchant's own app for 30 minutes as a separate
-- sign-in (a "viewer" user, one per staff member). The viewer reads the shop
-- like a member and can change nothing:
--
--   support_viewer_users        the viewer sign-in of each staff member. Its
--                               auth app_metadata carries support_viewer=true.
--   support_view_sessions       one row per look: who, which shop, 30 minutes.
--   get_user_tenant_ids()       now also gives the shop of the caller's live
--                               session, so RLS reads work as for a member.
--   member_has_permission()     a live viewer also gets the two read
--                               permissions (money view, settings page).
--   support_view_block_writes   a statement trigger on EVERY public table and
--                               on storage.objects: any insert, update, delete
--                               or truncate made with a viewer's sign-in fails
--                               with support_view_read_only. It fires inside
--                               SECURITY DEFINER functions too, so no RPC can
--                               write for a viewer either.
--   support_view_lock_new_tables  event trigger: a table created later gets
--                               the same lock as it is made.
--   support_view_unguarded_tables()  public tables without the lock; the start
--                               refuses while any exists (fail closed).
--   support_view_start(admin, viewer, tenant) / support_view_end(admin)
--
-- A session ends at expires_at by itself: every read checks the time, so a
-- missed clean-up never leaves a viewer with access.

CREATE TABLE public.support_viewer_users (
    user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    admin_id uuid NOT NULL UNIQUE REFERENCES public.admin_users (user_id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.support_viewer_users IS
    'Look-only sign-in of each staff member for "view as merchant". Server-only: RLS on, no policies.';

CREATE TABLE public.support_view_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL REFERENCES public.admin_users (user_id) ON DELETE CASCADE,
    viewer_user_id uuid NOT NULL REFERENCES public.support_viewer_users (user_id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    ended_at timestamptz,
    CONSTRAINT support_view_sessions_30_min
        CHECK (expires_at > started_at AND expires_at <= started_at + interval '30 minutes')
);

CREATE INDEX support_view_sessions_live ON public.support_view_sessions (viewer_user_id) WHERE ended_at IS NULL;
CREATE INDEX support_view_sessions_tenant ON public.support_view_sessions (tenant_id, started_at DESC);

COMMENT ON TABLE public.support_view_sessions IS
    'Each look-only "view as merchant" session, 30 minutes at most. A viewer reads only its own rows.';

ALTER TABLE public.support_viewer_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_view_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_viewer_users, public.support_view_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_viewer_users, public.support_view_sessions TO service_role;
-- The viewer's app reads its own session for the red banner and its clock.
GRANT SELECT ON TABLE public.support_view_sessions TO authenticated;
CREATE POLICY support_view_sessions_own ON public.support_view_sessions
    FOR SELECT TO authenticated USING (viewer_user_id = (SELECT auth.uid()));

-- Is the caller a viewer sign-in? From the token first, then the table, so a
-- viewer is caught even if its token were made without the flag.
CREATE OR REPLACE FUNCTION public.is_support_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'support_viewer') = 'true', false)
        OR EXISTS (SELECT 1 FROM public.support_viewer_users v WHERE v.user_id = auth.uid());
$$;

-- The shop the caller is looking at in a live session, else null.
CREATE OR REPLACE FUNCTION public.support_view_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT s.tenant_id
    FROM public.support_view_sessions s
    WHERE s.viewer_user_id = auth.uid()
      AND s.ended_at IS NULL
      AND now() < s.expires_at
    ORDER BY s.started_at DESC
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.is_support_viewer(), public.support_view_tenant() FROM PUBLIC, anon;
-- Every role that writes runs the lock, so every role may ask the question;
-- it only ever answers about the caller's own sign-in.
GRANT EXECUTE ON FUNCTION public.is_support_viewer() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_view_tenant() TO authenticated, service_role;

-- Members' shops, plus the shop of a live look-only session.
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT tm.tenant_id
  FROM tenant_members tm
  JOIN user_profiles up ON up.id = tm.user_id
  WHERE tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND coalesce(up.is_active, true)
  UNION ALL
  SELECT v.tenant_id
  FROM (SELECT public.support_view_tenant() AS tenant_id) v
  WHERE v.tenant_id IS NOT NULL;
$function$;

-- A member's permission as before; a live viewer also reads money and settings.
CREATE OR REPLACE FUNCTION public.member_has_permission(p_tenant_id uuid, p_user_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT COALESCE((
        SELECT CASE
            WHEN tm.role = 'admin' THEN true
            ELSE COALESCE(
                (SELECT o.is_granted
                   FROM public.user_permissions o
                  WHERE o.tenant_id = tm.tenant_id
                    AND o.user_id = tm.user_id
                    AND o.permission = p_permission),
                EXISTS (
                    SELECT 1
                      FROM public.role_permissions rp
                     WHERE rp.role = tm.role
                       AND rp.permission = p_permission
                )
            )
        END
          FROM public.tenant_members tm
          JOIN public.user_profiles up ON up.id = tm.user_id
         WHERE tm.tenant_id = p_tenant_id
           AND tm.user_id = p_user_id
           AND tm.status = 'active'
           AND COALESCE(up.is_active, true)
    ), false)
    OR (
        p_permission IN ('system.financials.view', 'system.settings.access')
        AND EXISTS (
            SELECT 1
              FROM public.support_view_sessions s
             WHERE s.viewer_user_id = p_user_id
               AND s.tenant_id = p_tenant_id
               AND s.ended_at IS NULL
               AND now() < s.expires_at
        )
    );
$function$;

-- The lock: a viewer's sign-in never writes, whatever path it takes.
CREATE OR REPLACE FUNCTION public.support_view_block_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF public.is_support_viewer() THEN
        RAISE EXCEPTION 'support_view_read_only'
            USING errcode = 'P0001', hint = 'This is a look-only support view. Nothing can be changed.';
    END IF;
    RETURN NULL;
END;
$$;

DO $lock$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.oid::regclass AS tbl
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    LOOP
        EXECUTE format(
            'CREATE TRIGGER zz_support_view_read_only BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %s '
            'FOR EACH STATEMENT EXECUTE FUNCTION public.support_view_block_writes()', r.tbl);
    END LOOP;
END;
$lock$;

CREATE TRIGGER zz_support_view_read_only
    BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON storage.objects
    FOR EACH STATEMENT EXECUTE FUNCTION public.support_view_block_writes();

-- A table made later gets the lock as it is created.
CREATE OR REPLACE FUNCTION public.support_view_lock_new_tables()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT e.objid
        FROM pg_event_trigger_ddl_commands() e
        JOIN pg_class c ON c.oid = e.objid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE e.object_type IN ('table', 'partitioned table')
          AND n.nspname = 'public'
          AND NOT EXISTS (
              SELECT 1 FROM pg_trigger t
              WHERE t.tgrelid = c.oid AND t.tgname = 'zz_support_view_read_only')
    LOOP
        EXECUTE format(
            'CREATE TRIGGER zz_support_view_read_only BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %s '
            'FOR EACH STATEMENT EXECUTE FUNCTION public.support_view_block_writes()', r.objid::regclass);
    END LOOP;
END;
$$;

CREATE EVENT TRIGGER support_view_lock_new_tables
    ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
    EXECUTE FUNCTION public.support_view_lock_new_tables();

-- Public tables without the lock (and storage.objects if it lost it).
CREATE OR REPLACE FUNCTION public.support_view_unguarded_tables()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce(array_agg(c.oid::regclass::text ORDER BY c.relname), '{}')
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE ((n.nspname = 'public' AND c.relkind IN ('r', 'p'))
           OR (n.nspname = 'storage' AND c.relname = 'objects'))
      AND NOT EXISTS (
          SELECT 1 FROM pg_trigger t
          WHERE t.tgrelid = c.oid AND t.tgname = 'zz_support_view_read_only' AND t.tgenabled <> 'D');
$$;

-- Start a 30-minute look. Ends the staff member's earlier sessions, points the
-- viewer at the shop. Refuses while any table is not locked.
CREATE OR REPLACE FUNCTION public.support_view_start(p_admin_id uuid, p_viewer_user_id uuid, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_session public.support_view_sessions;
BEGIN
    IF cardinality(public.support_view_unguarded_tables()) > 0 THEN
        RAISE EXCEPTION 'support_view_unguarded' USING errcode = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.support_viewer_users v
                   WHERE v.user_id = p_viewer_user_id AND v.admin_id = p_admin_id) THEN
        RAISE EXCEPTION 'support_view_not_your_viewer' USING errcode = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
        RAISE EXCEPTION 'support_shop_not_found' USING errcode = 'P0001';
    END IF;

    UPDATE public.support_view_sessions s SET ended_at = v_now
    WHERE s.admin_id = p_admin_id AND s.ended_at IS NULL;

    INSERT INTO public.support_view_sessions (admin_id, viewer_user_id, tenant_id, started_at, expires_at)
    VALUES (p_admin_id, p_viewer_user_id, p_tenant_id, v_now, v_now + interval '30 minutes')
    RETURNING * INTO v_session;

    UPDATE public.user_profiles p SET current_tenant_id = p_tenant_id, updated_at = v_now
    WHERE p.id = p_viewer_user_id;

    RETURN jsonb_build_object('session_id', v_session.id, 'expires_at', v_session.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.support_view_end(p_admin_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH ended AS (
        UPDATE public.support_view_sessions s SET ended_at = clock_timestamp()
        WHERE s.admin_id = p_admin_id AND s.ended_at IS NULL
        RETURNING 1
    )
    SELECT count(*)::integer FROM ended;
$$;

REVOKE ALL ON FUNCTION public.support_view_unguarded_tables(), public.support_view_start(uuid, uuid, uuid),
    public.support_view_end(uuid), public.support_view_lock_new_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_view_unguarded_tables(), public.support_view_start(uuid, uuid, uuid),
    public.support_view_end(uuid) TO service_role;
