-- =============================================================================
-- products_cost_and_supplies: regression check
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261103165038, 20261103165411, 20261103165748, 20261103174119)
--   Cost guard (guard_cost_writes), as an active employee (products.edit, no
--   cost access):
--     1. may change a supply's cost;
--     2. may NOT change an existing sellable product's cost;
--     3. may add a supplier row with a unit cost to a supply;
--     4. may NOT add one to a sellable product;
--     5. may create a new product with a starting cost;
--    5b. may NOT tick "supply" on an existing sellable product (that would
--        open its cost to them).
--   Supplies used by orders (trg_orders_use_supplies):
--     6. an order created in_transit takes its recipe rows from the supplies:
--        per_unit x quantity, per_item once per line, per_order once per
--        order (the largest amount asked), rounded up per supply;
--     7. moving on to delivered, then cancelled, takes nothing more and gives
--        nothing back;
--     8. a confirmed order takes nothing until it ships;
--     9. a returned order (is_return) takes nothing.
--   Receiving and stock:
--    10. a received cost of 0 is refused;
--    11. adjust_product_stock refuses an unknown reason;
--    12. product_suppliers refuses a product of another store;
--    13. authenticated has no TRUNCATE on the catalogue tables;
--    14. a recipe row (bom_items) refuses a supply of another store.
--   Purchase orders and recipes (20261103181054, 20261103190822):
--    15. creating a PO for a supplier that has a draft adds to that draft
--        (same product sums on one line, total recomputed);
--    16. a member may not delete a product open orders reserve;
--    17. a recipe row refuses a sellable product as its supply;
--    18. a supply a recipe uses cannot be unticked.
--
-- SAFE TO RUN AGAINST PRODUCTION
--   One DO block that ends by raising an exception, so every write is rolled
--   back. Ids are borrowed, never printed.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -f packages/supabase/tests/products_cost_and_supplies.sql
--   or paste into the Supabase MCP execute_sql tool, as postgres.
--
-- RESULT
--   The block always ends in an error (that is the rollback). Its message is
--   'ALL ASSERTIONS PASSED' or 'FAILED: <checks>'. Every check runs.
-- =============================================================================

DO $test$
DECLARE
    v_tenant uuid; v_owner uuid; v_employee uuid;
    v_prod uuid; v_prod2 uuid; v_s1 uuid; v_s2 uuid; v_foreign uuid;
    v_order uuid; v_order2 uuid; v_ret uuid; v_po uuid; v_item uuid;
    b1 int; b2 int; s1 int; s2 int; n int;
    v_fail text := '';
    v_ok boolean;
    v_po_a uuid; v_po_b uuid; v_tmp uuid; v_total numeric;
    r record;
