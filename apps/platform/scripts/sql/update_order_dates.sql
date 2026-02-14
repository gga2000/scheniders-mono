-- =============================================
-- Update Order Dates
-- Run this in Supabase SQL Editor
-- =============================================

-- 5579 -> Today (2026-01-01)
UPDATE orders 
SET created_at = '2026-01-01 12:00:00+03'
WHERE order_id = '5579';

-- 5581 -> Today (2026-01-01)
UPDATE orders 
SET created_at = '2026-01-01 12:00:00+03'
WHERE order_id = '5581';

-- 5569 -> Today (2026-01-01)
UPDATE orders 
SET created_at = '2026-01-01 12:00:00+03'
WHERE order_id = '5569';

-- 1260101010 -> Sunday 1/3 (2026-03-01)
UPDATE orders 
SET created_at = '2026-03-01 12:00:00+03'
WHERE order_id = '1260101010';

-- =============================================
-- Verification
-- =============================================
SELECT order_id, created_at, status 
FROM orders 
WHERE order_id IN ('5579', '5581', '5569', '1260101010');
