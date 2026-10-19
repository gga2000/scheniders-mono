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
$mig$;;
