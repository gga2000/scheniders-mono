-- =====================================================================
-- scheniders-iraq PDP redesign — PUBLISH-DAY data change (NOT a migration)
-- =====================================================================
-- Spec: docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md
-- §1.9 "Publish-day data change", D9.
--
-- This file lives in packages/supabase/go-live/, outside migrations/, so no
-- `db push`, migration run or live-history mirror ever sees it. On go-live
-- day, and only then, the operator:
--   1. copies it to packages/supabase/migrations/
--      <YYYYMMDDHHMMSS>_scheniders_iraq_pdp_redesign_golive.sql, stamped
--      with the UTC moment of the copy;
--   2. applies it: supabase db query --linked -f <that file>, then
--      supabase migration repair --status applied <YYYYMMDDHHMMSS>;
--   3. deletes this go-live/ copy in the same commit;
--   4. tells Ali, who publishes right after.
-- Between steps 2 and 4 the classic published page shows the new
-- description; the two run back to back and the text is the approved one.
--
-- What it does, in ONE transaction (a DO block), for ويفر انتنس
-- (products.id 5e847790-11a5-439f-bace-c315e0ff1ae8) only:
--   a. products.description <- the story from the draft's
--      pdp_direct_order.scent_card.product_copy (the approved rewrite);
--   b. products.short_description <- «خصم 24٪ وتوصيل مجاني لكل المحافظات»;
--   c. products.feature_cards: emoji kept, two body typos fixed
--      («هلعطر» -> «هالعطر» in card 1, «اللافندراللي» -> «اللافندر اللي»
--      in card 3);
--   d. the `scent_lead` attribute definition (text, not filterable, not
--      comparable, display_order 7; ON CONFLICT DO NOTHING) and Wayfarer's
--      value from product_copy's lead. /search indexes it from now on, which
--      is intended once the page is live;
--   e. scent_card.product_copy is removed from the DRAFT pdp_direct_order
--      base, so the sheet reads products.description and the lead reads the
--      attribute: each text has one home, and later merchant edits reach
--      the page. store_config_v2 (published) is never written.
--
-- Guards (a merchant edit is never overwritten; any mismatch aborts the
-- whole change and nothing is written):
--   - no tenant / no product / no product page / no pdp section -> NOTICE,
--     no write (a fresh database is a no-op);
--   - everything already in its final state -> NOTICE 'already applied';
--   - md5 of the CURRENT value of each thing it changes must equal the value
--     read on 2026-10-30: description b413b9c23c5d01b0648e340be1c3230e,
--     short_description c39e46bd0a06c831fad6a608aef973ea, feature_cards
--     41f819bd74ab6e3a682284bb78cf8825, scent_card.product_copy
--     523744df04f3acb3e6983ddb422d3266 (as written by the 1c draft
--     migration); Wayfarer has no scent_lead value yet;
--   - md5(store_config_v2::text) is equal before and after.
-- The whole-draft md5 is NOT a guard here: slices 1d-1f change the draft
-- after this file is written, and only product_copy is touched.
--
-- Rollback (values read 2026-10-30): restore description, short_description
-- and feature_cards from the md5s above (copies in
-- packages/sections/src/_pdp-wayfer-fixtures.ts: WAYFER_DESCRIPTION,
-- WAYFER_FEATURE_CARDS, short «خصم 24٪ وتوصيل سريع لأول 100 زبون فقط»),
-- delete the Wayfarer scent_lead value and (if no other product uses it)
-- the def, and re-add product_copy from the 1c draft migration's pdp_patch.
-- =====================================================================

DO $golive$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_product_id constant uuid := '5e847790-11a5-439f-bace-c315e0ff1ae8';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  c_old_description_md5 constant text := 'b413b9c23c5d01b0648e340be1c3230e';
  c_new_description_md5 constant text := '44b36c7d7d7b6a4662fb7183c930cd05';
  c_old_short_md5 constant text := 'c39e46bd0a06c831fad6a608aef973ea';
  c_new_short constant text := 'خصم 24٪ وتوصيل مجاني لكل المحافظات';
  c_old_cards_md5 constant text := '41f819bd74ab6e3a682284bb78cf8825';
  c_new_cards_md5 constant text := 'f06534a8d22d8d829f8abd4e9a1ce23e';
  c_product_copy_md5 constant text := '523744df04f3acb3e6983ddb422d3266';
  c_lead_def_name constant jsonb := '{"ar": "الريحة بسطر", "en": "The scent in one line"}';
  v_tenant_id uuid;
  v_pub_md5 text;
  v_draft jsonb;
  v_description text;
  v_short text;
  v_cards jsonb;
  v_new_cards jsonb;
  v_page_idx int;
  v_sec_idx int;
  v_copy jsonb;
  v_entry jsonb;
  v_story text;
  v_lead text;
  v_def_id uuid;
  v_has_lead boolean;
