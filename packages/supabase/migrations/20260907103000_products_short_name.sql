-- Internal ops name for a product, distinct from the customer-facing
-- marketing `name` that the storefront renders and SEO consumes.
--
-- Why: order snapshots (orders.items[].name) are the identity employees read
-- on the orders page, printing/labels, courier waybills, WhatsApp {product}
-- placeholders, filters and duplicate matching. Historically products.name
-- WAS the short ops name (the LightFunnels webhook comment even said "use our
-- short name") — until the storefront migration restored the full old-site
-- marketing titles into products.name, which silently flipped every ops
-- surface to the long names. short_name gives the ops role its own column:
-- order-creation paths snapshot COALESCE(short_name, name).
--
-- Deliberately NOT granted to anon: this is employee-facing data and must not
-- leak into the public storefront reads (products has a column-level anon
-- grant whitelist; new columns are denied by default).
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS short_name text;

COMMENT ON COLUMN public.products.short_name IS
    'Internal short name for employee-facing surfaces (orders, printing, labels, WhatsApp templates). Falls back to name when null. Customer-facing surfaces keep using name.';
