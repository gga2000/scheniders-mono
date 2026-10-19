-- Refinement of loyalty_order_changed (same migration file, 20260910120000):
-- credit = points owed − net already earned, so re-delivery after a partial
-- reversal tops the order back up instead of crediting nothing.
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

  SELECT coalesce(sum(delta), 0) INTO _net
  FROM public.customer_points_ledger
  WHERE tenant_id = NEW.tenant_id
    AND order_id = NEW.id
    AND reason IN ('earn', 'earn_reversal');

  IF _earning_now THEN
    _points := coalesce(public.loyalty_points_for_order(NEW.tenant_id, NEW.price), 0)
               - greatest(_net, 0);
    IF _points > 0 THEN
      PERFORM public.adjust_customer_points(NEW.tenant_id, _phone, _points, 'earn', NEW.id);
    END IF;
  ELSE
    IF _net <= 0 THEN
      RETURN NEW;
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
$$;;
