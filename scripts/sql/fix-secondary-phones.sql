-- =============================================
-- Fix Secondary Phone Numbers for Today's Orders
-- Orders from 12/28 that were created before deployment
-- =============================================

-- Update all 8 orders with their secondary phone numbers
UPDATE orders SET secondary_phone = '07518745677' WHERE order_id = '5558';
UPDATE orders SET secondary_phone = '07507702262' WHERE order_id = '5559';
UPDATE orders SET secondary_phone = '07740508585' WHERE order_id = '5560';
UPDATE orders SET secondary_phone = '07712129869' WHERE order_id = '5561';
UPDATE orders SET secondary_phone = '07735061772' WHERE order_id = '5562';
UPDATE orders SET secondary_phone = '07819809910' WHERE order_id = '5563';
UPDATE orders SET secondary_phone = '07727726967' WHERE order_id = '5564';
UPDATE orders SET secondary_phone = '07504421967' WHERE order_id = '5565';

-- Verify the updates
SELECT order_id, customer_name, phone, secondary_phone 
FROM orders 
WHERE order_id IN ('5558', '5559', '5560', '5561', '5562', '5563', '5564', '5565')
ORDER BY order_id;
