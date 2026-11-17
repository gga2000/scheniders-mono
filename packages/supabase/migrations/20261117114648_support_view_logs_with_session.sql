-- View as merchant: starting and ending a look write the staff log row in the
-- same transaction (staff console audit, round 10 security finding 1, P3;
-- agreed with the merchant support thread, 17 Nov).
--
-- POST and DELETE /api/support/view ran support_view_start / support_view_end,
-- then wrote the support_view / support_view_end row in a second request. If
-- that request failed, the look had started (the viewer could read the shop)
-- and the log had no row: only Sentry heard of it. The merchant's "what our
-- staff did" list (support_staff_visits) reads these rows, so the merchant
-- never saw that visit either.
--
-- Both functions now take the staff member's email as a trailing argument
-- (DEFAULT NULL) and insert the same row the route wrote: same action names,
-- admin_user_id = the staff member (support_staff_visits names them through
-- admin_users.user_id), the shop on support_view, and the same details
-- (session_id; ended). Everything else is unchanged. The old signatures are
-- dropped, so there is one function each; a call with the old named arguments
-- still resolves to it. Service role only, as before.
--
-- Rollback: re-run support_view_start and support_view_end from
-- 20261116112543_support_view_as.sql after dropping these two signatures, with
-- its REVOKE and GRANT.

DROP FUNCTION public.support_view_start(uuid, uuid, uuid);
DROP FUNCTION public.support_view_end(uuid);

-- Start a 30-minute look. Ends the staff member's earlier sessions, points the
-- viewer at the shop, writes the support_view row. Refuses while any table is
-- not locked.
CREATE FUNCTION public.support_view_start(
    p_admin_id uuid,
    p_viewer_user_id uuid,
    p_tenant_id uuid,
    p_actor_email text DEFAULT NULL
)
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

    INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, tenant_id, action, details)
    VALUES (p_admin_id, p_actor_email, p_tenant_id, 'support_view',
            jsonb_build_object('session_id', v_session.id));

    RETURN jsonb_build_object('session_id', v_session.id, 'expires_at', v_session.expires_at);
END;
$$;

-- End the staff member's looks now; writes the support_view_end row with how
-- many were open.
CREATE FUNCTION public.support_view_end(p_admin_id uuid, p_actor_email text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ended integer;
BEGIN
    WITH ended AS (
        UPDATE public.support_view_sessions s SET ended_at = clock_timestamp()
        WHERE s.admin_id = p_admin_id AND s.ended_at IS NULL
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_ended FROM ended;

    INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, action, details)
    VALUES (p_admin_id, p_actor_email, 'support_view_end', jsonb_build_object('ended', v_ended));

    RETURN v_ended;
END;
$$;

REVOKE ALL ON FUNCTION public.support_view_start(uuid, uuid, uuid, text), public.support_view_end(uuid, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_view_start(uuid, uuid, uuid, text), public.support_view_end(uuid, text)
    TO service_role;
