-- Prime payment approval closes what Prime actually delivered and paid.
--
-- prime_approve_payment only moved matched orders from "delivered" to
-- "completed". Orders sent before the Prime link (or on Excel) never get a
-- delivered step from Prime, so a payment full of them closed almost nothing
-- and, once approved, could never close them later. Prime paying a parcel
-- means it was delivered, so a matched order now closes from "in_transit" or
-- "delivered":
--   * a sale or replacement -> completed
--   * a refund trip (is_return) -> refund_delivered (the courier handed the
--     money back and picked the item up, which is what Prime's negative line
--     on the payment is)
-- Each item row records the order's real status before the change, so a
-- rollback from the delivery history puts it back where it was.

CREATE OR REPLACE FUNCTION public.prime_approve_payment(
    p_tenant_id  uuid,
    p_payment_id bigint,
    p_user_id    uuid,
    p_changed_by text,
    p_amount     bigint,
    p_paid_at    timestamptz,
    p_rows       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_import uuid;
    v_closed jsonb;
    v_total  integer := jsonb_array_length(p_rows);
BEGIN
    INSERT INTO delivery_imports (
        tenant_id, receipt_number, payment_date, receiving_agent, total_orders, total_amount,
        status, imported_by, confirmed_by, confirmed_at, raw_data
    )
    VALUES (
        p_tenant_id, p_payment_id::text, coalesce(p_paid_at, now()), 'Prime', v_total, p_amount,
        'confirmed', p_user_id, p_user_id, now(),
        jsonb_build_object('source', 'prime_api', 'payment_id', p_payment_id, 'rows', p_rows)
    )
    RETURNING id INTO v_import;

    WITH target AS (
        SELECT o.id,
               o.status AS previous_status,
               CASE WHEN coalesce(o.is_return, false) THEN 'refund_delivered' ELSE 'completed' END AS new_status
          FROM orders o
         WHERE o.tenant_id = p_tenant_id
           AND o.status IN ('in_transit', 'delivered')
           AND o.deleted_at IS NULL
           AND o.id IN (
               SELECT (r->>'order_id')::uuid
                 FROM jsonb_array_elements(p_rows) r
                WHERE r->>'kind' = 'match' AND r->>'order_id' IS NOT NULL
           )
           FOR UPDATE OF o
    ), done AS (
        UPDATE orders o
           SET status = t.new_status,
               last_status_changed_by_name = p_changed_by
          FROM target t
         WHERE o.id = t.id
        RETURNING o.id, t.previous_status, t.new_status
    )
    SELECT coalesce(jsonb_object_agg(id::text, jsonb_build_object('from', previous_status, 'to', new_status)), '{}'::jsonb)
      INTO v_closed
      FROM done;

    INSERT INTO delivery_import_items (
        tenant_id, import_id, order_id, pdf_row_number, pdf_shipment_number,
        pdf_amount, pdf_delivery_fee, pdf_net_amount, match_category, match_details,
        action, previous_status, new_status
    )
    SELECT p_tenant_id,
           v_import,
           (t.r->>'order_id')::uuid,
           t.ord::integer,
           t.r->>'case_id',
           (t.r->>'collect')::integer,
           (t.r->>'fee')::integer,
           (t.r->>'net')::integer,
           CASE t.r->>'kind' WHEN 'match' THEN 'clean' ELSE t.r->>'kind' END,
           jsonb_build_object('details', 'Prime payment ' || p_payment_id, 'diff', t.r->'diff'),
           CASE WHEN v_closed ? (t.r->>'order_id') THEN 'confirmed' ELSE 'skipped' END,
           coalesce(v_closed -> (t.r->>'order_id') ->> 'from', t.r->>'status'),
           v_closed -> (t.r->>'order_id') ->> 'to'
      FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(r, ord);

    UPDATE delivery_imports
       SET processed_count = (SELECT count(*) FROM jsonb_object_keys(v_closed)),
           skipped_count = v_total - (SELECT count(*) FROM jsonb_object_keys(v_closed))
     WHERE id = v_import;

    RETURN jsonb_build_object('import_id', v_import, 'completed', (SELECT count(*) FROM jsonb_object_keys(v_closed)));
END;
$$;
REVOKE ALL ON FUNCTION public.prime_approve_payment(uuid, bigint, uuid, text, bigint, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prime_approve_payment(uuid, bigint, uuid, text, bigint, timestamptz, jsonb) TO service_role;
