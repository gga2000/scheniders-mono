CREATE OR REPLACE FUNCTION public.apply_store_config_v2_patch(
  p_tenant_id uuid,
  p_is_draft  boolean,
  p_path      text[],
  p_value     jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF array_length(p_path, 1) IS NULL THEN
    RAISE EXCEPTION 'empty path';
  END IF;

  IF p_path[1] NOT IN (
    'brand_kit', 'pages', 'globals', 'experiments', 'segments',
    'schedules', 'default_locale', 'enabled_locales', 'commerce', 'custom_css'
  ) THEN
    RAISE EXCEPTION 'path root "%" is not editable', p_path[1]
      USING ERRCODE = '22023';
  END IF;
  IF array_length(p_path, 1) > 64 THEN
    RAISE EXCEPTION 'patch path too deep' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(p_value) > 524288 THEN
    RAISE EXCEPTION 'patch value too large' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('store_config_' || p_tenant_id::text));

  IF p_is_draft THEN
    UPDATE public.tenants
       SET store_config_v2_draft = jsonb_set(
             COALESCE(store_config_v2_draft, store_config_v2, '{}'::jsonb),
             p_path, p_value, true),
           updated_at = now()
     WHERE id = p_tenant_id;
  ELSE
    UPDATE public.tenants
       SET store_config_v2 = jsonb_set(
             COALESCE(store_config_v2, '{}'::jsonb),
             p_path, p_value, true),
           updated_at = now()
     WHERE id = p_tenant_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_store_config_v2_patch(uuid, boolean, text[], jsonb) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.apply_store_config_v2_patch(uuid, boolean, text[], jsonb) TO authenticated;;
