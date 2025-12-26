-- =============================================
-- Link Products for Newly Imported Orders
-- Run this in Supabase SQL Editor
-- Target: Orders with status='new' that have missing product_id
-- =============================================

-- First, let's see what products we have in our catalogue
-- SELECT id, name FROM products WHERE is_archived = false;

-- Product ID Reference (update these with your actual product IDs):
-- برسيفيرون (Persiferon): eebd1ed9-cbf7-4296-9470-c52fa66e5252
-- ايدنتتي (Identity): 02a67e80-4a98-4fb5-91a6-5a866b40b56d
-- رفقات (Rifqat): d6cb6a8c-8f61-47c3-8bb4-8e653a35e42c
-- فيوجن (Fusion): c092ad91-c70e-4b0d-a22b-a445126ba783
-- بستاشيو (Pistachio): 65be51d4-7ac7-411f-b5f4-e2026ba6d9fe
-- ايسكو (Esco): f1eb77e9-d9b0-4238-a331-d621fbbc92ec

-- =============================================
-- STEP 1: View new orders that need product linking
-- =============================================
-- Run this first to see orders that need fixing:
SELECT 
    order_id, 
    customer_name,
    items::text as items_text,
    created_at
FROM orders 
WHERE status = 'new' 
  AND (
    NOT items::text LIKE '%product_id%'
    OR items::text LIKE '%"product_id":null%'
  )
ORDER BY created_at DESC
LIMIT 50;

-- =============================================
-- STEP 2: Link products to items based on name matching
-- This updates items array to add product_id for each item
-- =============================================

-- Update برسيفيرون products (Persiferon - main product)
-- Matches: برسيفيرون, بيرسيفيرون, بيرسفيرون
UPDATE orders SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN (item->>'name') ILIKE '%برسيفيرون%' 
              OR (item->>'name') ILIKE '%بيرسيفيرون%'
              OR (item->>'name') ILIKE '%بيرسفيرون%'
            THEN item || jsonb_build_object('product_id', 'eebd1ed9-cbf7-4296-9470-c52fa66e5252')
            ELSE item
        END
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE status = 'new'
  AND (
    items::text ILIKE '%برسيفيرون%' 
    OR items::text ILIKE '%بيرسيفيرون%'
    OR items::text ILIKE '%بيرسفيرون%'
  )
  AND NOT items::text LIKE '%product_id%';

-- Update ايدنتتي products (Identity)
-- Matches: ايدنتتي, ايدينتتي
UPDATE orders SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN (item->>'name') ILIKE '%ايدنتتي%' 
              OR (item->>'name') ILIKE '%ايدينتتي%'
              OR (item->>'name') ILIKE '%identity%'
            THEN item || jsonb_build_object('product_id', '02a67e80-4a98-4fb5-91a6-5a866b40b56d')
            ELSE item
        END
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE status = 'new'
  AND (
    items::text ILIKE '%ايدنتتي%' 
    OR items::text ILIKE '%ايدينتتي%'
    OR items::text ILIKE '%identity%'
  )
  AND NOT items::text LIKE '%product_id%';

-- Update رفقات products (Rifqat White)
UPDATE orders SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN (item->>'name') ILIKE '%رفقات%' 
            THEN item || jsonb_build_object('product_id', 'd6cb6a8c-8f61-47c3-8bb4-8e653a35e42c')
            ELSE item
        END
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE status = 'new'
  AND items::text ILIKE '%رفقات%'
  AND NOT items::text LIKE '%product_id%';

-- Update فيوجن products (Fusion)
UPDATE orders SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN (item->>'name') ILIKE '%فيوجن%' 
              OR (item->>'name') ILIKE '%خير فيوجن%'
            THEN item || jsonb_build_object('product_id', 'c092ad91-c70e-4b0d-a22b-a445126ba783')
            ELSE item
        END
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE status = 'new'
  AND items::text ILIKE '%فيوجن%'
  AND NOT items::text LIKE '%product_id%';

-- Update بستاشيو products (Pistachio)
UPDATE orders SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN (item->>'name') ILIKE '%بستاشيو%' 
              OR (item->>'name') ILIKE '%pistachio%'
            THEN item || jsonb_build_object('product_id', '65be51d4-7ac7-411f-b5f4-e2026ba6d9fe')
            ELSE item
        END
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE status = 'new'
  AND (
    items::text ILIKE '%بستاشيو%'
    OR items::text ILIKE '%pistachio%'
  )
  AND NOT items::text LIKE '%product_id%';

-- Update ايسكو products (Esco)
UPDATE orders SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN (item->>'name') ILIKE '%ايسكو%' 
            THEN item || jsonb_build_object('product_id', 'f1eb77e9-d9b0-4238-a331-d621fbbc92ec')
            ELSE item
        END
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE status = 'new'
  AND items::text ILIKE '%ايسكو%'
  AND NOT items::text LIKE '%product_id%';

-- =============================================
-- STEP 3: Handle combo products (multiple products in one order)
-- For items like "عطر برسيفيرون / رفقات ابيض" or "بيرسفيرون+رفقات + فيوجن"
-- We'll link to the first product mentioned (برسيفيرون)
-- =============================================

-- Combo: برسيفيرون + رفقات (link to برسيفيرون)
UPDATE orders SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN ((item->>'name') ILIKE '%برسيفيرون%' OR (item->>'name') ILIKE '%بيرسيفيرون%')
              AND (item->>'name') ILIKE '%رفقات%'
            THEN item || jsonb_build_object('product_id', 'eebd1ed9-cbf7-4296-9470-c52fa66e5252')
            ELSE item
        END
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE status = 'new'
  AND items::text ILIKE '%رفقات%'
  AND (items::text ILIKE '%برسيفيرون%' OR items::text ILIKE '%بيرسيفيرون%')
  AND NOT items::text LIKE '%product_id%';

-- Combo: برسيفيرون + فيوجن (link to برسيفيرون)
UPDATE orders SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN ((item->>'name') ILIKE '%برسيفيرون%' OR (item->>'name') ILIKE '%بيرسيفيرون%')
              AND (item->>'name') ILIKE '%فيوجن%'
            THEN item || jsonb_build_object('product_id', 'eebd1ed9-cbf7-4296-9470-c52fa66e5252')
            ELSE item
        END
    )
    FROM jsonb_array_elements(items) AS item
)
WHERE status = 'new'
  AND items::text ILIKE '%فيوجن%'
  AND (items::text ILIKE '%برسيفيرون%' OR items::text ILIKE '%بيرسيفيرون%')
  AND NOT items::text LIKE '%product_id%';

-- =============================================
-- STEP 4: Verify the updates
-- =============================================

-- Check orders that now have product_id linked
SELECT 
    order_id, 
    customer_name,
    items::text as items_text,
    status
FROM orders 
WHERE status = 'new' 
  AND items::text LIKE '%product_id%'
ORDER BY created_at DESC
LIMIT 20;

-- Check if any new orders still have missing product_id
SELECT 
    order_id, 
    customer_name,
    items::text as items_text
FROM orders 
WHERE status = 'new' 
  AND NOT items::text LIKE '%product_id%'
ORDER BY created_at DESC
LIMIT 20;
