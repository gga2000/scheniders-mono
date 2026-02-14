-- =============================================
-- UPDATE EXCEL ORDERS - WITH PROPER MULTI-PRODUCT HANDLING
-- =============================================

-- Product Catalogue Reference:
-- بيرسيفيرون: eebd1ed9-cbf7-4296-9470-c52fa66e5252 | #f97316 | temp-1766015594387.webp | price ~44750
-- ايدنتتي:    02a67e80-4a98-4fb5-91a6-5a866b40b56d | #a855f7 | temp-1766194885031.webp | price ~38500
-- رفقات:      d6cb6a8c-8f61-47c3-8bb4-8e653a35e42c | #3b82f6 | temp-1766194269505.jpg  | price ~39000
-- فيوجن:      c092ad91-c70e-4b0d-a22b-a445126ba783 | #eab308 | temp-1766015696796.jpg  | price ~36750

-- =============================================
-- COMBO ORDERS - Split into multiple products
-- =============================================

-- 1) Order 5497: برسيفيرون + رفقات (qty 2, price 75000 = ~37500 each)
UPDATE orders SET items = '[
    {"name":"بيرسيفيرون","price":37500,"quantity":1,"product_id":"eebd1ed9-cbf7-4296-9470-c52fa66e5252","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766015594387.webp","tag_color":"#f97316"},
    {"name":"رفقات","price":37500,"quantity":1,"product_id":"d6cb6a8c-8f61-47c3-8bb4-8e653a35e42c","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766194269505.jpg","tag_color":"#3b82f6"}
]'::jsonb WHERE order_id = '5497';

-- 2) Order 10045: برسيفيرون + رفقات (qty 2, price 75000)
UPDATE orders SET items = '[
    {"name":"بيرسيفيرون","price":37500,"quantity":1,"product_id":"eebd1ed9-cbf7-4296-9470-c52fa66e5252","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766015594387.webp","tag_color":"#f97316"},
    {"name":"رفقات","price":37500,"quantity":1,"product_id":"d6cb6a8c-8f61-47c3-8bb4-8e653a35e42c","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766194269505.jpg","tag_color":"#3b82f6"}
]'::jsonb WHERE order_id = '10045';

-- 3) Order 5512: برسيفيرون + رفقات (qty 2, price 75000)
UPDATE orders SET items = '[
    {"name":"بيرسيفيرون","price":37500,"quantity":1,"product_id":"eebd1ed9-cbf7-4296-9470-c52fa66e5252","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766015594387.webp","tag_color":"#f97316"},
    {"name":"رفقات","price":37500,"quantity":1,"product_id":"d6cb6a8c-8f61-47c3-8bb4-8e653a35e42c","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766194269505.jpg","tag_color":"#3b82f6"}
]'::jsonb WHERE order_id = '5512';

-- 4) Order 20005: برسيفيرون + فيوجن (qty 2, price 73000 = ~36500 each)
UPDATE orders SET items = '[
    {"name":"بيرسيفيرون","price":36500,"quantity":1,"product_id":"eebd1ed9-cbf7-4296-9470-c52fa66e5252","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766015594387.webp","tag_color":"#f97316"},
    {"name":"فيوجن","price":36500,"quantity":1,"product_id":"c092ad91-c70e-4b0d-a22b-a445126ba783","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766015696796.jpg","tag_color":"#eab308"}
]'::jsonb WHERE order_id = '20005';

-- 5) Order 5525: برسيفيرون + فيوجن (qty 2, price 73000)
UPDATE orders SET items = '[
    {"name":"بيرسيفيرون","price":36500,"quantity":1,"product_id":"eebd1ed9-cbf7-4296-9470-c52fa66e5252","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766015594387.webp","tag_color":"#f97316"},
    {"name":"فيوجن","price":36500,"quantity":1,"product_id":"c092ad91-c70e-4b0d-a22b-a445126ba783","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766015696796.jpg","tag_color":"#eab308"}
]'::jsonb WHERE order_id = '5525';

-- 6) Order 5528: برسيفيرون + فيوجن (qty 2, price 73000)
UPDATE orders SET items = '[
    {"name":"بيرسيفيرون","price":36500,"quantity":1,"product_id":"eebd1ed9-cbf7-4296-9470-c52fa66e5252","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766015594387.webp","tag_color":"#f97316"},
    {"name":"فيوجن","price":36500,"quantity":1,"product_id":"c092ad91-c70e-4b0d-a22b-a445126ba783","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766015696796.jpg","tag_color":"#eab308"}
]'::jsonb WHERE order_id = '5528';

