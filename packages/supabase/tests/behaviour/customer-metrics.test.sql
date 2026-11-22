-- B9 step 3: customer numbers recount only the customers whose orders
-- changed, and still equal a full recount from customer_metrics_source
-- after every kind of order change.
--
-- Each step changes orders, checks the change moved some customer's numbers
-- (otherwise the step proves nothing), runs refresh_customer_aggregates and
-- checks the table equals the source again with the queue empty. A step a
-- missing trigger column or key rule would break fails on the last check.

CREATE FUNCTION pg_temp.diff() RETURNS bigint LANGUAGE sql AS $$
    SELECT (SELECT count(*) FROM (SELECT * FROM public.mv_customer_metrics
                                  EXCEPT SELECT * FROM public.customer_metrics_source) a)
         + (SELECT count(*) FROM (SELECT * FROM public.customer_metrics_source
                                  EXCEPT SELECT * FROM public.mv_customer_metrics) b);
$$;

CREATE FUNCTION pg_temp.step(p_label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_left bigint;
BEGIN
    IF pg_temp.diff() = 0 THEN
        RAISE EXCEPTION '%: the change moved no customer number, so the step tests nothing', p_label;
    END IF;
    PERFORM public.refresh_customer_aggregates();
    v_left := pg_temp.diff();
    IF v_left <> 0 THEN
        RAISE EXCEPTION '%: % rows differ from a full recount after the run', p_label, v_left;
    END IF;
    IF EXISTS (SELECT 1 FROM public.customer_metrics_dirty) THEN
        RAISE EXCEPTION '%: the run left the queue full', p_label;
    END IF;
END $$;

CREATE FUNCTION pg_temp.row_of(p_tenant uuid, p_phone text) RETURNS public.mv_customer_metrics
LANGUAGE sql AS $$
    SELECT * FROM public.mv_customer_metrics WHERE tenant_id = p_tenant AND customer_phone = p_phone;
$$;

-- Shops.
\set t1 '''00000000-0000-0000-0000-0000000000a1'''
\set t2 '''00000000-0000-0000-0000-0000000000a2'''

-- 0. The migration's first fill counts everyone and records the run.
DO $$
BEGIN
    IF (SELECT relkind FROM pg_class WHERE oid = 'public.mv_customer_metrics'::regclass) <> 'r' THEN
        RAISE EXCEPTION 'first fill: mv_customer_metrics is not a table';
    END IF;
    IF (SELECT count(*) FROM public.mv_customer_metrics) < 200 THEN
        RAISE EXCEPTION 'first fill: only % customers', (SELECT count(*) FROM public.mv_customer_metrics);
    END IF;
    IF pg_temp.diff() <> 0 THEN
        RAISE EXCEPTION 'first fill: % rows differ from the source', pg_temp.diff();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cron_refresh_state
                   WHERE job = 'customer_aggregates' AND refreshed_at > now() - interval '1 hour') THEN
        RAISE EXCEPTION 'first fill: job state not written';
    END IF;
END $$;

-- 1. A new customer, then the same customer written another way.
INSERT INTO public.orders (id, tenant_id, order_id, customer_name, phone, city, governorate_code, price, items, status, created_at)
VALUES ('a0000000-0000-0000-0000-000000000001', :t1, 'A-5001', 'A old', '07709000010', 'Najaf', 'NJF', 30000,
        '[{"quantity": 2}]', 'delivered', now() - interval '10 days 1 minute');
SELECT pg_temp.step('new customer');

INSERT INTO public.orders (id, tenant_id, order_id, customer_name, phone, city, governorate_code, secondary_phone,
                           address_details, price, items, status, created_at)
VALUES ('a0000000-0000-0000-0000-000000000002', :t1, 'A-5002', 'A new', '+964 770 900 0010', 'Basra', 'BAS',
        '07801111111', 'street 1', 20000, '[{"quantity": 1}]', 'confirmed', now() - interval '2 days 3 minutes');
