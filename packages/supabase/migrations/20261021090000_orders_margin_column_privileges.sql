-- Margin columns readable by tenant admins only (margin/tenancy gaps, 2026-10-21).
--
-- WHY
-- product_cost, net_profit, waseet_merchant_price and waseet_company_price are
-- masked for non-admins in v_orders_with_risk, but `authenticated` holds a
-- table-level SELECT on public.orders, so any active member reads them with a
-- direct `orders?select=product_cost` or `select=*`. Checked on the live project
-- 2026-10-21 in a rolled-back transaction as a 'member' of the largest tenant:
-- has_column_privilege('authenticated', 'orders', 'product_cost', 'SELECT') is
-- true and the column is selectable on all 5,241 of that tenant's orders. (The
-- four columns are NULL on every row today; Al-Waseet submissions start filling
-- the waseet prices.)
--
-- Four SECURITY DEFINER RPCs that members can call also hand margin back, because
-- a definer body reads the table as its owner:
--   * get_order_duplicate_flags: previous_order is to_jsonb(p.*) — every column
--     of the customer's previous order (live check as a member: the keys are
--     present on 13 of 50 rows);
--   * merge_orders_atomic: returns to_jsonb(o.*) of the kept order;
--   * create_order_atomic (and split_order_atomic, which returns its result):
--     returns to_jsonb(orders.*), including an existing order on idempotent
--     replay.
--
-- WHAT THIS CHANGES
--   1. public.mask_order_margin(order jsonb, tenant uuid): drops the margin keys
--      unless the caller is that tenant's admin (or the service role / a direct
--      SQL session, the trust rule every guard in this schema uses).
--   2. public.order_margin(order_id): the four values for a tenant admin, no row
--      for anyone else. SECURITY DEFINER, so it is how an admin still reads
--      margin once the table no longer grants it.
--   3. v_orders_with_risk reads the margin through order_margin() instead of
--      the table, under the same is_tenant_admin() CASE as before, so the view
--      keeps working for every caller once the grant is gone. It also picks up
--      the five contact/follow-up columns of the never-applied
--      20261014120000_v_orders_with_risk_contact_columns.sql (now a no-op), so
--      that file can no longer put a direct o.product_cost read back.
--   4. search_orders_v2 and get_dashboard_metrics (SECURITY INVOKER) select
--      o.*, which needs SELECT on every column and would fail with 42501:
--        * search_orders_v2 becomes SECURITY DEFINER with the tenant check RLS
--          used to make, and returns the margin columns as NULL;
--        * get_dashboard_metrics names its columns instead of o.*.
--   5. get_order_duplicate_flags, merge_orders_atomic and create_order_atomic
--      pass their order JSON through mask_order_margin().
--   6. Last: `authenticated` loses table-level SELECT on public.orders and gets
--      SELECT on every column except the four margin columns.
--
-- WHAT KEEPS WORKING
--   * INSERT / UPDATE / DELETE grants are untouched. RLS policies and every
--     filter the app uses read granted columns only (id, tenant_id, version …).
--   * Realtime: realtime.apply_rls drops a column the subscriber has no SELECT
--     on (has_column_privilege), so margin simply leaves the payload.
--   * PostgREST writes without a returned representation need no SELECT.
--   * The platform app names its columns on every `orders` read
--     (ORDER_READ_COLUMNS, apps/platform/lib/repositories/order-columns.ts,
--     enforced by orders-select-guard.test.ts) and runs the same before and
--     after this migration. A `select=*` on `orders` by a signed-in caller is
--     refused after it — that is the point.
--   * service_role keeps its table-level grants.
--
-- ADDING A COLUMN TO public.orders FROM NOW ON
--   The new column is NOT readable by `authenticated` until granted. The
--   migration that adds it must also run
--     GRANT SELECT (<column>) ON public.orders TO authenticated;
--   (unless it is margin-like and admin-only), and the app adds it to
--   ORDER_READ_COLUMNS. packages/supabase/tests/margin_and_tenancy_gaps.sql
--   fails while any non-margin column is ungranted.
--
-- Function edits in step 5 and get_dashboard_metrics are applied to the LIVE
-- definition (pg_get_functiondef) by exact fragment replacement, and refuse to
-- run unless each fragment occurs exactly once, so a body that changed since
-- this was written (2026-10-21) stops the migration instead of being clobbered
-- with a stale copy. Apply the whole file as one transaction.

-- ---------------------------------------------------------------------------
-- 0. Helper for the fragment edits (session-local, dropped at disconnect).
-- ---------------------------------------------------------------------------

