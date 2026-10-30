-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1g — DRAFT config only
-- =====================================================================
-- Merchant request (Ali, 2026-10-30): an «أضف للسلة» button side by side
-- with «ثبّت طلبي»; the WhatsApp tile beside them stays.
-- Plan: docs/superpowers/plans/2026-10-30-pdp-p1g-add-to-cart.md.
-- Stamp: written at 2026-10-30 09:21 UTC, but main already holds the
-- forward-stamped 20261030110000_products_sales_and_permissions.sql, so this
-- file takes the next second to sort after it (and after the remote
-- history's max, 20261030090228).
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it.
--
-- What it changes in the draft, each object merged with `||`:
--   1. pages[product] pdp_direct_order aae22169, base: add_to_cart true
--      (the «أضف للسلة» tile between the WhatsApp tile and «ثبّت طلبي»;
--      it adds the chosen variant and quantity to the cart and never
--      submits the order).
--   2. globals.header site_header 33c6a493, base: show_cart true (the
--      solid header on every other page shows the cart with its count,
--      so a shopper who added on the product page can reach the cart).
--   3. the same header's product-page variant 4c9e2b71, override:
--      overlay_cart true (the floating header over the product photo gets
--      a cart chip beside the menu chip). sticky false and surface
--      "overlay" stay.
--
-- Guards, in order, in one transaction:
--   a. no tenant / no product page / the pdp section, the header or its
--      product variant missing -> RAISE NOTICE and no write (a fresh
--      database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be 56df97c58591dbc66724198b6b02dae8
--      and store_config_rev must be 38 (the draft after the 1f migration)
--      -> else RAISE EXCEPTION: someone edited or published since, so
--      re-read and regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push`.
--
-- Rollback (read at draft md5 56df97c58591dbc66724198b6b02dae8):
--   pdp_direct_order aae22169: remove add_to_cart from the base with `-`;
--   site_header 33c6a493: set base show_cart back to false, and remove
--   overlay_cart from variant 4c9e2b71's override with `-` (the override
--   before this file: {"sticky": false, "surface": "overlay"}).
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := '56df97c58591dbc66724198b6b02dae8';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  c_header_id constant text := '33c6a493-5926-46e1-a45f-929f63fff21f';
  c_header_variant_id constant text := '4c9e2b71-8d3a-4f6e-a1b2-7e5d9c0f3a42';
  -- pdp_patch:begin
  c_pdp_patch constant jsonb := $json${
    "add_to_cart": true
  }$json$;
  -- pdp_patch:end
  -- header_patch:begin
  c_header_patch constant jsonb := $json${
    "show_cart": true
  }$json$;
  -- header_patch:end
  -- header_variant_patch:begin
  c_header_variant_patch constant jsonb := $json${
    "overlay_cart": true
  }$json$;
  -- header_variant_patch:end
  v_tenant_id uuid;
  v_rev bigint;
  v_draft jsonb;
  v_target jsonb;
  v_pub_md5 text;
  v_page_idx int;
  v_sections jsonb;
  v_new_sections jsonb;
  v_header jsonb;
  v_new_variants jsonb;
BEGIN
  SELECT id, store_config_rev, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_rev, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign 1g: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign 1g: % has no product page, nothing written', c_slug;
    RETURN;
  END IF;
  v_sections := v_draft->'pages'->v_page_idx->'sections';

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_sections) AS s(sec) WHERE s.sec->>'id' = c_pdp_id
  ) THEN
    RAISE NOTICE 'pdp redesign 1g: product page lacks section %, nothing written', c_pdp_id;
    RETURN;
  END IF;

  v_header := v_draft->'globals'->'header';
  IF v_header IS NULL OR v_header->>'id' IS DISTINCT FROM c_header_id OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_header->'variants', '[]'::jsonb)) AS v(variant)
     WHERE v.variant->>'id' = c_header_variant_id
  ) THEN
    RAISE NOTICE 'pdp redesign 1g: header % with variant % not found, nothing written', c_header_id, c_header_variant_id;
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

  SELECT jsonb_agg(
           CASE y.variant->>'id'
             WHEN c_header_variant_id
               THEN jsonb_set(y.variant, '{override}', coalesce(y.variant->'override', '{}'::jsonb) || c_header_variant_patch)
             ELSE y.variant
           END
           ORDER BY y.ord
         )
    INTO v_new_variants
    FROM jsonb_array_elements(v_header->'variants') WITH ORDINALITY AS y(variant, ord);

  v_header := jsonb_set(
    jsonb_set(v_header, '{base}', coalesce(v_header->'base', '{}'::jsonb) || c_header_patch),
    '{variants}',
    v_new_variants
  );

  v_target := jsonb_set(
    jsonb_set(v_draft, ARRAY['pages', v_page_idx::text, 'sections'], v_new_sections),
    '{globals,header}',
    v_header
  );

  IF v_target = v_draft THEN
    RAISE NOTICE 'pdp redesign 1g: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1g: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1g: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1g: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1g: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
