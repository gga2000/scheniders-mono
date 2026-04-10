-- =============================================
-- Scheniders Platform — Test Data Seed
-- =============================================
-- Run against staging/development database:
--   psql $DATABASE_URL -f seed-test-data.sql
-- Creates: 10 tenants, 200 customers, 5000+ orders, wallets, transactions
-- =============================================

BEGIN;

-- =============================================
-- 0. Cleanup (safe — only removes seed data)
-- =============================================
DELETE FROM order_status_history WHERE order_id IN (SELECT id FROM orders WHERE order_id LIKE 'SEED-%');
DELETE FROM wallet_transactions WHERE description LIKE '%[seed]%';
DELETE FROM orders WHERE order_id LIKE 'SEED-%';
DELETE FROM usage_tracking WHERE tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'seed-%');
DELETE FROM subscriptions WHERE tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'seed-%');
DELETE FROM wallet WHERE tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'seed-%');
DELETE FROM tenants WHERE slug LIKE 'seed-%';
DROP TABLE IF EXISTS seed_customers CASCADE;
DROP TABLE IF EXISTS order_generation_config CASCADE;

-- =============================================
-- 1. Seed Customers (200 realistic Iraqi profiles)
-- =============================================
CREATE TABLE seed_customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  governorate_code TEXT NOT NULL,
  address_details TEXT NOT NULL
);

DO $$
DECLARE
  first_names TEXT[] := ARRAY[
    'محمد','أحمد','علي','حسن','حسين','عمر','مصطفى','كريم','ياسر','سامر',
    'فاضل','جاسم','عبدالله','صالح','ناصر','رعد','حيدر','مهدي','عباس','طارق',
    'نبيل','صباح','وليد','زيد','خالد','إبراهيم','سعد','هاشم','رائد','سالم',
    'فاطمة','زينب','مريم','نور','سارة','هدى','رقية','أمل','سمية','ياسمين'
  ];
  last_names TEXT[] := ARRAY[
    'الحسيني','العراقي','البغدادي','الموسوي','الكاظمي','المالكي','الجبوري',
    'الدليمي','الربيعي','الزبيدي','الشمري','العبيدي','الساعدي','العنبري',
    'الكربلائي','الدوري','الراوي','الحمداني','التميمي','البياتي'
  ];
  cities TEXT[] :=        ARRAY['بغداد','البصرة','أربيل','السليمانية','دهوك','نينوى','كركوك','ديالى','الأنبار','بابل','كربلاء','النجف','القادسية','المثنى','ذي قار','واسط','ميسان','صلاح الدين'];
  gov_codes TEXT[] :=     ARRAY['BGD',  'BAS',   'ARB',  'SMH',       'DOH', 'MOS',  'KRK',  'DYL', 'ANB',   'BBL', 'KRB',   'NJF',  'KOT',    'SAM',   'NAS',  'KOT', 'AMA',  'SAH'];
  -- Weighted distribution: Baghdad gets most, then Basra, Erbil, etc.
  city_weights INT[] :=   ARRAY[40,      15,      10,     5,           4,     5,      4,      3,     3,       3,     2,       2,      1,        1,       1,      1,      1,      1];
  neighborhoods TEXT[] := ARRAY['حي الكرادة','حي المنصور','حي الأعظمية','حي الشعب','حي الجادرية','حي زيونة','حي الحارثية','حي البياع','حي الدورة','حي السيدية'];
  streets TEXT[] := ARRAY['شارع الرشيد','شارع فلسطين','شارع 14 رمضان','شارع المتنبي','شارع الأميرات','شارع النضال','شارع الربيعي','شارع حيفا'];
  landmarks TEXT[] := ARRAY['قرب الجامع الكبير','مقابل المستشفى','بجانب السوق','خلف المدرسة','قرب الحديقة العامة','مقابل محطة الوقود','بجانب الصيدلية','قرب البريد'];
  prefixes TEXT[] := ARRAY['0750','0770','0780','0790','0751','0771','0782','0791','0752','0772'];

  i INT;
  fn TEXT;
  ln TEXT;
  city_idx INT;
  cum_weight INT;
  rand_val INT;
  total_weight INT := 0;
