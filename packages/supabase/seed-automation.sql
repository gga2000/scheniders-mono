-- =============================================
-- Scheniders Platform — Automated Order Generation
-- =============================================
-- Requires pg_cron extension (Supabase Dashboard → Database → Extensions)
-- Run AFTER seed-test-data.sql:
--   psql $DATABASE_URL -f seed-automation.sql
--
-- Creates two scheduled functions:
--   1. generate_seed_orders()  — every 15 min, creates 0-4 new orders
--   2. progress_seed_orders()  — every 10 min, moves orders through pipeline
--
-- Employee stores (is_autonomous=false): orders arrive as 'new', stay there
-- Autonomous stores (is_autonomous=true): orders auto-progress + chaos events
-- =============================================

-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =============================================
-- 1. Order Generation Function
-- =============================================
-- Runs every 15 minutes. Creates 0-4 orders based on time of day.
-- Iraqi business hours (UTC+3): peak 10am-10pm, quiet 2am-8am.

CREATE OR REPLACE FUNCTION generate_seed_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  baghdad_hour INT;
  max_orders INT;
  num_orders INT;
  i INT;
  chosen_tenant_id UUID;
  cust RECORD;
  total_weight INT;
  rand_val INT;
  cum_w INT;
  config RECORD;
  rand_items JSONB;
  rand_price NUMERIC;
  rand_delivery_fee NUMERIC;
  num_items INT;
  item_idx INT;
  rand_source TEXT;
  source_rand FLOAT;
  seq_num INT;
  order_prefix TEXT;
  order_count INT;
  generated_order_id TEXT;

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
  priority_rand FLOAT;
