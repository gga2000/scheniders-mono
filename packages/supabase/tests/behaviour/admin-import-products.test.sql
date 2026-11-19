-- Behaviour test for the product import (Fermi B12 item 7):
-- admin_import_products and admin_attach_product_images, run against the
-- newest definitions in packages/supabase/migrations (run.sh). Every check
-- raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   a name the shop has (not archived) is skipped, so a second import of the
--   same file adds nothing; an archived name may come back;
--   categories are found by name (case and spaces aside) or made once;
--   slugs are made unique in the shop; new products go after the last one;
--   choices and variants are written; stock sits on the variants;
--   a SKU the shop uses stops the whole batch, nothing half written;
--   bad input, an unknown shop and a browser caller are refused;
--   images go on a product of that shop only, storage links only: the first
--   is the main image when there is none, the gallery grows after its last;
--   grants match.

BEGIN;

INSERT INTO public.tenants (id, business_name) VALUES
    ('60000000-0000-4000-8000-000000000001', 'shop A'),
    ('60000000-0000-4000-8000-000000000002', 'shop B');

INSERT INTO public.categories (id, tenant_id, name, slug, display_order) VALUES
    ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'عطور', 'عطور', 3),
    -- Shop B's category of the same name is not shop A's.
    ('61000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 'ملابس', 'ملابس', 0);

INSERT INTO public.products (id, tenant_id, name, price, slug, sku, display_order, is_archived) VALUES
    ('62000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'عطر', 1000, 'بخور', 'TAKEN', 7, false),
    ('62000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', 'قديم', 1000, NULL, NULL, 2, true),
    ('62000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000002', 'منتج ب', 1000, NULL, NULL, 0, false);

CREATE TEMP TABLE batch (body jsonb);
INSERT INTO batch VALUES ($j$[
  {"key": "2", "name": "عطر ", "slug": "عطر", "description": null, "category": null, "category_slug": null,
   "price": 5000, "cost": null, "compare_at_price": null, "stock": 1, "sku": null, "barcode": null, "options": [], "variants": []},
  {"key": "3", "name": "بخور", "slug": "بخور", "description": " دخون عراقي ", "category": " عطور ", "category_slug": "عطور",
   "price": 8000, "cost": 3000, "compare_at_price": 10000, "stock": 40, "sku": "BK-1", "barcode": "629001", "options": [], "variants": []},
  {"key": "4", "name": "قديم", "slug": "قديم", "description": null, "category": null, "category_slug": null,
   "price": 2000, "cost": null, "compare_at_price": null, "stock": 0, "sku": null, "barcode": null, "options": [], "variants": []},
  {"key": "5", "name": "تيشيرت", "slug": "تيشيرت", "description": null, "category": "ملابس", "category_slug": "ملابس",
   "price": 14000, "cost": 6000, "compare_at_price": null, "stock": 0, "sku": null, "barcode": null,
   "options": [{"name": "المقاس", "type": "size", "values": ["M", "L"]}, {"name": "اللون", "type": "color", "values": ["أسود"]}],
   "variants": [
     {"name": "M / أسود", "option_values": {"المقاس": "M", "اللون": "أسود"}, "price": 14000, "cost": 6000, "compare_at_price": null, "stock": 3, "sku": "TS-M", "barcode": null},
     {"name": "L / أسود", "option_values": {"المقاس": "L", "اللون": "أسود"}, "price": 15000, "cost": null, "compare_at_price": null, "stock": 2, "sku": "TS-L", "barcode": null}]},
  {"key": "7", "name": "حزام", "slug": "حزام", "description": null, "category": "ملابس", "category_slug": "ملابس",
   "price": 9000, "cost": null, "compare_at_price": null, "stock": 4, "sku": null, "barcode": null, "options": [], "variants": []}
]$j$);

DO $t$
DECLARE
    a constant uuid := '60000000-0000-4000-8000-000000000001';
    answer jsonb := public.admin_import_products(a, (SELECT body FROM batch), '6f000000-0000-4000-8000-000000000001', 'noor@example.com', 'products.xlsx');
    p record;
    clothes uuid;
BEGIN
    IF (SELECT jsonb_agg(e->>'key') FROM jsonb_array_elements(answer->'created') e) <> '["3", "4", "5", "7"]'
       OR answer->'skipped' <> '[{"key": "2", "reason": "in_shop"}]' THEN
        RAISE EXCEPTION 'answer: %', answer;
    END IF;

    SELECT * INTO p FROM public.products WHERE id = (answer->'created'->0->>'product_id')::uuid;
    -- The taken slug gets "-2"; the shop's own category, found by name; after the last product (7).
    IF p.tenant_id <> a OR p.slug <> 'بخور-2' OR p.category_id <> '61000000-0000-4000-8000-000000000001'
       OR p.display_order <> 8 OR p.description <> 'دخون عراقي' OR p.price <> 8000 OR p.cost <> 3000
       OR p.compare_at_price <> 10000 OR p.stock_quantity <> 40 OR p.sku <> 'BK-1' OR p.barcode <> '629001'
       OR p.status <> 'active' OR NOT p.is_visible THEN
        RAISE EXCEPTION 'incense: %', row_to_json(p);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.product_categories pc WHERE pc.product_id = p.id AND pc.is_primary
                      AND pc.category_id = '61000000-0000-4000-8000-000000000001' AND pc.tenant_id = a) THEN
        RAISE EXCEPTION 'incense category row';
    END IF;

    -- An archived name may come back; no cost is 0, as the editor saves it.
    SELECT * INTO p FROM public.products WHERE id = (answer->'created'->1->>'product_id')::uuid;
    IF p.name <> 'قديم' OR p.cost <> 0 OR p.category_id IS NOT NULL OR p.display_order <> 9 THEN
        RAISE EXCEPTION 'old name back: %', row_to_json(p);
    END IF;

    -- One new category for two products, shop A's own, after its last one.
    SELECT id INTO clothes FROM public.categories WHERE tenant_id = a AND name = 'ملابس';
    IF clothes IS NULL OR (SELECT count(*) FROM public.categories WHERE tenant_id = a) <> 2
       OR (SELECT slug FROM public.categories WHERE id = clothes) <> 'ملابس'
       OR (SELECT display_order FROM public.categories WHERE id = clothes) <> 4 THEN
        RAISE EXCEPTION 'new category';
    END IF;

    SELECT * INTO p FROM public.products WHERE id = (answer->'created'->2->>'product_id')::uuid;
    IF p.category_id <> clothes OR p.stock_quantity <> 0 OR p.price <> 14000 THEN
        RAISE EXCEPTION 'shirt: %', row_to_json(p);
    END IF;
    IF (SELECT jsonb_agg(jsonb_build_object('name', o.name, 'type', o.option_type, 'values', o.values, 'order', o.display_order, 'tenant', o.tenant_id = a) ORDER BY o.display_order)
          FROM public.product_options o WHERE o.product_id = p.id)
       <> '[{"name": "المقاس", "type": "size", "values": ["M", "L"], "order": 0, "tenant": true},
            {"name": "اللون", "type": "color", "values": ["أسود"], "order": 1, "tenant": true}]' THEN
        RAISE EXCEPTION 'shirt choices';
    END IF;
    IF (SELECT jsonb_agg(jsonb_build_object('name', v.name, 'values', v.option_values, 'price', v.price, 'cost', v.cost,
                                            'stock', v.stock_quantity, 'sku', v.sku, 'on', v.is_enabled, 'order', v.display_order) ORDER BY v.display_order)
          FROM public.product_variants v WHERE v.product_id = p.id AND v.tenant_id = a)
       <> '[{"name": "M / أسود", "values": {"المقاس": "M", "اللون": "أسود"}, "price": 14000, "cost": 6000, "stock": 3, "sku": "TS-M", "on": true, "order": 0},
            {"name": "L / أسود", "values": {"المقاس": "L", "اللون": "أسود"}, "price": 15000, "cost": 0, "stock": 2, "sku": "TS-L", "on": true, "order": 1}]' THEN
        RAISE EXCEPTION 'shirt variants';
    END IF;

    IF (SELECT category_id FROM public.products WHERE id = (answer->'created'->3->>'product_id')::uuid) <> clothes THEN
        RAISE EXCEPTION 'belt category';
    END IF;

    -- One staff log line.
    IF NOT EXISTS (SELECT 1 FROM public.admin_activity_logs l
                    WHERE l.tenant_id = a AND l.action = 'import_products'
                      AND l.admin_user_id = '6f000000-0000-4000-8000-000000000001' AND l.actor_email = 'noor@example.com'
                      AND l.details = '{"created": 4, "skipped": 1, "file": "products.xlsx"}') THEN
        RAISE EXCEPTION 'staff log: %', (SELECT jsonb_agg(to_jsonb(l)) FROM public.admin_activity_logs l);
    END IF;

    -- The same file again adds nothing.
    answer := public.admin_import_products(a, (SELECT body FROM batch));
    IF answer->'created' <> '[]' OR jsonb_array_length(answer->'skipped') <> 5
       OR (SELECT count(*) FROM public.products WHERE tenant_id = a) <> 6 THEN
        RAISE EXCEPTION 'second import: %', answer;
    END IF;

    -- A SKU the shop uses stops the batch: the first product is not left behind.
    BEGIN
        PERFORM public.admin_import_products(a, $j$[
          {"key": "2", "name": "جديد", "slug": "جديد", "price": 1000, "stock": 0, "sku": null, "options": [], "variants": []},
          {"key": "3", "name": "جديد 2", "slug": "جديد-2", "price": 1000, "stock": 0, "sku": "TAKEN", "options": [], "variants": []}]$j$);
        RAISE EXCEPTION 'a used SKU went in';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;
    IF EXISTS (SELECT 1 FROM public.products WHERE name = 'جديد') THEN
        RAISE EXCEPTION 'half a batch was written';
    END IF;

    -- Bad input and an unknown shop.
    BEGIN
        PERFORM public.admin_import_products(a, '[]');
        RAISE EXCEPTION 'an empty batch went in';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.admin_import_products(a, (SELECT jsonb_agg(jsonb_build_object('key', n::text, 'name', 'p' || n, 'price', 1000)) FROM generate_series(1, 101) n));
        RAISE EXCEPTION '101 products went in';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.admin_import_products(a, '[{"key": "2", "name": "x", "price": 0}]');
        RAISE EXCEPTION 'a price of 0 went in';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.admin_import_products(a, '[{"key": "row 2", "name": "x", "price": 10}]');
        RAISE EXCEPTION 'a bad key went in';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.admin_import_products('60000000-0000-4000-8000-0000000000ff', '[{"key": "2", "name": "x", "price": 10}]');
        RAISE EXCEPTION 'an unknown shop got products';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_import_products(a, '[{"key": "2", "name": "x", "price": 10}]');
        RAISE EXCEPTION 'a browser imported products';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM set_config('test.role', '', true);