SELECT pg_temp.step('same customer, other phone format');

-- 2. A change to nothing the numbers read queues nothing.
UPDATE public.orders SET notes = 'call after 5', print_count = 3, internal_notes = 'x'
WHERE id = 'a0000000-0000-0000-0000-000000000001';
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.customer_metrics_dirty) THEN
        RAISE EXCEPTION 'unread columns: a notes change was queued';
    END IF;
END $$;

-- 3. Every column the numbers read, one change at a time.
UPDATE public.orders SET status = 'cancelled' WHERE id = 'a0000000-0000-0000-0000-000000000002';
SELECT pg_temp.step('status');
UPDATE public.orders SET price = 35000 WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT pg_temp.step('price');
UPDATE public.orders SET items = '[{"quantity": 3}]' WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT pg_temp.step('items');
UPDATE public.orders SET customer_name = 'A newer' WHERE id = 'a0000000-0000-0000-0000-000000000002';
SELECT pg_temp.step('customer_name');
UPDATE public.orders SET city = 'Erbil' WHERE id = 'a0000000-0000-0000-0000-000000000002';
SELECT pg_temp.step('city');
UPDATE public.orders SET governorate_code = 'ERB' WHERE id = 'a0000000-0000-0000-0000-000000000002';
SELECT pg_temp.step('governorate_code');
UPDATE public.orders SET secondary_phone = '07802222222' WHERE id = 'a0000000-0000-0000-0000-000000000002';
SELECT pg_temp.step('secondary_phone');
UPDATE public.orders SET address_details = 'street 2' WHERE id = 'a0000000-0000-0000-0000-000000000002';
SELECT pg_temp.step('address_details');
UPDATE public.orders SET refund_status = 'pending' WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT pg_temp.step('refund_status');
UPDATE public.orders SET refunded_at = now() WHERE id = 'a0000000-0000-0000-0000-000000000002';
SELECT pg_temp.step('refunded_at');
UPDATE public.orders SET created_at = now() - interval '1 day 5 minutes' WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT pg_temp.step('created_at');
UPDATE public.orders SET order_id = 'A-5001-2' WHERE id = 'a0000000-0000-0000-0000-000000000002';
SELECT pg_temp.step('order_id');
UPDATE public.orders SET is_return = true WHERE id = 'a0000000-0000-0000-0000-000000000002';
SELECT pg_temp.step('is_return');
UPDATE public.orders SET is_archived = true WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT pg_temp.step('is_archived');
UPDATE public.orders SET is_archived = false, is_return = false WHERE id IN ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
SELECT pg_temp.step('back');
UPDATE public.orders SET is_test = true WHERE id = 'a0000000-0000-0000-0000-000000000002';
SELECT pg_temp.step('is_test');
UPDATE public.orders SET deleted_at = now() WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT pg_temp.step('deleted_at: the customer had no other order and goes');
UPDATE public.orders SET deleted_at = NULL, is_test = false WHERE id IN ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
SELECT pg_temp.step('restored');

-- The phone and the shop move an order between customers: both recount.
UPDATE public.orders SET phone = '07709000011' WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT pg_temp.step('phone');
UPDATE public.orders SET tenant_id = :t2 WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT pg_temp.step('tenant_id');
UPDATE public.orders SET phone = '07709000010', tenant_id = :t1 WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT pg_temp.step('both back');

-- 4. Replacements for another phone. P was turned back; C holds its
--    replacement with a price difference.
INSERT INTO public.orders (id, tenant_id, order_id, customer_name, phone, price, items, status, created_at)
VALUES ('b0000000-0000-0000-0000-000000000001', :t1, 'P-6001', 'P', '07709000020', 40000, '[{"quantity": 1}]',
        'rejected', now() - interval '30 days 7 minutes');
