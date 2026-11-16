-- Fermi B13 part 2: the staff console's "create the demo store" button.
--
-- One transaction makes the demo store, its owner's profile and membership,
-- and fills it (seed_demo_store). The owner is an Auth user the console made
-- just before, with no password: staff open the store with a one-time link.
-- Only one demo store can exist, and the owner must belong to no other store,
-- so a real merchant can never become the demo store's owner.
CREATE OR REPLACE FUNCTION public.create_demo_store(_owner_id uuid, _owner_email text, _storefront jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
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

    RETURN jsonb_build_object('tenant_id', v_tenant,
                              'counts', public.seed_demo_store(v_tenant, _owner_id, _storefront));
END;
$function$;

REVOKE ALL ON FUNCTION public.create_demo_store(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_demo_store(uuid, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.create_demo_store(uuid, text, jsonb) IS
    'Fermi B13: makes the one demo store (tenants.is_demo) for a fresh Auth user and fills it. Service role only.';
