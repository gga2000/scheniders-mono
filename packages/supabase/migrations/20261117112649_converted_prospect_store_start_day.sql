-- A prospect store that becomes a customer is dated by the day it became
-- one (staff console audit, round 8 data finding 4, P3).
--
-- Staff build a prospect store for a lead (admin_build_prospect_store); when
-- the lead signs, convert_lead_atomic turns that store into the customer's
-- shop. It kept the store's created_at, the build day. Every "new shop"
-- number reads created_at: Home's New Merchants and Plan Movements, Time to
-- First Order, Health's new shops by month, Revenue's cohorts, the Merchants
-- date filter, and the support team's first-week calls. A store built on
-- 20 Nov and signed on 5 Dec counted as a November shop, with an empty first
-- month, and got no first-week calls.
--
-- convert_lead_atomic now sets created_at to the moment of conversion, the
-- same moment a lead without a prospect store gets its new shop row. The
-- build day is not lost: the lead keeps store_built_at and the staff log keeps
-- the build_store_for_lead row. Only that one UPDATE changes; the rest of the
-- body is the live one (20261117073829, md5 8e6731c1...). CREATE OR REPLACE
-- keeps the owner and grants. Live: 0 prospect stores, none converted, so no
-- shop's date changes.
--
-- Rollback: re-run the CREATE OR REPLACE of convert_lead_atomic from
-- 20261117073829_store_address_base.sql.

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
        -- The shop starts today: created_at is when it became a customer,
        -- as for every other shop. The build day stays on the lead
        -- (store_built_at) and in the staff log (build_store_for_lead).
        UPDATE public.tenants
           SET is_prospect = false,
               status = 'active',
               trial_ends_at = _now + interval '14 days',
               created_at = _now
         WHERE id = _lead.prospect_tenant_id
           AND is_prospect = true
           AND status = 'trial'
        RETURNING id INTO _tenant_id;

        IF _tenant_id IS NULL THEN
            RETURN jsonb_build_object('outcome', 'prospect_not_open');
        END IF;
    ELSE
        _slug_base := public.store_address_base(_lead.merchant_name);

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