SELECT pg_temp.step('original order');
INSERT INTO public.orders (id, tenant_id, order_id, customer_name, phone, price, items, status, original_order_id, created_at)
VALUES ('b0000000-0000-0000-0000-000000000002', :t1, 'P-6001-2', 'C', '07709000030', -20000, '[{"quantity": 1}]',
        'delivered', 'b0000000-0000-0000-0000-000000000001', now() - interval '29 days 7 minutes');
SELECT pg_temp.step('replacement for another phone');

-- A history step alone: P turns out delivered once, so P counts as
-- delivered (it was replaced) and C's price difference counts.
INSERT INTO public.order_status_history (order_id, from_status, to_status, tenant_id)
VALUES ('b0000000-0000-0000-0000-000000000001', 'delivered', 'rejected', :t1);
SELECT pg_temp.step('history step only');

-- The original's price moves the replacement's customer.
UPDATE public.orders SET price = 10000 WHERE id = 'b0000000-0000-0000-0000-000000000001';
SELECT pg_temp.step('original price, replacement customer');

-- Editing and removing the history step.
UPDATE public.order_status_history SET from_status = 'shipped' WHERE order_id = 'b0000000-0000-0000-0000-000000000001';
SELECT pg_temp.step('history edit');
UPDATE public.order_status_history SET from_status = 'delivered' WHERE order_id = 'b0000000-0000-0000-0000-000000000001';
SELECT pg_temp.step('history edit back');
DELETE FROM public.order_status_history WHERE order_id = 'b0000000-0000-0000-0000-000000000001';
SELECT pg_temp.step('history delete');
INSERT INTO public.order_status_history (order_id, from_status, to_status, tenant_id)
VALUES ('b0000000-0000-0000-0000-000000000001', 'delivered', 'rejected', :t1);
SELECT pg_temp.step('history step again');

-- A new replacement moves its original's customer, and removing it moves it back.
INSERT INTO public.orders (id, tenant_id, order_id, customer_name, phone, price, items, status, created_at)
VALUES ('b0000000-0000-0000-0000-000000000003', :t1, 'P-6101', 'P2', '07709000040', 50000, '[{"quantity": 1}]',
        'no_response', now() - interval '20 days 13 minutes');
INSERT INTO public.order_status_history (order_id, from_status, to_status, tenant_id)
VALUES ('b0000000-0000-0000-0000-000000000003', 'delivered', 'no_response', :t1);
SELECT pg_temp.step('second original');
INSERT INTO public.orders (id, tenant_id, order_id, customer_name, phone, price, items, status, original_order_id, created_at)
VALUES ('b0000000-0000-0000-0000-000000000004', :t1, 'P-6101-2', 'C2', '07709000050', 0, '[{"quantity": 1}]',
        'pending', 'b0000000-0000-0000-0000-000000000003', now() - interval '19 days 13 minutes');
SELECT pg_temp.step('replacement inserted: its original counts as delivered');
UPDATE public.orders SET deleted_at = now() WHERE id = 'b0000000-0000-0000-0000-000000000004';
SELECT pg_temp.step('replacement soft-deleted: its original turns back');
DELETE FROM public.orders WHERE id = 'b0000000-0000-0000-0000-000000000002';
SELECT pg_temp.step('replacement hard-deleted: its original turns back');

-- delivered_at alone makes an original with a live replacement delivered.
INSERT INTO public.orders (id, tenant_id, order_id, customer_name, phone, price, items, status, created_at)
VALUES ('b0000000-0000-0000-0000-000000000005', :t1, 'P-6201', 'P3', '07709000060', 30000, '[{"quantity": 2}]',
        'cancelled', now() - interval '15 days 17 minutes');
INSERT INTO public.orders (id, tenant_id, order_id, customer_name, phone, price, items, status, original_order_id, created_at)
VALUES ('b0000000-0000-0000-0000-000000000006', :t1, 'P-6201-2', 'C3', '07709000070', -10000, '[{"quantity": 1}]',
        'delivered', 'b0000000-0000-0000-0000-000000000005', now() - interval '14 days 17 minutes');
