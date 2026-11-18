-- The demo store is never paused.
--
-- admin_update_shop refuses any status change of the demo store (Fermi B13,
-- tenants.is_demo): it stays open for everyone who is shown it. Pause took
-- another way in. pause_tenant set the demo store 'limited' with no check, and
-- by default a pause blocks new orders, so the store a merchant is being shown
-- stopped taking them.
--
-- pause_tenant now leaves the demo store as it is and answers no row, as it
-- does for an unknown shop. The console route reads the shop to tell the two
-- apart and says why. Everything else is as in 20261116071900.
-- lift_tenant_pause is unchanged, so a demo store paused before this can still
-- be resumed.
--
-- The service role only, as before.

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
     AND NOT t.is_demo
  RETURNING t.id, t.status, t.restrictions;
$$;

REVOKE ALL ON FUNCTION public.pause_tenant(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pause_tenant(uuid, jsonb) TO service_role;