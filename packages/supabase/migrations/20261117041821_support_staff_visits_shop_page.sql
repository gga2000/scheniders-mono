-- Merchant support: the merchant's "what our staff did" list also shows the
-- steps the staff console's shop page writes since 17 Nov.
--
--   admin_update_shop (20261117002947) logs status_change, plan_change and
--   auto_renew_toggle; free days on a paying shop log extend_subscription.
--
-- support_staff_visits only knew the older names (change_plan, suspend,
-- reactivate, extend_trial), so a plan or status change made from the shop
-- page never reached the merchant. Each new name is turned into a step the
-- merchant reads:
--   plan_change          -> change_plan (same words as before)
--   status_change        -> suspend when the shop was suspended;
--                           reactivate when a suspended, limited or
--                           cancelled shop was made active again;
--                           status_change (generic words) otherwise
--   auto_renew_toggle    -> auto_renew_on / auto_renew_off
--   extend_subscription  -> extend_subscription
-- Everything else is unchanged. Service role only.

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
        SELECT CASE g.action
                   WHEN 'plan_change' THEN 'change_plan'
                   WHEN 'status_change' THEN
                       CASE
                           WHEN g.details ->> 'status' = 'suspended' THEN 'suspend'
                           WHEN g.details ->> 'status' = 'active'
                                AND g.details ->> 'previous_status' IN ('suspended', 'limited', 'cancelled')
                               THEN 'reactivate'
                           ELSE 'status_change'
                       END
                   WHEN 'auto_renew_toggle' THEN
                       CASE WHEN g.details ->> 'auto_renew' = 'true' THEN 'auto_renew_on' ELSE 'auto_renew_off' END
                   ELSE g.action
               END AS action,
               g.admin_user_id,
               g.created_at
        FROM public.admin_activity_logs g
        WHERE g.tenant_id = p_tenant_id
          AND g.action IN (
              'impersonate', 'support_view',
              'extend_trial', 'extend_subscription', 'convert_trial',
              'change_plan', 'plan_change', 'status_change', 'auto_renew_toggle',
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
