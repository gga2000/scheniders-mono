-- Demo store reset keeps the staff's record about the store (staff console
-- audit, round 3, item 11).
--
-- seed_demo_store emptied every table with the demo store's tenant_id, the
-- staff tables too. Each reset erased the staff log about the store, so who
-- created it, reset it, or opened the one-time link that signs in as its owner
-- was gone after the next reset. The same went for staff notes, the watch list,
-- staff tags, request ids, commissions and the record of who looked inside the
-- store as the merchant (support_view_sessions).
--
-- The list of tables to empty is now its own function,
-- demo_store_sweep_tables(), which leaves out every admin_* and staff_* table
-- and support_view_sessions. seed_demo_store calls it and is otherwise the
-- definition from 20261116092255_fermi_demo_store_prime.sql, unchanged: the
-- seed never calls Prime (its cash goes through the demo client) and the store
-- stays tenants.is_demo. Support chats, tasks and calls on the demo store are
-- still emptied, as the support thread asked.

CREATE OR REPLACE FUNCTION public.demo_store_sweep_tables()
RETURNS regclass[]
LANGUAGE sql
STABLE
SET search_path TO public, pg_temp
AS $function$
WITH RECURSIVE cand AS (
    SELECT c.oid AS rel
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
     WHERE c.relkind IN ('r', 'p')
       AND n.nspname IN ('public', 'shield')
       AND c.oid NOT IN ('public.tenants'::regclass, 'public.tenant_members'::regclass,
                         'public.user_permissions'::regclass, 'public.merchant_guide_progress'::regclass)
       -- The staff's own record about the store: the staff log, notes,
       -- watch list, tags, request ids, commissions (every admin_* and
       -- staff_* table) and who looked inside it as the merchant.
       AND c.relname !~ '^(admin|staff)_'
       AND c.oid <> 'public.support_view_sessions'::regclass
), edge AS (
    -- A row pointing at another table's row goes first.
    SELECT con.conrelid AS child, con.confrelid AS parent
      FROM pg_constraint con
     WHERE con.contype = 'f' AND con.conrelid <> con.confrelid
       AND con.conrelid IN (SELECT rel FROM cand) AND con.confrelid IN (SELECT rel FROM cand)
    UNION
    -- A table without tenant_id (stock-take lines, purchase lines) that
    -- leaves with Q but blocks P: Q goes before P.
    SELECT q.confrelid, p.confrelid
      FROM pg_constraint p
      JOIN pg_constraint q ON q.conrelid = p.conrelid AND q.contype = 'f' AND q.confdeltype = 'c'
     WHERE p.contype = 'f' AND p.confdeltype IN ('a', 'r')
       AND p.conrelid NOT IN (SELECT rel FROM cand)
       AND p.confrelid IN (SELECT rel FROM cand) AND q.confrelid IN (SELECT rel FROM cand)
       AND q.confrelid <> p.confrelid
), depth AS (
    SELECT rel, 0 AS d FROM cand
    UNION
    SELECT e.parent, depth.d + 1 FROM depth JOIN edge e ON e.child = depth.rel WHERE depth.d < 30
)
SELECT array_agg(t.rel ORDER BY t.d, t.rel::text)
  FROM (SELECT rel::regclass AS rel, max(d) AS d FROM depth GROUP BY rel) t;
$function$;

REVOKE ALL ON FUNCTION public.demo_store_sweep_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_store_sweep_tables() TO service_role;

COMMENT ON FUNCTION public.demo_store_sweep_tables() IS
    'Fermi B13: the tables a demo store reset empties, children before the tables they point at. Leaves out the store, its members, their permissions, the owner''s guide progress, every admin_* and staff_* table and support_view_sessions.';

