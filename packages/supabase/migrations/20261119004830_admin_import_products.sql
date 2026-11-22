-- Product import for the setup service (Fermi B12 item 7): the team adds a
-- shop's products from the Excel or CSV file the merchant sends. The console
-- reads the file, matches its columns and checks every row
-- (apps/admin/lib/product-import.ts); these functions write what it planned.
--
-- 1. admin_import_products(p_tenant, p_products, ...): adds up to 100
--    products in one go, all or none:
--      - a product whose name the shop already has (not archived) is skipped
--        and named in the answer, so importing a file twice adds nothing
--        twice; one import per shop at a time, so two cannot race;
--      - categories are found by name, or made, once per name;
--      - web addresses (slugs) are made unique in the shop: "-2", "-3";
--      - choices (size, colour) and their variants are written as the
--        product editor writes them; the variants hold the stock;
--      - new products go after the shop's last product, in file order;
--      - one staff log line says who imported how many from which file.
--    A SKU or barcode the shop already uses stops the batch (its unique
--    index), so nothing is half written.
-- 2. admin_attach_product_images(p_tenant, p_product, p_urls, ...): puts
--    the images the console fetched and saved in the product-images bucket on
--    one product of that shop. Only product-images storage links are taken.
--    The first becomes the main image when the product has none; all go in
--    the gallery after the ones already there. One staff log line per product.
-- Both are service role only.
--
-- Rollback: DROP FUNCTION public.admin_attach_product_images(uuid, uuid, text[], uuid, text);
-- DROP FUNCTION public.admin_import_products(uuid, jsonb, uuid, text, text);

