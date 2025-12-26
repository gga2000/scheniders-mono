-- Link products to existing orders (without changing prices)
-- Run this in Supabase SQL Editor

-- This updates the items array to add product_id for each item based on name matching

-- بيرسيفيرون products
UPDATE orders SET items = (
    SELECT jsonb_agg(
        item || jsonb_build_object('product_id', 'eebd1ed9-cbf7-4296-9470-c52fa66e5252')
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE items::text LIKE '%برسيفيرون%' 
  AND NOT items::text LIKE '%product_id%';

-- ايدنتتي products  
UPDATE orders SET items = (
    SELECT jsonb_agg(
        item || jsonb_build_object('product_id', '02a67e80-4a98-4fb5-91a6-5a866b40b56d')
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE (items::text LIKE '%ايدنتتي%' OR items::text LIKE '%ايدينتتي%')
  AND NOT items::text LIKE '%product_id%';

-- رفقات products
UPDATE orders SET items = (
    SELECT jsonb_agg(
        item || jsonb_build_object('product_id', 'd6cb6a8c-8f61-47c3-8bb4-8e653a35e42c')
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE items::text LIKE '%رفقات%'
  AND NOT items::text LIKE '%product_id%';

-- فيوجن products
UPDATE orders SET items = (
    SELECT jsonb_agg(
        item || jsonb_build_object('product_id', 'c092ad91-c70e-4b0d-a22b-a445126ba783')
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE items::text LIKE '%فيوجن%'
  AND NOT items::text LIKE '%product_id%';

-- بستاشيو products
UPDATE orders SET items = (
    SELECT jsonb_agg(
        item || jsonb_build_object('product_id', '65be51d4-7ac7-411f-b5f4-e2026ba6d9fe')
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE items::text LIKE '%بستاشيو%'
  AND NOT items::text LIKE '%product_id%';

-- ايسكو products
UPDATE orders SET items = (
    SELECT jsonb_agg(
        item || jsonb_build_object('product_id', 'f1eb77e9-d9b0-4238-a331-d621fbbc92ec')
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE items::text LIKE '%ايسكو%'
  AND NOT items::text LIKE '%product_id%';

-- Verify: Check some orders to see if product_id is now linked
SELECT order_id, items FROM orders WHERE items::text LIKE '%product_id%' LIMIT 5;