BEGIN
  SELECT id, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign go-live: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT description, short_description, feature_cards
    INTO v_description, v_short, v_cards
    FROM public.products
   WHERE id = c_product_id AND tenant_id = v_tenant_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE NOTICE 'pdp redesign go-live: no Wayfarer product for %, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NOT NULL THEN
    SELECT (s.ord - 1)::int INTO v_sec_idx
      FROM jsonb_array_elements(v_draft->'pages'->v_page_idx->'sections') WITH ORDINALITY AS s(sec, ord)
     WHERE s.sec->>'id' = c_pdp_id;
  END IF;
  IF v_page_idx IS NULL OR v_sec_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign go-live: no draft pdp_direct_order %, nothing written', c_pdp_id;
    RETURN;
  END IF;
  v_copy := v_draft->'pages'->v_page_idx->'sections'->v_sec_idx->'base'->'scent_card'->'product_copy';

  SELECT EXISTS (
    SELECT 1
      FROM public.product_attribute_values v
      JOIN public.product_attribute_defs d ON d.id = v.attribute_def_id
     WHERE v.product_id = c_product_id AND d.tenant_id = v_tenant_id AND d.key = 'scent_lead'
  ) INTO v_has_lead;

  IF v_copy IS NULL
     AND md5(v_description) = c_new_description_md5
     AND md5(v_short) = md5(c_new_short)
     AND md5(v_cards::text) = c_new_cards_md5
     AND v_has_lead THEN
    RAISE NOTICE 'pdp redesign go-live: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_copy::text) IS DISTINCT FROM c_product_copy_md5 THEN
    RAISE EXCEPTION 'pdp redesign go-live: draft scent_card.product_copy md5 is %, expected % (1c draft not applied, or edited)',
      md5(v_copy::text), c_product_copy_md5;
  END IF;
  IF md5(v_description) IS DISTINCT FROM c_old_description_md5 THEN
    RAISE EXCEPTION 'pdp redesign go-live: Wayfarer description md5 is %, expected % (edited since it was read)',
      md5(v_description), c_old_description_md5;
  END IF;
  IF md5(v_short) IS DISTINCT FROM c_old_short_md5 THEN
    RAISE EXCEPTION 'pdp redesign go-live: Wayfarer short_description md5 is %, expected % (edited since it was read)',
      md5(v_short), c_old_short_md5;
  END IF;
  IF md5(v_cards::text) IS DISTINCT FROM c_old_cards_md5 THEN
    RAISE EXCEPTION 'pdp redesign go-live: Wayfarer feature_cards md5 is %, expected % (edited since it was read)',
      md5(v_cards::text), c_old_cards_md5;
  END IF;
  IF v_has_lead THEN
    RAISE EXCEPTION 'pdp redesign go-live: Wayfarer already has a scent_lead value (set by the merchant?)';
  END IF;

  SELECT e INTO v_entry
    FROM jsonb_array_elements(v_copy) AS x(e)
   WHERE e->>'product_id' = c_product_id::text;
  v_story := v_entry->'story_i18n'->>'ar';
  v_lead := v_entry->'lead_i18n'->>'ar';
  IF md5(v_story) IS DISTINCT FROM c_new_description_md5 OR coalesce(btrim(v_lead), '') = '' THEN
    RAISE EXCEPTION 'pdp redesign go-live: product_copy has no approved story/lead for Wayfarer';
  END IF;

  -- d. the scent_lead definition and Wayfarer's value.
  INSERT INTO public.product_attribute_defs
    (tenant_id, key, name_i18n, kind, is_filterable, is_comparable, display_order)
  VALUES (v_tenant_id, 'scent_lead', c_lead_def_name, 'text', false, false, 7)
  ON CONFLICT (tenant_id, key) DO NOTHING;
  SELECT id INTO v_def_id
    FROM public.product_attribute_defs
   WHERE tenant_id = v_tenant_id AND key = 'scent_lead' AND kind = 'text';
  IF v_def_id IS NULL THEN
    RAISE EXCEPTION 'pdp redesign go-live: scent_lead exists with a kind other than text';
  END IF;
  INSERT INTO public.product_attribute_values (product_id, attribute_def_id, tenant_id, value)
  VALUES (c_product_id, v_def_id, v_tenant_id, jsonb_build_object('ar', v_lead));

  -- a-c. the product row.
  SELECT jsonb_agg(
           CASE x.ord
             WHEN 1 THEN jsonb_set(x.c, '{body}', to_jsonb(replace(x.c->>'body', 'هلعطر', 'هالعطر')))
             WHEN 3 THEN jsonb_set(x.c, '{body}', to_jsonb(replace(x.c->>'body', 'اللافندراللي', 'اللافندر اللي')))
             ELSE x.c
           END
           ORDER BY x.ord
         )
    INTO v_new_cards
    FROM jsonb_array_elements(v_cards) WITH ORDINALITY AS x(c, ord);
  IF md5(v_new_cards::text) <> c_new_cards_md5 THEN
    RAISE EXCEPTION 'pdp redesign go-live: fixed feature_cards md5 is %, expected %',
      md5(v_new_cards::text), c_new_cards_md5;
  END IF;

  UPDATE public.products
     SET description = v_story,
         short_description = c_new_short,
         feature_cards = v_new_cards,
         updated_at = now()
   WHERE id = c_product_id AND tenant_id = v_tenant_id;

  -- e. product_copy out of the draft.
  UPDATE public.tenants
     SET store_config_v2_draft = jsonb_set(
           v_draft,
           ARRAY['pages', v_page_idx::text, 'sections', v_sec_idx::text, 'base', 'scent_card'],
           (v_draft->'pages'->v_page_idx->'sections'->v_sec_idx->'base'->'scent_card') - 'product_copy'
         ),
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign go-live: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign go-live: Wayfarer description, short description, note cards and scent_lead written; product_copy removed from the draft';
END
$golive$;