BEGIN
  -- Get current Baghdad hour (UTC+3)
  baghdad_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Baghdad')::INT;

  -- Determine max orders this run based on time of day
  max_orders := CASE
    WHEN baghdad_hour BETWEEN 2 AND 7 THEN 0          -- Dead hours: no orders
    WHEN baghdad_hour BETWEEN 8 AND 9 THEN 1          -- Early morning: trickle
    WHEN baghdad_hour BETWEEN 10 AND 13 THEN 3        -- Lunch rush
    WHEN baghdad_hour BETWEEN 14 AND 16 THEN 2        -- Afternoon lull
    WHEN baghdad_hour BETWEEN 17 AND 21 THEN 4        -- Dinner rush (peak)
    WHEN baghdad_hour BETWEEN 22 AND 23 THEN 2        -- Late night
    ELSE 1                                             -- Midnight-2am
  END;

  -- Randomize: 0 to max_orders (sometimes no orders even during peak)
  num_orders := floor(random() * (max_orders + 1))::INT;

  IF num_orders = 0 THEN
    RETURN;  -- Nothing to generate this cycle
  END IF;

  -- Calculate total weight from enabled tenants
  SELECT COALESCE(SUM(orders_weight), 0) INTO total_weight
  FROM order_generation_config
  WHERE enabled = true AND orders_weight > 0;

  IF total_weight = 0 THEN
    RETURN;  -- No enabled tenants
  END IF;

  FOR i IN 1..num_orders LOOP
    -- Weighted tenant selection
    rand_val := floor(random() * total_weight)::INT;
    cum_w := 0;
    chosen_tenant_id := NULL;

    FOR config IN
      SELECT tenant_id, orders_weight
      FROM order_generation_config
      WHERE enabled = true AND orders_weight > 0
      ORDER BY tenant_id
    LOOP
      cum_w := cum_w + config.orders_weight;
      IF rand_val < cum_w THEN
        chosen_tenant_id := config.tenant_id;
        EXIT;
      END IF;
    END LOOP;

    IF chosen_tenant_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Pick random customer
    SELECT * INTO cust FROM seed_customers ORDER BY random() LIMIT 1;

    -- Random source (weighted: whatsapp 35%, shop 25%, meta 15%, other 10%, tiktok 10%, lightfunnels 5%)
    source_rand := random();
    rand_source := CASE
      WHEN source_rand < 0.35 THEN 'whatsapp'
      WHEN source_rand < 0.60 THEN 'shop'
      WHEN source_rand < 0.75 THEN 'meta'
      WHEN source_rand < 0.85 THEN 'other'
      WHEN source_rand < 0.95 THEN 'tiktok'
      ELSE 'lightfunnels'
    END;

    -- Build random items (1-3 per order)
    num_items := 1 + floor(random() * 3)::INT;
    rand_items := '[]'::JSONB;
    rand_price := 0;

    FOR item_n IN 1..num_items LOOP
      item_idx := 1 + floor(random() * array_length(product_names, 1))::INT;
      DECLARE
        item_qty INT := 1 + floor(random() * 3)::INT;
      BEGIN
        rand_items := rand_items || jsonb_build_array(jsonb_build_object(
          'name', product_names[item_idx],
          'quantity', item_qty,
          'price', product_prices[item_idx]
        ));
        rand_price := rand_price + product_prices[item_idx] * item_qty;
      END;
    END LOOP;

    rand_delivery_fee := (ARRAY[3000, 5000, 7000, 10000])[1 + floor(random() * 4)::INT];
    priority_rand := random();

    -- Generate order_id: SEED-AUTO-YYMMDD-XXXX (with sequence + random suffix for uniqueness)
    order_prefix := 'SEED-AUTO-' || to_char(NOW(), 'YYMMDD');
    SELECT COUNT(*) + 1 INTO order_count
    FROM orders
    WHERE order_id LIKE order_prefix || '%';
    generated_order_id := order_prefix || '-' || lpad(order_count::TEXT, 4, '0')
      || substr(md5(random()::TEXT), 1, 2);  -- 2-char hex suffix prevents collisions

    -- Get next sequence number for this tenant
    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO seq_num
    FROM orders
    WHERE tenant_id = chosen_tenant_id;

    -- Insert order as 'new' (all orders start as new)
    INSERT INTO orders (
      order_id, tenant_id, customer_name, phone, city, governorate_code,
      address_details, items, price, delivery_fee, status, source,
      payment_status, priority, sequence_number, is_test,
      last_status_changed_by_name
    ) VALUES (
      generated_order_id,
      chosen_tenant_id,
      cust.name,
      cust.phone,
      cust.city,
      cust.governorate_code,
      cust.address_details,
      rand_items,
      rand_price,
      rand_delivery_fee,
      'new',
      rand_source,
      (ARRAY['cod','prepaid','pending'])[1 + floor(random() * 3)::INT],
      CASE WHEN priority_rand < 0.80 THEN 'normal' WHEN priority_rand < 0.95 THEN 'high' ELSE 'urgent' END,
      seq_num,
      true,
      'Auto Generator'
    );

    -- Log the creation in order_status_history
    INSERT INTO order_status_history (order_id, tenant_id, from_status, to_status, changed_by, changed_at)
    SELECT id, tenant_id, NULL, 'new', 'Auto Generator', created_at
    FROM orders WHERE order_id = generated_order_id;

  END LOOP;
END;
$$;


-- =============================================
-- 2. Order Progression Function
-- =============================================
-- Runs every 10 minutes. ONLY progresses orders for autonomous stores.
-- Employee stores keep orders in 'new' for manual handling.
--
-- Pipeline timing (from order creation):
--   new → contacted:      5-15 min
--   contacted → confirmed: 10-30 min
--   confirmed → in_transit: 30-90 min
--   in_transit → delivered: 45-120 min
--
-- Chaos events per cycle:
--   ~5% of 'confirmed' orders → cancelled
--   ~3% of 'delivered' orders → return_pending
--   ~8% of 'new' orders older than 2h → no_response
--   Random wallet top-ups for autonomous stores

CREATE OR REPLACE FUNCTION progress_seed_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_rec RECORD;
  charge_amount NUMERIC;
  charge_result JSONB;
