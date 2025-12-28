-- Check today's orders for governorate_code issues
SELECT 
    order_id,
    city,
    governorate_code,
    LEFT(address_details, 40) as address_short,
    created_at
FROM orders 
WHERE created_at >= '2025-12-28'
ORDER BY created_at DESC
LIMIT 15;
