-- BUG27: publish_store_config_v2 inserted version rows with diff_summary = NULL,
-- so every version-history row's change badges (added/changed/removed) were
-- always empty. Add an optional p_diff_summary param (computed client-side with
-- the same diffJson/summarizeDiff the UI uses) and persist it on the version row.
--
-- The 2-arg signature is dropped and replaced with a 3-arg variant whose new
-- param defaults to NULL, so existing 2-arg callers keep working. Body is an
-- exact reproduction of the captured function plus the diff_summary column.
DROP FUNCTION IF EXISTS public.publish_store_config_v2(uuid, jsonb);

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

  -- Caller must be an active member of the tenant.
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Only accept a v2-shaped config.
  IF (p_config->>'schema_version')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'invalid store_config_v2 (schema_version must be 2)';
  END IF;

  -- Serialize concurrent publishes for this tenant.
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
