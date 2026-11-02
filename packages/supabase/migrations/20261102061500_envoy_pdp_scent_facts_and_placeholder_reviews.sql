-- =====================================================================
-- scheniders-iraq: Envoy Blue PDP content (2026-11-02)
-- =====================================================================
-- 1. Scent facts the PDP "scent journey" reads for Envoy Blue
--    (6ab3bad7-e4dd-4f18-8c3b-746d095a2c93). Notes, note-card images and
--    longevity_note already exist; this adds the missing rows. Every value is
--    taken from the product's own description:
--      scent_family  fresh   - mint, green apple, Italian lemon opening
--      season        summer  - "designed for the Iraqi climate ... July heat"
--      longevity     4 of 5  - "Extrait de Parfum ... يثبت وياك من الصبح"
--      sillage       3 of 5  - "يفوح بهدوء. مو صرخة… حضور" (quiet projection)
--      scent_lead    one line built from the description's own note list
--    The 4 and 3 are editorial ratings, not lab measurements; Ali to confirm.
--    Never overwrites a merchant edit (ON CONFLICT DO NOTHING).
--
-- 2. Six PLACEHOLDER reviews so Ali can swap in real ones later. They are
--    inserted as status 'pending' and are NEVER shown to shoppers: every
--    storefront read (RLS reviews_public_read, listApprovedReviews,
--    GET /api/reviews) requires status = 'approved'. Each carries
--    "[نموذج]" in author_name and "[PLACEHOLDER]" in title, so they cannot
--    be approved by accident unnoticed. Do NOT approve them: invented
--    reviews shown as real mislead buyers and break Meta ad policy.
--    Replace by editing the text/author with a real customer's words, then
--    approve from /store/reviews, or delete the placeholder rows.
--    Side effect: the AFTER INSERT trigger posts 6 "new review" notifications.
--
-- Rollback:
--   DELETE FROM public.product_reviews
--    WHERE product_id = '6ab3bad7-e4dd-4f18-8c3b-746d095a2c93'
--      AND title LIKE '[PLACEHOLDER]%';
--   DELETE FROM public.product_attribute_values v USING public.product_attribute_defs d
--    WHERE d.id = v.attribute_def_id AND v.product_id = '6ab3bad7-e4dd-4f18-8c3b-746d095a2c93'
--      AND d.key IN ('scent_family','season','longevity','sillage','scent_lead');
-- A no-op on any database without scheniders-iraq or this product.
-- =====================================================================

DO $$
DECLARE
  v_tenant  uuid;
  v_product constant uuid := '6ab3bad7-e4dd-4f18-8c3b-746d095a2c93';
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'scheniders-iraq';
  IF v_tenant IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.products WHERE id = v_product AND tenant_id = v_tenant) THEN
    RETURN;
  END IF;

  INSERT INTO public.product_attribute_values (product_id, attribute_def_id, tenant_id, value)
  SELECT v_product, d.id, v_tenant, x.val
    FROM (VALUES
      ('scent_family', '"fresh"'::jsonb),
      ('season',       '"summer"'::jsonb),
      ('longevity',    '4'::jsonb),
      ('sillage',      '3'::jsonb),
      ('scent_lead',   '{"ar":"منعش ببداية نعناع وتفاح أخضر وليمون، ويستقر بدفا الفانيلا والأرز"}'::jsonb)
    ) AS x(key, val)
    JOIN public.product_attribute_defs d ON d.tenant_id = v_tenant AND d.key = x.key
  ON CONFLICT DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.product_reviews
                  WHERE product_id = v_product AND title LIKE '[PLACEHOLDER]%') THEN
    INSERT INTO public.product_reviews (tenant_id, product_id, rating, title, body, author_name, status)
    VALUES
      (v_tenant, v_product, 5, '[PLACEHOLDER] ريحة تخبل', 'ريحته منعشة وكلش نظيفة، من أبخه ينتبهون الناس. ثباته وياي طول الدوام.', '[نموذج] اسم الزبون ١', 'pending'),
      (v_tenant, v_product, 5, '[PLACEHOLDER] جربته گبل ما أدفع', 'عجبتني فكرة العينة عند الباب. جربت الريحة وبعدين دفعت، والتوصيل كان سريع.', '[نموذج] اسم الزبون ٢', 'pending'),
      (v_tenant, v_product, 5, '[PLACEHOLDER] يناسب الصيف', 'بحر تموز وهو يثبت، مو ثقيل ومو يصدع الراس. طلبت الثاني لأخويه.', '[نموذج] اسم الزبون ٣', 'pending'),
      (v_tenant, v_product, 4, '[PLACEHOLDER] حلو بس هادئ', 'الريحة حلوة ودافية بالنهاية، فوحانه هادئ مو صارخ، وهذا اللي أريده للدوام.', '[نموذج] اسم الزبون ٤', 'pending'),
      (v_tenant, v_product, 5, '[PLACEHOLDER] التغليف فخم', 'التغليف مرتب والزجاجة شكلها فخم، يصلح هدية. الدفع عند الاستلام ريحني.', '[نموذج] اسم الزبون ٥', 'pending'),
      (v_tenant, v_product, 4, '[PLACEHOLDER] يستاهل', 'ثاني مرة أطلب منهم، الريحة بعدها وياي من الصبح لبعد الظهر. يستاهل سعره.', '[نموذج] اسم الزبون ٦', 'pending');
  END IF;
END $$;
