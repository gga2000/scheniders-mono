-- PERF-1 Stage 2 / Prerequisite B2 — duplicate counts from the server.
--
-- WHY
-- The duplicate badge on every order card comes from `customerOrderCountsMap`
-- (hooks/use-order-auxiliary.ts), which scans the ENTIRE in-memory order array.
-- It is one of the reasons the page must download the whole book, and once the
-- list fetch is windowed it would silently under-report — on a headline feature
-- of this screen.
--
-- FAITHFUL PORT of the client algorithm (now lib/order-duplicates.ts):
--   * skip archived and return orders
--   * dedup key is (normalized_phone, base_order_id)
--   * count DISTINCT keys per normalized phone
-- `order_base_id` mirrors getOrderBaseId exactly:
--   LF-<digits>-<digits> at the END  -> the first digit group
--   a leading 'DLV-'                 -> stripped (first occurrence only)
--   otherwise                        -> the first run of digits
--   no digits at all                 -> the id unchanged
--   null/empty                       -> ''
-- Phone normalization reuses normalize_phone_for_search, already proven
-- equivalent to the TypeScript across all 21,978 live rows.
--
-- EQUIVALENCE EVIDENCE
--   * order_base_id: 9/9 shared cases, matching lib/order-duplicates.test.ts
--   * counting: the 4 scenario groups in that test (distinct orders, mixed phone
--     formats, same base id re-imported, archived/return skipped) produce
--     identical counts on both sides
--   * real data: for all 200 distinct phones of tenant a1000001-…, this RPC and
--     an independently written GROUP BY formulation agree on 200/200, 0 disagree
--
-- PERFORMANCE
-- Per-phone lookup is an index scan on idx_orders_tenant_normphone —
--   Index Cond: (tenant_id = … AND normalize_phone_for_search(phone) = …)
--   Execution Time: 0.160 ms
-- so a 50-row page of cards costs roughly 8 ms.
--
-- DOWN MIGRATION:
--   DROP FUNCTION IF EXISTS public.get_customer_order_counts(uuid, text[]);
--   DROP FUNCTION IF EXISTS public.order_base_id(text);

CREATE OR REPLACE FUNCTION public.order_base_id(_order_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $function$
    SELECT CASE
        WHEN _order_id IS NULL OR _order_id = '' THEN ''
        WHEN _order_id ~ 'LF-(\d+)-\d+$' THEN (regexp_match(_order_id, 'LF-(\d+)-\d+$'))[1]
        WHEN _order_id LIKE 'DLV-%' THEN overlay(_order_id placing '' from 1 for 4)
        WHEN _order_id ~ '\d' THEN (regexp_match(_order_id, '\d+'))[1]
        ELSE _order_id
    END;
$function$;

COMMENT ON FUNCTION public.order_base_id(text) IS
    'Mirrors getOrderBaseId in lib/order-duplicates.ts. Used with normalize_phone_for_search to dedup a customer''s orders the same way the client does.';

CREATE OR REPLACE FUNCTION public.get_customer_order_counts(
    _tenant_id uuid,
    _phones text[]
)
RETURNS TABLE (normalized_phone text, order_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN QUERY
    WITH wanted AS (
        SELECT DISTINCT public.normalize_phone_for_search(p) AS np
          FROM unnest(coalesce(_phones, '{}'::text[])) p
         WHERE p IS NOT NULL AND p <> ''
    )
    SELECT w.np,
           (SELECT count(DISTINCT public.order_base_id(o.order_id))::int
              FROM public.orders o
             WHERE o.tenant_id = _tenant_id
               AND o.is_archived = false
               AND o.deleted_at IS NULL
               AND o.is_return = false
               AND public.normalize_phone_for_search(o.phone) = w.np)
      FROM wanted w;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_customer_order_counts(uuid, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_order_counts(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_order_counts(uuid, text[]) TO authenticated, service_role;
