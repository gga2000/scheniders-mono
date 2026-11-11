-- Repo audit (ponytail) F3/F4: delivery import undo restores what the import changed,
-- and a receipt cannot be imported twice.

-- The order fields an import overwrote, read on the server just before it wrote them.
-- Null when the row changed nothing (acknowledged refunds) and on rows from before this.
ALTER TABLE public.delivery_import_items
    ADD COLUMN IF NOT EXISTS previous_values jsonb;

-- A double click created two imports of one receipt. Four such pairs predate this key
-- and stay as history, so it covers imports made from today on. A cancelled (undone)
-- import frees its receipt for a fresh import.
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_imports_tenant_receipt
    ON public.delivery_imports (tenant_id, receipt_number)
    WHERE status <> 'cancelled' AND created_at >= '2026-11-11 15:00:00+00';

-- Undo in one transaction. An order is put back only while it still has the status
-- this import gave it, so a later change by staff or the courier is never overwritten;
-- such orders are counted and left alone. Only fields captured in previous_values are
-- restored. Older rows without a snapshot get their status back, as before.
CREATE OR REPLACE FUNCTION public.rollback_delivery_import(p_tenant_id uuid, p_import_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_status text;
    v_item record;
    v_prev jsonb;
    v_restored integer := 0;
    v_changed integer := 0;
    v_skipped integer := 0;
BEGIN
    SELECT status INTO v_status FROM public.delivery_imports
     WHERE id = p_import_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'import not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_status <> 'confirmed' THEN
        RAISE EXCEPTION 'only a confirmed import can be undone; this one is %', v_status USING ERRCODE = '22023';
    END IF;

    FOR v_item IN
        SELECT order_id, previous_status, new_status, previous_values
          FROM public.delivery_import_items
         WHERE import_id = p_import_id AND tenant_id = p_tenant_id
           AND action = 'confirmed' AND order_id IS NOT NULL
         ORDER BY order_id
    LOOP
        v_prev := v_item.previous_values;
        IF v_prev IS NULL THEN
            IF v_item.previous_status IS NULL OR v_item.new_status IS NULL
               OR v_item.previous_status = v_item.new_status THEN
                v_skipped := v_skipped + 1;
                CONTINUE;
            END IF;
            UPDATE public.orders SET status = v_item.previous_status
             WHERE id = v_item.order_id AND tenant_id = p_tenant_id AND status = v_item.new_status;
        ELSE
            UPDATE public.orders SET
                status            = CASE WHEN v_prev ? 'status' THEN v_prev->>'status' ELSE status END,
                price             = CASE WHEN v_prev ? 'price' THEN (v_prev->>'price')::numeric ELSE price END,
                delivered_at      = CASE WHEN v_prev ? 'delivered_at' THEN (v_prev->>'delivered_at')::timestamptz ELSE delivered_at END,
                needs_attention   = CASE WHEN v_prev ? 'needs_attention' THEN (v_prev->>'needs_attention')::boolean ELSE needs_attention END,
                attention_reasons = CASE WHEN v_prev ? 'attention_reasons'
                                         THEN CASE WHEN jsonb_typeof(v_prev->'attention_reasons') = 'array'
                                                   THEN ARRAY(SELECT jsonb_array_elements_text(v_prev->'attention_reasons'))
                                              END
                                         ELSE attention_reasons END,
                delivery_note     = CASE WHEN v_prev ? 'delivery_note' THEN v_prev->>'delivery_note' ELSE delivery_note END
             WHERE id = v_item.order_id AND tenant_id = p_tenant_id AND status = v_item.new_status;
        END IF;
        IF FOUND THEN
            v_restored := v_restored + 1;
        ELSE
            v_changed := v_changed + 1;
        END IF;
    END LOOP;

    UPDATE public.delivery_imports SET status = 'cancelled'
     WHERE id = p_import_id AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object('restored', v_restored, 'changed_since', v_changed, 'skipped', v_skipped);
END;
$function$;

REVOKE ALL ON FUNCTION public.rollback_delivery_import(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_delivery_import(uuid, uuid) TO service_role;
