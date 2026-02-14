-- =============================================
-- Quick Fix for Order #5565 (Farhang Tawfeeq)
-- Run this in Supabase SQL Editor
-- =============================================

-- Get product info
WITH product_info AS (
    SELECT id, name, image_url, tag_color 
    FROM products 
    WHERE name = 'بيرسيفيرون'
    LIMIT 1
)
UPDATE orders 
SET items = (
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', pi.name,
            'quantity', COALESCE((item->>'quantity')::int, 1),
            'price', COALESCE((item->>'price')::numeric, 44750),
            'product_id', pi.id::text,
            'image_url', pi.image_url,
            'tag_color', pi.tag_color
        )
    )
    FROM jsonb_array_elements(orders.items) AS item, product_info pi
),
    updated_at = NOW()
WHERE order_id = '5565';

-- Verify the fix
SELECT order_id, customer_name, items::text 
FROM orders 
WHERE order_id = '5565';
