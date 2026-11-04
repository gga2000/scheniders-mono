-- Prime cash check: how each Prime payment matched our orders, and the
-- administrator's approval that closes the matched orders as paid.
--
-- The approval is recorded as a delivery import (the same record the PDF
-- payment import writes), so it shows in the delivery history, a PDF of the
-- same payment is flagged as already done, and it can be rolled back there.

CREATE TABLE IF NOT EXISTS public.prime_payment_checks (
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    payment_id  BIGINT NOT NULL,
    parcels     INTEGER NOT NULL,
    matched     INTEGER NOT NULL,
    different   INTEGER NOT NULL,
    unknown     INTEGER NOT NULL,
    diff        BIGINT NOT NULL,
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, payment_id)
);

COMMENT ON TABLE public.prime_payment_checks IS 'How each Prime payment''s parcels matched our orders when last checked. Written and read by the server only.';
COMMENT ON COLUMN public.prime_payment_checks.diff IS 'Sum of per-parcel differences in IQD: Prime paid this much more (less when negative) than our books expect.';

ALTER TABLE public.prime_payment_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prime_payment_checks FROM anon, authenticated;

-- One live in-app approval per Prime payment, even when two administrators press at once.
CREATE UNIQUE INDEX IF NOT EXISTS delivery_imports_prime_payment_once
    ON public.delivery_imports (tenant_id, receipt_number)
    WHERE raw_data->>'source' = 'prime_api' AND status IN ('confirmed', 'completed');

/*
 * Approves one Prime payment in one transaction: records it as a delivery
 * import, moves its matched orders from delivered to completed, and keeps a
 * row per parcel (completed ones can be rolled back from the delivery
 * history). Only rows the server matched as kind 'match' are completed, and
 * only the tenant's own delivered orders. Server only.
 *
 * p_rows: [{order_id, case_id, collect, fee, net, kind, status, diff}]
 */
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
    v_import    uuid;
    v_completed uuid[];
    v_total     integer := jsonb_array_length(p_rows);
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

    WITH done AS (
        UPDATE orders o
           SET status = 'completed',
               last_status_changed_by_name = p_changed_by
         WHERE o.tenant_id = p_tenant_id
           AND o.status = 'delivered'
           AND o.deleted_at IS NULL
           AND o.id IN (
               SELECT (r->>'order_id')::uuid
                 FROM jsonb_array_elements(p_rows) r
                WHERE r->>'kind' = 'match' AND r->>'order_id' IS NOT NULL
           )
        RETURNING o.id
    )
    SELECT coalesce(array_agg(id), '{}') INTO v_completed FROM done;

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
           CASE WHEN (t.r->>'order_id')::uuid = ANY (v_completed) THEN 'confirmed' ELSE 'skipped' END,
           CASE WHEN (t.r->>'order_id')::uuid = ANY (v_completed) THEN 'delivered' ELSE t.r->>'status' END,
           CASE WHEN (t.r->>'order_id')::uuid = ANY (v_completed) THEN 'completed' END
      FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(r, ord);

    UPDATE delivery_imports
       SET processed_count = cardinality(v_completed),
           skipped_count = v_total - cardinality(v_completed)
     WHERE id = v_import;

    RETURN jsonb_build_object('import_id', v_import, 'completed', cardinality(v_completed));
END;
$$;

REVOKE ALL ON FUNCTION public.prime_approve_payment(uuid, bigint, uuid, text, bigint, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prime_approve_payment(uuid, bigint, uuid, text, bigint, timestamptz, jsonb) TO service_role;
