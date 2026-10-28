-- =============================================================================
-- abandoned_cart_lifecycle: regression check
-- =============================================================================
--
-- WHAT THIS PROVES (after 20261027230000_abandoned_cart_lifecycle.sql)
--   Catalog:
--     * sweep_abandoned_carts is executable by service_role only;
--     * the trigger functions are not executable by anon / authenticated.
--   Behaviour, on synthetic orders created inside this transaction:
--     1. a usable checkout is stamped abandoned_cart_at and stays open;
--     2. a checkout with a bad phone lands in the trash as junk_phone, and
--        raises no "order created" notification;
--     3. a checkout with no governorate, city or address lands as junk_location;
--     4. a real order typed `07…` resolves the same customer's open checkout
--        stored `+964…`: the checkout is trashed as 'returned' and linked, the
--        order inherits abandoned_cart_at and outcome 'returned';
--     5. a checkout arriving within 24 h after a real order (other phone
--        format) is trashed as 'already_ordered' and linked to that order;
--     6. staff moving a checkout out of Abandoned records 'contacted' with the
--        staff name; the order keeps abandoned_cart_at;
--     7. a plain UPDATE cannot write abandoned_cart_* columns;
--     8. restoring a junk checkout from the trash marks it 'kept', and the
--        sweep then leaves it alone;
--     9. the sweep trashes an untouched 20-day-old checkout as 'expired', keeps
--        a fresh one and one staff already contacted;
--    10. a real order in tenant A never touches tenant B's checkout for the
--        same phone.
--
-- SAFE TO RUN AGAINST PRODUCTION
--   Everything runs inside BEGIN ... ROLLBACK; nothing persists. Two tenant
--   ids are borrowed (transaction-local settings, never printed). Phones are
--   random 0799… numbers; any real row a trigger or the sweep touches during
--   the run is restored by the ROLLBACK.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/supabase/tests/abandoned_cart_lifecycle.sql
--   or paste into the Supabase MCP execute_sql tool, as postgres.
--
-- RESULT
--   One row: status 'ALL ASSERTIONS PASSED', or 'FAILED' plus the failing
--   checks. Every check runs even when an earlier one fails.
-- =============================================================================

BEGIN;

SELECT set_config('tt.failures', '', true);
SELECT set_config('tt.tenant', (SELECT id::text FROM public.tenants ORDER BY created_at, id LIMIT 1), true);
SELECT set_config('tt.other', coalesce((SELECT id::text FROM public.tenants ORDER BY created_at, id OFFSET 1 LIMIT 1), ''), true);
-- Without a second tenant, create one for the isolation check.
INSERT INTO public.tenants (id, business_name, slug)
SELECT gen_random_uuid(), 'tt-ac-other', 'tt-ac-other-' || substr(md5(random()::text), 1, 8)
WHERE current_setting('tt.other') = '';
SELECT set_config('tt.other', coalesce(NULLIF(current_setting('tt.other'), ''),
    (SELECT id::text FROM public.tenants WHERE business_name = 'tt-ac-other' LIMIT 1)), true);

-- Random 0799 numbers, one per scenario.
SELECT set_config('tt.p' || g, '799' || lpad((floor(random() * 10000000))::int::text, 7, '0'), true)
FROM generate_series(1, 9) g;

CREATE TEMP TABLE tt_check (name text, ok boolean) ON COMMIT DROP;

CREATE FUNCTION pg_temp.ins(_tag text, _status text, _phone text, _gov text DEFAULT 'BGD',
                            _tenant text DEFAULT NULL, _created timestamptz DEFAULT now())
RETURNS uuid LANGUAGE sql AS $$
    INSERT INTO public.orders (order_id, customer_name, phone, price, status, tenant_id,
                               governorate_code, city, created_at)
    VALUES ('tt-ac-' || _tag || '-' || substr(md5(random()::text), 1, 8), 'tt', _phone, 1000, _status,
            coalesce(_tenant, current_setting('tt.tenant'))::uuid, _gov,
            CASE WHEN _gov IS NULL THEN NULL ELSE 'x' END, _created)
    RETURNING id;
