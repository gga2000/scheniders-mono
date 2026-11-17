-- View as merchant: "Stop looking" with no look open writes no staff log row.
--
-- support_view_end (20261117114648) wrote a support_view_end row on every
-- call, so a second press, or an end after the 30 minutes had run out, left an
-- "ended 0" row in the staff log for a look that was already over. The row
-- is written now only when the call closed a session. Same signature and
-- privileges: service role only.

CREATE OR REPLACE FUNCTION public.support_view_end(p_admin_id uuid, p_actor_email text DEFAULT NULL)
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

    IF v_ended > 0 THEN
        INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, action, details)
        VALUES (p_admin_id, p_actor_email, 'support_view_end', jsonb_build_object('ended', v_ended));
    END IF;

    RETURN v_ended;
END;
$$;

REVOKE ALL ON FUNCTION public.support_view_end(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_view_end(uuid, text) TO service_role;
