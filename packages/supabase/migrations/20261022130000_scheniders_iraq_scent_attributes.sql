-- =====================================================================
-- scheniders-iraq — scent attributes the express «رحلة العطر» reads
-- =====================================================================
-- Tenant data, not schema. Adds two attribute definitions for
-- scheniders-iraq and fills values copied from each product's OWN
-- description. Only connectors (و / وية / مع / +) and leading ل / ب are
-- removed; nothing is paraphrased. A product whose description does not
-- state a fact gets no value.
--
--   occasions (group_list, one group "fits"): the line under «وين تحطه؟»
--     of the 26 structured descriptions, plus Perseviron's
--     «مثالي الأجواء الصيف والدوام والمناسبات».
--   longevity_note (text): only where the description states staying power
--     in plain words (5 products). Hype («ثبات مرعب», «ثباتية مرعبة») is
--     left out on purpose.
--   notes (existing group_list): added for Perseviron, Pistachio, Wefer and
--     Envoy, whose descriptions state their tiers but who carry no value.
--     Fusion's value is replaced: it is a 2026-09-09 test seed that
--     contradicts both its description and its own note cards; the UPDATE
--     fires only on that exact seed value.
--   season (existing enum): Perseviron only («الأجواء الصيف» → summer).
--
-- Never overwrites a merchant edit (ON CONFLICT DO NOTHING; the one UPDATE
-- is guarded on the exact old value). A no-op on any database without
-- scheniders-iraq. RLS unchanged: both tables keep tenant_isolation_all +
-- public_storefront_read, and trg_product_attribute_values_tenant_guard
-- re-derives tenant_id from the product.
-- Rollback: docs/superpowers/plans/2026-10-22-pdp-lower-scent.md, Task 7.
-- =====================================================================

