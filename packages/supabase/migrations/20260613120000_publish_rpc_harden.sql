-- EC3: publish_store_config_v2 is SECURITY DEFINER (bypasses RLS) and had only
-- a status='active' membership check + a schema_version=2 assertion. So ANY
-- active member (including a low-trust 'staff'/'viewer') could publish, and the
-- config value was unvalidated — a 50MB jsonb (DoS / row bloat) or arbitrary
-- unknown top-level roots would persist and ship to the public store. Harden:
--   1. require a publishing role (owner/admin/super_admin) — mirror tenants RLS,
--   2. cap the config size,
--   3. reject unknown top-level keys (same allowlist the patch RPC enforces).
-- Body is otherwise an exact reproduction of the captured 3-arg function.
CREATE OR REPLACE FUNCTION public.publish_store_config_v2(
    p_tenant_id uuid,
    p_config jsonb,
    p_diff_summary jsonb DEFAULT NULL
  )
  RETURNS public.store_config_versions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_author text;
  v_row    public.store_config_versions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Publishing is privileged: require an admin/owner role, not just membership.
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = v_uid
      AND status = 'active'
      AND role IN ('owner', 'admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'forbidden: publishing requires an admin role'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_config) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid store_config_v2 (must be a json object)';
  END IF;
  IF (p_config->>'schema_version')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'invalid store_config_v2 (schema_version must be 2)';
  END IF;

  -- ~2MB cap on the whole published config (row-bloat / DoS guard).
  IF pg_column_size(p_config) > 2097152 THEN
    RAISE EXCEPTION 'store_config_v2 too large' USING ERRCODE = '22023';
  END IF;

  -- Reject unknown top-level roots (mirror the patch allowlist + schema_version).
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_config) AS k
    WHERE k NOT IN (
      'schema_version', 'brand_kit', 'pages', 'globals', 'experiments',
      'segments', 'schedules', 'default_locale', 'enabled_locales',
      'commerce', 'custom_css', 'redirects', 'custom_pages'
    )
  ) THEN
    RAISE EXCEPTION 'store_config_v2 has unknown top-level keys'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('store_config_' || p_tenant_id::text));

  SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email)
    INTO v_author
    FROM auth.users WHERE id = v_uid;

  UPDATE public.tenants
     SET store_config_v2 = p_config,
         store_config_v2_draft = NULL,
         config_version = 2,
         updated_at = now()
   WHERE id = p_tenant_id;

  INSERT INTO public.store_config_versions (tenant_id, label, is_named, config, created_by, author_name, diff_summary)
  VALUES (p_tenant_id, NULL, false, p_config, v_uid, v_author, p_diff_summary)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.publish_store_config_v2(uuid, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.publish_store_config_v2(uuid, jsonb, jsonb) TO authenticated;
