-- Security round 3 (D-02): store-level write tables still allowed any member
-- (viewer included) to insert, update or delete. Add RESTRICTIVE policies that
-- require the matching staff permission, on top of the existing tenant check.
-- TO authenticated only: anon storefront paths, the service role and
-- SECURITY DEFINER functions are unaffected. Employees hold every permission
-- used here, so only viewers (and per-user revocations) lose write access.
DO $mig$
DECLARE
    r record;
    v_cmd text;
    v_expr text;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            -- order work
            ('checkout_queue',         'orders.edit',   'INSERT,UPDATE,DELETE'),
            ('delivery_imports',       'orders.edit',   'INSERT,UPDATE,DELETE'),
            ('delivery_import_items',  'orders.edit',   'INSERT,UPDATE,DELETE'),
            ('follow_up_reminders',    'orders.edit',   'INSERT,UPDATE,DELETE'),
            ('order_status_history',   'orders.edit',   'INSERT'),
            ('waseet_city_mappings',   'orders.edit',   'INSERT,UPDATE,DELETE'),
            ('waseet_api_logs',        'orders.edit',   'INSERT,UPDATE,DELETE'),
            ('whatsapp_logs',          'orders.edit',   'INSERT'),
            ('message_templates',      'orders.edit',   'INSERT,UPDATE,DELETE'),
            -- customers (order edits also refresh trust/risk, so either permission)
            ('customer_risk',          'customers|orders', 'INSERT,UPDATE,DELETE'),
            ('customer_trust',         'customers|orders', 'INSERT,UPDATE,DELETE'),
            ('customer_voice_notes',   'customers.edit', 'INSERT,UPDATE,DELETE'),
            -- catalogue, stock and store builder
            ('smart_collections',      'products.edit', 'INSERT,UPDATE,DELETE'),
            ('stock_takes',            'products.edit', 'INSERT,UPDATE,DELETE'),
            ('storage_locations',      'products.edit', 'INSERT,UPDATE,DELETE'),
            ('inventory_alerts',       'products.edit', 'INSERT,UPDATE,DELETE'),
            ('product_reviews',        'products.edit', 'UPDATE,DELETE'),
            ('store_pages',            'products.edit', 'INSERT,UPDATE,DELETE'),
            ('store_section_presets',  'products.edit', 'INSERT,UPDATE,DELETE'),
            ('store_config_schedules', 'products.edit', 'INSERT,UPDATE,DELETE'),
            ('store_config_versions',  'products.edit', 'INSERT')
        ) AS t(tbl, perm, cmds)
    LOOP
        v_expr := CASE r.perm
            WHEN 'customers|orders' THEN
                '(public.has_tenant_permission(tenant_id, ''customers.edit'') OR public.has_tenant_permission(tenant_id, ''orders.edit''))'
            ELSE format('public.has_tenant_permission(tenant_id, %L)', r.perm)
        END;
        FOREACH v_cmd IN ARRAY string_to_array(r.cmds, ',') LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tbl || '_role_' || lower(v_cmd), r.tbl);
            EXECUTE format(
                'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s',
                r.tbl || '_role_' || lower(v_cmd), r.tbl, v_cmd,
                CASE v_cmd
                    WHEN 'INSERT' THEN format('WITH CHECK (%s)', v_expr)
                    WHEN 'UPDATE' THEN format('USING (%s) WITH CHECK (%s)', v_expr, v_expr)
                    ELSE format('USING (%s)', v_expr)
                END);
        END LOOP;
    END LOOP;
END
$mig$;

-- stock_take_items has no tenant_id: check through its stock take.
DO $mig$
DECLARE v_cmd text;
BEGIN
    FOREACH v_cmd IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.stock_take_items', 'stock_take_items_role_' || lower(v_cmd));
        EXECUTE format(
            'CREATE POLICY %I ON public.stock_take_items AS RESTRICTIVE FOR %s TO authenticated %s',
            'stock_take_items_role_' || lower(v_cmd), v_cmd,
            CASE v_cmd
                WHEN 'INSERT' THEN 'WITH CHECK (EXISTS (SELECT 1 FROM public.stock_takes s WHERE s.id = stock_take_id AND public.has_tenant_permission(s.tenant_id, ''products.edit'')))'
                WHEN 'UPDATE' THEN 'USING (EXISTS (SELECT 1 FROM public.stock_takes s WHERE s.id = stock_take_id AND public.has_tenant_permission(s.tenant_id, ''products.edit''))) WITH CHECK (EXISTS (SELECT 1 FROM public.stock_takes s WHERE s.id = stock_take_id AND public.has_tenant_permission(s.tenant_id, ''products.edit'')))'
                ELSE 'USING (EXISTS (SELECT 1 FROM public.stock_takes s WHERE s.id = stock_take_id AND public.has_tenant_permission(s.tenant_id, ''products.edit'')))'
            END);
    END LOOP;
END
$mig$;
