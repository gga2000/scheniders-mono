-- ═══════════════════════════════════════════════════════════════════
-- products.feature_cards — per-product feature/note cards
-- ═══════════════════════════════════════════════════════════════════
-- The migrated funnel PDPs carry a per-product "what makes this scent
-- special" card section (image + title + body per fragrance note).
-- Product pages share one section stack across all products, so
-- per-product marketing blocks must be DATA on the product row — the
-- same pattern as short_description (promo notice chips).
-- Shape: [{ image_url?: string, title: string, body: string }, ...]

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS feature_cards jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.products.feature_cards IS
  'Ordered per-product feature cards [{image_url?, title, body}] rendered on the funnel PDP (e.g. fragrance-note highlights). Public catalog data — anon-readable.';

-- Mirror the anon column-lockdown whitelist (public catalog data).
GRANT SELECT (feature_cards) ON public.products TO anon;

NOTIFY pgrst, 'reload schema';;