SELECT pg_temp.step('third original and replacement');
UPDATE public.orders SET delivered_at = now() - interval '15 days' WHERE id = 'b0000000-0000-0000-0000-000000000005';
SELECT pg_temp.step('delivered_at');

-- Moving a replacement to another original moves both originals' customers.
UPDATE public.orders SET original_order_id = 'b0000000-0000-0000-0000-000000000003' WHERE id = 'b0000000-0000-0000-0000-000000000006';
SELECT pg_temp.step('original_order_id moved');
UPDATE public.orders SET original_order_id = NULL WHERE id = 'b0000000-0000-0000-0000-000000000006';
SELECT pg_temp.step('original_order_id cleared');
UPDATE public.orders SET original_order_id = 'b0000000-0000-0000-0000-000000000005' WHERE id = 'b0000000-0000-0000-0000-000000000006';
SELECT pg_temp.step('original_order_id set');

-- Hard-deleting an original: the replacement loses it (ON DELETE SET NULL).
DELETE FROM public.orders WHERE id = 'b0000000-0000-0000-0000-000000000005';
SELECT pg_temp.step('original hard-deleted');

-- 5. Many customers at once.
UPDATE public.orders SET status = 'delivered' WHERE tenant_id = :t2 AND status IN ('shipped', 'confirmed');
SELECT pg_temp.step('bulk status change');
DELETE FROM public.orders WHERE tenant_id = '00000000-0000-0000-0000-0000000000a3' AND status = 'pending'
    AND NOT EXISTS (SELECT 1 FROM public.orders c WHERE c.original_order_id = orders.id);
SELECT pg_temp.step('bulk hard delete');

-- 6. A queued customer whose numbers did not change is not rewritten.
DO $$
DECLARE
    v_before text := (SELECT xmin::text FROM public.mv_customer_metrics
                      WHERE tenant_id = '00000000-0000-0000-0000-0000000000a1' AND customer_phone = '7709000010');
BEGIN
    INSERT INTO public.customer_metrics_dirty (tenant_id, phone)
    VALUES ('00000000-0000-0000-0000-0000000000a1', '07709000010');
    PERFORM public.refresh_customer_aggregates();
    IF v_before IS NULL OR v_before <> (SELECT xmin::text FROM public.mv_customer_metrics
                      WHERE tenant_id = '00000000-0000-0000-0000-0000000000a1' AND customer_phone = '7709000010') THEN
        RAISE EXCEPTION 'unchanged customer: the row was rewritten';
    END IF;
END $$;

-- 7. Orders turning 6 months old leave the recent counts with no order
--    change. D's rejected order is 6 months and 2 hours old; its row is set
--    to what a run 3 hours ago counted. E's row is set wrong too, but none of
--    its orders crossed the line, so this run must leave it (it recounts only
--    who can have moved); the full recount in step 8 fixes it.
INSERT INTO public.orders (id, tenant_id, order_id, customer_name, phone, price, items, status, created_at)
VALUES ('c0000000-0000-0000-0000-000000000001', :t1, 'D-7001', 'D', '07709000080', 25000, '[{"quantity": 1}]',
        'rejected', now() - interval '6 mons' - interval '2 hours');
SELECT pg_temp.step('old rejected order');
INSERT INTO public.orders (id, tenant_id, order_id, customer_name, phone, price, items, status, created_at)
VALUES ('c0000000-0000-0000-0000-000000000002', :t1, 'E-7101', 'E', '07709000090', 25000, '[{"quantity": 1}]',
        'rejected', now() - interval '13 mons');