BEGIN
  -- ─────────────────────────────────────────────
  -- A. Progress: new → contacted (after 5-15 min)
  -- ─────────────────────────────────────────────
  FOR order_rec IN
    SELECT o.id, o.order_id, o.tenant_id, o.created_at, o.price
    FROM orders o
    JOIN order_generation_config c ON c.tenant_id = o.tenant_id
    WHERE c.is_autonomous = true
      AND o.status = 'new'
      AND o.order_id LIKE 'SEED-%'
      AND o.created_at < NOW() - INTERVAL '5 minutes'
      AND random() < 0.6  -- Not all at once; ~60% chance per cycle
  LOOP
    UPDATE orders SET status = 'contacted', updated_at = NOW(),
      last_status_changed_by_name = 'Auto Progression'
    WHERE id = order_rec.id;

    INSERT INTO order_status_history (order_id, tenant_id, from_status, to_status, changed_by, changed_at)
    VALUES (order_rec.id, order_rec.tenant_id, 'new', 'contacted', 'Auto Progression', NOW());
  END LOOP;

  -- ─────────────────────────────────────────────
  -- B. Progress: contacted → confirmed (after 10-30 min from creation)
  -- ─────────────────────────────────────────────
  FOR order_rec IN
    SELECT o.id, o.order_id, o.tenant_id, o.created_at, o.price
    FROM orders o
    JOIN order_generation_config c ON c.tenant_id = o.tenant_id
    WHERE c.is_autonomous = true
      AND o.status = 'contacted'
      AND o.order_id LIKE 'SEED-%'
      AND o.created_at < NOW() - INTERVAL '15 minutes'
      AND random() < 0.5
  LOOP
    UPDATE orders SET status = 'confirmed', updated_at = NOW(),
      last_status_changed_by_name = 'Auto Progression'
    WHERE id = order_rec.id;

    INSERT INTO order_status_history (order_id, tenant_id, from_status, to_status, changed_by, changed_at)
    VALUES (order_rec.id, order_rec.tenant_id, 'contacted', 'confirmed', 'Auto Progression', NOW());
  END LOOP;

  -- ─────────────────────────────────────────────
  -- C. Progress: confirmed → in_transit (after 30-90 min from creation)
  -- ─────────────────────────────────────────────
  FOR order_rec IN
    SELECT o.id, o.order_id, o.tenant_id, o.created_at, o.price
    FROM orders o
    JOIN order_generation_config c ON c.tenant_id = o.tenant_id
    WHERE c.is_autonomous = true
      AND o.status = 'confirmed'
      AND o.order_id LIKE 'SEED-%'
      AND o.created_at < NOW() - INTERVAL '45 minutes'
      AND random() < 0.4
  LOOP
    UPDATE orders SET status = 'in_transit', updated_at = NOW(),
      last_status_changed_by_name = 'Auto Progression'
    WHERE id = order_rec.id;

    INSERT INTO order_status_history (order_id, tenant_id, from_status, to_status, changed_by, changed_at)
    VALUES (order_rec.id, order_rec.tenant_id, 'confirmed', 'in_transit', 'Auto Progression', NOW());
  END LOOP;

  -- ─────────────────────────────────────────────
  -- D. Progress: in_transit → delivered (after 45-120 min from creation)
  -- ─────────────────────────────────────────────
  FOR order_rec IN
    SELECT o.id, o.order_id, o.tenant_id, o.created_at, o.price, o.delivery_fee
    FROM orders o
    JOIN order_generation_config c ON c.tenant_id = o.tenant_id
    WHERE c.is_autonomous = true
      AND o.status = 'in_transit'
      AND o.order_id LIKE 'SEED-%'
      AND o.created_at < NOW() - INTERVAL '90 minutes'
      AND random() < 0.5
  LOOP
    UPDATE orders SET
      status = 'delivered',
      delivered_at = NOW(),
      updated_at = NOW(),
      last_status_changed_by_name = 'Auto Progression'
    WHERE id = order_rec.id;

    INSERT INTO order_status_history (order_id, tenant_id, from_status, to_status, changed_by, changed_at)
    VALUES (order_rec.id, order_rec.tenant_id, 'in_transit', 'delivered', 'Auto Progression', NOW());

    -- Charge wallet on delivery (platform fee: 500-2000 IQD)
    charge_amount := (ARRAY[500, 750, 1000, 1500, 2000])[1 + floor(random() * 5)::INT];

    SELECT charge_wallet_atomic(
      order_rec.tenant_id,
      charge_amount,
      'Delivery charge - ' || order_rec.order_id,
      order_rec.order_id
    ) INTO charge_result;
    -- charge_result: {success, new_balance, error?} — failures are non-fatal for seed data
  END LOOP;

  -- ─────────────────────────────────────────────
  -- E. Chaos: ~5% of confirmed → cancelled
  -- ─────────────────────────────────────────────
  FOR order_rec IN
    SELECT o.id, o.order_id, o.tenant_id
    FROM orders o
    JOIN order_generation_config c ON c.tenant_id = o.tenant_id
    WHERE c.is_autonomous = true
      AND o.status = 'confirmed'
      AND o.order_id LIKE 'SEED-%'
      AND o.created_at < NOW() - INTERVAL '20 minutes'
      AND random() < 0.05
  LOOP
    UPDATE orders SET
      status = 'cancelled',
      cancelled_at = NOW(),
      updated_at = NOW(),
      notes = COALESCE(notes || E'\n', '') || 'Auto-cancelled: customer changed mind',
      last_status_changed_by_name = 'Auto Chaos'
    WHERE id = order_rec.id;

    INSERT INTO order_status_history (order_id, tenant_id, from_status, to_status, changed_by, changed_at)
    VALUES (order_rec.id, order_rec.tenant_id, 'confirmed', 'cancelled', 'Auto Chaos', NOW());
  END LOOP;

  -- ─────────────────────────────────────────────
  -- F. Chaos: ~3% of delivered → return_pending
  -- ─────────────────────────────────────────────
  FOR order_rec IN
    SELECT o.id, o.order_id, o.tenant_id
    FROM orders o
    JOIN order_generation_config c ON c.tenant_id = o.tenant_id
    WHERE c.is_autonomous = true
      AND o.status = 'delivered'
      AND o.order_id LIKE 'SEED-%'
      AND o.delivered_at IS NOT NULL
      AND o.delivered_at < NOW() - INTERVAL '30 minutes'
      AND o.delivered_at > NOW() - INTERVAL '24 hours'  -- Only recent deliveries
      AND random() < 0.03
  LOOP
    UPDATE orders SET
      status = 'return_pending',
      is_return = true,
      updated_at = NOW(),
      notes = COALESCE(notes || E'\n', '') || 'Auto-return: customer unsatisfied',
      last_status_changed_by_name = 'Auto Chaos'
    WHERE id = order_rec.id;

    INSERT INTO order_status_history (order_id, tenant_id, from_status, to_status, changed_by, changed_at)
    VALUES (order_rec.id, order_rec.tenant_id, 'delivered', 'return_pending', 'Auto Chaos', NOW());
  END LOOP;

  -- ─────────────────────────────────────────────
  -- G. Chaos: ~8% of stale 'new' orders → no_response
  -- ─────────────────────────────────────────────
  FOR order_rec IN
    SELECT o.id, o.order_id, o.tenant_id
    FROM orders o
    JOIN order_generation_config c ON c.tenant_id = o.tenant_id
    WHERE c.is_autonomous = true
      AND o.status = 'new'
      AND o.order_id LIKE 'SEED-%'
      AND o.created_at < NOW() - INTERVAL '2 hours'
      AND random() < 0.08
  LOOP
    UPDATE orders SET
      status = 'no_response',
      updated_at = NOW(),
      notes = COALESCE(notes || E'\n', '') || 'Auto: customer unreachable after 3 attempts',
      last_status_changed_by_name = 'Auto Chaos'
    WHERE id = order_rec.id;

    INSERT INTO order_status_history (order_id, tenant_id, from_status, to_status, changed_by, changed_at)
    VALUES (order_rec.id, order_rec.tenant_id, 'new', 'no_response', 'Auto Chaos', NOW());
  END LOOP;

  -- ─────────────────────────────────────────────
  -- H. Wallet top-ups for autonomous stores (random, ~10% chance per store per cycle)
  -- ─────────────────────────────────────────────
  FOR order_rec IN
    SELECT c.tenant_id
    FROM order_generation_config c
    WHERE c.is_autonomous = true AND c.enabled = true
      AND random() < 0.10
  LOOP
    DECLARE
      topup_amount NUMERIC := (ARRAY[25000, 50000, 100000, 150000, 250000])[1 + floor(random() * 5)::INT];
      new_balance NUMERIC;
    BEGIN
      UPDATE wallet
      SET balance_iqd = balance_iqd + topup_amount,
          total_topped_up_iqd = total_topped_up_iqd + topup_amount,
          updated_at = NOW()
      WHERE tenant_id = order_rec.tenant_id
      RETURNING balance_iqd INTO new_balance;

      INSERT INTO wallet_transactions (tenant_id, type, amount_iqd, balance_after_iqd, description, payment_method, created_at)
      VALUES (
        order_rec.tenant_id,
        'topup',
        topup_amount,
        COALESCE(new_balance, topup_amount),
        'Auto wallet top-up [seed]',
        (ARRAY['zain_cash','qi_card','bank_transfer'])[1 + floor(random() * 3)::INT],
        NOW()
      );
    END;
  END LOOP;

  -- ─────────────────────────────────────────────
  -- I. Occasional: delivered → completed (batch close old deliveries)
  -- ─────────────────────────────────────────────
  WITH completed_orders AS (
    UPDATE orders SET
      status = 'completed',
      updated_at = NOW(),
      last_status_changed_by_name = 'Auto Progression'
    WHERE status = 'delivered'
      AND order_id LIKE 'SEED-%'
      AND delivered_at < NOW() - INTERVAL '24 hours'
      AND tenant_id IN (SELECT tenant_id FROM order_generation_config WHERE is_autonomous = true)
    RETURNING id, tenant_id
  )
  INSERT INTO order_status_history (order_id, tenant_id, from_status, to_status, changed_by, changed_at)
  SELECT id, tenant_id, 'delivered', 'completed', 'Auto Progression', NOW()
  FROM completed_orders;