CREATE OR REPLACE FUNCTION public.admin_import_products(
    p_tenant uuid,
    p_products jsonb,
    p_admin_user_id uuid DEFAULT NULL,
    p_actor_email text DEFAULT NULL,
    p_file_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _item jsonb;
    _name text;
    _product_id uuid;
    _category_id uuid;
    _category_key text;
    _categories jsonb := '{}'::jsonb;
    _base text;
    _slug text;
    _n integer;
    _order integer;
    _created jsonb := '[]'::jsonb;
    _skipped jsonb := '[]'::jsonb;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'admin_import_products is service-role only' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_products) IS DISTINCT FROM 'array' OR jsonb_array_length(p_products) NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'products must be a list of 1 to 100' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant) THEN
        RAISE EXCEPTION 'no such shop' USING ERRCODE = 'P0002';
    END IF;

    -- One import per shop at a time: the name check below then sees every
    -- product an earlier batch of a parallel import wrote.
    PERFORM pg_advisory_xact_lock(hashtextextended('admin_import_products:' || p_tenant::text, 0));

    SELECT coalesce(max(display_order), -1) + 1 INTO _order FROM public.products WHERE tenant_id = p_tenant;

    FOR _item IN SELECT value FROM jsonb_array_elements(p_products) LOOP
        _name := regexp_replace(btrim(coalesce(_item->>'name', '')), '\s+', ' ', 'g');
        IF _name = '' OR length(_name) > 200
           OR coalesce(_item->>'key', '') !~ '^\d{1,5}$'
           OR (_item->>'price')::numeric IS NULL OR (_item->>'price')::numeric <= 0
           OR coalesce((_item->>'stock')::integer, 0) < 0
           OR jsonb_typeof(coalesce(_item->'options', '[]'::jsonb)) <> 'array'
           OR jsonb_typeof(coalesce(_item->'variants', '[]'::jsonb)) <> 'array' THEN
            RAISE EXCEPTION 'product % is not a product', coalesce(_item->>'key', '?') USING ERRCODE = '22023';
        END IF;

        IF EXISTS (SELECT 1 FROM public.products p
                    WHERE p.tenant_id = p_tenant
                      AND NOT coalesce(p.is_archived, false)
                      AND lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = lower(_name)) THEN
            _skipped := _skipped || jsonb_build_object('key', _item->>'key', 'reason', 'in_shop');
            CONTINUE;
        END IF;

        _category_id := NULL;
        IF nullif(btrim(coalesce(_item->>'category', '')), '') IS NOT NULL THEN
            _category_key := lower(regexp_replace(btrim(_item->>'category'), '\s+', ' ', 'g'));
            _category_id := (_categories->>_category_key)::uuid;
            IF _category_id IS NULL THEN
                SELECT c.id INTO _category_id
                  FROM public.categories c
                 WHERE c.tenant_id = p_tenant
                   AND c.archived_at IS NULL
                   AND lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g')) = _category_key
                 ORDER BY c.created_at
                 LIMIT 1;
            END IF;
            IF _category_id IS NULL THEN
                _base := coalesce(nullif(btrim(coalesce(_item->>'category_slug', '')), ''), 'category');
                _slug := _base;
                _n := 1;
                WHILE EXISTS (SELECT 1 FROM public.categories WHERE tenant_id = p_tenant AND slug = _slug) LOOP
                    _n := _n + 1;
                    _slug := _base || '-' || _n;
                END LOOP;
                INSERT INTO public.categories (tenant_id, name, slug, display_order)
                VALUES (p_tenant, regexp_replace(btrim(_item->>'category'), '\s+', ' ', 'g'), _slug,
                        (SELECT coalesce(max(display_order), -1) + 1 FROM public.categories WHERE tenant_id = p_tenant))
                RETURNING id INTO _category_id;
            END IF;
            _categories := _categories || jsonb_build_object(_category_key, _category_id);
        END IF;

        _slug := NULL;
        _base := nullif(btrim(coalesce(_item->>'slug', '')), '');
        IF _base IS NOT NULL THEN
            _slug := _base;
            _n := 1;
            WHILE EXISTS (SELECT 1 FROM public.products WHERE tenant_id = p_tenant AND slug = _slug) LOOP
                _n := _n + 1;
                _slug := _base || '-' || _n;
            END LOOP;
        END IF;

        INSERT INTO public.products (tenant_id, name, slug, description, price, cost, compare_at_price,
                                     stock_quantity, sku, barcode, category_id, status, is_visible,
                                     product_type, display_order)
        VALUES (p_tenant, _name, _slug, nullif(btrim(coalesce(_item->>'description', '')), ''),
                round((_item->>'price')::numeric), round(coalesce((_item->>'cost')::numeric, 0)),
                round((_item->>'compare_at_price')::numeric),
                coalesce((_item->>'stock')::integer, 0),
                nullif(btrim(coalesce(_item->>'sku', '')), ''), nullif(btrim(coalesce(_item->>'barcode', '')), ''),
                _category_id, 'active', true, 'physical', _order)
        RETURNING id INTO _product_id;
        _order := _order + 1;

        IF _category_id IS NOT NULL THEN
            INSERT INTO public.product_categories (tenant_id, product_id, category_id, is_primary)
            VALUES (p_tenant, _product_id, _category_id, true);
        END IF;

        INSERT INTO public.product_options (tenant_id, product_id, name, values, option_type, display_order)
        SELECT p_tenant, _product_id, o.value->>'name', o.value->'values', o.value->>'type', (o.n - 1)::integer
          FROM jsonb_array_elements(coalesce(_item->'options', '[]'::jsonb)) WITH ORDINALITY AS o(value, n);

        INSERT INTO public.product_variants (tenant_id, product_id, name, option_values, price, cost,
                                             compare_at_price, stock_quantity, sku, barcode, is_enabled,
                                             display_order)
        SELECT p_tenant, _product_id, v.value->>'name', v.value->'option_values',
               round((v.value->>'price')::numeric), round(coalesce((v.value->>'cost')::numeric, 0)),
               round((v.value->>'compare_at_price')::numeric),
               greatest(coalesce((v.value->>'stock')::integer, 0), 0),
               nullif(btrim(coalesce(v.value->>'sku', '')), ''), nullif(btrim(coalesce(v.value->>'barcode', '')), ''),
               true, (v.n - 1)::integer
          FROM jsonb_array_elements(coalesce(_item->'variants', '[]'::jsonb)) WITH ORDINALITY AS v(value, n);

        _created := _created || jsonb_build_object('key', _item->>'key', 'product_id', _product_id);
    END LOOP;

    INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, admin_label, tenant_id, action, details)
    VALUES (p_admin_user_id, p_actor_email,
            CASE WHEN p_admin_user_id IS NULL AND p_actor_email IS NULL THEN 'system' END,
            p_tenant, 'import_products',
            jsonb_build_object('created', jsonb_array_length(_created), 'skipped', jsonb_array_length(_skipped),
                               'file', left(p_file_name, 200)));

    RETURN jsonb_build_object('created', _created, 'skipped', _skipped);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_import_products(uuid, jsonb, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_products(uuid, jsonb, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.admin_import_products(uuid, jsonb, uuid, text, text) IS
    'Fermi B12 item 7: adds up to 100 products (with categories, choices and variants) to a shop from the console''s product import, skipping names the shop has; one staff log line. Service role only.';

CREATE OR REPLACE FUNCTION public.admin_attach_product_images(
    p_tenant uuid,
    p_product uuid,
    p_urls text[],
    p_admin_user_id uuid DEFAULT NULL,
    p_actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _main text;
    _next integer;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'admin_attach_product_images is service-role only' USING ERRCODE = '42501';
    END IF;
    IF coalesce(cardinality(p_urls), 0) NOT BETWEEN 1 AND 8
       OR EXISTS (SELECT 1 FROM unnest(p_urls) u
                   WHERE u IS NULL
                      OR u !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/product-images/[A-Za-z0-9/_.-]+$') THEN
        RAISE EXCEPTION 'images must be 1 to 8 product-images storage links' USING ERRCODE = '22023';
    END IF;

    SELECT p.image_url INTO _main
      FROM public.products p
     WHERE p.id = p_product AND p.tenant_id = p_tenant
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no such product in this shop' USING ERRCODE = 'P0002';
    END IF;

    IF _main IS NULL THEN
        UPDATE public.products SET image_url = p_urls[1] WHERE id = p_product;
    END IF;

    SELECT coalesce(max(display_order), -1) + 1 INTO _next
      FROM public.product_images
     WHERE product_id = p_product AND tenant_id = p_tenant;
    INSERT INTO public.product_images (tenant_id, product_id, image_url, display_order)
    SELECT p_tenant, p_product, u.url, _next + (u.n - 1)::integer
      FROM unnest(p_urls) WITH ORDINALITY AS u(url, n);

    INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, admin_label, tenant_id, action, details)
    VALUES (p_admin_user_id, p_actor_email,
            CASE WHEN p_admin_user_id IS NULL AND p_actor_email IS NULL THEN 'system' END,
            p_tenant, 'import_product_images',
            jsonb_build_object('product_id', p_product, 'added', cardinality(p_urls)));

    RETURN jsonb_build_object('image_url', coalesce(_main, p_urls[1]), 'added', cardinality(p_urls));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_attach_product_images(uuid, uuid, text[], uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attach_product_images(uuid, uuid, text[], uuid, text) TO service_role;

COMMENT ON FUNCTION public.admin_attach_product_images(uuid, uuid, text[], uuid, text) IS
    'Fermi B12 item 7: puts product-images storage links the console saved on one product of a shop (main image when it has none, then its gallery); one staff log line. Service role only.';
