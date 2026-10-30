-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1d — DRAFT config only
-- =====================================================================
-- Spec: docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md
-- §1.3 (guarantee_anchor_id), §1.5, §1.9, D1, D3, D4, D8.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it.
--
-- What it changes in the draft's product page, each base merged with `||`:
--   1. image_gallery e5da8997: layout "stack" (the proof stack), the source
--      pill «تعليقات على إعلاناتنا بتيك توك», scope "store", 3 lead comments
--      (p5, p2, p4 with their doubt + verbatim quote), the legend and its
--      mark picture, heading_style "chapter", and the nine screenshots
--      re-ordered p5, p2, p4, p3, p6, p7, p9, p8, p1 with author, size
--      (measured from the stored files), crop {12, 2} and an alt carrying
--      the full verbatim comment. display / frame / order stay in config
--      (ignored by the stack).
--   2. accordion_richtext 370f9b04: layout "guarantee_card" («كرت الضمان»),
--      eyebrow, title, sub, anchor_id "guarantee", the policy link to
--      /policies/returns, and the four second-person terms (the «شحن فائق
--      السرعة» row is dropped: the promise band states delivery once).
--      call_row is REMOVED (the mid-page «تحب تحچي ويانا؟» card is gone).
--   3. pdp_direct_order aae22169: guarantee_anchor_id "guarantee" (the
--      band's «الشروط» link now has its target) and return_promise_i18n,
--      restated from the same wording as the card's term 3 (unchanged
--      from 1b: option ١, D8).
--
-- Guards, in order, in one transaction:
--   a. no tenant / no product page / one of the three sections missing
--      -> RAISE NOTICE and no write (a fresh database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be e4800d7bb6f80f656cd848d3dbf469d9
--      and store_config_rev must be 38 (the draft after the 1c migration)
--      -> else RAISE EXCEPTION: someone edited or published since, so
--      re-read and regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push`.
--
-- Rollback (read at draft md5 e4800d7bb6f80f656cd848d3dbf469d9): restore
--   image_gallery e5da8997 base =
--     {"frame": "strip", "order": "product_first", "layout": "carousel",
--      "display": "whole", "heading_i18n": {"ar": "كلامهم مو كلامنا", "en":
--      "Their words, not ours"}, "images": [the nine screenshots in the order
--      1ebf499e, cba26e5e, 8f742152, 6bf95f17, 536e8d88, abf3f504, 2f8ae556,
--      13ec2385, 8e208e9b, each {"url": ".../reviews/<id>.jpeg", "alt_i18n":
--      {"ar": "رسالة من زبون N من 9", "en": "Customer message N of 9"}}]}
--     (a typed copy: IRAQ_DRAFT_GALLERY_BASE in
--     packages/sections/src/_pdp-redesign-fixtures.ts);
--   accordion_richtext 370f9b04 base = IRAQ_DRAFT_ACCORDION_BASE in the same
--     file (allow_multiple false, layout "quiet", the four policy rows, and
--     call_row {"prompt_i18n": {"ar": "تحب تحچي ويانا؟", "en": "Rather talk
--     to us?"}, "action_i18n": {"ar": "اتصل", "en": "Call"}});
--   pdp_direct_order aae22169: remove guarantee_anchor_id with `-`
--     (return_promise_i18n is unchanged by this file).
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := 'e4800d7bb6f80f656cd848d3dbf469d9';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  c_gallery_id constant text := 'e5da8997-d564-4260-88f2-a6d73031b4ce';
  c_accordion_id constant text := '370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d';
  -- gallery_patch:begin
  c_gallery_patch constant jsonb := $json${
    "layout": "stack",
    "scope": "store",
    "initial_count": 3,
    "heading_style": "chapter",
    "source_label_i18n": {
      "ar": "تعليقات على إعلاناتنا بتيك توك",
      "en": "Comments on our TikTok ads"
    },
    "legend_i18n": {
      "ar": "هاي العلامة يعني سوّينا لايك للتعليق من حسابنا",
      "en": "This mark means we liked the comment from our account"
    },
    "legend_image_url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/da0471e3-4980-4e4d-80ef-4ea9e75bf2da.png",
    "images": [
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/536e8d88-e55a-49f0-a9b3-305b69cbfbf5.jpeg",
        "alt_i18n": {
          "ar": "تعليق المحامي زياد طارق الحديدي: وصلني العطر فعلاً راقي و اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح عاشت ايدك حبي وان شاءالله بعد منه ورايح عطوري من يمكم",
          "en": "Comment by المحامي زياد طارق الحديدي: وصلني العطر فعلاً راقي و اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح عاشت ايدك حبي وان شاءالله بعد منه ورايح عطوري من يمكم"
        },
        "doubt_i18n": {
          "ar": "خايف يطلع مثل كل إعلان؟",
          "en": "Afraid it's like every ad?"
        },
        "quote_i18n": {
          "ar": "اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح"
        },
        "author": "المحامي زياد طارق الحديدي",
        "width": 828,
        "height": 253,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/cba26e5e-7ad0-4213-b804-d535b7c0d7e6.jpeg",
        "alt_i18n": {
          "ar": "تعليق dy4axauduv7j: كنت متوقع مثل اي اعلان وكنت ناوي بس اشوفه مو مثل ماتفضلت ارجعه واول مره اعلق الشي بي خير امانة الله لا اعرف الناس ولا الي مصلحه يمهم بس نصيحه لاتقيس من اول مترش انتظر ربع ساعه وشوف الفوحان فد شي خيال",
          "en": "Comment by dy4axauduv7j: كنت متوقع مثل اي اعلان وكنت ناوي بس اشوفه مو مثل ماتفضلت ارجعه واول مره اعلق الشي بي خير امانة الله لا اعرف الناس ولا الي مصلحه يمهم بس نصيحه لاتقيس من اول مترش انتظر ربع ساعه وشوف الفوحان فد شي خيال"
        },
        "doubt_i18n": {
          "ar": "أول رشة ما فاحت؟",
          "en": "The first spray didn't carry?"
        },
        "quote_i18n": {
          "ar": "لاتقيس من اول مترش انتظر ربع ساعه"
        },
        "author": "dy4axauduv7j",
        "width": 828,
        "height": 256,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/6bf95f17-026a-400d-9067-08894b88a4a0.jpeg",
        "alt_i18n": {
          "ar": "تعليق Nano: يجنن يجنن صدك ثباتيه وفوحان قوي وما ياذي الجيوب لان اني اعاني من العطور القويه لان جيوبي تتحسس بس هذه ما اذاني",
          "en": "Comment by Nano: يجنن يجنن صدك ثباتيه وفوحان قوي وما ياذي الجيوب لان اني اعاني من العطور القويه لان جيوبي تتحسس بس هذه ما اذاني"
        },
        "doubt_i18n": {
          "ar": "تتحسس من العطور القوية؟",
          "en": "Sensitive to strong perfumes?"
        },
        "quote_i18n": {
          "ar": "ما ياذي الجيوب"
        },
        "author": "Nano",
        "width": 828,
        "height": 202,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/8f742152-1b1a-4d65-a543-331196fc6830.jpeg",
        "alt_i18n": {
          "ar": "تعليق عباس: الصراحة وامنه احجيها العطر راقي البارحة وصلني شكراً جزيلاً ولا عندي معرفه بحظرتك بس شهاده ولازم احجيها فد شي العطر",
          "en": "Comment by عباس: الصراحة وامنه احجيها العطر راقي البارحة وصلني شكراً جزيلاً ولا عندي معرفه بحظرتك بس شهاده ولازم احجيها فد شي العطر"
        },
        "author": "عباس",
        "width": 828,
        "height": 208,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/abf3f504-d358-4888-bd0f-eafd1136d248.jpeg",
        "alt_i18n": {
          "ar": "تعليق سوران البيرو: وصلني اليوم قسما بالله عطر عالمي",
          "en": "Comment by سوران البيرو: وصلني اليوم قسما بالله عطر عالمي"
        },
        "author": "سوران البيرو",
        "width": 828,
        "height": 167,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/2f8ae556-1a0c-4cdb-b4e2-b30c2808755e.jpeg",
        "alt_i18n": {
          "ar": "تعليق Vito93: طبعا وصلي العطر عليه اربعة إرهاب من الفوحان رهيييب العطر",
          "en": "Comment by Vito93: طبعا وصلي العطر عليه اربعة إرهاب من الفوحان رهيييب العطر"
        },
        "author": "Vito93",
        "width": 828,
        "height": 173,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/8e208e9b-b896-430d-839d-44d2a010b588.jpeg",
        "alt_i18n": {
          "ar": "تعليق ALI ALSHEMMARI: اليوم وصلني الله شاهد عطر مرتب مثلك",
          "en": "Comment by ALI ALSHEMMARI: اليوم وصلني الله شاهد عطر مرتب مثلك"
        },
        "author": "ALI ALSHEMMARI",
        "width": 828,
        "height": 160,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/13ec2385-384c-4d1f-af39-793949cce8df.jpeg",
        "alt_i18n": {
          "ar": "تعليق Sagad: فعلا عن تجربه",
          "en": "Comment by Sagad: فعلا عن تجربه"
        },
        "author": "Sagad",
        "width": 828,
        "height": 184,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/1ebf499e-fb7d-4325-a2fe-0b98e8530932.jpeg",
        "alt_i18n": {
          "ar": "تعليق Alpha decorations company: عطر ايخبل والكلام حقيقي اني جربته",
          "en": "Comment by Alpha decorations company: عطر ايخبل والكلام حقيقي اني جربته"
        },
        "author": "Alpha decorations company",
        "is_business": true,
        "width": 828,
        "height": 163,
        "crop": {
          "left": 12,
          "right": 2
        }
      }
    ]
  }$json$;
  -- gallery_patch:end
  -- accordion_patch:begin
  c_accordion_patch constant jsonb := $json${
    "layout": "guarantee_card",
    "heading_i18n": {
      "ar": "كرت الضمان",
      "en": "Guarantee card"
    },
    "eyebrow_i18n": {
      "ar": "ويا كل طلب من شنايدر",
      "en": "With every Scheniders order"
    },
    "sub_i18n": {
      "ar": "حقك مكتوب هنا قبل ما تطلب",
      "en": "Your rights, in writing, before you order"
    },
    "anchor_id": "guarantee",
    "policy_link": {
      "href": "/policies/returns",
      "label_i18n": {
        "ar": "سياسة الإرجاع الكاملة",
        "en": "Full return policy"
      }
    },
    "items": [
      {
        "title_i18n": {
          "ar": "الدفع عند الاستلام",
          "en": "Pay on delivery"
        },
        "body_i18n": {
          "ar": "ما تدفع إلا بعد ما يوصلك العطر وتجرّبه من العيّنة الزجاجية اللي تجيك مجاناً ويا كل طلب.",
          "en": "You pay only after the perfume reaches you and you have tried it from the glass sample that comes free with every order."
        }
      },
      {
        "title_i18n": {
          "ar": "تفحصه والمندوب يمّك",
          "en": "Check it with the courier there"
        },
        "body_i18n": {
          "ar": "تتأكد من الجودة والمواصفات والفوحان والثبات قدّام المندوب. أي اختلاف، ترفضه وترجعلك قيمته كاملة.",
          "en": "Check the quality, the description, the projection and the longevity in front of the courier. Anything different, refuse it and get your money back in full."
        }
      },
      {
        "title_i18n": {
          "ar": "أسبوع تجربة ببيتك",
          "en": "A week's trial at home"
        },
        "body_i18n": {
          "ar": "تستعمل العطر وتخلّيه يمّك أسبوع كامل من يوم الاستلام. إذا ما عجبتك ريحته أو لگيت فرق بالمواصفات، ترجّعه ونرجعلك فلوسه.",
          "en": "Use the perfume and keep it for a full week from delivery. If you don't like the scent or find it differs from the description, return it and we refund you."
        }
      },
      {
        "title_i18n": {
          "ar": "عطور أصلية",
          "en": "Authentic perfumes"
        },
        "body_i18n": {
          "ar": "كل عطورنا مختارة بإيدنا وبعناية من أفخم المصادر العالمية ومن أجود الخامات العطرية. ما نتعامل بالعطور التركية المصنّعة بالجملة ولا الصينية الرديئة.",
          "en": "Every perfume is hand-picked with care from the finest sources in the world and the best aromatic materials. We never deal in bulk-made Turkish or low-grade Chinese perfumes."
        }
      }
    ]
  }$json$;
  -- accordion_patch:end
  -- accordion_remove:begin
  c_accordion_remove constant text[] := ARRAY['call_row'];
  -- accordion_remove:end
  -- pdp_patch:begin
  c_pdp_patch constant jsonb := $json${
    "guarantee_anchor_id": "guarantee",
    "return_promise_i18n": {
      "ar": "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
      "en": "Don't like it? Refuse it in front of the courier, or return it within a week."
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
  v_missing text[];
BEGIN
  SELECT id, store_config_rev, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_rev, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign 1d: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign 1d: % has no product page, nothing written', c_slug;
    RETURN;
  END IF;
  v_sections := v_draft->'pages'->v_page_idx->'sections';

  SELECT array_agg(want) INTO v_missing
    FROM unnest(ARRAY[c_pdp_id, c_gallery_id, c_accordion_id]) AS want
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(v_sections) AS s(sec) WHERE s.sec->>'id' = want
   );
  IF v_missing IS NOT NULL THEN
    RAISE NOTICE 'pdp redesign 1d: product page lacks sections %, nothing written', v_missing;
    RETURN;
  END IF;

  SELECT jsonb_agg(
           CASE x.sec->>'id'
             WHEN c_gallery_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c_gallery_patch)
             WHEN c_accordion_id
               THEN jsonb_set(x.sec, '{base}', (coalesce(x.sec->'base', '{}'::jsonb) || c_accordion_patch) - c_accordion_remove)
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
    RAISE NOTICE 'pdp redesign 1d: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1d: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1d: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1d: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1d: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