BEGIN
  -- Calculate total weight
  FOR i IN 1..array_length(city_weights, 1) LOOP
    total_weight := total_weight + city_weights[i];
  END LOOP;

  FOR i IN 1..200 LOOP
    fn := first_names[1 + floor(random() * array_length(first_names, 1))::int];
    ln := last_names[1 + floor(random() * array_length(last_names, 1))::int];

    -- Weighted city selection
    rand_val := floor(random() * total_weight)::int;
    cum_weight := 0;
    city_idx := 1;
    FOR j IN 1..array_length(city_weights, 1) LOOP
      cum_weight := cum_weight + city_weights[j];
      IF rand_val < cum_weight THEN
        city_idx := j;
        EXIT;
      END IF;
    END LOOP;

    INSERT INTO seed_customers (name, phone, city, governorate_code, address_details)
    VALUES (
      fn || ' ' || ln,
      prefixes[1 + floor(random() * array_length(prefixes, 1))::int] || lpad(floor(random() * 10000000)::text, 7, '0'),
      cities[city_idx],
      gov_codes[city_idx],
      neighborhoods[1 + floor(random() * array_length(neighborhoods, 1))::int] || ', ' ||
      streets[1 + floor(random() * array_length(streets, 1))::int] || ', ' ||
      landmarks[1 + floor(random() * array_length(landmarks, 1))::int]
    )
    ON CONFLICT (phone) DO NOTHING;
  END LOOP;
END $$;

-- =============================================
-- 2. Create 10 Tenants
-- =============================================
INSERT INTO tenants (id, business_name, slug, plan, status, city, contact_email, contact_phone, branding, settings, trial_ends_at, created_at) VALUES
  -- 3 Employee-Managed Stores
  ('a1000001-0000-0000-0000-000000000001', 'بغداد اكسبرس',      'seed-baghdad-express',      'professional', 'active',    'Baghdad',       'baghdad@test.iq',   '07501234567', '{"logo_url": null, "primary_color": "#E74C3C"}', '{"timezone": "Asia/Baghdad", "language": "ar", "currency": "IQD"}', NULL, NOW() - INTERVAL '180 days'),
  ('a1000001-0000-0000-0000-000000000002', 'البصرة فريش',        'seed-basra-fresh',          'growth',       'active',    'Basra',         'basra@test.iq',     '07701234567', '{"logo_url": null, "primary_color": "#3498DB"}', '{"timezone": "Asia/Baghdad", "language": "ar", "currency": "IQD"}', NULL, NOW() - INTERVAL '120 days'),
  ('a1000001-0000-0000-0000-000000000003', 'اربيل ايتس',         'seed-erbil-eats',           'starter',      'trial',     'Erbil',         'erbil@test.iq',     '07801234567', '{"logo_url": null, "primary_color": "#2ECC71"}', '{"timezone": "Asia/Baghdad", "language": "ar", "currency": "IQD"}', NOW() + INTERVAL '14 days', NOW() - INTERVAL '7 days'),

  -- 7 Autonomous Stores
  ('a1000001-0000-0000-0000-000000000004', 'الموصل ماركت',       'seed-mosul-market',         'enterprise',   'active',    'Mosul',         'mosul@test.iq',     '07501234568', '{"logo_url": null, "primary_color": "#9B59B6"}', '{"timezone": "Asia/Baghdad", "language": "ar", "currency": "IQD"}', NULL, NOW() - INTERVAL '365 days'),
  ('a1000001-0000-0000-0000-000000000005', 'كربلاء كتشن',        'seed-karbala-kitchen',      'growth',       'suspended', 'Karbala',       'karbala@test.iq',   '07701234568', '{"logo_url": null, "primary_color": "#E67E22"}', '{"timezone": "Asia/Baghdad", "language": "ar", "currency": "IQD"}', NULL, NOW() - INTERVAL '200 days'),
  ('a1000001-0000-0000-0000-000000000006', 'النجف نيبلز',        'seed-najaf-nibbles',        'starter',      'active',    'Najaf',         'najaf@test.iq',     '07801234568', '{"logo_url": null, "primary_color": "#1ABC9C"}', '{"timezone": "Asia/Baghdad", "language": "ar", "currency": "IQD"}', NULL, NOW() - INTERVAL '90 days'),
  ('a1000001-0000-0000-0000-000000000007', 'دهوك دليفري',        'seed-duhok-delivery',       'professional', 'active',    'Duhok',         'duhok@test.iq',     '07901234567', '{"logo_url": null, "primary_color": "#34495E"}', '{"timezone": "Asia/Baghdad", "language": "ar", "currency": "IQD"}', NULL, NOW() - INTERVAL '250 days'),
  ('a1000001-0000-0000-0000-000000000008', 'كركوك كافيه',        'seed-kirkuk-cafe',          'growth',       'trial',     'Kirkuk',        'kirkuk@test.iq',    '07501234569', '{"logo_url": null, "primary_color": "#F39C12"}', '{"timezone": "Asia/Baghdad", "language": "ar", "currency": "IQD"}', NOW() + INTERVAL '7 days', NOW() - INTERVAL '14 days'),
  ('a1000001-0000-0000-0000-000000000009', 'السليمانية سويتس',    'seed-sulaymaniyah-sweets',  'starter',      'cancelled', 'Sulaymaniyah',  'sulay@test.iq',     '07701234569', '{"logo_url": null, "primary_color": "#95A5A6"}', '{"timezone": "Asia/Baghdad", "language": "ar", "currency": "IQD"}', NULL, NOW() - INTERVAL '150 days'),
  ('a1000001-0000-0000-0000-000000000010', 'الانبار ابتايتس',     'seed-anbar-appetites',      'professional', 'active',    'Anbar',         'anbar@test.iq',     '07801234569', '{"logo_url": null, "primary_color": "#D35400"}', '{"timezone": "Asia/Baghdad", "language": "ar", "currency": "IQD"}', NULL, NOW() - INTERVAL '300 days');

