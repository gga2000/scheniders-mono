-- =============================================
-- DIAGNOSTIC: Check why product linking didn't work
-- Run these queries one by one in Supabase SQL Editor
-- =============================================

-- 1. Check recent new orders and their actual items structure
SELECT 
    order_id, 
    customer_name,
    status,
    items,
    created_at
FROM orders 
WHERE status = 'new'
ORDER BY created_at DESC
LIMIT 10;

-- 2. Check if items already have product_id (even if null)
SELECT 
    order_id,
    customer_name,
    items::text as items_text,
    items::text LIKE '%product_id%' as has_product_id_field,
    items::text LIKE '%"product_id":null%' as has_null_product_id,
    items::text LIKE '%"product_id":"eebd1ed9%' as has_real_product_id
FROM orders 
WHERE status = 'new'
ORDER BY created_at DESC
LIMIT 10;

-- 3. Check all orders created today
SELECT 
    order_id,
    customer_name, 
    status,
    items::text as items_text,
    created_at
FROM orders 
WHERE created_at >= CURRENT_DATE
ORDER BY created_at DESC
LIMIT 20;

-- 4. Check specific order IDs from the screenshot
SELECT 
    order_id,
    customer_name,
    status,
    items,
    created_at
FROM orders 
WHERE order_id IN ('PRM-10041', '5503', '5505', '10045', '10049')
   OR order_id LIKE '%10041%'
   OR order_id LIKE '%5503%'
   OR order_id LIKE '%5505%'
   OR order_id LIKE '%10045%'
   OR order_id LIKE '%10049%'
ORDER BY created_at DESC;

-- 5. Check orders that contain برسيفيرون but missing product linking
SELECT 
    order_id,
    customer_name,
    status,
    items::text as items_text
FROM orders 
WHERE items::text ILIKE '%برسيفيرون%'
   OR items::text ILIKE '%بيرسيفيرون%'
   OR items::text ILIKE '%بيرسفيرون%'
ORDER BY created_at DESC
LIMIT 10;
