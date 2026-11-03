-- Order history (السجل) reads every action on an order from the database.
--
-- Before this, the history tab showed only order_status_history and
-- order_notes. Detail edits were a row the browser composed itself
-- ("Updated: Name: a → b, Secondary Phone: None → None") after the PATCH, in
-- English, and only from the orders page: bulk tools, Claude, merges and the
-- server routes left no trace. Label prints, courier hand-offs, courier
-- progress, payment checks and refund state left none either.
--
-- 1. order_events: one append-only row per action the status history does not
--    already hold. Only the triggers below write it (SECURITY DEFINER); members
--    of the tenant can read their own rows and nothing else.
-- 2. log_order_events(): AFTER UPDATE on orders. One `edit` row per UPDATE that
--    changed customer-facing fields (old → new per field), one `flag` row for
--    gift / priority / pin, plus label printed, Waseet hand-off, Waseet status,
--    payment checked and refund state. Actor = the signed-in user, else System.
-- 3. log_prime_shipment_events(): AFTER INSERT/UPDATE on prime_shipments.
--    Sent to Prime, each new Prime step, edits Prime accepted or refused,
--    cancellations and resends. Prime is written by server routes only, so the
--    actor is Prime / System; the staff move to in transit is in the status
--    history with the real name.
-- 4. get_order_activity(order): one round trip for the history tab. SECURITY
--    INVOKER, so every table's own tenant RLS applies.
--
-- No backfill: we cannot know who edited or printed an order in the past, and
-- a made-up audit row is worse than a missing one.