-- =============================================
-- 3. Create Wallets
-- =============================================
INSERT INTO wallet (tenant_id, balance_iqd, total_charged_iqd, total_topped_up_iqd) VALUES
  ('a1000001-0000-0000-0000-000000000001', 250000,  800000,  1050000),  -- Baghdad Express (healthy)
  ('a1000001-0000-0000-0000-000000000002',  45000,  180000,   225000),  -- Basra Fresh (warning)
  ('a1000001-0000-0000-0000-000000000003',   8000,    5000,    13000),  -- Erbil Eats (critical, trial)
  ('a1000001-0000-0000-0000-000000000004', 500000, 2000000,  2500000),  -- Mosul Market (whale)
  ('a1000001-0000-0000-0000-000000000005',   2000,  150000,   152000),  -- Karbala Kitchen (critical, suspended)
  ('a1000001-0000-0000-0000-000000000006',  15000,   25000,    40000),  -- Najaf Nibbles (warning)
  ('a1000001-0000-0000-0000-000000000007', 120000,  500000,   620000),  -- Duhok Delivery (healthy)
  ('a1000001-0000-0000-0000-000000000008',      0,       0,        0),  -- Kirkuk Cafe (zero, new trial)
  ('a1000001-0000-0000-0000-000000000009',      0,    8000,     8000),  -- Sulaymaniyah Sweets (cancelled)
  ('a1000001-0000-0000-0000-000000000010',  80000,  350000,   430000);  -- Anbar Appetites (healthy)

