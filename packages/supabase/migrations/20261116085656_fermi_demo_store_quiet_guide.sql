-- Fermi B13 part 2: the demo owner never sees the merchant guide.
--
-- Opened from the staff console, the demo store greeted its owner with the
-- guide's welcome («هلا متجر»), which would sit on top of every recording.
-- The guide reads merchant_guide_progress per owner; the seed's wipe keeps
-- that row on purpose. demo_store_quiet_guide writes it as a merchant who
-- answered the welcome, finished the basics and every optional walk, and
-- hid «دليلك»: no welcome, no page offers, no corner list. create_demo_store
-- now calls it, and it runs once here for the demo store that exists.
-- Settings, «دليلك», still brings the guide back by hand.

CREATE OR REPLACE FUNCTION public.demo_store_quiet_guide(_tenant_id uuid, _owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
    v_done text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
BEGIN
    IF NOT public.tenant_is_demo(_tenant_id) THEN
        RAISE EXCEPTION 'demo_store_quiet_guide: % is not the demo store', _tenant_id USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.merchant_guide_progress (tenant_id, user_id, answers, sound_on, foundation_done_at, done_seen_at, phases)
    VALUES (_tenant_id, _owner_id,
            jsonb_build_object('channel', 'online_and_shop', 'staff', true),
            false, now(), now(),
            jsonb_build_object(
                'first_order', jsonb_build_object('done_at', v_done),
                'courier', jsonb_build_object('done_at', v_done),
                'products', jsonb_build_object('done_at', v_done),
                'money', jsonb_build_object('done_at', v_done),
                'customers', jsonb_build_object('done_at', v_done),
                'team', jsonb_build_object('done_at', v_done),
                'till', jsonb_build_object('done_at', v_done),
                'look', jsonb_build_object('done_at', v_done),
                'list_hidden_at', v_done))
    ON CONFLICT (tenant_id, user_id) DO UPDATE
       SET answers = EXCLUDED.answers, sound_on = EXCLUDED.sound_on,
           foundation_done_at = EXCLUDED.foundation_done_at, done_seen_at = EXCLUDED.done_seen_at,
           phases = EXCLUDED.phases, updated_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.demo_store_quiet_guide(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_store_quiet_guide(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.demo_store_quiet_guide(uuid, uuid) IS
    'Fermi B13: marks the merchant guide finished and hidden for the demo store''s owner, so recordings show no guide. Service role only.';

CREATE OR REPLACE FUNCTION public.create_demo_store(_owner_id uuid, _owner_email text, _storefront jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
SET statement_timeout TO '60s'
AS $function$
DECLARE
    v_email text := lower(btrim(_owner_email));
    v_tenant uuid;
BEGIN
    IF EXISTS (SELECT 1 FROM public.tenants WHERE is_demo) THEN
        RAISE EXCEPTION 'create_demo_store: the demo store already exists'
            USING ERRCODE = '23505', HINT = 'DEMO_EXISTS';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _owner_id AND lower(u.email) = v_email) THEN
        RAISE EXCEPTION 'create_demo_store: % is not the Auth user %', _owner_id, v_email USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.user_id = _owner_id) THEN
        RAISE EXCEPTION 'create_demo_store: % already belongs to a store', v_email USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.tenants (business_name, slug, plan, status, is_demo, contact_email, city, config_version)
    VALUES ('متجر مثال', 'mithal', 'growth', 'active', true, v_email, 'بغداد', 2)
    RETURNING id INTO v_tenant;

    INSERT INTO public.user_profiles (id, email, display_name, role, current_tenant_id)
    VALUES (_owner_id, v_email, 'متجر مثال', 'admin', v_tenant)
    ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, role = EXCLUDED.role,
           current_tenant_id = EXCLUDED.current_tenant_id;

    INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
    VALUES (v_tenant, _owner_id, 'admin', 'active', now());

    PERFORM public.demo_store_quiet_guide(v_tenant, _owner_id);

    RETURN jsonb_build_object('tenant_id', v_tenant,
                              'counts', public.seed_demo_store(v_tenant, _owner_id, _storefront));
END;
$function$;

REVOKE ALL ON FUNCTION public.create_demo_store(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_demo_store(uuid, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.create_demo_store(uuid, text, jsonb) IS
    'Fermi B13: makes the one demo store (tenants.is_demo) for a fresh Auth user and fills it. Service role only.';

-- The demo store made before this change.
SELECT public.demo_store_quiet_guide(m.tenant_id, m.user_id)
  FROM public.tenant_members m
  JOIN public.tenants t ON t.id = m.tenant_id AND t.is_demo
 WHERE m.role = 'admin' AND m.status = 'active';
