-- =============================================
-- Loyalty: points are earned when the order is DELIVERED, not when placed
--
-- Until now the storefront credited points the moment a COD order was
-- created (status 'new'). A shopper could place, cancel, and keep the
-- points; a 'no_response' order earned as much as a delivered one. The
-- credit now lives in the database, on the status transition, so every
-- path that delivers an order — the ops console, the LightFunnels
-- importer, a bulk update — credits exactly once, and leaving the
-- delivered state (return, refund, cancellation, soft-delete) takes the
-- points back.
--
-- Rules
--   * "Delivered" = status IN ('delivered','completed') AND deleted_at IS NULL.
--     delivered → completed is not a transition; it credits nothing twice.
--   * Points = floor(order.price × commerce.loyalty.earn_per_iqd) from the
--     tenant's PUBLISHED store_config_v2, mirroring computePointsEarned in
--     packages/shared/src/loyalty.ts. Loyalty off, or no rate → nothing.
--   * The balance key is the same shape the storefront uses
--     (normalizeIraqiMobile: '0' + ten digits). An order whose phone cannot
--     be normalised earns nothing rather than a balance nobody can reach.
--   * Reversal never overdraws: if the shopper already spent the points, only
--     what remains is taken back, so an ops status change can never fail on
--     'insufficient_points'. Ledger reason 'earn_reversal'.
--   * Idempotent per order: a credit is (points owed − net already earned),
--     so a second delivery credits 0 and a re-delivery after a reversal tops
--     the order back up to its full amount.
-- =============================================

-- Balance key: the storefront's normalizeIraqiMobile shape, or NULL.
CREATE OR REPLACE FUNCTION public.loyalty_phone_key(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
-- Pinned: this is IMMUTABLE and used inside an index expression. The body
-- qualifies public.normalize_phone, but `~` and `||` resolve through
-- search_path, which the caller controls and where pg_temp is writable.
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN n ~ '^7[0-9]{9}$' THEN '0' || n END
  FROM (SELECT public.normalize_phone(_phone) AS n) x;
$$;

-- Whole points an order subtotal earns under the tenant's published config.
CREATE OR REPLACE FUNCTION public.loyalty_points_for_order(_tenant_id uuid, _subtotal numeric)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN jsonb_typeof(cfg->'enabled') = 'boolean'
     AND (cfg->'enabled')::boolean
     AND jsonb_typeof(cfg->'earn_per_iqd') = 'number'
     AND (cfg->>'earn_per_iqd')::numeric > 0
    THEN floor(greatest(0, coalesce(_subtotal, 0)) * (cfg->>'earn_per_iqd')::numeric)::integer
    ELSE 0
  END
  FROM (
    SELECT t.store_config_v2->'commerce'->'loyalty' AS cfg
    FROM public.tenants t
    WHERE t.id = _tenant_id
  ) c;
$$;

CREATE OR REPLACE FUNCTION public.loyalty_order_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _earning_now    boolean := NEW.status IN ('delivered','completed') AND NEW.deleted_at IS NULL;
  _earning_before boolean := TG_OP = 'UPDATE'
                             AND OLD.status IN ('delivered','completed')
                             AND OLD.deleted_at IS NULL;
  _phone   text;
  _net     integer;
  _points  integer;
  _balance integer;
BEGIN
  IF _earning_now = _earning_before OR NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  _phone := public.loyalty_phone_key(NEW.phone);
  IF _phone IS NULL THEN
    RETURN NEW;
  END IF;

  -- What this order has netted so far (earn minus reversals).
  SELECT coalesce(sum(delta), 0) INTO _net
  FROM public.customer_points_ledger
  WHERE tenant_id = NEW.tenant_id
    AND order_id = NEW.id
    AND reason IN ('earn', 'earn_reversal');

  IF _earning_now THEN
    -- Credit what the order is owed minus what it already netted: a second
    -- delivery of the same row credits 0; a re-delivery after a partial
    -- reversal (the shopper had spent some) tops up to the full amount.
    _points := coalesce(public.loyalty_points_for_order(NEW.tenant_id, NEW.price), 0)
               - greatest(_net, 0);
    IF _points > 0 THEN
      PERFORM public.adjust_customer_points(NEW.tenant_id, _phone, _points, 'earn', NEW.id);
    END IF;
  ELSE
    IF _net <= 0 THEN
      RETURN NEW; -- nothing to take back
    END IF;
    SELECT balance INTO _balance
    FROM public.customer_points
    WHERE tenant_id = NEW.tenant_id AND phone = _phone;
    _points := least(_net, coalesce(_balance, 0));
    IF _points > 0 THEN
      PERFORM public.adjust_customer_points(NEW.tenant_id, _phone, -_points, 'earn_reversal', NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_loyalty_order_changed ON public.orders;
CREATE TRIGGER trg_loyalty_order_changed
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.loyalty_order_changed();

-- Trusted server code and the trigger are the only callers.
REVOKE EXECUTE ON FUNCTION public.loyalty_phone_key(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.loyalty_points_for_order(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.loyalty_order_changed() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