-- =============================================
-- 4. Create Subscriptions
-- =============================================
INSERT INTO subscriptions (tenant_id, plan, status, current_period_start, current_period_end) VALUES
  ('a1000001-0000-0000-0000-000000000001', 'professional', 'active',   NOW() - INTERVAL '15 days', NOW() + INTERVAL '15 days'),
  ('a1000001-0000-0000-0000-000000000002', 'growth',       'active',   NOW() - INTERVAL '10 days', NOW() + INTERVAL '20 days'),
  ('a1000001-0000-0000-0000-000000000003', 'starter',      'trialing', NOW() - INTERVAL '7 days',  NOW() + INTERVAL '7 days'),
  ('a1000001-0000-0000-0000-000000000004', 'enterprise',   'active',   NOW() - INTERVAL '5 days',  NOW() + INTERVAL '25 days'),
  ('a1000001-0000-0000-0000-000000000005', 'growth',       'past_due', NOW() - INTERVAL '35 days', NOW() - INTERVAL '5 days'),
  ('a1000001-0000-0000-0000-000000000006', 'starter',      'active',   NOW() - INTERVAL '20 days', NOW() + INTERVAL '10 days'),
  ('a1000001-0000-0000-0000-000000000007', 'professional', 'active',   NOW() - INTERVAL '12 days', NOW() + INTERVAL '18 days'),
  ('a1000001-0000-0000-0000-000000000008', 'growth',       'trialing', NOW() - INTERVAL '14 days', NOW() + INTERVAL '16 days'),
  ('a1000001-0000-0000-0000-000000000009', 'starter',      'cancelled',NOW() - INTERVAL '60 days', NOW() - INTERVAL '30 days'),
  ('a1000001-0000-0000-0000-000000000010', 'professional', 'active',   NOW() - INTERVAL '8 days',  NOW() + INTERVAL '22 days');

