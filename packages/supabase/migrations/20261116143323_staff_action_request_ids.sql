-- Staff console: free trial days, free paid days, more orders for a locked
-- store and a free unlock happen once per request (audit N3).
--
-- The console sends a request id the browser makes for each distinct ask
-- (lib/request-ids.ts). A retry after a lost answer, a second tab or a
-- double click sends the same id, and the wrapper answers with the first
-- call's result instead of giving the days or orders again. Wallet top-ups
-- already work this way through their ledger reference.
--
-- The four staff functions are unchanged: each *_once wrapper calls one of
-- them in the same transaction and records the answer when it succeeded. A
-- refusal is not recorded (nothing changed), so a retry asks again.
--
-- Two calls with the same request wait for each other on a transaction lock,
-- so the second one reads the first one's row instead of racing it.

CREATE TABLE IF NOT EXISTS public.staff_action_requests (
    request_id uuid NOT NULL,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    action text NOT NULL
        CHECK (action IN ('extend_trial', 'extend_subscription', 'add_lock_orders', 'force_unlock')),
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (request_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS staff_action_requests_tenant_idx
    ON public.staff_action_requests (tenant_id);

COMMENT ON TABLE public.staff_action_requests IS
    'One row per staff request that changed a shop (free days, lock orders, free unlock). Read and written only by the *_once functions; no browser access.';

ALTER TABLE public.staff_action_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_action_requests FROM PUBLIC, anon, authenticated;

-- NULL: this request is new, go ahead. Otherwise the answer to give.
CREATE OR REPLACE FUNCTION public.staff_action_seen(_request_id uuid, _tenant_id uuid, _action text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _prior public.staff_action_requests%ROWTYPE;
BEGIN
    IF _request_id IS NULL OR _tenant_id IS NULL THEN
        RAISE EXCEPTION 'request_id and tenant_id required' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(
        hashtextextended('staff_action:' || _request_id::text || ':' || _tenant_id::text, 0)
    );
    SELECT * INTO _prior
    FROM public.staff_action_requests
    WHERE request_id = _request_id AND tenant_id = _tenant_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    IF _prior.action <> _action THEN
        RETURN jsonb_build_object('success', false, 'error', 'request_reused');
    END IF;
    RETURN _prior.result || jsonb_build_object('repeat', true);
END;
$function$;

-- Keep a successful answer for repeats; pass any answer through.
CREATE OR REPLACE FUNCTION public.staff_action_keep(
    _request_id uuid, _tenant_id uuid, _action text, _result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF _result -> 'success' = 'true'::jsonb THEN
        INSERT INTO public.staff_action_requests (request_id, tenant_id, action, result)
        VALUES (_request_id, _tenant_id, _action, _result);
    END IF;
    RETURN _result;
END;
$function$;

REVOKE ALL ON FUNCTION public.staff_action_seen(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.staff_action_keep(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_extend_trial_once(
    _request_id uuid,
    _tenant_id uuid,
    _days integer,
    _reason text,
    _admin_user_id uuid DEFAULT NULL::uuid,
    _actor_email text DEFAULT NULL::text,
    _source text DEFAULT 'single'::text
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
        RAISE EXCEPTION 'admin_extend_trial_once is service-role only' USING ERRCODE = '42501';
    END IF;
    _answer := public.staff_action_seen(_request_id, _tenant_id, 'extend_trial');
    IF _answer IS NOT NULL THEN
        RETURN _answer;
    END IF;
    RETURN public.staff_action_keep(
        _request_id, _tenant_id, 'extend_trial',
        public.admin_extend_trial(_tenant_id, _days, _reason, _admin_user_id, _actor_email, _source)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_extend_subscription_once(
    _request_id uuid,
    _tenant_id uuid,
    _days integer,
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
        RAISE EXCEPTION 'admin_extend_subscription_once is service-role only' USING ERRCODE = '42501';
    END IF;
    _answer := public.staff_action_seen(_request_id, _tenant_id, 'extend_subscription');
    IF _answer IS NOT NULL THEN
        RETURN _answer;
    END IF;
    RETURN public.staff_action_keep(
        _request_id, _tenant_id, 'extend_subscription',
        public.admin_extend_subscription(_tenant_id, _days, _admin_user_id, _actor_email)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_add_lock_orders_once(
    _request_id uuid,
    _tenant_id uuid,
    _orders integer,
    _reason text,
    _admin_user_id uuid DEFAULT NULL::uuid,
    _actor_email text DEFAULT NULL::text,
    _may_grant_unpaid boolean DEFAULT false
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
        RAISE EXCEPTION 'admin_add_lock_orders_once is service-role only' USING ERRCODE = '42501';
    END IF;
    _answer := public.staff_action_seen(_request_id, _tenant_id, 'add_lock_orders');
    IF _answer IS NOT NULL THEN
        RETURN _answer;
    END IF;
    RETURN public.staff_action_keep(
        _request_id, _tenant_id, 'add_lock_orders',
        public.admin_add_lock_orders(_tenant_id, _orders, _reason, _admin_user_id, _actor_email, _may_grant_unpaid)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_force_unlock_once(
    _request_id uuid,
    _tenant_id uuid,
    _days integer,
    _reason text,
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
        RAISE EXCEPTION 'admin_force_unlock_once is service-role only' USING ERRCODE = '42501';
    END IF;
    _answer := public.staff_action_seen(_request_id, _tenant_id, 'force_unlock');
    IF _answer IS NOT NULL THEN
        RETURN _answer;
    END IF;
    RETURN public.staff_action_keep(
        _request_id, _tenant_id, 'force_unlock',
        public.admin_force_unlock(_tenant_id, _days, _reason, _admin_user_id, _actor_email)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_extend_trial_once(uuid, uuid, integer, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_extend_subscription_once(uuid, uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_add_lock_orders_once(uuid, uuid, integer, text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_force_unlock_once(uuid, uuid, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial_once(uuid, uuid, integer, text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_extend_subscription_once(uuid, uuid, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_lock_orders_once(uuid, uuid, integer, text, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_force_unlock_once(uuid, uuid, integer, text, uuid, text) TO service_role;
