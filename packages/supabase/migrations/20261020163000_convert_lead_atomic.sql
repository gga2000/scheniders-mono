-- =============================================================================
-- Atomic, idempotent lead conversion
-- =============================================================================
--
-- FIXES
--   POST /api/leads/[id]/convert (apps/admin) read the lead, checked
--   `converted_tenant_id` in JS, then ran 5-7 separate PostgREST writes
--   (tenant, wallet, subscription, lead, activity, commission). Two concurrent
--   converts of the same lead both passed the check, so each created its own
--   tenant, subscription and commission row: duplicate merchants. A failure
--   half-way left a tenant with no subscription and an unconverted lead.
--   -> public.convert_lead_atomic(): locks the lead row (SELECT ... FOR UPDATE),
--      re-checks `converted_tenant_id` under the lock, and does every write in
--      ONE transaction. The second of two racing calls waits on the lock, then
--      sees the first call's tenant and writes nothing.
--
-- BEHAVIOUR (unchanged from the route it replaces, PR #165 version)
--   * refuses a lead with `converted_tenant_id` set or `status = 'converted'`
--     -> returns outcome 'already_converted' (+ the existing tenant id).
--   * prospect store: flips it to a real merchant only while it is still an
--     untouched prospect trial (is_prospect AND status = 'trial'); otherwise
--     returns 'prospect_not_open' and writes nothing.
--   * no prospect store: creates a tenant (plan starter, status active,
--     14-day trial_ends_at, IQD/ar/Asia-Baghdad settings) and its wallet.
--   * always: a 30-day active starter subscription, the lead marked converted,
--     a 'conversion' lead_activity attributed to the acting admin, and - when
--     the lead has an owner (assigned_to, else created_by) and a commission
--     config is active - a pending commission row for the current month (UTC,
--     as the route computed it on Vercel).
--   Deliberate differences:
--     * the wallet insert is ON CONFLICT (tenant_id) DO NOTHING and also runs
--       for a converted prospect store, so a merchant never ends up walletless.
--     * the slug base falls back to 'store' when the name has no a-z0-9 (an
--       Arabic-only name produced a slug starting with '-'); the suffix is 8
--       random hex chars instead of a base-36 timestamp.
--     * the active commission config is picked deterministically (latest
--       updated_at) instead of an unordered LIMIT 1.
--
-- SECURITY
--   SECURITY DEFINER with a pinned search_path; callable by service_role only.
--   EXECUTE is revoked from PUBLIC (the default grant - revoking from anon
--   alone is a no-op), anon and authenticated, and the body also refuses any
--   caller whose JWT role is not service_role.
--
-- LIVE BASIS (sduvpgqwhxragxtxztur, read 2026-10-20)
--   leads(converted_tenant_id -> tenants, prospect_tenant_id -> tenants,
--   status lead_status, assigned_to/created_by -> user_profiles);
--   tenants(slug UNIQUE, plan plan_tier, status tenant_status, is_prospect,
--   prospect_lead_id -> leads); wallet(tenant_id UNIQUE); subscriptions(plan,
--   status subscription_status, current_period_start/end NOT NULL);
--   lead_activities(activity_type lead_activity_type incl. 'conversion');
--   admin_employee_commissions(period_start <= period_end CHECK).
--   0 leads converted, 0 prospect tenants, 0 commission rows at time of writing.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.convert_lead_atomic(uuid, uuid, text);
--   (then redeploy the previous apps/admin convert route).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.convert_lead_atomic(
    _lead_id uuid,
    _actor_id uuid,
    _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _plan constant public.plan_tier := 'starter';
    _now constant timestamptz := now();
    _lead public.leads%ROWTYPE;
    _tenant_id uuid;
    _slug_base text;
    _employee_id uuid;
    _config_id uuid;
    _month_start date;
BEGIN
    -- Platform-operator action: only the admin app's service-role client may
    -- convert a lead. EXECUTE is revoked from everyone else below; this guard
    -- covers a future accidental GRANT. (Never `current_user`: inside a
    -- SECURITY DEFINER function that is the owner, not the caller.)
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'convert_lead_atomic is service-role only' USING ERRCODE = '42501';
    END IF;

    IF _lead_id IS NULL OR _actor_id IS NULL THEN
        RAISE EXCEPTION 'lead_id and actor_id are required' USING ERRCODE = '22023';
    END IF;

    -- The lock is what makes conversion single-shot: a concurrent call for the
    -- same lead blocks here until this transaction commits, then re-reads the
    -- row and sees converted_tenant_id.
    SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    -- `status` is free-form (any admin can PATCH it), so converted_tenant_id is
    -- the authoritative marker; a manually set 'converted' status is refused
    -- too, as before.
    IF _lead.converted_tenant_id IS NOT NULL OR _lead.status = 'converted' THEN
        RETURN jsonb_build_object(
            'outcome', 'already_converted',
            'tenant_id', _lead.converted_tenant_id
        );
    END IF;

    IF _lead.prospect_tenant_id IS NOT NULL THEN
        -- Only an untouched prospect trial may be flipped. Setting a paused,
        -- suspended or cancelled store `active` is reactivate_tenant
        -- (super_admin), not convert_lead.
        UPDATE public.tenants
           SET is_prospect = false,
               status = 'active',
               trial_ends_at = _now + interval '14 days'
         WHERE id = _lead.prospect_tenant_id
           AND is_prospect = true
           AND status = 'trial'
        RETURNING id INTO _tenant_id;

        IF _tenant_id IS NULL THEN
            RETURN jsonb_build_object('outcome', 'prospect_not_open');
        END IF;
    ELSE
        _slug_base := trim(both '-' from regexp_replace(
            lower(coalesce(_lead.merchant_name, '')), '[^a-z0-9]+', '-', 'g'));
        IF _slug_base = '' THEN
            _slug_base := 'store';
        END IF;

        INSERT INTO public.tenants (
            business_name, slug, plan, status, trial_ends_at, is_prospect,
            prospect_lead_id, contact_phone, address, city, settings, branding
        ) VALUES (
            _lead.merchant_name,
            _slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
            _plan,
            'active',
            _now + interval '14 days',
            false,
            _lead.id,
            _lead.page_phone,
            _lead.address,
            _lead.city,
            jsonb_build_object('timezone', 'Asia/Baghdad', 'language', 'ar', 'currency', 'IQD'),
            jsonb_build_object('logo_url', null, 'primary_color', '#3b82f6', 'secondary_color', '#8b5cf6')
        )
        RETURNING id INTO _tenant_id;
    END IF;

    INSERT INTO public.wallet (tenant_id, balance_iqd, threshold_iqd)
    VALUES (_tenant_id, 0, 5000)
    ON CONFLICT (tenant_id) DO NOTHING;

    INSERT INTO public.subscriptions (
        tenant_id, plan, status, current_period_start, current_period_end
    ) VALUES (
        _tenant_id, _plan, 'active', _now, _now + interval '30 days'
    );

    UPDATE public.leads
       SET converted_tenant_id = _tenant_id,
           converted_at = _now,
           status = 'converted'
     WHERE id = _lead.id;

    INSERT INTO public.lead_activities (
        lead_id, activity_type, title, description, metadata, created_by
    ) VALUES (
        _lead.id,
        'conversion',
        'Lead converted to merchant',
        nullif(btrim(coalesce(_notes, '')), ''),
        jsonb_build_object('tenant_id', _tenant_id, 'plan', _plan),
        _actor_id
    );

    _employee_id := coalesce(_lead.assigned_to, _lead.created_by);
    IF _employee_id IS NOT NULL THEN
        SELECT id INTO _config_id
          FROM public.admin_commission_config
         WHERE is_active
         ORDER BY updated_at DESC, id
         LIMIT 1;

        IF _config_id IS NOT NULL THEN
            _month_start := date_trunc('month', _now AT TIME ZONE 'UTC')::date;
            INSERT INTO public.admin_employee_commissions (
                admin_user_id, lead_id, tenant_id, commission_config_id,
                period_start, period_end, orders_count, order_revenue,
                amount_earned, status
            ) VALUES (
                _employee_id, _lead.id, _tenant_id, _config_id,
                _month_start, (_month_start + interval '1 month' - interval '1 day')::date,
                0, 0, 0, 'pending'
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('outcome', 'converted', 'tenant_id', _tenant_id);
END;
$function$;

COMMENT ON FUNCTION public.convert_lead_atomic(uuid, uuid, text) IS
    'Converts a lead into a merchant in one transaction under a row lock on the lead; a repeat call returns already_converted and writes nothing. Service-role only.';

REVOKE ALL ON FUNCTION public.convert_lead_atomic(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_lead_atomic(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.convert_lead_atomic(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.convert_lead_atomic(uuid, uuid, text) TO service_role;
