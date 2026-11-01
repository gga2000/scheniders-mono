-- Clear the "address_issue" attention flag once the address is fixed.
--
-- The LightFunnels webhook flags an order whose address fails validation
-- (lib/webhook-handler.ts). Nothing ever cleared it: staff fill in the address
-- by phone, the order is delivered, and it still counts as "needs attention"
-- in the Flagged filter and in Reports. On 2026-11-01, 110 of 243 flagged live
-- orders already had a governorate and a street address.
--
-- The rule matches lib/address-validator.ts: a known governorate plus any
-- address details is a complete address.

CREATE OR REPLACE FUNCTION public.orders_clear_fixed_address_issue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.attention_reasons IS NOT NULL
     AND 'address_issue' = ANY (NEW.attention_reasons)
     AND NEW.governorate_code IS NOT NULL
     AND coalesce(btrim(NEW.address_details), '') <> '' THEN
    NEW.attention_reasons := array_remove(NEW.attention_reasons, 'address_issue');
    IF cardinality(NEW.attention_reasons) = 0 THEN
      NEW.attention_reasons := NULL;
      NEW.needs_attention := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_clear_fixed_address_issue ON public.orders;
CREATE TRIGGER trg_orders_clear_fixed_address_issue
  BEFORE UPDATE OF city, address_details, governorate_code, attention_reasons
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_clear_fixed_address_issue();

-- One-time cleanup of the flags already fixed. Touches only rows that carry the
-- flag and a complete address; the trigger does the rewrite.
UPDATE public.orders
   SET attention_reasons = attention_reasons
 WHERE 'address_issue' = ANY (attention_reasons)
   AND governorate_code IS NOT NULL
   AND coalesce(btrim(address_details), '') <> '';
