-- SQL to fix imported order prices AND link products
-- This script matches products by name and adds product_id to items

-- Step 1: Create a temporary matching table
-- This maps product names to product IDs

-- First run this to see your products
SELECT id, name FROM products;

-- Step 2: Update orders with product linking
-- This uses a function to match product names and add product_id

-- For each order, we need to update items array to include product_id
-- The matching is done by searching for product name patterns

-- =================================================================
-- OPTION A: Manual matching (if you know product IDs)
-- =================================================================

-- If you know your product mapping, run updates like this:
-- Example: UPDATE orders SET items = '[{"name":"عطر برسيفيرون","price":44750,"quantity":1,"product_id":"YOUR_PRODUCT_ID_HERE"}]'::jsonb WHERE order_id = '5491';

-- =================================================================
-- OPTION B: Auto-match by product name (recommended)
-- =================================================================

-- This function will try to match products and update the items array
DO $$
DECLARE
    order_row RECORD;
    item JSONB;
    new_items JSONB;
    matched_product_id UUID;
    product_name TEXT;
BEGIN
    -- Loop through all excel imported orders
    FOR order_row IN 
        SELECT id, order_id, items 
        FROM orders 
        WHERE source = 'excel_import'
    LOOP
        new_items := '[]'::jsonb;
        
        -- Loop through each item in the order
        FOR item IN SELECT * FROM jsonb_array_elements(order_row.items)
        LOOP
            product_name := item->>'name';
            
            -- Try to find matching product (case-insensitive partial match)
            SELECT id INTO matched_product_id
            FROM products
            WHERE 
                LOWER(name) LIKE '%' || LOWER(SUBSTRING(product_name FROM 1 FOR 20)) || '%'
                OR LOWER(product_name) LIKE '%' || LOWER(SUBSTRING(name FROM 1 FOR 10)) || '%'
            LIMIT 1;
            
            -- If found, add product_id to item
            IF matched_product_id IS NOT NULL THEN
                new_items := new_items || jsonb_build_object(
                    'name', item->>'name',
                    'price', (item->>'price')::numeric,
                    'quantity', (item->>'quantity')::integer,
                    'product_id', matched_product_id::text
                );
            ELSE
                -- Keep original item without product_id
                new_items := new_items || item;
            END IF;
        END LOOP;
        
        -- Update the order with new items
        UPDATE orders SET items = new_items WHERE id = order_row.id;
        
        RAISE NOTICE 'Updated order % with linked products', order_row.order_id;
    END LOOP;
END $$;

-- Verify: Check if products are linked
SELECT order_id, items FROM orders WHERE source = 'excel_import' LIMIT 5;
