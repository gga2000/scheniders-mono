-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1f — DRAFT config only
-- =====================================================================
-- Spec: docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md
-- §1.8, §1.9, D4, D6, D14.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it.
--
-- What it changes in the draft's product page, each base merged with `||`:
--   1. sticky_cta_bar d874d9d6: primary_kind "form_aware" (the bar follows
--      the express form: «اطلب الآن» → the first empty field; «كمّل طلبك /
--      باقي …» → the first missing field; «ثبّت طلبي» → the receipt and the
--      submit's focus, never a submit, D6), style "soft" (the express
--      buttons' look, no ink outline), secondary_display "icon" (a 52px
--      WhatsApp square that opens the chat with «هلا، أريد أطلب {product}»).
--      hide_while "form" and show_product_price stay.
--   2. pdp_direct_order aae22169: show_whatsapp true (Ali, 2026-10-30: the
--      WhatsApp tile comes back beside «ثبّت طلبي»; slice 1b had switched it
--      off). The tile is green, never yellow, with or without color_lock.
--
-- Guards, in order, in one transaction:
--   a. no tenant / no product page / one of the two sections missing
--      -> RAISE NOTICE and no write (a fresh database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be 89b6499d703c80771a38ef7195a5bc78
--      and store_config_rev must be 38 (the draft after the 1e migration)
--      -> else RAISE EXCEPTION: someone edited or published since, so
--      re-read and regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push`.
--
-- Rollback (read at draft md5 89b6499d703c80771a38ef7195a5bc78):
--   sticky_cta_bar d874d9d6: in the base set primary_kind back to
--   "scroll_to_form" and remove style and secondary_display with `-`. The
--   base before this file (base md5 08921c992d5563e08afa97c093735301):
--     {"hide_while": "form", "show_total": false, "primary_href":
--      "/checkout", "primary_kind": "scroll_to_form", "secondary_kind":
--      "whatsapp", "show_product_price": true, "primary_label_i18n": {"ar":
--      "اطلب الآن", "en": "Order now"}, "secondary_label_i18n": {"ar":
--      "واتساب", "en": "WhatsApp"}} (IRAQ_DRAFT_STICKY_PROPS in
--     packages/sections/src/_pdp-fixtures.ts);
--   pdp_direct_order aae22169: set show_whatsapp back to false (slice 1b's
--   value).
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := '89b6499d703c80771a38ef7195a5bc78';
  c_sticky_id constant text := 'd874d9d6-dede-40e5-bcf8-aceb51d11036';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  -- sticky_patch:begin
  c_sticky_patch constant jsonb := $json${
    "primary_kind": "form_aware",
    "style": "soft",
    "secondary_display": "icon"
  }$json$;
  -- sticky_patch:end
  -- pdp_patch:begin
  c_pdp_patch constant jsonb := $json${
    "show_whatsapp": true
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
  v_missing text[];
BEGIN
  SELECT id, store_config_rev, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_rev, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign 1f: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign 1f: % has no product page, nothing written', c_slug;
    RETURN;
  END IF;
  v_sections := v_draft->'pages'->v_page_idx->'sections';

  SELECT array_agg(want) INTO v_missing
    FROM unnest(ARRAY[c_sticky_id, c_pdp_id]) AS want
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(v_sections) AS s(sec) WHERE s.sec->>'id' = want
   );
  IF v_missing IS NOT NULL THEN
    RAISE NOTICE 'pdp redesign 1f: product page lacks sections %, nothing written', v_missing;
    RETURN;
  END IF;

  SELECT jsonb_agg(
           CASE x.sec->>'id'
             WHEN c_sticky_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c_sticky_patch)
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
    RAISE NOTICE 'pdp redesign 1f: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1f: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1f: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1f: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1f: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
