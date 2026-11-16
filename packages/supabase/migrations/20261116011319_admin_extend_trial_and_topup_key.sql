-- admin_extend_trial: one transaction moves the date staff see AND the date billing reads.
-- Why: the admin console wrote only tenants.trial_ends_at. Billing (the
-- subscription-renew cron and renew_subscription_core) reads the trialing
-- subscription's current_period_end, so a shop whose trial staff had extended
-- was still charged on the old date. end_trial_at_order_cap already keeps the
-- two columns in step; this function does the same for a staff extension.
-- It also writes the admin_activity_logs row in the same transaction, so an
-- extension can never go unrecorded.
--
-- uq_wallet_tx_admin_topup: backs the idempotency key the admin console now
-- sends with every staff top-up ('admin_topup:<request id>[:<tenant id>]').
-- admin_topup_wallet already drops a repeated key under the wallet row lock;
-- the index makes a second ledger row for one request impossible.
--
-- Rollback: DROP FUNCTION public.admin_extend_trial(uuid, integer, uuid, text, text);
--           DROP INDEX public.uq_wallet_tx_admin_topup;

CREATE OR REPLACE FUNCTION public.admin_extend_trial(
    _tenant_id uuid,
    _days integer,
    _admin_user_id uuid DEFAULT NULL,
    _actor_email text DEFAULT NULL,
    _source text DEFAULT 'single'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _status text;
    _old_end timestamptz;
    _new_end timestamptz;
    _subs integer;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_extend_trial is service-role only' USING ERRCODE = '42501';
    END IF;

    IF _tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
    END IF;
    IF _days IS NULL OR _days < 1 OR _days > 90 THEN
        RAISE EXCEPTION 'days must be a whole number between 1 and 90' USING ERRCODE = '22023';
    END IF;

    -- The lock end_trial_at_order_cap takes: an order that reaches the trial
    -- order limit and a staff extension never interleave.
    PERFORM pg_advisory_xact_lock(hashtext('trial_cap:' || _tenant_id::text));

    -- Subscription rows first, tenant row second: the order
    -- renew_subscription_core locks in, so a renewal running at the same
    -- moment waits here instead of deadlocking.
    PERFORM 1
       FROM public.subscriptions
      WHERE tenant_id = _tenant_id
        AND status = 'trialing'
      ORDER BY id
        FOR UPDATE;

    SELECT status::text, trial_ends_at
      INTO _status, _old_end
      FROM public.tenants
     WHERE id = _tenant_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    -- Only a shop still on trial. Moving a paused or suspended shop's date
    -- would be a way around the pause; a renewed shop is no longer on trial.
    IF _status <> 'trial' THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_trial');
    END IF;

    _new_end := greatest(coalesce(_old_end, now()), now()) + make_interval(days => _days);

    UPDATE public.tenants
       SET trial_ends_at = _new_end
     WHERE id = _tenant_id;

    UPDATE public.subscriptions
       SET current_period_end = _new_end,
           updated_at = now()
     WHERE tenant_id = _tenant_id
       AND status = 'trialing';
    GET DIAGNOSTICS _subs = ROW_COUNT;

    INSERT INTO public.admin_activity_logs
        (admin_user_id, actor_email, admin_label, tenant_id, action, details)
    VALUES
        (_admin_user_id,
         nullif(btrim(_actor_email), ''),
         CASE WHEN _admin_user_id IS NULL AND nullif(btrim(_actor_email), '') IS NULL THEN 'system' END,
         _tenant_id,
         'extend_trial',
         jsonb_build_object(
             'days', _days,
             'previous_trial_ends_at', _old_end,
             'new_trial_ends_at', _new_end,
             'subscriptions_moved', _subs,
             'source', coalesce(nullif(btrim(_source), ''), 'single')));

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', _tenant_id,
        'trial_ends_at', _new_end,
        'subscriptions_moved', _subs);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_extend_trial(uuid, integer, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_extend_trial(uuid, integer, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial(uuid, integer, uuid, text, text) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_admin_topup
    ON public.wallet_transactions (reference_id)
    WHERE type = 'topup' AND reference_id LIKE 'admin_topup:%';