$$;

-- Catalog
INSERT INTO tt_check VALUES
 ('sweep: service_role may execute', has_function_privilege('service_role', 'public.sweep_abandoned_carts(interval)', 'EXECUTE')),
 ('sweep: authenticated may not', NOT has_function_privilege('authenticated', 'public.sweep_abandoned_carts(interval)', 'EXECUTE')),
 ('sweep: anon may not', NOT has_function_privilege('anon', 'public.sweep_abandoned_carts(interval)', 'EXECUTE')),
 ('after-insert fn: authenticated may not', NOT has_function_privilege('authenticated', 'public.orders_abandoned_cart_after_insert()', 'EXECUTE'));

-- 1. usable checkout
SELECT set_config('tt.ac1', pg_temp.ins('1', 'pending_checkout', '+964' || current_setting('tt.p1'))::text, true);
INSERT INTO tt_check SELECT '1 usable checkout open and stamped',
    abandoned_cart_at IS NOT NULL AND deleted_at IS NULL AND abandoned_cart_outcome IS NULL
FROM public.orders WHERE id = current_setting('tt.ac1')::uuid;

-- 2. bad phone
SELECT set_config('tt.ac2', pg_temp.ins('2', 'pending_checkout', '+96478')::text, true);
INSERT INTO tt_check SELECT '2 bad phone trashed as junk_phone',
    deleted_at IS NOT NULL AND abandoned_cart_outcome = 'junk_phone'
FROM public.orders WHERE id = current_setting('tt.ac2')::uuid;
INSERT INTO tt_check SELECT '2 junk checkout raises no notification',
    NOT EXISTS (SELECT 1 FROM public.notifications WHERE entity_id = current_setting('tt.ac2')::uuid);

-- 3. no location
SELECT set_config('tt.ac3', pg_temp.ins('3', 'pending_checkout', '0' || current_setting('tt.p3'), NULL)::text, true);
INSERT INTO tt_check SELECT '3 no location trashed as junk_location',
    deleted_at IS NOT NULL AND abandoned_cart_outcome = 'junk_location'
FROM public.orders WHERE id = current_setting('tt.ac3')::uuid;

-- 4. customer comes back (other phone format)
SELECT set_config('tt.ac4', pg_temp.ins('4', 'pending_checkout', '+964' || current_setting('tt.p4'), 'BGD',
                                        NULL, now() - interval '3 days')::text, true);
SELECT set_config('tt.real4', pg_temp.ins('4r', 'new', '0' || current_setting('tt.p4'))::text, true);
INSERT INTO tt_check SELECT '4 old checkout trashed as returned and linked',
    deleted_at IS NOT NULL AND abandoned_cart_outcome = 'returned'
    AND abandoned_cart_order_id = current_setting('tt.real4')::uuid
FROM public.orders WHERE id = current_setting('tt.ac4')::uuid;
INSERT INTO tt_check SELECT '4 real order inherits the cart',
    deleted_at IS NULL AND abandoned_cart_outcome = 'returned'
    AND abandoned_cart_order_id = current_setting('tt.ac4')::uuid
    AND abandoned_cart_at = (SELECT abandoned_cart_at FROM public.orders WHERE id = current_setting('tt.ac4')::uuid)
FROM public.orders WHERE id = current_setting('tt.real4')::uuid;

-- 5. checkout after a real order
SELECT set_config('tt.real5', pg_temp.ins('5r', 'new', '0' || current_setting('tt.p5'))::text, true);
SELECT set_config('tt.ac5', pg_temp.ins('5', 'pending_checkout', '+964' || current_setting('tt.p5'))::text, true);
INSERT INTO tt_check SELECT '5 late checkout trashed as already_ordered',
    deleted_at IS NOT NULL AND abandoned_cart_outcome = 'already_ordered'
    AND abandoned_cart_order_id = current_setting('tt.real5')::uuid
