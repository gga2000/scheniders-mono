-- =============================================================================
-- Cross-tenant stock writes and product child rows (F-001 / F-002)
-- =============================================================================
--
-- WHAT THIS PROVES (after the eight 20261022* tenant-guard migrations listed
-- under MIGRATIONS below are applied)
--   Attacks, as a real member of tenant A (JWT simulated, RLS enforced):
--     * process_return / undo_return cannot move tenant V's product or
--       variant stock (write_off, open_box, historic ledger rows);
--     * an order whose items name V's product or variant is rejected on every
--       write path: PostgREST INSERT, UPDATE of items, create_order_atomic as
--       the member, and create_order_atomic as service_role (the platform
--       createOrderForTenant / storefront checkout path);
--     * a negative item quantity no longer adds stock;
--     * A cannot attach images / variants / bundle items / related products /
--       order bumps / tier prices to V's product, by INSERT or by UPDATE;
--     * anon cannot read images or variants of a hidden product, nor a child
--       row whose tenant differs from its product's.
--   Legitimate paths, same member on their own tenant:
--     * order create (confirmed) reserves, fulfil (delivered) moves reserved
--       to stock, cancel releases the reservation, variant orders move the
--       variant;
--     * process_return write_off / open_box / restock and undo_return produce
--       the exact stock / open-box numbers they did before;
--     * name-only (no uuid) order lines still insert;
--     * own child rows insert; a NULL tenant_id is filled from the product.
--
-- NOT SAFE FOR PRODUCTION: inserts rows (everything is rolled back, but it
-- writes). Run only on a throwaway local Postgres built from
-- cross_tenant_stock_local_fixture.sql.
--
-- HOW TO RUN
--   psql -d <db> -v ON_ERROR_STOP=1 -f cross_tenant_stock_local_fixture.sql
--   psql -d <db> -f cross_tenant_stock.sql        -- before: lists the holes
--   psql -d <db> -v ON_ERROR_STOP=1 -f ../migrations/20261022123506_inventory_tenant_scoped_stock_writes_1_inv_apply.sql
--   psql -d <db> -v ON_ERROR_STOP=1 -f ../migrations/20261022123531_inventory_tenant_scoped_stock_writes_2_process_return.sql
--   psql -d <db> -v ON_ERROR_STOP=1 -f ../migrations/20261022123551_inventory_tenant_scoped_stock_writes_3_undo_return.sql
--   psql -d <db> -v ON_ERROR_STOP=1 -f ../migrations/20261022123810_inventory_tenant_scoped_stock_writes_4a_guard_function.sql
--   psql -d <db> -v ON_ERROR_STOP=1 -f ../migrations/20261022123958_inventory_tenant_scoped_stock_writes_4b_guard_trigger.sql
--   psql -d <db> -v ON_ERROR_STOP=1 -f ../migrations/20261022124025_product_child_tables_tenant_guard_1_function.sql
--   psql -d <db> -v ON_ERROR_STOP=1 -f ../migrations/20261022124035_product_child_tables_tenant_guard_2_triggers.sql
--   psql -d <db> -v ON_ERROR_STOP=1 -f ../migrations/20261022124103_product_child_tables_tenant_guard_3_read_policies.sql
--   psql -d <db> -f cross_tenant_stock.sql        -- after: ALL ASSERTIONS PASSED
--   Run as a superuser (the fixture setup bypasses RLS).
--
-- MIGRATIONS
--   Drafted as two files, 20261020150000_inventory_tenant_scoped_stock_writes
--   and 20261020150100_product_child_tables_tenant_guard. Applied to
--   production on 2026-10-22 as the eight smaller migrations above, with the
--   same resulting functions, triggers and policies (live definitions
--   md5-checked against this test's database). The split, CREATE OR REPLACE
--   TRIGGER and ALTER POLICY replace the drafts' DROP/CREATE pairs, which the
--   migration tool would not run. The drafts' headers follow.
--
--   ---- 20261020150000_inventory_tenant_scoped_stock_writes ----
--   Tenant-scoped stock writes in the inventory functions (finding F-001, P0).
--
--   WHAT IT FIXES
--     process_return, undo_return and inv_apply (fired by trg_inv_order_changed
--     on public.orders) are SECURITY DEFINER and owned by postgres, so RLS does
--     not apply inside them. They updated products / product_variants
--     `WHERE id = <id>` with ids taken from the caller's jsonb (process_return),
--     from inventory_ledger (undo_return) or from orders.items (inv_apply), with
--     no tenant predicate. Any tenant member could zero, inflate or reserve
--     another tenant's stock: pass a victim product id to process_return, or
--     write an order (PostgREST INSERT/UPDATE, create_order_atomic, the platform
--     createOrderForTenant path, storefront checkout) whose items name a victim
--     product. A negative item quantity made inv_apply ADD stock.
--
--   WHAT CHANGES
--     1. inv_apply: every UPDATE is `AND tenant_id = p_tenant_id`; the ledger row
--        is written only when a row of that tenant was actually moved; quantities
--        <= 0 are skipped (the old `= 0` let a negative quantity add stock).
--     2. process_return: each destination's product / variant must belong to
--        _tenant_id, else 42501 and the whole call (status change included)
--        rolls back; the UPDATEs also carry the tenant predicate.
--     3. undo_return: only reverses this tenant's ledger rows, and only moves
--        this tenant's products / variants.
--     4. New BEFORE INSERT OR UPDATE OF items, tenant_id trigger on orders
--        (tg_orders_items_tenant_guard): rejects an item whose product_id or
--        variant_id is a row of another tenant, and a negative quantity. This is
--        the single choke point for every order writer, including both
--        create_order_atomic overloads (their bodies are unchanged).
--
--     Signatures, return types and grants are unchanged; bodies start from the
--     live pg_get_functiondef on sduvpgqwhxragxtxztur (read 2026-10-20).
--
--   LIVE DATA CHECK (SELECT only, 2026-10-20): 0 order items reference another
--   tenant's product or variant, 0 have a negative quantity, 0 inventory_ledger
--   rows disagree with their product's tenant. No existing row trips the guard.
--
--   ROLLBACK
--     DROP TRIGGER IF EXISTS trg_orders_items_tenant_guard ON public.orders;
--     DROP FUNCTION IF EXISTS public.tg_orders_items_tenant_guard();
--     then re-run the previous bodies of inv_apply / process_return /
--     undo_return (pg_get_functiondef output recorded in
--     packages/supabase/tests/cross_tenant_stock_local_fixture.sql).
--
--   ---- 20261020150100_product_child_tables_tenant_guard ----
--   Product child rows must belong to their product's tenant (finding F-002, P1).
--
--   WHAT IT FIXES
--     product_images, product_variants, product_bundle_items, product_related,
--     product_order_bumps and product_tiered_pricing checked only that the row's
--     OWN tenant_id is one of the caller's tenants. Their FKs point at
--     products(id), not (tenant_id, id), so a member of tenant A could insert a
--     row with tenant_id = A and product_id = <tenant B's product>. The public
--     read policies then served that row on B's storefront (defacement /
--     phishing images, fake variants, bundles, related items, order bumps,
--     tier prices). The public read policies on product_images /
--     product_variants were also `EXISTS (products p WHERE p.id = product_id)`
--     with no visibility filter, so anon could read images and variants of
--     hidden, archived and supply products.
--
--   WHAT CHANGES
--     1. tg_product_child_tenant_guard(): BEFORE INSERT OR UPDATE trigger,
--        modelled on tg_product_attribute_values_tenant_guard. Every product id
--        column named in the trigger arguments must exist and all must belong to
--        one tenant; tenant_id must equal that tenant (filled in when NULL,
--        rejected with 42501 when different).
--     2. public_storefront_read_product_images / _product_variants: same bar as
--        public_storefront_read_products (visible, not archived, not supply,
--        tenant trial/active) plus product tenant = row tenant.
--     3. The four public_storefront_read policies on bundle / related / order
--        bump / tiered pricing gain the same product-tenant = row-tenant match.
--
--   LIVE DATA CHECK (SELECT only, 2026-10-20): 0 rows in any of the six tables
--   whose tenant_id differs from (or is NULL against) their product's tenant;
--   0 products with a NULL tenant_id. Existing rows all satisfy the guard.
--
--   ROLLBACK
--     DROP TRIGGER IF EXISTS trg_<table>_tenant_guard ON public.<table>; (x6)
--     DROP FUNCTION IF EXISTS public.tg_product_child_tenant_guard();
--     and recreate the six read policies with the previous USING clauses
--     (recorded in packages/supabase/tests/cross_tenant_stock_local_fixture.sql).
--
-- RESULT
--   One row: 'ALL ASSERTIONS PASSED', or 'FAILED' plus every failing check.
-- =============================================================================