END;
$$;


-- =============================================
-- 3. Schedule with pg_cron
-- =============================================

-- Remove existing schedules if re-running
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('seed_generate_orders', 'seed_progress_orders');

-- Generate new orders every 15 minutes
SELECT cron.schedule(
  'seed_generate_orders',
  '*/15 * * * *',
  $$SELECT generate_seed_orders()$$
);

-- Progress orders & chaos events every 10 minutes
SELECT cron.schedule(
  'seed_progress_orders',
  '*/10 * * * *',
  $$SELECT progress_seed_orders()$$
);


-- =============================================
-- 4. Admin Toggle Functions (called from admin UI)
-- =============================================

CREATE OR REPLACE FUNCTION get_seed_automation_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  jobs JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'jobname', jobname,
    'schedule', schedule,
    'active', active
  )), '[]'::jsonb)
  INTO jobs
  FROM cron.job
  WHERE jobname LIKE 'seed_%';

  result := jsonb_build_object(
    'active', EXISTS (SELECT 1 FROM cron.job WHERE jobname LIKE 'seed_%' AND active = true),
    'jobs', jobs
  );

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION toggle_seed_automation(_active BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE cron.job SET active = _active WHERE jobname LIKE 'seed_%';
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'active', _active,
    'jobs_updated', updated_count
  );
