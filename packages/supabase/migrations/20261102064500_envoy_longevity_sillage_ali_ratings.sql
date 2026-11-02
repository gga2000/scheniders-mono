-- Envoy Blue (scheniders-iraq): Ali's own ratings, 2026-11-02.
-- longevity 4.7 / 5, sillage 4.5 / 5. Replaces the editorial 4 and 3 set by
-- 20261102061500. A no-op on any database without this product.
UPDATE public.product_attribute_values v
   SET value = CASE d.key WHEN 'longevity' THEN '4.7'::jsonb ELSE '4.5'::jsonb END
  FROM public.product_attribute_defs d
 WHERE d.id = v.attribute_def_id
   AND d.key IN ('longevity', 'sillage')
   AND v.product_id = '6ab3bad7-e4dd-4f18-8c3b-746d095a2c93'
   AND v.tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a';
