-- Security round 2 (D-06, D-08, D-09): defence in depth. RLS already refuses
-- every one of these writes today (no client write policy exists), so nothing
-- that works now changes; this removes the grant so one mistaken permissive
-- policy later cannot open platform money or permissions.

-- D-06: money and permission tables are written only by the service role and
-- SECURITY DEFINER functions.
REVOKE INSERT, UPDATE, DELETE ON
    public.wallet, public.wallet_transactions, public.subscriptions,
    public.usage_tracking, public.plan_limits, public.role_permissions,
    public.account_link_tokens
FROM anon, authenticated;

-- Signed-out visitors have no business touching staff, payroll or keys.
REVOKE ALL ON public.payroll_records, public.tenant_members,
    public.tenant_integrations, public.user_permissions
FROM anon;

-- Stores are created server-side (signup route, service role).
REVOKE INSERT ON public.tenants FROM anon, authenticated;

-- D-08: QC photos can show parcel labels with customer names and phones; a
-- public bucket serves them to anyone holding the URL. Nothing in the apps
-- reads this bucket by public URL.
UPDATE storage.buckets SET public = false WHERE id = 'qc-evidence';

-- D-09: only SECURITY DEFINER functions (dispatch_notification,
-- send_notification_digests, notify_order_push, chat_notify_push) call
-- pg_net, and they run as their owner.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA net FROM anon, authenticated;
REVOKE USAGE ON SCHEMA net FROM anon, authenticated;