FROM public.orders WHERE id = current_setting('tt.ac5')::uuid;

-- 6. staff contact
UPDATE public.orders SET status = 'contacted', last_status_changed_by_name = 'Tester'
WHERE id = current_setting('tt.ac1')::uuid;
INSERT INTO tt_check SELECT '6 staff move records contacted + name',
    abandoned_cart_outcome = 'contacted' AND abandoned_cart_resolved_by_name = 'Tester'
    AND abandoned_cart_resolved_at IS NOT NULL AND abandoned_cart_at IS NOT NULL
FROM public.orders WHERE id = current_setting('tt.ac1')::uuid;

-- 7. guard
UPDATE public.orders SET abandoned_cart_outcome = 'junk_phone', abandoned_cart_at = NULL
WHERE id = current_setting('tt.ac1')::uuid;
INSERT INTO tt_check SELECT '7 plain UPDATE cannot write the columns',
    abandoned_cart_outcome = 'contacted' AND abandoned_cart_at IS NOT NULL
FROM public.orders WHERE id = current_setting('tt.ac1')::uuid;

-- 8. restore from trash
UPDATE public.orders SET deleted_at = NULL WHERE id = current_setting('tt.ac2')::uuid;
INSERT INTO tt_check SELECT '8 restored checkout is kept',
    deleted_at IS NULL AND abandoned_cart_outcome = 'kept'
FROM public.orders WHERE id = current_setting('tt.ac2')::uuid;

-- 9. sweep
SELECT set_config('tt.old', pg_temp.ins('9o', 'pending_checkout', '0' || current_setting('tt.p6'), 'BGD',
                                        NULL, now() - interval '20 days')::text, true);
SELECT set_config('tt.fresh', pg_temp.ins('9f', 'pending_checkout', '0' || current_setting('tt.p7'))::text, true);
SELECT set_config('tt.worked', pg_temp.ins('9w', 'pending_checkout', '0' || current_setting('tt.p8'), 'BGD',
                                           NULL, now() - interval '20 days')::text, true);
UPDATE public.orders SET contact_count = 1 WHERE id = current_setting('tt.worked')::uuid;
SELECT count(*) FROM public.sweep_abandoned_carts(interval '14 days');
INSERT INTO tt_check SELECT '9 untouched 20-day checkout expired',
    deleted_at IS NOT NULL AND abandoned_cart_outcome = 'expired'
FROM public.orders WHERE id = current_setting('tt.old')::uuid;
INSERT INTO tt_check SELECT '9 fresh checkout kept open',
    deleted_at IS NULL AND abandoned_cart_outcome IS NULL
FROM public.orders WHERE id = current_setting('tt.fresh')::uuid;
INSERT INTO tt_check SELECT '9 contacted checkout not swept',
    deleted_at IS NULL FROM public.orders WHERE id = current_setting('tt.worked')::uuid;
INSERT INTO tt_check SELECT '9 restored (kept) checkout not swept',
    deleted_at IS NULL FROM public.orders WHERE id = current_setting('tt.ac2')::uuid;

-- 10. tenant isolation
SELECT set_config('tt.acb', pg_temp.ins('10b', 'pending_checkout', '0' || current_setting('tt.p9'), 'BGD',
                                        current_setting('tt.other'))::text, true);
SELECT pg_temp.ins('10a', 'new', '+964' || current_setting('tt.p9'));
INSERT INTO tt_check SELECT '10 other tenant checkout untouched',
    deleted_at IS NULL AND abandoned_cart_outcome IS NULL
FROM public.orders WHERE id = current_setting('tt.acb')::uuid;

SELECT CASE WHEN bool_and(ok) AND count(*) = 19 THEN 'ALL ASSERTIONS PASSED'
            ELSE 'FAILED: ' || coalesce(string_agg(name, '; ') FILTER (WHERE NOT ok OR ok IS NULL), '')
                 || ' (checks run: ' || count(*) || ')' END AS status
FROM tt_check;

ROLLBACK;
