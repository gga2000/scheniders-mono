-- PERF-1 Stage 2 / Prerequisite B2 — duplicate counts from the server.
--
-- WHY
-- The duplicate badge on every order card comes from `customerOrderCountsMap`
-- (hooks/use-order-auxiliary.ts), which scans the ENTIRE in-memory order array.
-- It is one of the reasons the page must download the whole book, and once the
-- list fetch is windowed it would silently under-report — on a headline feature
-- of this screen.
--
-- FAITHFUL PORT of the client algorithm:
--   * skip archived and return orders
--   * dedup key is (normalized_phone, base_order_id)
--   * count DISTINCT keys per normalized phone
-- `order_base_id` mirrors the client's getBaseId exactly:
--   LF-<digits>-<digits> at the END  -> the first digit group
--   a leading 'DLV-'                 -> stripped (first occurrence only)
--   otherwise                        -> the first run of digits
--   no digits at all                 -> the id unchanged
--   null/empty                       -> ''
-- Phone normalization reuses normalize_phone_for_search, already proven
-- equivalent to the TypeScript across all 21,978 live rows.
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
    'Mirrors getBaseId in hooks/use-order-auxiliary.ts. Used with normalize_phone_for_search to dedup a customer''s orders the same way the client does.';

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
GRANT EXECUTE ON FUNCTION public.get_customer_order_counts(uuid, text[]) TO authenticated, service_role;;
