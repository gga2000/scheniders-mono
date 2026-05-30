-- ============================================================================
-- Tighten nullable tenant_id columns
-- ============================================================================
-- Closes audit finding F-19.
--
-- 12 tables have a nullable `tenant_id` column. RLS policies of the form
-- `tenant_id IN (...)` evaluate to NULL (not FALSE) for rows with NULL
-- tenant_id, so under some planner conditions the row is filtered out
-- AND under other conditions it isn't. Either way, the rows are orphans
-- — they have no owning tenant and don't belong to anyone.
--
--   community_ratings
--   customer_links
--   customer_metadata
--   customer_notes
--   customer_tag_assignments
--   customer_tags
--   customer_trust
--   customer_trust_audit_log
--   customer_voice_notes
--   product_options
--   product_variants
--   qc_quarantine_events
--
-- DRY-RUN PROCEDURE — DO NOT APPLY BLINDLY.
--   1. Run the COUNT queries below as the service role to learn how many
--      rows on each table are orphaned (tenant_id IS NULL).
--   2. For each table where the count > 0, decide per-table:
--        a) BACKFILL — if the row has a foreign key to a tenant-owning
--           parent, derive tenant_id from the parent. Sketch templates
--           in the BACKFILL block below.
--        b) DELETE — if the row is unrecoverable (no clue who owned it).
--        c) ASSIGN — if a single tenant ran the seeding script that
--           produced them, assign to that tenant.
--   3. Only after the backfill is verified zero remaining, uncomment
--      the SET NOT NULL block at the bottom.
--
-- This migration is intentionally inert until you uncomment the action
-- blocks — running it as-is just prints counts via `RAISE NOTICE` in a
-- DO block.
--
-- ROLLBACK
--   ALTER TABLE ... ALTER COLUMN tenant_id DROP NOT NULL;
-- ============================================================================

-- 1. Dry-run counts. Run this whole migration on prod as-is; the DO block
--    emits one NOTICE per table. Inspect the Supabase SQL editor output.

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
    RAISE NOTICE 'tenant_id IS NULL on %.%: % row(s)', 'public', t, n;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. BACKFILL TEMPLATES — uncomment + customise per table.
--    Inspect each table's FK relationships before running. Examples below.
-- ----------------------------------------------------------------------------

-- -- product_variants — derive from owning product.
-- UPDATE public.product_variants pv
-- SET tenant_id = p.tenant_id
-- FROM public.products p
-- WHERE pv.product_id = p.id AND pv.tenant_id IS NULL;

-- -- customer_metadata — no obvious parent; phone is the natural key,
-- -- but the same phone can exist across tenants. Probably safest to
-- -- DELETE rows with NULL tenant_id (they're un-owned anyway).
-- DELETE FROM public.customer_metadata WHERE tenant_id IS NULL;

-- -- customer_notes — same as customer_metadata.
-- DELETE FROM public.customer_notes WHERE tenant_id IS NULL;

-- -- customer_tags — same pattern.
-- DELETE FROM public.customer_tags WHERE tenant_id IS NULL;

-- -- customer_tag_assignments — same pattern; or derive from customer_tags.tag_id.
-- DELETE FROM public.customer_tag_assignments WHERE tenant_id IS NULL;

-- -- product_options — derive from owning product (assumes product_id FK exists).
-- UPDATE public.product_options po
-- SET tenant_id = p.tenant_id
-- FROM public.products p
-- WHERE po.product_id = p.id AND po.tenant_id IS NULL;

-- -- customer_trust / customer_trust_audit_log / community_ratings /
-- -- customer_links / customer_voice_notes — likely no owning FK at all,
-- -- these were filled by global scoring scripts. Either DELETE the NULLs
-- -- or pick a sentinel tenant (a "global" tenant id you create explicitly).

-- -- qc_quarantine_events — derive from qc_quarantine via order_id, or DELETE.
-- DELETE FROM public.qc_quarantine_events WHERE tenant_id IS NULL;

-- ----------------------------------------------------------------------------
-- 3. After all the counts above are zero, uncomment the SET NOT NULLs
--    below and rerun this migration (or run them ad-hoc).
-- ----------------------------------------------------------------------------

-- ALTER TABLE public.community_ratings        ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.customer_links           ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.customer_metadata        ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.customer_notes           ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.customer_tag_assignments ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.customer_tags            ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.customer_trust           ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.customer_trust_audit_log ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.customer_voice_notes     ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.product_options          ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.product_variants         ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE public.qc_quarantine_events     ALTER COLUMN tenant_id SET NOT NULL;
