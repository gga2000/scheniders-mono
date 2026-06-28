-- =====================================================================
-- seed_store_config_v2_draft — onboarding Phase 1
-- =====================================================================
-- Writes a full StoreConfigV2 to a tenant's `store_config_v2_draft` in
-- one shot, used by the post-signup onboarding wizard. Unlike
-- `apply_store_config_v2_patch` (field-level, bases a null draft on
-- '{}'), this seeds the WHOLE config including `schema_version`.
--
-- Safety:
--   - SECURITY DEFINER, membership-gated (active member of the tenant),
--     mirroring apply_store_config_v2_patch.
--   - Only seeds a genuinely fresh store: both `store_config_v2` AND
--     `store_config_v2_draft` must be NULL. A returning merchant who
--     re-opens the wizard therefore can NEVER overwrite an existing
--     store. Returns true when it seeded, false when it no-op'd.
--   - Per-tenant advisory lock, consistent with the patch RPC.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.seed_store_config_v2_draft(
  p_tenant_id uuid,
  p_config    jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_seeded boolean := false;
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

  -- Guard: only a full v2 object with the right schema version may seed.
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
     AND store_config_v2 IS NULL
     AND store_config_v2_draft IS NULL;

  v_seeded := FOUND;
  RETURN v_seeded;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_store_config_v2_draft(uuid, jsonb) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.seed_store_config_v2_draft(uuid, jsonb) TO authenticated;
