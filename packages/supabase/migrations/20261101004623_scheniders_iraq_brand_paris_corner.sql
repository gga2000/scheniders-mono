-- scheniders-iraq: the 7 perfumes that had no brand are Paris Corner
-- (merchant confirmed 2026-11-01). Same spelling as the other 26 Paris
-- Corner products. Only rows still without a brand are touched, so a brand
-- set since then is kept and re-running is a no-op. Supply items untouched.
UPDATE public.products
SET brand = 'باريس كورنر',
    updated_at = now()
WHERE tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
  AND id IN (
    '9e66b31f-17dc-4695-989e-81e21663dad3', -- اوشن
    'f1eb77e9-d9b0-4238-a331-d621fbbc92ec', -- ايبسكو
    '0d266e0c-1c81-4ac2-ad59-9279d87c5153', -- توباكو
    'd5cabe60-acdc-49ae-9b07-adc13d819a6d', -- فولاريس
    '6feee2fb-3b43-4499-a988-fcbd648d56f5', -- نورث ستاك 1
    'e41ec722-dbb7-47b5-aa00-84f6f1c5a234', -- نورث ستاك 2
    '8167331f-b04a-4b6e-97e7-3d1eddf611dc'  -- نورث ستاك 4
  )
  AND (brand IS NULL OR btrim(brand) = '');
