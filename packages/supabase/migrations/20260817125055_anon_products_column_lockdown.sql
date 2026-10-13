-- Recorded from live schema_migrations; applied 2026-08-17 from branch
-- feat/store-builder-preview-iframe (PR #57, source commit 778f7f0d,
-- drafted there as 20260811100000_anon_products_column_lockdown.sql); do not edit.
-- Body below is the exact statement that ran under version 20260817125055.

-- Anon column lockdown on public.products — stop leaking supplier cost.
-- RLS is row-level/column-blind + anon holds table-wide SELECT, so a raw
-- GET /rest/v1/products?select=cost returns supplier cost for every live
-- tenant. Column privileges compose with RLS (a read must pass both).
-- authenticated untouched (merchant app needs cost; its own RLS scopes it).

REVOKE SELECT ON public.products FROM anon;

GRANT SELECT (
    id, tenant_id, name, slug, description, short_description,
    price, website_price, compare_at_price, image_url,
    stock_quantity, reserved_quantity, open_box_quantity, sku, barcode,
    is_archived, is_visible, is_supply, status, product_type,
    booking_enabled, duration_minutes, category_id, display_order,
    tag_color, weight, dimensions_json, created_at, updated_at
) ON public.products TO anon;
