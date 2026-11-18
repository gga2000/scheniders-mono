-- Fermi B4 follow-up: an export whose file reached the merchant counts as
-- sent even when its Prime/Al-Waseet export batch could not be saved.
--
-- log_shipping_export records such a run as succeeded = false with
-- failure_stage 'batch_record' (the file is already downloaded; only the
-- printing page's batch row is missing). shipping_export_history read only
-- succeeded rows, so the next export would not ask before sending those orders
-- again. A 'file' failure (no file made) still does not count.

CREATE OR REPLACE FUNCTION public.shipping_export_history(p_tenant_id uuid, p_order_ids uuid[])
RETURNS TABLE (order_id uuid, sent_at timestamptz, courier text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH hits AS (
        -- Exports since B4 remember their orders. A file that downloaded but
        -- whose export batch could not be saved (failure_stage 'batch_record')
        -- still went to the merchant, so it counts as sent.
        SELECT o.id AS order_id, l.created_at AS sent_at,
               coalesce(l.courier_name,
                        CASE l.company WHEN 'prime' THEN 'Prime' WHEN 'waseet' THEN 'Al-Waseet' END) AS courier
          FROM public.shipping_export_log l
         CROSS JOIN LATERAL unnest(l.order_ids) AS o(id)
         WHERE l.tenant_id = p_tenant_id
           AND (l.succeeded OR l.failure_stage = 'batch_record')
           AND l.order_ids OPERATOR(pg_catalog.&&) p_order_ids
           AND o.id = ANY (p_order_ids)
        UNION ALL
        -- Older Prime and Al-Waseet exports are their export batches.
        SELECT o.id::uuid, b.created_at,
               CASE b.invoice_template WHEN 'prime' THEN 'Prime' ELSE 'Al-Waseet' END
          FROM public.print_batches b
         CROSS JOIN LATERAL unnest(b.order_ids) AS o(id)
         WHERE b.tenant_id = p_tenant_id
           AND b.invoice_template IN ('prime', 'waseet')
           AND b.print_type IN ('invoice', 'invoices')
           AND b.order_ids OPERATOR(pg_catalog.&&) (p_order_ids::text[])
           AND o.id = ANY (p_order_ids::text[])
        UNION ALL
        -- Sent to Prime by API and not cancelled there.
        SELECT s.order_id, coalesce(s.sent_at, s.pushed_at), 'Prime'
          FROM public.prime_shipments s
         WHERE s.tenant_id = p_tenant_id
           AND s.order_id = ANY (p_order_ids)
           AND s.cancelled_at IS NULL
    )
    SELECT DISTINCT ON (h.order_id) h.order_id, h.sent_at, h.courier
      FROM hits h
     ORDER BY h.order_id, h.sent_at DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.shipping_export_history(uuid, uuid[]) IS
'Fermi B4: for the given orders of a store, the last time each was sent to a courier (an export file since B4, an older Prime/Al-Waseet export batch, or Prime by API) and to which courier. Runs as the caller, so RLS keeps it to the caller''s own stores. The export dialog asks before sending these again.';