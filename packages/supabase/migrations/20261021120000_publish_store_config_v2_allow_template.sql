-- =====================================================================
-- publish_store_config_v2: accept the `template` stamp
-- =====================================================================
-- StoreConfigV2 gained a top-level `template` key (StoreTemplateStamp:
-- direction_id, pack_id, version, applied_at). buildStarterStoreConfigV2
-- stamps it on every store seeded from a known direction, and
-- applyTemplateUpgrade rewrites it when a merchant takes a template update.
--
-- The publish RPC rejects any top-level key outside its allowlist with
-- 22023 'store_config_v2 has unknown top-level keys', so every stamped
-- store could save drafts (seed_store_config_v2_draft has no allowlist)
-- but never publish.
--
-- Same body as the live function (checked with pg_get_functiondef on
-- sduvpgqwhxragxtxztur, 2026-10-21; last written by
-- 20260622130000_publish_optimistic_lock.sql) with one change: 'template'
-- joins the allowlist. CREATE OR REPLACE keeps the existing grants and the
-- SECURITY DEFINER owner. The admin-role gate, schema_version check, size
-- cap, advisory lock and optimistic rev check are unchanged.
--
-- apps/platform/lib/store-config-publish-allowlist.test.ts reads this
-- allowlist and fails if a seeded or upgraded config carries a key the
-- newest publish_store_config_v2 would refuse.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.publish_store_config_v2(
  p_tenant_id uuid,
  p_config jsonb,
  p_diff_summary jsonb DEFAULT NULL::jsonb,
  p_expected_rev bigint DEFAULT NULL::bigint
)
 RETURNS store_config_versions
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
      'commerce', 'custom_css', 'redirects', 'custom_pages', 'template'
    )
  ) THEN
    RAISE EXCEPTION 'store_config_v2 has unknown top-level keys'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('store_config_' || p_tenant_id::text));

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
