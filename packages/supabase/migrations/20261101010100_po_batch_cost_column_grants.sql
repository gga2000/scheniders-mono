-- Products page, round 24, step 2: the cost columns leave the member grant.
--
-- APPLY ONLY AFTER the platform build from the same PR is live in production
-- AND 20261101010000 is applied. That build names its columns on every read of
-- these tables and reads cost through product_batch_costs() and
-- purchase_order_costs(). The build before it reads them with `*`, which these
-- grants refuse with 42501.
--
-- `authenticated` loses table-level SELECT on product_batches, purchase_orders
-- and purchase_order_items and gets SELECT on every column except
-- product_batches.cost_per_unit, purchase_orders.total_cost and
-- purchase_order_items.unit_cost. INSERT / UPDATE / DELETE are untouched (the
-- app sends cost only when the caller may see it, and selects only "id" back).
-- `anon` never reads these tables (RLS returns nothing), so it loses every
-- privilege on them. service_role and SECURITY DEFINER functions are
-- unaffected. Checked on the live project 2026-11-01: no view and no public
-- function reads these tables; all three are empty.
--
-- ADDING A COLUMN TO THESE TABLES FROM NOW ON
--   It is not readable by `authenticated` until granted: the migration that
--   adds it must also GRANT SELECT (<column>) ... TO authenticated, and the app
--   adds it to its read list.

BEGIN;

REVOKE ALL ON public.product_batches, public.purchase_orders, public.purchase_order_items FROM anon;

REVOKE SELECT ON public.product_batches FROM authenticated;
GRANT SELECT (id, product_id, variant_id, batch_number, expiry_date, quantity, received_at, notes, status, tenant_id, created_at)
    ON public.product_batches TO authenticated;

REVOKE SELECT ON public.purchase_orders FROM authenticated;
GRANT SELECT (id, tenant_id, po_number, supplier_name, supplier_contact, supplier_email, status, notes, expected_date, sent_at, received_at, created_by, created_at, updated_at)
    ON public.purchase_orders TO authenticated;

REVOKE SELECT ON public.purchase_order_items FROM authenticated;
GRANT SELECT (id, po_id, product_id, variant_id, product_name, variant_name, sku, quantity_ordered, quantity_received, notes, created_at)
    ON public.purchase_order_items TO authenticated;

COMMIT;
