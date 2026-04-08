-- Check what happened with the most recent button click
-- Order: 4260319020, Time: 2026-03-19 02:35:59

-- 1. Get the full webhook payload
SELECT
    created_at,
    order_id,
    phone,
    status,
    payload
FROM whatsapp_logs
WHERE order_id = '4260319020'
AND direction = 'inbound'
AND created_at >= '2026-03-19 02:00:00'
ORDER BY created_at DESC;

-- 2. Check if the order status changed
SELECT
    order_id,
    status,
    updated_at,
    last_contacted_at
FROM orders
WHERE order_id = '4260319020';

-- 3. Check order status history for this order
SELECT
    osh.changed_at,
    osh.from_status,
    osh.to_status,
    osh.changed_by,
    osh.notes
FROM order_status_history osh
JOIN orders o ON o.id = osh.order_id
WHERE o.order_id = '4260319020'
ORDER BY osh.changed_at DESC;

-- 4. Get the order UUID for this order
SELECT id, order_id, status, phone
FROM orders
WHERE order_id = '4260319020';
