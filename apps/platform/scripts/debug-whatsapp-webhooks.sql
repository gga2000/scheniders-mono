-- Debug WhatsApp webhook activity
-- Run this in Supabase SQL Editor to see what's happening

-- 1. Recent outbound messages (messages we sent)
SELECT
    created_at,
    order_id,
    phone,
    template_name,
    status,
    interakt_message_id,
    payload->>'error' as error_message,
    payload->>'source' as source
FROM whatsapp_logs
WHERE direction = 'outbound'
ORDER BY created_at DESC
LIMIT 10;

-- 2. Recent inbound webhooks (button clicks from customers)
SELECT
    created_at,
    order_id,
    phone,
    direction,
    status,
    payload->'type' as webhook_type,
    payload->'data'->'message'->>'button_reply' as button_data,
    payload->'data'->'message'->>'text' as message_text,
    payload->'data'->'message'->'context'->>'callback_data' as callback_data
FROM whatsapp_logs
WHERE direction = 'inbound'
ORDER BY created_at DESC
LIMIT 10;

-- 3. Recent webhook debug logs (unprocessed webhooks)
SELECT
    created_at,
    status as webhook_type,
    phone,
    payload->'type' as payload_type,
    payload->'data' as webhook_data
FROM whatsapp_logs
WHERE direction = 'webhook_debug'
ORDER BY created_at DESC
LIMIT 10;

-- 4. Orders that were contacted recently but status didn't change
SELECT
    o.order_id,
    o.status,
    o.last_contacted_at,
    o.created_at,
    o.phone,
    (SELECT COUNT(*) FROM whatsapp_logs wl WHERE wl.order_uuid = o.id AND wl.direction = 'outbound') as messages_sent,
    (SELECT COUNT(*) FROM whatsapp_logs wl WHERE wl.order_uuid = o.id AND wl.direction = 'inbound') as responses_received
FROM orders o
WHERE o.last_contacted_at > NOW() - INTERVAL '24 hours'
AND o.status = 'contacted'
ORDER BY o.last_contacted_at DESC
LIMIT 10;

-- 5. Recent order status changes from whatsapp_bot
SELECT
    osh.changed_at,
    osh.order_id,
    o.order_id as display_order_id,
    osh.from_status,
    osh.to_status,
    osh.changed_by,
    osh.notes
FROM order_status_history osh
JOIN orders o ON o.id = osh.order_id
WHERE osh.changed_by = 'whatsapp_bot'
ORDER BY osh.changed_at DESC
LIMIT 10;