DO $$
DECLARE
  v_tenant uuid;
  v_notes  uuid;
  v_season uuid;
  v_occ    uuid;
  v_note   uuid;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'scheniders-iraq';
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_notes FROM public.product_attribute_defs
   WHERE tenant_id = v_tenant AND key = 'notes' AND kind = 'group_list';
  SELECT id INTO v_season FROM public.product_attribute_defs
   WHERE tenant_id = v_tenant AND key = 'season' AND kind = 'enum';
  IF v_notes IS NULL OR v_season IS NULL THEN
    RAISE EXCEPTION 'scheniders-iraq has no notes/season attribute definitions';
  END IF;

  INSERT INTO public.product_attribute_defs
    (tenant_id, key, name_i18n, kind, group_keys, is_filterable, is_comparable, display_order)
  VALUES
    (v_tenant, 'occasions',
     '{"ar":"وين تحطه؟","en":"Where to wear it"}'::jsonb,
     'group_list',
     '[{"key":"fits","label_i18n":{"ar":"يناسب","en":"Good for"}}]'::jsonb,
     false, false, 5)
  ON CONFLICT (tenant_id, key) DO NOTHING;

  INSERT INTO public.product_attribute_defs
    (tenant_id, key, name_i18n, kind, is_filterable, is_comparable, display_order)
  VALUES
    (v_tenant, 'longevity_note',
     '{"ar":"وصف الثبات","en":"Staying power, in words"}'::jsonb,
     'text', false, false, 6)
  ON CONFLICT (tenant_id, key) DO NOTHING;

  SELECT id INTO v_occ FROM public.product_attribute_defs
   WHERE tenant_id = v_tenant AND key = 'occasions' AND kind = 'group_list';
  SELECT id INTO v_note FROM public.product_attribute_defs
   WHERE tenant_id = v_tenant AND key = 'longevity_note' AND kind = 'text';
  IF v_occ IS NULL OR v_note IS NULL THEN
    RAISE EXCEPTION 'occasions/longevity_note already exist with a different kind';
  END IF;

  -- occasions — source: the line under «وين تحطه؟» (Perseviron: its
  -- «مثالي الأجواء…» line). Quoted per row.
  INSERT INTO public.product_attribute_values (product_id, attribute_def_id, tenant_id, value)
  SELECT p.id, v_occ, v_tenant, x.value
    FROM (VALUES
      -- coconut-lagoon: «صيفي. للبحر والسفرات والطلعات النهارية.»
      ('4cf04d6b-1c56-4a37-9c3b-0cd09de20294'::uuid, '{"fits":["البحر","السفرات","الطلعات النهارية"]}'::jsonb),
      -- oud-satin: «شتوي ومسائي. للدواوين والمناسبات.»
      ('4d23b558-8248-482f-b470-472687e74f89'::uuid, '{"fits":["مسائي","الدواوين","المناسبات"]}'::jsonb),
      -- rich-santal: «الدوام والاجتماعات. يشتغل كل السنة.»
      ('cdee984c-8905-45af-9217-4f638ef03f46'::uuid, '{"fits":["الدوام","الاجتماعات"]}'::jsonb),
      -- taskeen-caramel-cascade: «شتوي، ويشتغل بالدوام والبيت والطلعات.»
      ('f73a7160-fc00-49ba-8bce-a04532e8164b'::uuid, '{"fits":["الدوام","البيت","الطلعات"]}'::jsonb),
      -- mawj-moscow-mule: «صيفي بامتياز. للدوام النهاري والرياضة والسفر.»
      ('0b472c9b-6c23-4a5f-9c43-b96b74ccfff7'::uuid, '{"fits":["الدوام النهاري","الرياضة","السفر"]}'::jsonb),
      -- qissa-gala: «للمناسبات والأعراس والسهرات. يترك أثر بالمكان.»
      ('56c23fb9-313a-43f9-b518-eb6a574eb0a0'::uuid, '{"fits":["المناسبات","الأعراس","السهرات"]}'::jsonb),
      -- pear-potion: «كل السنة. مثالي للدوام والجامعة والاستخدام اليومي.»
      ('316054dc-f479-468a-9eb6-39b6cad4b5da'::uuid, '{"fits":["الدوام","الجامعة","الاستخدام اليومي"]}'::jsonb),
      -- qissa-delicious: «شتوي، للطلعات والجامعة والدوام.»
      ('514dd7d1-e50b-4902-9975-f0f114ba4adf'::uuid, '{"fits":["الطلعات","الجامعة","الدوام"]}'::jsonb),
      -- december-vanilla: «ليالي الشتا والمناسبات. بخة وحدة تكفي.»
      ('0dd2feca-2477-4597-b243-f1595e9beb61'::uuid, '{"fits":["ليالي الشتا","المناسبات"]}'::jsonb),
      -- khair-felicity: «مثالي للمناسبات، الأعراس، والطلعات المسائية. يشتغل صيف وشتاء.»
      ('59966b0c-5f52-4c34-8229-2e907213c3f9'::uuid, '{"fits":["المناسبات","الأعراس","الطلعات المسائية"]}'::jsonb),
      -- marshmallow-blush: «يشتغل كل السنة، وأحلى شي بالطلعات والجامعة والدوام.»
      ('e317c152-165e-4e8e-b4a2-70fdde79cf86'::uuid, '{"fits":["الطلعات","الجامعة","الدوام"]}'::jsonb),
      -- taskeen-lactea-divina: «مسائي وشتوي. حلو للجلسات والدواوين.»
      ('e7daef11-bb45-499e-8c0e-01c29291a0b2'::uuid, '{"fits":["مسائي","الجلسات","الدواوين"]}'::jsonb),
      -- taskeen-wowie: «شتوي ومسائي، وحلو بالأجواء الباردة.»
      ('344738e4-9cbd-4e1e-9d50-4f656a4b43eb'::uuid, '{"fits":["مسائي","الأجواء الباردة"]}'::jsonb),
      -- elania: «كل السنة. للدوام والطلعات والمناسبات.»
      ('d4bebf52-07b9-4314-bc8d-bc06c62d0222'::uuid, '{"fits":["الدوام","الطلعات","المناسبات"]}'::jsonb),
      -- khair-peach-delulu: «صيفي. للطلعات النهارية والجامعة.»
      ('bb78a023-6534-42e6-bc83-6d0909a841e5'::uuid, '{"fits":["الطلعات النهارية","الجامعة"]}'::jsonb),
      -- rifaaqat-adorn: «كل السنة. الدوام والمناسبات الرسمية.»
      ('8e2de698-3602-47b1-b8b7-061058c8e7da'::uuid, '{"fits":["الدوام","المناسبات الرسمية"]}'::jsonb),
      -- minya: «شتوي. للدوام وللطلعات المسائية.»
      ('1d17c13b-f045-4b1c-8f56-72bcb623a0f1'::uuid, '{"fits":["الدوام","الطلعات المسائية"]}'::jsonb),
      -- bayn-al-asrar: «شتوي ومسائي. مثالي للمناسبات والدواوين والليالي الباردة.»
      ('7bbff454-17c5-4123-a9da-fac192fe7895'::uuid, '{"fits":["مسائي","المناسبات","الدواوين","الليالي الباردة"]}'::jsonb),
      -- date-caramel: «شتوي. للدواوين ورمضان والمناسبات العائلية.»
      ('fc1a3c54-ea47-4008-b0f2-a5d4c7a3ba6b'::uuid, '{"fits":["الدواوين","رمضان","المناسبات العائلية"]}'::jsonb),
      -- eshal-musk: «كل السنة. مثالي للدوام واللبس اليومي.»
      ('38decc96-86fd-415d-b210-d48252e3333f'::uuid, '{"fits":["الدوام","اللبس اليومي"]}'::jsonb),
      -- eshal-vanilla: «أحلى شي بالشتاء وبالجلسات القريبة. عطر مسائي بامتياز.»
      ('736371d3-b360-490a-be22-cfbc5a60c080'::uuid, '{"fits":["الجلسات القريبة","مسائي"]}'::jsonb),
      -- perseviron-fig-hug: «صيفي وربيعي. للدوام والطلعات النهارية.»
      ('3aad8bd0-f590-4dc5-a771-ab14e296398f'::uuid, '{"fits":["الدوام","الطلعات النهارية"]}'::jsonb),
      -- midnight-sin: «مسائي، شتوي، وللمناسبات اللي تريد تنذكر بيها.»
      ('d236bd3f-c7cc-404e-8bf0-03d12e06903e'::uuid, '{"fits":["مسائي","المناسبات"]}'::jsonb),
      -- molten-caramel: «شتوي أصيل. يشتغل بالدوام وبالطلعات الليلية.»
      ('a16ebfbb-dd82-4417-abcf-0d2da96415be'::uuid, '{"fits":["الدوام","الطلعات الليلية"]}'::jsonb),
      -- ibisco-nirvana: «شتوي ومسائي، وللمناسبات.»
      ('e6370a6f-f826-42bb-8e81-a1a8065003a0'::uuid, '{"fits":["مسائي","المناسبات"]}'::jsonb),
      -- dulzura: «شتوي. عطر مسائي دافي وقريب.»
      ('4ce602a7-9b4b-493f-8049-a5b01bc39482'::uuid, '{"fits":["مسائي"]}'::jsonb),
      -- بيرسيفيرون: «.مثالي الأجواء الصيف والدوام والمناسبات اللي تحتاج تكون بيها "بارز"…»
      ('eebd1ed9-cbf7-4296-9470-c52fa66e5252'::uuid, '{"fits":["الدوام","المناسبات"]}'::jsonb)
    ) AS x(product_id, value)
    JOIN public.products p ON p.id = x.product_id AND p.tenant_id = v_tenant
  ON CONFLICT (product_id, attribute_def_id) DO NOTHING;

  -- longevity_note — plain staying-power sentences, quoted per row.
  INSERT INTO public.product_attribute_values (product_id, attribute_def_id, tenant_id, value)
  SELECT p.id, v_note, v_tenant, x.value
    FROM (VALUES
      -- oud-satin: «…وفانيليا ناعمة تكسر الحدة. ثبات ممتاز وفوحان قوي.»
      ('4d23b558-8248-482f-b470-472687e74f89'::uuid, '{"ar":"ثبات ممتاز وفوحان قوي."}'::jsonb),
      -- marshmallow-blush: «…يشيله من الحلويات للفخامة، والمسك يخليه يظل ساعات.»
      ('e317c152-165e-4e8e-b4a2-70fdde79cf86'::uuid, '{"ar":"المسك يخليه يظل ساعات."}'::jsonb),
      -- eshal-musk: «…وياسمين وفريزيا بالقلب، ومسك وأمبروكسان يثبتونه ساعات طويلة.»
      ('38decc96-86fd-415d-b210-d48252e3333f'::uuid, '{"ar":"مسك وأمبروكسان يثبتونه ساعات طويلة."}'::jsonb),
      -- envoy: «…أعلى تركيز بعالم العطور — يثبت وياك من الصبح، ويفوح بهدوء.»
      ('6ab3bad7-e4dd-4f18-8c3b-746d095a2c93'::uuid, '{"ar":"يثبت وياك من الصبح، ويفوح بهدوء."}'::jsonb),
      -- فيوجن: «! تركيبة سحرية تدوم على بشرتك لساعات طويلة، تترك انطباع…»
      ('c092ad91-c70e-4b0d-a22b-a445126ba783'::uuid, '{"ar":"تدوم على بشرتك لساعات طويلة."}'::jsonb)
    ) AS x(product_id, value)
    JOIN public.products p ON p.id = x.product_id AND p.tenant_id = v_tenant
  ON CONFLICT (product_id, attribute_def_id) DO NOTHING;

  -- notes — products whose descriptions state their tiers but carry none.
  INSERT INTO public.product_attribute_values (product_id, attribute_def_id, tenant_id, value)
  SELECT p.id, v_notes, v_tenant, x.value
    FROM (VALUES
      -- بيرسيفيرون: «افتتاحية العطر: انتعاش البرغموت والحمضيات وية حلاة اللوز السكري وحبوب
      -- التونكا وشوكولا اللوز» / «قلب العطر: اعواد الفانيلا مع زهر البرتقال و كريمة الحليب» /
      -- «القاعدة: ثباتية مرعبة وية دفو الهيل والدارسين»
      ('eebd1ed9-cbf7-4296-9470-c52fa66e5252'::uuid,
       '{"top":["البرغموت","الحمضيات","اللوز السكري","حبوب التونكا","شوكولا اللوز"],"heart":["اعواد الفانيلا","زهر البرتقال","كريمة الحليب"],"base":["الهيل","الدارسين"]}'::jsonb),
      -- بستاشيو: «مقدمة العطر: البرغموت الإيطالي، جيلاتو الفستق، البندق، الروم الحلو، الهيل» /
      -- «القلب: الغرنوقي، الفاوانيا البيضاء، زنابق الوادي، الياسمين، التوت، الخوخ الأبيض، والكمثرى» /
      -- «القاعدة: الكريمة المخفوقة، المارشميلو، غزل البنات، مزيج راحة الحلقوم التركي، الكاكاو،
      -- خشب الأرز، خشب الصندل، وحبوب التونكا»
      ('65be51d4-7ac7-411f-b5f4-e2026ba6d9fe'::uuid,
       '{"top":["البرغموت الإيطالي","جيلاتو الفستق","البندق","الروم الحلو","الهيل"],"heart":["الغرنوقي","الفاوانيا البيضاء","زنابق الوادي","الياسمين","التوت","الخوخ الأبيض","الكمثرى"],"base":["الكريمة المخفوقة","المارشميلو","غزل البنات","مزيج راحة الحلقوم التركي","الكاكاو","خشب الأرز","خشب الصندل","حبوب التونكا"]}'::jsonb),
      -- ويفر: «أول رشة (الانفجار)التوت الفاخر + التفاح الأخضر» / «القلب (الشخصية)الهيل + اللافندر» /
      -- «القاعدة (البصمة)الباتشولي الساحر»
      ('5e847790-11a5-439f-bace-c315e0ff1ae8'::uuid,
       '{"top":["التوت الفاخر","التفاح الأخضر"],"heart":["الهيل","اللافندر"],"base":["الباتشولي الساحر"]}'::jsonb),
      -- envoy: «أول ما تبخ: نعناع بارد وتفاح أخضر وليمون إيطالي» / «بعد ربع ساعة يبدي القلب: تونكا
      -- دافئة وية الجيرانيوم والأمبروكسان» / «وبالقاعدة: فانيليا مدغشقرية وخشب الأرز والفيتيفر»
      ('6ab3bad7-e4dd-4f18-8c3b-746d095a2c93'::uuid,
       '{"top":["نعناع بارد","تفاح أخضر","ليمون إيطالي"],"heart":["تونكا دافئة","الجيرانيوم","الأمبروكسان"],"base":["فانيليا مدغشقرية","خشب الأرز","الفيتيفر"]}'::jsonb)
    ) AS x(product_id, value)
    JOIN public.products p ON p.id = x.product_id AND p.tenant_id = v_tenant
  ON CONFLICT (product_id, attribute_def_id) DO NOTHING;

  -- season — بيرسيفيرون: «مثالي الأجواء الصيف…»
  INSERT INTO public.product_attribute_values (product_id, attribute_def_id, tenant_id, value)
  SELECT p.id, v_season, v_tenant, '"summer"'::jsonb
    FROM public.products p
   WHERE p.id = 'eebd1ed9-cbf7-4296-9470-c52fa66e5252'::uuid AND p.tenant_id = v_tenant
  ON CONFLICT (product_id, attribute_def_id) DO NOTHING;

  -- فيوجن notes — replace the 2026-09-09 test seed with the tiers its
  -- description states («افتتاحية العطر … التفاح الاحمر الطازج والكشمش الأسود …
  -- الليمون الايطالي» / «بقلب العطر … زهرة الطائف … زهرة الياسمين … البنفسج الفرنسي» /
  -- «وقاعدة العطر … خشب الصندل الهندي … الفانيليا المدغشقرية … السكر البني … خشب التفاح»),
  -- which its own note cards (التفاح الاحمر / الليمون الايطالي / الكشمش الاسود) agree with.
  -- Old value, for rollback:
  --   {"top":["برغموت","ليمون"],"heart":["ياسمين"],"base":["عنبر","مسك","خشب الصندل"]}
  UPDATE public.product_attribute_values
     SET value = '{"top":["التفاح الاحمر الطازج","الكشمش الأسود","الليمون الايطالي"],"heart":["زهرة الطائف","زهرة الياسمين","البنفسج الفرنسي"],"base":["خشب الصندل الهندي","الفانيليا المدغشقرية","السكر البني","خشب التفاح"]}'::jsonb
   WHERE product_id = 'c092ad91-c70e-4b0d-a22b-a445126ba783'::uuid
     AND attribute_def_id = v_notes
     AND tenant_id = v_tenant
     AND value = '{"top":["برغموت","ليمون"],"heart":["ياسمين"],"base":["عنبر","مسك","خشب الصندل"]}'::jsonb;
END $$;
