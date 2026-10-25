-- tenants: members may only edit the store-builder draft; business fields need a
-- tenant admin; billing/lifecycle/live config are server-only (2026-10-20).
--
-- FIXES  NEW-P1-02 (P0) and NEW-P1-03 (P1), audit-final/REGRESSION.md
--        (orders-reliability N1, store-builder-qc N1/N2, ledger SEC-30).
--
-- WHY (live, 2026-10-20)
--   * Policy tenant_member_update (UPDATE, authenticated) is
--       USING / WITH CHECK  id IN (SELECT get_user_tenant_ids())
--     with no role test, and anon + authenticated hold UPDATE on all 25
--     columns. Any active member, 'member' employees included, could set their
--     own tenant's plan, status, trial_ends_at, restrictions (lifting an admin
--     pause), slug, store_config_v2 (live storefront) and the rest. The only
--     UPDATE trigger, trg_enforce_storefront_writes_block, looks at branding
--     and store_config only.
--   * apply_store_config_v2_patch(p_is_draft => false) writes the LIVE
--     store_config_v2 for any active member (the route takes is_draft from the
--     request body). A NULL p_is_draft also fell through to the live branch.
--
-- LEGITIMATE WRITERS (grep apps/ packages/ for .from('tenants') + update/upsert,
-- and live pg_proc bodies that UPDATE tenants)
--   Browser / user session (RLS applies):
--     components/settings/business-settings.tsx  business_name, contact_email,
--         contact_phone, city, address, branding, store_config, updated_at.
--         The settings screens are admin-only in the app (ACCESS_SETTINGS);
--         live: every tenant_members 'admin' row is a user_profiles admin or
--         super_admin and every 'member' row an employee.
--     hooks/use-store-builder-v2.ts  store_config_v2_draft, updated_at
--         (autosave and revert-to-published). /store is open to members.
--   Definer RPCs (run as the owner, so this trigger lets them through and
--   their own guards apply): publish_store_config_v2 (admin-only already),
--   seed_store_config_v2_draft (member, draft only),
--   apply_store_config_v2_patch (changed below).
--   Service role (bypasses RLS and this trigger): every admin-app route
--   (createAdminClient), signup, crons (trial-suspend, subscription-renew,
--   abandoned-cart-recovery), lib/restrictions.ts, telegram webhook,
--   storefront checkout/newsletter/exp-event.
--
-- WHAT THIS CHANGES
--   1. Column privileges: anon loses UPDATE on tenants; authenticated keeps
--      UPDATE only on the nine columns the two browser writers send.
--   2. BEFORE UPDATE trigger (SECURITY INVOKER, so current_user is the real
--      caller role): for anon/authenticated callers,
--        - any change outside those nine columns is refused (fail-closed for
--          columns added later), and
--        - any change other than store_config_v2_draft / updated_at needs
--          is_tenant_admin(id).
--      Definer functions (current_user = owner) and service_role are not
--      affected.
--   3. apply_store_config_v2_patch: a live write (p_is_draft not TRUE) needs
--      is_tenant_admin(p_tenant_id). Draft patches keep the member rule.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_enforce_tenant_member_update_scope ON public.tenants;
--   DROP FUNCTION IF EXISTS public.enforce_tenant_member_update_scope();
--   GRANT UPDATE ON public.tenants TO anon, authenticated;
--   Re-create apply_store_config_v2_patch from the live definition captured in
--   audit-final (identical to the body below minus the is_tenant_admin block).

-- 1. Column privileges -------------------------------------------------------
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

DROP TRIGGER IF EXISTS trg_enforce_tenant_member_update_scope ON public.tenants;
CREATE TRIGGER trg_enforce_tenant_member_update_scope
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
