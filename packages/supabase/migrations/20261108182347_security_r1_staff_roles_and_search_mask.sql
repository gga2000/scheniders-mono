-- Security audit round 1 (2026-11-08).
--
-- 1. search_orders_v2 is SECURITY DEFINER and RETURNS SETOF orders. It masked
--    four cost columns by name, so every column revoked later (item_unit_costs,
--    shop_id, till_session_id, shield_excused) leaked to every staff role.
--    Root-cause fix: mask every column that `authenticated` cannot SELECT,
--    computed from the catalog, so future revoked columns stay hidden too.
--
-- 2. Orders and their audit tables only checked store membership, so a
--    "viewer" could edit, delete and rewrite history straight through the
--    REST API. Add RESTRICTIVE policies that apply the role model the app
--    already uses (has_tenant_permission / is_tenant_admin):
--      orders            insert: orders.create · update: orders.edit · delete: admin
--      order_notes       write: orders.edit
--      print_batches     write: orders.edit · delete: admin
--      print_history     write: orders.edit · delete: admin
--      customer_whitelist write: customers.edit
--      order_status_history, whatsapp_logs: append-only for signed-in users
--        (server writes use the service role and are not affected).
--
-- 3. tenant_integrations.credentials was readable by every member and anon.
--    Only server code (service role) reads it.

CREATE OR REPLACE FUNCTION public.search_orders_v2(p_tenant_id uuid, p_term text, p_limit integer DEFAULT 20)
 RETURNS SETOF orders
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_text  text;
    v_lower text;
    v_like  text;
    v_phone text;
    v_name  text;
    v_seq   integer;
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200);
    v_row   public.orders;
    v_mask  jsonb;
