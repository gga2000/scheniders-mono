-- Products audit r33 N8: one draft purchase order per supplier per store.
-- The reorder drawer already refuses a second draft, but only from the list it
-- loaded, so two tabs or two members could still both create one and the
-- supplier would be paid twice once both are sent. Names match the drawer's
-- check: trimmed and case-insensitive. Live check: no duplicate drafts exist.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_one_draft_per_supplier
    ON public.purchase_orders (tenant_id, lower(btrim(supplier_name)))
    WHERE status = 'draft' AND supplier_name IS NOT NULL;
