-- Product import (Fermi B12 item 7), fixes from the staff console audit,
-- round 18 (structure new 1 and 2):
--
-- 1. product_name_key(text): one shop name rule for the import, the same as
--    the console's check (apps/admin/lib/product-import.ts foldText):
--    Unicode-folded, lower case, short vowels and tatweel dropped,
--    أ إ آ → ا, ة → ه, ى → ي, runs of spaces made one. admin_import_products
--    skips a name the shop has by this rule, so "عباية" in the file is not
--    added beside the shop's "عبايه".
-- 2. admin_import_products: a SKU or barcode the shop already uses, on a
--    product or on a choice, or used twice in one product, stops the batch
--    (23505, all or none). The unique indexes cover each table on its own
--    only, and the till finds a scanned code on a choice first, then on a
--    product, so a belt under a T-shirt's barcode would sell as the T-shirt.
-- 3. admin_attach_product_images: an image the product already has is
--    skipped, so a second call with the same links adds nothing twice;
--    "added" counts what was really added, and the staff log line is
--    written only when something was.
--
-- Rollback: re-apply 20261119004830_admin_import_products.sql, then
-- DROP FUNCTION public.product_name_key(text);

CREATE OR REPLACE FUNCTION public.product_name_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
SET search_path TO 'pg_catalog'
AS $function$
    SELECT btrim(regexp_replace(
               translate(
                   translate(lower(normalize(p_name, NFKC)), E'ًٌٍَُِّْـ', ''),
                   'أإآةى', 'اااهي'),
               '\s+', ' ', 'g'))
$function$;

REVOKE ALL ON FUNCTION public.product_name_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_name_key(text) TO service_role;

COMMENT ON FUNCTION public.product_name_key(text) IS
    'Fermi B12 item 7: a product name made comparable, as the console''s import check folds it (lib/product-import.ts foldText). Service role only.';

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
    _key text;
    _names jsonb;
    _clash_kind text;
    _clash_code text;
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

    -- One import per shop at a time: the names read below then hold every
    -- product an earlier batch of a parallel import wrote.
    PERFORM pg_advisory_xact_lock(hashtextextended('admin_import_products:' || p_tenant::text, 0));

    -- The names the shop has (archived ones do not count), by the console's rule.
    SELECT coalesce(jsonb_object_agg(k.key, true), '{}'::jsonb) INTO _names
      FROM (SELECT DISTINCT public.product_name_key(p.name) AS key
              FROM public.products p
             WHERE p.tenant_id = p_tenant
               AND NOT coalesce(p.is_archived, false)
               AND p.name IS NOT NULL) k;

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

        _key := public.product_name_key(_name);
        IF _names ? _key THEN
            _skipped := _skipped || jsonb_build_object('key', _item->>'key', 'reason', 'in_shop');
            CONTINUE;
        END IF;

        -- A code the shop uses on a product or a choice, or one this product
        -- names twice, stops the batch.
        SELECT c.kind, c.code INTO _clash_kind, _clash_code
          FROM (SELECT 'SKU' AS kind, nullif(btrim(coalesce(_item->>'sku', '')), '') AS code
                UNION ALL
                SELECT 'barcode', nullif(btrim(coalesce(_item->>'barcode', '')), '')
                UNION ALL
                SELECT 'SKU', nullif(btrim(coalesce(v.value->>'sku', '')), '')
                  FROM jsonb_array_elements(coalesce(_item->'variants', '[]'::jsonb)) v
                UNION ALL
                SELECT 'barcode', nullif(btrim(coalesce(v.value->>'barcode', '')), '')
                  FROM jsonb_array_elements(coalesce(_item->'variants', '[]'::jsonb)) v) c
         WHERE c.code IS NOT NULL
         GROUP BY c.kind, c.code
        HAVING count(*) > 1
            OR (c.kind = 'SKU'
                AND (EXISTS (SELECT 1 FROM public.products p WHERE p.tenant_id = p_tenant AND p.sku = c.code)
                     OR EXISTS (SELECT 1 FROM public.product_variants v WHERE v.tenant_id = p_tenant AND v.sku = c.code)))
            OR (c.kind = 'barcode'
                AND (EXISTS (SELECT 1 FROM public.products p WHERE p.tenant_id = p_tenant AND p.barcode = c.code)
                     OR EXISTS (SELECT 1 FROM public.product_variants v WHERE v.tenant_id = p_tenant AND v.barcode = c.code)))
         LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION '% "%" is already used in the shop (product %)', _clash_kind, _clash_code, _item->>'key'
                USING ERRCODE = '23505';
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
        _names := _names || jsonb_build_object(_key, true);

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
    'Fermi B12 item 7: adds up to 100 products (with categories, choices and variants) to a shop from the console''s product import, skipping names the shop has (product_name_key) and refusing a SKU or barcode the shop uses on a product or a choice; one staff log line. Service role only.';

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
    _added integer;
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

    -- Each link once, in the order sent, after the gallery's last image; one
    -- the product already has is skipped, so a second call adds nothing twice.
    SELECT coalesce(max(display_order), -1) + 1 INTO _next
      FROM public.product_images
     WHERE product_id = p_product AND tenant_id = p_tenant;
    INSERT INTO public.product_images (tenant_id, product_id, image_url, display_order)
    SELECT p_tenant, p_product, f.url, _next + (row_number() OVER (ORDER BY f.n) - 1)::integer
      FROM (SELECT DISTINCT ON (u.url) u.url, u.n
              FROM unnest(p_urls) WITH ORDINALITY AS u(url, n)
             ORDER BY u.url, u.n) f
     WHERE NOT EXISTS (SELECT 1 FROM public.product_images i
                        WHERE i.product_id = p_product AND i.image_url = f.url);
    GET DIAGNOSTICS _added = ROW_COUNT;

    IF _added > 0 THEN
        INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, admin_label, tenant_id, action, details)
        VALUES (p_admin_user_id, p_actor_email,
                CASE WHEN p_admin_user_id IS NULL AND p_actor_email IS NULL THEN 'system' END,
                p_tenant, 'import_product_images',
                jsonb_build_object('product_id', p_product, 'added', _added));
    END IF;

    RETURN jsonb_build_object('image_url', coalesce(_main, p_urls[1]), 'added', _added);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_attach_product_images(uuid, uuid, text[], uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attach_product_images(uuid, uuid, text[], uuid, text) TO service_role;

COMMENT ON FUNCTION public.admin_attach_product_images(uuid, uuid, text[], uuid, text) IS
    'Fermi B12 item 7: puts product-images storage links the console saved on one product of a shop (main image when it has none, then its gallery), skipping an image it already has; one staff log line when any is added. Service role only.';
