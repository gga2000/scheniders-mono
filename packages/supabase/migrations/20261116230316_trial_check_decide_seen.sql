-- Trials: a decision is refused if someone decided the store meanwhile
-- (staff console audit, round 4).
--
-- The request id (20261116222030_trial_check_decide_once.sql) makes a retry
-- or a double click decide once. Two staff, or one person in two tabs, make
-- two ids: both see the store undecided, both press "Give back 7 days", and
-- the trial runs 14 more days. A decision now also says when the row was
-- last decided as the person saw it (null: never). If it was decided since,
-- the decision is refused with 'decided_meanwhile' and nothing changes; the
-- page reloads the row, and the person decides again on what is there now.
--
-- The row is locked before the comparison and stays locked until the
-- decision commits, so a second decision waits, then sees the first one. A
-- repeat of the same request still gets its first answer back (marked
-- repeat): staff_action_seen runs before the comparison.
--
-- admin_trial_check_decide is unchanged. The wrapper takes one more argument,
-- so its old signature is dropped.
-- Rollback: drop this signature and re-run 20261116222030.

DROP FUNCTION public.admin_trial_check_decide_once(uuid, uuid, text, text, integer, uuid, text);

CREATE FUNCTION public.admin_trial_check_decide_once(
    _request_id uuid,
    _tenant_id uuid,
    _decision text,
    _reason text,
    _days integer DEFAULT NULL::integer,
    _admin_user_id uuid DEFAULT NULL::uuid,
    _actor_email text DEFAULT NULL::text,
    _seen_decided_at timestamptz DEFAULT NULL::timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _answer jsonb;
    _decided_at timestamptz;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_trial_check_decide_once is service-role only' USING ERRCODE = '42501';
    END IF;
    _answer := public.staff_action_seen(_request_id, _tenant_id, 'trial_check_decide');
    IF _answer IS NOT NULL THEN
        RETURN _answer;
    END IF;
    -- A store with no row is refused 'not_found' by admin_trial_check_decide.
    SELECT decided_at INTO _decided_at FROM public.trial_checks WHERE tenant_id = _tenant_id FOR UPDATE;
    IF FOUND AND _decided_at IS DISTINCT FROM _seen_decided_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'decided_meanwhile');
    END IF;
    RETURN public.staff_action_keep(
        _request_id, _tenant_id, 'trial_check_decide',
        public.admin_trial_check_decide(_tenant_id, _decision, _reason, _days, _admin_user_id, _actor_email)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_trial_check_decide_once(uuid, uuid, text, text, integer, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_trial_check_decide_once(uuid, uuid, text, text, integer, uuid, text, timestamptz) TO service_role;
