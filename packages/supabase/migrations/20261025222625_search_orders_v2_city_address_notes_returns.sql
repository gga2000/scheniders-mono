-- /orders search lost fields when it moved from the browser to the server
-- (57b4cb7d, e9c6e588). The in-browser matcher it replaced also matched the
-- city, the address, the notes, a delivery id fragment, and a return by its
-- original order's number. search_orders_v2 matched none of those, so a
-- merchant searching a city, a street or a note got nothing.
--
-- They are matched again, Arabic-normalized like the name, and ranked last
-- (rank 3), so a broad term (a city) never pushes an exact number, a phone or
-- a name match out of the result limit. The limit's ceiling rises from 50 to
-- 200 (the client asks for 200 on /orders; the top bar still asks for 8). The
-- tenant check, the margin columns returned as NULL and the existing match
-- rules are unchanged. CREATE OR REPLACE keeps the grants (authenticated and
-- service_role only, see 20261012120000_search_orders_v2.sql).

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
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 200);
    v_row   public.orders;
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
        v_row.product_cost := NULL;
        v_row.net_profit := NULL;
        v_row.waseet_merchant_price := NULL;
        v_row.waseet_company_price := NULL;
        RETURN NEXT v_row;
    END LOOP;
END;
$function$;