\set QUIET on
BEGIN;

CREATE TEMP TABLE tt_fail (check_name text) ON COMMIT DROP;
GRANT ALL ON tt_fail TO PUBLIC;

-- Act as a signed-in user (role authenticated) for the rest of the transaction
-- or subtransaction.
CREATE FUNCTION pg_temp.as_user(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;
CREATE FUNCTION pg_temp.as_service() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
END $$;
CREATE FUNCTION pg_temp.as_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  PERFORM set_config('role', 'anon', true);
END $$;
CREATE FUNCTION pg_temp.as_owner() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('role', 'none', true);
END $$;
CREATE FUNCTION pg_temp.fail(p text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO tt_fail VALUES (p);
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- ---- fixture rows (as owner) ------------------------------------------------
INSERT INTO tenants (id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'attacker'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'victim');
INSERT INTO user_profiles (id) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1'), ('bbbbbbbb-0000-0000-0000-0000000000b1');
INSERT INTO tenant_members (tenant_id, user_id, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'admin'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'admin');

INSERT INTO products (id, tenant_id, name, stock_quantity, is_visible) VALUES
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'A own',   10, true),
  ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'A own 2', 10, true),
  ('bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'V shown', 100, true),
  ('bbbbbbbb-1111-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'V hidden', 100, false);
INSERT INTO product_variants (id, product_id, tenant_id, name, stock_quantity) VALUES
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'A var', 20),
  ('bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'V var', 50),
  ('bbbbbbbb-2222-0000-0000-000000000002', 'bbbbbbbb-1111-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'V hidden var', 50);
INSERT INTO product_images (tenant_id, product_id, image_url) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001', 'v-shown.png'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000002', 'v-hidden.png'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'a-own.png');

-- A's own order the attacker returns against, and a rejected one for undo.
INSERT INTO orders (id, order_id, customer_name, phone, price, status, tenant_id, items) VALUES
  ('aaaaaaaa-3333-0000-0000-000000000001', 'A-1', 'c', 'p', 1, 'delivered', 'aaaaaaaa-0000-0000-0000-000000000001',
   '[{"name":"x","quantity":1,"price":1,"product_id":"aaaaaaaa-1111-0000-0000-000000000002"}]'),
  ('aaaaaaaa-3333-0000-0000-000000000002', 'A-2', 'c', 'p', 1, 'rejected', 'aaaaaaaa-0000-0000-0000-000000000001', '[]');
-- A ledger row as a pre-fix attack would have left it: A's order, V's product.
INSERT INTO inventory_ledger (tenant_id, product_id, order_id, delta_stock, reason) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000002', -5, 'return:write_off');
UPDATE products SET stock_quantity = 10 WHERE id = 'aaaaaaaa-1111-0000-0000-000000000002';

-- =============================================================================
-- F-001 attacks. Each block runs the attack, captures the victim's numbers as
-- owner, then raises P0099 to roll the attack back. Any other error means the
-- attack was refused, which is the expected outcome after the fix.
-- =============================================================================

-- process_return write_off on V's product
DO $$
DECLARE v_stock int;
BEGIN
  BEGIN
    PERFORM pg_temp.as_user('aaaaaaaa-0000-0000-0000-0000000000a1');
    PERFORM process_return('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'r', 'n', NULL,
      '[{"product_id":"bbbbbbbb-1111-0000-0000-000000000001","quantity":60,"dest":"write_off"}]');
    PERFORM pg_temp.as_owner();
    SELECT stock_quantity INTO v_stock FROM products WHERE id = 'bbbbbbbb-1111-0000-0000-000000000001';
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN insufficient_privilege OR check_violation THEN v_stock := NULL;
  END;
  IF v_stock IS NOT NULL AND v_stock <> 100 THEN
    PERFORM pg_temp.fail('F-001 process_return write_off moved victim product stock 100 -> ' || v_stock);
  END IF;
END $$;

-- process_return open_box on V's variant
DO $$
DECLARE v_ob int;
BEGIN
  BEGIN
    PERFORM pg_temp.as_user('aaaaaaaa-0000-0000-0000-0000000000a1');
    PERFORM process_return('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'r', 'n', NULL,
      '[{"variant_id":"bbbbbbbb-2222-0000-0000-000000000001","quantity":7,"dest":"open_box"}]');
    PERFORM pg_temp.as_owner();
    SELECT open_box_quantity INTO v_ob FROM product_variants WHERE id = 'bbbbbbbb-2222-0000-0000-000000000001';
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN insufficient_privilege OR check_violation THEN v_ob := NULL;
  END;
  IF v_ob IS NOT NULL AND v_ob <> 0 THEN
    PERFORM pg_temp.fail('F-001 process_return open_box inflated victim variant open_box 0 -> ' || v_ob);
  END IF;
END $$;

-- process_return restock naming V's product must be refused, not ledgered
DO $$
DECLARE v_refused boolean := false;
BEGIN
  BEGIN
    PERFORM pg_temp.as_user('aaaaaaaa-0000-0000-0000-0000000000a1');
    PERFORM process_return('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'r', 'n', NULL,
      '[{"product_id":"bbbbbbbb-1111-0000-0000-000000000001","quantity":1,"dest":"restock"}]');
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN insufficient_privilege THEN v_refused := true;
  END;
  IF NOT v_refused THEN
    PERFORM pg_temp.fail('F-001 process_return accepted a foreign product (restock)');
  END IF;
END $$;

-- undo_return replaying a historic ledger row on V's product
DO $$
DECLARE v_stock int;
BEGIN
  BEGIN
    PERFORM pg_temp.as_user('aaaaaaaa-0000-0000-0000-0000000000a1');
    PERFORM undo_return('aaaaaaaa-3333-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');
    PERFORM pg_temp.as_owner();
    SELECT stock_quantity INTO v_stock FROM products WHERE id = 'bbbbbbbb-1111-0000-0000-000000000001';
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
  END;
  IF v_stock IS NULL THEN
    PERFORM pg_temp.fail('F-001 undo_return errored instead of skipping the foreign ledger row');
  ELSIF v_stock <> 100 THEN
    PERFORM pg_temp.fail('F-001 undo_return moved victim product stock 100 -> ' || v_stock);
  END IF;
END $$;

-- Order writes naming V's product / variant, on every path.
DO $$
DECLARE
  r record; v_res int; v_stock int; v_vstock int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('PostgREST INSERT reserve', 'insert', 'confirmed', '{"product_id":"bbbbbbbb-1111-0000-0000-000000000001","quantity":30}'),
    ('PostgREST INSERT fulfil',  'insert', 'delivered', '{"product_id":"bbbbbbbb-1111-0000-0000-000000000001","quantity":30}'),
    ('PostgREST INSERT variant', 'insert', 'delivered', '{"variant_id":"bbbbbbbb-2222-0000-0000-000000000001","quantity":30}'),
    ('UPDATE own order items',   'update', 'delivered', '{"product_id":"bbbbbbbb-1111-0000-0000-000000000001","quantity":30}'),
    ('create_order_atomic member',  'rpc', 'delivered', '{"product_id":"bbbbbbbb-1111-0000-0000-000000000001","quantity":30}'),
    ('create_order_atomic service', 'rpc_service', 'delivered', '{"product_id":"bbbbbbbb-1111-0000-0000-000000000001","quantity":30}')
  ) AS t(label, path, status, item) LOOP
    v_res := NULL; v_stock := NULL; v_vstock := NULL;
    BEGIN
      IF r.path = 'rpc_service' THEN PERFORM pg_temp.as_service();
      ELSE PERFORM pg_temp.as_user('aaaaaaaa-0000-0000-0000-0000000000a1'); END IF;

      IF r.path = 'insert' THEN
        INSERT INTO orders (order_id, customer_name, phone, price, status, tenant_id, items)
        VALUES ('atk-' || md5(r.label), 'c', 'p', 1, r.status, 'aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(r.item::jsonb));
      ELSIF r.path = 'update' THEN
        UPDATE orders SET items = jsonb_build_array(r.item::jsonb) WHERE id = 'aaaaaaaa-3333-0000-0000-000000000001';
      ELSE
        PERFORM create_order_atomic(jsonb_build_object('customer_name','c','phone','p','price',1,'status',r.status,
          'items', jsonb_build_array(r.item::jsonb)), 'aaaaaaaa-0000-0000-0000-000000000001'::uuid);
      END IF;

      PERFORM pg_temp.as_owner();
      SELECT reserved_quantity, stock_quantity INTO v_res, v_stock FROM products WHERE id = 'bbbbbbbb-1111-0000-0000-000000000001';
      SELECT stock_quantity INTO v_vstock FROM product_variants WHERE id = 'bbbbbbbb-2222-0000-0000-000000000001';
      RAISE EXCEPTION USING ERRCODE = 'P0099';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN insufficient_privilege OR check_violation THEN v_res := NULL;
    END;
    IF v_res IS NOT NULL THEN
      PERFORM pg_temp.fail(format('F-001 %s accepted a foreign item (victim reserved=%s stock=%s variant stock=%s)',
        r.label, v_res, v_stock, v_vstock));
    END IF;
  END LOOP;
END $$;

-- Negative quantity on the member's own product must not add stock.
DO $$
DECLARE v_stock int;
BEGIN
  BEGIN
    PERFORM pg_temp.as_user('aaaaaaaa-0000-0000-0000-0000000000a1');
    INSERT INTO orders (order_id, customer_name, phone, price, status, tenant_id, items)
    VALUES ('neg-1', 'c', 'p', 1, 'delivered', 'aaaaaaaa-0000-0000-0000-000000000001',
            '[{"product_id":"aaaaaaaa-1111-0000-0000-000000000001","quantity":-5}]');
    PERFORM pg_temp.as_owner();
    SELECT stock_quantity INTO v_stock FROM products WHERE id = 'aaaaaaaa-1111-0000-0000-000000000001';
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN insufficient_privilege OR check_violation THEN v_stock := NULL;
  END;
  IF v_stock IS NOT NULL AND v_stock <> 10 THEN
    PERFORM pg_temp.fail('F-001 negative quantity changed stock 10 -> ' || v_stock);
  END IF;
END $$;

-- =============================================================================
-- F-001 legitimate paths (own tenant). Runs as one subtransaction, rolled back.
-- =============================================================================
DO $$
DECLARE
  P constant uuid := 'aaaaaaaa-1111-0000-0000-000000000001';
  VA constant uuid := 'aaaaaaaa-2222-0000-0000-000000000001';
  T constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  o1 uuid; o2 uuid; o3 uuid; o4 uuid;
  s int; rsv int; ob int; vs int; n int;
  procedure_err text;
BEGIN
  BEGIN
    PERFORM pg_temp.as_user('aaaaaaaa-0000-0000-0000-0000000000a1');

    -- create (confirmed) reserves 2
    o1 := (create_order_atomic(jsonb_build_object('customer_name','c','phone','p','price',1,'status','confirmed',
             'items', jsonb_build_array(jsonb_build_object('name','x','quantity',2,'price',1,'product_id',P))), T)->>'id')::uuid;
    SELECT stock_quantity, reserved_quantity INTO s, rsv FROM products WHERE id = P;
    IF (s, rsv) IS DISTINCT FROM (10, 2) THEN PERFORM pg_temp.fail(format('legit create: stock/reserved %s/%s, want 10/2', s, rsv)); END IF;

    -- fulfil: reservation released, stock -2
    UPDATE orders SET status = 'delivered' WHERE id = o1;
    SELECT stock_quantity, reserved_quantity INTO s, rsv FROM products WHERE id = P;
    IF (s, rsv) IS DISTINCT FROM (8, 0) THEN PERFORM pg_temp.fail(format('legit fulfil: stock/reserved %s/%s, want 8/0', s, rsv)); END IF;

    -- cancel a confirmed order: reservation released
    INSERT INTO orders (order_id, customer_name, phone, price, status, tenant_id, items)
    VALUES ('legit-2', 'c', 'p', 1, 'confirmed', T, jsonb_build_array(jsonb_build_object('name','x','quantity',3,'product_id',P)))
    RETURNING id INTO o2;
    SELECT reserved_quantity INTO rsv FROM products WHERE id = P;
    IF rsv <> 3 THEN PERFORM pg_temp.fail(format('legit insert confirmed: reserved %s, want 3', rsv)); END IF;
    UPDATE orders SET status = 'cancelled' WHERE id = o2;
    SELECT stock_quantity, reserved_quantity INTO s, rsv FROM products WHERE id = P;
    IF (s, rsv) IS DISTINCT FROM (8, 0) THEN PERFORM pg_temp.fail(format('legit cancel: stock/reserved %s/%s, want 8/0', s, rsv)); END IF;

    -- variant order fulfilled
    INSERT INTO orders (order_id, customer_name, phone, price, status, tenant_id, items)
    VALUES ('legit-3', 'c', 'p', 1, 'delivered', T, jsonb_build_array(jsonb_build_object('name','x','quantity',3,'product_id',P,'variant_id',VA)))
    RETURNING id INTO o3;
    SELECT stock_quantity INTO vs FROM product_variants WHERE id = VA;
    IF vs <> 17 THEN PERFORM pg_temp.fail(format('legit variant fulfil: variant stock %s, want 17', vs)); END IF;

    -- name-only legacy line still inserts
    INSERT INTO orders (order_id, customer_name, phone, price, status, tenant_id, items)
    VALUES ('legit-4', 'c', 'p', 1, 'confirmed', T, '[{"name":"legacy line","quantity":1,"price":1}]');

    -- process_return on o1 (delivered, 2 units): FULFILLED reversed (+2),
    -- write_off 1 (-1), open_box 1 (-1, ob +1), restock 0 movement.
    SELECT stock_quantity, open_box_quantity INTO s, ob FROM products WHERE id = P;   -- 8 / 0
    PERFORM process_return(o1, T, 'damaged', 'n', NULL, jsonb_build_array(
      jsonb_build_object('product_id', P, 'quantity', 1, 'dest', 'write_off'),
      jsonb_build_object('product_id', P, 'quantity', 1, 'dest', 'open_box'),
      jsonb_build_object('variant_id', VA, 'quantity', 1, 'dest', 'restock')));
    SELECT stock_quantity, open_box_quantity INTO s, ob FROM products WHERE id = P;
    IF (s, ob) IS DISTINCT FROM (8, 1) THEN PERFORM pg_temp.fail(format('legit process_return: stock/open_box %s/%s, want 8/1', s, ob)); END IF;
    PERFORM pg_temp.as_owner();
    SELECT count(*) INTO n FROM inventory_ledger WHERE order_id = o1 AND reason LIKE 'return:%';
    IF n <> 3 THEN PERFORM pg_temp.fail(format('legit process_return: %s return ledger rows, want 3', n)); END IF;
    PERFORM pg_temp.as_user('aaaaaaaa-0000-0000-0000-0000000000a1');

    -- undo_return: back to confirmed (reserve 2), write_off +1, open_box +1 / ob -1
    PERFORM undo_return(o1, T);
    SELECT stock_quantity, reserved_quantity, open_box_quantity INTO s, rsv, ob FROM products WHERE id = P;
    IF (s, rsv, ob) IS DISTINCT FROM (10, 2, 0) THEN
      PERFORM pg_temp.fail(format('legit undo_return: stock/reserved/open_box %s/%s/%s, want 10/2/0', s, rsv, ob));
    END IF;

    -- delete an active order: reservation released
    DELETE FROM orders WHERE id = o1;
    SELECT reserved_quantity INTO rsv FROM products WHERE id = P;
    IF rsv <> 0 THEN PERFORM pg_temp.fail(format('legit delete: reserved %s, want 0', rsv)); END IF;

    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS procedure_err = MESSAGE_TEXT;
      PERFORM pg_temp.fail('legit F-001 path raised: ' || procedure_err);
  END;
END $$;

-- =============================================================================
-- F-002 attacks: A attaches children to V's product.
-- =============================================================================
DO $$
DECLARE r record; v_ok boolean;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('product_images',        $q$INSERT INTO product_images (tenant_id, product_id, image_url) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-1111-0000-0000-000000000001','phish.png')$q$),
    ('product_variants',      $q$INSERT INTO product_variants (tenant_id, product_id, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-1111-0000-0000-000000000001','fake')$q$),
    ('product_bundle_items',  $q$INSERT INTO product_bundle_items (tenant_id, product_id, child_product_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-1111-0000-0000-000000000001','bbbbbbbb-1111-0000-0000-000000000002')$q$),
    ('product_bundle_items child', $q$INSERT INTO product_bundle_items (tenant_id, product_id, child_product_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1111-0000-0000-000000000001','bbbbbbbb-1111-0000-0000-000000000001')$q$),
    ('product_related',       $q$INSERT INTO product_related (tenant_id, product_id, related_product_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-1111-0000-0000-000000000001','aaaaaaaa-1111-0000-0000-000000000001')$q$),
    ('product_order_bumps',   $q$INSERT INTO product_order_bumps (tenant_id, product_id, bump_product_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-1111-0000-0000-000000000001','aaaaaaaa-1111-0000-0000-000000000001')$q$),
    ('product_tiered_pricing',$q$INSERT INTO product_tiered_pricing (tenant_id, product_id, min_quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-1111-0000-0000-000000000001',2)$q$),
    ('product_images UPDATE', $q$UPDATE product_images SET product_id = 'bbbbbbbb-1111-0000-0000-000000000001' WHERE image_url = 'a-own.png'$q$)
  ) AS t(label, stmt) LOOP
    v_ok := false;
    BEGIN
      PERFORM pg_temp.as_user('aaaaaaaa-0000-0000-0000-0000000000a1');
      EXECUTE r.stmt;
      GET DIAGNOSTICS v_ok = ROW_COUNT;
      RAISE EXCEPTION USING ERRCODE = 'P0099';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; WHEN insufficient_privilege THEN v_ok := false;
    END;
    IF v_ok THEN PERFORM pg_temp.fail('F-002 ' || r.label || ' accepted a row on another tenant''s product'); END IF;
  END LOOP;
END $$;

-- F-002 legitimate: own children insert; NULL tenant filled from the product.
DO $$
DECLARE v_err text; v_tenant uuid;
BEGIN
  BEGIN
    PERFORM pg_temp.as_user('aaaaaaaa-0000-0000-0000-0000000000a1');
    INSERT INTO product_images (tenant_id, product_id, image_url) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1111-0000-0000-000000000001','own2.png');
    INSERT INTO product_variants (tenant_id, product_id, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1111-0000-0000-000000000001','own');
    INSERT INTO product_bundle_items (tenant_id, product_id, child_product_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1111-0000-0000-000000000001','aaaaaaaa-1111-0000-0000-000000000002');
    INSERT INTO product_related (tenant_id, product_id, related_product_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1111-0000-0000-000000000001','aaaaaaaa-1111-0000-0000-000000000002');
    INSERT INTO product_order_bumps (tenant_id, product_id, bump_product_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1111-0000-0000-000000000001','aaaaaaaa-1111-0000-0000-000000000002');
    INSERT INTO product_tiered_pricing (tenant_id, product_id, min_quantity) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1111-0000-0000-000000000001',3);
    UPDATE product_images SET display_order = 2 WHERE image_url = 'a-own.png';
    PERFORM pg_temp.as_service();
    INSERT INTO product_tiered_pricing (tenant_id, product_id, min_quantity) VALUES (NULL,'aaaaaaaa-1111-0000-0000-000000000001',5)
      RETURNING tenant_id INTO v_tenant;
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN NULL;
    WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      PERFORM pg_temp.fail('legit F-002 own child insert raised: ' || v_err);
  END;
  IF v_err IS NULL AND v_tenant IS DISTINCT FROM 'aaaaaaaa-0000-0000-0000-000000000001'::uuid THEN
    PERFORM pg_temp.fail('legit F-002 NULL tenant_id not filled from product (got ' || coalesce(v_tenant::text, 'NULL') || ')');
  END IF;
END $$;

-- F-002 public reads (anon).
DO $$
DECLARE n_shown int; n_hidden int; n_var_hidden int; n_planted int;
BEGIN
  -- A row planted before the guard existed (triggers off): A's tenant on V's product.
  SET LOCAL session_replication_role = replica;
  INSERT INTO product_images (tenant_id, product_id, image_url) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-1111-0000-0000-000000000001','planted.png');
  SET LOCAL session_replication_role = origin;

  PERFORM pg_temp.as_anon();
  SELECT count(*) INTO n_shown  FROM product_images WHERE image_url = 'v-shown.png';
  SELECT count(*) INTO n_hidden FROM product_images WHERE image_url = 'v-hidden.png';
  SELECT count(*) INTO n_var_hidden FROM product_variants WHERE id = 'bbbbbbbb-2222-0000-0000-000000000002';
  SELECT count(*) INTO n_planted FROM product_images WHERE image_url = 'planted.png';
  PERFORM pg_temp.as_owner();
  DELETE FROM product_images WHERE image_url = 'planted.png';

  IF n_shown <> 1 THEN PERFORM pg_temp.fail('legit anon cannot read a visible product''s image'); END IF;
  IF n_hidden <> 0 THEN PERFORM pg_temp.fail('F-002 anon reads images of a hidden product'); END IF;
  IF n_var_hidden <> 0 THEN PERFORM pg_temp.fail('F-002 anon reads variants of a hidden product'); END IF;
  IF n_planted <> 0 THEN PERFORM pg_temp.fail('F-002 anon reads a child row whose tenant differs from its product'); END IF;
END $$;

\set QUIET off
SELECT CASE WHEN count(*) = 0 THEN 'ALL ASSERTIONS PASSED' ELSE 'FAILED' END AS status,
       string_agg(check_name, E'\n' ORDER BY check_name) AS failures
  FROM tt_fail;

ROLLBACK;
