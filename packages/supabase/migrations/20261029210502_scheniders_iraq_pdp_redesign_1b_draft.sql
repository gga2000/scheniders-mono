-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1b — DRAFT config only
-- =====================================================================
-- Spec: docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md
-- §1.2, §1.3, §1.9, D1, D5, D7, D15, D17.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it.
--
-- What it changes in the draft:
--   1. pdp_direct_order aae22169 base, merged with `||`:
--      promise_layout "band", color_lock true, payment_tag "statement",
--      show_whatsapp false, heading_style "chapter", return_promise_i18n
--      (D8), reassurance_i18n.ar «تفتح وتجرّب قبل لا تدفع — والتيستر هدية
--      وياه» (en kept), delivery_sla_i18n.ar with Latin 24 (D5, en kept).
--      identity_rating and guarantee_anchor_id are NOT written here: their
--      targets (#reviews-summary, slice 1e; the guarantee card's anchor,
--      slice 1d) do not exist yet, so the links would be dead in draft view.
--   2. product_grid acb81db0 enabled false (D17).
--   3. Product page section order (D1): pdp, image_gallery, product_reviews,
--      accordion_richtext, faq_contact_split, product_grid, trust_badge_row,
--      sticky_cta_bar. An id not in the list keeps its relative order after
--      the listed ones. The array length is asserted unchanged.
--   4. commerce.contact merged with whatsapp_confirm false (D7) and
--      name_i18n {ar شنايدر, en Scheniders, ku شنایدەر} (D15).
--
-- Guards, in order, in one transaction:
--   a. no tenant / no product page / a listed section id missing
--      -> RAISE NOTICE and no write (a fresh database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be f62c823bf8e3205266a73a0e33b6a2d7
--      and store_config_rev must be 38 (both read 2026-10-29) -> else RAISE
--      EXCEPTION: someone edited or published since, so re-read and
--      regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push` (hand-applied migrations without a
-- schema_migrations row would replay).
--
-- Rollback (the values this overwrites, read 2026-10-29 at draft md5
-- f62c823bf8e3205266a73a0e33b6a2d7):
--   pdp_direct_order base: reassurance_i18n =
--     {"ar": "تفتح وتجرب قبل ما تدفع، والتيستر هدية وياه", "en": "Open it and try it before you pay. Tester included."}
--   delivery_sla_i18n =
--     {"ar": "أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب", "en": "Most orders arrive within 24 hours of confirmation"}
--   show_whatsapp = true; promise_layout, color_lock, payment_tag,
--   heading_style and return_promise_i18n were absent (remove them with `-`).
--   product_grid enabled = true.
--   Section order: aae22169 (pdp_direct_order), 370f9b04 (accordion_richtext),
--   f9ee64be (trust_badge_row), e5da8997 (image_gallery), 1ab3ee76
--   (product_reviews), 8354d117 (faq_contact_split), acb81db0 (product_grid),
--   d874d9d6 (sticky_cta_bar).
--   commerce.contact = {"call_number": "07779703832", "whatsapp_confirm": true}
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := 'f62c823bf8e3205266a73a0e33b6a2d7';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  c_grid_id constant text := 'acb81db0-60f4-4dba-b39c-45cf5f749fce';
  c_order constant text[] := ARRAY[
    'aae22169-cef4-4495-842b-863a7caa71c2', -- pdp_direct_order
    'e5da8997-d564-4260-88f2-a6d73031b4ce', -- image_gallery
    '1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc', -- product_reviews
    '370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d', -- accordion_richtext
    '8354d117-ed8d-4a3e-9bea-8ed6fd8b1023', -- faq_contact_split
    'acb81db0-60f4-4dba-b39c-45cf5f749fce', -- product_grid
    'f9ee64be-823a-4102-bcf3-af74f4bca8b7', -- trust_badge_row
    'd874d9d6-dede-40e5-bcf8-aceb51d11036'  -- sticky_cta_bar
  ];
  -- pdp_patch:begin
  c_pdp_patch constant jsonb := $json${
    "promise_layout": "band",
    "color_lock": true,
    "payment_tag": "statement",
    "show_whatsapp": false,
    "heading_style": "chapter",
    "reassurance_i18n": {
      "ar": "تفتح وتجرّب قبل لا تدفع — والتيستر هدية وياه",
      "en": "Open it and try it before you pay. Tester included."
    },
    "return_promise_i18n": {
      "ar": "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
      "en": "Don't like it? Refuse it in front of the courier, or return it within a week."
    },
    "delivery_sla_i18n": {
      "ar": "أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب",
      "en": "Most orders arrive within 24 hours of confirmation"
    }
  }$json$;
  -- pdp_patch:end
  -- contact_patch:begin
  c_contact_patch constant jsonb := $json${
    "whatsapp_confirm": false,
    "name_i18n": { "ar": "شنايدر", "en": "Scheniders", "ku": "شنایدەر" }
  }$json$;
  -- contact_patch:end
  v_tenant_id uuid;
  v_rev bigint;
  v_draft jsonb;
  v_target jsonb;
  v_pub_md5 text;
  v_page_idx int;
  v_sections jsonb;
  v_new_sections jsonb;
  v_missing text[];
BEGIN
  SELECT id, store_config_rev, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_rev, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign 1b: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign 1b: % has no product page, nothing written', c_slug;
    RETURN;
  END IF;
  v_sections := v_draft->'pages'->v_page_idx->'sections';

  SELECT array_agg(want) INTO v_missing
    FROM unnest(c_order) AS want
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(v_sections) AS s(sec) WHERE s.sec->>'id' = want
   );
  IF v_missing IS NOT NULL THEN
    RAISE NOTICE 'pdp redesign 1b: product page lacks sections %, nothing written', v_missing;
    RETURN;
  END IF;

  SELECT jsonb_agg(
           CASE
             WHEN x.sec->>'id' = c_pdp_id
               THEN jsonb_set(x.sec, '{base}', (x.sec->'base') || c_pdp_patch)
             WHEN x.sec->>'id' = c_grid_id
               THEN jsonb_set(x.sec, '{enabled}', 'false'::jsonb)
             ELSE x.sec
           END
           ORDER BY coalesce(array_position(c_order, x.sec->>'id'), cardinality(c_order) + 1), x.ord
         )
    INTO v_new_sections
    FROM jsonb_array_elements(v_sections) WITH ORDINALITY AS x(sec, ord);
  IF jsonb_array_length(v_new_sections) <> jsonb_array_length(v_sections) THEN
    RAISE EXCEPTION 'pdp redesign 1b: section count changed (% -> %)',
      jsonb_array_length(v_sections), jsonb_array_length(v_new_sections);
  END IF;

  v_target := jsonb_set(v_draft, ARRAY['pages', v_page_idx::text, 'sections'], v_new_sections);
  v_target := jsonb_set(
    v_target,
    '{commerce,contact}',
    coalesce(v_target->'commerce'->'contact', '{}'::jsonb) || c_contact_patch
  );

  IF v_target = v_draft THEN
    RAISE NOTICE 'pdp redesign 1b: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1b: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1b: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1b: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1b: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
