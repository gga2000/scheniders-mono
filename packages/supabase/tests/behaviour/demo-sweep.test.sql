-- Behaviour test for the demo store reset's table list, run against the
-- migration in packages/supabase/migrations (see run.sh). Every check raises
-- on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   the reset empties every shop table with a tenant_id, Shield and support
--   chats included, children before the tables they point at;
--   it keeps the store, its members, their permissions and the owner's guide
--   progress;
--   it keeps the staff's own record about the store: every admin_* and
--   staff_* table and support_view_sessions, so a reset no longer erases who
--   created, reset or opened the demo store;
--   only the service role may call it.

\set ON_ERROR_STOP 1

DO $t$
DECLARE
    swept text[] := (SELECT array_agg(rel::text ORDER BY i) FROM unnest(public.demo_store_sweep_tables()) WITH ORDINALITY AS u(rel, i));
    kept text[] := ARRAY['tenants', 'tenant_members', 'user_permissions', 'merchant_guide_progress',
                         'admin_activity_logs', 'admin_notes', 'admin_watchlist', 'admin_employee_commissions',
                         'staff_shop_tags', 'staff_action_requests', 'support_view_sessions'];
    emptied text[] := ARRAY['orders', 'order_items', 'shield.events', 'support_cases', 'support_messages'];
BEGIN
    IF NOT (swept @> emptied) THEN
        RAISE EXCEPTION 'the reset must empty %, it empties %', emptied, swept;
    END IF;
    IF swept && kept THEN
        RAISE EXCEPTION 'the reset must keep %, it empties %', kept, swept;
    END IF;
    IF array_position(swept, 'order_items') > array_position(swept, 'orders') THEN
        RAISE EXCEPTION 'order lines must go before their orders: %', swept;
    END IF;
    IF array_position(swept, 'support_messages') > array_position(swept, 'support_cases') THEN
        RAISE EXCEPTION 'messages must go before their chats: %', swept;
    END IF;
END;
$t$;

-- A reset, as seed_demo_store runs it: the shop is empty, the staff log stays.
INSERT INTO public.tenants (id, is_demo) VALUES ('60000000-0000-4000-8000-00000000000d', true);
INSERT INTO public.orders VALUES ('60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-00000000000d');
INSERT INTO public.order_items VALUES ('60000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-00000000000d', '60000000-0000-4000-8000-000000000001');
INSERT INTO public.support_cases VALUES ('60000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-00000000000d');
INSERT INTO public.support_messages (case_id, tenant_id) VALUES ('60000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-00000000000d');
INSERT INTO public.admin_activity_logs (action, tenant_id) VALUES
    ('create_demo_store', '60000000-0000-4000-8000-00000000000d'),
    ('open_demo_store', '60000000-0000-4000-8000-00000000000d');
INSERT INTO public.admin_notes (tenant_id, content) VALUES ('60000000-0000-4000-8000-00000000000d', 'used in the Tuesday demo');
INSERT INTO public.support_view_sessions (tenant_id) VALUES ('60000000-0000-4000-8000-00000000000d');

DO $t$
DECLARE
    demo constant uuid := '60000000-0000-4000-8000-00000000000d';
    v_tbl regclass;
    left_over integer;
BEGIN
    FOREACH v_tbl IN ARRAY public.demo_store_sweep_tables() LOOP
        EXECUTE format('DELETE FROM %s WHERE tenant_id = $1', v_tbl) USING demo;
    END LOOP;

    SELECT (SELECT count(*) FROM public.orders) + (SELECT count(*) FROM public.order_items)
         + (SELECT count(*) FROM public.support_cases) + (SELECT count(*) FROM public.support_messages)
      INTO left_over;
    IF left_over <> 0 THEN
        RAISE EXCEPTION 'the reset left % shop rows', left_over;
    END IF;
    IF (SELECT count(*) FROM public.admin_activity_logs WHERE tenant_id = demo) <> 2
       OR (SELECT count(*) FROM public.admin_notes WHERE tenant_id = demo) <> 1
       OR (SELECT count(*) FROM public.support_view_sessions WHERE tenant_id = demo) <> 1 THEN
        RAISE EXCEPTION 'the reset erased the staff record about the demo store';
    END IF;
END;
$t$;

DO $t$
BEGIN
    IF has_function_privilege('anon', 'public.demo_store_sweep_tables()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.demo_store_sweep_tables()', 'EXECUTE') THEN
        RAISE EXCEPTION 'a browser role may list the demo store sweep';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.demo_store_sweep_tables()', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.seed_demo_store(uuid, uuid, jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.seed_demo_store(uuid, uuid, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'only the service role may reset the demo store';
    END IF;
END;
$t$;
