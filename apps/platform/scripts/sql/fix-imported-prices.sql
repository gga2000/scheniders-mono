-- Fix imported orders with price = 0
-- This recalculates price from the items array

-- First, let's see which orders need fixing (source = 'excel_import' and price = 0)
SELECT id, order_id, customer_name, price, items
FROM orders
WHERE source = 'excel_import' 
  AND price = 0
LIMIT 10;

-- Update orders: calculate price from items array
-- Formula: SUM(item.price * item.quantity) for each item
UPDATE orders
SET price = (
    SELECT COALESCE(SUM(
        (item->>'price')::numeric * (item->>'quantity')::numeric
    ), 0)
    FROM jsonb_array_elements(items) AS item
)
WHERE source = 'excel_import' 
  AND (price = 0 OR price IS NULL);

-- Verify the fix
SELECT id, order_id, customer_name, price, items
FROM orders
WHERE source = 'excel_import'
ORDER BY created_at DESC
LIMIT 10;
