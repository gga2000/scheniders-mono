-- BUG25: publish_store_config_v2 blind-overwrote store_config_v2. Two editors
-- (or tabs/devices) each loading, then publishing, silently clobbered each
-- other's published config — the advisory lock only serialized the writes, it
-- never detected a stale base. Add optimistic concurrency:
--   * tenants.store_config_rev — a counter bumped ONLY on publish (draft
--     autosaves don't touch it, so it's a clean "published generation" token),
--   * publish accepts p_expected_rev (optional, backward-compatible) and, under
--     the advisory lock, rejects the publish if the live rev has moved on.
-- The client passes the rev it hydrated with and surfaces a "reload" on conflict.

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS store_config_rev bigint NOT NULL DEFAULT 0;

-- Drop the 3-arg version so the new 4-arg (with defaults) is unambiguous.
DROP FUNCTION IF EXISTS public.publish_store_config_v2(uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.publish_store_config_v2(
    p_tenant_id uuid,
    p_config jsonb,
    p_diff_summary jsonb DEFAULT NULL,
    p_expected_rev bigint DEFAULT NULL
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
  v_rev    bigint;
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

  IF pg_column_size(p_config) > 2097152 THEN
    RAISE EXCEPTION 'store_config_v2 too large' USING ERRCODE = '22023';
  END IF;

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

  -- BUG25: optimistic concurrency. Under the lock, the live rev is committed
  -- state — reject if the caller's base is stale (another publish landed first).
  IF p_expected_rev IS NOT NULL THEN
    SELECT store_config_rev INTO v_rev FROM public.tenants WHERE id = p_tenant_id;
    IF v_rev IS DISTINCT FROM p_expected_rev THEN
      RAISE EXCEPTION 'config_conflict' USING ERRCODE = '40001';
    END IF;
  END IF;

  SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email)
    INTO v_author
    FROM auth.users WHERE id = v_uid;

  UPDATE public.tenants
     SET store_config_v2 = p_config,
         store_config_v2_draft = NULL,
         config_version = 2,
         store_config_rev = store_config_rev + 1,
         updated_at = now()
   WHERE id = p_tenant_id;

  INSERT INTO public.store_config_versions (tenant_id, label, is_named, config, created_by, author_name, diff_summary)
  VALUES (p_tenant_id, NULL, false, p_config, v_uid, v_author, p_diff_summary)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.publish_store_config_v2(uuid, jsonb, jsonb, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.publish_store_config_v2(uuid, jsonb, jsonb, bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
