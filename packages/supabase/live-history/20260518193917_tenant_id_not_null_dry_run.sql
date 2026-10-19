-- Phase 3.6 dry-run: emit NULL tenant_id counts per table.
-- No destructive changes — backfill + SET NOT NULL stays commented out
-- in packages/supabase/migrations/20260518000004_tenant_id_not_null.sql
-- until per-table backfill decisions are made.

DO $$
DECLARE
  t text;
  n bigint;
  tables text[] := ARRAY[
    'community_ratings','customer_links','customer_metadata','customer_notes',
    'customer_tag_assignments','customer_tags','customer_trust',
    'customer_trust_audit_log','customer_voice_notes','product_options',
    'product_variants','qc_quarantine_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE tenant_id IS NULL', t) INTO n;
    RAISE NOTICE 'tenant_id IS NULL on public.%: % row(s)', t, n;
  END LOOP;
END $$;
;