-- 7) Order 20007: برسيفيرون + فيوجن + ايدنتتي (qty 3, price 106000 = ~35333 each)
UPDATE orders SET items = '[
    {"name":"بيرسيفيرون","price":35333,"quantity":1,"product_id":"eebd1ed9-cbf7-4296-9470-c52fa66e5252","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766015594387.webp","tag_color":"#f97316"},
    {"name":"فيوجن","price":35333,"quantity":1,"product_id":"c092ad91-c70e-4b0d-a22b-a445126ba783","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766015696796.jpg","tag_color":"#eab308"},
    {"name":"ايدنتتي","price":35334,"quantity":1,"product_id":"02a67e80-4a98-4fb5-91a6-5a866b40b56d","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766194885031.webp","tag_color":"#a855f7"}
]'::jsonb WHERE order_id = '20007';

-- 8) Order 20008: برسيفيرون + رفقات + فيوجن (qty 3, price 106000)
UPDATE orders SET items = '[
    {"name":"بيرسيفيرون","price":35333,"quantity":1,"product_id":"eebd1ed9-cbf7-4296-9470-c52fa66e5252","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766015594387.webp","tag_color":"#f97316"},
    {"name":"رفقات","price":35333,"quantity":1,"product_id":"d6cb6a8c-8f61-47c3-8bb4-8e653a35e42c","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766194269505.jpg","tag_color":"#3b82f6"},
    {"name":"فيوجن","price":35334,"quantity":1,"product_id":"c092ad91-c70e-4b0d-a22b-a445126ba783","image_url":"https://ibfdugifekivquwprqjc.supabase.co/storage/v1/object/public/product-images/products/temp-1766015696796.jpg","tag_color":"#eab308"}
]'::jsonb WHERE order_id = '20008';

-- =============================================
-- SINGLE PRODUCT ORDERS - Replace names with catalogue names
-- =============================================

-- برسيفيرون orders (single product)
WITH persiferon AS (
    SELECT id, name, image_url, tag_color FROM products WHERE name ILIKE '%بيرسيفيرون%' LIMIT 1
)
UPDATE orders 
SET items = (
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', p.name,
            'price', (item->>'price')::numeric,
            'quantity', (item->>'quantity')::integer,
            'product_id', p.id,
            'image_url', p.image_url,
            'tag_color', p.tag_color
        )
    )
    FROM jsonb_array_elements(items) AS item
    CROSS JOIN persiferon p
)
FROM persiferon p
WHERE order_id IN ('5491', '5492', '5493', '5494', '5495', '5496', '5499', '5501', '10043', '10044', '5502', '5503', '5504', '5505', '5506', '5507', '5508', '10049', '5509', '5510', '5511', '10046', '10047', '10048', '10051', '5474', '5513', '5514', '5515', '5516', '5517', '10058', '5518', '10052', '10054', '10055', '10056', '10057', '10059', '5520', '5521', '5522', '5523', '5524', '5526', '5527', '5530', '5531', '10060', '5519', '5532', '5533', '5534', '5535', '10061', '5536', '5537', '5539', '5540', '5541');

-- ايدنتتي orders (single product)
WITH identity AS (
    SELECT id, name, image_url, tag_color FROM products WHERE name ILIKE '%ايدنتتي%' LIMIT 1
)
UPDATE orders 
SET items = (
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', p.name,
            'price', (item->>'price')::numeric,
            'quantity', (item->>'quantity')::integer,
            'product_id', p.id,
            'image_url', p.image_url,
            'tag_color', p.tag_color
        )
    )
    FROM jsonb_array_elements(items) AS item
    CROSS JOIN identity p
)
FROM identity p
WHERE order_id IN ('5500', '10050', '5538');

-- فيوجن orders (single product - خير فيوجن)
WITH fusion AS (
    SELECT id, name, image_url, tag_color FROM products WHERE name ILIKE '%فيوجن%' LIMIT 1
)
UPDATE orders 
SET items = (
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', p.name,
            'price', (item->>'price')::numeric,
            'quantity', (item->>'quantity')::integer,
            'product_id', p.id,
            'image_url', p.image_url,
            'tag_color', p.tag_color
        )
    )
    FROM jsonb_array_elements(items) AS item
    CROSS JOIN fusion p
)
FROM fusion p
WHERE order_id = '20006';

-- رفقات orders (single product)
WITH rifqat AS (
    SELECT id, name, image_url, tag_color FROM products WHERE name ILIKE '%رفقات%' LIMIT 1
)
UPDATE orders 
SET items = (
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', p.name,
            'price', (item->>'price')::numeric,
            'quantity', (item->>'quantity')::integer,
            'product_id', p.id,
            'image_url', p.image_url,
            'tag_color', p.tag_color
        )
    )
    FROM jsonb_array_elements(items) AS item
    CROSS JOIN rifqat p
)
FROM rifqat p
WHERE order_id = '10053';

-- =============================================
-- VERIFY - Check combo orders
-- =============================================
SELECT 
    order_id,
    customer_name,
    price,
    jsonb_array_length(items) as item_count,
    items
FROM orders 
WHERE order_id IN ('5497', '10045', '5512', '20005', '5525', '5528', '20007', '20008')
ORDER BY order_id;