END;
$$;

-- =============================================
-- 5. Verification & Management Helpers
-- =============================================

-- View scheduled jobs
-- SELECT * FROM cron.job WHERE jobname LIKE 'seed_%';

-- View recent job runs
-- SELECT * FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE 'seed_%') ORDER BY start_time DESC LIMIT 20;

-- Pause all seed automation
-- UPDATE cron.job SET active = false WHERE jobname LIKE 'seed_%';

-- Resume all seed automation
-- UPDATE cron.job SET active = true WHERE jobname LIKE 'seed_%';

-- Stop and remove all seed automation
-- SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname LIKE 'seed_%';

-- Remove all seed data + automation (full cleanup)
-- SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname LIKE 'seed_%';
-- DELETE FROM order_status_history WHERE changed_by LIKE 'Auto%' OR changed_by = 'System [seed]';
-- DELETE FROM wallet_transactions WHERE description LIKE '%[seed]%';
-- DELETE FROM orders WHERE order_id LIKE 'SEED-%';
-- DELETE FROM order_generation_config;
-- DELETE FROM usage_tracking WHERE tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'seed-%');
-- DELETE FROM subscriptions WHERE tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'seed-%');
-- DELETE FROM wallet WHERE tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'seed-%');
-- DELETE FROM tenants WHERE slug LIKE 'seed-%';
-- DROP TABLE IF EXISTS seed_customers CASCADE;
-- DROP TABLE IF EXISTS order_generation_config CASCADE;

-- =============================================
-- Summary
-- =============================================
SELECT
  'seed_generate_orders' AS job,
  '*/15 * * * *' AS schedule,
  'Creates 0-4 orders per run based on Baghdad time' AS description
UNION ALL
SELECT
  'seed_progress_orders',
  '*/10 * * * *',
  'Progresses autonomous orders + chaos events + wallet top-ups';