-- =============================================
-- 5. Order Generation Config
-- =============================================
CREATE TABLE order_generation_config (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  is_autonomous BOOLEAN NOT NULL DEFAULT false,
  orders_weight INTEGER NOT NULL DEFAULT 10,  -- relative weight for order distribution
  enabled BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO order_generation_config (tenant_id, is_autonomous, orders_weight, enabled) VALUES
  -- Employee stores: orders stay in 'new' until manual action
  ('a1000001-0000-0000-0000-000000000001', false, 25, true),   -- Baghdad Express — high volume
  ('a1000001-0000-0000-0000-000000000002', false, 15, true),   -- Basra Fresh — medium
  ('a1000001-0000-0000-0000-000000000003', false,  8, true),   -- Erbil Eats — low (starter trial)

  -- Autonomous stores: orders auto-progress through full lifecycle
  ('a1000001-0000-0000-0000-000000000004', true,  30, true),   -- Mosul Market — highest (enterprise)
  ('a1000001-0000-0000-0000-000000000005', true,   0, false),  -- Karbala Kitchen — suspended, no new orders
  ('a1000001-0000-0000-0000-000000000006', true,   5, true),   -- Najaf Nibbles — low (starter)
  ('a1000001-0000-0000-0000-000000000007', true,  20, true),   -- Duhok Delivery — high (pro)
  ('a1000001-0000-0000-0000-000000000008', true,   3, true),   -- Kirkuk Cafe — very low (new trial)
  ('a1000001-0000-0000-0000-000000000009', true,   0, false),  -- Sulaymaniyah — cancelled, disabled
  ('a1000001-0000-0000-0000-000000000010', true,  18, true);   -- Anbar Appetites — medium-high

-- =============================================
-- 6. Generate Historical Orders (last 90 days)
-- =============================================
-- Creates ~5000 orders spread across all 10 tenants
-- with realistic status distribution, pricing, and timing

DO $$
DECLARE
  tenant_ids UUID[] := ARRAY[
    'a1000001-0000-0000-0000-000000000001',
    'a1000001-0000-0000-0000-000000000002',
    'a1000001-0000-0000-0000-000000000003',
    'a1000001-0000-0000-0000-000000000004',
    'a1000001-0000-0000-0000-000000000005',
    'a1000001-0000-0000-0000-000000000006',
    'a1000001-0000-0000-0000-000000000007',
    'a1000001-0000-0000-0000-000000000008',
    'a1000001-0000-0000-0000-000000000009',
    'a1000001-0000-0000-0000-000000000010'
  ];
  -- Orders per tenant (matching weight distribution)
  tenant_counts INT[] := ARRAY[800, 400, 50, 1500, 200, 100, 600, 30, 20, 500];

  -- Products with prices (IQD)
  product_names TEXT[] := ARRAY[
    'شاورما دجاج', 'كباب مشوي', 'برياني لحم', 'دولمة عراقية', 'فلافل ساندويش',
    'دجاج مشوي', 'سمون عراقي', 'شاي عراقي', 'كليجة', 'عصير طازج',
    'تكة دجاج', 'مسكوف سمك', 'تشريب لحم', 'كبة موصلية', 'باجة عراقية',
    'سمبوسة', 'عروك تمر', 'لبن عيران', 'فطور عراقي', 'بقلاوة'
  ];
  product_prices INT[] := ARRAY[
    6000, 12000, 10000, 8000, 4000,
    15000, 2000, 3000, 6000, 4000,
    9000, 25000, 8000, 7000, 5000,
    3000, 5000, 2000, 12000, 8000
  ];

  -- Status distribution (completed orders pipeline)
  statuses TEXT[] :=     ARRAY['delivered','completed','confirmed','in_transit','new','cancelled','rejected','no_response','return_pending'];
  status_weights INT[] := ARRAY[30,         25,         8,          5,           5,    10,         7,          5,            5];

  sources TEXT[] := ARRAY['whatsapp','shop','meta','other','tiktok','lightfunnels'];
  source_weights INT[] := ARRAY[35, 25, 15, 10, 10, 5];

  t_idx INT;
  order_count INT;
  cust RECORD;
  rand_status TEXT;
  rand_source TEXT;
  rand_items JSONB;
  rand_price NUMERIC;
  rand_delivery_fee NUMERIC;
  num_items INT;
  item_idx INT;
  created TIMESTAMPTZ;
  delivered TIMESTAMPTZ;
  seq_num INT;
  rand_val INT;
  cum_w INT;
  total_status_weight INT := 0;
  total_source_weight INT := 0;
  hour_of_day INT;
BEGIN
  -- Pre-calculate total weights
  FOR i IN 1..array_length(status_weights, 1) LOOP total_status_weight := total_status_weight + status_weights[i]; END LOOP;
  FOR i IN 1..array_length(source_weights, 1) LOOP total_source_weight := total_source_weight + source_weights[i]; END LOOP;

  FOR t_idx IN 1..10 LOOP
    order_count := tenant_counts[t_idx];
    seq_num := 0;

    FOR o IN 1..order_count LOOP
      seq_num := seq_num + 1;

      -- Pick random customer
      SELECT * INTO cust FROM seed_customers ORDER BY random() LIMIT 1;

      -- Weighted status selection
      rand_val := floor(random() * total_status_weight)::int;
      cum_w := 0;
      rand_status := 'delivered';
      FOR s IN 1..array_length(status_weights, 1) LOOP
        cum_w := cum_w + status_weights[s];
        IF rand_val < cum_w THEN rand_status := statuses[s]; EXIT; END IF;
      END LOOP;

      -- Weighted source selection
      rand_val := floor(random() * total_source_weight)::int;
      cum_w := 0;
      rand_source := 'other';
      FOR s IN 1..array_length(source_weights, 1) LOOP
        cum_w := cum_w + source_weights[s];
        IF rand_val < cum_w THEN rand_source := sources[s]; EXIT; END IF;
      END LOOP;

      -- Random items (1-3 items per order)
      num_items := 1 + floor(random() * 3)::int;
      rand_items := '[]'::jsonb;
      rand_price := 0;
      FOR item_n IN 1..num_items LOOP
        item_idx := 1 + floor(random() * array_length(product_names, 1))::int;
        rand_items := rand_items || jsonb_build_array(jsonb_build_object(
          'name', product_names[item_idx],
          'quantity', 1 + floor(random() * 3)::int,
          'price', product_prices[item_idx]
        ));
        rand_price := rand_price + product_prices[item_idx] * (1 + floor(random() * 3)::int);
      END LOOP;

      rand_delivery_fee := (ARRAY[3000, 5000, 7000, 10000])[1 + floor(random() * 4)::int];

      -- Created timestamp: spread across 90 days with realistic hours
      -- More orders during 10am-10pm Baghdad time (UTC+3)
      hour_of_day := CASE
        WHEN random() < 0.7 THEN 10 + floor(random() * 12)::int  -- 70% during 10am-10pm
        ELSE floor(random() * 24)::int
      END;
      created := NOW() - (floor(random() * 90)::int || ' days')::interval
               + (hour_of_day || ' hours')::interval
               + (floor(random() * 60)::int || ' minutes')::interval;
      -- Normalize to past
      IF created > NOW() THEN created := created - INTERVAL '90 days'; END IF;

      -- Delivered timestamp (for delivered/completed orders)
      delivered := CASE
        WHEN rand_status IN ('delivered', 'completed') THEN created + (1 + floor(random() * 48)::int || ' hours')::interval
        ELSE NULL
      END;

      INSERT INTO orders (
        order_id, tenant_id, customer_name, phone, city, governorate_code,
        address_details, items, price, delivery_fee, status, source,
        payment_status, priority, created_at, delivered_at, sequence_number,
        is_test
      ) VALUES (
        'SEED-' || lpad(((t_idx - 1) * 2000 + seq_num)::text, 6, '0'),
        tenant_ids[t_idx],
        cust.name,
        cust.phone,
        cust.city,
        cust.governorate_code,
        cust.address_details,
        rand_items,
        rand_price,
        rand_delivery_fee,
        rand_status,
        rand_source,
        (ARRAY['cod','prepaid','pending'])[1 + floor(random() * 3)::int],
        CASE WHEN random() < 0.85 THEN 'normal' WHEN random() < 0.95 THEN 'high' ELSE 'urgent' END,
        created,
        delivered,
        seq_num,
        true  -- mark as test orders
      );

    END LOOP;

    RAISE NOTICE 'Created % orders for tenant %', order_count, t_idx;
  END LOOP;
END $$;

-- =============================================
-- 7. Wallet Transactions (last 90 days)
-- =============================================
-- Top-ups and charges that match the wallet balances

DO $$
DECLARE
  tenant_rec RECORD;
  tx_date TIMESTAMPTZ;
  tx_amount NUMERIC;
BEGIN
  FOR tenant_rec IN
    SELECT t.id, t.slug, w.total_topped_up_iqd, w.total_charged_iqd
    FROM tenants t JOIN wallet w ON w.tenant_id = t.id
    WHERE t.slug LIKE 'seed-%'
  LOOP
    -- Generate 3-8 top-up transactions spread over 90 days
    FOR i IN 1..GREATEST(3, floor(tenant_rec.total_topped_up_iqd / 50000)::int) LOOP
      IF tenant_rec.total_topped_up_iqd <= 0 THEN EXIT; END IF;
      tx_date := NOW() - (floor(random() * 90)::int || ' days')::interval;
      tx_amount := GREATEST(10000, floor(tenant_rec.total_topped_up_iqd / GREATEST(3, floor(tenant_rec.total_topped_up_iqd / 50000)::int) * (0.5 + random()))::numeric);

      INSERT INTO wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, payment_method, created_at)
      VALUES (
        tenant_rec.id, 'topup', tx_amount, 0,  -- balance_after calculated separately
        'Wallet top-up [seed]',
        (ARRAY['zain_cash','qi_card','bank_transfer','manual'])[1 + floor(random() * 4)::int],
        tx_date
      );
    END LOOP;

    -- Generate charge transactions (one per ~50 delivered orders)
    FOR i IN 1..GREATEST(1, floor(tenant_rec.total_charged_iqd / 20000)::int) LOOP
      IF tenant_rec.total_charged_iqd <= 0 THEN EXIT; END IF;
      tx_date := NOW() - (floor(random() * 90)::int || ' days')::interval;
      tx_amount := GREATEST(500, floor(tenant_rec.total_charged_iqd / GREATEST(1, floor(tenant_rec.total_charged_iqd / 20000)::int) * (0.5 + random()))::numeric);

      INSERT INTO wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, created_at)
      VALUES (
        tenant_rec.id, 'charge', tx_amount, 0,
        'Order delivery charge [seed]',
        tx_date
      );
    END LOOP;
  END LOOP;
