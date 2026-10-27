-- =============================================================================
-- After-sale foundation: links, stock, money (replacements + refunds)
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261027221500_after_sale_link_and_return_stock_fix
-- and 20261028000000_after_sale_items_and_create_function are applied)
--   Links
--     * create_order_atomic keeps is_replacement + original_order_id, refuses an
--       original from another tenant, and a return is never also a replacement;
--     * an UPDATE cannot point an order at another tenant's order.
--   Stock
--     * a return order moving through in_transit / refund_delivered never moves
--       stock (it used to take -qty and give it back);
--     * receive back: sealed -> +stock, opened_usable -> +open box, damaged ->
--       no stock change, missing -> not_returned; a second intake is refused;
--       a line the customer keeps (expects_back = false) cannot be received.
--   Money (whole IQD, same cases as apps/platform/lib/refunds/refund-math.test.ts)
--     * 44,000 paid for lines worth 30,000 + 15,000 -> 29,333 / 14,667;
--     * three partials of a 29,999 line (qty 3) -> 10,000 + 10,000 + 9,999;
--     * refund fee kept defaults from tenant settings and never exceeds the
--       refund; replacement price = new - credit, fee charged or absorbed;
--       a cheaper swap gives a negative courier amount;
--     * more units than are left on a line are refused.
--   Reason
--     * _reason_id is written to the child; another kind or tenant is refused.
--   Tenancy
--     * another tenant's original or product is refused;
--     * authenticated cannot call create_after_sale_order or write the tables.
--
-- LOCAL THROWAWAY POSTGRES ONLY (it writes; everything is rolled back).
--
-- HOW TO RUN
--   psql -d <db> -v ON_ERROR_STOP=1 -f cross_tenant_stock_local_fixture.sql
--   psql -d <db> -v ON_ERROR_STOP=1 -f after_sale_local_fixture.sql
--   psql -d <db> -v ON_ERROR_STOP=1 -1 -f ../migrations/20261027221500_after_sale_link_and_return_stock_fix.sql
--   psql -d <db> -v ON_ERROR_STOP=1 -1 -f ../migrations/20261028000000_after_sale_items_and_create_function.sql
--   psql -d <db> -v ON_ERROR_STOP=1 -f after_sale.sql      -- prints PASS lines, raises on a failure
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.eq(_label text, _got anyelement, _want anyelement) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF _got IS DISTINCT FROM _want THEN
        RAISE EXCEPTION 'FAIL %: got %, want %', _label, _got, _want;
    END IF;
    RAISE NOTICE 'PASS %', _label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.refused(_label text, _sql text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE _sql;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'PASS % (refused: %)', _label, SQLERRM;
        RETURN;
    END;
    RAISE EXCEPTION 'FAIL %: was not refused', _label;
END $$;

DO $$
DECLARE
    ta uuid; tb uuid; pa uuid; pa2 uuid; pnew uuid; pcheap uuid; pb uuid;
    orig uuid; orig3 uuid; other uuid; r jsonb; c uuid; line uuid;
    s integer; ob integer;
BEGIN
    INSERT INTO tenants(name, slug, settings) VALUES ('A', 'a', '{"after_sale":{"default_fee_kept":5000}}') RETURNING id INTO ta;
    INSERT INTO tenants(name, slug) VALUES ('B', 'b') RETURNING id INTO tb;
    INSERT INTO products(tenant_id, name, price, stock_quantity) VALUES (ta, 'Perfume 100ml', 30000, 10) RETURNING id INTO pa;
    INSERT INTO products(tenant_id, name, price, stock_quantity) VALUES (ta, 'Wafer', 15000, 10) RETURNING id INTO pa2;
    INSERT INTO products(tenant_id, name, price, stock_quantity) VALUES (ta, 'Perfume 200ml', 20000, 10) RETURNING id INTO pnew;
    INSERT INTO products(tenant_id, name, price, stock_quantity) VALUES (ta, 'Mini', 10000, 10) RETURNING id INTO pcheap;
    INSERT INTO products(tenant_id, name, price, stock_quantity) VALUES (tb, 'B item', 1000, 10) RETURNING id INTO pb;

    -- A delivered original: 30,000 + 15,000 with a 1,000 discount -> paid 44,000.
    INSERT INTO orders(order_id, sequence_number, customer_name, phone, items, price, status, tenant_id)
    VALUES ('O-1', 1, 'Ali', '0770', jsonb_build_array(
        jsonb_build_object('product_id', pa, 'name', 'Perfume 100ml', 'price', 30000, 'quantity', 1),
        jsonb_build_object('product_id', pa2, 'name', 'Wafer', 'price', 15000, 'quantity', 1)),
        44000, 'delivered', ta) RETURNING id INTO orig;
    INSERT INTO orders(order_id, sequence_number, customer_name, phone, items, price, status, tenant_id)
    VALUES ('O-3', 3, 'Sara', '0771', jsonb_build_array(
        jsonb_build_object('product_id', pa, 'name', 'Perfume 100ml', 'price', 9999.67, 'quantity', 3)),
        29999, 'completed', ta) RETURNING id INTO orig3;
    INSERT INTO orders(order_id, sequence_number, customer_name, phone, items, price, status, tenant_id)
    VALUES ('O-B', 1, 'X', '0', '[]', 1000, 'delivered', tb) RETURNING id INTO other;

    -- ── Links ──────────────────────────────────────────────────────────────
    r := create_order_atomic(jsonb_build_object('customer_name', 'Ali', 'phone', '0770', 'items', '[]'::jsonb,
            'price', 0, 'status', 'cancelled', 'is_replacement', true, 'original_order_id', orig), ta);
    PERFORM pg_temp.eq('create_order_atomic keeps original_order_id', (r->>'original_order_id')::uuid, orig);
    PERFORM pg_temp.eq('create_order_atomic keeps is_replacement', (r->>'is_replacement')::boolean, true);
    r := create_order_atomic(jsonb_build_object('customer_name', 'Ali', 'phone', '0770', 'items', '[]'::jsonb,
            'price', 0, 'status', 'cancelled', 'is_replacement', true, 'is_return', true, 'original_order_id', orig), ta);
    PERFORM pg_temp.eq('a return is never also a replacement', (r->>'is_replacement')::boolean, false);
    PERFORM pg_temp.refused('create_order_atomic: original from another tenant',
        format($q$SELECT create_order_atomic(jsonb_build_object('price',0,'status','cancelled','original_order_id',%L::uuid), %L::uuid)$q$, other, ta));
    PERFORM pg_temp.refused('UPDATE cannot link to another tenant''s order',
        format('UPDATE orders SET original_order_id = %L WHERE id = %L', other, orig3));

    -- ── Refund money ───────────────────────────────────────────────────────
    r := create_after_sale_order(ta, orig, 'refund', '[{"original_line":0,"qty":1}]');
    c := (r->>'id')::uuid;
    PERFORM pg_temp.eq('refund line 0 of 44,000 order = 29,333', (r->'after_sale'->>'credit')::integer, 29333);
    PERFORM pg_temp.eq('refund child price = -29,333', (r->>'price')::numeric, -29333::numeric);
    PERFORM pg_temp.eq('refund fee kept from tenant default', (r->>'delivery_fee')::numeric, 5000::numeric);
    PERFORM pg_temp.eq('refund courier amount = -24,333', (r->'after_sale'->>'courier_amount')::integer, -24333);
    PERFORM pg_temp.eq('refund order number', r->>'order_id', 'RTN-1-1');
    PERFORM pg_temp.eq('refund is_return + linked', (r->>'is_return')::boolean AND (r->>'original_order_id')::uuid = orig, true);
    PERFORM pg_temp.refused('line 0 cannot be taken back twice',
        format($q$SELECT create_after_sale_order(%L, %L, 'refund', '[{"original_line":0,"qty":1}]')$q$, ta, orig));

    -- Line 1 kept by the customer; fee asked above the refund is capped.
    r := create_after_sale_order(ta, orig, 'refund', '[{"original_line":1,"qty":1,"expects_back":false}]', '[]', 20000);
    PERFORM pg_temp.eq('last line takes the rounding: 14,667', (r->'after_sale'->>'credit')::integer, 14667);
    PERFORM pg_temp.eq('fee kept never exceeds the refund', (r->'after_sale'->>'fee_kept')::integer, 14667);
    PERFORM pg_temp.eq('full refund sums to what was paid',
        (SELECT sum(amount)::integer FROM after_sale_items WHERE original_order_id = orig AND direction = 'back'), 44000);

    -- Three partials of a 29,999 line.
    r := create_after_sale_order(ta, orig3, 'refund', '[{"original_line":0,"qty":1}]', '[]', 0);
    PERFORM pg_temp.eq('partial 1 of 3 = 10,000', (r->'after_sale'->>'credit')::integer, 10000);
    PERFORM pg_temp.eq('second refund numbered RTN-3-1', r->>'order_id', 'RTN-3-1');
    r := create_after_sale_order(ta, orig3, 'refund', '[{"original_line":0,"qty":1}]', '[]', 0);
    PERFORM pg_temp.eq('partial 2 of 3 = 10,000', (r->'after_sale'->>'credit')::integer, 10000);
    PERFORM pg_temp.refused('more units than are left',
        format($q$SELECT create_after_sale_order(%L, %L, 'refund', '[{"original_line":0,"qty":2}]')$q$, ta, orig3));
    r := create_after_sale_order(ta, orig3, 'refund', '[{"original_line":0,"qty":1}]', '[]', 0);
    PERFORM pg_temp.eq('partial 3 of 3 takes the remainder = 9,999', (r->'after_sale'->>'credit')::integer, 9999);

    -- ── Return orders never move stock while travelling ────────────────────
    SELECT stock_quantity INTO s FROM products WHERE id = pa;
    UPDATE orders SET status = 'in_transit' WHERE id = c;
    PERFORM pg_temp.eq('return in transit leaves stock alone', (SELECT stock_quantity FROM products WHERE id = pa), s);
    UPDATE orders SET status = 'refund_delivered' WHERE id = c;
    PERFORM pg_temp.eq('return delivered leaves stock alone', (SELECT stock_quantity FROM products WHERE id = pa), s);

    -- ── Receive back ───────────────────────────────────────────────────────
    SELECT id INTO line FROM after_sale_items WHERE order_id = c AND direction = 'back';
    PERFORM receive_after_sale_item(ta, line, 'sealed', NULL, 'Ali');
    PERFORM pg_temp.eq('sealed -> +1 stock', (SELECT stock_quantity FROM products WHERE id = pa), s + 1);
    PERFORM pg_temp.eq('sealed -> restock recorded', (SELECT disposition FROM after_sale_items WHERE id = line), 'restock');
    PERFORM pg_temp.refused('second intake of the same line',
        format($q$SELECT receive_after_sale_item(%L, %L, 'sealed')$q$, ta, line));
    PERFORM pg_temp.refused('a kept line cannot be received',
        format($q$SELECT receive_after_sale_item(%L, (SELECT id FROM after_sale_items WHERE original_order_id = %L AND NOT expects_back), 'sealed')$q$, ta, orig));
    PERFORM pg_temp.refused('another tenant cannot receive this line',
        format($q$SELECT receive_after_sale_item(%L, %L, 'sealed')$q$, tb, line));

    SELECT id INTO line FROM after_sale_items WHERE original_order_id = orig3 ORDER BY created_at, id LIMIT 1;
    SELECT open_box_quantity, stock_quantity INTO ob, s FROM products WHERE id = pa;
    PERFORM receive_after_sale_item(ta, line, 'opened_usable');
    PERFORM pg_temp.eq('opened -> +1 open box', (SELECT open_box_quantity FROM products WHERE id = pa), ob + 1);
    PERFORM pg_temp.eq('opened -> stock unchanged', (SELECT stock_quantity FROM products WHERE id = pa), s);
    SELECT id INTO line FROM after_sale_items WHERE original_order_id = orig3 AND disposition IS NULL ORDER BY created_at, id LIMIT 1;
    PERFORM receive_after_sale_item(ta, line, 'damaged');
    PERFORM pg_temp.eq('damaged -> no stock change', (SELECT stock_quantity FROM products WHERE id = pa), s);
    SELECT id INTO line FROM after_sale_items WHERE original_order_id = orig3 AND disposition IS NULL LIMIT 1;
    PERFORM receive_after_sale_item(ta, line, 'missing');
    PERFORM pg_temp.eq('missing -> not_returned, no receipt',
        (SELECT disposition || coalesce(received_at::text, '-') FROM after_sale_items WHERE id = line), 'not_returned-');

    -- ── Replacement money ──────────────────────────────────────────────────
    DELETE FROM after_sale_items WHERE original_order_id = orig;   -- free the original's lines again
    UPDATE orders SET status = 'cancelled' WHERE original_order_id = orig;
    SELECT reserved_quantity INTO s FROM products WHERE id = pnew;
    r := create_after_sale_order(ta, orig, 'replacement', '[{"original_line":1,"qty":1}]',
            jsonb_build_array(jsonb_build_object('product_id', pnew, 'qty', 1)));
    PERFORM pg_temp.eq('replacement price = 20,000 - 14,667', (r->>'price')::numeric, 5333::numeric);
    PERFORM pg_temp.eq('replacement fee charged = 5,000', (r->>'delivery_fee')::numeric, 5000::numeric);
    PERFORM pg_temp.eq('replacement courier collects 10,333', (r->'after_sale'->>'courier_amount')::integer, 10333);
    PERFORM pg_temp.eq('replacement numbered RPL-1-1', r->>'order_id', 'RPL-1-1');
    PERFORM pg_temp.eq('replacement flagged + linked',
        (r->>'is_replacement')::boolean AND NOT (r->>'is_return')::boolean AND (r->>'original_order_id')::uuid = orig, true);
    PERFORM pg_temp.eq('new item reserved', (SELECT reserved_quantity FROM products WHERE id = pnew), s + 1);
    PERFORM pg_temp.eq('out line priced from catalog',
        (SELECT amount FROM after_sale_items WHERE order_id = (r->>'id')::uuid AND direction = 'out'), 20000);

    r := create_after_sale_order(ta, orig, 'replacement', '[{"original_line":0,"qty":1}]',
            jsonb_build_array(jsonb_build_object('product_id', pcheap, 'qty', 1)), NULL, false);
    PERFORM pg_temp.eq('cheaper swap, fee absorbed: courier pays 19,333', (r->'after_sale'->>'courier_amount')::integer, -19333);
    PERFORM pg_temp.eq('absorbed fee -> delivery_fee 0', (r->>'delivery_fee')::numeric, 0::numeric);

    -- ── Reason ────────────────────────────────────────────────────────────
    INSERT INTO order_reasons(tenant_id, kind, label_ar) VALUES (ta, 'refund', 'x') RETURNING id INTO line;
    INSERT INTO orders(order_id, sequence_number, customer_name, phone, items, price, status, tenant_id)
    VALUES ('O-5', 5, 'Zed', '0773', jsonb_build_array(
        jsonb_build_object('product_id', pa, 'name', 'Perfume 100ml', 'price', 30000, 'quantity', 2)),
        60000, 'delivered', ta) RETURNING id INTO orig3;
    r := create_after_sale_order(ta, orig3, 'refund', '[{"original_line":0,"qty":1}]', '[]', 0, true, NULL, NULL, NULL, line);
    PERFORM pg_temp.eq('reason_id written on the child', (SELECT reason_id FROM orders WHERE id = (r->>'id')::uuid), line);
    PERFORM pg_temp.refused('a refund reason cannot tag a replacement',
        format($q$SELECT create_after_sale_order(%L, %L, 'replacement', '[{"original_line":0,"qty":1}]', jsonb_build_array(jsonb_build_object('product_id', %L::uuid, 'qty', 1)), NULL, true, NULL, NULL, NULL, %L)$q$, ta, orig3, pnew, line));
    INSERT INTO order_reasons(tenant_id, kind, label_ar) VALUES (tb, 'refund', 'y') RETURNING id INTO line;
    PERFORM pg_temp.refused('another tenant''s reason',
        format($q$SELECT create_after_sale_order(%L, %L, 'refund', '[{"original_line":0,"qty":1}]', '[]', 0, true, NULL, NULL, NULL, %L)$q$, ta, orig3, line));

    -- ── Tenancy ────────────────────────────────────────────────────────────
    PERFORM pg_temp.refused('original of another tenant',
        format($q$SELECT create_after_sale_order(%L, %L, 'refund', '[{"original_line":0,"qty":1}]')$q$, ta, other));
    INSERT INTO orders(order_id, sequence_number, customer_name, phone, items, price, status, tenant_id)
    VALUES ('O-4', 4, 'Noor', '0772', jsonb_build_array(
        jsonb_build_object('product_id', pa, 'name', 'Perfume 100ml', 'price', 30000, 'quantity', 1)),
        30000, 'delivered', ta) RETURNING id INTO orig3;
    PERFORM pg_temp.refused('new item of another tenant',
        format($q$SELECT create_after_sale_order(%L, %L, 'replacement', '[{"original_line":0,"qty":1}]', jsonb_build_array(jsonb_build_object('product_id', %L::uuid, 'qty', 1)))$q$, ta, orig3, pb));
    UPDATE orders SET status = 'delivered' WHERE id = (r->>'id')::uuid;
    PERFORM pg_temp.refused('a replacement cannot start from a replacement order',
        format($q$SELECT create_after_sale_order(%L, %L, 'refund', '[{"original_line":0,"qty":1}]')$q$, ta, (r->>'id')::uuid));
END $$;

-- authenticated: no execute on the create function, no direct writes.
SET LOCAL ROLE authenticated;
SELECT FROM pg_temp.refused('authenticated cannot call create_after_sale_order',
    $q$SELECT create_after_sale_order(gen_random_uuid(), gen_random_uuid(), 'refund', '[]')$q$);
SELECT FROM pg_temp.refused('authenticated cannot insert after_sale_items',
    $q$INSERT INTO after_sale_items(tenant_id, order_id, original_order_id, direction, original_line_index, name, unit_price, qty, amount) SELECT tenant_id, id, id, 'back', 0, 'x', 0, 1, 0 FROM orders LIMIT 1$q$);
RESET ROLE;

ROLLBACK;
