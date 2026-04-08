-- =============================================
-- Fix Sunday 12/28 Orders: Replace Full Names with Short Names
-- This script updates all orders created on 12/28/2025 to use
-- short product names from the catalogue instead of long Lightfunnels names
-- =============================================

-- First, let's see what orders need fixing
-- (Run this query first to verify before applying the fix)
SELECT 
    order_id,
    customer_name,
    created_at,
    items::text as current_items
FROM orders 
WHERE DATE(created_at) = '2025-12-28'
  AND source = 'lightfunnels'
  AND items::text LIKE '%عطر برسيفيرون الفاخر من باريس كورنر للرجال%'
ORDER BY created_at DESC;

-- =============================================
-- FIX: Update items to use short product names
-- =============================================

-- This function updates each order's items array to use short names
DO $$
DECLARE
    order_row RECORD;
    updated_items JSONB;
    item JSONB;
    item_name TEXT;
    new_name TEXT;
    product_info RECORD;
BEGIN
    -- Loop through all orders from Sunday 12/28 that have Lightfunnels source
    FOR order_row IN 
        SELECT id, order_id, items 
        FROM orders 
        WHERE DATE(created_at) = '2025-12-28'
          AND source = 'lightfunnels'
    LOOP
        updated_items := '[]'::jsonb;
        
        -- Loop through each item in the order
        FOR item IN SELECT * FROM jsonb_array_elements(order_row.items)
        LOOP
            item_name := item->>'name';
            new_name := item_name; -- Default to current name
            
            -- Check for برسيفيرون / بيرسيفيرون variations
            IF item_name ILIKE '%برسيفيرون%' OR item_name ILIKE '%بيرسيفيرون%' THEN
                new_name := 'بيرسيفيرون';
            -- Check for فيوجن
            ELSIF item_name ILIKE '%فيوجن%' THEN
                new_name := 'فيوجن';
            -- Check for رفقات
            ELSIF item_name ILIKE '%رفقات%' THEN
                new_name := 'رفقات';
            -- Check for ايدنتتي
            ELSIF item_name ILIKE '%ايدنت%' OR item_name ILIKE '%ادينت%' THEN
                new_name := 'ايدنتتي';
            -- Check for بستاشيو / فستق
            ELSIF item_name ILIKE '%بستاشيو%' OR item_name ILIKE '%فستق%' THEN
                new_name := 'بستاشيو';
            END IF;
            
            -- Get product info for the matched name
            SELECT id, name, image_url, tag_color 
            INTO product_info
            FROM products 
            WHERE name = new_name
            LIMIT 1;
            
            -- Build the updated item with product info
            IF product_info.id IS NOT NULL THEN
                updated_items := updated_items || jsonb_build_object(
                    'name', new_name,
                    'quantity', COALESCE((item->>'quantity')::int, 1),
                    'price', COALESCE((item->>'price')::numeric, 0),
                    'product_id', product_info.id::text,
                    'image_url', product_info.image_url,
                    'tag_color', product_info.tag_color
                );
            ELSE
                -- Keep original item if no product match
                updated_items := updated_items || item;
            END IF;
        END LOOP;
        
        -- Update the order with new items
        UPDATE orders 
        SET items = updated_items,
            updated_at = NOW()
        WHERE id = order_row.id;
        
        RAISE NOTICE 'Fixed order %', order_row.order_id;
    END LOOP;
END $$;

-- =============================================
-- VERIFY: Check the fixed orders
-- =============================================
SELECT 
    order_id,
    customer_name,
    created_at,
    items::text as fixed_items
FROM orders 
WHERE DATE(created_at) = '2025-12-28'
  AND source = 'lightfunnels'
ORDER BY created_at DESC;
