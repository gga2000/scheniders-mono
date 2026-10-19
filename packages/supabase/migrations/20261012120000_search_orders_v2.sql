-- search_orders_v2 — one normalized, tenant-scoped order search for the top bar,
-- the /orders search box and /orders?search=.
--
-- WHY
-- Search filtered only the rows the current date window had loaded (one day by
-- default), so an older order could not be found. The live `search_orders`
-- RPC (applied from the unmerged notifications branch) does not close the gap:
--   * it compares `phone ILIKE '%term%'` raw, so 0770… never finds the 38% of
--     phones stored as +964770… (and vice versa);
--   * it ignores secondary_phone, sequence_number (#3879), delivery_order_id and
--     waseet_qr_id, and keeps the '#' staff copy from the order card;
--   * it excludes archived (merged) and trashed orders outright, so the order a
--     merchant is looking for is exactly the one it cannot show;
--   * it does not fold Persian digits (۰-۹).
--
-- WHAT THIS ADDS
--   * search_orders_v2(p_tenant_id, p_term, p_limit) RETURNS SETOF orders.
--     SECURITY INVOKER: the caller's own RLS policy on `orders`
--     (tenant_isolation_select) still decides which rows are readable, and
--     p_tenant_id narrows the search to the tenant the app is working in, so a
--     user who belongs to two tenants never gets both books mixed into one
--     result list. A tenant id the caller is not a member of matches nothing
--     (RLS), and a NULL one returns no rows. Returning SETOF orders lets
--     PostgREST project the exact list columns the app already selects from the
--     table (`?select=…`), so this exposes nothing a direct `orders` select
--     does not.
--   * Archived and trashed rows ARE returned; the app labels them.
--   * Ranking: exact order/sequence/delivery/QR id, then exact phone, then
--     partial matches — newest first within each — so the order a term names is
--     never cut by the limit. Mirrors apps/platform/lib/order-server-search.ts
--     `rankOrderSearchMatch`.
--   * 2-character floor and a 50-row clamp enforced HERE, not only in the client.
--   * Trigram and btree indexes so the partial matches do not seq-scan.
--
-- The app works WITHOUT this migration: it detects the missing function
-- (PGRST202) and falls back to direct, RLS-scoped `orders` selects built by the
-- same module. This migration makes search faster and adds Arabic-normalized
-- name matching (alef/teh-marbuta variants), which the fallback cannot do.
--
-- Index builds take a SHARE lock on orders (writes wait) for their duration;
-- at ~23k rows this is about a second each. Apply off-peak.

CREATE INDEX IF NOT EXISTS idx_orders_phone_norm_trgm
    ON public.orders USING gin (public.normalize_phone_for_search(phone) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_secondary_phone_norm_trgm
    ON public.orders USING gin (public.normalize_phone_for_search(secondary_phone) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_order_id_lower_trgm
    ON public.orders USING gin (lower(order_id) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_customer_name_norm_trgm
    ON public.orders USING gin (public.normalize_arabic_text_for_search(customer_name) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_sequence_number
    ON public.orders (tenant_id, sequence_number)
    WHERE sequence_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_order_id
    ON public.orders (delivery_order_id)
    WHERE delivery_order_id IS NOT NULL AND delivery_order_id <> '';

-- An earlier draft of this file took (p_term, p_limit) with no tenant. It was
-- never applied to the NEW project, but drop it if a copy exists anywhere so no
-- unscoped overload survives beside the tenant-scoped one.
DROP FUNCTION IF EXISTS public.search_orders_v2(text, integer);

CREATE OR REPLACE FUNCTION public.search_orders_v2(p_tenant_id uuid, p_term text, p_limit integer DEFAULT 20)
RETURNS SETOF public.orders
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
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
BEGIN
    -- Arabic-Indic and Persian digits to ASCII, then drop the '#' the order card
    -- prints in front of every number.
    v_text := btrim(translate(COALESCE(p_term, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'));
    v_text := btrim(regexp_replace(v_text, '^#+', ''));
    IF p_tenant_id IS NULL OR char_length(v_text) < 2 THEN
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

    RETURN QUERY
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
    LIMIT v_limit;
END;
$function$;

COMMENT ON FUNCTION public.search_orders_v2(uuid, text, integer) IS
    'Normalized order search within one tenant (p_tenant_id, further limited by RLS; SECURITY INVOKER). '
    'Matches phone/secondary phone in any format, order id, sequence number, '
    'delivery/QR id and Arabic-normalized customer name; includes archived and '
    'trashed rows. Ranking mirrors apps/platform/lib/order-server-search.ts.';

-- A PUBLIC grant is what anon would inherit; revoking from anon alone is a no-op.
REVOKE ALL ON FUNCTION public.search_orders_v2(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_orders_v2(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_orders_v2(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_orders_v2(uuid, text, integer) TO service_role;
