-- SEC-D2 remainder — margin data is withheld server-side, not masked in the DOM.
--
-- `v_orders_with_risk` exposed product_cost, net_profit, waseet_merchant_price
-- and waseet_company_price to every authenticated tenant member. The app never
-- selects them, but PostgREST exposes columns, not the app's queries: any member
-- could ask for `select=product_cost` directly. get_dashboard_metrics already
-- decides this server-side (20260906144421); the list path now matches it.
--
-- MEASURED BEFORE APPLYING — this is LATENT, not live:
--   * product_cost, net_profit, waseet_merchant_price and waseet_company_price
--     are NULL on ALL 22,833 orders across every tenant. Nothing leaks today.
--   * But `app/api/waseet/submit-orders/route.ts` WRITES the two waseet_* price
--     columns, so they will start carrying real merchant/company pricing. This
--     shuts the hole before that happens rather than after.
--
-- `price` is deliberately NOT gated. It is what the customer pays, and an
-- employee taking and confirming orders needs it — verified as the operational
-- field it is, not margin. Gating it would be a product decision about whether
-- employees may see order values at all, not a defect fix, and it would blank
-- 4,743 order rows for every employee on the largest tenant. Raised for the
-- product owner instead of decided here.
--
-- Patched in place: the view is 2,918 characters over 76 columns, so it is
-- edited by anchor rather than retyped, with assertions on both sides. Each
-- anchor was verified to occur exactly once before applying.
--
-- DOWN MIGRATION: replace each CASE with the bare column.
DO $mig$
DECLARE
  src         text;
  cols_before int;
  cols_after  int;
  opts_before text;
  opts_after  text;
  anchors     text[] := ARRAY['product_cost', 'net_profit', 'waseet_merchant_price', 'waseet_company_price'];
  a           text;
BEGIN
  SELECT count(*) INTO cols_before FROM pg_attribute
   WHERE attrelid = 'public.v_orders_with_risk'::regclass AND attnum > 0 AND NOT attisdropped;
  SELECT c.reloptions::text INTO opts_before FROM pg_class c
   WHERE c.oid = 'public.v_orders_with_risk'::regclass;

  src := pg_get_viewdef('public.v_orders_with_risk'::regclass, true);

  FOREACH a IN ARRAY anchors LOOP
    IF position('    o.' || a || ',' IN src) = 0 THEN
      RAISE EXCEPTION 'SEC-D2 aborted: projection % not found in the expected form', a;
    END IF;
    src := replace(
      src,
      '    o.' || a || ',',
      '    CASE WHEN public.is_tenant_admin(o.tenant_id) THEN o.' || a || ' END AS ' || a || ','
    );
  END LOOP;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_orders_with_risk WITH (security_invoker = true) AS ' || src;

  SELECT count(*) INTO cols_after FROM pg_attribute
   WHERE attrelid = 'public.v_orders_with_risk'::regclass AND attnum > 0 AND NOT attisdropped;
  SELECT c.reloptions::text INTO opts_after FROM pg_class c
   WHERE c.oid = 'public.v_orders_with_risk'::regclass;

  IF cols_after <> cols_before THEN
    RAISE EXCEPTION 'SEC-D2 aborted: column count changed (% -> %)', cols_before, cols_after;
  END IF;
  IF opts_after IS DISTINCT FROM opts_before THEN
    RAISE EXCEPTION 'SEC-D2 aborted: reloptions changed (% -> %)', opts_before, opts_after;
  END IF;
END
$mig$;
