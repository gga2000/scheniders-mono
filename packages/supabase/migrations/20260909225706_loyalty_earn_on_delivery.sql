-- Recorded from live schema_migrations; applied 2026-09-09 from branch
-- feat/flagship-template (PR #80, source commit 2b9e5ba9, drafted there as
-- 20260910120000_loyalty_earn_on_delivery.sql); do not edit.
-- Body below is the exact statement that ran under version 20260909225706.
-- Later live refinements, recorded separately: 20260909225854_loyalty_earn_on_delivery_topup
-- (loyalty_order_changed) and 20260910211209_loyalty_phone_key_pin_search_path.
-- main's 20260910000500_grant_execute_loyalty_phone_key depends on the
-- function created here and sorts after it.

-- Loyalty: points are earned when the order is DELIVERED, not when placed.
-- Mirror of packages/supabase/migrations/20260910120000_loyalty_earn_on_delivery.sql

CREATE OR REPLACE FUNCTION public.loyalty_phone_key(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN n ~ '^7[0-9]{9}$' THEN '0' || n END
  FROM (SELECT public.normalize_phone(_phone) AS n) x;
$$;

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

  SELECT coalesce(sum(delta), 0) INTO _net
  FROM public.customer_points_ledger
  WHERE tenant_id = NEW.tenant_id
    AND order_id = NEW.id
    AND reason IN ('earn', 'earn_reversal');

  IF _earning_now THEN
    IF _net > 0 THEN
      RETURN NEW;
    END IF;
    _points := coalesce(public.loyalty_points_for_order(NEW.tenant_id, NEW.price), 0);
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
$$;

DROP TRIGGER IF EXISTS trg_loyalty_order_changed ON public.orders;
CREATE TRIGGER trg_loyalty_order_changed
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.loyalty_order_changed();

REVOKE EXECUTE ON FUNCTION public.loyalty_phone_key(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.loyalty_points_for_order(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.loyalty_order_changed() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