CREATE OR REPLACE FUNCTION public.seed_demo_store(_tenant_id uuid, _owner_id uuid, _storefront jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
SET statement_timeout TO '60s'
AS $function$
DECLARE
    v_now timestamptz := date_trunc('minute', now());
    v_tables regclass[];
    v_tbl regclass;
    v_left boolean;
    v_first text[] := ARRAY['حيدر','مصطفى','زينب','فاطمة','علي','حسين','سجاد','نور','مريم','رقية','عباس','كرار',
                            'زهراء','أحمد','محمد','حسن','تبارك','دعاء','ياسين','منتظر','سارة','هبة','رسل','بنين',
                            'أمير','يوسف','عمار','ضحى','إسراء','غدير','ليث','آية','مرتضى','شهد','بتول','أنور'];
    v_last text[] := ARRAY['الربيعي','الساعدي','الجبوري','العبيدي','التميمي','الخفاجي','الموسوي','الحسيني',
                           'الزبيدي','الكعبي','الشمري','الدليمي','العامري','البياتي','اللامي','الحلفي',
                           'المالكي','الفتلاوي','العقابي','الياسري'];
    -- The shop's invented team, as the history and edit log name them.
    v_staff text[] := ARRAY['نور','كرار','رقية','حسن'];
    -- Weighted: about half the orders come from Baghdad and Basra.
    v_govs text[] := ARRAY['BGD','BGD','BGD','BGD','BGD','BGD','BGD','BGD','BGD','BAS','BAS','BAS','NJF','NJF',
                           'KRB','KRB','BBL','BBL','DYL','KOT','AMA','NAS','SAM','DWN','ANB','KRK','MOS','SAH',
                           'ARB','SMH'];
    v_bgd text[] := ARRAY['الكرادة','المنصور','زيونة','الأعظمية','الكاظمية','حي الجامعة','الدورة',
                          'بغداد الجديدة','الشعب','اليرموك','الحرية','الغدير','السيدية','البلديات'];
    v_hint text[] := ARRAY['قرب جامع الرحمن','قرب مدرسة النور','خلف سوق الخضار','مقابل صيدلية الشفاء',
                           'قرب الإعدادية المركزية','قرب الفلكة','قرب مستوصف الحي','مقابل محطة الوقود',
                           'قرب مخبز الأمل','بجانب ملعب الحي','قرب سوق الجمعة','مقابل حديقة الحي'];
    -- Products as orders pick them: the everyday ones more often than the sofa.
    v_pick int[] := ARRAY[1,1,1,2,2,3,4,4,5,6,6,6,7,7,7,7,8,9,9,10,11,12,13,14,15,16,16,17,18,18,18,
                          19,20,21,22,22,23,24,25,26,27,28,28,29,30,31,32,33,34,35,36,37,38,39,40,
                          3,4,6,7,9,25,26,29];
    v_result jsonb;
BEGIN
    IF NOT public.tenant_is_demo(_tenant_id) THEN
        RAISE EXCEPTION 'seed_demo_store: % is not the demo store', _tenant_id USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenant_members m
                    WHERE m.tenant_id = _tenant_id AND m.user_id = _owner_id AND m.status = 'active') THEN
        RAISE EXCEPTION 'seed_demo_store: % is not an active member of the demo store', _owner_id
            USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(_storefront) IS DISTINCT FROM 'object' OR jsonb_typeof(_storefront->'pages') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'seed_demo_store: the storefront design is not a store config' USING ERRCODE = '22023';
    END IF;

    -- For this transaction only: notifications_skip_demo_seed reads it.
    PERFORM set_config('fermi.demo_seed', 'on', true);

    -- ── 1. Empty the store ─────────────────────────────────────────────────
    -- demo_store_sweep_tables(): every table with a tenant_id, children
    -- first. The store, its members, their permissions, the owner's guide
    -- progress and the staff's own record about the store stay.
    v_tables := public.demo_store_sweep_tables();

    -- Orders first: deleting them puts stock back and rewrites Trust and
    -- Shield rows, which the sweep then clears with everything else.
    DELETE FROM public.orders WHERE tenant_id = _tenant_id;
    FOREACH v_tbl IN ARRAY v_tables LOOP
        EXECUTE format('DELETE FROM %s WHERE tenant_id = $1', v_tbl) USING _tenant_id;
    END LOOP;
    FOREACH v_tbl IN ARRAY v_tables LOOP
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE tenant_id = $1)', v_tbl) INTO v_left USING _tenant_id;
        IF v_left THEN
            RAISE EXCEPTION 'seed_demo_store: % still has rows of the demo store after emptying it', v_tbl;
        END IF;
    END LOOP;

    -- ── 2. The store ───────────────────────────────────────────────────────
    UPDATE public.tenants
       SET business_name = 'متجر مثال',
           plan = 'growth',
           status = 'active',
           trial_ends_at = NULL,
           city = 'بغداد',
           contact_phone = NULL,
           store_config = jsonb_build_object(
               'template', 'general',
               'hero', jsonb_build_object('title', 'متجر مثال', 'subtitle', '', 'cta_text', 'تسوق الآن', 'image_url', NULL),
               'contact', jsonb_build_object('whatsapp_number', NULL, 'instagram', NULL, 'facebook', NULL, 'tiktok', NULL),
               'about', jsonb_build_object('enabled', false, 'title', 'من نحن', 'body', ''),
               'sections_order', jsonb_build_array('hero', 'products', 'categories', 'about'),
               'enable_whatsapp_order', false),
           store_config_v2 = _storefront,
           store_config_v2_draft = NULL,
           config_version = 2,
           updated_at = now()
     WHERE id = _tenant_id;

    -- Paid up for this month; renewals charge nothing (charge_wallet_core).
    INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, auto_renew)
    VALUES (_tenant_id, 'growth', 'active', v_now - interval '12 days', v_now + interval '18 days', true);
    -- A balance on screen, with no ledger row behind it.
    INSERT INTO public.wallet (tenant_id, balance_iqd, threshold_iqd) VALUES (_tenant_id, 75000, 5000);
    INSERT INTO public.tenant_addons (tenant_id, kind, quantity) VALUES (_tenant_id, 'pos_branch', 1);

    -- Fixed ids, so a reset gives the same reasons.
    INSERT INTO public.order_reasons (id, tenant_id, kind, label_ar, label_en, sort_order, is_active, is_system, requires_note, color)
    SELECT md5('mithal:reason:' || r.kind || ':' || r.sort_order)::uuid, _tenant_id, r.kind, r.label_ar, r.label_en,
           r.sort_order, true, r.is_other, r.is_other, r.color
      FROM (VALUES
          ('cancel', 'لم يرد العميل', 'Customer did not reply', 0, false, 'amber'),
          ('cancel', 'ألغى العميل', 'Customer cancelled', 1, false, 'rose'),
          ('cancel', 'خارج منطقة التوصيل', 'Outside delivery area', 2, false, 'sky'),
          ('cancel', 'منتج غير متوفر', 'Product unavailable', 3, false, 'orange'),
          ('cancel', 'طلب مكرر', 'Duplicate order', 4, false, 'emerald'),
          ('cancel', 'سبب آخر', 'Other reason', 5, true, 'slate'),
          ('reject', 'لا يجاوب', 'No answer', 0, false, 'amber'),
          ('reject', 'عنوان خاطئ', 'Wrong address', 1, false, 'orange'),
          ('reject', 'رفض العميل', 'Customer refused', 2, false, 'rose'),
          ('reject', 'طلب التأجيل', 'Customer postponed', 3, false, 'sky'),
          ('reject', 'الهاتف مغلق', 'Phone off', 4, false, 'violet'),
          ('reject', 'منتج خاطئ', 'Wrong product', 5, false, 'emerald'),
          ('reject', 'سبب آخر', 'Other reason', 6, true, 'slate')
      ) AS r(kind, label_ar, label_en, sort_order, is_other, color);

    -- ── 3. Catalogue ───────────────────────────────────────────────────────
    INSERT INTO public.categories (id, tenant_id, name, name_ar, name_en, slug, display_order, is_visible, status, published_at, scope)
    SELECT md5('mithal:category:' || c.k)::uuid, _tenant_id, c.name, c.name, c.name_en, c.slug, c.k, true,
           'published', v_now - interval '60 days', 'both'
      FROM (VALUES (1, 'عطور', 'Perfume', 'perfume'),
                   (2, 'أزياء', 'Fashion', 'fashion'),
                   (3, 'إكسسوارات', 'Accessories', 'accessories'),
                   (4, 'منزل', 'Home', 'home')) AS c(k, name, name_en, slug);

    CREATE TEMP TABLE IF NOT EXISTS demo_seed_products (
        n int PRIMARY KEY, cat int, name text, short_name text, price int, cost int,
        compare_at int, photo text, opts jsonb
    ) ON COMMIT DROP;
    TRUNCATE demo_seed_products;
    -- opts: up to two options; "add" is what each value adds to the price.
    INSERT INTO demo_seed_products VALUES
        (1, 1, 'عطر عنبر الليل', 'عنبر الليل', 45000, 17000, 55000, '1588405748880-12d1d2a59f75',
            '[{"name":"الحجم","type":"size","values":["50 مل","100 مل"],"add":[0,20000]}]'),
        (2, 1, 'عطر ياقوت أحمر', 'ياقوت أحمر', 52000, 21000, NULL, '1608528577891-eb055944f2e7',
            '[{"name":"الحجم","type":"size","values":["50 مل","100 مل"],"add":[0,22000]}]'),
        (3, 1, 'زيت عطري بالخزامى', 'زيت خزامى', 18000, 6000, NULL, '1617897903246-719242758050', '[]'),
        (4, 1, 'عطر مسك أبيض', 'مسك أبيض', 38000, 14000, 45000, '1622618991746-fe6004db3a47',
            '[{"name":"الحجم","type":"size","values":["50 مل","100 مل"],"add":[0,18000]}]'),
        (5, 1, 'دهن عود ملكي', 'دهن عود', 35000, 15000, NULL, '1608571423902-eed4a5ad8108',
            '[{"name":"الحجم","type":"size","values":["3 مل","6 مل","12 مل"],"add":[0,25000,70000]}]'),
        (6, 2, 'تيشيرت قطن أبيض', 'تيشيرت أبيض', 15000, 5500, NULL, '1521572163474-6864f9cf17ab',
            '[{"name":"المقاس","type":"size","values":["S","M","L","XL"]}]'),
        (7, 2, 'تيشيرت أساسي ملوّن', 'تيشيرت ملوّن', 13000, 4500, 16000, '1562157873-818bc0726f68',
            '[{"name":"اللون","type":"color","values":["أبيض","أسود","أحمر","أزرق","أصفر"],"hex":["#F5F5F5","#111111","#B91C1C","#1E3A8A","#EAB308"]},{"name":"المقاس","type":"size","values":["S","M","L","XL"]}]'),
        (8, 2, 'تيشيرت أسود مطبوع', 'تيشيرت مطبوع', 17000, 6000, NULL, '1618354691373-d851c5c3a990',
            '[{"name":"المقاس","type":"size","values":["S","M","L","XL"]}]'),
        (9, 2, 'بلوزة قطن شتوية', 'بلوزة قطن', 25000, 9000, 30000, '1620799140408-edc6dcb6d633',
            '[{"name":"المقاس","type":"size","values":["S","M","L","XL"]}]'),
        (10, 2, 'كنزة صوف محبوكة', 'كنزة صوف', 32000, 12000, NULL, '1556905055-8f358a7a47b2',
            '[{"name":"اللون","type":"color","values":["رمادي","بيج"],"hex":["#9CA3AF","#D6C7A1"]},{"name":"المقاس","type":"size","values":["M","L","XL"]}]'),
        (11, 2, 'جاكيت جلد أسود', 'جاكيت جلد', 85000, 38000, 99000, '1551028719-00167b16eac5',
            '[{"name":"المقاس","type":"size","values":["M","L","XL"]}]'),
        (12, 2, 'جاكيت بومبر', 'جاكيت بومبر', 55000, 22000, NULL, '1591047139829-d91aecb6caea',
            '[{"name":"المقاس","type":"size","values":["S","M","L","XL"]}]'),
        (13, 2, 'قميص منقّط', 'قميص منقط', 28000, 10000, NULL, '1596755094514-f87e34085b2c',
            '[{"name":"المقاس","type":"size","values":["S","M","L","XL"]}]'),
        (14, 2, 'قميص رسمي', 'قميص رسمي', 30000, 11000, 35000, '1602810318383-e386cc2a3ccf',
            '[{"name":"اللون","type":"color","values":["أبيض","رمادي","عنابي"],"hex":["#F8FAFC","#64748B","#7F1D1D"]},{"name":"المقاس","type":"size","values":["M","L","XL"]}]'),
        (15, 2, 'بنطلون واسع', 'بنطلون واسع', 27000, 10000, NULL, '1594633312681-425c7b97ccd1',
            '[{"name":"المقاس","type":"size","values":["S","M","L"]}]'),
        (16, 2, 'فستان جينز', 'فستان جينز', 42000, 16000, 50000, '1591369822096-ffd140ec948f',
            '[{"name":"المقاس","type":"size","values":["S","M","L"]}]'),
        (17, 2, 'جمبسوت زيتي', 'جمبسوت', 39000, 15000, NULL, '1618932260643-eee4a2f652a6',
            '[{"name":"المقاس","type":"size","values":["S","M","L"]}]'),
        (18, 2, 'حذاء رياضي مريح', 'حذاء رياضي', 48000, 20000, 60000, '1560769629-975ec94e6a86',
            '[{"name":"المقاس","type":"size","values":["40","41","42","43","44"]}]'),
        (19, 3, 'ساعة ذكية بيضاء', 'ساعة ذكية', 60000, 27000, 75000, '1523275335684-37898b6baf30', '[]'),
        (20, 3, 'ساعة جلد كلاسيك', 'ساعة جلد', 45000, 18000, NULL, '1524592094714-0f0654e20314', '[]'),
        (21, 3, 'حقيبة يد حمراء', 'حقيبة حمراء', 55000, 21000, NULL, '1584917865442-de89df76afd3', '[]'),
        (22, 3, 'نظارة شمسية دائرية', 'نظارة دائرية', 22000, 7000, 28000, '1511499767150-a48a237f0083', '[]'),
        (23, 3, 'حقيبة ظهر يومية', 'حقيبة ظهر', 35000, 13000, NULL, '1553062407-98eeb64c6a62', '[]'),
        (24, 3, 'محفظة جلد بنية', 'محفظة جلد', 20000, 7000, NULL, '1627123424574-724758594e93', '[]'),
        (25, 3, 'سوار ذهبي ناعم', 'سوار ذهبي', 18000, 6000, NULL, '1611591437281-460bfbe1220a', '[]'),
        (26, 3, 'حلق كريستال', 'حلق كريستال', 16000, 5000, 20000, '1535632066927-ab7c9ab60908', '[]'),
        (27, 3, 'حقيبة قماش', 'حقيبة قماش', 10000, 3000, NULL, '1544816155-12df9643f363', '[]'),
        (28, 4, 'شمعة معطّرة', 'شمعة معطرة', 12000, 4000, NULL, '1602874801007-bd458bb1b8b6',
            '[{"name":"الرائحة","type":"custom","values":["فانيلا","عود","ورد"]}]'),
        (29, 4, 'كوب سيراميك', 'كوب سيراميك', 8000, 2500, NULL, '1514228742587-6b1558fcca3d', '[]'),
        (30, 4, 'وسادة قطن', 'وسادة قطن', 15000, 5500, NULL, '1584100936595-c0654b55a2e2', '[]'),
        (31, 4, 'مزهرية سيراميك', 'مزهرية', 25000, 9000, 30000, '1578500494198-246f612d3b3d', '[]'),
        (32, 4, 'طقم فناجين', 'طقم فناجين', 22000, 8000, NULL, '1610701596007-11502861dcfa', '[]'),
        (33, 4, 'مصباح أرضي', 'مصباح أرضي', 70000, 32000, 85000, '1507473885765-e6ed057f782c', '[]'),
        (34, 4, 'صبّار بأصيص', 'صبار', 9000, 3000, NULL, '1485955900006-10f4d324d411', '[]'),
        (35, 4, 'ساعة حائط', 'ساعة حائط', 19000, 7000, NULL, '1563861826100-9cb868fdbe1c', '[]'),
        (36, 4, 'طقم سلطانيات', 'سلطانيات', 17000, 6000, NULL, '1603199506016-b9a594b593c0', '[]'),
        (37, 4, 'سجادة مطرّزة', 'سجادة', 95000, 45000, 120000, '1600166898405-da9535204843',
            '[{"name":"القياس","type":"size","values":["120×180","160×230"],"add":[0,45000]}]'),
        (38, 4, 'كنبة مخمل خضراء', 'كنبة مخمل', 350000, 190000, 420000, '1555041469-a586c61ea9bc', '[]'),
        (39, 4, 'كرسي أبيض', 'كرسي أبيض', 45000, 19000, NULL, '1517705008128-361805f42e86', '[]'),
        (40, 4, 'طقم براويز', 'براويز', 30000, 11000, NULL, '1513519245088-0e12902e5a38', '[]');

    INSERT INTO public.products (id, tenant_id, name, short_name, display_name, slug, sku, description,
                                 price, cost, compare_at_price, stock_quantity, low_stock_threshold,
                                 image_url, gallery_urls, category_id, status, is_visible, product_type,
                                 display_order, created_at, updated_at)
    SELECT md5('mithal:product:' || p.n)::uuid, _tenant_id, p.name, p.short_name, p.name,
           'mithal-' || p.n, 'MTH-' || lpad(p.n::text, 3, '0'),
           'منتج تجريبي من متجر مثال.',
           p.price, p.cost, p.compare_at,
           -- The pot plant runs low, so the stock warning has something to show.
           CASE WHEN p.n = 34 THEN 3 ELSE 60 + (p.n * 7) % 40 END,
           5,
           'https://images.unsplash.com/photo-' || p.photo || '?w=800&h=800&fit=crop&q=80',
           '[]'::jsonb,
           md5('mithal:category:' || p.cat)::uuid, 'active', true, 'physical', p.n,
           v_now - interval '45 days', v_now - interval '45 days'
      FROM demo_seed_products p;

    INSERT INTO public.product_categories (tenant_id, product_id, category_id, is_primary)
    SELECT _tenant_id, md5('mithal:product:' || p.n)::uuid, md5('mithal:category:' || p.cat)::uuid, true
      FROM demo_seed_products p;

    INSERT INTO public.product_options (id, tenant_id, product_id, name, values, option_type, values_metadata, display_order)
    SELECT md5('mithal:option:' || p.n || ':' || o.i)::uuid, _tenant_id, md5('mithal:product:' || p.n)::uuid,
           o.opt->>'name', o.opt->'values', o.opt->>'type',
           CASE WHEN o.opt ? 'hex' THEN
               (SELECT jsonb_agg(jsonb_build_object('label', v.val, 'hex', o.opt->'hex'->>(v.j - 1)::int) ORDER BY v.j)
                  FROM jsonb_array_elements_text(o.opt->'values') WITH ORDINALITY AS v(val, j))
           END,
           o.i - 1
      FROM demo_seed_products p
      CROSS JOIN LATERAL jsonb_array_elements(p.opts) WITH ORDINALITY AS o(opt, i);

    -- Every combination of the (at most two) options, named as the product
    -- editor names them: "أسود / M".
    INSERT INTO public.product_variants (id, tenant_id, product_id, name, option_values, price, cost,
                                         stock_quantity, sku, is_enabled, display_order, low_stock_threshold)
    SELECT md5('mithal:variant:' || p.n || ':' || a.i || ':' || COALESCE(b.i, 0))::uuid,
           _tenant_id, md5('mithal:product:' || p.n)::uuid,
           a.v || COALESCE(' / ' || b.v, ''),
           jsonb_build_object(p.opts->0->>'name', a.v)
               || CASE WHEN b.v IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(p.opts->1->>'name', b.v) END,
           p.price + COALESCE((p.opts->0->'add'->>(a.i - 1)::int)::int, 0),
           p.cost + round(COALESCE((p.opts->0->'add'->>(a.i - 1)::int)::int, 0) * 0.4)::int,
           12 + (p.n * 3 + a.i * 5 + COALESCE(b.i, 0) * 7) % 30,
           'MTH-' || lpad(p.n::text, 3, '0') || '-' || a.i || COALESCE('-' || b.i, ''),
           true, (a.i - 1) * 10 + COALESCE(b.i, 0), 3
      FROM demo_seed_products p
      CROSS JOIN LATERAL jsonb_array_elements_text(p.opts->0->'values') WITH ORDINALITY AS a(v, i)
      LEFT JOIN LATERAL jsonb_array_elements_text(p.opts->1->'values') WITH ORDINALITY AS b(v, i) ON true
     WHERE jsonb_array_length(p.opts) > 0;

    -- ── 4. Orders ──────────────────────────────────────────────────────────
    CREATE TEMP TABLE IF NOT EXISTS demo_seed_orders (
        k text PRIMARY KEY, created_at timestamptz, customer int, customer_name text, gov text, city text,
        address text, items jsonb, discount int, status text, source text, reason text,
        delivered_at timestamptz, completed_at timestamptz, staff text, notes text, internal_notes text,
        priority text
    ) ON COMMIT DROP;
    TRUNCATE demo_seed_orders;

    -- One line of an order: a product (and one of its variants) from a hash.
    CREATE TEMP TABLE IF NOT EXISTS demo_seed_lines (
        n int, vi int, pid uuid, vid uuid, name text, variant_name text, price int, image_url text, sku text
    ) ON COMMIT DROP;
    TRUNCATE demo_seed_lines;
    INSERT INTO demo_seed_lines
    SELECT p.n, row_number() OVER (PARTITION BY p.n ORDER BY v.display_order)::int - 1,
           md5('mithal:product:' || p.n)::uuid, v.id, p.short_name, v.name,
           COALESCE(v.price, p.price)::int,
           'https://images.unsplash.com/photo-' || p.photo || '?w=800&h=800&fit=crop&q=80',
           COALESCE(v.sku, 'MTH-' || lpad(p.n::text, 3, '0'))
      FROM demo_seed_products p
      LEFT JOIN public.product_variants v
             ON v.tenant_id = _tenant_id AND v.product_id = md5('mithal:product:' || p.n)::uuid;

    -- The everyday orders: about nine a day over 30 days. h1 and h2 are 32
    -- fixed bytes per order that pick everything else.
    INSERT INTO demo_seed_orders
    SELECT 'o' || i,
           LEAST(
               ((date_trunc('day', v_now AT TIME ZONE 'Asia/Baghdad') - make_interval(days => d)
                 + make_interval(hours => 9 + get_byte(h1, 1) % 13, mins => get_byte(h1, 2) % 60))
                AT TIME ZONE 'Asia/Baghdad'),
               v_now - make_interval(mins => 5 + i % 50)),
           cust, NULL,
           v_govs[1 + get_byte(h1, 5) % array_length(v_govs, 1)], NULL,
           NULL,
           (SELECT jsonb_agg(jsonb_build_object(
                       'product_id', l.pid, 'variant_id', l.vid, 'name', l.name, 'variant_name', l.variant_name,
                       'quantity', CASE WHEN get_byte(h2, 10 + k) > 225 THEN 2 ELSE 1 END,
                       'price', l.price, 'image_url', l.image_url, 'sku', l.sku) ORDER BY k)
              FROM generate_series(1, CASE WHEN get_byte(h1, 10) < 180 THEN 1 WHEN get_byte(h1, 10) < 240 THEN 2 ELSE 3 END) AS k
              JOIN LATERAL (
                  SELECT dl.* FROM demo_seed_lines dl
                   WHERE dl.n = v_pick[1 + get_byte(h1, 10 + k) % array_length(v_pick, 1)]
                   ORDER BY dl.vi
                  OFFSET get_byte(h2, 5 + k) % (SELECT count(*) FROM demo_seed_lines x
                                                   WHERE x.n = v_pick[1 + get_byte(h1, 10 + k) % array_length(v_pick, 1)])
                   LIMIT 1) l ON true),
           CASE WHEN get_byte(h2, 1) < 26 THEN 5000 WHEN get_byte(h2, 1) < 52 THEN 2000 ELSE 0 END,
           st,
           CASE WHEN get_byte(h2, 2) < 90 THEN 'whatsapp' WHEN get_byte(h2, 2) < 155 THEN 'meta'
                WHEN get_byte(h2, 2) < 215 THEN 'tiktok' ELSE 'storefront' END,
           CASE st
               WHEN 'rejected' THEN (ARRAY['رفض العميل','عنوان خاطئ','الهاتف مغلق','لا يجاوب','طلب التأجيل','رفض العميل','منتج خاطئ'])[1 + get_byte(h2, 3) % 7]
               WHEN 'cancelled' THEN (ARRAY['ألغى العميل','طلب مكرر','خارج منطقة التوصيل','لم يرد العميل'])[1 + get_byte(h2, 3) % 4]
           END,
           NULL, NULL,
           v_staff[1 + get_byte(h2, 4) % array_length(v_staff, 1)], NULL, NULL, 'normal'
      FROM (
          SELECT i, h1, h2, d,
                 -- One customer in ten orders again (phones 001-025); the rest are new.
                 CASE WHEN get_byte(h1, 3) < 26 THEN 1 + get_byte(h1, 4) % 25 ELSE 100 + i END AS cust,
                 CASE
                     WHEN d = 0 THEN CASE WHEN b < 90 THEN 'new' WHEN b < 125 THEN 'contacted' WHEN b < 215 THEN 'confirmed'
                                          WHEN b < 235 THEN 'suspended' ELSE 'cancelled' END
                     WHEN d = 1 THEN CASE WHEN b < 30 THEN 'new' WHEN b < 60 THEN 'contacted' WHEN b < 180 THEN 'confirmed'
                                          WHEN b < 215 THEN 'in_transit' WHEN b < 232 THEN 'suspended' ELSE 'cancelled' END
                     WHEN d <= 4 THEN CASE WHEN b < 150 THEN 'in_transit' WHEN b < 190 THEN 'delivered' WHEN b < 205 THEN 'confirmed'
                                           WHEN b < 222 THEN 'no_response' ELSE 'cancelled' END
                     WHEN d <= 6 THEN CASE WHEN b < 40 THEN 'in_transit' WHEN b < 130 THEN 'delivered' WHEN b < 190 THEN 'completed'
                                           WHEN b < 215 THEN 'rejected' WHEN b < 230 THEN 'no_response' WHEN b < 242 THEN 'return_pending'
                                           ELSE 'cancelled' END
                     ELSE CASE WHEN b < 172 THEN 'completed' WHEN b < 192 THEN 'delivered' WHEN b < 216 THEN 'rejected'
                               WHEN b < 230 THEN 'no_response' WHEN b < 243 THEN 'cancelled' ELSE 'refund_delivered' END
                 END AS st
            FROM (
                SELECT i, decode(md5('mithal:order:' || i), 'hex') AS h1, decode(md5('mithal:order2:' || i), 'hex') AS h2,
                       (264 - i) * 30 / 264 AS d,
                       get_byte(decode(md5('mithal:order:' || i), 'hex'), 9) AS b
                  FROM generate_series(1, 264) AS i
            ) x
      ) y;

    -- Stuck with the courier (عالقة): out for 8 to 15 days, never back.
    INSERT INTO demo_seed_orders (k, created_at, customer, gov, items, discount, status, source, staff, priority)
    SELECT 'stuck' || s.j, v_now - make_interval(days => s.days, hours => 3 + s.j),
           900 + s.j, s.gov,
           (SELECT jsonb_build_array(jsonb_build_object('product_id', l.pid, 'variant_id', l.vid, 'name', l.name,
                       'variant_name', l.variant_name, 'quantity', 1, 'price', l.price, 'image_url', l.image_url, 'sku', l.sku))
              FROM demo_seed_lines l WHERE l.n = s.n ORDER BY l.vi LIMIT 1),
           0, 'in_transit', s.source, v_staff[1 + s.j % 4], 'normal'
      FROM (VALUES (0, 9, 'BAS', 12, 'meta'), (1, 11, 'NAS', 4, 'tiktok'), (2, 12, 'BGD', 21, 'whatsapp'),
                   (3, 14, 'MOS', 18, 'meta'), (4, 16, 'DYL', 9, 'tiktok')) AS s(j, days, gov, n, source);

    -- A duplicate pair (مكررين): one customer ordered the same thing twice,
    -- twelve minutes apart, from the store and then on WhatsApp.
    INSERT INTO demo_seed_orders (k, created_at, customer, customer_name, gov, city, address, items, discount, status, source, staff, priority)
    SELECT 'dup' || s.j, v_now - make_interval(mins => s.mins), 910, s.name, 'BGD', 'زيونة', s.address,
           (SELECT jsonb_build_array(jsonb_build_object('product_id', l.pid, 'variant_id', l.vid, 'name', l.name,
                       'variant_name', l.variant_name, 'quantity', 1, 'price', l.price, 'image_url', l.image_url, 'sku', l.sku))
              FROM demo_seed_lines l WHERE l.n = 12 AND l.variant_name = 'L'),
           0, 'new', s.source, NULL, 'normal'
      FROM (VALUES (0, 52, 'حيدر الساعدي', 'محلة 712، زقاق 9، قرب جامع الرحمن', 'storefront'),
                   (1, 40, 'حيدر', 'زيونة، محلة 712، زقاق 9، قرب جامع الرحمن، الطابق الثاني', 'whatsapp')) AS s(j, mins, name, address, source);

    -- The order with a full edit log (سجل الطلب): confirmed yesterday after
    -- the team changed the address, the size and the priority.
    INSERT INTO demo_seed_orders (k, created_at, customer, customer_name, gov, city, address, items, discount, status, source, staff, internal_notes, priority)
    SELECT 'edited', v_now - interval '1 day 3 hours', 920, 'مريم الموسوي', 'BGD', 'المنصور',
           'محلة 605، زقاق 22، دار 14، قرب مخبز الأمل',
           (SELECT jsonb_build_array(
                       jsonb_build_object('product_id', l.pid, 'variant_id', l.vid, 'name', l.name, 'variant_name', l.variant_name,
                                          'quantity', 2, 'price', l.price, 'image_url', l.image_url, 'sku', l.sku))
              FROM demo_seed_lines l WHERE l.n = 7 AND l.variant_name = 'أسود / M'),
           0, 'confirmed', 'whatsapp', 'نور', 'الزبونة تريد التوصيل بعد العصر', 'high';

    -- Shield (local to this store only): three customers who refused or
    -- never answered before, each with a new order today.
    INSERT INTO demo_seed_orders (k, created_at, customer, gov, items, discount, status, source, reason, staff, priority)
    SELECT 'shield' || s.j, v_now - make_interval(days => s.days, hours => 2 + s.j), s.cust, s.gov,
           (SELECT jsonb_build_array(jsonb_build_object('product_id', l.pid, 'variant_id', l.vid, 'name', l.name,
                       'variant_name', l.variant_name, 'quantity', 1, 'price', l.price, 'image_url', l.image_url, 'sku', l.sku))
              FROM demo_seed_lines l WHERE l.n = s.n ORDER BY l.vi LIMIT 1),
           0, s.status, s.source, s.reason, v_staff[1 + s.j % 4], 'normal'
      FROM (VALUES
                (0, 930, 21, 'rejected', 'رفض العميل', 'BAS', 11, 'meta'),
                (1, 930, 12, 'rejected', 'رفض العميل', 'BAS', 18, 'meta'),
                (2, 930, 0, 'new', NULL, 'BAS', 19, 'meta'),
                (3, 931, 18, 'no_response', NULL, 'KOT', 1, 'tiktok'),
                (4, 931, 9, 'rejected', 'الهاتف مغلق', 'KOT', 22, 'tiktok'),
                (5, 931, 0, 'contacted', NULL, 'KOT', 4, 'tiktok'),
                (6, 932, 25, 'rejected', 'رفض العميل', 'NAS', 33, 'meta'),
                (7, 932, 15, 'cancelled', 'ألغى العميل', 'NAS', 21, 'meta'),
                (8, 932, 6, 'no_response', NULL, 'NAS', 2, 'meta'),
                (9, 932, 0, 'new', NULL, 'NAS', 11, 'meta')) AS s(j, cust, days, status, reason, gov, n, source);

    -- Abandoned carts: shoppers who typed a phone on the store and left.
    INSERT INTO demo_seed_orders (k, created_at, customer, customer_name, gov, items, discount, status, source, notes, staff, priority)
    SELECT 'cart' || s.j, v_now - make_interval(hours => s.hours, mins => 7 * s.j), 940 + s.j, s.name, s.gov,
           (SELECT jsonb_build_array(jsonb_build_object('product_id', l.pid, 'variant_id', l.vid, 'name', l.name,
                       'variant_name', l.variant_name, 'quantity', 1, 'price', l.price, 'image_url', l.image_url))
              FROM demo_seed_lines l WHERE l.n = s.n ORDER BY l.vi DESC LIMIT 1),
           0, 'pending_checkout', 'storefront', '[سلة متروكة]', NULL, 'normal'
      FROM (VALUES (0, 2, 'رسل', 'BGD', 16), (1, 5, 'بدون اسم', 'BAS', 1), (2, 9, 'منتظر', 'NJF', 18),
                   (3, 14, 'بدون اسم', 'BGD', 21), (4, 20, 'آية', 'KRB', 9), (5, 27, 'بدون اسم', 'BBL', 31),
                   (6, 33, 'عمار', 'BGD', 11), (7, 44, 'هبة', 'DYL', 6)) AS s(j, hours, name, gov, n);

    -- Names, places and the courier's dates, from the same hashes.
    UPDATE demo_seed_orders o
       SET customer_name = COALESCE(o.customer_name,
               v_first[1 + get_byte(decode(md5('mithal:customer:' || o.customer), 'hex'), 0) % array_length(v_first, 1)]
               || ' ' ||
               v_last[1 + get_byte(decode(md5('mithal:customer:' || o.customer), 'hex'), 1) % array_length(v_last, 1)]),
           city = COALESCE(o.city, CASE o.gov
               WHEN 'BGD' THEN v_bgd[1 + get_byte(decode(md5('mithal:customer:' || o.customer), 'hex'), 2) % array_length(v_bgd, 1)]
               WHEN 'BAS' THEN 'البصرة' WHEN 'NJF' THEN 'النجف' WHEN 'KRB' THEN 'كربلاء' WHEN 'BBL' THEN 'الحلة'
               WHEN 'DYL' THEN 'بعقوبة' WHEN 'KOT' THEN 'الكوت' WHEN 'AMA' THEN 'العمارة' WHEN 'NAS' THEN 'الناصرية'
               WHEN 'SAM' THEN 'السماوة' WHEN 'DWN' THEN 'الديوانية' WHEN 'ANB' THEN 'الرمادي' WHEN 'KRK' THEN 'كركوك'
               WHEN 'MOS' THEN 'الموصل' WHEN 'SAH' THEN 'تكريت' WHEN 'ARB' THEN 'أربيل' WHEN 'SMH' THEN 'السليمانية'
           END),
           address = COALESCE(o.address,
               'محلة ' || (100 + (get_byte(decode(md5('mithal:customer:' || o.customer), 'hex'), 3) * 3) % 800)
               || '، زقاق ' || (1 + get_byte(decode(md5('mithal:customer:' || o.customer), 'hex'), 4) % 40)
               || '، ' || v_hint[1 + get_byte(decode(md5('mithal:customer:' || o.customer), 'hex'), 5) % array_length(v_hint, 1)]),
           delivered_at = CASE WHEN o.status IN ('delivered', 'completed')
               THEN LEAST(o.created_at + make_interval(days => 1 + o.customer % 2, hours => 5), v_now - interval '1 hour') END,
           completed_at = CASE WHEN o.status = 'completed'
               THEN LEAST(o.created_at + make_interval(days => 3 + o.customer % 2, hours => 2), v_now - interval '30 minutes') END
     -- Every row. The API's database sessions refuse an UPDATE with no WHERE.
     WHERE true;

    INSERT INTO public.orders (id, tenant_id, order_id, sequence_number, created_at, customer_name, phone,
                               governorate_code, city, address_details, items, price, delivery_fee, discount_amount,
                               status, source, payment_status, priority, rejection_reason, reason_id,
                               delivered_at, completed_at, cancelled_at, reviewed_at, notes, internal_notes,
                               last_status_changed_by_name, delivered_source)
    SELECT md5('mithal:order-id:' || o.k)::uuid, _tenant_id,
           -- Numbers no real order can have: real ones start with 1-4.
           '9' || to_char(o.created_at AT TIME ZONE 'Asia/Baghdad', 'YYMMDD')
               || lpad(row_number() OVER (PARTITION BY (o.created_at AT TIME ZONE 'Asia/Baghdad')::date
                                          ORDER BY o.created_at, o.k)::text, 3, '0'),
           row_number() OVER (ORDER BY o.created_at, o.k),
           o.created_at, o.customer_name, '07700000' || lpad(o.customer::text, 3, '0'),
           o.gov, o.city, o.address, o.items,
           GREATEST(0, (SELECT sum((it->>'price')::int * (it->>'quantity')::int) FROM jsonb_array_elements(o.items) it) - o.discount),
           0, o.discount, o.status, o.source, 'cod', o.priority, o.reason,
           (SELECT r.id FROM public.order_reasons r
             WHERE r.tenant_id = _tenant_id AND r.label_ar = o.reason
               AND r.kind = CASE WHEN o.status = 'cancelled' THEN 'cancel' ELSE 'reject' END),
           o.delivered_at, o.completed_at,
           CASE WHEN o.status = 'cancelled' THEN o.created_at + interval '3 hours' END,
           o.completed_at,
           o.notes, o.internal_notes,
           CASE WHEN o.status IN ('new', 'pending_checkout') THEN NULL ELSE o.staff END,
           CASE WHEN o.delivered_at IS NOT NULL THEN 'manual' END
      FROM demo_seed_orders o;

    -- The cart rows behind the abandoned checkouts, already turned into
    -- orders (so promote_abandoned_carts leaves them).
    INSERT INTO public.abandoned_carts (tenant_id, phone, items, subtotal_iqd, governorate, locale, created_at,
                                        updated_at, customer_name, city, address, order_id)
    SELECT _tenant_id, o.phone,
           (SELECT jsonb_agg(jsonb_build_object('product_id', it->>'product_id', 'variant_id', it->>'variant_id',
                                                'name', it->>'name', 'quantity', (it->>'quantity')::int,
                                                'price', (it->>'price')::int))
              FROM jsonb_array_elements(o.items) it),
           o.price::int, o.governorate_code, 'ar', o.created_at - interval '6 minutes', o.created_at - interval '5 minutes',
           NULLIF(o.customer_name, 'بدون اسم'), o.city, o.address_details, o.id
      FROM public.orders o
     WHERE o.tenant_id = _tenant_id AND o.status = 'pending_checkout';

    -- ── 5. History: each order's road, by the team ─────────────────────────
    DELETE FROM public.order_status_history WHERE tenant_id = _tenant_id;
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, changed_at, notes, tenant_id)
    SELECT s.id, lag(s.st) OVER (PARTITION BY s.id ORDER BY s.step), s.st,
           CASE WHEN s.step = 1 THEN CASE WHEN s.source = 'storefront' THEN 'Automation' ELSE s.staff END ELSE s.staff END,
           LEAST(s.at, v_now - interval '2 minutes'),
           CASE WHEN s.step = 1 THEN 'Order Created' END,
           _tenant_id
      FROM (
          SELECT o.id, o.source, COALESCE(o.last_status_changed_by_name, v_staff[1]) AS staff, c.st, c.step,
                 CASE c.st
                     WHEN 'new' THEN o.created_at
                     WHEN 'pending_checkout' THEN o.created_at
                     WHEN 'contacted' THEN o.created_at + interval '40 minutes'
                     WHEN 'confirmed' THEN o.created_at + interval '2 hours'
                     WHEN 'suspended' THEN o.created_at + interval '5 hours'
                     WHEN 'cancelled' THEN o.created_at + interval '3 hours'
                     WHEN 'in_transit' THEN o.created_at + interval '1 day'
                     WHEN 'delivered' THEN o.delivered_at
                     WHEN 'completed' THEN o.completed_at
                     WHEN 'no_response' THEN o.created_at + interval '1 day 2 hours'
                     WHEN 'rejected' THEN o.created_at + interval '2 days 4 hours'
                     WHEN 'return_pending' THEN o.created_at + interval '2 days 6 hours'
                     WHEN 'refund_delivered' THEN o.created_at + interval '5 days'
                 END AS at
            FROM public.orders o
            CROSS JOIN LATERAL unnest(CASE o.status
                WHEN 'new' THEN ARRAY['new']
                WHEN 'pending_checkout' THEN ARRAY['pending_checkout']
                WHEN 'contacted' THEN ARRAY['new', 'contacted']
                WHEN 'confirmed' THEN ARRAY['new', 'contacted', 'confirmed']
                WHEN 'suspended' THEN ARRAY['new', 'contacted', 'suspended']
                WHEN 'cancelled' THEN ARRAY['new', 'cancelled']
                WHEN 'in_transit' THEN ARRAY['new', 'confirmed', 'in_transit']
                WHEN 'delivered' THEN ARRAY['new', 'confirmed', 'in_transit', 'delivered']
                WHEN 'completed' THEN ARRAY['new', 'confirmed', 'in_transit', 'delivered', 'completed']
                WHEN 'no_response' THEN ARRAY['new', 'no_response']
                WHEN 'rejected' THEN ARRAY['new', 'confirmed', 'in_transit', 'rejected']
                WHEN 'return_pending' THEN ARRAY['new', 'confirmed', 'in_transit', 'return_pending']
                WHEN 'refund_delivered' THEN ARRAY['new', 'confirmed', 'in_transit', 'return_pending', 'refund_delivered']
                ELSE ARRAY[o.status]
            END) WITH ORDINALITY AS c(st, step)
           WHERE o.tenant_id = _tenant_id
      ) s
    -- In step order: each row names the order's last actor as it lands.
    ORDER BY s.id, s.step;

    -- The edit log of the edited order: what the team changed, and who.
    INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data, created_at)
    SELECT _tenant_id, md5('mithal:order-id:edited')::uuid, e.kind, NULL, e.actor, e.data, v_now - e.ago
      FROM (VALUES
          ('edit', 'نور', interval '1 day 2 hours 20 minutes', jsonb_build_object('fields', jsonb_build_array(
              jsonb_build_object('f', 'address', 'old', 'المنصور، قرب مخبز الأمل', 'new', 'محلة 605، زقاق 22، دار 14، قرب مخبز الأمل')))),
          ('edit', 'كرار', interval '1 day 1 hour 50 minutes', jsonb_build_object('fields', jsonb_build_array(
              jsonb_build_object('f', 'items', 'old', 'تيشيرت ملوّن (أسود / S) × 1', 'new', 'تيشيرت ملوّن (أسود / M) × 2'),
              jsonb_build_object('f', 'price', 'old', 13000, 'new', 26000)))),
          ('flag', 'نور', interval '1 day 1 hour 30 minutes', jsonb_build_object('flags', jsonb_build_array(
              jsonb_build_object('f', 'priority', 'old', 'normal', 'new', 'high')))),
          ('edit', 'رقية', interval '1 day 1 hour 10 minutes', jsonb_build_object('fields', jsonb_build_array(
              jsonb_build_object('f', 'internal_notes', 'old', NULL, 'new', 'الزبونة تريد التوصيل بعد العصر'))))
      ) AS e(kind, actor, ago, data);

    -- ── 6. Prime: the courier the store ships with ─────────────────────────
    -- Every order that left with the courier went by Prime. The store has no
    -- prime_connections row (the walls refuse one), so the cron, the webhooks
    -- and Prime itself never see these parcels: the store's Prime page reads
    -- them through the app's demo client, which pays each payment the day
    -- after its last delivery (lib/prime/demo-client). Case ids have nine
    -- digits; Prime's real ones have eight. Prime charges 5,000 a parcel.
    --   Closed orders: Prime paid them a day's deliveries at a time, and the
    --     store approved each payment the day it closed those orders.
    --   Delivered over two days ago: on Prime's newest payment, which waits
    --     for the store's approval; one was delivered for 5,000 less.
    --   Delivered since: Prime still holds the cash.
    --   On the road: where each is by how long it has been out. The stuck
    --     ones never got past the road to their governorate.
    --   Refused, or coming back: on their way back to the store.
    CREATE TEMP TABLE IF NOT EXISTS demo_seed_prime (
        order_id uuid PRIMARY KEY, receipt text, case_id bigint, collect bigint, kind text,
        sent_at timestamptz, changed_at timestamptz, payment_id bigint, reason text, completed_at timestamptz
    ) ON COMMIT DROP;
    TRUNCATE demo_seed_prime;
    CREATE TEMP TABLE IF NOT EXISTS demo_seed_prime_steps (
        kind text PRIMARY KEY, status text, step text, step_name text, hours int
    ) ON COMMIT DROP;
    TRUNCATE demo_seed_prime_steps;
    INSERT INTO demo_seed_prime_steps VALUES
        ('pickup',    'ONWAY', 'READYTOPICKUP', 'جاهز للبيك اب', 0),
        ('store',     'ONWAY', 'NEWINSTORE', 'في مخزن Prime', 6),
        ('road',      'ONWAY', 'NEW_ONWAY', 'في الطريق إلى المحافظة', 18),
        ('stuck',     'ONWAY', 'NEW_ONWAY', 'في الطريق إلى المحافظة', 18),
        ('driver',    'ONWAY', 'ONWAY', 'عند مندوب التوصيل', 26),
        ('postponed', 'POSTPONED', 'POSTPONED', 'مؤجل', 30),
        ('failed',    'CNCL', 'RTN_WITHAGENT', 'تعذر التوصيل', 30),
        ('returning', 'FAILED_DELIVER_RETURNED_TO_SENDER', 'RTN_WITH_PICKUPAGENT', 'راجع عند مندوب الأستلام', 50),
        ('refused',   'FAILED_DELIVER_RETURNED_TO_SENDER', 'RTN_WITH_PICKUPAGENT', 'راجع عند مندوب الأستلام', NULL),
        ('back',      'FAILED_DELIVER_RETURNED_TO_SENDER', 'RTN_MANIFEST_LIAISON', 'راجع في المخزن : منفيست رواجع الفروع', NULL),
        ('delivered', 'DELIVERED', 'DLEIVERD', 'شحنات سلمت بنجاح', NULL),
        ('new_price', 'DELIVERED_CHANGE_PRICE', 'SUCC_CHANGEPRICE', 'سلمت مع تغيير المبلغ', NULL);

    INSERT INTO demo_seed_prime (order_id, receipt, case_id, collect, kind, sent_at, payment_id, reason, completed_at)
    SELECT o.id, o.order_id, 900000000 + o.sequence_number, o.price, k.kind, s.sent_at,
           CASE
               -- One payment a day: the day the store closed those orders.
               WHEN o.status = 'completed'
                   THEN 91100 - ((v_now AT TIME ZONE 'Asia/Baghdad')::date - (o.completed_at AT TIME ZONE 'Asia/Baghdad')::date)
               WHEN o.status = 'delivered' AND o.delivered_at < v_now - interval '2 days' THEN 91101
           END,
           CASE k.kind
               WHEN 'failed' THEN 'NO_ANSWER'
               WHEN 'returning' THEN 'CLS'
               WHEN 'postponed' THEN 'WILL_RCV_LATERFROMSNDR'
               WHEN 'refused' THEN 'DENIED'
               WHEN 'back' THEN 'DENIED'
           END,
           o.completed_at
      FROM public.orders o
      JOIN demo_seed_orders d ON md5('mithal:order-id:' || d.k)::uuid = o.id
      CROSS JOIN LATERAL (SELECT LEAST(o.created_at + interval '1 day', v_now - interval '30 minutes') AS sent_at) s
      CROSS JOIN LATERAL (
          SELECT CASE
                     WHEN o.status IN ('delivered', 'completed') THEN 'delivered'
                     WHEN o.status = 'rejected' THEN 'refused'
                     WHEN o.status = 'return_pending' THEN 'back'
                     WHEN d.k LIKE 'stuck%' THEN 'stuck'
                     WHEN v_now - s.sent_at < interval '6 hours' THEN 'pickup'
                     WHEN v_now - s.sent_at < interval '18 hours' THEN 'store'
                     ELSE (ARRAY['driver', 'driver', 'driver', 'driver', 'road', 'road', 'store',
                                 'postponed', 'failed', 'returning'])[1 + o.sequence_number % 10]
                 END AS kind
      ) k
     WHERE o.tenant_id = _tenant_id
       AND o.status IN ('in_transit', 'delivered', 'completed', 'rejected', 'return_pending');

    -- When each parcel reached its step: its delivery, its refusal or return
    -- as the order's history has it, or its hours on the road.
    UPDATE demo_seed_prime p
       SET changed_at = GREATEST(p.sent_at, LEAST(
               CASE p.kind
                   WHEN 'delivered' THEN o.delivered_at
                   WHEN 'refused' THEN o.created_at + interval '2 days 4 hours'
                   WHEN 'back' THEN o.created_at + interval '2 days 6 hours'
                   ELSE p.sent_at + make_interval(hours => st.hours)
               END,
               v_now - interval '15 minutes'))
      FROM public.orders o, demo_seed_prime_steps st
     WHERE o.id = p.order_id AND st.kind = p.kind;

    -- The parcel the customer paid 5,000 less for, on the waiting payment.
    UPDATE demo_seed_prime
       SET kind = 'new_price', collect = collect - 5000
     WHERE order_id = (SELECT order_id FROM demo_seed_prime WHERE payment_id = 91101 ORDER BY case_id LIMIT 1);

    -- Sending a parcel logs it on the order (trg_log_prime_shipment_events).
    INSERT INTO public.prime_shipments (tenant_id, order_id, receipt_no, case_id, shipment_status, step_code, step_name,
                                        shipment_charge, sent_at, status_changed_at, checked_at, receipt_amount_iqd,
                                        payment_id, return_reason, postpone_reason, postponed_to)
    SELECT _tenant_id, p.order_id, p.receipt, p.case_id, st.status, st.step, st.step_name,
           5000, p.sent_at, p.changed_at, v_now - interval '12 minutes', p.collect, p.payment_id,
           CASE WHEN p.kind <> 'postponed' THEN p.reason END,
           CASE WHEN p.kind = 'postponed' THEN p.reason END,
           CASE WHEN p.kind = 'postponed' THEN to_char((v_now AT TIME ZONE 'Asia/Baghdad')::date + 1, 'YYYY-MM-DD') END
      FROM demo_seed_prime p
      JOIN demo_seed_prime_steps st ON st.kind = p.kind;

    -- Prime's moves, on each order's log, as the status sync writes them.
    INSERT INTO public.order_events (tenant_id, order_id, kind, actor_id, actor_name, data, created_at)
    SELECT _tenant_id, p.order_id, 'courier_status', NULL, 'Prime',
           jsonb_build_object('company', 'prime', 'step', st.step_name, 'status', st.status), p.changed_at
      FROM demo_seed_prime p
      JOIN demo_seed_prime_steps st ON st.kind = p.kind
     WHERE p.kind <> 'pickup';

    -- The paid days the store approved, as approving a Prime payment records
    -- them (prime_approve_payment): in the delivery history, its parcels
    -- matched, and remembered as checked.
    INSERT INTO public.delivery_imports (id, tenant_id, receipt_number, payment_date, receiving_agent, total_orders,
                                         total_amount, processed_count, skipped_count, status, imported_by,
                                         confirmed_by, confirmed_at, created_at, raw_data)
    SELECT md5('mithal:prime-payment:' || x.payment_id)::uuid, _tenant_id, x.payment_id::text, x.paid_at, 'Prime',
           x.parcels, x.net, x.parcels, 0, 'confirmed', _owner_id, _owner_id, x.approved_at, x.approved_at,
           jsonb_build_object('source', 'prime_api', 'payment_id', x.payment_id, 'rows', x.rows)
      FROM (
          SELECT p.payment_id,
                 count(*)::int AS parcels,
                 sum(p.collect - 5000)::int AS net,
                 LEAST(max(p.changed_at) + interval '20 hours', v_now - interval '1 hour') AS paid_at,
                 max(p.completed_at) AS approved_at,
                 jsonb_agg(jsonb_build_object('order_id', p.order_id, 'case_id', p.case_id::text, 'collect', p.collect,
                                              'fee', 5000, 'net', p.collect - 5000, 'kind', 'match',
                                              'status', 'delivered', 'diff', 0) ORDER BY p.case_id) AS rows
            FROM demo_seed_prime p
           WHERE p.payment_id < 91101
           GROUP BY p.payment_id
      ) x;
    INSERT INTO public.delivery_import_items (tenant_id, import_id, order_id, pdf_row_number, pdf_shipment_number,
                                              pdf_amount, pdf_delivery_fee, pdf_net_amount, match_category,
                                              match_details, action, previous_status, new_status, created_at)
    SELECT _tenant_id, md5('mithal:prime-payment:' || p.payment_id)::uuid, p.order_id,
           row_number() OVER (PARTITION BY p.payment_id ORDER BY p.case_id)::int, p.case_id::text,
           p.collect::int, 5000, (p.collect - 5000)::int, 'clean',
           jsonb_build_object('details', 'Prime payment ' || p.payment_id, 'diff', 0),
           'confirmed', 'delivered', 'completed', p.completed_at
      FROM demo_seed_prime p
     WHERE p.payment_id < 91101;
    INSERT INTO public.prime_payment_checks (tenant_id, payment_id, parcels, matched, different, unknown, diff, checked_at)
    SELECT _tenant_id, p.payment_id, count(*), count(*), 0, 0, 0, max(p.completed_at)
      FROM demo_seed_prime p
     WHERE p.payment_id < 91101
     GROUP BY p.payment_id;

    -- ── 7. Money out: what net profit subtracts ────────────────────────────
    -- No courier bills: Prime keeps its charge from each payment, and net
    -- profit counts it from the parcels.
    INSERT INTO public.expenses (tenant_id, expense_date, category, description, amount)
    SELECT _tenant_id, (v_now AT TIME ZONE 'Asia/Baghdad')::date - x.d, x.category, x.description, x.amount
      FROM (
          SELECT d, 'marketing' AS category, 'إعلانات ميتا' AS description, 35000 + (d * 7919) % 25000 AS amount
            FROM generate_series(1, 29, 2) AS d
          UNION ALL
          SELECT d, 'marketing', 'إعلانات تيك توك', 20000 + (d * 4241) % 20000 FROM generate_series(2, 29, 3) AS d
          UNION ALL
          SELECT d, 'packaging', 'أكياس وعلب تغليف', 85000 FROM (VALUES (6), (20)) AS v(d)
          UNION ALL
          SELECT 27, 'other', 'إيجار المحل', 400000
          UNION ALL
          SELECT 2, 'other', 'رواتب الفريق', 900000
      ) x;

    -- ── 8. The POS branch ──────────────────────────────────────────────────
    INSERT INTO public.shops (id, tenant_id, name, address, receipt_footer, is_active, daily_goal)
    VALUES (md5('mithal:shop:1')::uuid, _tenant_id, 'فرع المنصور', 'بغداد، المنصور، شارع 14 رمضان',
            'شكراً لزيارتكم', true, 750000);
    INSERT INTO public.shop_staff (shop_id, user_id, tenant_id) VALUES (md5('mithal:shop:1')::uuid, _owner_id, _tenant_id);
    INSERT INTO public.till_settings (tenant_id) VALUES (_tenant_id);
    -- The owner unlocks the till with 1234.
    INSERT INTO public.till_pins (tenant_id, user_id, pin_hash)
    VALUES (_tenant_id, _owner_id, extensions.crypt('1234', extensions.gen_salt('bf', 8)));

    -- The counts the staff console shows after a reset.
    SELECT jsonb_build_object(
               'products', (SELECT count(*) FROM public.products WHERE tenant_id = _tenant_id),
               'variants', (SELECT count(*) FROM public.product_variants WHERE tenant_id = _tenant_id),
               'orders', (SELECT count(*) FROM public.orders WHERE tenant_id = _tenant_id),
               'abandoned_carts', (SELECT count(*) FROM public.orders WHERE tenant_id = _tenant_id AND status = 'pending_checkout'),
               'expenses', (SELECT count(*) FROM public.expenses WHERE tenant_id = _tenant_id))
      INTO v_result;
    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_demo_store(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_store(uuid, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.seed_demo_store(uuid, uuid, jsonb) IS
    'Fermi B13: empties the demo store (tenants.is_demo) and fills it with the same invented shop, dates relative to now. Service role only.';
