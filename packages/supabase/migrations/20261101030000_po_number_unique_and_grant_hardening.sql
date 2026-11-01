-- 1. One purchase order number per store. Two buyers pressing "Generate PO" in the
--    same second could both read the same highest number. purchase_orders has 0 rows
--    on 2026-11-01, so the index cannot fail on existing data.
-- 2. Table grants that PostgREST never needs. RLS was the only thing between a
--    member and TRUNCATE / TRIGGER / REFERENCES on these tables.
--    anon loses everything on tables the storefront does not read.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_tenant_po_number
    ON public.purchase_orders (tenant_id, po_number);

REVOKE TRUNCATE, TRIGGER, REFERENCES ON
    public.product_batches,
    public.purchase_orders,
    public.purchase_order_items,
    public.bom_items,
    public.product_storage,
    public.qc_quarantine,
    public.qc_quarantine_events
FROM anon, authenticated;

REVOKE ALL ON
    public.product_batches,
    public.purchase_orders,
    public.purchase_order_items,
    public.bom_items,
    public.product_storage,
    public.qc_quarantine,
    public.qc_quarantine_events
FROM anon;

COMMIT;