CREATE TABLE IF NOT EXISTS public.order_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN (
                    'edit', 'flag', 'label_printed',
                    'courier_submitted', 'courier_status', 'courier_synced',
                    'courier_sync_failed', 'courier_cancelled', 'courier_resent',
                    'payment_checked', 'payment_unchecked', 'refund_status')),
    actor_id    uuid,
    actor_name  text NOT NULL,
    data        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_created
    ON public.order_events (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_events_tenant
    ON public.order_events (tenant_id);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_events_member_read ON public.order_events;
CREATE POLICY order_events_member_read ON public.order_events
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- Append-only from the triggers: no browser role writes, edits or deletes it.
REVOKE ALL ON public.order_events FROM anon, authenticated;
GRANT SELECT ON public.order_events TO authenticated;

-- The display name for the signed-in user, or NULL for service role / cron.
CREATE OR REPLACE FUNCTION public.order_event_actor_name(p_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT coalesce(
        (SELECT nullif(btrim(up.display_name), '') FROM public.user_profiles up WHERE up.id = p_uid),
        (SELECT u.email FROM auth.users u WHERE u.id = p_uid)
    )
    WHERE p_uid IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.order_event_actor_name(uuid) FROM PUBLIC, anon, authenticated;

-- "Envoy ×2، Wayfarer" — the items list as a person reads it.
CREATE OR REPLACE FUNCTION public.order_event_items_text(p_items jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT string_agg(
        coalesce(nullif(btrim(i->>'name'), ''), '?')
            || CASE WHEN (i->>'quantity') ~ '^[0-9]+$' AND (i->>'quantity')::bigint > 1
                    THEN ' ×' || (i->>'quantity') ELSE '' END,
        '، ' ORDER BY ord)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END)
         WITH ORDINALITY AS t(i, ord);
$$;

REVOKE ALL ON FUNCTION public.order_event_items_text(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_event_items_text(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_order_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_uid    uuid := auth.uid();
    v_actor  text := coalesce(public.order_event_actor_name(auth.uid()), 'System');
    v_fields jsonb := '[]'::jsonb;
    v_flags  jsonb := '[]'::jsonb;
BEGIN
    IF NEW.tenant_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Detail edits, one row per UPDATE. Values are text so the feed can show them as-is.
    IF NEW.customer_name IS DISTINCT FROM OLD.customer_name THEN
        v_fields := v_fields || jsonb_build_object('f', 'customer_name', 'old', OLD.customer_name, 'new', NEW.customer_name);
    END IF;
    IF NEW.phone IS DISTINCT FROM OLD.phone THEN
        v_fields := v_fields || jsonb_build_object('f', 'phone', 'old', OLD.phone, 'new', NEW.phone);
    END IF;
    IF nullif(btrim(NEW.secondary_phone), '') IS DISTINCT FROM nullif(btrim(OLD.secondary_phone), '') THEN
        v_fields := v_fields || jsonb_build_object('f', 'secondary_phone', 'old', OLD.secondary_phone, 'new', NEW.secondary_phone);
    END IF;
    IF NEW.governorate_code IS DISTINCT FROM OLD.governorate_code THEN
        v_fields := v_fields || jsonb_build_object('f', 'governorate', 'old', OLD.governorate_code, 'new', NEW.governorate_code);
    END IF;
    IF NEW.city IS DISTINCT FROM OLD.city THEN
        v_fields := v_fields || jsonb_build_object('f', 'city', 'old', OLD.city, 'new', NEW.city);
    END IF;
    IF nullif(btrim(NEW.address_details), '') IS DISTINCT FROM nullif(btrim(OLD.address_details), '') THEN
        v_fields := v_fields || jsonb_build_object('f', 'address', 'old', OLD.address_details, 'new', NEW.address_details);
    END IF;
    IF NEW.items IS DISTINCT FROM OLD.items
       AND public.order_event_items_text(NEW.items) IS DISTINCT FROM public.order_event_items_text(OLD.items) THEN
        v_fields := v_fields || jsonb_build_object('f', 'items',
            'old', public.order_event_items_text(OLD.items), 'new', public.order_event_items_text(NEW.items));
    END IF;
    IF NEW.price IS DISTINCT FROM OLD.price THEN
        v_fields := v_fields || jsonb_build_object('f', 'price', 'old', round(OLD.price)::bigint, 'new', round(NEW.price)::bigint);
    END IF;
    IF coalesce(NEW.delivery_fee, 0) IS DISTINCT FROM coalesce(OLD.delivery_fee, 0) THEN
        v_fields := v_fields || jsonb_build_object('f', 'delivery_fee', 'old', round(OLD.delivery_fee)::bigint, 'new', round(NEW.delivery_fee)::bigint);
    END IF;
    IF coalesce(NEW.discount_amount, 0) IS DISTINCT FROM coalesce(OLD.discount_amount, 0) THEN
        v_fields := v_fields || jsonb_build_object('f', 'discount', 'old', round(OLD.discount_amount)::bigint, 'new', round(NEW.discount_amount)::bigint);
    END IF;
    IF nullif(btrim(NEW.notes), '') IS DISTINCT FROM nullif(btrim(OLD.notes), '') THEN
        v_fields := v_fields || jsonb_build_object('f', 'notes', 'old', OLD.notes, 'new', NEW.notes);
    END IF;
    IF nullif(btrim(NEW.internal_notes), '') IS DISTINCT FROM nullif(btrim(OLD.internal_notes), '') THEN
        v_fields := v_fields || jsonb_build_object('f', 'internal_notes', 'old', OLD.internal_notes, 'new', NEW.internal_notes);
    END IF;
    IF nullif(btrim(NEW.delivery_note), '') IS DISTINCT FROM nullif(btrim(OLD.delivery_note), '') THEN
        v_fields := v_fields || jsonb_build_object('f', 'delivery_note', 'old', OLD.delivery_note, 'new', NEW.delivery_note);
    END IF;
    IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
        v_fields := v_fields || jsonb_build_object('f', 'scheduled_date', 'old', OLD.scheduled_date, 'new', NEW.scheduled_date);
    END IF;
    IF nullif(btrim(NEW.delivery_slot), '') IS DISTINCT FROM nullif(btrim(OLD.delivery_slot), '') THEN
        v_fields := v_fields || jsonb_build_object('f', 'delivery_slot', 'old', OLD.delivery_slot, 'new', NEW.delivery_slot);
    END IF;

    IF jsonb_array_length(v_fields) > 0 THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data)
        VALUES (NEW.tenant_id, NEW.id, 'edit', v_uid, v_actor, jsonb_build_object('fields', v_fields));
    END IF;

    -- Flags.
    IF coalesce(NEW.is_gift, false) IS DISTINCT FROM coalesce(OLD.is_gift, false) THEN
        v_flags := v_flags || jsonb_build_object('f', 'gift', 'on', coalesce(NEW.is_gift, false));
    END IF;
    IF nullif(NEW.priority, '') IS DISTINCT FROM nullif(OLD.priority, '') THEN
        v_flags := v_flags || jsonb_build_object('f', 'priority', 'old', OLD.priority, 'new', NEW.priority);
    END IF;
    IF coalesce(NEW.is_pinned, false) IS DISTINCT FROM coalesce(OLD.is_pinned, false) THEN
        v_flags := v_flags || jsonb_build_object('f', 'pinned', 'on', coalesce(NEW.is_pinned, false));
    END IF;
    IF jsonb_array_length(v_flags) > 0 THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data)
        VALUES (NEW.tenant_id, NEW.id, 'flag', v_uid, v_actor, jsonb_build_object('flags', v_flags));
    END IF;

    -- Label printed: the dispatch desk and the print dialog both bump print_count.
    IF coalesce(NEW.print_count, 0) > coalesce(OLD.print_count, 0) THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data)
        VALUES (NEW.tenant_id, NEW.id, 'label_printed', v_uid, v_actor,
                jsonb_build_object('count', NEW.print_count));
    END IF;

    -- Waseet hand-off and Waseet's own status text (Prime has its own table, below).
    IF NEW.waseet_submitted_at IS NOT NULL AND NEW.waseet_submitted_at IS DISTINCT FROM OLD.waseet_submitted_at THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data)
        VALUES (NEW.tenant_id, NEW.id, 'courier_submitted', v_uid, v_actor,
                jsonb_build_object('company', 'waseet', 'tracking', coalesce(NEW.waseet_qr_id, NEW.delivery_order_id)));
    END IF;
    IF nullif(btrim(NEW.waseet_status_text), '') IS NOT NULL
       AND NEW.waseet_status_text IS DISTINCT FROM OLD.waseet_status_text THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data)
        VALUES (NEW.tenant_id, NEW.id, 'courier_status', NULL, 'Waseet',
                jsonb_build_object('company', 'waseet', 'step', NEW.waseet_status_text));
    END IF;

    -- Payment checked (orders_stamp_payment_checked stamps reviewed_by).
    IF NEW.reviewed_at IS NOT NULL AND OLD.reviewed_at IS NULL THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data)
        VALUES (NEW.tenant_id, NEW.id, 'payment_checked', coalesce(NEW.reviewed_by, v_uid),
                coalesce(public.order_event_actor_name(NEW.reviewed_by), v_actor), '{}'::jsonb);
    ELSIF NEW.reviewed_at IS NULL AND OLD.reviewed_at IS NOT NULL THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data)
        VALUES (NEW.tenant_id, NEW.id, 'payment_unchecked', v_uid, v_actor, '{}'::jsonb);
    END IF;

    IF NEW.refund_status IS DISTINCT FROM OLD.refund_status THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data)
        VALUES (NEW.tenant_id, NEW.id, 'refund_status', v_uid, v_actor,
                jsonb_build_object('old', OLD.refund_status::text, 'new', NEW.refund_status::text,
                                   'amount', NEW.refunded_amount));
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_order_events() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_order_events ON public.orders;
CREATE TRIGGER trg_log_order_events
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (
       OLD.customer_name    IS DISTINCT FROM NEW.customer_name
    OR OLD.phone            IS DISTINCT FROM NEW.phone
    OR OLD.secondary_phone  IS DISTINCT FROM NEW.secondary_phone
    OR OLD.governorate_code IS DISTINCT FROM NEW.governorate_code
    OR OLD.city             IS DISTINCT FROM NEW.city
    OR OLD.address_details  IS DISTINCT FROM NEW.address_details
    OR OLD.items            IS DISTINCT FROM NEW.items
    OR OLD.price            IS DISTINCT FROM NEW.price
    OR OLD.delivery_fee     IS DISTINCT FROM NEW.delivery_fee
    OR OLD.discount_amount  IS DISTINCT FROM NEW.discount_amount
    OR OLD.notes            IS DISTINCT FROM NEW.notes
    OR OLD.internal_notes   IS DISTINCT FROM NEW.internal_notes
    OR OLD.delivery_note    IS DISTINCT FROM NEW.delivery_note
    OR OLD.scheduled_date   IS DISTINCT FROM NEW.scheduled_date
    OR OLD.delivery_slot    IS DISTINCT FROM NEW.delivery_slot
    OR OLD.is_gift          IS DISTINCT FROM NEW.is_gift
    OR OLD.priority         IS DISTINCT FROM NEW.priority
    OR OLD.is_pinned        IS DISTINCT FROM NEW.is_pinned
    OR OLD.print_count      IS DISTINCT FROM NEW.print_count
    OR OLD.waseet_submitted_at IS DISTINCT FROM NEW.waseet_submitted_at
    OR OLD.waseet_status_text  IS DISTINCT FROM NEW.waseet_status_text
    OR OLD.reviewed_at      IS DISTINCT FROM NEW.reviewed_at
    OR OLD.refund_status    IS DISTINCT FROM NEW.refund_status
)
EXECUTE FUNCTION public.log_order_events();

