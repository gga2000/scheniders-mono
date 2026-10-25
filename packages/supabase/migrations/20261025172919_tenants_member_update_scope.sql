-- tenants_member_update_scope (header and rollback notes: packages/supabase/tests/p1_db_security_holes.sql).
-- members may update 9 tenants columns; trigger requires a tenant admin beyond the builder draft.
-- lock_timeout: fail fast rather than queue live traffic behind the tenants lock.
SET LOCAL lock_timeout = '3s';

REVOKE UPDATE ON public.tenants FROM anon, authenticated;
GRANT UPDATE (
    business_name,
    contact_email,
    contact_phone,
    city,
    address,
    branding,
    store_config,
    store_config_v2_draft,
    updated_at
) ON public.tenants TO authenticated;

-- 2. Row trigger ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_tenant_member_update_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    -- Columns any active member may change (store builder draft autosave).
    v_member_cols constant text[] := ARRAY['store_config_v2_draft', 'updated_at'];
    -- Columns a tenant admin may change from the browser (business settings).
    v_admin_cols constant text[] := ARRAY[
        'store_config_v2_draft', 'updated_at',
        'business_name', 'contact_email', 'contact_phone', 'city', 'address',
        'branding', 'store_config'
    ];
BEGIN
    -- Service role and SECURITY DEFINER functions (current_user = their owner)
    -- are trusted paths with their own checks.
    IF current_user NOT IN ('anon', 'authenticated') THEN
        RETURN NEW;
    END IF;

    IF (to_jsonb(NEW) - v_admin_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_admin_cols) THEN
        RAISE EXCEPTION 'tenant billing, lifecycle and live store config can only be changed by the platform'
            USING ERRCODE = '42501';
    END IF;

    IF (to_jsonb(NEW) - v_member_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_member_cols)
       AND NOT public.is_tenant_admin(OLD.id) THEN
        RAISE EXCEPTION 'only a tenant admin can change business settings'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enforce_tenant_member_update_scope() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_enforce_tenant_member_update_scope
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_member_update_scope();

-- 3. Live patches need a tenant admin -------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_store_config_v2_patch(p_tenant_id uuid, p_is_draft boolean, p_path text[], p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Writing the published config is publishing: same bar as
  -- publish_store_config_v2. NULL is treated as live, as the branch below does.
  IF p_is_draft IS NOT TRUE AND NOT public.is_tenant_admin(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden: live store config writes require a tenant admin'
      USING ERRCODE = '42501';
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
$function$;
