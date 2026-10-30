-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1i — DRAFT config only
-- =====================================================================
-- Merchant decision (Ali, 2026-10-30): concept A «الكبسولة» / The Espresso
-- Dock for the express PDP's order buttons.
-- Plan: docs/superpowers/plans/2026-10-30-pdp-p1i-dock.md.
-- Stamp: after the last file on origin/main and the live history's max
-- (both 20261030201353, slice 1h), and after the time of writing.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it.
--
-- What it changes in the draft, merged with `||`:
--   pages[product] pdp_direct_order aae22169, base: cta_layout "dock"
--   (the order buttons in one espresso capsule: the yellow «ثبّت طلبي»
--   pill, «أضف للسلة» and WhatsApp segments, and the confirmation drawer
--   after an add; same submit, same cart tap, same WhatsApp link).
--
-- Guards, in order, in one transaction:
--   a. no tenant / no product page / the pdp section missing
--      -> RAISE NOTICE and no write (a fresh database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be d6cac00b09a850d6f2a365d75e065459
--      and store_config_rev must be 38 (the draft after the 1h migration)
--      -> else RAISE EXCEPTION: someone edited or published since, so
--      re-read and regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads this prop is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push`.
--
-- Rollback (read at draft md5 d6cac00b09a850d6f2a365d75e065459):
--   pdp_direct_order aae22169: remove cta_layout from the base with `-`.
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := 'd6cac00b09a850d6f2a365d75e065459';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  -- pdp_patch:begin
  c_pdp_patch constant jsonb := $json${
    "cta_layout": "dock"
  }$json$;
  -- pdp_patch:end
  v_tenant_id uuid;
  v_rev bigint;
  v_draft jsonb;
  v_target jsonb;
  v_pub_md5 text;
  v_page_idx int;
  v_sections jsonb;
  v_new_sections jsonb;
BEGIN
  SELECT id, store_config_rev, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_rev, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign 1i: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign 1i: % has no product page, nothing written', c_slug;
    RETURN;
  END IF;
  v_sections := v_draft->'pages'->v_page_idx->'sections';

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_sections) AS s(sec) WHERE s.sec->>'id' = c_pdp_id
  ) THEN
    RAISE NOTICE 'pdp redesign 1i: product page lacks section %, nothing written', c_pdp_id;
    RETURN;
  END IF;

  SELECT jsonb_agg(
           CASE x.sec->>'id'
             WHEN c_pdp_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c_pdp_patch)
             ELSE x.sec
           END
           ORDER BY x.ord
         )
    INTO v_new_sections
    FROM jsonb_array_elements(v_sections) WITH ORDINALITY AS x(sec, ord);

  v_target := jsonb_set(v_draft, ARRAY['pages', v_page_idx::text, 'sections'], v_new_sections);

  IF v_target = v_draft THEN
    RAISE NOTICE 'pdp redesign 1i: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1i: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1i: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1i: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1i: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
