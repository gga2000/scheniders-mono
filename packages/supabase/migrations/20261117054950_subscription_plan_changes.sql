-- Subscriptions: a dated record of every plan change (staff console audit,
-- round 7, Should fix 4).
--
-- The console's "Plan Movements (30d)" card read plan changes from the staff
-- log, so it only saw changes made by staff. A merchant's own upgrade
-- (change_plan) and a waiting plan that the renewal applies
-- (renew_subscription_core) left no dated record anywhere.
--
-- Now one row per real change of subscriptions.plan, whoever made it: the
-- merchant, the renewal or staff (admin_update_shop). The row is written by a
-- trigger, so change_plan and the renewal are not edited (the Fermi thread
-- owns them and agreed, 17 Nov). The trigger takes no lock and reads nothing
-- else; it touches no price, charge, lock or add-on.
--
-- Only the service role reads it (the staff console's server). RLS is on with
-- no policy, and the browser roles have no grant. The demo store's reset
-- deletes and re-inserts its subscription (not an UPDATE), and its sweep
-- (demo_store_sweep_tables) takes every table with a tenant_id, this one too.
--
-- Rollback: DROP TRIGGER subscriptions_plan_change_log ON public.subscriptions;
-- DROP FUNCTION public.subscriptions_log_plan_change(); DROP TABLE public.subscription_plan_changes;

CREATE TABLE public.subscription_plan_changes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
    from_plan public.plan_tier NOT NULL,
    to_plan public.plan_tier NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
);

-- The card reads the last 30 days.
CREATE INDEX subscription_plan_changes_changed_at_idx ON public.subscription_plan_changes (changed_at);
CREATE INDEX subscription_plan_changes_tenant_id_idx ON public.subscription_plan_changes (tenant_id);

ALTER TABLE public.subscription_plan_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subscription_plan_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.subscription_plan_changes TO service_role;

-- Definer rights: whoever updates the subscription, the row is written.
CREATE FUNCTION public.subscriptions_log_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO public.subscription_plan_changes (tenant_id, from_plan, to_plan)
    VALUES (NEW.tenant_id, OLD.plan, NEW.plan);
    RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.subscriptions_log_plan_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER subscriptions_plan_change_log
    AFTER UPDATE OF plan ON public.subscriptions
    FOR EACH ROW
    WHEN (OLD.plan IS DISTINCT FROM NEW.plan)
    EXECUTE FUNCTION public.subscriptions_log_plan_change();
