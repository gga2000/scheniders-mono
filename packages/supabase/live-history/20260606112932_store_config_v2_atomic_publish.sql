-- Atomic publish for the V2 store builder. Replaces the client's non-atomic
-- two-step publish (UPDATE tenants + separate, error-swallowed INSERT into
-- store_config_versions). Promotes draft->published AND snapshots the version
-- in ONE transaction, under an advisory lock, with a membership guard.
CREATE OR REPLACE FUNCTION public.publish_store_config_v2(p_tenant_id uuid, p_config jsonb)
RETURNS public.store_config_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.store_config_versions (tenant_id, label, is_named, config, created_by, author_name)
  VALUES (p_tenant_id, NULL, false, p_config, v_uid, v_author)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publish_store_config_v2(uuid, jsonb) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.publish_store_config_v2(uuid, jsonb) TO authenticated;;
