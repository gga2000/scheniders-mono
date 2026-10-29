-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1c — DRAFT config only
-- =====================================================================
-- Spec: docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md
-- §1.4, §1.9, D1, D9.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it. No product,
-- attribute or description row is written: the lead line and the story
-- rewrite live in scent_card.product_copy until publish day (D9), when
-- packages/supabase/go-live/scheniders-iraq-pdp-redesign.sql moves them
-- into product data and removes product_copy.
--
-- What it changes in the draft: pdp_direct_order aae22169 base, merged
-- with `||`: scent_layout "card" and scent_card (the attribute keys, the
-- quote terms, the «حسب تجربتنا» source tag, Ali's quote pick — eng.
-- سيف's «بخيت منه الصبح لسه الريحة تفوح» — and the Wayfarer lead + story).
-- scent_journey and feature_cards_layout stay in config, ignored in card
-- mode.
--
-- Guards, in order, in one transaction:
--   a. no tenant / no product page / no pdp_direct_order aae22169
--      -> RAISE NOTICE and no write (a fresh database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be 9cd2543a6126057d423f66ff9297cf76
--      and store_config_rev must be 38 (both read 2026-10-30) -> else RAISE
--      EXCEPTION: someone edited or published since, so re-read and
--      regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push`.
--
-- Rollback (read 2026-10-30 at draft md5 9cd2543a6126057d423f66ff9297cf76):
-- scent_layout and scent_card were absent from the pdp_direct_order base;
-- remove both with `-`.
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := '9cd2543a6126057d423f66ff9297cf76';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  -- pdp_patch:begin
  c_pdp_patch constant jsonb := $json${
    "scent_layout": "card",
    "scent_card": {
      "pyramid_key": "notes",
      "chip_keys": ["season", "occasions"],
      "note_key": "longevity_note",
      "meter_keys": ["longevity", "sillage"],
      "lead_key": "scent_lead",
      "quote_terms": ["ثبات", "يثبت", "تفوح", "يفوح"],
      "facts_source_i18n": { "ar": "حسب تجربتنا", "en": "Our own estimate" },
      "quote_picks": [
        {
          "product_id": "5e847790-11a5-439f-bace-c315e0ff1ae8",
          "review_id": "6881921e-d263-4780-8878-762e01904146",
          "text": "بخيت منه الصبح لسه الريحة تفوح"
        }
      ],
      "product_copy": [
        {
          "product_id": "5e847790-11a5-439f-bace-c315e0ff1ae8",
          "lead_i18n": { "ar": "فاكهي بلمسة توابل: يبدي بالتوت والتفاح، ويظل عليك بالباتشولي" },
          "story_i18n": { "ar": "ملك العطور الجديد: ويفر انتنس\n\nشايف شعور من شخص يدخل لمناسبة أو يطب للدوام، وتشوف عطره طاغي ومميز؟ هذا بالضبط اللي راح تحس بيه ويا ويفر: أكثر عطر راح تنسأل عليه من ترشه، وأكثر عطر راح يجيبلك مديح.\n\nإحنا ما نبيعلك مجرد «ريحة حلوة». هذا العطر مصمم للرجل اللي يريد يترك «بصمة» بالمكان اللي يدخله، بثباته وفوحانه اللي يدخل قبلك للمكان ويظل وراك بعد ما تطلع. انسى العطور اللي تختفي ورا 10 دقايق.\n\nشراح تحس من ترشه؟\nأول رشة: التوت الفاخر والتفاح الأخضر. نكهة فاكهية ومنعشة تخطف الانتباه فوراً.\nالقلب: الهيل واللافندر. رزانة وفخامة وهدوء مال رجل واثق من نفسه ويعرف شيريد.\nالقاعدة: الباتشولي الساحر. الريحة اللي تتشبع بملابسك وتخلي الناس تنتبه على عطرك حتى بعد ما تطلع.\n\nأنت تستاهل تكون مميز. لا ترضى بالعادي." }
        }
      ]
    }
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
    RAISE NOTICE 'pdp redesign 1c: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign 1c: % has no product page, nothing written', c_slug;
    RETURN;
  END IF;
  v_sections := v_draft->'pages'->v_page_idx->'sections';

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_sections) AS s(sec) WHERE s.sec->>'id' = c_pdp_id
  ) THEN
    RAISE NOTICE 'pdp redesign 1c: product page lacks pdp_direct_order %, nothing written', c_pdp_id;
    RETURN;
  END IF;

  SELECT jsonb_agg(
           CASE
             WHEN x.sec->>'id' = c_pdp_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c_pdp_patch)
             ELSE x.sec
           END
           ORDER BY x.ord
         )
    INTO v_new_sections
    FROM jsonb_array_elements(v_sections) WITH ORDINALITY AS x(sec, ord);

  v_target := jsonb_set(v_draft, ARRAY['pages', v_page_idx::text, 'sections'], v_new_sections);

  IF v_target = v_draft THEN
    RAISE NOTICE 'pdp redesign 1c: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1c: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1c: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1c: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1c: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
