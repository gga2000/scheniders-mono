-- Staff console audit, round 13, should-fix 6 (Data new 3, Structure new 4),
-- agreed with the support thread. A new look closed the staff member's
-- earlier open looks with ended_at = now, so a look whose 30 minutes had run
-- out read as ended later than it did. It now ends at its own end
-- (LEAST(expires_at, now)), as support_view_end does since
-- 20261117160036. Built on the live support_view_start from 20261117114648
-- (four arguments, with p_actor_email); the unguarded-tables refusal stays
-- first and the support_view log row is unchanged. CREATE OR REPLACE keeps
-- its REVOKE and GRANT.

CREATE OR REPLACE FUNCTION public.support_view_start(
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

    -- A look that already ran out ends at its own end, as support_view_end
    -- closes it; only a look still running ends now.
    UPDATE public.support_view_sessions s SET ended_at = LEAST(s.expires_at, v_now)
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