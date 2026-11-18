-- One rule for a new store's web address (staff console audit, round 8,
-- Should fix 7).
--
-- A store's web address is "<name part>-<8 random characters>". Build Store
-- (admin_build_prospect_store) cuts the name part at 40 characters, which
-- keeps the whole part inside the 63 characters a web address part may have
-- (40 + 1 + 8 = 49). Converting a lead that has no prospect store
-- (convert_lead_atomic) made the name part the same way but without the cut,
-- so a long Latin name (55 characters or more once spaces become "-") gave
-- an address over 63 characters, which no browser can open.
--
-- Both now call public.store_address_base(), the one copy of the steps:
-- Latin letters and digits in lower case, every other run of characters one
-- "-", cut at 40 characters with no "-" at either end, and "store" when
-- nothing is left (a name in Arabic letters only). The staff console shows
-- the same steps before a build (lib/prospect-store-address.ts, its test
-- reads this function).
--
-- Only the address lines change in the two functions; the rest of each body
-- is the live one (checked against 20261020163000 and 20261117053216).
-- CREATE OR REPLACE keeps their owners and grants. The longest live store
-- address has 18 characters, so no shop changes.
--
-- Rollback: re-run the CREATE OR REPLACE of convert_lead_atomic from
-- 20261020163000_convert_lead_atomic.sql and of admin_build_prospect_store
-- from 20261117053216_admin_build_prospect_store_form.sql, then
-- DROP FUNCTION public.store_address_base(text);

CREATE OR REPLACE FUNCTION public.store_address_base(_source text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _base text;
BEGIN
    _base := trim(both '-' from regexp_replace(lower(coalesce(_source, '')), '[^a-z0-9]+', '-', 'g'));
    _base := trim(both '-' from left(_base, 40));
    RETURN coalesce(nullif(_base, ''), 'store');
END;
$function$;

REVOKE ALL ON FUNCTION public.store_address_base(text) FROM PUBLIC, anon, authenticated;

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

CREATE OR REPLACE FUNCTION public.admin_build_prospect_store(
    _lead_id uuid,
    _template text,
    _primary_color text DEFAULT NULL::text,
    _products jsonb DEFAULT '[]'::jsonb,
    _admin_user_id uuid DEFAULT NULL::uuid,
    _actor_email text DEFAULT NULL::text,
    _business_name text DEFAULT NULL::text,
    _address text DEFAULT NULL::text,
    _industry_id uuid DEFAULT NULL::uuid,
    _description text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _now constant timestamptz := now();
    _lead public.leads%ROWTYPE;
    _template_name text := btrim(coalesce(_template, ''));
    _items jsonb := coalesce(_products, '[]'::jsonb);
    _name text;
    _about text := nullif(btrim(coalesce(_description, '')), '');
    _slug_base text;
    _slug text;
    _tenant_id uuid;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_build_prospect_store is service-role only' USING ERRCODE = '42501';
    END IF;
    IF _lead_id IS NULL
       OR _template_name = ''
       OR (_primary_color IS NOT NULL AND _primary_color !~ '^#[0-9a-fA-F]{6}$')
       OR jsonb_typeof(_items) <> 'array'
       OR jsonb_array_length(_items) > 10
       OR length(_business_name) > 200
       OR length(_address) > 60
       OR length(_about) > 2000
       OR (_industry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.industries WHERE id = _industry_id)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'bad_input');
    END IF;

    -- The lock makes a build single-shot: a second build or a convert of the
    -- same lead waits here, then reads the row this one wrote.
    SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    -- A converted lead already has its shop (convert_lead_atomic).
    IF _lead.converted_tenant_id IS NOT NULL OR _lead.status = 'converted' THEN
        RETURN jsonb_build_object('success', false, 'error', 'converted');
    END IF;
    -- One shop per lead (tenants_prospect_lead_id_key).
    IF _lead.prospect_tenant_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.tenants WHERE prospect_lead_id = _lead.id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'store_exists');
    END IF;

    _name := coalesce(nullif(btrim(coalesce(_business_name, '')), ''), _lead.merchant_name);

    _slug_base := public.store_address_base(coalesce(nullif(btrim(coalesce(_address, '')), ''), _name));
    _slug := _slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    INSERT INTO public.tenants (
        business_name, slug, plan, status, trial_ends_at, is_prospect,
        prospect_lead_id, contact_phone, address, city, branding, settings, metadata
    ) VALUES (
        _name,
        _slug,
        'starter',
        'trial',
        _now + interval '30 days',
        true,
        _lead.id,
        coalesce(nullif(_lead.page_phone, ''), nullif(_lead.phone_numbers -> 0 ->> 'number', '')),
        _lead.address,
        _lead.city,
        jsonb_build_object('logo_url', null,
                           'primary_color', coalesce(_primary_color, '#3b82f6'),
                           'secondary_color', '#8b5cf6'),
        jsonb_build_object('timezone', 'Asia/Baghdad', 'language', 'ar', 'currency', 'IQD'),
        jsonb_build_object('template', _template_name, 'created_from_lead', true)
            || jsonb_strip_nulls(jsonb_build_object('industry_id', _industry_id, 'description', _about))
    )
    RETURNING id INTO _tenant_id;

    INSERT INTO public.products (tenant_id, name, price, description, image_url, status, display_order)
    SELECT _tenant_id,
           btrim(e.item ->> 'name'),
           coalesce((e.item ->> 'price')::numeric, 0),
           e.item ->> 'description',
           e.item ->> 'image_url',
           'active',
           (e.n - 1)::integer
    FROM jsonb_array_elements(_items) WITH ORDINALITY AS e(item, n);

    INSERT INTO public.wallet (tenant_id, balance_iqd, threshold_iqd)
    VALUES (_tenant_id, 0, 5000);

    UPDATE public.leads
       SET prospect_tenant_id = _tenant_id,
           store_built_at = _now,
           status = 'store_built'
     WHERE id = _lead.id;

    INSERT INTO public.lead_activities (lead_id, activity_type, title, metadata, created_by)
    VALUES (
        _lead.id,
        'store_created',
        'Prospect store created: ' || _slug,
        jsonb_build_object('tenant_id', _tenant_id, 'slug', _slug, 'template', _template_name),
        _admin_user_id
    );

    INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, admin_label, tenant_id, action, details)
    VALUES (
        _admin_user_id,
        _actor_email,
        CASE WHEN _admin_user_id IS NULL AND _actor_email IS NULL THEN 'system' END,
        _tenant_id,
        'build_store_for_lead',
        jsonb_build_object('lead_id', _lead.id, 'slug', _slug)
    );

    RETURN jsonb_build_object('success', true, 'tenant_id', _tenant_id, 'slug', _slug);
END;
$function$;
