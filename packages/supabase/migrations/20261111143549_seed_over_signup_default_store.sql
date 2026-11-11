-- Launch blocker 4: every new store is published at sign-up with a default
-- template (store_config_v2.template.source = 'signup'), so its subdomain is
-- never blank. The onboarding wizard must still be able to seed the
-- merchant's real choice: seeding is now allowed over that sign-up default,
-- and still refused over anything the merchant built or published.

CREATE OR REPLACE FUNCTION public.seed_store_config_v2_draft(p_tenant_id uuid, p_config jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_seeded boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_config IS NULL
     OR jsonb_typeof(p_config) <> 'object'
     OR (p_config->>'schema_version') <> '2' THEN
    RAISE EXCEPTION 'invalid config' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('store_config_' || p_tenant_id::text));

  UPDATE public.tenants
     SET store_config_v2_draft = p_config,
         updated_at = now()
   WHERE id = p_tenant_id
     AND (store_config_v2 IS NULL
          OR store_config_v2->'template'->>'source' = 'signup')
     AND store_config_v2_draft IS NULL;

  v_seeded := FOUND;
  RETURN v_seeded;
END;
$function$;
