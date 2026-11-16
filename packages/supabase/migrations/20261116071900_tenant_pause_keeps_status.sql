-- A pause remembers the status it replaces, and lifting it gives that status back.
--
-- Staff pause a shop from the console: tenants.status becomes 'limited' and
-- the blocks go into tenants.restrictions. Lifting the pause wrote status
-- 'active', whatever the shop was before:
--   * a shop on trial that was paused and unpaused came back 'active' with its
--     subscription still 'trialing'. tenant_billing_lock locks a trial at its
--     end date and an active shop whose subscription is past due, so this shop
--     was never locked and never asked to pay;
--   * the same call made a shop 'active' that was not paused at all, a
--     suspended or cancelled one included.
--
-- pause_tenant keeps the status the pause replaces in
-- restrictions.status_before, in the statement that sets 'limited'.
-- lift_tenant_pause puts that status back and empties restrictions. It changes
-- nothing for a shop that is not paused, and returns no row for it.
-- A shop paused before this migration has no status_before: it goes back to
-- 'trial' while its newest subscription is still 'trialing', else to 'active'.
-- No date is touched: a trial that ran out during the pause is over.
--
-- The service role only.

CREATE OR REPLACE FUNCTION public.pause_tenant(_tenant_id uuid, _restrictions jsonb)
RETURNS TABLE (id uuid, status public.tenant_status, restrictions jsonb)
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.tenants t
     SET restrictions = _restrictions || jsonb_build_object(
           'status_before',
           -- Pausing a paused shop again keeps what it was before the first pause.
           CASE WHEN t.status = 'limited' THEN t.restrictions ->> 'status_before' ELSE t.status::text END
         ),
         status = 'limited'
   WHERE t.id = _tenant_id
  RETURNING t.id, t.status, t.restrictions;
$$;

CREATE OR REPLACE FUNCTION public.lift_tenant_pause(_tenant_id uuid)
RETURNS TABLE (id uuid, status public.tenant_status, restrictions jsonb)
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.tenants t
     SET status = CASE
           WHEN t.restrictions ->> 'status_before' IN ('trial', 'active', 'suspended', 'cancelled')
             THEN (t.restrictions ->> 'status_before')::public.tenant_status
           WHEN (SELECT s.status
                   FROM public.subscriptions s
                  WHERE s.tenant_id = t.id
                  ORDER BY s.created_at DESC
                  LIMIT 1) = 'trialing'
             THEN 'trial'::public.tenant_status
           ELSE 'active'::public.tenant_status
         END,
         restrictions = '{}'::jsonb
   WHERE t.id = _tenant_id
     AND t.status = 'limited'
  RETURNING t.id, t.status, t.restrictions;
$$;

REVOKE ALL ON FUNCTION public.pause_tenant(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lift_tenant_pause(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pause_tenant(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.lift_tenant_pause(uuid) TO service_role;