BEGIN
    v_text := btrim(translate(COALESCE(p_term, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'));
    v_text := btrim(regexp_replace(v_text, '^#+', ''));
    IF p_tenant_id IS NULL OR char_length(v_text) < 2 THEN
        RETURN;
    END IF;

    IF coalesce(auth.role(), 'service_role') <> 'service_role'
       AND p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RETURN;
    END IF;

    -- Every column hidden from signed-in users by column grants is hidden here too.
    SELECT coalesce(jsonb_object_agg(a.attname, NULL), '{}'::jsonb)
      INTO v_mask
      FROM pg_attribute a
     WHERE a.attrelid = 'public.orders'::regclass
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND NOT has_column_privilege('authenticated', 'public.orders', a.attname, 'SELECT');

    v_lower := lower(v_text);
    v_like := replace(replace(replace(v_lower, '\', '\\'), '%', '\%'), '_', '\_');

    IF v_text ~ '^[+0-9\s().-]+$' THEN
        v_phone := public.normalize_phone_for_search(v_text);
        IF char_length(v_phone) < 4 THEN
            v_phone := NULL;
        END IF;
    END IF;

    IF v_text ~ '^-?[0-9]{1,9}$' THEN
        v_seq := v_text::integer;
    END IF;

    IF v_text ~ '[^0-9\s+().#-]' THEN
        v_name := replace(replace(replace(public.normalize_arabic_text_for_search(v_text), '\', '\\'), '%', '\%'), '_', '\_');
    END IF;

    FOR v_row IN
        SELECT o.*
        FROM public.orders o
        WHERE o.tenant_id = p_tenant_id
          AND (o.sequence_number = v_seq
           OR lower(o.order_id) LIKE '%' || v_like || '%'
           OR lower(o.delivery_order_id) LIKE '%' || v_like || '%'
           OR o.waseet_qr_id = v_text
           OR public.normalize_phone_for_search(o.phone) LIKE '%' || v_phone || '%'
           OR public.normalize_phone_for_search(o.secondary_phone) LIKE '%' || v_phone || '%'
           OR public.normalize_arabic_text_for_search(o.customer_name) LIKE '%' || v_name || '%'
           OR public.normalize_arabic_text_for_search(o.city) LIKE '%' || v_name || '%'
           OR public.normalize_arabic_text_for_search(o.address_details) LIKE '%' || v_name || '%'
           OR public.normalize_arabic_text_for_search(o.notes) LIKE '%' || v_name || '%'
           OR o.original_order_id IN (
                SELECT p.id FROM public.orders p
                WHERE p.tenant_id = p_tenant_id
                  AND (p.sequence_number = v_seq OR lower(p.order_id) LIKE '%' || v_like || '%')))
        ORDER BY
            CASE
                WHEN o.sequence_number = v_seq
                  OR lower(o.order_id) = v_lower
                  OR lower(o.order_id) LIKE 'lf-' || v_like || '-%'
                  OR lower(o.order_id) LIKE 'cln-lf-' || v_like || '-%'
                  OR o.delivery_order_id = v_text
                  OR o.waseet_qr_id = v_text
                    THEN 0
                WHEN public.normalize_phone_for_search(o.phone) = v_phone
                  OR public.normalize_phone_for_search(o.secondary_phone) = v_phone
                    THEN 1
                WHEN lower(o.order_id) LIKE '%' || v_like || '%'
                  OR public.normalize_phone_for_search(o.phone) LIKE '%' || v_phone || '%'
                  OR public.normalize_phone_for_search(o.secondary_phone) LIKE '%' || v_phone || '%'
                  OR public.normalize_arabic_text_for_search(o.customer_name) LIKE '%' || v_name || '%'
                    THEN 2
                ELSE 3
            END,
            o.created_at DESC,
            o.id DESC
        LIMIT v_limit
    LOOP
        v_row := jsonb_populate_record(v_row, v_mask);
        RETURN NEXT v_row;
    END LOOP;
END;
$function$;

-- orders
CREATE POLICY orders_role_insert ON public.orders AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_permission(tenant_id, 'orders.create'));
CREATE POLICY orders_role_update ON public.orders AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_tenant_permission(tenant_id, 'orders.edit'))
  WITH CHECK (public.has_tenant_permission(tenant_id, 'orders.edit'));
CREATE POLICY orders_role_delete ON public.orders AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_tenant_admin(tenant_id));

-- order_notes
CREATE POLICY order_notes_role_insert ON public.order_notes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_permission(tenant_id, 'orders.edit'));
CREATE POLICY order_notes_role_update ON public.order_notes AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_tenant_permission(tenant_id, 'orders.edit'))
  WITH CHECK (public.has_tenant_permission(tenant_id, 'orders.edit'));
CREATE POLICY order_notes_role_delete ON public.order_notes AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_tenant_permission(tenant_id, 'orders.edit'));

-- print_batches / print_history
CREATE POLICY print_batches_role_insert ON public.print_batches AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_permission(tenant_id, 'orders.edit'));
CREATE POLICY print_batches_role_update ON public.print_batches AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_tenant_permission(tenant_id, 'orders.edit'))
  WITH CHECK (public.has_tenant_permission(tenant_id, 'orders.edit'));
CREATE POLICY print_batches_role_delete ON public.print_batches AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_tenant_admin(tenant_id));
CREATE POLICY print_history_role_insert ON public.print_history AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_permission(tenant_id, 'orders.edit'));
CREATE POLICY print_history_role_update ON public.print_history AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_tenant_permission(tenant_id, 'orders.edit'))
  WITH CHECK (public.has_tenant_permission(tenant_id, 'orders.edit'));
CREATE POLICY print_history_role_delete ON public.print_history AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_tenant_admin(tenant_id));

-- customer_whitelist (bypasses Shield blocks)
CREATE POLICY customer_whitelist_role_insert ON public.customer_whitelist AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_permission(tenant_id, 'customers.edit'));
CREATE POLICY customer_whitelist_role_update ON public.customer_whitelist AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_tenant_permission(tenant_id, 'customers.edit'))
  WITH CHECK (public.has_tenant_permission(tenant_id, 'customers.edit'));
CREATE POLICY customer_whitelist_role_delete ON public.customer_whitelist AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_tenant_permission(tenant_id, 'customers.edit'));

-- audit trails: append-only for signed-in users
CREATE POLICY order_status_history_append_only_update ON public.order_status_history AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY order_status_history_append_only_delete ON public.order_status_history AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);
CREATE POLICY whatsapp_logs_append_only_update ON public.whatsapp_logs AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY whatsapp_logs_append_only_delete ON public.whatsapp_logs AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

-- integration secrets: server only
REVOKE SELECT (credentials) ON public.tenant_integrations FROM anon, authenticated;
