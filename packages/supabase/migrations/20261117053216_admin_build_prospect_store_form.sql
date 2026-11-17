-- Leads: Build Store builds what its form says (staff console audit, round 7,
-- Should fix 2).
--
-- The Build Store form asks for a business name, an industry, a web address
-- and a description. admin_build_prospect_store took none of them: the shop
-- was named after the lead and its web address was made from the lead's
-- name, so the address the form promised was never made.
--
-- Now:
--   * the shop takes the form's business name, or the lead's name when blank;
--   * the web address is made from the form's address when given, else from
--     the business name: Latin letters and digits, cut at 40 characters, then
--     "-" and 8 random characters ("store-..." when no Latin letter is left).
--     The cut keeps the address inside the 63 characters a web address part
--     may have;
--   * the industry (when it exists) and the description are kept in the
--     shop's metadata.
-- A call with the six old arguments still works: the new ones default.
--
-- The argument list changes, so the old function is dropped first; a named
-- call with the old six arguments then reaches this one.
--
-- Rollback: DROP FUNCTION public.admin_build_prospect_store(uuid, text, text, jsonb, uuid, text, text, text, uuid, text);
-- then re-apply 20261117044644_admin_build_prospect_store.sql.

DROP FUNCTION IF EXISTS public.admin_build_prospect_store(uuid, text, text, jsonb, uuid, text);

CREATE FUNCTION public.admin_build_prospect_store(
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

    -- Same steps as lib/prospect-store-address.ts in the staff console, which
    -- shows the address before the build.
    _slug_base := trim(both '-' from regexp_replace(
        lower(coalesce(nullif(btrim(coalesce(_address, '')), ''), _name)), '[^a-z0-9]+', '-', 'g'));
    _slug_base := trim(both '-' from left(_slug_base, 40));
    IF _slug_base = '' THEN
        _slug_base := 'store';
    END IF;
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

REVOKE ALL ON FUNCTION public.admin_build_prospect_store(uuid, text, text, jsonb, uuid, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_build_prospect_store(uuid, text, text, jsonb, uuid, text, text, text, uuid, text) TO service_role;
