-- One round trip per funnel beacon batch.
--
-- /api/events made four PostgREST calls per batch: two consume_rate_limit
-- RPCs (address + visitor), a live-tenant lookup and the insert. Every
-- shopper sends several batches per page, so the beacon was about half of all
-- storefront database traffic, and under the 2026-11-02 morning ad burst it
-- helped choke the instance. This function does the same four steps, in the
-- same order and with the same rules, inside one call.
--
-- Rules kept from the route:
--   * both windows are consumed before the tenant check (a junk tenant id
--     still spends the caller's windows);
--   * the tenant must be publicly live (status active or trial), mirroring
--     the anon public_storefront_read gate;
--   * only the four client event types are accepted ('purchase' is recorded
--     server-side by checkout, never here).
-- Callers: service_role only (the route); anon/authenticated cannot execute.

CREATE OR REPLACE FUNCTION public.record_storefront_events(
  _tenant_id uuid,
  _visitor_key text,
  _ip_key text,
  _ip_limit integer,
  _visitor_key_limit_key text,
  _visitor_limit integer,
  _window_seconds integer,
  _events jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _allowed boolean;
BEGIN
  IF _ip_key IS NOT NULL THEN
    SELECT r.allowed INTO _allowed
    FROM public.consume_rate_limit(_ip_key, _ip_limit, _window_seconds) r;
    IF NOT _allowed THEN
      RETURN 'limited';
    END IF;
  END IF;

  SELECT r.allowed INTO _allowed
  FROM public.consume_rate_limit(_visitor_key_limit_key, _visitor_limit, _window_seconds) r;
  IF NOT _allowed THEN
    RETURN 'limited';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = _tenant_id AND t.status IN ('active', 'trial')
  ) THEN
    RETURN 'not_live';
  END IF;

  INSERT INTO public.storefront_events (tenant_id, visitor_key, event_type, page_id, product_id)
  SELECT _tenant_id, _visitor_key, e.type, e.page_id, e.product_id
  FROM jsonb_to_recordset(_events) AS e(type text, page_id text, product_id uuid)
  WHERE e.type IN ('page_view', 'view_product', 'add_to_cart', 'initiate_checkout');

  RETURN 'recorded';
END;
$$;

REVOKE ALL ON FUNCTION public.record_storefront_events(uuid, text, text, integer, text, integer, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_storefront_events(uuid, text, text, integer, text, integer, integer, jsonb) TO service_role;