END $$;

-- =============================================
-- 8. Usage Tracking
-- =============================================
INSERT INTO usage_tracking (tenant_id, year, month, orders_count, orders_charged, team_members_count)
SELECT
  t.id,
  EXTRACT(YEAR FROM NOW())::int,
  EXTRACT(MONTH FROM NOW())::int,
  COALESCE(o.cnt, 0),
  COALESCE(o.charged, 0),
  CASE t.plan
    WHEN 'enterprise' THEN 8
    WHEN 'professional' THEN 5
    WHEN 'growth' THEN 3
    ELSE 1
  END
FROM tenants t
LEFT JOIN (
  SELECT tenant_id,
    COUNT(*) AS cnt,
    COUNT(*) FILTER (WHERE status IN ('delivered','completed')) AS charged
  FROM orders
  WHERE order_id LIKE 'SEED-%'
    AND created_at >= date_trunc('month', NOW())
  GROUP BY tenant_id
) o ON o.tenant_id = t.id
WHERE t.slug LIKE 'seed-%'
ON CONFLICT (tenant_id, year, month) DO UPDATE SET
  orders_count = EXCLUDED.orders_count,
  orders_charged = EXCLUDED.orders_charged,
  team_members_count = EXCLUDED.team_members_count;

-- =============================================
-- 9. Order Status History (for delivered/completed orders)
-- =============================================
INSERT INTO order_status_history (order_id, tenant_id, from_status, to_status, changed_by, changed_at)
SELECT
  o.id,
  o.tenant_id,
  'new',
  'confirmed',
  'System [seed]',
  o.created_at + INTERVAL '15 minutes' * (1 + random())
