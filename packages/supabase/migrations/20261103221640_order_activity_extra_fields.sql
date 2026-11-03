-- Order history: three more edits the browser used to note in its own
-- "Updated: …" row, which log_order_events (20261103220249) did not cover:
-- the order number (renamed through rename_order_number), the order date and
-- the payment status.
--
-- This trigger fires after trg_log_order_events (triggers on the same event run
-- in name order). When that trigger already wrote an `edit` row for this
-- UPDATE (same order, same transaction), the fields are added to it so one
-- save stays one entry; otherwise it writes its own row.

CREATE OR REPLACE FUNCTION public.log_order_extra_edits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_fields jsonb := '[]'::jsonb;
    v_row    uuid;
BEGIN
    IF NEW.tenant_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.order_id IS DISTINCT FROM OLD.order_id THEN
        v_fields := v_fields || jsonb_build_object('f', 'order_number', 'old', OLD.order_id, 'new', NEW.order_id);
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        v_fields := v_fields || jsonb_build_object('f', 'order_date', 'old', OLD.created_at, 'new', NEW.created_at);
    END IF;
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
        v_fields := v_fields || jsonb_build_object('f', 'payment_status', 'old', OLD.payment_status, 'new', NEW.payment_status);
    END IF;

    IF jsonb_array_length(v_fields) = 0 THEN
        RETURN NEW;
    END IF;

    SELECT ev.id INTO v_row
    FROM public.order_events ev
    WHERE ev.order_id = NEW.id AND ev.kind = 'edit' AND ev.created_at = now()
    ORDER BY ev.id
    LIMIT 1;

    IF v_row IS NOT NULL THEN
        UPDATE public.order_events
        SET data = jsonb_set(data, '{fields}', coalesce(data->'fields', '[]'::jsonb) || v_fields)
        WHERE id = v_row;
    ELSE
        INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data)
        VALUES (NEW.tenant_id, NEW.id, 'edit', auth.uid(),
                coalesce(public.order_event_actor_name(auth.uid()), 'System'),
                jsonb_build_object('fields', v_fields));
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_order_extra_edits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_order_extra_edits ON public.orders;
CREATE TRIGGER trg_log_order_extra_edits
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (
       OLD.order_id       IS DISTINCT FROM NEW.order_id
    OR OLD.created_at     IS DISTINCT FROM NEW.created_at
    OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
)
EXECUTE FUNCTION public.log_order_extra_edits();
