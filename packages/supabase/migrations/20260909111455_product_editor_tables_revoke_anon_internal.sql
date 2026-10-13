-- Recorded from live schema_migrations; applied 2026-09-09 from branch
-- feat/flagship-template (PR #80, source commit 2e694f63, folded there into
-- 20260909150000_product_editor_missing_tables.sql); do not edit.
-- Body below is the exact statement that ran under version 20260909111455.

-- A schema-wide default privilege grants SELECT to anon on every new table,
-- so the four internal tables came out anon-SELECTable even though the
-- migration only granted the four public ones. RLS still returns zero rows
-- (they carry no anon policy), but table-level access should not depend on
-- a policy staying correct — product_suppliers.unit_cost is supplier cost,
-- the same class of column that leaked once before.
REVOKE SELECT ON public.product_suppliers      FROM anon;
REVOKE SELECT ON public.inventory_history      FROM anon;
REVOKE SELECT ON public.product_activity_log   FROM anon;
REVOKE SELECT ON public.product_price_history  FROM anon;

-- Writes were never granted to anon; make that explicit and durable.
REVOKE INSERT, UPDATE, DELETE ON public.product_suppliers      FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.inventory_history      FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_activity_log   FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_price_history  FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_tiered_pricing FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_order_bumps    FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_related        FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_bundle_items   FROM anon;
