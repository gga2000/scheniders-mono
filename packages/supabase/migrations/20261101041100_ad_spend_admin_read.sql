-- Ad spend is money data: only tenant admins read it (matches /finances gating).
DROP POLICY IF EXISTS ad_spend_daily_member_read ON public.ad_spend_daily;
CREATE POLICY ad_spend_daily_admin_read ON public.ad_spend_daily
    FOR SELECT TO authenticated
    USING (public.is_tenant_admin(tenant_id));
