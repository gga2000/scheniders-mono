-- =============================================
-- PRODUCT MATCHING ENGINE FOR EXISTING ORDERS
-- This script cross-references product names and adds product_id, image_url, tag_color
-- Run this in Supabase SQL Editor
-- =============================================

-- STEP 1: View your product catalogue first
SELECT id, name, image_url, tag_color FROM products WHERE is_archived = false;

-- =============================================
-- STEP 2: FIX ALL ORDERS - Match products by name patterns
-- =============================================

-- A) FIX: برسيفيرون / بيرسيفيرون products (all spelling variations)
WITH product_info AS (
    SELECT id, name, image_url, tag_color 
    FROM products 
    WHERE name ILIKE '%برسيفيرون%' OR name ILIKE '%بيرسيفيرون%'
    LIMIT 1
)
UPDATE orders 
SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN (item->>'name') ILIKE '%برسيفيرون%' 
              OR (item->>'name') ILIKE '%بيرسيفيرون%'
              OR (item->>'name') ILIKE '%بيرسفيرون%'
            THEN item 
                || jsonb_build_object('product_id', p.id)
                || CASE WHEN p.image_url IS NOT NULL THEN jsonb_build_object('image_url', p.image_url) ELSE '{}'::jsonb END
                || CASE WHEN p.tag_color IS NOT NULL THEN jsonb_build_object('tag_color', p.tag_color) ELSE '{}'::jsonb END
            ELSE item
        END
    )
    FROM jsonb_array_elements(orders.items) AS item
    CROSS JOIN product_info p
)
FROM product_info p
WHERE (
    items::text ILIKE '%برسيفيرون%' 
    OR items::text ILIKE '%بيرسيفيرون%'
    OR items::text ILIKE '%بيرسفيرون%'
)
AND (
    NOT items::text LIKE '%"product_id":%'
    OR items::text LIKE '%"product_id":null%'
);

-- B) FIX: ايدنتتي / ايدينتتي products
WITH product_info AS (
    SELECT id, name, image_url, tag_color 
    FROM products 
    WHERE name ILIKE '%ايدنتتي%' OR name ILIKE '%ايدينتتي%'
    LIMIT 1
)
UPDATE orders 
SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN (item->>'name') ILIKE '%ايدنتتي%' 
              OR (item->>'name') ILIKE '%ايدينتتي%'
            THEN item 
                || jsonb_build_object('product_id', p.id)
                || CASE WHEN p.image_url IS NOT NULL THEN jsonb_build_object('image_url', p.image_url) ELSE '{}'::jsonb END
                || CASE WHEN p.tag_color IS NOT NULL THEN jsonb_build_object('tag_color', p.tag_color) ELSE '{}'::jsonb END
            ELSE item
        END
    )
    FROM jsonb_array_elements(orders.items) AS item
    CROSS JOIN product_info p
)
FROM product_info p
WHERE (
    items::text ILIKE '%ايدنتتي%'
    OR items::text ILIKE '%ايدينتتي%'
)
AND (
    NOT items::text LIKE '%"product_id":%'
    OR items::text LIKE '%"product_id":null%'
);

-- C) FIX: رفقات products
WITH product_info AS (
    SELECT id, name, image_url, tag_color 
    FROM products 
    WHERE name ILIKE '%رفقات%'
    LIMIT 1
)
UPDATE orders 
SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN (item->>'name') ILIKE '%رفقات%'
            THEN item 
                || jsonb_build_object('product_id', p.id)
                || CASE WHEN p.image_url IS NOT NULL THEN jsonb_build_object('image_url', p.image_url) ELSE '{}'::jsonb END
                || CASE WHEN p.tag_color IS NOT NULL THEN jsonb_build_object('tag_color', p.tag_color) ELSE '{}'::jsonb END
            ELSE item
        END
    )
    FROM jsonb_array_elements(orders.items) AS item
    CROSS JOIN product_info p
)
FROM product_info p
WHERE items::text ILIKE '%رفقات%'
AND (
    NOT items::text LIKE '%"product_id":%'
    OR items::text LIKE '%"product_id":null%'
);