CREATE OR REPLACE FUNCTION public.log_prime_shipment_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data, created_at)
        VALUES (NEW.tenant_id, NEW.order_id, 'courier_submitted', auth.uid(),
                coalesce(public.order_event_actor_name(auth.uid()), 'System'),
                jsonb_build_object('company', 'prime', 'tracking', NEW.receipt_no), NEW.sent_at);
        RETURN NEW;
    END IF;

    IF nullif(btrim(NEW.step_name), '') IS NOT NULL
       AND (NEW.step_code IS DISTINCT FROM OLD.step_code OR NEW.step_name IS DISTINCT FROM OLD.step_name) THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data, created_at)
        VALUES (NEW.tenant_id, NEW.order_id, 'courier_status', NULL, 'Prime',
                jsonb_build_object('company', 'prime', 'step', NEW.step_name, 'status', NEW.shipment_status),
                coalesce(NEW.status_changed_at, now()));
    END IF;
    IF NEW.pushed_at IS NOT NULL AND NEW.pushed_at IS DISTINCT FROM OLD.pushed_at THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data, created_at)
        VALUES (NEW.tenant_id, NEW.order_id, 'courier_synced', NULL, 'Prime',
                jsonb_build_object('company', 'prime'), NEW.pushed_at);
    END IF;
    IF nullif(btrim(NEW.push_error), '') IS NOT NULL AND NEW.push_error IS DISTINCT FROM OLD.push_error THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data)
        VALUES (NEW.tenant_id, NEW.order_id, 'courier_sync_failed', NULL, 'Prime',
                jsonb_build_object('company', 'prime', 'reason', NEW.push_error));
    END IF;
    IF NEW.cancelled_at IS NOT NULL AND OLD.cancelled_at IS NULL THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data, created_at)
        VALUES (NEW.tenant_id, NEW.order_id, 'courier_cancelled', NULL, 'Prime',
                jsonb_build_object('company', 'prime'), NEW.cancelled_at);
    END IF;
    IF NEW.resent_at IS NOT NULL AND NEW.resent_at IS DISTINCT FROM OLD.resent_at THEN
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data, created_at)
        VALUES (NEW.tenant_id, NEW.order_id, 'courier_resent', auth.uid(),
                coalesce(public.order_event_actor_name(auth.uid()), 'System'),
                jsonb_build_object('company', 'prime', 'tracking', NEW.receipt_no), NEW.resent_at);
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_prime_shipment_events() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_prime_shipment_events ON public.prime_shipments;
CREATE TRIGGER trg_log_prime_shipment_events
AFTER INSERT OR UPDATE ON public.prime_shipments
FOR EACH ROW
EXECUTE FUNCTION public.log_prime_shipment_events();

-- The feed reads notes per order; nothing indexed that before.
CREATE INDEX IF NOT EXISTS idx_order_notes_order_id ON public.order_notes (order_id);

-- Everything the history tab shows, in one call. SECURITY INVOKER: each table's
-- own tenant RLS decides what comes back, so another tenant's order id returns
-- an empty feed.
CREATE OR REPLACE FUNCTION public.get_order_activity(p_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
WITH o AS (
    SELECT o.* FROM public.orders o WHERE o.id = p_order_id
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
    SELECT w.* FROM public.whatsapp_logs w JOIN o ON o.id = w.order_uuid AND o.tenant_id = w.tenant_id
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
