-- Atomic field-level patch for the V2 store builder. Replaces the route's
-- read-modify-write (SELECT whole jsonb -> setByPath in JS -> UPDATE whole
-- jsonb), which loses concurrent updates. Does a single jsonb_set under a
-- per-tenant advisory lock, membership-gated (active members only).
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

  PERFORM pg_advisory_xact_lock(hashtext('store_config_' || p_tenant_id::text));

  IF p_is_draft THEN
    -- First draft edit starts from the published config if no draft exists yet.
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
GRANT  EXECUTE ON FUNCTION public.apply_store_config_v2_patch(uuid, boolean, text[], jsonb) TO authenticated;