SELECT pg_temp.step('older rejected order');
DO $$
BEGIN
    IF (pg_temp.row_of('00000000-0000-0000-0000-0000000000a1', '7709000080')).recent_severe_count <> 0 THEN
        RAISE EXCEPTION 'decay: D''s order is older than 6 months but counts as recent';
    END IF;
    UPDATE public.mv_customer_metrics SET recent_severe_count = 1
    WHERE tenant_id = '00000000-0000-0000-0000-0000000000a1' AND customer_phone IN ('7709000080', '7709000090');
    UPDATE public.cron_refresh_state SET refreshed_at = now() - interval '3 hours' WHERE job = 'customer_aggregates';
    PERFORM public.refresh_customer_aggregates();
    IF (pg_temp.row_of('00000000-0000-0000-0000-0000000000a1', '7709000080')).recent_severe_count <> 0 THEN
        RAISE EXCEPTION 'decay: D''s order turned 6 months old and still counts as recent';
    END IF;
    IF (pg_temp.row_of('00000000-0000-0000-0000-0000000000a1', '7709000090')).recent_severe_count <> 1 THEN
        RAISE EXCEPTION 'decay: E was recounted though none of its orders crossed the line';
    END IF;
    -- E's row, once on each side of the comparison.
    IF pg_temp.diff() <> 2 THEN
        RAISE EXCEPTION 'decay: % rows differ, expected only E''s', pg_temp.diff();
    END IF;
END $$;

-- 8. A queue too long to go one by one recounts everyone: E is fixed and a
--    customer with no orders left goes.
INSERT INTO public.mv_customer_metrics (customer_phone, tenant_id, total_orders)
VALUES ('7700000000', '00000000-0000-0000-0000-0000000000a1', 9);
INSERT INTO public.customer_metrics_dirty (tenant_id, phone)
SELECT '00000000-0000-0000-0000-0000000000a1', '07709000010' FROM generate_series(1, 20001);
SELECT pg_temp.step('full recount');

-- 9. Who can reach what.
DO $$
DECLARE
    fails text := '';
    r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_table_privilege(r, 'public.mv_customer_metrics', 'select') THEN fails := fails || r || ' reads mv_customer_metrics; '; END IF;
        IF has_table_privilege(r, 'public.customer_metrics_source', 'select') THEN fails := fails || r || ' reads customer_metrics_source; '; END IF;
        IF has_table_privilege(r, 'public.customer_metrics_dirty', 'select,insert,update,delete') THEN fails := fails || r || ' touches the queue; '; END IF;
        IF has_function_privilege(r, 'public.refresh_customer_aggregates()', 'execute') THEN fails := fails || r || ' runs the job; '; END IF;
        IF has_function_privilege(r, 'public.customer_metrics_for(uuid,text)', 'execute') THEN fails := fails || r || ' runs customer_metrics_for; '; END IF;
        IF has_function_privilege(r, 'public.customer_metrics_queue_order()', 'execute') THEN fails := fails || r || ' runs the order queue trigger; '; END IF;
        IF has_function_privilege(r, 'public.customer_metrics_queue_status_history()', 'execute') THEN fails := fails || r || ' runs the history queue trigger; '; END IF;
    END LOOP;
    IF has_table_privilege('anon', 'public.customer_aggregates', 'select') THEN fails := fails || 'anon reads customer_aggregates; '; END IF;
    IF NOT has_table_privilege('authenticated', 'public.customer_aggregates', 'select') THEN fails := fails || 'authenticated cannot read customer_aggregates; '; END IF;
    IF NOT has_table_privilege('service_role', 'public.mv_customer_metrics', 'select') THEN fails := fails || 'the backup cannot read mv_customer_metrics; '; END IF;
    IF has_table_privilege('service_role', 'public.mv_customer_metrics', 'insert,update,delete') THEN fails := fails || 'service_role writes mv_customer_metrics; '; END IF;
    IF has_table_privilege('service_role', 'public.customer_metrics_source', 'select') THEN fails := fails || 'service_role reads customer_metrics_source; '; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mv_customer_metrics'::regclass) THEN fails := fails || 'mv_customer_metrics without RLS; '; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.customer_metrics_dirty'::regclass) THEN fails := fails || 'queue without RLS; '; END IF;
    IF fails <> '' THEN
        RAISE EXCEPTION 'grants: %', fails;
    END IF;
END $$;
