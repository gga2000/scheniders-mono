-- Leads: a prospect store is built in one locked step (staff console audit,
-- round 6, Should fix 15).
--
-- POST /api/leads/[id]/build-store made five separate writes: the shop, its
-- products, its wallet, the lead and the lead's history, then the staff log
-- row. A failure after the first left a shop with no wallet or a lead that
-- did not point at its store, and a retry was then refused ("store already
-- built") or built a second shop. A lead whose name has no Latin letters got
-- a web address starting with "-".
--
-- admin_build_prospect_store does it all in one transaction under a row lock
-- on the lead, the same lock convert_lead_atomic takes, so a build and a
-- convert of one lead wait for each other. The trial stays 30 days, as
-- today. The web address is made as convert_lead_atomic makes it.
--
-- Rollback: DROP FUNCTION public.admin_build_prospect_store(uuid, text, text, jsonb, uuid, text);
-- and deploy the route from before this change.

CREATE OR REPLACE FUNCTION public.admin_build_prospect_store(
    _lead_id uuid,
    _template text,
    _primary_color text DEFAULT NULL::text,
    _products jsonb DEFAULT '[]'::jsonb,
    _admin_user_id uuid DEFAULT NULL::uuid,
    _actor_email text DEFAULT NULL::text
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
       OR jsonb_array_length(_items) > 10 THEN
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

    _slug_base := trim(both '-' from regexp_replace(
        lower(coalesce(_lead.merchant_name, '')), '[^a-z0-9]+', '-', 'g'));
    IF _slug_base = '' THEN
        _slug_base := 'store';
    END IF;
    _slug := _slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    INSERT INTO public.tenants (
        business_name, slug, plan, status, trial_ends_at, is_prospect,
        prospect_lead_id, contact_phone, address, city, branding, settings, metadata
    ) VALUES (
        _lead.merchant_name,
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

REVOKE ALL ON FUNCTION public.admin_build_prospect_store(uuid, text, text, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_build_prospect_store(uuid, text, text, jsonb, uuid, text) TO service_role;
