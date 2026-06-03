-- =====================================================================
-- 03-post-import: re-enable triggers + recompute derived state
-- =====================================================================
-- Must run AFTER migrate-old-data.ts completes successfully.

-- Re-enable triggers we disabled in 01-pre-import.sql.
ALTER TABLE public.orders ENABLE TRIGGER USER;
ALTER TABLE public.order_status_history ENABLE TRIGGER USER;
ALTER TABLE public.order_notifications ENABLE TRIGGER USER;
ALTER TABLE public.whatsapp_logs ENABLE TRIGGER USER;
ALTER TABLE public.activity_logs ENABLE TRIGGER USER;
ALTER TABLE public.products ENABLE TRIGGER USER;
ALTER TABLE public.customer_trust ENABLE TRIGGER USER;
ALTER TABLE public.qc_quarantine ENABLE TRIGGER USER;
ALTER TABLE public.inventory_ledger ENABLE TRIGGER USER;

-- Rebuild customer_trust from imported orders + blacklist + whitelist.
-- Note: old project's RPC is `calculate_customer_risk(phone)` writing to
-- customer_risk. New project's customer_trust may have a different shape
-- and recompute path. We try the most likely names first; if neither exists,
-- this block does nothing and we surface a warning for manual follow-up.
DO $$
DECLARE
  v_fn text;
  v_phones text[];
  v_phone text;
  v_count int := 0;
BEGIN
  -- Find a per-phone recompute function. Prefer customer_trust_recalc,
  -- fall back to calculate_customer_trust, calculate_customer_risk.
  SELECT p.proname INTO v_fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'recompute_customer_trust',
    'calculate_customer_trust',
    'customer_trust_recalc',
    'calculate_customer_risk'
  )
  ORDER BY array_position(ARRAY[
    'recompute_customer_trust','calculate_customer_trust',
    'customer_trust_recalc','calculate_customer_risk'
  ]::text[], p.proname)
  LIMIT 1;

  IF v_fn IS NULL THEN
    RAISE NOTICE 'NO customer_trust recompute function found in public schema. customer_trust will remain empty for Scheniders Iraq until a recompute path is added.';
  ELSE
    RAISE NOTICE 'Recomputing customer_trust via public.%() per phone…', v_fn;
    SELECT array_agg(DISTINCT phone) INTO v_phones
    FROM public.orders
    WHERE tenant_id='b5c4f2d4-834f-4af4-822d-9b9826a8f45a' AND phone IS NOT NULL;
    FOREACH v_phone IN ARRAY v_phones LOOP
      EXECUTE format('SELECT public.%I(%L)', v_fn, v_phone);
      v_count := v_count + 1;
    END LOOP;
    RAISE NOTICE 'Recomputed customer_trust for % unique phones', v_count;
  END IF;
END $$;

-- Rebuild inventory_ledger from imported orders + products.
DO $$
DECLARE v_fn text;
BEGIN
  SELECT p.proname INTO v_fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'recompute_inventory_for_tenant','recompute_inventory'
  )
  ORDER BY array_position(ARRAY['recompute_inventory_for_tenant','recompute_inventory']::text[], p.proname)
  LIMIT 1;
  IF v_fn IS NULL THEN
    RAISE NOTICE 'NO recompute_inventory function found. inventory_ledger will remain empty for Scheniders Iraq.';
  ELSE
    EXECUTE format('SELECT public.%I()', v_fn);
    RAISE NOTICE 'Recomputed inventory via public.%()', v_fn;
  END IF;
END $$;

-- Refresh customer aggregates materialized view if it exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname='public' AND matviewname='mv_customer_aggregates') THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_customer_aggregates;
    RAISE NOTICE 'Refreshed mv_customer_aggregates';
  END IF;
END $$;

SELECT 'post-import complete' AS status;