-- D) FIX: فيوجن products
WITH product_info AS (
    SELECT id, name, image_url, tag_color 
    FROM products 
    WHERE name ILIKE '%فيوجن%'
    LIMIT 1
)
UPDATE orders 
SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN (item->>'name') ILIKE '%فيوجن%'
            THEN item 
                || jsonb_build_object('product_id', p.id)
                || CASE WHEN p.image_url IS NOT NULL THEN jsonb_build_object('image_url', p.image_url) ELSE '{}'::jsonb END
                || CASE WHEN p.tag_color IS NOT NULL THEN jsonb_build_object('tag_color', p.tag_color) ELSE '{}'::jsonb END
            ELSE item
        END
    )
    FROM jsonb_array_elements(orders.items) AS item
    CROSS JOIN product_info p
)
FROM product_info p
WHERE items::text ILIKE '%فيوجن%'
AND (
    NOT items::text LIKE '%"product_id":%'
    OR items::text LIKE '%"product_id":null%'
);

-- E) FIX: بستاشيو products
WITH product_info AS (
    SELECT id, name, image_url, tag_color 
    FROM products 
    WHERE name ILIKE '%بستاشيو%'
    LIMIT 1
)
UPDATE orders 
SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN (item->>'name') ILIKE '%بستاشيو%'
            THEN item 
                || jsonb_build_object('product_id', p.id)
                || CASE WHEN p.image_url IS NOT NULL THEN jsonb_build_object('image_url', p.image_url) ELSE '{}'::jsonb END
                || CASE WHEN p.tag_color IS NOT NULL THEN jsonb_build_object('tag_color', p.tag_color) ELSE '{}'::jsonb END
            ELSE item
        END
    )
    FROM jsonb_array_elements(orders.items) AS item
    CROSS JOIN product_info p
)
FROM product_info p
WHERE items::text ILIKE '%بستاشيو%'
AND (
    NOT items::text LIKE '%"product_id":%'
    OR items::text LIKE '%"product_id":null%'
);

-- F) FIX: ايبسكو products (note: with ب not س)
WITH product_info AS (
    SELECT id, name, image_url, tag_color 
    FROM products 
    WHERE name ILIKE '%ايبسكو%' OR name ILIKE '%ايسكو%'
    LIMIT 1
)
UPDATE orders 
SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN (item->>'name') ILIKE '%ايبسكو%'
              OR (item->>'name') ILIKE '%ايسكو%'
            THEN item 
                || jsonb_build_object('product_id', p.id)
                || CASE WHEN p.image_url IS NOT NULL THEN jsonb_build_object('image_url', p.image_url) ELSE '{}'::jsonb END
                || CASE WHEN p.tag_color IS NOT NULL THEN jsonb_build_object('tag_color', p.tag_color) ELSE '{}'::jsonb END
            ELSE item
        END
    )
    FROM jsonb_array_elements(orders.items) AS item
    CROSS JOIN product_info p
)
FROM product_info p
WHERE (items::text ILIKE '%ايبسكو%' OR items::text ILIKE '%ايسكو%')
AND (
    NOT items::text LIKE '%"product_id":%'
    OR items::text LIKE '%"product_id":null%'
);

-- =============================================
-- STEP 3: VERIFY - Check the results
-- =============================================

-- Count orders that now have product_id linked
SELECT 
    'Orders with product_id' as metric,
    COUNT(*) as count
FROM orders 
WHERE items::text LIKE '%"product_id":%'
  AND NOT items::text LIKE '%"product_id":null%';

-- Check orders that still need fixing
SELECT 
    order_id,
    customer_name,
    items::text as items_text
FROM orders 
WHERE NOT items::text LIKE '%"product_id":%'
   OR items::text LIKE '%"product_id":null%'
ORDER BY created_at DESC
LIMIT 20;

-- Sample of fixed orders
SELECT 
    order_id,
    customer_name,
    items
FROM orders 
WHERE items::text LIKE '%"product_id":%'
  AND items::text LIKE '%"image_url":%'
ORDER BY created_at DESC
LIMIT 5;
