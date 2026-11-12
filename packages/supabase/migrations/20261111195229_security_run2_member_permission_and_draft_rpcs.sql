-- Security audit run 2: permission checks the server can run for any member.
--
-- has_tenant_permission reads auth.uid(), so server code acting with the
-- service role (Claude connector writes, the Telegram bot, server actions)
-- fell back to a fixed role list and ignored a store's per-user revocations.
-- member_has_permission is the same rule for a named user, callable only by
-- the service role; has_tenant_permission now delegates to it so the two can
-- never drift.
--
-- The store-builder draft RPCs also now need products.edit (a viewer could
-- rewrite or seed the draft); live writes still need a tenant admin.

CREATE OR REPLACE FUNCTION public.member_has_permission(p_tenant_id uuid, p_user_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT COALESCE((
        SELECT CASE
            WHEN tm.role = 'admin' THEN true
            ELSE COALESCE(
                (SELECT o.is_granted
                   FROM public.user_permissions o
                  WHERE o.tenant_id = tm.tenant_id
                    AND o.user_id = tm.user_id
                    AND o.permission = p_permission),
                EXISTS (
                    SELECT 1
                      FROM public.role_permissions rp
                     WHERE rp.role = tm.role
                       AND rp.permission = p_permission
                )
            )
        END
          FROM public.tenant_members tm
          JOIN public.user_profiles up ON up.id = tm.user_id
         WHERE tm.tenant_id = p_tenant_id
           AND tm.user_id = p_user_id
           AND tm.status = 'active'
           AND COALESCE(up.is_active, true)
    ), false);
$function$;

REVOKE ALL ON FUNCTION public.member_has_permission(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_has_permission(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.has_tenant_permission(p_tenant_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT public.member_has_permission(p_tenant_id, auth.uid(), p_permission);
$function$;

CREATE OR REPLACE FUNCTION public.apply_store_config_v2_patch(p_tenant_id uuid, p_is_draft boolean, p_path text[], p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Writing the published config is publishing: same bar as
  -- publish_store_config_v2. NULL is treated as live, as the branch below does.
  IF p_is_draft IS NOT TRUE AND NOT public.is_tenant_admin(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden: live store config writes require a tenant admin'
      USING ERRCODE = '42501';
  END IF;
  -- The draft is store content: same permission as editing products.
  IF p_is_draft IS TRUE AND NOT public.has_tenant_permission(p_tenant_id, 'products.edit') THEN
    RAISE EXCEPTION 'Your role cannot edit the store (needs products.edit)' USING ERRCODE = '42501';
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

  IF NOT public.has_tenant_permission(p_tenant_id, 'products.edit') THEN
    RAISE EXCEPTION 'Your role cannot edit the store (needs products.edit)' USING ERRCODE = '42501';
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
