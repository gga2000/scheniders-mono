-- Subscriptions: a staff plan change on a locked trial shop is a first choice
-- too (staff console audit, round 9, data finding 1).
--
-- 20261117071812 marks a row from_trial when the subscription was still
-- 'trialing'. A trial that ended unpaid is 'past_due' on the subscription but
-- still 'trial' on the shop: the shop moves to 'active' only on a paid month.
-- When staff press Change plan on such a shop (Team to Start, so the merchant
-- can pay 9,000), admin_update_shop changes the plan while the shop is still
-- 'trial', and the row said from_trial false: Home counted a downgrade for a
-- shop that has never paid.
--
-- Now a row is from_trial when the subscription is 'trialing' or the shop is
-- still on trial. The trigger reads the shop row as it is at that moment in
-- the transaction: admin_update_shop writes a status before a plan, so staff
-- who make a locked trial 'active' and change its plan in one call get a real
-- move (by then it is a paying shop); the console sends status and plan in
-- separate calls. The trigger takes no lock; change_plan, the renewal and
-- admin_update_shop are not edited.
--
-- The record had 0 rows when this ran, so there is nothing to backfill.
--
-- Rollback: restore subscriptions_log_plan_change() from 20261117071812.

CREATE OR REPLACE FUNCTION public.subscriptions_log_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO public.subscription_plan_changes (tenant_id, from_plan, to_plan, from_trial)
    VALUES (
        NEW.tenant_id, OLD.plan, NEW.plan,
        OLD.status IS NOT DISTINCT FROM 'trialing'
        OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = NEW.tenant_id AND t.status = 'trial'));
    RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.subscriptions_log_plan_change() FROM PUBLIC, anon, authenticated;
