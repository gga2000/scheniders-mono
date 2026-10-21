-- F-087 (PLAN.md PKG-06 follow-up, §4 step 1b): a tenant admin whose profile
-- has been deactivated must stop being an admin to the database.
--
-- WHY
--   is_tenant_admin(p_tenant_id) checked tenant_members (role 'admin', status
--   'active') but never user_profiles.is_active, unlike get_user_tenant_ids()
--   and has_tenant_permission(), which both require
--   coalesce(up.is_active, true). Four policies pair the helper with
--   get_current_tenant_id() instead of get_user_tenant_ids()
--   (telegram_link_codes ALL, telegram_employee_link SELECT/DELETE,
--   telegram_pending_orders SELECT), so a deactivated admin could mint a
--   Telegram link code for themselves, link the bot and create orders through
--   it, read pending bot orders and unlink staff. Every other caller of the
--   helper (policies, v_orders_with_risk's margin mask, the chat_* guards,
--   tenant_members_guard_self_change, and the gates PR #168 and later packages
--   add) inherits the fix from this one function.
--
-- WHAT THIS CHANGES
--   1. is_tenant_admin(uuid): same signature, STABLE SECURITY DEFINER,
--      search_path and grants; the membership row must also join an active
--      profile (coalesce(up.is_active, true), the get_user_tenant_ids rule:
--      a NULL is_active stays an admin).
--   2. telegram_link_codes_tenant_admin_all: USING unchanged; WITH CHECK (INSERT
--      and UPDATE) also requires that user_profile_id is an active member of
--      that tenant with an active profile, so an admin cannot mint a code for a
--      removed or deactivated colleague either.
--
-- PRE-COUNT (production, 2026-10-21, counts only): 1 tenant admin with
--   status 'active' and is_active = false loses admin rights; 18 active admins
--   keep them (0 have is_active NULL). The 3 existing telegram_link_codes rows
--   all satisfy the new WITH CHECK (it only applies to new writes anyway).
--
-- APPLY ORDER: before PR #168's 20261020140100..140800 so its new admin gates
--   already exclude deactivated admins. No code depends on it.
--
-- VERIFY (production, after apply)
--   SELECT prosrc ILIKE '%is_active%' FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace AND proname = 'is_tenant_admin';  -- true
--   Behaviour: packages/supabase/tests/is_tenant_admin_active.sql.
--
-- ROLLBACK (live definitions read with pg_get_functiondef / pg_policy on 2026-10-21)
--   CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id uuid)
--    RETURNS boolean
--    LANGUAGE sql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public', 'pg_temp'
--   AS $function$
--       SELECT EXISTS (
--           SELECT 1 FROM public.tenant_members
--           WHERE tenant_id = p_tenant_id
--             AND user_id = auth.uid()
--             AND role = 'admin'
--             AND status = 'active'
--       );
--   $function$;
--   DROP POLICY IF EXISTS telegram_link_codes_tenant_admin_all ON public.telegram_link_codes;
--   CREATE POLICY telegram_link_codes_tenant_admin_all ON public.telegram_link_codes
--     AS PERMISSIVE FOR ALL TO public
--     USING (((tenant_id = get_current_tenant_id()) AND is_tenant_admin(tenant_id)))
--     WITH CHECK (((tenant_id = get_current_tenant_id()) AND is_tenant_admin(tenant_id)));
--   (Grants are unchanged by CREATE OR REPLACE: EXECUTE to authenticated and
--   service_role only, nothing to PUBLIC or anon.)

-- 1. is_tenant_admin requires an active profile --------------------------------

CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM public.tenant_members tm
          JOIN public.user_profiles up ON up.id = tm.user_id
         WHERE tm.tenant_id = p_tenant_id
           AND tm.user_id = auth.uid()
           AND tm.role = 'admin'
           AND tm.status = 'active'
           AND coalesce(up.is_active, true)
    );
$function$;

-- Re-state the live grants so the function's ACL is explicit after this file.
REVOKE ALL ON FUNCTION public.is_tenant_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid) TO authenticated, service_role;

-- 2. telegram_link_codes writes target an active member with an active profile --

DROP POLICY IF EXISTS telegram_link_codes_tenant_admin_all ON public.telegram_link_codes;
CREATE POLICY telegram_link_codes_tenant_admin_all ON public.telegram_link_codes
    AS PERMISSIVE FOR ALL TO public
    USING (
        (tenant_id = public.get_current_tenant_id())
        AND public.is_tenant_admin(tenant_id)
    )
    WITH CHECK (
        (tenant_id = public.get_current_tenant_id())
        AND public.is_tenant_admin(tenant_id)
        AND EXISTS (
            SELECT 1
              FROM public.tenant_members tm
              JOIN public.user_profiles up ON up.id = tm.user_id
             WHERE tm.tenant_id = telegram_link_codes.tenant_id
               AND tm.user_id = telegram_link_codes.user_profile_id
               AND tm.status = 'active'
               AND coalesce(up.is_active, true)
        )
    );
