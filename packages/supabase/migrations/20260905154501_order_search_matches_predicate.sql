-- PERF-1 stage 4 — the order-search predicate, defined once.
--
-- STATUS: REFERENCE DEFINITION, NOT WIRED. It is correct but too slow to use.
-- See the PERFORMANCE VERDICT below before building on it.
--
-- WHY IT EXISTS
-- Search has to be applied in two places: the rows the list fetches, and the
-- counts get_orders_aggregates reports. If those ever apply search differently
-- the chips contradict the list. So the predicate is written once, here.
--
-- FAITHFUL PORT of the client matcher (hooks/use-order-filters.ts, the
-- `activeFilters.searchQuery` branch). An order matches when ANY of these hold:
--   * customer name / city / address / notes CONTAIN the Arabic-normalized term
--   * normalized phone or secondary phone CONTAINS the normalized digits of the
--     term (only when the term contains digits — otherwise the empty normalized
--     phone substring-matches every order)
--   * order_id or delivery_order_id CONTAIN the lowercased raw term
--   * sequence_number, as text, CONTAINS the lowercased raw term
-- An empty term matches everything, mirroring the client's early return.
-- Verified 13/13, including that a 964-prefixed term normalizes to its national
-- form and still matches (which corrected a wrong expectation in the test, not
-- the function).
--
-- PERFORMANCE VERDICT — why this is not wired
--   * with this function in the WHERE clause: 949 ms to filter ~3.5k orders for
--     ONE tenant (Bitmap Heap Scan, 3,442 rows removed by filter);
--   * the same predicate inlined: did not return at all before the client
--     timed out.
-- Cause: normalize_arabic_text_for_search() performs regexp/translate work per
-- row per column, and LIKE '%term%' cannot use a btree index. Today's
-- client-side search is instant because the rows are already in memory, so
-- shipping this would trade a 4 MB download for a ~1 s query — a regression in
-- the thing the merchant actually feels.
--
-- WHAT WIRING IT ACTUALLY REQUIRES
--   1. CREATE EXTENSION pg_trgm (not currently installed);
--   2. GIN trigram indexes on each normalized expression
--      (customer_name, city, address_details, notes);
--   3. the predicate INLINE in the query — wrapping it in this function also
--      prevents the planner from using those indexes;
--   4. therefore, to keep one definition, a single function returning MATCHING
--      ORDER IDS that both the list fetch and the aggregates consume, rather
--      than a row-level boolean shared by two queries.
--
-- DOWN MIGRATION:
--   DROP FUNCTION IF EXISTS public.order_search_matches(text,text,text,text,text,text,text,text,text,int4);

CREATE OR REPLACE FUNCTION public.order_search_matches(
    _term               text,
    _customer_name      text,
    _phone              text,
    _secondary_phone    text,
    _city               text,
    _address_details    text,
    _notes              text,
    _order_id           text,
    _delivery_order_id  text,
    _sequence_number    int4
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $function$
    WITH q AS (
        SELECT
            public.normalize_arabic_text_for_search(coalesce(_term, '')) AS text_q,
            lower(btrim(coalesce(_term, '')))                            AS raw_q,
            public.normalize_phone_for_search(coalesce(_term, ''))       AS phone_q
    )
    SELECT
        CASE
            WHEN (SELECT text_q FROM q) = '' AND (SELECT raw_q FROM q) = '' THEN true
            ELSE
                   ((SELECT text_q FROM q) <> '' AND _customer_name IS NOT NULL
                     AND public.normalize_arabic_text_for_search(_customer_name) LIKE '%' || (SELECT text_q FROM q) || '%')
                OR ((SELECT text_q FROM q) <> '' AND _city IS NOT NULL
                     AND public.normalize_arabic_text_for_search(_city) LIKE '%' || (SELECT text_q FROM q) || '%')
                OR ((SELECT text_q FROM q) <> '' AND _address_details IS NOT NULL
                     AND public.normalize_arabic_text_for_search(_address_details) LIKE '%' || (SELECT text_q FROM q) || '%')
                OR ((SELECT text_q FROM q) <> '' AND _notes IS NOT NULL
                     AND public.normalize_arabic_text_for_search(_notes) LIKE '%' || (SELECT text_q FROM q) || '%')
                OR ((SELECT phone_q FROM q) <> '' AND _phone IS NOT NULL
                     AND public.normalize_phone_for_search(_phone) LIKE '%' || (SELECT phone_q FROM q) || '%')
                OR ((SELECT phone_q FROM q) <> '' AND _secondary_phone IS NOT NULL
                     AND public.normalize_phone_for_search(_secondary_phone) LIKE '%' || (SELECT phone_q FROM q) || '%')
                OR ((SELECT raw_q FROM q) <> '' AND _order_id IS NOT NULL
                     AND lower(_order_id) LIKE '%' || (SELECT raw_q FROM q) || '%')
                OR ((SELECT raw_q FROM q) <> '' AND _delivery_order_id IS NOT NULL
                     AND lower(_delivery_order_id) LIKE '%' || (SELECT raw_q FROM q) || '%')
                OR ((SELECT raw_q FROM q) <> '' AND _sequence_number IS NOT NULL
                     AND _sequence_number::text LIKE '%' || (SELECT raw_q FROM q) || '%')
        END;
$function$;

COMMENT ON FUNCTION public.order_search_matches(text,text,text,text,text,text,text,text,text,int4) IS
'REFERENCE DEFINITION — DO NOT USE IN A QUERY PATH AS-IS. Mirrors the searchQuery branch of hooks/use-order-filters.ts and is verified 13/13 against that behaviour, but it is far too slow to run per row: measured 949 ms filtering ~3.5k orders for one tenant, and the equivalent inlined predicate did not return at all. Cause: normalize_arabic_text_for_search() runs regexp/translate work per row per column, and LIKE ''%term%'' cannot use a btree index. Wiring server-side search requires pg_trgm (not installed) plus GIN trigram indexes on each normalized expression, and the predicate must be INLINE in the query — wrapping it in this function also prevents the planner from using those indexes. Kept as the pinned, tested definition for that work.';
