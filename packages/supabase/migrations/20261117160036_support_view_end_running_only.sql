-- View as merchant: "End now" closes only a look that is still running.
--
-- support_view_end (20261117142107) set ended_at = now on every open session
-- of the staff member, a look whose 30 minutes had already run out too. That
-- look then read as ended by hand, minutes or hours after it was over, and
-- the press wrote an "ended 1" staff log row for it. A run-out look is
-- closed now at its own end (ended_at = expires_at) and counts for nothing:
-- no row. A look still running is closed as before, with its row. Same
-- signature and privileges: service role only. Agreed with the support
-- thread (17 Nov).

CREATE OR REPLACE FUNCTION public.support_view_end(p_admin_id uuid, p_actor_email text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now timestamptz := clock_timestamp();
    v_ended integer;
BEGIN
    -- Run out on their own: closed at their end, by nobody.
    UPDATE public.support_view_sessions s SET ended_at = s.expires_at
    WHERE s.admin_id = p_admin_id AND s.ended_at IS NULL AND s.expires_at <= v_now;

    WITH ended AS (
        UPDATE public.support_view_sessions s SET ended_at = v_now
        WHERE s.admin_id = p_admin_id AND s.ended_at IS NULL AND s.expires_at > v_now
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_ended FROM ended;

    IF v_ended > 0 THEN
        INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, action, details)
        VALUES (p_admin_id, p_actor_email, 'support_view_end', jsonb_build_object('ended', v_ended));
    END IF;

    RETURN v_ended;
END;
$$;

REVOKE ALL ON FUNCTION public.support_view_end(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_view_end(uuid, text) TO service_role;