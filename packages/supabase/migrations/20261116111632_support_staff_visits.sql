-- Merchant support, wave 4: the merchant sees what our staff did on their shop.
--
--   support_staff_visits(tenant)   the last 50 staff actions on one shop that
--                                  the merchant should know about: opening the
--                                  store, looking at the account, pausing,
--                                  trial and plan changes, wallet top-ups,
--                                  WhatsApp pause, writing first, taking the
--                                  shop. Each with the staff member's display
--                                  name (never an email) and the time.
--
-- Internal steps (notes, tags, priority, inbox moves, call log) stay off the
-- list. The platform route calls this with the caller's own tenant only.
-- Service role only.

CREATE OR REPLACE FUNCTION public.support_staff_visits(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'action', l.action,
               'staff', nullif(btrim(a.display_name), ''),
               'at', l.created_at)
             ORDER BY l.created_at DESC), '[]'::jsonb)
    FROM (
        SELECT g.action, g.admin_user_id, g.created_at
        FROM public.admin_activity_logs g
        WHERE g.tenant_id = p_tenant_id
          AND g.action IN (
              'impersonate', 'support_view',
              'extend_trial', 'convert_trial', 'change_plan',
              'pause_tenant', 'unpause_tenant', 'suspend', 'bulk_suspend', 'reactivate',
              'top_up_wallet', 'top_up', 'bulk_top_up',
              'pause_whatsapp', 'resume_whatsapp',
              'support_reached_out', 'support_shop_taken')
        ORDER BY g.created_at DESC
        LIMIT 50
    ) l
    LEFT JOIN public.admin_users a ON a.user_id = l.admin_user_id;
$$;

REVOKE ALL ON FUNCTION public.support_staff_visits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_staff_visits(uuid) TO service_role;
