-- Subscriptions: the plan record says when a change ended a trial (staff
-- console audit, round 8, data finding 1).
--
-- Every signup starts its trial on Team (growth). A plan the merchant picks in
-- the trial waits in pending_plan, and the renewal applies it when the trial
-- ends, before it charges (renew_subscription_core). The record
-- (20261117054950) wrote that as a change Team -> Start or Team -> Business,
-- so the console's Plan Movements card would count each new shop's first
-- choice as a downgrade or an upgrade, even a shop whose first payment failed.
--
-- Now each row says whether the subscription was still on trial
-- (from_trial). The renewal changes the plan while the status is still
-- 'trialing', and a locked trial shop is put back to 'trialing' before its
-- retry (settle_billing_lock), so OLD.status is enough. The trigger still reads
-- nothing else and takes no lock. change_plan and the renewal are not edited.
--
-- The record had 0 rows when this ran, so there is nothing to backfill.
--
-- Rollback: restore subscriptions_log_plan_change() from 20261117054950, then
-- ALTER TABLE public.subscription_plan_changes DROP COLUMN from_trial;

ALTER TABLE public.subscription_plan_changes
    ADD COLUMN from_trial boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.subscriptions_log_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO public.subscription_plan_changes (tenant_id, from_plan, to_plan, from_trial)
    VALUES (NEW.tenant_id, OLD.plan, NEW.plan, OLD.status IS NOT DISTINCT FROM 'trialing');
    RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.subscriptions_log_plan_change() FROM PUBLIC, anon, authenticated;
