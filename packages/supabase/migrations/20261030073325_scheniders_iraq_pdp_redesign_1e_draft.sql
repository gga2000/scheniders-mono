-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1e — DRAFT config only
-- =====================================================================
-- Spec: docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md
-- §1.2 (identity_rating), §1.6, §1.7, §1.9, D1, D4, D10, D14, D15.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it.
--
-- What it changes in the draft's product page, each base merged with `||`:
--   1. product_reviews 1ab3ee76: layout "highlights" (summary card
--      #reviews-summary, word buttons, D10 order), the heading «شنو گالوا
--      اللي جرّبوه», form_entry "hash_only", visible_count 3,
--      heading_style "chapter", four theme_words (الثبات / التيستر / فخامة /
--      العلبة والتغليف) and review_curation: one key phrase per approved
--      Wayfarer review (no rank, no reply: Ali writes the reply, to-do 1).
--   2. faq_contact_split 8354d117: product_faq («شكد يثبت؟» → attribute
--      longevity_note, «شكد حجم القنينة؟» → size_ml; hidden until 2
--      answer), contact_style "row", heading_style "chapter", and
--      `contact` restated whole with the new title/sub (icon, CTA label
--      and number unchanged). items stay in config and no longer render.
--   3. pdp_direct_order aae22169: identity_rating "summary_link" (the
--      identity row's rating and the scent card footer link to
--      #reviews-summary, which exists from this slice on).
--
-- Guards, in order, in one transaction:
--   a. no tenant / no product page / one of the three sections missing
--      -> RAISE NOTICE and no write (a fresh database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be 8d0e6032304d56057abfecbb4487b95b
--      and store_config_rev must be 38 (the draft after the 1d migration)
--      -> else RAISE EXCEPTION: someone edited or published since, so
--      re-read and regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push`.
--
-- Rollback (read at draft md5 8d0e6032304d56057abfecbb4487b95b): restore
--   product_reviews 1ab3ee76 base =
--     {"layout": "quiet", "show_form": true, "heading_i18n": {"ar": "آراء
--      العملاء", "en": "Customer reviews"}} (IRAQ_DRAFT_REVIEWS_BASE in
--     packages/sections/src/_pdp-redesign-fixtures.ts);
--   faq_contact_split 8354d117 base = IRAQ_DRAFT_FAQ_BASE in the same file
--     (compact true, the four store questions, contact title «عندك
--     استفسار؟», sub «نورونا على الواتساب وسولفوا ويانا»);
--   pdp_direct_order aae22169: remove identity_rating with `-`.
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := '8d0e6032304d56057abfecbb4487b95b';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  c_reviews_id constant text := '1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc';
  c_faq_id constant text := '8354d117-ed8d-4a3e-9bea-8ed6fd8b1023';
  -- reviews_patch:begin
  c_reviews_patch constant jsonb := $json${
    "layout": "highlights",
    "heading_i18n": {
      "ar": "شنو گالوا اللي جرّبوه",
      "en": "What people who tried it said"
    },
    "form_entry": "hash_only",
    "visible_count": 3,
    "heading_style": "chapter",
    "theme_words": [
      {
        "key": "longevity",
        "label_i18n": {
          "ar": "الثبات",
          "en": "Longevity"
        },
        "match_terms": [
          "ثبات"
        ]
      },
      {
        "key": "tester",
        "label_i18n": {
          "ar": "التيستر",
          "en": "The tester"
        },
        "match_terms": [
          "تيستر"
        ]
      },
      {
        "key": "luxury",
        "label_i18n": {
          "ar": "فخامة",
          "en": "Luxury"
        },
        "match_terms": [
          "فخم"
        ]
      },
      {
        "key": "packaging",
        "label_i18n": {
          "ar": "العلبة والتغليف",
          "en": "Box and packaging"
        },
        "match_terms": [
          "تغليف",
          "علبه"
        ]
      }
    ],
    "review_curation": [
      {
        "review_id": "d7c511e8-f208-4956-b7e2-a9a8f85be05e",
        "highlight": "بس وصلتني العلبة مرتبة والتيستر فكرة تخبل"
      },
      {
        "review_id": "fcd04048-2a8c-4377-a5c3-2e7f7c20b628",
        "highlight": "هذا ثاني عطر اطلبه منهم"
      },
      {
        "review_id": "b4f6b842-2e63-465b-8d11-3dc15039ed68",
        "highlight": "العطر صدمني بثباته"
      },
      {
        "review_id": "6881921e-d263-4780-8878-762e01904146",
        "highlight": "كله اشتري عطور بمية ومية وخمسين بس ممحصل منهم بكد ثبات هذا الويفر"
      },
      {
        "review_id": "aeb344f2-8597-45f7-b639-99973d6f1a6f",
        "highlight": "اشتريته وخليته بالسيارة بنفس اليوم قطوه مني"
      },
      {
        "review_id": "cd25b071-10d9-4de5-a324-ea6a0793559b",
        "highlight": "العطر كلش راقي وثباته يطول يوم كامل على الملابس"
      }
    ]
  }$json$;
  -- reviews_patch:end
  -- faq_patch:begin
  c_faq_patch constant jsonb := $json${
    "product_faq": {
      "title_i18n": {
        "ar": "أسئلة قبل لا تطلب",
        "en": "Before you order"
      },
      "items": [
        {
          "q_i18n": {
            "ar": "شكد يثبت؟",
            "en": "How long does it last?"
          },
          "answer": {
            "kind": "attribute",
            "key": "longevity_note"
          }
        },
        {
          "q_i18n": {
            "ar": "شكد حجم القنينة؟",
            "en": "How big is the bottle?"
          },
          "answer": {
            "kind": "size_ml"
          }
        }
      ]
    },
    "contact_style": "row",
    "heading_style": "chapter",
    "contact": {
      "icon_url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/66a2314b-371e-4474-ad0d-53a4cad055f9.svg",
      "sub_i18n": {
        "ar": "نفس الرقم للاتصال والواتساب",
        "en": "Same number for calls and WhatsApp"
      },
      "title_i18n": {
        "ar": "محتار بالريحة؟ نوصفلك ياها",
        "en": "Not sure about the scent? We'll describe it"
      },
      "cta_label_i18n": {
        "ar": "واتساب",
        "en": "WhatsApp"
      },
      "whatsapp_number": ""
    }
  }$json$;
  -- faq_patch:end
  -- pdp_patch:begin
  c_pdp_patch constant jsonb := $json${
    "identity_rating": "summary_link"
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
    RAISE NOTICE 'pdp redesign 1e: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign 1e: % has no product page, nothing written', c_slug;
    RETURN;
  END IF;
  v_sections := v_draft->'pages'->v_page_idx->'sections';

  SELECT array_agg(want) INTO v_missing
    FROM unnest(ARRAY[c_pdp_id, c_reviews_id, c_faq_id]) AS want
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(v_sections) AS s(sec) WHERE s.sec->>'id' = want
   );
  IF v_missing IS NOT NULL THEN
    RAISE NOTICE 'pdp redesign 1e: product page lacks sections %, nothing written', v_missing;
    RETURN;
  END IF;

  SELECT jsonb_agg(
           CASE x.sec->>'id'
             WHEN c_reviews_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c_reviews_patch)
             WHEN c_faq_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c_faq_patch)
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
    RAISE NOTICE 'pdp redesign 1e: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1e: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1e: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1e: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1e: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