END;
$t$;

DO $img$
DECLARE
    a constant uuid := '60000000-0000-4000-8000-000000000001';
    product uuid := (SELECT id FROM public.products WHERE tenant_id = a AND name = 'حزام');
    one constant text := 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/product-images/products/x-0-1.jpg';
    two constant text := 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/product-images/products/x-1-1.png';
    three constant text := 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/product-images/products/x-2-1.webp';
    answer jsonb;
BEGIN
    answer := public.admin_attach_product_images(a, product, ARRAY[one, two], '6f000000-0000-4000-8000-0000000000aa', 'sara@fermi.test');
    IF answer <> jsonb_build_object('image_url', one, 'added', 2)
       OR (SELECT image_url FROM public.products WHERE id = product) <> one
       OR (SELECT jsonb_agg(jsonb_build_array(image_url, display_order) ORDER BY display_order) FROM public.product_images WHERE product_id = product AND tenant_id = a)
          <> jsonb_build_array(jsonb_build_array(one, 0), jsonb_build_array(two, 1)) THEN
        RAISE EXCEPTION 'first images: %', answer;
    END IF;
    -- One staff log line names who saved how many images on which product.
    IF (SELECT count(*) FROM public.admin_activity_logs
         WHERE action = 'import_product_images' AND tenant_id = a
           AND admin_user_id = '6f000000-0000-4000-8000-0000000000aa' AND actor_email = 'sara@fermi.test'
           AND details = jsonb_build_object('product_id', product, 'added', 2)) <> 1 THEN
        RAISE EXCEPTION 'image log line';
    END IF;

    -- A second save keeps the main image and grows the gallery after its last.
    answer := public.admin_attach_product_images(a, product, ARRAY[three]);
    IF (SELECT image_url FROM public.products WHERE id = product) <> one
       OR (SELECT display_order FROM public.product_images WHERE product_id = product AND image_url = three) <> 2 THEN
        RAISE EXCEPTION 'second images: %', answer;
    END IF;

    -- Shop B's product is not shop A's.
    BEGIN
        PERFORM public.admin_attach_product_images(a, '62000000-0000-4000-8000-000000000003', ARRAY[one]);
        RAISE EXCEPTION 'images went on another shop''s product';
    EXCEPTION WHEN no_data_found THEN NULL;
    END;
    -- Only storage links, 1 to 8.
    BEGIN
        PERFORM public.admin_attach_product_images(a, product, ARRAY['https://evil.example/x.jpg']);
        RAISE EXCEPTION 'an outside link went in';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.admin_attach_product_images(a, product, ARRAY['https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/vault/x.jpg']);
        RAISE EXCEPTION 'another bucket went in';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.admin_attach_product_images(a, product, array_fill(one, ARRAY[9]));
        RAISE EXCEPTION '9 images went in';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    BEGIN
        PERFORM public.admin_attach_product_images(a, product, ARRAY[]::text[]);
        RAISE EXCEPTION 'no images went in';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_attach_product_images(a, product, ARRAY[one]);
        RAISE EXCEPTION 'a browser saved images';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    PERFORM set_config('test.role', '', true);
END;
$img$;

DO $g$
BEGIN
    IF has_function_privilege('authenticated', 'public.admin_import_products(uuid, jsonb, uuid, text, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_import_products(uuid, jsonb, uuid, text, text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.admin_import_products(uuid, jsonb, uuid, text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'admin_import_products grants';
    END IF;
    IF has_function_privilege('authenticated', 'public.admin_attach_product_images(uuid, uuid, text[], uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_attach_product_images(uuid, uuid, text[], uuid, text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.admin_attach_product_images(uuid, uuid, text[], uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'admin_attach_product_images grants';
    END IF;
END;
$g$;

COMMIT;
