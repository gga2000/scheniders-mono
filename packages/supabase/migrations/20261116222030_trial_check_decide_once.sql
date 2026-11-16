-- Trials: a decision on a flagged store happens once per request (audit,
-- round 3, item 10).
--
-- "Give back N days" on the Trials page called admin_trial_check_decide with
-- no request id: a retry after a lost answer, a second tab or a double click
-- gave the days twice. It now goes through admin_trial_check_decide_once,
-- the same wrapper as free trial days, free paid days, lock orders and a free
-- unlock (20261116143323_staff_action_request_ids.sql): the first successful
-- answer is kept for the request, a repeat gets it back marked repeat, and a
-- refusal is not kept, so the same request may ask again.
--
-- admin_trial_check_decide is unchanged.

ALTER TABLE public.staff_action_requests DROP CONSTRAINT staff_action_requests_action_check;
ALTER TABLE public.staff_action_requests ADD CONSTRAINT staff_action_requests_action_check
    CHECK (action IN ('extend_trial', 'extend_subscription', 'add_lock_orders', 'force_unlock', 'trial_check_decide'));

COMMENT ON TABLE public.staff_action_requests IS
    'One row per staff request that changed a shop (free days, lock orders, free unlock, a trial check decision). Read and written only by the *_once functions; no browser access.';

CREATE OR REPLACE FUNCTION public.admin_trial_check_decide_once(
    _request_id uuid,
    _tenant_id uuid,
    _decision text,
    _reason text,
    _days integer DEFAULT NULL::integer,
    _admin_user_id uuid DEFAULT NULL::uuid,
    _actor_email text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _answer jsonb;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_trial_check_decide_once is service-role only' USING ERRCODE = '42501';
    END IF;
    _answer := public.staff_action_seen(_request_id, _tenant_id, 'trial_check_decide');
    IF _answer IS NOT NULL THEN
        RETURN _answer;
    END IF;
    RETURN public.staff_action_keep(
        _request_id, _tenant_id, 'trial_check_decide',
        public.admin_trial_check_decide(_tenant_id, _decision, _reason, _days, _admin_user_id, _actor_email)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_trial_check_decide_once(uuid, uuid, text, text, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_trial_check_decide_once(uuid, uuid, text, text, integer, uuid, text) TO service_role;
