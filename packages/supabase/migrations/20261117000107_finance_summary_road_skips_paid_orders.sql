-- Finances round 26: an order a confirmed courier payment already paid for is no
-- longer also counted "on the road" (or stuck). A paid order still marked
-- in_transit is money in (the payments card lists it to be marked delivered),
-- so counting its price on the road too would show the same money twice.
-- Only the `road` CTE changes; every other key is the same. Today no shop's
-- figures change: the one such order (4261102012) is a Prime parcel Prime has
-- delivered, which `road` already left out.
--
-- Applied as an exact text edit of the live body of
-- 20261116215437_b9_finance_summary_faster_lines (md5 b1e6f7bf5e57fd50485080c2e86c6423),
-- so the rest of the function cannot drift. The full new body is
-- pg_get_functiondef('public.finance_summary_core(uuid,date,date)'::regprocedure).

DO $mig$
DECLARE
  def text := pg_get_functiondef('public.finance_summary_core(uuid,date,date)'::regprocedure);
  old_road text := $old$    SELECT t.id, t.price, t.since
    FROM transit t
    WHERE t.prime_status IS NULL
       OR t.prime_status NOT IN ('FAILED_DELIVER_RETURNED_TO_SENDER', 'DELIVERED', 'PART_DELIVERED', 'DELIVERED_CHANGE_PRICE')
  ),$old$;
  new_road text := $new$    -- An order a confirmed courier payment already paid for is money in, not
    -- money out: the payments card lists it to be marked delivered.
    SELECT t.id, t.price, t.since
    FROM transit t
    WHERE (t.prime_status IS NULL
       OR t.prime_status NOT IN ('FAILED_DELIVER_RETURNED_TO_SENDER', 'DELIVERED', 'PART_DELIVERED', 'DELIVERED_CHANGE_PRICE'))
      AND NOT EXISTS (SELECT 1 FROM public.delivery_import_items i
                        JOIN public.delivery_imports di ON di.id = i.import_id
                       WHERE i.order_id = t.id AND di.tenant_id = _tenant_id
                         AND di.status IN ('confirmed', 'completed'))
  ),$new$;
BEGIN
  IF md5(def) <> 'b1e6f7bf5e57fd50485080c2e86c6423' THEN
    RAISE EXCEPTION 'finance_summary_core is not the expected base (md5 %)', md5(def);
  END IF;
  IF (length(def) - length(replace(def, old_road, ''))) / length(old_road) <> 1 THEN
    RAISE EXCEPTION 'road CTE not found exactly once';
  END IF;
  EXECUTE replace(def, old_road, new_road);
END
$mig$;

REVOKE ALL ON FUNCTION public.finance_summary_core(uuid, date, date) FROM PUBLIC, anon, authenticated;