BEGIN
    SELECT p.tenant_id INTO v_tenant FROM public.products p WHERE p.is_supply
     GROUP BY p.tenant_id HAVING count(*) >= 2 ORDER BY count(*) DESC LIMIT 1;
    -- A member with cost access (not every admin has it).
    FOR r IN SELECT user_id FROM public.tenant_members WHERE tenant_id = v_tenant AND status = 'active' LOOP
        PERFORM set_config('request.jwt.claims', json_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);
        IF public.can_see_product_cost(v_tenant) THEN v_owner := r.user_id; EXIT; END IF;
    END LOOP;
    SELECT user_id INTO v_employee FROM public.tenant_members WHERE tenant_id = v_tenant AND role = 'employee' AND status = 'active' ORDER BY user_id LIMIT 1;
    SELECT id INTO v_prod FROM public.products WHERE tenant_id = v_tenant AND NOT is_supply ORDER BY id LIMIT 1;
    SELECT id INTO v_prod2 FROM public.products WHERE tenant_id = v_tenant AND NOT is_supply ORDER BY id OFFSET 1 LIMIT 1;
    SELECT id INTO v_s1 FROM public.products WHERE tenant_id = v_tenant AND is_supply ORDER BY id LIMIT 1;
    SELECT id INTO v_s2 FROM public.products WHERE tenant_id = v_tenant AND is_supply ORDER BY id OFFSET 1 LIMIT 1;
    SELECT id INTO v_foreign FROM public.products WHERE tenant_id <> v_tenant LIMIT 1;
    IF v_foreign IS NULL THEN
        -- One store only: borrow a throwaway second store for check 12.
        INSERT INTO public.tenants (id, business_name, slug)
        VALUES (gen_random_uuid(), 'tt-other', 'tt-other-' || substr(md5(random()::text), 1, 8))
        RETURNING id INTO v_po;
        INSERT INTO public.products (tenant_id, name, slug, price)
        VALUES (v_po, 'tt', 'tt-' || gen_random_uuid(), 1000) RETURNING id INTO v_foreign;
        v_po := NULL;
    END IF;
    IF v_owner IS NULL OR v_employee IS NULL OR v_prod2 IS NULL OR v_s2 IS NULL THEN
        RAISE EXCEPTION 'SETUP: needs a store with a member who sees cost, an employee, 2 products and 2 supplies';
    END IF;

    -- ---------------------------------------------------------------- 1-5
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_employee, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    BEGIN UPDATE public.products SET cost = 1234 WHERE id = v_s1; GET DIAGNOSTICS n = ROW_COUNT; v_ok := n = 1;
    EXCEPTION WHEN others THEN v_ok := false; END;
    IF NOT v_ok THEN v_fail := v_fail || ' 1-employee-supply-cost'; END IF;

    BEGIN UPDATE public.products SET cost = 1234 WHERE id = v_prod; v_ok := false;
    EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
    IF NOT v_ok THEN v_fail := v_fail || ' 2-employee-product-cost-refused'; END IF;

    BEGIN INSERT INTO public.product_suppliers (product_id, tenant_id, supplier_name, unit_cost) VALUES (v_s1, v_tenant, 'tt', 500); v_ok := true;
    EXCEPTION WHEN others THEN v_ok := false; END;
    IF NOT v_ok THEN v_fail := v_fail || ' 3-employee-supply-supplier-cost'; END IF;

    BEGIN INSERT INTO public.product_suppliers (product_id, tenant_id, supplier_name, unit_cost) VALUES (v_prod, v_tenant, 'tt', 500); v_ok := false;
    EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
    IF NOT v_ok THEN v_fail := v_fail || ' 4-employee-product-supplier-cost-refused'; END IF;

    BEGIN INSERT INTO public.products (tenant_id, name, slug, price, cost) VALUES (v_tenant, 'tt', 'tt-' || gen_random_uuid(), 1000, 500); v_ok := true;
    EXCEPTION WHEN others THEN v_ok := false; END;
    IF NOT v_ok THEN v_fail := v_fail || ' 5-employee-new-product-cost'; END IF;

    BEGIN UPDATE public.products SET is_supply = true WHERE id = v_prod; v_ok := true;
    EXCEPTION WHEN insufficient_privilege THEN v_ok := false; END;
    IF v_ok THEN v_fail := v_fail || ' 5b-employee-ticks-supply'; END IF;

    RESET ROLE;

    -- ---------------------------------------------------------------- 6-9
    INSERT INTO public.bom_items (product_id, supply_id, quantity, unit, tenant_id) VALUES
        (v_prod, v_s1, 1, 'per_unit', v_tenant),
        (v_prod, v_s2, 1, 'per_order', v_tenant),
        (v_prod2, v_s2, 1, 'per_order', v_tenant),
        (v_prod2, v_s1, 0.5, 'per_item', v_tenant);
    SELECT stock_quantity INTO b1 FROM public.products WHERE id = v_s1;
    SELECT stock_quantity INTO b2 FROM public.products WHERE id = v_s2;

    INSERT INTO public.orders (order_id, customer_name, phone, price, status, tenant_id, items)
    VALUES ('tt-sup-' || substr(md5(random()::text), 1, 8), 'tt', '07990000001', 1000, 'in_transit', v_tenant,
            jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 3),
                              jsonb_build_object('product_id', v_prod, 'quantity', 1),
                              jsonb_build_object('product_id', v_prod2, 'quantity', 2)))
    RETURNING id INTO v_order;
    SELECT stock_quantity INTO s1 FROM public.products WHERE id = v_s1;
    SELECT stock_quantity INTO s2 FROM public.products WHERE id = v_s2;
    -- s1: 3 + 1 per_unit, 0.5 per_item -> ceil(4.5) = 5; s2: once per order = 1
    IF s1 <> b1 - 5 OR s2 <> b2 - 1 THEN v_fail := v_fail || format(' 6-shipped-uses-recipe(%s,%s)', b1 - s1, b2 - s2); END IF;

    UPDATE public.orders SET status = 'delivered' WHERE id = v_order;
    UPDATE public.orders SET status = 'cancelled' WHERE id = v_order;
    IF (SELECT stock_quantity FROM public.products WHERE id = v_s1) <> s1
       OR (SELECT stock_quantity FROM public.products WHERE id = v_s2) <> s2 THEN
        v_fail := v_fail || ' 7-only-once';
    END IF;

    INSERT INTO public.orders (order_id, customer_name, phone, price, status, tenant_id, items)
    VALUES ('tt-sup-' || substr(md5(random()::text), 1, 8), 'tt', '07990000002', 1000, 'confirmed', v_tenant,
            jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)))
    RETURNING id INTO v_order2;
    IF (SELECT stock_quantity FROM public.products WHERE id = v_s1) <> s1 THEN v_fail := v_fail || ' 8-confirmed-takes-nothing'; END IF;
    UPDATE public.orders SET status = 'in_transit' WHERE id = v_order2;
    IF (SELECT stock_quantity FROM public.products WHERE id = v_s1) <> s1 - 1 THEN v_fail := v_fail || ' 8-takes-on-ship'; END IF;

    INSERT INTO public.orders (order_id, customer_name, phone, price, status, tenant_id, items, is_return)
    VALUES ('tt-sup-' || substr(md5(random()::text), 1, 8), 'tt', '07990000003', 1000, 'delivered', v_tenant,
            jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 5)), true)
    RETURNING id INTO v_ret;
    IF (SELECT stock_quantity FROM public.products WHERE id = v_s1) <> s1 - 1 THEN v_fail := v_fail || ' 9-return-takes-nothing'; END IF;

    -- ---------------------------------------------------------------- 10-13
    INSERT INTO public.purchase_orders (tenant_id, po_number, supplier_name, status)
    VALUES (v_tenant, 'TT-' || substr(md5(random()::text), 1, 6), 'tt', 'sent') RETURNING id INTO v_po;
    INSERT INTO public.purchase_order_items (po_id, product_id, product_name, quantity_ordered, unit_cost)
    VALUES (v_po, v_s1, 'tt', 5, 100) RETURNING id INTO v_item;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
        PERFORM public.receive_purchase_order(v_po, jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantity', 1, 'unit_cost', 0)));
        v_ok := false;
    EXCEPTION WHEN invalid_parameter_value THEN v_ok := true; END;
    IF NOT v_ok THEN v_fail := v_fail || ' 10-receipt-cost-0-refused'; END IF;

    BEGIN
        PERFORM public.adjust_product_stock(v_s1, 1, 'gift');
        v_ok := false;
    EXCEPTION WHEN invalid_parameter_value THEN v_ok := true; END;
    IF NOT v_ok THEN v_fail := v_fail || ' 11-unknown-reason-refused'; END IF;

    BEGIN
        INSERT INTO public.product_suppliers (product_id, tenant_id, supplier_name) VALUES (v_foreign, v_tenant, 'tt');
        v_ok := false;
    EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
    IF NOT v_ok THEN v_fail := v_fail || ' 12-foreign-product-supplier-refused'; END IF;

    BEGIN
        INSERT INTO public.bom_items (product_id, supply_id, quantity, unit, tenant_id) VALUES (v_prod, v_foreign, 1, 'per_unit', v_tenant);
        v_ok := false;
    EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
    IF NOT v_ok THEN v_fail := v_fail || ' 14-foreign-recipe-supply-refused'; END IF;

    IF has_table_privilege('authenticated', 'public.products', 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.product_variants', 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.categories', 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.product_categories', 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.product_suppliers', 'TRUNCATE') THEN
        v_fail := v_fail || ' 13-no-truncate';
    END IF;

    -- ---------------------------------------------------------------- 15
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SELECT id INTO v_po_a FROM public.create_purchase_order(v_tenant, 'tt-draft-supplier',
        jsonb_build_array(jsonb_build_object('product_id', v_s1, 'quantity_ordered', 2, 'unit_cost', 100)));
    SELECT id, total_cost INTO v_po_b, v_total FROM public.create_purchase_order(v_tenant, ' TT-Draft-Supplier ',
        jsonb_build_array(jsonb_build_object('product_id', v_s1, 'quantity_ordered', 3, 'unit_cost', 100),
                          jsonb_build_object('product_id', v_s2, 'quantity_ordered', 1, 'unit_cost', 50)));
    IF v_po_a IS DISTINCT FROM v_po_b
       OR (SELECT count(*) FROM public.purchase_order_items WHERE po_id = v_po_a) <> 2
       OR (SELECT quantity_ordered FROM public.purchase_order_items WHERE po_id = v_po_a AND product_id = v_s1) <> 5
       OR v_total <> 550
       OR (SELECT total_cost FROM public.purchase_orders WHERE id = v_po_a) <> 550 THEN
        v_fail := v_fail || ' 15-po-adds-to-draft';
    END IF;

    -- ---------------------------------------------------------------- 16
    INSERT INTO public.products (tenant_id, name, slug, price, reserved_quantity)
    VALUES (v_tenant, 'tt-reserved', 'tt-' || gen_random_uuid(), 1000, 1) RETURNING id INTO v_tmp;
    SET LOCAL ROLE authenticated;
    BEGIN
        DELETE FROM public.products WHERE id = v_tmp;
        v_ok := false;
    EXCEPTION WHEN foreign_key_violation THEN v_ok := true; END;
    RESET ROLE;
    IF NOT v_ok THEN v_fail := v_fail || ' 16-reserved-delete-refused'; END IF;

    -- ---------------------------------------------------------------- 17-18
    BEGIN
        INSERT INTO public.bom_items (product_id, supply_id, quantity, unit, tenant_id) VALUES (v_prod, v_prod2, 1, 'per_unit', v_tenant);
        v_ok := false;
    EXCEPTION WHEN check_violation THEN v_ok := true; END;
    IF NOT v_ok THEN v_fail := v_fail || ' 17-recipe-sellable-refused'; END IF;
    BEGIN
        UPDATE public.products SET is_supply = false WHERE id = v_s2;
        v_ok := false;
    EXCEPTION WHEN foreign_key_violation THEN v_ok := true; END;
    IF NOT v_ok THEN v_fail := v_fail || ' 18-untick-used-supply-refused'; END IF;

    IF v_fail = '' THEN
        RAISE EXCEPTION 'ALL ASSERTIONS PASSED';
    END IF;
    RAISE EXCEPTION 'FAILED:%', v_fail;
END
$test$;