CREATE FUNCTION pg_temp.rewrite_function_fragment(p_fn regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_def  text := pg_get_functiondef(p_fn);
    v_hits integer := (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old);
BEGIN
    IF v_hits <> 1 THEN
        RAISE EXCEPTION '%: expected the fragment exactly once, found % — the live body changed since 20261021090000 was written; re-derive this edit',
            p_fn, v_hits
            USING ERRCODE = 'P0001', DETAIL = p_old;
    END IF;
    EXECUTE replace(v_def, p_old, p_new);
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. mask_order_margin
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mask_order_margin(p_order jsonb, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
        WHEN p_order IS NULL THEN NULL
        WHEN coalesce(auth.role(), 'service_role') = 'service_role' THEN p_order
        WHEN public.is_tenant_admin(p_tenant_id) THEN p_order
        ELSE p_order - ARRAY['product_cost', 'net_profit', 'waseet_merchant_price', 'waseet_company_price']
    END;
$function$;

COMMENT ON FUNCTION public.mask_order_margin(jsonb, uuid) IS
    'An order row as JSON with the margin keys removed unless the caller is the tenant''s admin (or the service role). '
    'For SECURITY DEFINER functions that return order rows: they read the table as its owner.';

REVOKE ALL ON FUNCTION public.mask_order_margin(jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mask_order_margin(jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mask_order_margin(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_order_margin(jsonb, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. order_margin
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.order_margin(p_order_id uuid)
RETURNS TABLE (
    product_cost          numeric,
    net_profit            numeric,
    waseet_merchant_price numeric,
    waseet_company_price  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT o.product_cost, o.net_profit, o.waseet_merchant_price, o.waseet_company_price
      FROM public.orders o
     WHERE o.id = p_order_id
       AND public.is_tenant_admin(o.tenant_id);
$function$;

COMMENT ON FUNCTION public.order_margin(uuid) IS
    'Margin columns of one order, for an active admin of the order''s tenant; no row for anyone else. '
    'The only read path to margin for `authenticated`, which holds no SELECT on these columns of public.orders.';

REVOKE ALL ON FUNCTION public.order_margin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_margin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.order_margin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_margin(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. v_orders_with_risk
--    Live definition (pg_get_viewdef, 2026-10-21) with: the four margin columns
--    read through order_margin(), and the five columns of 20261014120000
--    appended after risk_data. Same names, order and types for the existing
--    columns, so CREATE OR REPLACE keeps grants and dependants. The CASE stays:
--    for a non-admin the margin costs exactly what it did (one is_tenant_admin
--    per column, evaluated after any LIMIT), and order_margin runs only for an
--    admin. security_invoker stays on.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_orders_with_risk
WITH (security_invoker = true) AS
 SELECT o.id,
    o.created_at,
    o.updated_at,
    o.order_id,
    o.customer_name,
    o.phone,
    o.city,
    o.governorate_code,
    o.address_details,
    o.items,
    o.price,
    o.status,
    o.whatsapp_link,
    o.notes,
    o.rejection_reason,
    o.scheduled_date,
    o.priority,
    o.payment_status,
    o.delivery_fee,
    o.discount_amount,
    o.is_return,
    o.original_order_id,
    o.is_archived,
    o.secondary_phone,
    o.delivery_slot,
    o.source,
    o.sequence_number,
    o.delivered_at,
    o.cancelled_at,
    o.printed_at,
    o.print_count,
    o.last_batch_id,
    o.is_gift,
    o.tag_color,
    o.is_pinned,
    o.delivery_order_id,
    o.is_reviewed,
    o.is_verified_customer,
    o.contact_count,
    o.address_status,
    o.address_issues,
    o.validated_governorate_code,
    o.internal_notes,
    o.assigned_to,
    o.assigned_at,
        CASE
            WHEN is_tenant_admin(o.tenant_id) THEN ( SELECT m.product_cost FROM order_margin(o.id) m)
            ELSE NULL::numeric
        END AS product_cost,
        CASE
            WHEN is_tenant_admin(o.tenant_id) THEN ( SELECT m.net_profit FROM order_margin(o.id) m)
            ELSE NULL::numeric
        END AS net_profit,
    o.is_shop_order,
    o.risk_metadata,
    o.needs_attention,
    o.attention_reasons,
    o.original_created_at,
    o.last_contacted_at,
    o.last_status_changed_by_name,
    o.last_status_changed_by_avatar,
    o.is_test,
    o.delivery_note,
    o.is_replacement,
    o.delivery_company,
    o.waseet_qr_id,
    o.waseet_qr_link,
    o.waseet_status_id,
    o.waseet_status_text,
        CASE
            WHEN is_tenant_admin(o.tenant_id) THEN ( SELECT m.waseet_merchant_price FROM order_margin(o.id) m)
            ELSE NULL::numeric
        END AS waseet_merchant_price,
        CASE
            WHEN is_tenant_admin(o.tenant_id) THEN ( SELECT m.waseet_company_price FROM order_margin(o.id) m)
            ELSE NULL::numeric
        END AS waseet_company_price,
    o.waseet_submitted_at,
    o.waseet_invoice_id,
    o.completed_at,
    o.version,
    o.tenant_id,
    o.refund_status,
    o.refunded_at,
    o.delivered_source,
    o.reason_id,
    o.deleted_at,
    COALESCE(jsonb_build_object('level',
        CASE ct.trust_tier
            WHEN 'risky'::text THEN 'high'::text
            WHEN 'watch'::text THEN 'medium'::text
            ELSE 'low'::text
        END, 'score', ct.trust_score, 'tier', ct.trust_tier, 'reasons', '[]'::jsonb, 'isBlacklisted', false, 'deliverySuccessRate', ct.delivery_success_rate, 'communityAvgRating', ct.community_avg_rating, 'communityRatingCount', ct.community_rating_count, 'historicalData', jsonb_build_object('totalOrders', ct.total_orders, 'deliveredCount', ct.delivered_count, 'cancelledCustomerCount', ct.cancelled_customer_count, 'cancelledMerchantCount', ct.cancelled_merchant_count, 'rejectedCustomerFaultCount', ct.rejected_customer_fault_count, 'rejectedMerchantFaultCount', ct.rejected_merchant_fault_count, 'rejectedAmbiguousCount', ct.rejected_ambiguous_count, 'rejectedCount', ct.rejected_customer_fault_count, 'cancelledCount', ct.cancelled_customer_count, 'noResponseCount', ct.no_response_count, 'refundCount', ct.refund_count)), jsonb_build_object('level', 'low', 'score', 0, 'reasons', '[]'::jsonb, 'isBlacklisted', false, 'historicalData', NULL::jsonb)) AS risk_data,
    o.whatsapp_contact_slot,
    o.last_followup_by_name,
    o.last_followup_by_avatar,
    o.last_followup_at,
    o.last_followup_type
   FROM orders o
     LEFT JOIN customer_trust ct ON normalize_phone(COALESCE(o.phone, ''::text)) = normalize_phone(ct.phone) AND ct.tenant_id = o.tenant_id
  WHERE o.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4a. search_orders_v2: SECURITY DEFINER, tenant-checked, margin NULL.
--     Body from 20261012120000_search_orders_v2.sql (identical to the live
--     prosrc, 2026-10-21) with the membership check that RLS used to make, and
--     the rows returned through a record so the margin fields can be cleared.
--     A tenant the caller does not belong to matches nothing, as before.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_orders_v2(p_tenant_id uuid, p_term text, p_limit integer DEFAULT 20)
RETURNS SETOF public.orders
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_text  text;
    v_lower text;
    v_like  text;
    v_phone text;
    v_name  text;
    v_seq   integer;
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
    v_row   public.orders;
BEGIN
    -- Arabic-Indic and Persian digits to ASCII, then drop the '#' the order card
    -- prints in front of every number.
    v_text := btrim(translate(COALESCE(p_term, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'));
    v_text := btrim(regexp_replace(v_text, '^#+', ''));
    IF p_tenant_id IS NULL OR char_length(v_text) < 2 THEN
        RETURN;
    END IF;

    -- A definer body skips RLS, so tenant_isolation_select's rule is applied
    -- here: only a tenant the caller belongs to. NULL auth.role() is a direct
    -- SQL session and is trusted, like every other guard in this schema.
    IF coalesce(auth.role(), 'service_role') <> 'service_role'
       AND p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RETURN;
    END IF;

    v_lower := lower(v_text);
    -- The term is matched literally: LIKE's own wildcards are escaped.
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
           OR o.delivery_order_id = v_text
           OR o.waseet_qr_id = v_text
           OR public.normalize_phone_for_search(o.phone) LIKE '%' || v_phone || '%'
           OR public.normalize_phone_for_search(o.secondary_phone) LIKE '%' || v_phone || '%'
           OR public.normalize_arabic_text_for_search(o.customer_name) LIKE '%' || v_name || '%')
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
                ELSE 2
            END,
            o.created_at DESC,
            o.id DESC
        LIMIT v_limit
    LOOP
        -- Search needs no margin, and admins read it through order_margin().
        v_row.product_cost := NULL;
        v_row.net_profit := NULL;
        v_row.waseet_merchant_price := NULL;
        v_row.waseet_company_price := NULL;
        RETURN NEXT v_row;
    END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.search_orders_v2(uuid, text, integer) IS
    'Normalized order search within one tenant the caller belongs to (SECURITY DEFINER; the membership check replaces RLS). '
    'Matches phone/secondary phone in any format, order id, sequence number, '
    'delivery/QR id and Arabic-normalized customer name; includes archived and '
    'trashed rows; margin columns are always NULL. Ranking mirrors apps/platform/lib/order-server-search.ts.';

REVOKE ALL ON FUNCTION public.search_orders_v2(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_orders_v2(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_orders_v2(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_orders_v2(uuid, text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 4b. get_dashboard_metrics: name the columns instead of o.* (every column of
--     the table except margin, as it stands when this runs). Nothing in the
--     body reads a margin column.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_cols text;
BEGIN
    SELECT string_agg('o.' || quote_ident(a.attname), ', ' ORDER BY a.attnum)
      INTO v_cols
      FROM pg_attribute a
     WHERE a.attrelid = 'public.orders'::regclass
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND a.attname NOT IN ('product_cost', 'net_profit', 'waseet_merchant_price', 'waseet_company_price');

    PERFORM pg_temp.rewrite_function_fragment(
        'public.get_dashboard_metrics(text)'::regprocedure,
        $frag$SELECT o.*, (o.created_at AT TIME ZONE 'Asia/Baghdad') AS c_local,$frag$,
        'SELECT ' || v_cols || $frag$, (o.created_at AT TIME ZONE 'Asia/Baghdad') AS c_local,$frag$);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Definer RPCs that return order rows: mask the margin keys.
-- ---------------------------------------------------------------------------

SELECT pg_temp.rewrite_function_fragment(
    'public.get_order_duplicate_flags(uuid, uuid[])'::regprocedure,
    $frag$SELECT to_jsonb(p.*)$frag$,
    $frag$SELECT public.mask_order_margin(to_jsonb(p.*), p.tenant_id)$frag$);

SELECT pg_temp.rewrite_function_fragment(
    'public.merge_orders_atomic(uuid, uuid, uuid, text)'::regprocedure,
    $frag$SELECT to_jsonb(o.*) || jsonb_build_object('merge_log_id', _merge_log_id)$frag$,
    $frag$SELECT public.mask_order_margin(to_jsonb(o.*), o.tenant_id) || jsonb_build_object('merge_log_id', _merge_log_id)$frag$);

SELECT pg_temp.rewrite_function_fragment(
    'public.create_order_atomic(jsonb, uuid)'::regprocedure,
    $frag$SELECT to_jsonb(orders.*) INTO _result FROM public.orders$frag$,
    $frag$SELECT public.mask_order_margin(to_jsonb(orders.*), orders.tenant_id) INTO _result FROM public.orders$frag$);

SELECT pg_temp.rewrite_function_fragment(
    'public.create_order_atomic(jsonb, uuid)'::regprocedure,
    $frag$RETURNING to_jsonb(orders.*) INTO _result;$frag$,
    $frag$RETURNING public.mask_order_margin(to_jsonb(orders.*), orders.tenant_id) INTO _result;$frag$);

-- ---------------------------------------------------------------------------
-- 6. Column-level SELECT for `authenticated` (last, after every reader above
--    stopped needing the margin columns). REVOKE at table level also revokes
--    any column-level SELECT, so the GRANT below is the whole read surface.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    v_cols text;
BEGIN
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
      INTO v_cols
      FROM pg_attribute a
     WHERE a.attrelid = 'public.orders'::regclass
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND a.attname NOT IN ('product_cost', 'net_profit', 'waseet_merchant_price', 'waseet_company_price');

    REVOKE SELECT ON public.orders FROM authenticated;
    EXECUTE format('GRANT SELECT (%s) ON public.orders TO authenticated', v_cols);
END;
$$;

-- anon held no privilege on orders after 20261019100100; PUBLIC never did.
-- Restated so a stray grant cannot reopen the columns.
REVOKE SELECT ON public.orders FROM anon;
REVOKE SELECT ON public.orders FROM PUBLIC;

DROP FUNCTION pg_temp.rewrite_function_fragment(regprocedure, text, text);
