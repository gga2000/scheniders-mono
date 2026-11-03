-- get_order_activity (20261103220249) read `orders.*`. Members are not granted
-- the cost and profit columns (product_cost, net_profit, item_unit_costs, the
-- Waseet prices), so the call failed with "permission denied for table orders"
-- for every signed-in user. It now names the columns it shows.

CREATE OR REPLACE FUNCTION public.get_order_activity(p_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
WITH o AS (
    -- Named columns: cost and profit columns are not granted to members.
    SELECT o.id, o.tenant_id, o.created_at, o.source, o.created_via, o.entered_by,
           o.price, o.items, o.is_replacement, o.is_return, o.original_order_id
    FROM public.orders o WHERE o.id = p_order_id
),
status_rows AS (
    SELECT jsonb_build_object(
        'id', h.id, 'type', 'status', 'at', h.changed_at, 'actor', h.changed_by,
        'from', h.from_status, 'to', h.to_status, 'notes', h.notes) AS e
    FROM public.order_status_history h JOIN o ON o.id = h.order_id
    -- A browser on older code still writes its own "Updated: …" row next to the
    -- trigger's edit event; show the event, not both.
    WHERE NOT (
        h.from_status = h.to_status AND h.notes LIKE 'Updated:%'
        AND EXISTS (SELECT 1 FROM public.order_events ev
                    WHERE ev.order_id = h.order_id AND ev.kind = 'edit'
                      AND ev.created_at BETWEEN h.changed_at - interval '15 seconds'
                                            AND h.changed_at + interval '15 seconds'))
),
event_rows AS (
    SELECT jsonb_build_object(
        'id', ev.id, 'type', ev.kind, 'at', ev.created_at, 'actor', ev.actor_name, 'data', ev.data) AS e
    FROM public.order_events ev JOIN o ON o.id = ev.order_id
),
note_rows AS (
    SELECT jsonb_build_object(
        'id', n.id, 'type', 'note', 'at', n.created_at, 'actor', n.created_by, 'text', n.note) AS e
    FROM public.order_notes n JOIN o ON o.id = n.order_id
),
wa AS (
    SELECT w.id, w.created_at, w.template_name, w.direction, w.status, w.interakt_message_id, w.payload
    FROM public.whatsapp_logs w JOIN o ON o.id = w.order_uuid AND o.tenant_id = w.tenant_id
),
wa_out AS (
    -- One row per message we sent, with the furthest state Interakt reported.
    SELECT jsonb_build_object(
        'id', min(w.id::text), 'type', 'whatsapp', 'at', min(w.created_at),
        'actor', 'Automation',
        'data', jsonb_build_object(
            'template', min(w.template_name),
            'sent_at', min(w.created_at) FILTER (WHERE w.status = 'sent'),
            'delivered_at', min(w.created_at) FILTER (WHERE w.status = 'delivered'),
            'read_at', min(w.created_at) FILTER (WHERE w.status = 'read'),
            'failed_at', min(w.created_at) FILTER (WHERE w.status = 'failed'),
            'reason', min(w.payload->'data'->'message'->>'channel_failure_reason') FILTER (WHERE w.status = 'failed'))) AS e
    FROM wa w
    WHERE w.direction IN ('outbound', 'status_update')
    GROUP BY coalesce(w.interakt_message_id, w.id::text)
),
wa_in AS (
    SELECT jsonb_build_object(
        'id', w.id, 'type', 'whatsapp_reply', 'at', w.created_at, 'actor', 'Customer',
        'data', jsonb_build_object(
            'button', w.payload->'data'->'message'->>'button_text',
            'template', w.template_name)) AS e
    FROM wa w
    WHERE w.direction = 'inbound'
),
related AS (
    SELECT jsonb_build_object(
        'id', r.id, 'type', 'related', 'at', r.created_at, 'actor', NULL,
        'data', jsonb_build_object(
            'order_uuid', r.id, 'order_number', r.order_id,
            'kind', CASE WHEN r.is_return THEN 'refund' WHEN r.is_replacement THEN 'replacement' ELSE 'linked' END)) AS e
    FROM public.orders r JOIN o ON r.original_order_id = o.id AND r.tenant_id = o.tenant_id
    WHERE r.deleted_at IS NULL
)
SELECT jsonb_build_object(
    'order', (
        SELECT jsonb_build_object(
            'created_at', o.created_at,
            'source', o.source,
            'created_via', o.created_via,
            'entered_by', (SELECT nullif(btrim(up.display_name), '') FROM public.user_profiles up WHERE up.id = o.entered_by),
            'price', round(o.price)::bigint,
            'items', public.order_event_items_text(o.items),
            'pieces', (SELECT coalesce(sum(CASE WHEN (i->>'quantity') ~ '^[0-9]+$' THEN (i->>'quantity')::bigint ELSE 1 END), 0)::int
                       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) i),
            'is_replacement', coalesce(o.is_replacement, false),
            'is_return', coalesce(o.is_return, false),
            'original', (SELECT jsonb_build_object('order_uuid', p.id, 'order_number', p.order_id)
                         FROM public.orders p WHERE p.id = o.original_order_id AND p.tenant_id = o.tenant_id))
        FROM o),
    'events', coalesce((
        SELECT jsonb_agg(x.e ORDER BY (x.e->>'at')::timestamptz DESC)
        FROM (
            SELECT e FROM status_rows UNION ALL
            SELECT e FROM event_rows  UNION ALL
            SELECT e FROM note_rows   UNION ALL
            SELECT e FROM wa_out      UNION ALL
            SELECT e FROM wa_in       UNION ALL
            SELECT e FROM related
        ) x), '[]'::jsonb)
)
WHERE EXISTS (SELECT 1 FROM o);
$$;

REVOKE ALL ON FUNCTION public.get_order_activity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_activity(uuid) TO authenticated;
