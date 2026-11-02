-- record_storefront_beacon: the /api/events beacon in one round trip.
--
-- Same body as record_storefront_events (20261102060926), with the address
-- key moved to an optional last argument (DEFAULT NULL = no address window,
-- used when the request IP is unknown). Generated TypeScript types never mark
-- an argument nullable, only optional, so a NULL in the middle of the list
-- could not be typed honestly. record_storefront_events has no callers; its
-- DROP is queued separately because DDL drops need a dashboard confirm.

CREATE OR REPLACE FUNCTION public.record_storefront_beacon(
  _tenant_id uuid,
  _visitor_key text,
  _visitor_key_limit_key text,
  _visitor_limit integer,
  _ip_limit integer,
  _window_seconds integer,
  _events jsonb,
  _ip_key text DEFAULT NULL
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

REVOKE ALL ON FUNCTION public.record_storefront_beacon(uuid, text, text, integer, integer, integer, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_storefront_beacon(uuid, text, text, integer, integer, integer, jsonb, text) TO service_role;
