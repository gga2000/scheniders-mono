-- ═══════════════════════════════════════════════════════════════════
-- Anon column lockdown on public.products — stop leaking supplier cost
-- ═══════════════════════════════════════════════════════════════════
-- Anon-read sweep (2026-08-11) found that `public_storefront_read_products`
-- (RLS, from 20260605150444) exposes VISIBLE products of active tenants to
-- anonymous visitors — correct, the storefront needs the catalog. But RLS
-- is row-level and column-blind, so PostgREST happily returns EVERY column
-- to a raw `GET /rest/v1/products?select=cost` — including supplier cost,
-- cost breakdown, reorder points and digital-delivery secrets.
--
-- Proof: anon read of "بستاشيو" returned cost=12070 against price=36750.
--
-- Postgres column privileges are the right tool: they compose with RLS
-- (a read must pass BOTH). We revoke anon's table-wide SELECT and re-grant
-- only the columns the storefront actually reads (verified: zero storefront
-- references to any excluded column). `authenticated` is untouched — the
-- merchant app needs cost, and its own tenant-isolation RLS already scopes
-- reads. New columns added later default to NO anon grant, which is the
-- safe direction.
--
-- Excluded from anon (internal / financial / post-purchase secrets):
--   cost, cost_breakdown_json, reorder_point, low_stock_threshold,
--   license_key_pattern, download_url, file_size, lightfunnels_aliases

REVOKE SELECT ON public.products FROM anon;

GRANT SELECT (
    id, tenant_id, name, slug, description, short_description,
    price, website_price, compare_at_price, image_url,
    stock_quantity, reserved_quantity, open_box_quantity, sku, barcode,
    is_archived, is_visible, is_supply, status, product_type,
    booking_enabled, duration_minutes, category_id, display_order,
    tag_color, weight, dimensions_json, created_at, updated_at
) ON public.products TO anon;