FROM orders o
WHERE o.order_id LIKE 'SEED-%'
  AND o.status IN ('confirmed','in_transit','delivered','completed');

INSERT INTO order_status_history (order_id, tenant_id, from_status, to_status, changed_by, changed_at)
SELECT
  o.id,
  o.tenant_id,
  'confirmed',
  'in_transit',
  'System [seed]',
  o.created_at + INTERVAL '2 hours' * (1 + random())
FROM orders o
WHERE o.order_id LIKE 'SEED-%'
  AND o.status IN ('in_transit','delivered','completed');

INSERT INTO order_status_history (order_id, tenant_id, from_status, to_status, changed_by, changed_at)
SELECT
  o.id,
  o.tenant_id,
  'in_transit',
  'delivered',
  'System [seed]',
  o.delivered_at
FROM orders o
WHERE o.order_id LIKE 'SEED-%'
  AND o.status IN ('delivered','completed')
  AND o.delivered_at IS NOT NULL;

COMMIT;

-- =============================================
-- Summary
-- =============================================
SELECT 'Tenants' AS entity, COUNT(*) AS count FROM tenants WHERE slug LIKE 'seed-%'
UNION ALL
SELECT 'Customers', COUNT(*) FROM seed_customers
UNION ALL
SELECT 'Orders', COUNT(*) FROM orders WHERE order_id LIKE 'SEED-%'
UNION ALL
SELECT 'Wallet Transactions', COUNT(*) FROM wallet_transactions WHERE description LIKE '%[seed]%'
UNION ALL
SELECT 'Status History', COUNT(*) FROM order_status_history WHERE changed_by = 'System [seed]';
